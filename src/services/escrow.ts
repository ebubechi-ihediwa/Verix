/**
 * Escrow service — factory + adapters for Trustless Work integration (EPIC 4).
 *
 * Select adapter via ESCROW_MODE env var:
 *   "disabled"  → no escrow; callers should use payment.ts directly
 *   "demo"      → DemoEscrowAdapter (in-process, deterministic fake IDs, no external calls)
 *   "live"      → TrustlessWorkAdapter (calls Trustless Work REST API)
 *
 * Trustless Work API (Stellar/Soroban):
 *   Auth:    x-api-key header
 *   Release: POST /escrow/single-release/release-funds
 *            body: { contractId, releaseSigner }
 *            response: { unsignedTransaction } (XDR)
 *   Submit:  POST /helpers/send-transaction
 *            body: { unsignedTransaction }
 *            response: { txHash }
 */

import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { isStellarPublicKey, STELLAR_USDC } from "@/lib/stellar-config";
import { ExecutionReceipt } from "@/types/trace";
import { Subtask } from "@/types/task";
import { recordTraceEvent } from "@/services/trace";
import { getSpecialistByName } from "@/services/discovery";
import {
  EscrowProvider,
  CreateEscrowInput,
  CreateEscrowResult,
  FundEscrowInput,
  FundEscrowResult,
  GetEscrowResult,
  ReleaseMilestoneInput,
  ReleaseMilestoneResult,
  ReleaseCondition,
  EscrowSignaturePhase,
  SubmitSignedEscrowTransactionResult,
  EscrowStatus,
} from "@/types/escrow";

type EscrowMilestonePlan = {
  subtaskId: string;
  specialistId: string;
  specialistName: string;
  description: string;
  recipientAddress: string;
  amount: number;
  releaseCondition: ReleaseCondition;
  agentVersionId?: string;
  agentVersionHash?: string;
  externalMilestoneId: string;
};

type PrepareEscrowResult = {
  escrowId?: string;
  externalId?: string;
  status?: string;
  totalAmount: number;
  milestoneCount: number;
  skipped: boolean;
};

export function releaseConditionForProofPolicy(policy: string | undefined): ReleaseCondition {
  if (policy === "escrow-eligible") return "proof_and_user_approved";
  if (policy === "receipt-proof") return "receipt_ready";
  return "manual";
}

export async function buildEscrowMilestonePlan(
  subtasks: Subtask[]
): Promise<EscrowMilestonePlan[]> {
  const plans: EscrowMilestonePlan[] = [];

  for (const subtask of subtasks) {
    if (!subtask.specialistName || !subtask.cost || subtask.cost <= 0) continue;

    const specialist = await getSpecialistByName(subtask.specialistName);
    if (!specialist) {
      throw new Error(`Cannot create escrow milestone: specialist not found for ${subtask.specialistName}`);
    }
    if (!isStellarPublicKey(specialist.walletAddress)) {
      throw new Error(`Cannot create escrow milestone: ${specialist.name} has an invalid Stellar payout wallet`);
    }

    plans.push({
      subtaskId: subtask.id,
      specialistId: specialist.id,
      specialistName: specialist.name,
      description: `${specialist.name}: ${subtask.capability}`,
      recipientAddress: specialist.walletAddress,
      amount: subtask.cost,
      releaseCondition: releaseConditionForProofPolicy(specialist.proofPolicy),
      agentVersionId: subtask.agentVersionId,
      agentVersionHash: subtask.versionHash,
      externalMilestoneId: String(plans.length),
    });
  }

  return plans;
}

// ── Demo adapter ─────────────────────────────────────────────────────────────

class DemoEscrowAdapter implements EscrowProvider {
  private prefix = "DEMO";

