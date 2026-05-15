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
import { STELLAR_USDC } from "@/lib/stellar-config";
import { fetchWithTimeout } from "@/lib/timeout";
import { createLogger } from "@/utils/logger";
import { ExecutionReceipt } from "@/types/trace";
import { recordTraceEvent } from "@/services/trace";
import {
  EscrowProvider,
  CreateEscrowInput,
  CreateEscrowResult,
  FundEscrowInput,
  FundEscrowResult,
  GetEscrowResult,
  ReleaseMilestoneInput,
  ReleaseMilestoneResult,
} from "@/types/escrow";

const logger = createLogger("escrow");

// ── Demo adapter ─────────────────────────────────────────────────────────────

class DemoEscrowAdapter implements EscrowProvider {
  private prefix = "DEMO";

  async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
    logger.info("Demo escrow created", { taskId: input.taskId, amount: input.totalAmount });
    return {
      externalId: `${this.prefix}-ESC-${input.taskId.slice(0, 8)}`,
      status: "funded",
    };
  }

  async fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult> {
    logger.info("Demo escrow funded", { escrowId: input.escrowId, amount: input.amount });
    return { status: "funded", txHash: `0xDEMO-${Date.now()}` };
  }

  async getEscrow(externalId: string): Promise<GetEscrowResult> {
    return { externalId, status: "funded", totalAmount: 0 };
  }

  async releaseMilestone(input: ReleaseMilestoneInput): Promise<ReleaseMilestoneResult> {
    logger.info("Demo milestone released", { escrowId: input.escrowId, milestoneId: input.milestoneId });
    return {
      status: "released",
      txHash: `0xDEMO-REL-${Date.now()}`,
      releasedAt: new Date().toISOString(),
    };
  }

  async cancelEscrow(externalId: string): Promise<void> {
    logger.warn("Demo escrow cancelled", { escrowId: externalId });
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

  constructor(baseUrl: string, apiKey: string, signerAddress: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.signerAddress = signerAddress;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: body != null ? JSON.stringify(body) : undefined,
      },
      env.EXTERNAL_API_TIMEOUT_MS,
      `Trustless Work ${method} ${path}`
    );

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
      const result = await this.request<{ txHash?: string; hash?: string }>(
        "POST",
        "/helper/send-transaction",
        { signedXdr: unsignedTransaction, unsignedTransaction }
      );
      return result.txHash ?? result.hash;
    } catch (err) {
      logger.warn("Trustless Work send-transaction failed", { errorMsg: err instanceof Error ? err.message : "Unknown error" });
      return undefined;
    }
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
    signerAddress
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

  let released = 0;
  let failed = 0;
  let skipped = 0;

  for (const milestone of pendingMilestones) {
    const condition = milestone.releaseCondition;

    if (condition === "manual") { skipped++; continue; }
    if (condition === "receipt_ready" && !receipt) { skipped++; continue; }
    if (condition === "proof_verified" && receipt.status !== "verified") {
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
      logger.error("Milestone release failed", { taskId, escrowId: escrow.id, milestoneId: milestone.id, errorMsg: error });

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

  logger.info("Escrow milestone release sweep completed", { taskId, escrowId: escrow.id, released, failed, skipped });

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
    logger.error("Escrow status sync failed", { escrowId, errorMsg: error });
    return { escrow, synced: false, error };
  }
}
