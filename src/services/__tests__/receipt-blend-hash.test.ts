import { describe, it, expect, vi } from "vitest";

// Pin the trace root so receiptHash is deterministic; keep the rest of trace real.
vi.mock("@/services/trace", async (orig) => ({
  ...(await orig<typeof import("@/services/trace")>()),
  computeTraceRoot: vi.fn().mockResolvedValue("c".repeat(64)),
}));

import { generateReceipt } from "@/services/receipt";

/**
 * Golden test: `blendOperation` is additive display metadata and must NEVER
 * enter hashReceiptCommitment. A receipt computed WITH a Blend operation must
 * have the byte-identical receiptHash as the same receipt WITHOUT one.
 * (Runs in demo mode — no DATABASE_URL — exercising the pure hashing path.)
 */
describe("receiptHash stability with blendOperation", () => {
  const base = {
    taskId: "t_blend_hash",
    description: "Supply 250 USDC to the best Blend pool",
    agentVersionIds: ["vh_abc"],
    totalCost: 1.5,
    spendCap: 50,
    resultSummary: "done",
    paymentBreakdown: [],
  };

  it("does not change the receipt hash when blendOperation is present", async () => {
    const without = await generateReceipt({ ...base });
    const withOp = await generateReceipt({
      ...base,
      blendOperation: {
        protocol: "blend",
        operation: "supply",
        asset: "USDC",
        amount: 250,
        poolId: "CUSDCPOOL",
        txHash: "TXSUPPLY123",
        apy: 0.0524,
      },
    });

    expect(withOp.receiptHash).toBe(without.receiptHash);
    expect(withOp.receiptHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