  async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
    console.log(`[DemoEscrow] createEscrow task=${input.taskId} amount=${input.totalAmount}`);
    return {
      externalId: `${this.prefix}-ESC-${input.taskId.slice(0, 8)}`,
      status: "funded",
    };
  }

  async fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult> {
    console.log(`[DemoEscrow] fundEscrow escrow=${input.escrowId} amount=${input.amount}`);
    return { status: "funded", txHash: `0xDEMO-${Date.now()}` };
  }

  async getEscrow(externalId: string): Promise<GetEscrowResult> {
    return { externalId, status: "funded", totalAmount: 0 };
  }

  async releaseMilestone(input: ReleaseMilestoneInput): Promise<ReleaseMilestoneResult> {
    console.log(`[DemoEscrow] releaseMilestone milestone=${input.milestoneId}`);
    return {
      status: "released",
      txHash: `0xDEMO-REL-${Date.now()}`,
      releasedAt: new Date().toISOString(),
    };
  }

  async cancelEscrow(externalId: string): Promise<void> {
    console.log(`[DemoEscrow] cancelEscrow externalId=${externalId}`);
  }
}

// ── Trustless Work adapter ────────────────────────────────────────────────────
//
// Trustless Work is a Stellar/Soroban escrow service. The API returns unsigned
// XDR transactions that must be submitted via POST /helpers/send-transaction.
// Authentication uses the x-api-key header (not Bearer token).

class TrustlessWorkAdapter implements EscrowProvider {
  private baseUrl: string;
  private apiKey: string;
  private signerAddress: string;
  private signingMode: "server" | "wallet";

  constructor(
    baseUrl: string,
    apiKey: string,
    signerAddress: string,
    signingMode: "server" | "wallet"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.signerAddress = signerAddress;
    this.signingMode = signingMode;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let errMsg = `Trustless Work API error ${res.status}`;
      try {
        const json = await res.json();
        errMsg = json.message ?? json.error ?? errMsg;
      } catch { /* ignore parse failure */ }
      throw new Error(errMsg);
    }

