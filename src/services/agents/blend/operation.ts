import { recordTraceEvent } from "@/services/trace";
import { sha256 } from "@/lib/hash";
import { stellarTxExplorerUrl } from "@/lib/stellar-config";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { TraceEventType } from "@/types/trace";
import { TimelineRecorder } from "@/services/protocols/execution-timeline";
import { reconcileOrSubmit } from "@/services/protocols/reconcile";
import { getAssetContractId, resolveBlendNetwork } from "./config";
import { getPools, selectBestPool } from "./pool-discovery";
import { resolveServerSigner, resolveSigningMode } from "./signing";
import {
  buildPoolRequestXdr,
  confirmTransaction,
  getTransactionStatus,
  submitPoolRequest,
  submitSignedXdr,
} from "./client";
import { toBlendAmount } from "./scaling";
import type {
  BlendNetwork,
  BlendOperationData,
  BlendExecuteInput,
  BlendOperationResult,
  BlendPool,
  BlendResumeInput,
  PoolSelectionFailure,
  SelectedPool,
} from "./types";
import type { BlendOperationStatus } from "./status";

/**
 * Shared Blend operation engine (Sprint 7C refactor + 7D reliability).
 *
 * Owns the entire transaction lifecycle — validation, pool discovery + selection,
 * signing-mode handling (server | wallet), submission, retry reconciliation,
 * confirmation, status transitions, an execution timeline, trace recording, and
 * common error handling. supply.ts / withdraw.ts are thin descriptors.
 */

// ── Errors ────────────────────────────────────────────────────────────────────

export class BlendDiscoveryError extends Error {
  readonly reason: PoolSelectionFailure;
  constructor(reason: PoolSelectionFailure, message: string) {
    super(message);
    this.name = "BlendDiscoveryError";
    this.reason = reason;
  }
}

export type BlendOperationFailureCode =
  | "validation_error"
  | "spend_cap_exceeded"
  | "asset_contract_not_configured"
  | "signing_unavailable"
  | "balance_check_failed"
  | "insufficient_balance"
  | "position_read_failed"
  | "insufficient_position"
  | "tx_build_failed"
  | "tx_submit_failed"
  | "tx_confirm_failed"
  | "tx_not_confirmed";

export class BlendOperationError extends Error {
  readonly code: BlendOperationFailureCode;
  readonly status: BlendOperationStatus = "FAILED";
  constructor(code: BlendOperationFailureCode, message: string) {
    super(message);
    this.name = "BlendOperationError";
    this.code = code;
  }
}

const DISCOVERY_FAILURE_MESSAGES: Record<PoolSelectionFailure, (asset: string, minApy?: number) => string> = {
  unsupported_asset: (asset) => `No vetted Blend pool for asset "${asset}"`,
  no_pools_available: (asset) => `No Blend pools available for "${asset}"`,
  apy_below_minimum: (asset, minApy) =>
    `Best ${asset} pool APY is below the configured minimum (${((minApy ?? 0) * 100).toFixed(2)}%)`,
};

const CONFIRMED_EVENT: Record<"supply" | "withdraw", TraceEventType> = {
  supply: "blend_supply_confirmed",
  withdraw: "blend_withdraw_confirmed",
};

// ── Discovery + selection (shared) ─────────────────────────────────────────────

export interface DiscoverContext {
  taskId: string;
  subtaskId?: string;
  agentName: string;
  asset: string;
  minApy?: number;
  network?: BlendNetwork;
}

