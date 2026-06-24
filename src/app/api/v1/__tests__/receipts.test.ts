import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-keys", () => ({ findProjectByApiKey: vi.fn() }));
vi.mock("@/lib/v1-executions", () => ({ getReceiptForProject: vi.fn() }));
vi.mock("@/lib/stellar-config", () => ({ stellarTxExplorerUrl: (h: string) => `https://explorer/tx/${h}` }));
vi.mock("@/lib/db", () => ({ prisma: { proof: { findUnique: vi.fn() } } }));

import { findProjectByApiKey } from "@/lib/api-keys";
import { getReceiptForProject } from "@/lib/v1-executions";
import { prisma } from "@/lib/db";
import { GET as getReceipt } from "@/app/api/v1/receipts/[hash]/route";

const mockFind = findProjectByApiKey as unknown as ReturnType<typeof vi.fn>;
const mockGetReceipt = getReceiptForProject as unknown as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as { proof: { findUnique: ReturnType<typeof vi.fn> } };

const HASH = "a".repeat(64);

function req(bearer?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new NextRequest(`http://localhost/api/v1/receipts/${HASH}`, { headers });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/receipts/:hash", () => {
  it("returns receipt + proof + anchor metadata", async () => {
    mockFind.mockResolvedValue({ project: { id: "proj_A" }, keyId: "key_1" });
    mockGetReceipt.mockResolvedValue({
      id: "rec_1",
      receiptHash: HASH,
      taskId: "task_1",
      traceRoot: "c".repeat(64),
      taskInputHash: "d".repeat(64),
      agentVersionHashes: ["e".repeat(64)],
      spendCap: 50,
      totalCost: 1.5,
      registrySnapshotHash: "f".repeat(64),
      status: "verified",
      createdAt: new Date("2026-06-15T00:00:00Z"),
      anchorStatus: "anchored",
      anchorTxHash: "TX123",
      anchorContractId: "CCONTRACT",
      anchoredAt: new Date("2026-06-15T00:01:00Z"),
    });
    mockPrisma.proof.findUnique.mockResolvedValue({
      id: "proof_1",
      status: "verified",
      schemaVersion: "1.0",
      journal: { agentMembershipOk: true },
      verifiedAt: new Date("2026-06-15T00:00:30Z"),
      errorMsg: null,
    });

    const res = await getReceipt(req("vx_test_valid"), { params: Promise.resolve({ hash: HASH }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.receiptHash).toBe(HASH);
    expect(json.proof.status).toBe("verified");
    expect(json.anchor.status).toBe("anchored");
    expect(json.anchor.txHash).toBe("TX123");
    expect(json.anchor.contractId).toBe("CCONTRACT");
    expect(json.anchor.explorerUrl).toBe("https://explorer/tx/TX123");
  });

  it("returns 401 without a key", async () => {
    const res = await getReceipt(req(), { params: Promise.resolve({ hash: HASH }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a receipt not owned by the project", async () => {
    mockFind.mockResolvedValue({ project: { id: "proj_A" }, keyId: "key_1" });
    mockGetReceipt.mockResolvedValue(null);
    const res = await getReceipt(req("vx_test_valid"), { params: Promise.resolve({ hash: HASH }) });
    expect(res.status).toBe(404);
  });
});
