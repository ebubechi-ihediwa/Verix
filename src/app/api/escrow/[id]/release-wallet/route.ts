import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStellarPublicKey } from "@/lib/stellar-config";
import { releaseMilestone, submitSignedEscrowTransaction } from "@/services/escrow";
import { recordTraceEvent } from "@/services/trace";
import { env } from "@/lib/env";

/**
 * POST /api/escrow/[id]/release-wallet
 *
 * Two-phase wallet-signed milestone release for TRUSTLESS_WORK_SIGNING_MODE=wallet.
 *
 * Phase A — Prepare (no signedXdr in body):
 *   Server runs step 1 (change-milestone-status) and step 2 (approve-milestone) server-side.
 *   Returns unsignedReleaseTransaction (step 3 XDR) for the client to wallet-sign.
 *
 * Phase B — Submit (signedXdr present):
 *   Server submits the signed step-3 XDR to Trustless Work and marks the milestone released.
 *
 * Body: { milestoneId: string, payerAddress: string, signedXdr?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (env.TRUSTLESS_WORK_SIGNING_MODE !== "wallet") {
    return NextResponse.json(
      { error: "This endpoint is only available when TRUSTLESS_WORK_SIGNING_MODE=wallet" },
      { status: 400 }
    );
  }

  const { id } = await params;

  let body: { milestoneId?: string; payerAddress?: string; signedXdr?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { milestoneId, payerAddress, signedXdr } = body;

  if (!milestoneId) {
    return NextResponse.json({ error: "milestoneId is required" }, { status: 400 });
  }
  if (!isStellarPublicKey(payerAddress)) {
    return NextResponse.json(
      { error: "payerAddress must be a valid Stellar public key (G...)" },
      { status: 400 }
    );
  }

  const escrow = await prisma.escrow.findUnique({
    where: { id },
    include: { milestones: { where: { id: milestoneId } } },
  });
  if (!escrow) {
    return NextResponse.json({ error: "Escrow not found" }, { status: 404 });
  }
  if (escrow.payerAddress && escrow.payerAddress !== payerAddress) {
    return NextResponse.json(
      { error: "payerAddress does not match escrow payer wallet" },
      { status: 403 }
    );
  }

  const milestone = escrow.milestones[0];
  if (!milestone) {
    return NextResponse.json({ error: "Milestone not found in this escrow" }, { status: 404 });
  }
  if (milestone.status === "released") {
    return NextResponse.json({ status: "already_released", milestoneId }, { status: 200 });
  }

  // Phase B: submit signed XDR (step 3)
  if (signedXdr) {
    try {
      const result = await submitSignedEscrowTransaction(id, signedXdr, "release");

      await prisma.escrowMilestone.update({
        where: { id: milestoneId },
        data: {
          status: "released",
          releaseTxHash: result.txHash ?? null,
        },
      });

      await recordTraceEvent(
        escrow.taskId,
        "milestone_released",
        "user",
        `Milestone wallet-released for specialist ${milestone.specialistId}: $${Number(milestone.amount).toFixed(2)} USDC${result.txHash ? ` (tx: ${result.txHash.slice(0, 10)}...)` : ""}`,
        {
          metadata: {
            milestoneId,
            specialistId: milestone.specialistId,
            amount: Number(milestone.amount),
            txHash: result.txHash,
            signingMode: "wallet",
            payerAddress,
          },
        }
      ).catch(() => {});

      const unreleasedCount = await prisma.escrowMilestone.count({
        where: { escrowId: id, status: { notIn: ["released", "refunded"] } },
      }).catch(() => 1);

      if (unreleasedCount === 0) {
        await prisma.escrow.update({
          where: { id },
          data: { status: "completed" },
        }).catch(() => {});
      }

      return NextResponse.json({ status: "released", milestoneId, txHash: result.txHash });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit signed release";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Phase A: prepare (run steps 1+2, return unsigned step 3)
  try {
    const receipt = await prisma.executionReceipt.findUnique({
      where: { taskId: escrow.taskId },
      select: { receiptHash: true },
    });

    const result = await releaseMilestone({
      escrowId: escrow.externalId ?? escrow.id,
      milestoneId,
      externalMilestoneId: milestone.externalMilestoneId ?? undefined,
      receiptHash: receipt?.receiptHash ?? undefined,
      walletMode: true,
      payerAddress: payerAddress as string,
    });

    if (!result.unsignedReleaseTransaction) {
      return NextResponse.json(
        { error: "No unsigned release transaction returned — steps 1+2 may have failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "signature_required",
      milestoneId,
      unsignedReleaseTransaction: result.unsignedReleaseTransaction,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to prepare milestone release";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
