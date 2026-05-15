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
