import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Public endpoint: GET /api/verify/:receiptHash
 *
 * Returns the verification status and proof journal for any receipt hash.
 * Usable by third parties to independently check Verix execution integrity.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ receiptHash: string }> }
) {
  const { receiptHash } = await params;

  if (!receiptHash || !/^[0-9a-f]{64}$/.test(receiptHash)) {
    return NextResponse.json(
      { error: "receiptHash must be a 64-character lowercase hex SHA-256" },
      { status: 400 }
    );
  }

  // Look up the receipt (receiptHash is not a unique column → findFirst)
  const receipt = await prisma.executionReceipt.findFirst({
    where: { receiptHash },
    select: {
      id: true,
      taskId: true,
      receiptHash: true,
      traceRoot: true,
      agentVersionHashes: true,
      spendCap: true,
      totalCost: true,
      createdAt: true,
      anchorContractId: true,
      anchorTxHash: true,
      anchoredAt: true,
    },
  }).catch(() => null);

  if (!receipt) {
    return NextResponse.json(
      { error: "Receipt not found", receiptHash },
      { status: 404 }
    );
  }

  // Look up associated proof
  const proof = await prisma.proof.findUnique({
    where: { receiptId: receipt.id },
    select: {
      id: true,
      status: true,
      receiptHash: true,
      schemaVersion: true,
      provenAt: true,
      verifiedAt: true,
      journal: true,
      errorMsg: true,
    },
  }).catch(() => null);

  // On-chain anchor data lives on the receipt itself (anchorContractId / anchorTxHash)
  const anchor = receipt.anchorContractId
    ? {
        contractId: receipt.anchorContractId,
        txHash: receipt.anchorTxHash,
        anchoredAt: receipt.anchoredAt,
      }
    : null;

  return NextResponse.json({
    receiptHash: receipt.receiptHash,
    taskId: receipt.taskId,
    traceRoot: receipt.traceRoot,
    agentCount: Array.isArray(receipt.agentVersionHashes)
      ? (receipt.agentVersionHashes as string[]).length
      : 0,
    spendCap: receipt.spendCap,
    totalCost: receipt.totalCost,
    createdAt: receipt.createdAt,
    proof: proof
      ? {
          id: proof.id,
          status: proof.status,
          schemaVersion: proof.schemaVersion,
          provenAt: proof.provenAt,
          verifiedAt: proof.verifiedAt,
          journal: proof.status === "verified" ? proof.journal : null,
          error: proof.errorMsg ?? null,
        }
      : null,
    anchor: anchor
      ? {
          contractId: anchor.contractId,
          txHash: anchor.txHash,
          anchoredAt: anchor.anchoredAt,
        }
      : null,
    verified: proof?.status === "verified",
    anchored: anchor !== null,
  });
}