    return res.json() as Promise<T>;
  }

  private async sendTransaction(unsignedTransaction: string): Promise<string | undefined> {
    try {
      const result = await this.submitSignedTransaction(unsignedTransaction);
      return result.txHash ?? result.hash;
    } catch (err) {
      console.warn("[TrustlessWork] send-transaction failed:", err);
      return undefined;
    }
  }

  async submitSignedTransaction(signedXdr: string): Promise<{ txHash?: string; hash?: string }> {
    return this.request<{ txHash?: string; hash?: string }>(
      "POST",
      "/helper/send-transaction",
      { signedXdr, unsignedTransaction: signedXdr }
    );
  }

  async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
    const type = env.TRUSTLESS_WORK_ESCROW_TYPE;
    const milestones = input.milestones?.length
      ? input.milestones
      : [{
          description: `Agent execution for task ${input.taskId}`,
          amount: input.totalAmount,
          receiver: input.payerAddress,
        }];

    const data = await this.request<{ unsignedTransaction?: string; id?: string; status?: string }>(
      "POST",
      `/deployer/${type}`,
      {
        signer: this.signerAddress,
        engagementId: input.taskId,
        title: `Task ${input.taskId.slice(0, 8)}`,
        description: `Verix proof-gated multi-agent execution escrow`,
        roles: {
          approver: input.payerAddress,
          serviceProvider: milestones[0]?.receiver ?? input.payerAddress,
          platformAddress: input.payerAddress,
          releaseSigner: this.signerAddress,
          disputeResolver: input.payerAddress,
        },
        amount: input.totalAmount,
        platformFee: 0,
        trustline: {
          symbol: input.currency ?? STELLAR_USDC.code,
          address: STELLAR_USDC.issuer,
        },
        milestones: milestones.map((m) => ({
          description: m.description,
          amount: String(m.amount),
          receiver: m.receiver,
        })),
      }
    );

    let txHash: string | undefined;
    if (data.unsignedTransaction) {
      if (this.signingMode === "wallet") {
        return {
          externalId: data.id ?? `TW-ESC-${input.taskId.slice(0, 8)}`,
          status: "pending",
          unsignedTransaction: data.unsignedTransaction,
          requiresSignature: true,
        };
      }
      txHash = await this.sendTransaction(data.unsignedTransaction);
    }

    return {
      externalId: data.id ?? `TW-ESC-${input.taskId.slice(0, 8)}`,
      status: (data.status as CreateEscrowResult["status"]) ?? "pending",
      txHash,
    };
  }

  async fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult> {
    const data = await this.request<{ unsignedTransaction?: string; status?: string }>(
      "POST",
      `/escrow/${env.TRUSTLESS_WORK_ESCROW_TYPE}/fund-escrow`,
      { contractId: input.externalId, amount: String(input.amount), signer: this.signerAddress }
    );

    let txHash: string | undefined;
    if (data.unsignedTransaction) {
      if (this.signingMode === "wallet") {
        return {
          status: "funding_pending",
          unsignedTransaction: data.unsignedTransaction,
          requiresSignature: true,
        };
      }
      txHash = await this.sendTransaction(data.unsignedTransaction);
    }

    return {
      status: (data.status as FundEscrowResult["status"]) ?? "funded",
      txHash,
    };
  }

  async getEscrow(externalId: string): Promise<GetEscrowResult> {
    return this.request<GetEscrowResult>("GET", `/indexer/get-escrow-by-contract-id?contractId=${externalId}`);
  }

  async releaseMilestone(input: ReleaseMilestoneInput): Promise<ReleaseMilestoneResult> {
    const type = env.TRUSTLESS_WORK_ESCROW_TYPE;
    const contractId = input.escrowId;
    const releaseSigner = input.releaseSigner ?? this.signerAddress;
    const milestoneIndex = input.externalMilestoneId ?? input.milestoneId;

    const data = await this.request<{ unsignedTransaction: string }>(
      "POST",
      type === "multi-release"
        ? "/escrow/multi-release/release-milestone-funds"
        : "/escrow/single-release/release-funds",
      type === "multi-release"
        ? { contractId, releaseSigner, milestoneIndex: String(milestoneIndex) }
        : { contractId, releaseSigner }
    );

    // Step 2: submit XDR to the network via TW helper
    const txHash = await this.sendTransaction(data.unsignedTransaction);

    return {
      status: "released",
      txHash,
      releasedAt: new Date().toISOString(),
    };
  }

  async cancelEscrow(externalId: string): Promise<void> {
    const data = await this.request<{ unsignedTransaction?: string }>(
      "POST",
      `/escrow/single-release/cancel`,
      { contractId: externalId, signer: this.signerAddress }
    );
    if (data.unsignedTransaction) {
      await this.sendTransaction(data.unsignedTransaction);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

let _provider: EscrowProvider | null = null;

export function getEscrowProvider(): EscrowProvider | null {
  if (env.ESCROW_MODE === "disabled") return null;

  if (_provider) return _provider;

  if (env.ESCROW_MODE === "demo") {
    _provider = new DemoEscrowAdapter();
    return _provider;
  }

  // live mode
  if (!env.TRUSTLESS_WORK_API_URL) {
    throw new Error("[escrow] ESCROW_MODE=live but TRUSTLESS_WORK_API_URL is not set.");
  }
  if (!env.TRUSTLESS_WORK_API_KEY) {
    throw new Error("[escrow] ESCROW_MODE=live but TRUSTLESS_WORK_API_KEY is not set.");
  }

  const signerAddress = env.TRUSTLESS_WORK_SIGNER_ADDRESS ?? "";
  _provider = new TrustlessWorkAdapter(
    env.TRUSTLESS_WORK_API_URL,
    env.TRUSTLESS_WORK_API_KEY,
    signerAddress,
    env.TRUSTLESS_WORK_SIGNING_MODE
  );
  return _provider;
}

// ── Convenience re-exports ────────────────────────────────────────────────────

export async function createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
  const provider = getEscrowProvider();
  if (!provider) throw new Error("[escrow] Escrow is disabled (ESCROW_MODE=disabled).");
  return provider.createEscrow(input);
}

export async function fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult> {
  const provider = getEscrowProvider();
  if (!provider) throw new Error("[escrow] Escrow is disabled (ESCROW_MODE=disabled).");
  return provider.fundEscrow(input);
}

export async function getEscrow(externalId: string): Promise<GetEscrowResult> {
  const provider = getEscrowProvider();
  if (!provider) throw new Error("[escrow] Escrow is disabled (ESCROW_MODE=disabled).");
  return provider.getEscrow(externalId);
}

export async function releaseMilestone(
  input: ReleaseMilestoneInput
): Promise<ReleaseMilestoneResult> {
  const provider = getEscrowProvider();
  if (!provider) throw new Error("[escrow] Escrow is disabled (ESCROW_MODE=disabled).");
  return provider.releaseMilestone(input);
}

export async function submitSignedEscrowTransaction(
  escrowId: string,
  signedXdr: string,
  phase: EscrowSignaturePhase
): Promise<SubmitSignedEscrowTransactionResult> {
  const provider = getEscrowProvider();
  if (!provider?.submitSignedTransaction) {
    throw new Error("[escrow] Current escrow provider does not support signed transaction submission.");
  }

  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: { milestones: true },
  });
  if (!escrow) throw new Error("Escrow not found");

  const result = await provider.submitSignedTransaction(signedXdr);
  const txHash = result.txHash ?? result.hash;
  const metadata = (escrow.metadata ?? {}) as Record<string, unknown>;
  let nextStatus: EscrowStatus = phase === "fund" ? "funded" : escrow.status as EscrowStatus;
  const nextMetadata = {
    ...metadata,
    ...(phase === "create"
      ? { createTxHash: txHash, createSignedAt: new Date().toISOString() }
      : { fundTxHash: txHash, fundingSignedAt: new Date().toISOString() }),
    lastSignedPhase: phase,
  };

  if (phase === "create" && provider.fundEscrow && escrow.externalId) {
    const funding = await provider.fundEscrow({
      escrowId,
      externalId: escrow.externalId,
      amount: Number(escrow.totalAmount),
    });
    nextStatus = funding.status;
    Object.assign(nextMetadata, {
      unsignedFundTransaction: funding.unsignedTransaction,
      fundTxHash: funding.txHash,
      fundingPreparedAt: new Date().toISOString(),
    });
  }

  await prisma.escrow.update({
    where: { id: escrowId },
    data: { status: nextStatus, metadata: nextMetadata },
  });

  if (phase === "fund") {
    await prisma.escrowMilestone.updateMany({
      where: { escrowId },
      data: { status: "funded" },
    });
  }

  await recordTraceEvent(
    escrow.taskId,
    phase === "fund" ? "escrow_funded" : "escrow_signature_submitted",
    "coordinator",
    phase === "fund"
      ? `Escrow funded from wallet signature${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ""}`
      : `Escrow deployment signature submitted${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ""}`,
    {
      metadata: {
        escrowId,
        externalId: escrow.externalId,
        phase,
        txHash,
      },
    }
  ).catch(() => { /* non-fatal */ });

  return { escrowId, phase, status: nextStatus, txHash };
}

