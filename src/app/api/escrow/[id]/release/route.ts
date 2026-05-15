import { NextRequest, NextResponse } from "next/server";
import { releaseEscrowMilestones } from "@/services/escrow";
import { getReceipt } from "@/services/receipt";
import { prisma } from "@/lib/db";

/**
 * POST /api/escrow/[id]/release
 *
 * Manually trigger proof-gated milestone release for an escrow.
 * Fetches the ExecutionReceipt for the task and calls releaseEscrowMilestones().
 *
 * Requirements:
 * - Escrow must exist (404 otherwise)
 * - ExecutionReceipt must exist for the task (400 otherwise)
 * - Release conditions on each milestone determine which are actually released
 *   ("proof_verified" milestones require receipt.status === "verified")
 *
 * This endpoint is safe to call multiple times — already-released milestones
 * are skipped. Useful for manual intervention or retry after provider errors.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const escrow = await prisma.escrow.findUnique({
    where: { id },
    select: { taskId: true, status: true },
  }).catch(() => null);

  if (!escrow) {
    return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
  }

  const receipt = await getReceipt(escrow.taskId).catch(() => null);
  if (!receipt) {
    return NextResponse.json(
      {
        error: "No ExecutionReceipt found for this task. Receipt must exist before milestones can be released.",
        hint: "Ensure the task has completed and generateReceipt() has run.",
      },
      { status: 400 }
    );
  }

  const result = await releaseEscrowMilestones(escrow.taskId, receipt, { allowManual: true });

  return NextResponse.json({
    escrowId: id,
    taskId: escrow.taskId,
    receiptHash: receipt.receiptHash,
    receiptStatus: receipt.status,
    ...result,
  });
}
