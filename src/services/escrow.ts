/**
 * Escrow service — factory + adapters for Trustless Work integration (EPIC 4).
 *
 * Select adapter via ESCROW_MODE env var:
 *   "disabled"  → no escrow; callers should use payment.ts directly
 *   "demo"      → DemoEscrowAdapter (in-process, deterministic fake IDs, no external calls)
 *   "live"      → TrustlessWorkAdapter (calls Trustless Work REST API)
 */

import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
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

// ── Demo adapter ─────────────────────────────────────────────────────────────
// Used when ESCROW_MODE=demo. All operations succeed immediately with fake IDs.
// Clearly labeled so it can never be confused with real settlement.

class DemoEscrowAdapter implements EscrowProvider {
  private prefix = "DEMO";

  async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
    console.log(`[DemoEscrow] createEscrow task=${input.taskId} amount=${input.totalAmount}`);
    return {
      externalId: `${this.prefix}-ESC-${input.taskId.slice(0, 8)}`,
      status: "funded", // demo skips the on-chain funding step
    };
  }

  async fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult> {
    console.log(`[DemoEscrow] fundEscrow escrow=${input.escrowId} amount=${input.amount}`);
    return { status: "funded", txHash: `0xDEMO-${Date.now()}` };
  }

  async getEscrow(externalId: string): Promise<GetEscrowResult> {
    return {
      externalId,
      status: "funded",
      totalAmount: 0,
    };
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

// ── Trustless Work adapter ───────────────────────────────────────────────────
// Used when ESCROW_MODE=live. Calls the Trustless Work REST API.
// TODO: align endpoint paths and payload shapes with the actual Trustless Work
//       API spec once available. The interface and error-mapping wiring is stable.

class TrustlessWorkAdapter implements EscrowProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
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
        Authorization: `Bearer ${this.apiKey}`,
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

  async createEscrow(input: CreateEscrowInput): Promise<CreateEscrowResult> {
    // TODO: replace with actual Trustless Work create-escrow endpoint + payload
    const data = await this.request<{ id: string; status: string; txHash?: string }>(
      "POST",
      "/v1/escrows",
      {
        taskId: input.taskId,
        payerAddress: input.payerAddress,
        amount: input.totalAmount,
        currency: input.currency ?? "USDC",
        metadata: input.metadata,
      }
    );
    return {
      externalId: data.id,
      status: data.status as CreateEscrowResult["status"],
      txHash: data.txHash,
    };
  }

  async fundEscrow(input: FundEscrowInput): Promise<FundEscrowResult> {
    // TODO: replace with actual Trustless Work fund endpoint + payload
    const data = await this.request<{ status: string; txHash?: string }>(
      "POST",
      `/v1/escrows/${input.externalId}/fund`,
      { amount: input.amount }
    );
    return {
      status: data.status as FundEscrowResult["status"],
      txHash: data.txHash,
    };
  }

  async getEscrow(externalId: string): Promise<GetEscrowResult> {
    // TODO: replace with actual Trustless Work get-escrow endpoint
    return this.request<GetEscrowResult>("GET", `/v1/escrows/${externalId}`);
  }

  async releaseMilestone(input: ReleaseMilestoneInput): Promise<ReleaseMilestoneResult> {
    // TODO: replace with actual Trustless Work release-milestone endpoint + payload
    const data = await this.request<{ status: string; txHash?: string; releasedAt?: string }>(
      "POST",
      `/v1/escrows/${input.escrowId}/milestones/${input.externalMilestoneId ?? input.milestoneId}/release`,
      { receiptHash: input.receiptHash }
    );
    return {
      status: data.status as ReleaseMilestoneResult["status"],
      txHash: data.txHash,
      releasedAt: data.releasedAt,
    };
  }

  async cancelEscrow(externalId: string): Promise<void> {
    // TODO: replace with actual Trustless Work cancel endpoint
    await this.request("POST", `/v1/escrows/${externalId}/cancel`);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

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
    throw new Error(
      "[escrow] ESCROW_MODE=live but TRUSTLESS_WORK_API_URL is not set."
    );
  }
  if (!env.TRUSTLESS_WORK_API_KEY) {
    throw new Error(
      "[escrow] ESCROW_MODE=live but TRUSTLESS_WORK_API_KEY is not set."
    );
  }

  _provider = new TrustlessWorkAdapter(
    env.TRUSTLESS_WORK_API_URL,
    env.TRUSTLESS_WORK_API_KEY
  );
  return _provider;
}

