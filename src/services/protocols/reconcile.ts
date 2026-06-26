/**
 * Retry reconciliation (Sprint 7D).
 *
 * Before (re)submitting a transaction, if a prior attempt already produced a tx
 * hash, check its on-chain status. An already-confirmed (or still-pending) tx is
 * reused instead of resubmitted — guaranteeing we never double-submit.
 */

export type TxStatus = "success" | "failed" | "pending" | "not_found";

export interface ReconcileDeps {
  /** Submitted tx hash from a prior attempt, if any (e.g. read from the trace). */
  priorTxHash: string | null;
  /** Resolve a tx hash to its on-chain status. */
  getStatus: (txHash: string) => Promise<TxStatus>;
  /** Build, sign, and send the transaction; returns the new tx hash. */
  submit: () => Promise<{ txHash: string }>;
}

export interface ReconcileResult {
  txHash: string;
  /** True when an existing tx was reused (no new submission). */
  reconciled: boolean;
}

export async function reconcileOrSubmit(deps: ReconcileDeps): Promise<ReconcileResult> {
  if (deps.priorTxHash) {
    const status = await deps.getStatus(deps.priorTxHash);
    // Already confirmed, or still in flight → reuse the hash; do NOT resubmit.
    if (status === "success" || status === "pending") {
      return { txHash: deps.priorTxHash, reconciled: true };
    }
    // "failed" / "not_found" → the prior attempt did not land; safe to (re)submit.
  }
  const sent = await deps.submit();
  return { txHash: sent.txHash, reconciled: false };
}