export async function discoverAndSelect(
  ctx: DiscoverContext
): Promise<{ selected: SelectedPool; pools: BlendPool[] }> {
  const network = ctx.network ?? resolveBlendNetwork();
  const pools = await getPools({ network, asset: ctx.asset });

  await trace(ctx.taskId, "blend_rate_check", ctx.agentName,
    `Discovered ${pools.length} Blend ${ctx.asset} pool(s) on ${network}`,
    {
      metadata: {
        network,
        asset: ctx.asset,
        source: pools[0]?.source ?? "mock",
        pools: pools.map((p) => ({ poolId: p.poolId, apy: p.apy, utilization: p.utilization, liquidity: p.liquidity })),
      },
    });

  const selection = selectBestPool(pools, { asset: ctx.asset, minApy: ctx.minApy });
  if (!selection.selected) {
    const reason = selection.reason ?? "no_pools_available";
    throw new BlendDiscoveryError(reason, DISCOVERY_FAILURE_MESSAGES[reason](ctx.asset, ctx.minApy));
  }
  const selected = selection.selected;

  await trace(ctx.taskId, "blend_pool_selected", ctx.agentName,
    `Selected Blend pool ${selected.poolId.slice(0, 8)}… for ${ctx.asset} at ${(selected.apy * 100).toFixed(2)}% APY`,
    {
      outputHash: sha256(`${selected.poolId}:${ctx.asset}:${selected.apy}`),
      metadata: { poolId: selected.poolId, asset: ctx.asset, apy: selected.apy, liquidity: selected.liquidity, minApy: ctx.minApy ?? null },
    });

  return { selected, pools };
}

// ── Operation descriptor + engine ──────────────────────────────────────────────

export interface BlendPrepareArgs {
  requested: number | "max";
  asset: string;
  poolId: string;
  signerPublicKey: string;
  spendCap: number;
  network: BlendNetwork;
}

export interface BlendOperationDescriptor {
  operation: "supply" | "withdraw";
  requestType: number;
  initiatedEvent: TraceEventType;
  confirmedEvent: TraceEventType;
  prepare(args: BlendPrepareArgs): Promise<number>;
}

/**
 * Execute a Blend operation end-to-end. In SERVER mode: discover → validate →
 * reconcile-or-submit (never double-submit) → confirm. In WALLET mode: discover →
 * validate → build unsigned XDR → return AWAITING_SIGNATURE (resume later).
 */
