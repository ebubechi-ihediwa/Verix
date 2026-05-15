/**
 * Proof input/output schema for workflow integrity receipts — EPIC 5 (Issue #23)
 *
 * WHAT THIS PROVES:
 *   - Trace consistency: traceRoot commits to the full hash-chained event log
 *   - Agent membership: selected AgentVersion hashes are committed to the receipt
 *   - Spend cap compliance: totalCost <= spendCap
 *   - Payment correctness: payment intent amounts sum to totalCost
 *   - Receipt integrity: receiptHash = SHA-256(canonical fields)
 *
 * WHAT THIS DOES NOT PROVE:
 *   - LLM inference outputs (the content of AI responses)
 *   - Off-chain computation quality or accuracy
 *   - Agent internal state beyond versioned metadata
 *
 * Schema version: "1.0"
 */

// ── Inputs (private witness + public commitments) ─────────────────────────────

export interface PaymentIntent {
  specialist: string;
  amount: number;               // USDC (2 decimal places)
  agentVersionHash?: string;    // SHA-256 of agent version metadata
  txHash?: string;              // on-chain transaction reference
}

export interface ProofInput {
  /** Schema version — increment when fields change to maintain backward compat. */
  version: "1.0";

  // ── Task identity ───────────────────────────────────────────────────────────
  taskId: string;
  taskInputHash: string;        // SHA-256(task description)

  // ── Receipt commitment ──────────────────────────────────────────────────────
  receiptHash: string;          // canonical receipt digest (what we're proving)
  traceRoot: string;            // hash of last chained trace event

  // ── Agent version commitments ───────────────────────────────────────────────
  agentVersionHashes: string[]; // sorted SHA-256 hashes of AgentVersion snapshots

  // ── Budget compliance ───────────────────────────────────────────────────────
  spendCap: number;             // USDC limit set by the task owner
  totalCost: number;            // actual USDC spent across all specialists

  // ── Output commitment ───────────────────────────────────────────────────────
  outputHash?: string;          // SHA-256(result summary)

  // ── Payment intents ─────────────────────────────────────────────────────────
  paymentIntents: PaymentIntent[];
}

// ── Public journal outputs (what the verifier publishes) ─────────────────────

export interface ProofJournal {
  /** The receipt hash this proof commits to. */
  receiptHash: string;

  /** The trace root this proof commits to. */
  traceRoot: string;

  /** Total USDC spent (redundant but included for on-chain inspection). */
  totalCost: number;

  /** True if totalCost <= spendCap. */
  spendCapOk: boolean;

  /** True if payment intent amounts sum correctly to totalCost. */
  paymentCorrect: boolean;

  /** True if all agentVersionHashes are non-empty and uniquely committed. */
  agentMembershipOk: boolean;

  /** True if receiptHash matches re-computed canonical hash of inputs. */
  receiptIntegrityOk: boolean;

  /** ISO timestamp of when this journal was produced by the verifier. */
  verifiedAt: string;

  /** Which verifier produced this journal. */
  verifierType: "local" | "boundless";
}

// ── Proof lifecycle ───────────────────────────────────────────────────────────

export type ProofStatus =
  | "pending"    // queued, not yet running
  | "running"    // proof generation in progress
  | "proven"     // proof/journal generated, awaiting verification check
  | "verified"   // journal validated against receipt hash
  | "failed";    // generation or verification failed

export interface ProofRecord {
  id: string;
  taskId: string;
  receiptId: string;
  receiptHash: string;
  schemaVersion: string;
  status: ProofStatus;
  programId?: string;           // Boundless image ID when using RISC Zero
  journal?: ProofJournal;
  artifactUri?: string;         // path/URI to serialized proof blob
  errorMsg?: string;
  createdAt: string;
  provenAt?: string;
  verifiedAt?: string;
}

// ── Conversion helper type ────────────────────────────────────────────────────

export interface ProofInputBuildOptions {
  taskId: string;
  description: string;
  spendCap: number;
  totalCost: number;
  receiptHash: string;
  traceRoot: string;
  taskInputHash: string;
  agentVersionHashes: string[];
  outputHash?: string;
  paymentIntents: PaymentIntent[];
}
