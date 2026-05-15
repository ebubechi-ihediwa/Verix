/**
 * Proof service — EPIC 5 (Issues #24–#26)
 *
 * Generates and verifies workflow integrity proofs from ExecutionReceipts.
 *
 * Two modes (controlled by PROOF_MODE env var):
 *   "disabled" — no-op; receipt stays at "proof_ready"
 *   "local"    — runs TypeScript deterministic verifier in-process
 *
 * After verifyProof() passes all 5 integrity checks, it automatically triggers
 * Trustless Work escrow milestone release for milestones with
 * releaseCondition === "proof_verified" (via releaseEscrowMilestones).
 */

import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { recordTraceEvent } from "@/services/trace";
import { ExecutionReceipt } from "@/types/trace";
import { ProofInput, ProofJournal, ProofRecord, ProofStatus } from "@/types/proof";
import { buildProofInput, verify } from "../../proofs/verifier";

// ── Proof record mapping ──────────────────────────────────────────────────────

function toProofRecord(row: {
  id: string;
  taskId: string;
  receiptId: string;
  receiptHash: string;
  schemaVersion: string;
  status: string;
  programId: string | null;
  journal: unknown;
  artifactUri: string | null;
  errorMsg: string | null;
  createdAt: Date;
  provenAt: Date | null;
  verifiedAt: Date | null;
}): ProofRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    receiptId: row.receiptId,
    receiptHash: row.receiptHash,
    schemaVersion: row.schemaVersion,
    status: row.status as ProofStatus,
    programId: row.programId ?? undefined,
    journal: (row.journal as ProofJournal) ?? undefined,
    artifactUri: row.artifactUri ?? undefined,
    errorMsg: row.errorMsg ?? undefined,
    createdAt: row.createdAt.toISOString(),
    provenAt: row.provenAt?.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString(),
  };
}

// ── Build proof input from receipt ────────────────────────────────────────────

function receiptToProofInput(receipt: ExecutionReceipt): ProofInput {
  const paymentIntents = receipt.paymentSummary.map((p) => ({
    specialist: p.specialist,
    amount: p.amount,
    recipientAddress: p.recipientAddress,
    agentVersion: p.agentVersion,
    versionHash: p.versionHash,
    agentVersionHash: p.versionHash,
    txHash: p.txHash,
    subtaskId: p.subtaskId,
    parentSubtaskId: p.parentSubtaskId,
    splitRole: p.splitRole,
    delegatedBySpecialistName: p.delegatedBySpecialistName,
  }));

  return buildProofInput({
    taskId: receipt.taskId,
    taskInputHash: receipt.taskInputHash,
    receiptHash: receipt.receiptHash,
    traceRoot: receipt.traceRoot,
    agentVersionHashes: receipt.agentVersionHashes,
    spendCap: receipt.spendCap ?? 50,
    totalCost: receipt.totalCost ?? 0,
    outputHash: receipt.outputHash,
    registrySnapshotHash: receipt.registrySnapshotHash,
    paymentIntents,
  });
}

// ── Local verifier ────────────────────────────────────────────────────────────