export async function runBlendOperation(
  input: BlendExecuteInput,
  descriptor: BlendOperationDescriptor
): Promise<BlendOperationResult> {
  const { taskId, agentName, asset, network } = input;
  const opLabel = descriptor.operation;
  const timeline = new TimelineRecorder();

  // 1. Validate asset configuration BEFORE any tx construction.
  const assetContractId = getAssetContractId(asset, network);
  if (!assetContractId) {
    throw new BlendOperationError("asset_contract_not_configured", `No reserve asset contract id configured for ${asset} — cannot build ${opLabel}`);
  }

  // 2. Resolve the source account + signing mode.
  const mode = resolveSigningMode();
  let sourcePublicKey: string;
  let serverSecret: string | null = null;
  if (mode === "server") {
    try {
      const signer = resolveServerSigner();
      sourcePublicKey = signer.publicKey;
      serverSecret = signer.secret;
    } catch (e) {
      throw new BlendOperationError("signing_unavailable", errMsg(e));
    }
  } else {
    if (!input.sourceWallet) {
      throw new BlendOperationError("signing_unavailable", "Wallet mode requires a sourceWallet (the signing wallet's public key).");
    }
    sourcePublicKey = input.sourceWallet;
  }

  // 3. Discover + select the pool (records rate_check + pool_selected).
  const { selected } = await discoverAndSelect({ taskId, subtaskId: input.subtaskId, agentName, asset, minApy: input.minApy, network });
  timeline.mark("discoveredAt");

  // 4. Operation-specific amount resolution + validation (FAILS BEFORE SIGNING).
  const amount = await descriptor.prepare({
    requested: input.amount,
    asset,
    poolId: selected.poolId,
    signerPublicKey: sourcePublicKey,
    spendCap: input.spendCap,
    network,
  });

  // 5. BUILDING — initiated.
  await trace(taskId, descriptor.initiatedEvent, agentName,
    `Initiating ${opLabel} of ${amount} ${asset} ${opLabel === "supply" ? "to" : "from"} Blend pool ${selected.poolId.slice(0, 8)}…`,
    { metadata: { poolId: selected.poolId, asset, amount, apy: selected.apy, signingMode: mode, status: "BUILDING" satisfies BlendOperationStatus } });
  timeline.mark("builtAt");

  const amountRaw = toBlendAmount(amount);

  // 6a. WALLET MODE — build unsigned XDR and await the user's signature.
  if (mode === "wallet") {
    let unsignedXdr: string;
    try {
      unsignedXdr = (await buildPoolRequestXdr({ poolId: selected.poolId, assetContractId, from: sourcePublicKey, amountRaw, requestType: descriptor.requestType, network })).unsignedXdr;
    } catch (e) {
      throw new BlendOperationError("tx_build_failed", `${cap(opLabel)} build failed: ${errMsg(e)}`);
    }
    timeline.mark("simulatedAt");
    return {
      status: "AWAITING_SIGNATURE",
      unsignedXdr,
      awaiting: { poolId: selected.poolId, amount, apy: selected.apy, sourceWallet: sourcePublicKey },
      output: buildAwaitingOutput(opLabel, asset, amount, network),
      timeline: timeline.get(),
    };
  }

  // 6b. SERVER MODE — reconcile-or-submit (never double-submit), then confirm.
  const priorTxHash = await findLastSubmittedTxHash(taskId);
  let txHash: string;
  let reconciled = false;
  try {
    timeline.mark("signedAt");
    const r = await reconcileOrSubmit({
      priorTxHash,
      getStatus: getTransactionStatus,
      submit: () => submitPoolRequest({ poolId: selected.poolId, assetContractId, from: sourcePublicKey, amountRaw, requestType: descriptor.requestType, secret: serverSecret!, network }),
    });
    txHash = r.txHash;
    reconciled = r.reconciled;
  } catch (e) {
    throw new BlendOperationError("tx_submit_failed", `${cap(opLabel)} submission failed: ${errMsg(e)}`);
  }
  timeline.mark("submittedAt");

  await trace(taskId, "blend_tx_submitted", agentName,
    `${cap(opLabel)} transaction ${reconciled ? "reconciled (existing)" : "submitted"}: ${txHash.slice(0, 12)}…`,
    { metadata: { txHash, poolId: selected.poolId, asset, amount, reconciled, status: "SUBMITTING" satisfies BlendOperationStatus } });

  let confirmed: boolean;
  try {
    confirmed = (await confirmTransaction(txHash)).confirmed;
  } catch (e) {
    throw new BlendOperationError("tx_confirm_failed", `${cap(opLabel)} confirmation failed (${txHash}): ${errMsg(e)}`);
  }
  if (!confirmed) {
    throw new BlendOperationError("tx_not_confirmed", `${cap(opLabel)} transaction ${txHash} did not confirm in time`);
  }
  timeline.mark("confirmedAt");

  await trace(taskId, descriptor.confirmedEvent, agentName,
    `${cap(opLabel)} confirmed — ${amount} ${asset} at ${(selected.apy * 100).toFixed(2)}% APY (tx ${txHash.slice(0, 12)}…)`,
    { outputHash: sha256(txHash), metadata: { txHash, poolId: selected.poolId, asset, amount, apy: selected.apy, status: "CONFIRMED" satisfies BlendOperationStatus } });

  const operation: BlendOperationData = {
    protocol: "blend",
    operation: descriptor.operation,
    asset,
    amount,
    poolId: selected.poolId,
    txHash,
    apy: selected.apy,
    timeline: timeline.get(),
  };

  return { status: "CONFIRMED", txHash, operation, output: buildOperationOutput(operation, network), timeline: timeline.get() };
}

/**
 * Resume a wallet-mode operation once the user has signed the XDR: submit the
 * signed transaction, confirm, and record the confirmation trace.
 */