// ── Convenience re-exports for callers that don't care about adapter type ────

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

// ── Proof-gated milestone release (Issue #21) ────────────────────────────────

/**
 * Release all eligible escrow milestones for a task, gated on the receipt.
 *
 * Release condition guards:
 *   "auto"            — released immediately regardless of receipt status (demo)
 *   "receipt_ready"   — receipt must exist (proof_ready or verified)
 *   "proof_verified"  — receipt.status must be "verified"
 *   "manual"          — skipped by this function; requires explicit API call
 *
 * Each milestone is released independently — a failure on one does not block
 * the others. Results are recorded as milestone_released / milestone_release_failed
 * trace events so they surface in the dashboard.
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

    // Guard: check whether this milestone's release condition is satisfied
    if (condition === "manual") {
      skipped++;
      continue;
    }
    if (condition === "receipt_ready" && !receipt) {
      skipped++;
      continue;
    }
    if (
      condition === "proof_verified" &&
      receipt.status !== "verified"
    ) {
      // Log and skip — do not release if proof not verified
      console.log(
        `[Escrow] Milestone ${milestone.id} blocked: proof_verified required but receipt.status=${receipt.status}`
      );
      skipped++;
      continue;
    }

    // Attempt release via provider
    try {
      const result = await provider.releaseMilestone({
        escrowId: escrow.id,
        milestoneId: milestone.id,
        externalMilestoneId: milestone.externalMilestoneId ?? undefined,
        receiptHash: receipt.receiptHash,
      });

      // Persist release result
      await prisma.escrowMilestone.update({
        where: { id: milestone.id },
        data: {
          status: result.status,
          releaseTxHash: result.txHash ?? null,
          receiptId: receipt.id,
        },
      });

      // Record milestone_released trace event
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
      ).catch(() => { /* trace write is non-fatal */ });

      released++;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      console.error(`[Escrow] releaseMilestone failed for ${milestone.id}:`, error);

      // Persist failure state
      await prisma.escrowMilestone.update({
        where: { id: milestone.id },
        data: { status: "failed" },
      }).catch(() => { /* non-fatal */ });

      // Record milestone_release_failed trace event
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
      ).catch(() => { /* trace write is non-fatal */ });

      failed++;
    }
  }

  // Update top-level escrow status when all milestones are settled
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

// ── DB queries ───────────────────────────────────────────────────────────────

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

/**
 * Sync local escrow status with the external provider.
 *
 * Fetches the current escrow state from the provider and updates the local
 * Escrow + EscrowMilestone rows to match. Returns the updated escrow record.
 *
 * In demo mode or when escrow is disabled, this is a no-op that returns
 * the current local state without any external call.
 */
export async function syncEscrowStatus(escrowId: string): Promise<{
  escrow: Awaited<ReturnType<typeof getEscrowWithMilestones>>;
  synced: boolean;
  error?: string;
}> {
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    include: { milestones: { orderBy: { createdAt: "asc" } } },
  });

  if (!escrow) {
    return { escrow: null, synced: false, error: "Escrow not found" };
  }

  const provider = getEscrowProvider();

  // Demo mode or disabled — return local state without external call
  if (!provider || !escrow.externalId || escrow.externalId.startsWith("DEMO-")) {
    return { escrow, synced: false };
  }

  try {
    const remote = await provider.getEscrow(escrow.externalId);

    // Map provider status to local EscrowStatus
    const statusMap: Record<string, string> = {
      pending: "pending",
      funded: "funded",
      in_progress: "in_progress",
      completed: "completed",
      cancelled: "cancelled",
      disputed: "disputed",
    };
    const newStatus = statusMap[remote.status] ?? escrow.status;

    await prisma.escrow.update({
      where: { id: escrowId },
      data: { status: newStatus },
    });

    // Sync milestone statuses if provider returned them
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
