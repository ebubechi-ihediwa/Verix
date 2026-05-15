/**
 * Proof service — EPIC 5 (Issues #24–#26)
 *
 * Generates and verifies workflow integrity proofs from ExecutionReceipts.
 *
 * Three modes (controlled by PROOF_MODE env var):
 *   "disabled"   — no-op; receipt stays at "proof_ready"
 *   "local"      — runs TypeScript deterministic verifier in-process
 *   "boundless"  — submits to Boundless/RISC Zero proving network (TODO: wire API)
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
    agentVersionHash: p.versionHash,
    txHash: p.txHash,
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

// ── Boundless verifier (stub) ─────────────────────────────────────────────────

async function runBoundlessProver(
  proofId: string,
  taskId: string,
  input: ProofInput
): Promise<ProofJournal> {
  if (!env.BOUNDLESS_API_URL) {
    throw new Error("[Proof] PROOF_MODE=boundless but BOUNDLESS_API_URL is not set.");
  }

  // TODO: submit to Boundless API and poll for proof completion
  // Endpoint structure (align with actual Boundless API spec):
  //   POST /v1/proofs — submit proof job with input
  //   GET  /v1/proofs/:jobId — poll for completion
  //   Response includes: journal, proofBlob, status
  throw new Error("[Proof] Boundless integration not yet wired. Use PROOF_MODE=local for demo.");
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
      programId: env.BOUNDLESS_IMAGE_ID ?? null,
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
    const journal =
      env.PROOF_MODE === "boundless"
        ? await runBoundlessProver(proof.id, receipt.taskId, input)
        : await runLocalVerifier(proof.id, receipt.taskId, input);

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
          spendCapOk: (journal as unknown as Record<string,unknown>).spendCapOk,
          paymentCorrect: (journal as unknown as Record<string,unknown>).paymentCorrect,
          agentMembershipOk: (journal as unknown as Record<string,unknown>).agentMembershipOk,
          receiptIntegrityOk: (journal as unknown as Record<string,unknown>).receiptIntegrityOk,
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
 * Fetch a proof record by proof ID.
 */
export async function getProof(proofId: string): Promise<ProofRecord | null> {
  const row = await prisma.proof.findUnique({ where: { id: proofId } });
  return row ? toProofRecord(row) : null;
}

/**
 * Fetch a proof record by task ID (via receipt).
 */
export async function getProofByTask(taskId: string): Promise<ProofRecord | null> {
  const row = await prisma.proof.findFirst({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });
  return row ? toProofRecord(row) : null;
}

/**
 * Fetch a proof record by receipt ID.
 */
export async function getProofByReceipt(receiptId: string): Promise<ProofRecord | null> {
  const row = await prisma.proof.findUnique({ where: { receiptId } });
  return row ? toProofRecord(row) : null;
}