export async function resumeBlendOperation(input: BlendResumeInput): Promise<BlendOperationResult> {
  const timeline = new TimelineRecorder();

  let txHash: string;
  try {
    txHash = (await submitSignedXdr(input.signedXdr)).txHash;
  } catch (e) {
    throw new BlendOperationError("tx_submit_failed", `Resume submission failed: ${errMsg(e)}`);
  }
  timeline.mark("signedAt").mark("submittedAt");

  await trace(input.taskId, "blend_tx_submitted", input.agentName,
    `${cap(input.operation)} signed transaction submitted: ${txHash.slice(0, 12)}…`,
    { metadata: { txHash, poolId: input.poolId, asset: input.asset, amount: input.amount, resumed: true, status: "SUBMITTING" satisfies BlendOperationStatus } });

  let confirmed: boolean;
  try {
    confirmed = (await confirmTransaction(txHash)).confirmed;
  } catch (e) {
    throw new BlendOperationError("tx_confirm_failed", `Resume confirmation failed (${txHash}): ${errMsg(e)}`);
  }
  if (!confirmed) {
    throw new BlendOperationError("tx_not_confirmed", `Resumed transaction ${txHash} did not confirm in time`);
  }
  timeline.mark("confirmedAt");

  await trace(input.taskId, CONFIRMED_EVENT[input.operation], input.agentName,
    `${cap(input.operation)} confirmed — ${input.amount} ${input.asset} (tx ${txHash.slice(0, 12)}…)`,
    { outputHash: sha256(txHash), metadata: { txHash, poolId: input.poolId, asset: input.asset, amount: input.amount, apy: input.apy, status: "CONFIRMED" satisfies BlendOperationStatus } });

  const operation: BlendOperationData = {
    protocol: "blend",
    operation: input.operation,
    asset: input.asset,
    amount: input.amount,
    poolId: input.poolId,
    txHash,
    apy: input.apy,
    timeline: timeline.get(),
  };

  return { status: "CONFIRMED", txHash, operation, output: buildOperationOutput(operation, input.network), timeline: timeline.get() };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read the last submitted Blend tx hash for a task from the trace (retry reconciliation). */
async function findLastSubmittedTxHash(taskId: string): Promise<string | null> {
  if (!env.DATABASE_URL) return null; // no durable trace (demo/tests) → nothing to reconcile
  try {
    const row = await prisma.executionTraceEvent.findFirst({
      where: { taskId, eventType: "blend_tx_submitted" },
      orderBy: { sequence: "desc" },
      select: { metadata: true },
    });
    const meta = row?.metadata as { txHash?: unknown } | null;
    return meta && typeof meta.txHash === "string" ? meta.txHash : null;
  } catch {
    return null;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function trace(
  taskId: string,
  eventType: TraceEventType,
  actor: string,
  message: string,
  options: Parameters<typeof recordTraceEvent>[4]
): Promise<unknown> {
  return recordTraceEvent(taskId, eventType, actor, message, options).catch((e) =>
    console.warn(`[blend] trace ${eventType} failed:`, e)
  );
}

function buildOperationOutput(op: BlendOperationData, network: string): string {
  const verb = op.operation === "supply" ? "Supplied" : "Withdrew";
  const dir = op.operation === "supply" ? "to" : "from";
  return [
    `# Blend Yield Agent — ${cap(op.operation)} (executed)`,
    "",
    `${verb} **${op.amount} ${op.asset}** ${dir} Blend pool \`${op.poolId.slice(0, 12)}…\` at ${(op.apy * 100).toFixed(2)}% APY on ${network}.`,
    "",
    `- Transaction: \`${op.txHash}\``,
    `- Explorer: ${stellarTxExplorerUrl(op.txHash)}`,
    "",
    "_mode: live · server-signed_",
  ].join("\n");
}

function buildAwaitingOutput(op: string, asset: string, amount: number, network: string): string {
  return [
    `# Blend Yield Agent — ${cap(op)} (awaiting signature)`,
    "",
    `> ⏸️ **AWAITING SIGNATURE** — an unsigned ${op} transaction for **${amount} ${asset}** was built on ${network}. The user must sign it with their wallet; execution resumes on signed-XDR submission. No funds have moved.`,
    "",
    "_mode: wallet · no server custody_",
  ].join("\n");
}
