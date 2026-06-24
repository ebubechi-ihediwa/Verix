import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findMany: vi.fn() },
    proof: { findMany: vi.fn() },
    specialist: { findMany: vi.fn() },
    executionReceipt: { findMany: vi.fn() },
  },
}));
vi.mock("@/services/discovery", () => ({
  resolvePublicName: (name: string, config: { name?: string } | null) => config?.name ?? name,
}));

import { prisma } from "@/lib/db";
import { listProjectExecutions, listProjectVerifications } from "@/lib/console-data";

const mockPrisma = prisma as unknown as {
  task: { findMany: ReturnType<typeof vi.fn> };
  proof: { findMany: ReturnType<typeof vi.fn> };
  specialist: { findMany: ReturnType<typeof vi.fn> };
  executionReceipt: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe("listProjectExecutions — surfaces anchor + public name", () => {
  it("includes anchorStatus/anchorTxHash and the public agent name", async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "task_1",
        status: "completed",
        agentId: "agent_1",
        createdAt: new Date("2026-06-15T00:00:00Z"),
        receipt: { receiptHash: "h".repeat(64), anchorStatus: "anchored", anchorTxHash: "TX123" },
      },
    ]);
    mockPrisma.proof.findMany.mockResolvedValue([{ taskId: "task_1", status: "verified" }]);
    mockPrisma.specialist.findMany.mockResolvedValue([
      { id: "agent_1", name: "vx_agent_internal", config: { name: "My Yield Agent" } },
    ]);

    const rows = await listProjectExecutions("proj_A");
    expect(rows).toHaveLength(1);
    expect(rows[0].anchorStatus).toBe("anchored");
    expect(rows[0].anchorTxHash).toBe("TX123");
    expect(rows[0].proofStatus).toBe("verified");
    expect(rows[0].agentName).toBe("My Yield Agent");
    expect(rows[0].agentName).not.toMatch(/^vx_agent_/);
  });

  it("reports pending anchor when a receipt exists without an anchor status", async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "t2",
        status: "completed",
        agentId: null,
        createdAt: new Date(),
        receipt: { receiptHash: "h".repeat(64), anchorStatus: null, anchorTxHash: null },
      },
    ]);
    mockPrisma.proof.findMany.mockResolvedValue([]);
    const rows = await listProjectExecutions("proj_A");
    expect(rows[0].anchorStatus).toBe("pending");
  });
});

describe("listProjectVerifications — surfaces anchor state + constraints", () => {
  it("joins anchor state by task and maps the 5 constraints", async () => {
    mockPrisma.task.findMany.mockResolvedValue([{ id: "task_1" }]);
    mockPrisma.proof.findMany.mockResolvedValue([
      {
        taskId: "task_1",
        receiptHash: "h".repeat(64),
        status: "verified",
        verifiedAt: new Date("2026-06-15T00:00:30Z"),
        journal: {
          receiptIntegrityOk: true,
          spendCapOk: true,
          paymentCorrect: true,
          agentMembershipOk: true,
          traceRoot: "c".repeat(64),
        },
        createdAt: new Date("2026-06-15T00:00:00Z"),
      },
    ]);
    mockPrisma.executionReceipt.findMany.mockResolvedValue([
      { taskId: "task_1", anchorStatus: "anchored", anchoredAt: new Date("2026-06-15T00:01:00Z") },
    ]);

    const rows = await listProjectVerifications("proj_A");
    expect(rows[0].status).toBe("verified");
    expect(rows[0].anchorStatus).toBe("anchored");
    expect(rows[0].anchoredAt).toBe("2026-06-15T00:01:00.000Z");
    expect(rows[0].constraints).toEqual({
      receiptIntegrity: true,
      spendCap: true,
      paymentCorrect: true,
      agentMembership: true,
      traceCommitment: true,
    });
  });
});
