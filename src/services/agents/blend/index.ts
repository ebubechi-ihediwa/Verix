import { parseBlendSettings, resolveBlendNetwork } from "./config";
import { discoverAndSelect } from "./operation";
import type { BlendDiscoveryContext, BlendDiscoveryResult } from "./types";

export * from "./types";
export { getPools, selectBestPool } from "./pool-discovery";
export {
  getPoolAllowlist,
  isSupportedAsset,
  poolsForAsset,
  parseBlendSettings,
  resolveBlendNetwork,
  normalizeAsset,
  getAssetContractId,
} from "./config";

// ── Operation engine (shared lifecycle) ────────────────────────────────────
export {
  runBlendOperation,
  resumeBlendOperation,
  discoverAndSelect,
  BlendDiscoveryError,
  BlendOperationError,
} from "./operation";
export type {
  BlendOperationDescriptor,
  BlendPrepareArgs,
  BlendOperationFailureCode,
  DiscoverContext,
} from "./operation";

// ── Operation wrappers ─────────────────────────────────────────────────────
export { executeBlendSupply, BlendSupplyError } from "./supply";
export { executeBlendWithdraw, BlendWithdrawError } from "./withdraw";

// ── Soroban client + signing + scaling + status ────────────────────────────
export {
  submitPoolRequest,
  buildPoolRequestXdr,
  submitSignedXdr,
  confirmTransaction,
  getTransactionStatus,
  inspectTransaction,
  replayTransaction,
  loadUserPosition,
  REQUEST_TYPE_SUPPLY,
  REQUEST_TYPE_WITHDRAW,
} from "./client";
export { resolveServerSigner, resolveSigningMode } from "./signing";
export type { BlendSigner } from "./signing";
export { toBlendAmount, fromBlendAmount, BLEND_DECIMALS } from "./scaling";
export type { BlendOperationStatus } from "./status";
export { BLEND_OPERATION_STATUSES, BLEND_TERMINAL_STATUSES, isTerminalStatus } from "./status";

/**
 * Discovery-only path for a blend_yield agent (no `operation` set). Discovers +
 * selects a real pool (recording trace events via the shared engine), then STOPS
 * before any transaction and returns a labelled stub. No funds move.
 */
export async function runBlendDiscovery(ctx: BlendDiscoveryContext): Promise<BlendDiscoveryResult> {
  const network = ctx.network ?? resolveBlendNetwork();
  const settings = parseBlendSettings(ctx.config);

  const { selected, pools } = await discoverAndSelect({
    taskId: ctx.taskId,
    subtaskId: ctx.subtaskId,
    agentName: ctx.agentName,
    asset: settings.asset,
    minApy: settings.minApy,
    network,
  });

  const output = buildDiscoveryOutput({
    asset: settings.asset,
    settings,
    pools,
    selectedPoolId: selected.poolId,
    network,
  });

  return { pools, selected, output, model: "blend-discovery" };
}

function buildDiscoveryOutput(args: {
  asset: string;
  settings: ReturnType<typeof parseBlendSettings>;
  pools: BlendDiscoveryResult["pools"];
  selectedPoolId: string;
  network: string;
}): string {
  const { asset, settings, pools, selectedPoolId, network } = args;
  return [
    "# Blend Yield Agent — Pool Discovery",
    "",
    "> ⚠️ **DISCOVERY ONLY** — real pools were discovered and evaluated, but **no transaction was constructed and no funds moved** (no `operation` was set).",
    "",
    `**Network:** ${network} · **Asset:** ${asset}${settings.operation ? ` · **Intended op:** ${settings.operation}` : ""}${settings.amount ? ` · **Intended amount:** ${settings.amount} ${asset}` : ""}`,
    "",
    "## Discovered pools",
    ...pools.map(
      (p) =>
        `- \`${p.poolId.slice(0, 10)}…\` (${p.asset}) — ${(p.apy * 100).toFixed(2)}% APY · ${(p.utilization * 100).toFixed(1)}% utilized · liquidity ${Math.round(p.liquidity).toLocaleString()} [${p.source}]`
    ),
    "",
    "## Selected pool",
    `- \`${selectedPoolId}\`${settings.minApy !== undefined ? ` (minApy gate ${(settings.minApy * 100).toFixed(2)}%)` : ""}`,
    "",
    "_mode: discovery · no on-chain action_",
  ].join("\n");
}
