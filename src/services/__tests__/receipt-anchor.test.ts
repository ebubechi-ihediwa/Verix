import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecutionReceipt } from "@/types/trace";

vi.mock("@/lib/db", () => ({
  prisma: {
    executionReceipt: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/stellar-config", () => ({
  stellarTxExplorerUrl: (h: string) => `https://explorer/tx/${h}`,
}));
vi.mock("@/services/anchor", () => ({ anchorVerifiedReceipt: vi.fn() }));

import { prisma } from "@/lib/db";
import { anchorVerifiedReceipt } from "@/services/anchor";
import {
  anchorReceipt,
  getAnchoredReceipt,
  isReceiptAnchored,
  toAnchorView,
} from "@/services/receipt-anchor";

const mockPrisma = prisma as unknown as {
  executionReceipt: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockAnchor = anchorVerifiedReceipt as unknown as ReturnType<typeof vi.fn>;

const RECEIPT = { taskId: "task_1", receiptHash: "a".repeat(64) } as unknown as ExecutionReceipt;

beforeEach(() => vi.clearAllMocks());

describe("anchorReceipt", () => {
  it("anchors a verified receipt on success (status=anchored)", async () => {
    mockPrisma.executionReceipt.findUnique.mockResolvedValue({ anchorStatus: null });
    mockAnchor.mockResolvedValue({ anchored: true, contractId: "CCONTRACT", txHash: "TX123" });
    mockPrisma.executionReceipt.update.mockResolvedValue({ anchoredAt: new Date("2026-06-15T00:00:00Z") });

    const view = await anchorReceipt(RECEIPT);

    expect(view.status).toBe("anchored");
    expect(view.txHash).toBe("TX123");
    expect(view.contractId).toBe("CCONTRACT");
    expect(view.anchoredAt).toBe("2026-06-15T00:00:00.000Z");
    expect(mockPrisma.executionReceipt.update.mock.calls[0][0].data.anchorStatus).toBe("anchored");
  });

  it("does NOT anchor when the on-chain anchor fails/unavailable (status=pending)", async () => {
    mockPrisma.executionReceipt.findUnique.mockResolvedValue(null);
    mockAnchor.mockResolvedValue({ anchored: false, reason: "Soroban not configured" });
    mockPrisma.executionReceipt.update.mockResolvedValue({ anchoredAt: null });

    const view = await anchorReceipt(RECEIPT);

    expect(view.status).toBe("pending");
    expect(view.txHash).toBeNull();
    expect(mockAnchor).toHaveBeenCalledTimes(1);
    expect(mockPrisma.executionReceipt.update.mock.calls[0][0].data.anchorStatus).toBe("pending");
  });

  it("is idempotent — an already-anchored receipt is not re-submitted", async () => {
    mockPrisma.executionReceipt.findUnique.mockResolvedValue({
      anchorStatus: "anchored",
      anchorTxHash: "TXOLD",
      anchorContractId: "CCONTRACT",
      anchoredAt: new Date("2026-06-01T00:00:00Z"),
    });

    const view = await anchorReceipt(RECEIPT);

    expect(view.status).toBe("anchored");
    expect(view.txHash).toBe("TXOLD");
    expect(mockAnchor).not.toHaveBeenCalled();
  });
});

describe("getAnchoredReceipt / isReceiptAnchored", () => {
  it("returns anchor metadata for a known receipt", async () => {
    mockPrisma.executionReceipt.findFirst.mockResolvedValue({
      anchorStatus: "anchored",
      anchorTxHash: "TX123",
      anchorContractId: "CCONTRACT",
      anchoredAt: new Date("2026-06-15T00:00:00Z"),
    });
    const view = await getAnchoredReceipt("a".repeat(64));
    expect(view).toEqual({
      status: "anchored",
      txHash: "TX123",
      contractId: "CCONTRACT",
      anchoredAt: "2026-06-15T00:00:00.000Z",
      explorerUrl: "https://explorer/tx/TX123",
    });
  });

  it("returns null for an unknown receipt", async () => {
    mockPrisma.executionReceipt.findFirst.mockResolvedValue(null);
    expect(await getAnchoredReceipt("b".repeat(64))).toBeNull();
  });

  it("isReceiptAnchored is true only when anchored with a tx", async () => {
    mockPrisma.executionReceipt.findFirst.mockResolvedValueOnce({ anchorStatus: "anchored", anchorTxHash: "TX" });
    expect(await isReceiptAnchored("a".repeat(64))).toBe(true);

    mockPrisma.executionReceipt.findFirst.mockResolvedValueOnce({ anchorStatus: "pending", anchorTxHash: null });
    expect(await isReceiptAnchored("a".repeat(64))).toBe(false);
  });
});

describe("toAnchorView", () => {
  it("coerces null/unknown status to pending", () => {
    expect(toAnchorView({ anchorStatus: null }).status).toBe("pending");
    expect(toAnchorView({ anchorStatus: "anchored", anchorTxHash: "TX" }).explorerUrl).toBe(
      "https://explorer/tx/TX"
    );
  });
});
