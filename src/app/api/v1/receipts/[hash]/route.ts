import { NextRequest, NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/v1-auth";
import { getReceiptForProject } from "@/lib/v1-executions";
import { prisma } from "@/lib/db";
import { toAnchorView } from "@/services/receipt-anchor";

const HASH_RE = /^[0-9a-f]{64}$/;

/** GET /api/v1/receipts/:hash — project-scoped receipt by hash (404 cross-project). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
): Promise<NextResponse> {
  const auth = await authenticateBearer(request);
  if (!auth.ok) return auth.response;

  const { hash } = await params;
  if (!HASH_RE.test(hash)) {
    return NextResponse.json(
      { error: "receiptHash must be a 64-character lowercase hex SHA-256" },
      { status: 400 }
    );
  }

  const receipt = await getReceiptForProject(auth.context.project.id, hash);
  if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  const proofRow = await prisma.proof.findUnique({ where: { receiptId: receipt.id } });
  const proof = proofRow
    ? {
        id: proofRow.id,
        status: proofRow.status,
        schemaVersion: proofRow.schemaVersion,
        journal: proofRow.status === "verified" ? proofRow.journal : null,
        verifiedAt: proofRow.verifiedAt ? proofRow.verifiedAt.toISOString() : null,
        error: proofRow.errorMsg ?? null,
      }
    : null;

  return NextResponse.json({
    receiptHash: receipt.receiptHash,
    receipt: {
      receiptHash: receipt.receiptHash,
      taskId: receipt.taskId,
      traceRoot: receipt.traceRoot,
      taskInputHash: receipt.taskInputHash,
      agentVersionHashes: receipt.agentVersionHashes,
      spendCap: receipt.spendCap !== null ? Number(receipt.spendCap) : null,
      totalCost: receipt.totalCost !== null ? Number(receipt.totalCost) : null,
      registrySnapshotHash: receipt.registrySnapshotHash,
      status: receipt.status,
      createdAt: receipt.createdAt.toISOString(),
    },
    proof,
    anchor: toAnchorView(receipt),
  });
}