// ── Proof-gated milestone release ─────────────────────────────────────────────

/**
 * Release all eligible escrow milestones for a task, gated on the receipt.
 *
 * Called automatically after verifyProof() succeeds for "proof_verified" milestones,
 * or directly from the /api/escrow/[id]/release endpoint for manual release.
 *
 * Release condition guards:
 *   "auto"            — released immediately regardless of receipt status (demo)
 *   "receipt_ready"   — receipt must exist (proof_ready or verified)
 *   "proof_verified"  — receipt.status must be "verified"
 *   "manual"          — skipped; requires explicit API call
 */
export async function releaseEscrowMilestones(
  taskId: string,
  receipt: ExecutionReceipt
): Promise<{ released: number; failed: number; skipped: number }> {
  const provider = getEscrowProvider();
  if (!provider) return { released: 0, failed: 0, skipped: 0 };

  const escrow = await prisma.escrow.findUnique({
    where: { taskId },
    include: { milestones: true },
  });
  if (!escrow) return { released: 0, failed: 0, skipped: 0 };

  const pendingMilestones = escrow.milestones.filter(
    (m) => m.status !== "released" && m.status !== "refunded"
  );
  const taskApproval = await prisma.task.findUnique({
    where: { id: taskId },
    select: { approvalStatus: true, approvedAt: true, approvedByWallet: true },
  }).catch(() => null);
  const isUserApproved = taskApproval?.approvalStatus === "approved";

  let released = 0;
  let failed = 0;
  let skipped = 0;

  for (const milestone of pendingMilestones) {
    const condition = milestone.releaseCondition;

    if (condition === "manual") { skipped++; continue; }
    if (condition === "receipt_ready" && !receipt) { skipped++; continue; }
    if (condition === "user_approved" && !isUserApproved) {
      console.log(
        `[Escrow] Milestone ${milestone.id} blocked: user approval required`
      );
      skipped++;
      continue;
    }
    if (condition === "proof_and_user_approved" && !isUserApproved) {
      console.log(
        `[Escrow] Milestone ${milestone.id} blocked: proof plus user approval required but approval is missing`
      );
      skipped++;
      continue;
    }
    if ((condition === "proof_verified" || condition === "proof_and_user_approved") && receipt.status !== "verified") {
      console.log(
        `[Escrow] Milestone ${milestone.id} blocked: proof_verified required but receipt.status=${receipt.status}`
      );
      skipped++;
      continue;
    }

    try {
      const result = await provider.releaseMilestone({
        escrowId: escrow.externalId ?? escrow.id,
        milestoneId: milestone.id,
        externalMilestoneId: milestone.externalMilestoneId ?? undefined,
        receiptHash: receipt.receiptHash,
      });

      await prisma.escrowMilestone.update({
        where: { id: milestone.id },
        data: {
          status: result.status,
          releaseTxHash: result.txHash ?? null,
          receiptId: receipt.id,
        },
      });

      await recordTraceEvent(
        taskId,
        "milestone_released",
        "coordinator",
        `Milestone released for specialist ${milestone.specialistId}: $${Number(milestone.amount).toFixed(2)} USDC${result.txHash ? ` (tx: ${result.txHash.slice(0, 10)}...)` : ""}`,
        {
          metadata: {
            milestoneId: milestone.id,
            specialistId: milestone.specialistId,
            amount: Number(milestone.amount),
            txHash: result.txHash,
            receiptHash: receipt.receiptHash,
            releaseCondition: condition,
          },
        }
      ).catch(() => { /* non-fatal */ });

      released++;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Escrow] releaseMilestone failed for ${milestone.id}:`, error);

      await prisma.escrowMilestone.update({
        where: { id: milestone.id },
        data: { status: "failed" },
      }).catch(() => { /* non-fatal */ });

      await recordTraceEvent(
        taskId,
        "milestone_release_failed",
        "coordinator",
        `Milestone release failed for specialist ${milestone.specialistId}: ${error}`,
        {
          metadata: {
            milestoneId: milestone.id,
            specialistId: milestone.specialistId,
            error,
            receiptHash: receipt.receiptHash,
          },
        }
      ).catch(() => { /* non-fatal */ });

      failed++;
    }
  }

  if (released + skipped === pendingMilestones.length && failed === 0) {
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: { status: "completed" },
    }).catch(() => { /* non-fatal */ });
  }

  console.log(
    `[Escrow] releaseEscrowMilestones task=${taskId}: released=${released} failed=${failed} skipped=${skipped}`
  );

  return { released, failed, skipped };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function getEscrowWithMilestones(taskId: string) {
  try {
    return await prisma.escrow.findUnique({
      where: { taskId },
      include: { milestones: { orderBy: { createdAt: "asc" } } },
    });
  } catch {
    return null;
  }
}

export async function syncEscrowStatus(escrowId: string): Promise<{
  escrow: Awaited<ReturnType<typeof getEscrowWithMilestones>>;
  synced: boolean;
  error?: string;
}> {
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: { milestones: { orderBy: { createdAt: "asc" } } },
  });

  if (!escrow) return { escrow: null, synced: false, error: "Escrow not found" };

  const provider = getEscrowProvider();

  if (!provider || !escrow.externalId || escrow.externalId.startsWith("DEMO-")) {
    return { escrow, synced: false };
  }

  try {
    const remote = await provider.getEscrow(escrow.externalId);

    const statusMap: Record<string, string> = {
      funding_pending: "funding_pending", funding_failed: "funding_failed",
      pending: "pending", funded: "funded", in_progress: "in_progress",
      completed: "completed", cancelled: "cancelled", disputed: "disputed",
    };
    const newStatus = statusMap[remote.status] ?? escrow.status;

    await prisma.escrow.update({ where: { id: escrowId }, data: { status: newStatus } });

    if (remote.milestones) {
      for (const remoteMilestone of remote.milestones) {
        const local = escrow.milestones.find(
          (m) => m.externalMilestoneId === remoteMilestone.externalMilestoneId
        );
        if (local) {
          await prisma.escrowMilestone.update({
            where: { id: local.id },
            data: { status: remoteMilestone.status },
          }).catch(() => { /* non-fatal */ });
        }
      }
    }

    const updated = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { milestones: { orderBy: { createdAt: "asc" } } },
    });

    return { escrow: updated, synced: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown sync error";
    console.error(`[Escrow] syncEscrowStatus failed for ${escrowId}:`, error);
    return { escrow, synced: false, error };
  }
}

export async function prepareEscrowForExecution(input: {
  taskId: string;
  payerAddress?: string;
  subtasks: Subtask[];
  spendCap: number;
}): Promise<PrepareEscrowResult> {
  const provider = getEscrowProvider();
  if (!provider) {
    console.log(`[Escrow] ESCROW_MODE=disabled; skipping escrow preparation for task ${input.taskId}`);
    return { skipped: true, totalAmount: 0, milestoneCount: 0 };
  }

  if (!isStellarPublicKey(input.payerAddress)) {
    throw new Error("Cannot create escrow: connected user wallet is missing or invalid");
  }

  const existing = await prisma.escrow.findUnique({
    where: { taskId: input.taskId },
    include: { milestones: true },
  });
  if (existing) {
    return {
      escrowId: existing.id,
      externalId: existing.externalId ?? undefined,
      status: existing.status,
      totalAmount: Number(existing.totalAmount),
      milestoneCount: existing.milestones.length,
      skipped: false,
    };
  }

  const milestonePlan = await buildEscrowMilestonePlan(input.subtasks);
  const totalAmount = milestonePlan.reduce((sum, milestone) => sum + milestone.amount, 0);
  if (milestonePlan.length === 0 || totalAmount <= 0) {
    throw new Error("Cannot create escrow: no payable specialist milestones were produced");
  }
  if (totalAmount > input.spendCap) {
    throw new Error(`Cannot create escrow: total $${totalAmount.toFixed(2)} exceeds spend cap $${input.spendCap.toFixed(2)}`);
  }

  const escrow = await prisma.escrow.create({
    data: {
      taskId: input.taskId,
      status: "pending",
      totalAmount,
      currency: "USDC",
      payerAddress: input.payerAddress,
      metadata: { mode: env.ESCROW_MODE, milestoneCount: milestonePlan.length },
      milestones: {
        create: milestonePlan.map((milestone) => ({
          subtaskId: milestone.subtaskId,
          specialistId: milestone.specialistId,
          recipientAddress: milestone.recipientAddress,
          amount: milestone.amount,
          status: "pending",
          releaseCondition: milestone.releaseCondition,
          agentVersionId: milestone.agentVersionId,
          agentVersionHash: milestone.agentVersionHash,
          externalMilestoneId: milestone.externalMilestoneId,
          metadata: {
            specialistName: milestone.specialistName,
            description: milestone.description,
          },
        })),
      },
    },
  });

  let failurePhase: string = "create";
  try {
    const created = await provider.createEscrow({
      taskId: input.taskId,
      payerAddress: input.payerAddress,
      totalAmount,
      currency: "USDC",
      milestones: milestonePlan.map((milestone) => ({
        description: milestone.description,
        amount: milestone.amount,
        receiver: milestone.recipientAddress,
        specialistId: milestone.specialistId,
      })),
      metadata: { escrowId: escrow.id, mode: env.ESCROW_MODE },
    });

    let finalStatus = created.status;
    let fundTxHash: string | undefined;
    let unsignedCreateTransaction = created.unsignedTransaction;
    let unsignedFundTransaction: string | undefined;

    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        externalId: created.externalId,
        status: created.requiresSignature ? "funding_pending" : finalStatus,
        metadata: {
          mode: env.ESCROW_MODE,
          signingMode: env.TRUSTLESS_WORK_SIGNING_MODE,
          milestoneCount: milestonePlan.length,
          createTxHash: created.txHash,
          unsignedCreateTransaction,
        },
      },
    });
    await recordTraceEvent(
      input.taskId,
      "escrow_created",
      "coordinator",
      `Trustless Work escrow created for $${totalAmount.toFixed(2)} USDC across ${milestonePlan.length} milestone(s)`,
      {
        metadata: {
          escrowId: escrow.id,
          externalId: created.externalId,
          totalAmount,
          milestoneCount: milestonePlan.length,
          payerAddress: input.payerAddress,
          txHash: created.txHash,
          requiresSignature: created.requiresSignature,
          mode: env.ESCROW_MODE,
        },
      }
    ).catch(() => { /* non-fatal */ });

    if (created.requiresSignature && unsignedCreateTransaction) {
      finalStatus = "funding_pending";
    } else if (created.status !== "funded") {
      try {
        failurePhase = "fund";
        const funded = await provider.fundEscrow({
          escrowId: escrow.id,
          externalId: created.externalId,
          amount: totalAmount,
        });
        finalStatus = funded.status;
        fundTxHash = funded.txHash;
        unsignedFundTransaction = funded.unsignedTransaction;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown escrow funding error";
        await prisma.escrow.update({
          where: { id: escrow.id },
          data: {
            status: "funding_failed",
            metadata: {
              mode: env.ESCROW_MODE,
              signingMode: env.TRUSTLESS_WORK_SIGNING_MODE,
              milestoneCount: milestonePlan.length,
              createTxHash: created.txHash,
              fundingError: message,
            },
          },
        });
        await prisma.escrowMilestone.updateMany({
          where: { escrowId: escrow.id },
          data: { status: "pending" },
        });
        await recordTraceEvent(
          input.taskId,
          "escrow_funding_failed",
          "coordinator",
          `Escrow funding failed: ${message}`,
          { metadata: { escrowId: escrow.id, externalId: created.externalId, error: message } }
        ).catch(() => { /* non-fatal */ });
        throw new Error(`Escrow funding failed: ${message}`);
      }
    }

    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: finalStatus,
        metadata: {
          mode: env.ESCROW_MODE,
          signingMode: env.TRUSTLESS_WORK_SIGNING_MODE,
          milestoneCount: milestonePlan.length,
          createTxHash: created.txHash,
          fundTxHash,
          unsignedCreateTransaction,
          unsignedFundTransaction,
        },
      },
    });
    await prisma.escrowMilestone.updateMany({
      where: { escrowId: escrow.id },
      data: { status: finalStatus === "funded" ? "funded" : "pending" },
    });

    if (finalStatus === "funded") {
      await recordTraceEvent(
        input.taskId,
        "escrow_funded",
        "coordinator",
        `Escrow funded for $${totalAmount.toFixed(2)} USDC`,
        {
          metadata: {
            escrowId: escrow.id,
            externalId: created.externalId,
            totalAmount,
            txHash: fundTxHash ?? created.txHash,
          },
        }
      ).catch(() => { /* non-fatal */ });
    } else if (finalStatus === "funding_pending") {
      await recordTraceEvent(
        input.taskId,
        "escrow_funding_pending",
        "coordinator",
        `Escrow is waiting for wallet signature before agent execution can start`,
        {
          metadata: {
            escrowId: escrow.id,
            externalId: created.externalId,
            totalAmount,
            payerAddress: input.payerAddress,
            requiresCreateSignature: Boolean(unsignedCreateTransaction),
            requiresFundSignature: Boolean(unsignedFundTransaction),
          },
        }
      ).catch(() => { /* non-fatal */ });
    }

    return {
      escrowId: escrow.id,
      externalId: created.externalId,
      status: finalStatus,
      totalAmount,
      milestoneCount: milestonePlan.length,
      skipped: false,
    };
  } catch (error) {
    if (failurePhase === "fund") {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown escrow creation error";
    await prisma.escrow.update({
      where: { id: escrow.id },
      data: {
        status: "pending",
        metadata: {
          mode: env.ESCROW_MODE,
          milestoneCount: milestonePlan.length,
          creationError: message,
        },
      },
    }).catch(() => { /* non-fatal */ });
    await prisma.escrowMilestone.updateMany({
      where: { escrowId: escrow.id },
      data: { status: "failed" },
    }).catch(() => { /* non-fatal */ });
    await recordTraceEvent(
      input.taskId,
      "escrow_creation_failed",
      "coordinator",
      `Escrow creation failed: ${message}`,
      { metadata: { escrowId: escrow.id, error: message, mode: env.ESCROW_MODE } }
    ).catch(() => { /* non-fatal */ });
    throw error;
  }
}