async function runLocalVerifier(
  proofId: string,
  taskId: string,
  input: ProofInput
): Promise<ProofJournal> {
  const result = verify(input);

  if (!result.ok) {
    throw new Error(
      `Proof verification failed. Failed constraints: ${result.failedConstraints.join(", ")}`
    );
  }

  return result.journal;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a proof for a completed execution receipt.
 *
 * Creates a Proof row in the DB, runs the verifier (local or Boundless),
 * and records proof lifecycle trace events. Safe to call fire-and-forget.
 */
export async function generateProof(receipt: ExecutionReceipt): Promise<ProofRecord> {
  if (env.PROOF_MODE === "disabled") {
    throw new Error("[Proof] PROOF_MODE=disabled — proof generation skipped.");
  }

  // Idempotency: don't re-generate if a proof already exists for this receipt
  const existing = await prisma.proof.findUnique({ where: { receiptId: receipt.id } });
  if (existing) {
    return toProofRecord(existing);
  }

  const proof = await prisma.proof.create({
    data: {
      taskId: receipt.taskId,
      receiptId: receipt.id,
      receiptHash: receipt.receiptHash,
      schemaVersion: "1.0",
      status: "running",
      programId: null,
    },
  });

  // ── TRACE: proof_generation_started ─────────────────────────────────────
  await recordTraceEvent(
    receipt.taskId,
    "proof_generation_started",
    "system",
    `Proof generation started (mode: ${env.PROOF_MODE}) for receipt ${receipt.receiptHash.slice(0, 16)}...`,
    { metadata: { proofId: proof.id, receiptHash: receipt.receiptHash, mode: env.PROOF_MODE } }
  ).catch(() => { /* non-fatal */ });

  try {
    const input = receiptToProofInput(receipt);
    const journal = await runLocalVerifier(proof.id, receipt.taskId, input);

    const updated = await prisma.proof.update({
      where: { id: proof.id },
      data: {
        status: "proven",
        journal: journal as unknown as object,
        provenAt: new Date(),
      },
    });

    // ── TRACE: proof_generated ─────────────────────────────────────────────
    await recordTraceEvent(
      receipt.taskId,
      "proof_generated",
      "system",
      `Proof generated: receipt integrity, spend cap, payment, and agent membership checks complete`,
      {
        metadata: {
          proofId: proof.id,
          receiptHash: receipt.receiptHash,
          spendCapOk: (journal as unknown as Record<string, unknown>).spendCapOk,
          paymentCorrect: (journal as unknown as Record<string, unknown>).paymentCorrect,
          agentMembershipOk: (journal as unknown as Record<string, unknown>).agentMembershipOk,
          receiptIntegrityOk: (journal as unknown as Record<string, unknown>).receiptIntegrityOk,
        },
      }
    ).catch(() => { /* non-fatal */ });

    return toProofRecord(updated);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown proof error";

    await prisma.proof.update({
      where: { id: proof.id },
      data: { status: "failed", errorMsg },
    }).catch(() => { /* non-fatal */ });

    // ── TRACE: proof_generation_failed ───────────────────────────────────
    await recordTraceEvent(
      receipt.taskId,
      "proof_generation_failed",
      "system",
      `Proof generation failed: ${errorMsg}`,
      { metadata: { proofId: proof.id, error: errorMsg } }
    ).catch(() => { /* non-fatal */ });

    throw err;
  }
}

/**
 * Verify a proven proof — validate its journal against the committed receiptHash
 * and transition the receipt to "verified" status.
 */
export async function verifyProof(proofId: string): Promise<ProofRecord> {
  const proof = await prisma.proof.findUnique({ where: { id: proofId } });
  if (!proof) throw new Error(`Proof ${proofId} not found`);

  if (proof.status === "verified") {
    return toProofRecord(proof);
  }

  if (proof.status !== "proven") {
    throw new Error(
      `Proof ${proofId} cannot be verified — current status is "${proof.status}". ` +
        `Must be "proven" first.`
    );
  }

  const journal = proof.journal as unknown as ProofJournal | null;
  if (!journal) {
    throw new Error(`Proof ${proofId} has no journal — cannot verify.`);
  }

  if (journal.receiptHash !== proof.receiptHash) {
    await recordTraceEvent(
      proof.taskId,
      "proof_verification_failed",
      "system",
      `Proof verification failed: journal receiptHash mismatch`,
      { metadata: { proofId, expected: proof.receiptHash, actual: journal.receiptHash } }
    ).catch(() => { /* non-fatal */ });

    throw new Error(
      `Proof ${proofId} verification failed: journal receiptHash does not match stored receiptHash.`
    );
  }

  const failedFlags = (
    ["spendCapOk", "paymentCorrect", "agentMembershipOk", "receiptIntegrityOk"] as const
  ).filter((k) => !journal[k]);

  if (failedFlags.length > 0) {
    await recordTraceEvent(
      proof.taskId,
      "proof_verification_failed",
      "system",
      `Proof verification failed: integrity flags not satisfied: ${failedFlags.join(", ")}`,
      { metadata: { proofId, failedFlags } }
    ).catch(() => { /* non-fatal */ });

    throw new Error(
      `Proof ${proofId} verification failed: ${failedFlags.join(", ")} not satisfied.`
    );
  }

  const now = new Date();
  const updated = await prisma.proof.update({
    where: { id: proofId },
    data: { status: "verified", verifiedAt: now },
  });

  await prisma.executionReceipt.update({
    where: { taskId: proof.taskId },
    data: { status: "verified" },
  }).catch((e) => console.warn("[Proof] Receipt status update failed:", e));

  await recordTraceEvent(
    proof.taskId,
    "proof_verified",
    "system",
    `Proof verified — receipt ${proof.receiptHash.slice(0, 16)}... is now cryptographically attested`,
    {
      metadata: {
        proofId,
        receiptHash: proof.receiptHash,
        verifiedAt: now.toISOString(),
        verifierType: journal.verifierType,
      },
    }
  ).catch(() => { /* non-fatal */ });

  const receiptForAnchor = await prisma.executionReceipt.findUnique({
    where: { taskId: proof.taskId },
  });
  if (receiptForAnchor) {
    import("@/services/anchor")
      .then(({ anchorVerifiedReceipt }) =>
        anchorVerifiedReceipt({
          id: receiptForAnchor.id,
          taskId: receiptForAnchor.taskId,
          taskInputHash: receiptForAnchor.taskInputHash,
          agentVersionHashes: receiptForAnchor.agentVersionHashes,
          spendCap: receiptForAnchor.spendCap != null ? Number(receiptForAnchor.spendCap) : undefined,
          totalCost: receiptForAnchor.totalCost != null ? Number(receiptForAnchor.totalCost) : undefined,
          traceRoot: receiptForAnchor.traceRoot,
          outputHash: receiptForAnchor.outputHash ?? undefined,
          registrySnapshotHash: receiptForAnchor.registrySnapshotHash ?? undefined,
          paymentSummary: (receiptForAnchor.paymentSummary as unknown[]) as import("@/types/trace").PaymentSummaryItem[],
          receiptHash: receiptForAnchor.receiptHash,
          status: "verified",
          createdAt: receiptForAnchor.createdAt.toISOString(),
        })
      )
      .catch((err) => console.warn("[Proof] Soroban receipt anchor failed:", err));
  }

  // Trigger Trustless Work escrow milestone release for proof_verified milestones.
  // Dynamic import avoids a circular dependency: proof ← escrow ← trace ← proof.
  const verifiedReceipt = await prisma.executionReceipt.findUnique({
    where: { taskId: proof.taskId },
  });
  if (verifiedReceipt) {
    import("@/services/escrow")
      .then(({ releaseEscrowMilestones }) => {
        const receipt = {
          id: verifiedReceipt.id,
          taskId: verifiedReceipt.taskId,
          taskInputHash: verifiedReceipt.taskInputHash,
          agentVersionHashes: verifiedReceipt.agentVersionHashes,
          spendCap: verifiedReceipt.spendCap != null ? Number(verifiedReceipt.spendCap) : undefined,
          totalCost: verifiedReceipt.totalCost != null ? Number(verifiedReceipt.totalCost) : undefined,
          traceRoot: verifiedReceipt.traceRoot,
          outputHash: verifiedReceipt.outputHash ?? undefined,
          registrySnapshotHash: verifiedReceipt.registrySnapshotHash ?? undefined,
          paymentSummary: (verifiedReceipt.paymentSummary as unknown[]) as import("@/types/trace").PaymentSummaryItem[],
          receiptHash: verifiedReceipt.receiptHash,
          status: "verified" as const,
          createdAt: verifiedReceipt.createdAt.toISOString(),
        };
        return releaseEscrowMilestones(proof.taskId, receipt);
      })
      .catch((err) => console.warn("[Proof] Escrow milestone release failed:", err));
  }

  return toProofRecord(updated);
}

export async function getProof(proofId: string): Promise<ProofRecord | null> {
  const row = await prisma.proof.findUnique({ where: { id: proofId } });
  return row ? toProofRecord(row) : null;
}

export async function getProofByTask(taskId: string): Promise<ProofRecord | null> {
  const row = await prisma.proof.findFirst({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });
  return row ? toProofRecord(row) : null;
}

export async function getProofByReceipt(receiptId: string): Promise<ProofRecord | null> {
  const row = await prisma.proof.findUnique({ where: { receiptId } });
  return row ? toProofRecord(row) : null;
}
