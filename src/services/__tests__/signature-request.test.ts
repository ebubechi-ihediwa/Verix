import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    executionSignatureRequest: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  createSignatureRequest,
  getSignatureRequestForProject,
  isExpired,
  claimResume,
  markResolved,
  SIGNATURE_REQUEST_TTL_MS,
  type SignatureResumeContext,
} from "@/services/signature-request";

const mock = prisma as unknown as {
  executionSignatureRequest: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const CTX: SignatureResumeContext = {
  blend: { operation: "supply", asset: "USDC", network: "testnet", poolId: "C", amount: 100, apy: 0.05, agentName: "Bot", subtaskId: "s1" },
  synth: { description: "supply", spendCap: 1000, totalSpent: 1, payments: [], subtasks: [] },
};

beforeEach(() => vi.clearAllMocks());

describe("createSignatureRequest", () => {
  it("persists the unsigned XDR awaiting_signature with a TTL expiry", async () => {
    mock.executionSignatureRequest.upsert.mockResolvedValue({});
    const now = new Date("2026-06-26T00:00:00.000Z");
    await createSignatureRequest({
      taskId: "task_1", projectId: "proj_A", sourceWallet: "GW", unsignedXdr: "XDR_UNSIGNED", context: CTX, now,
    });

    const arg = mock.executionSignatureRequest.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ taskId: "task_1" });
    expect(arg.create.unsignedXdr).toBe("XDR_UNSIGNED");
    expect(arg.create.status).toBe("awaiting_signature");
    expect(arg.create.projectId).toBe("proj_A");
    expect(arg.create.expiresAt.getTime()).toBe(now.getTime() + SIGNATURE_REQUEST_TTL_MS);
  });
});

describe("getSignatureRequestForProject — cross-project isolation", () => {
  it("returns null when the request belongs to another project", async () => {
    mock.executionSignatureRequest.findUnique.mockResolvedValue({ taskId: "task_1", projectId: "proj_B" });
    expect(await getSignatureRequestForProject("proj_A", "task_1")).toBeNull();
  });
  it("returns the request when owned by the project", async () => {
    const row = { taskId: "task_1", projectId: "proj_A" };
    mock.executionSignatureRequest.findUnique.mockResolvedValue(row);
    expect(await getSignatureRequestForProject("proj_A", "task_1")).toBe(row);
  });
  it("returns null when unknown", async () => {
    mock.executionSignatureRequest.findUnique.mockResolvedValue(null);
    expect(await getSignatureRequestForProject("proj_A", "nope")).toBeNull();
  });
});

describe("expiry + idempotent claim", () => {
  it("isExpired reflects expiresAt", () => {
    const past = { expiresAt: new Date(Date.now() - 1000) } as never;
    const future = { expiresAt: new Date(Date.now() + 60_000) } as never;
    expect(isExpired(past)).toBe(true);
    expect(isExpired(future)).toBe(false);
  });

  it("claimResume wins only once (atomic awaiting_signature → resuming)", async () => {
    mock.executionSignatureRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await claimResume("task_1")).toBe(true);
    mock.executionSignatureRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await claimResume("task_1")).toBe(false);
    expect(mock.executionSignatureRequest.updateMany.mock.calls[0][0].where).toEqual({
      taskId: "task_1",
      status: "awaiting_signature",
    });
  });

  it("markResolved records the tx hash + resolved status", async () => {
    mock.executionSignatureRequest.update.mockResolvedValue({});
    await markResolved("task_1", "TXFINAL");
    const arg = mock.executionSignatureRequest.update.mock.calls[0][0];
    expect(arg.where).toEqual({ taskId: "task_1" });
    expect(arg.data.status).toBe("resolved");
    expect(arg.data.txHash).toBe("TXFINAL");
  });
});
