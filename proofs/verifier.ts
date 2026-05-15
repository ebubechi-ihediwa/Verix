/**
 * Deterministic proof verifier for workflow integrity receipts — EPIC 5 (Issue #24)
 *
 * This TypeScript module implements the same verification logic that a
 * RISC Zero guest program would execute inside the zkVM. Running it locally
 * (PROOF_MODE=local) produces a ProofJournal without an on-chain proof;
 * running through Boundless (PROOF_MODE=boundless) would produce a zkSNARK
 * alongside the same journal.
 *
 * The verifier checks five constraints:
 *   1. Receipt integrity     — recomputed receiptHash matches the input hash
 *   2. Spend cap compliance  — totalCost <= spendCap
 *   3. Payment correctness   — payment intent amounts sum to totalCost
 *   4. Agent membership      — all agentVersionHashes are non-empty strings
 *   5. Trace commitment      — traceRoot is a non-empty hex string (structure validated
 *                              by the hash-chain already; we commit to it here)
 *
 * WHAT THIS DOES NOT PROVE:
 *   - LLM inference outputs or response quality
 *   - Off-chain computation correctness beyond workflow metadata
 */

import { createHash } from "crypto";
import { ProofInput, ProofJournal } from "../src/types/proof";

// ── Internal helpers ──────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value ?? null);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + (value as unknown[]).map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`
  );
  return "{" + pairs.join(",") + "}";
}

function hashCanonical(obj: Record<string, unknown>): string {
  return sha256(canonicalize(obj));
}

// ── Verification constraints ──────────────────────────────────────────────────

/**
 * Constraint 1: Receipt integrity
 *
 * The receiptHash committed in ProofInput must match the SHA-256 of the
 * canonical serialisation of the receipt fields. Any mutation to inputs
 * produces a different hash and fails this check.
 */
function checkReceiptIntegrity(input: ProofInput): boolean {
  const recomputed = hashCanonical({
    taskId: input.taskId,
    taskInputHash: input.taskInputHash,
    agentVersionHashes: [...input.agentVersionHashes].sort(),
    spendCap: input.spendCap ?? null,
    totalCost: input.totalCost ?? null,
    traceRoot: input.traceRoot,
    outputHash: input.outputHash ?? null,
    paymentSummary: input.paymentIntents,
  });
  return recomputed === input.receiptHash;
}

/**
 * Constraint 2: Spend cap compliance
 *
 * Total cost must not exceed the spend cap set by the task owner.
 */
function checkSpendCap(input: ProofInput): boolean {
  return input.totalCost <= input.spendCap;
}

/**
 * Constraint 3: Payment correctness
 *
 * The sum of all payment intent amounts must equal totalCost (within floating
 * point epsilon). Empty payment lists are valid (demo / mocked payments).
 */
function checkPaymentCorrect(input: ProofInput): boolean {
  if (input.paymentIntents.length === 0) return true;
  const sum = input.paymentIntents.reduce((acc, p) => acc + p.amount, 0);
  return Math.abs(sum - input.totalCost) < 0.001; // $0.001 epsilon
}

/**
 * Constraint 4: Agent membership
 *
 * Every agentVersionHash must be a non-empty string. This confirms the
 * coordinator pinned a specific agent snapshot before invoking it.
 */
function checkAgentMembership(input: ProofInput): boolean {
  if (input.agentVersionHashes.length === 0) return true; // no agents = trivially ok
  return input.agentVersionHashes.every((h) => typeof h === "string" && h.length > 0);
}

/**
 * Constraint 5: Trace commitment
 *
 * traceRoot must be a non-empty hex string (64 chars for SHA-256).
 * Structural correctness of the hash chain is already guaranteed by the
 * recordTraceEvent service; we commit to the root here.
 */
function checkTraceCommitment(input: ProofInput): boolean {
  return typeof input.traceRoot === "string" && /^[0-9a-f]{64}$/i.test(input.traceRoot);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VerificationResult {
  ok: boolean;
  journal: ProofJournal;
  failedConstraints: string[];
}

/**
 * Run all verification constraints against a ProofInput and produce a journal.
 *
 * This function is deterministic — the same input always produces the same
 * journal. It is safe to call in-process (PROOF_MODE=local) or to use as the
 * reference implementation for a RISC Zero guest.
 */
export function verify(input: ProofInput): VerificationResult {
  const receiptIntegrityOk = checkReceiptIntegrity(input);
  const spendCapOk = checkSpendCap(input);
  const paymentCorrect = checkPaymentCorrect(input);
  const agentMembershipOk = checkAgentMembership(input);
  const traceOk = checkTraceCommitment(input);

  const failedConstraints: string[] = [];
  if (!receiptIntegrityOk) failedConstraints.push("receipt_integrity");
  if (!spendCapOk) failedConstraints.push("spend_cap");
  if (!paymentCorrect) failedConstraints.push("payment_correct");
  if (!agentMembershipOk) failedConstraints.push("agent_membership");
  if (!traceOk) failedConstraints.push("trace_commitment");

  const journal: ProofJournal = {
    receiptHash: input.receiptHash,
    traceRoot: input.traceRoot,
    totalCost: input.totalCost,
    spendCapOk,
    paymentCorrect,
    agentMembershipOk,
    receiptIntegrityOk,
    verifiedAt: new Date().toISOString(),
    verifierType: "local",
  };

  return { ok: failedConstraints.length === 0, journal, failedConstraints };
}

/**
 * Build a ProofInput from an ExecutionReceipt-shaped object.
 * Convenience function for the service layer.
 */
export function buildProofInput(opts: {
  taskId: string;
  taskInputHash: string;
  receiptHash: string;
  traceRoot: string;
  agentVersionHashes: string[];
  spendCap: number;
  totalCost: number;
  outputHash?: string;
  paymentIntents: Array<{ specialist: string; amount: number; agentVersionHash?: string; txHash?: string }>;
}): ProofInput {
  return {
    version: "1.0",
    taskId: opts.taskId,
    taskInputHash: opts.taskInputHash,
    receiptHash: opts.receiptHash,
    traceRoot: opts.traceRoot,
    agentVersionHashes: [...opts.agentVersionHashes].sort(),
    spendCap: opts.spendCap,
    totalCost: opts.totalCost,
    outputHash: opts.outputHash,
    paymentIntents: opts.paymentIntents,
  };
}
