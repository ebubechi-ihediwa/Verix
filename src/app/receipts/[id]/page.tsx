"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { getExecutionReceipt, getProofByTask, verifyProof } from "@/lib/api-client";
import { ExecutionReceipt } from "@/types/trace";
import { ProofRecord, ProofJournal } from "@/types/proof";

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbrev(hash: string, n = 8) {
  return `${hash.slice(0, n)}…${hash.slice(-n)}`;
}

function ProofStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
    verified: {
      label: "Verified",
      dot: "bg-emerald-500",
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
    },
    proven: {
      label: "Proof Ready",
      dot: "bg-violet-500",
      bg: "bg-violet-50",
      text: "text-violet-700",
      border: "border-violet-200",
    },
    running: {
      label: "Generating…",
      dot: "bg-amber-400 animate-pulse",
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
    },
    pending: {
      label: "Pending",
      dot: "bg-amber-400",
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
    },
    failed: {
      label: "Failed",
      dot: "bg-red-500",
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
    },
  };
  const s = map[status] ?? {
    label: status,
    dot: "bg-ink-muted",
    bg: "bg-surface-tertiary",
    text: "text-ink-muted",
    border: "border-border",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${s.bg} ${s.text} ${s.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function IntegrityFlag({
  label,
  ok,
  description,
}: {
  label: string;
  ok: boolean;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <span
        className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
          ok
            ? "bg-emerald-100 text-emerald-700"
            : "bg-red-100 text-red-600"
        }`}
      >
        {ok ? "✓" : "✗"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ink font-mono">{label}</p>
        <p className="text-[11px] text-ink-muted mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReceiptExplorerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params); // taskId

  const [receipt, setReceipt] = useState<ExecutionReceipt | null>(null);
  const [proof, setProof] = useState<ProofRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await getExecutionReceipt(id);
        setReceipt(r);
      } catch {
        setError("Execution receipt not found.");
        setLoading(false);
        return;
      }
      try {
        const p = await getProofByTask(id);
        setProof(p);
      } catch {
        // Proof may not exist yet — non-fatal
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleVerify() {
    if (!proof || proof.status !== "proven") return;
    setVerifying(true);
    try {
      const updated = await verifyProof(proof.id);
      setProof(updated);
      if (receipt) setReceipt({ ...receipt, status: "verified" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ink-muted">Loading receipt…</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-error mb-4">{error ?? "Unknown error"}</p>
          <Link href="/dashboard" className="text-xs text-ink-muted hover:text-ink underline">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const journal = proof?.journal as ProofJournal | undefined;

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-3 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Dashboard
        </Link>
        <span className="text-border">·</span>
        <span className="text-xs font-mono text-ink-secondary">Receipt Explorer</span>
        <span className="text-border">·</span>
        <span className="text-[10px] font-mono text-ink-muted truncate max-w-[180px]">{id}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/trace/${id}`}
            className="text-[11px] text-ink-muted hover:text-ink underline font-mono"
          >
            View Trace →
          </Link>
          {proof && <ProofStatusBadge status={proof.status} />}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* What is proven banner */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-[11px] text-violet-700">
          <span className="font-semibold">What this proves:</span> workflow integrity, trace consistency,
          budget compliance, and payment correctness.{" "}
          <span className="opacity-70">LLM inference outputs are not proven.</span>
        </div>

        {/* Receipt summary */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface border border-border rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-violet-50 to-indigo-50">
            <span className="text-xs font-semibold text-violet-700">Execution Receipt</span>
            <ProofStatusBadge status={receipt.status} />
          </div>

          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
            {[
              { label: "Receipt Hash", value: abbrev(receipt.receiptHash), full: receipt.receiptHash },
              { label: "Trace Root", value: abbrev(receipt.traceRoot), full: receipt.traceRoot },
              { label: "Input Hash", value: abbrev(receipt.taskInputHash), full: receipt.taskInputHash },
              {
                label: "Output Hash",
                value: receipt.outputHash ? abbrev(receipt.outputHash) : "—",
                full: receipt.outputHash,
              },
              {
                label: "Spend Cap",
                value: receipt.spendCap != null ? `$${Number(receipt.spendCap).toFixed(2)} USDC` : "—",
              },
              {
                label: "Total Cost",
                value: receipt.totalCost != null ? `$${Number(receipt.totalCost).toFixed(2)} USDC` : "—",
              },
              { label: "Agent Snapshots", value: `${receipt.agentVersionHashes.length} committed` },
              { label: "Created", value: new Date(receipt.createdAt).toLocaleString() },
            ].map((row) => (
              <div key={row.label} className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase tracking-wide text-ink-muted">{row.label}</span>
                <span className="text-ink-secondary truncate" title={"full" in row ? row.full ?? undefined : undefined}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Agent version hashes */}
          {receipt.agentVersionHashes.length > 0 && (
            <div className="px-5 pb-4">
              <p className="text-[9px] uppercase tracking-wide text-ink-muted mb-1.5">
                Agent Version Hashes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {receipt.agentVersionHashes.map((h) => (
                  <span
                    key={h}
                    title={h}
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-surface-secondary border border-border text-ink-secondary"
                  >
                    {h.slice(0, 12)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Payment summary */}
          {receipt.paymentSummary.length > 0 && (
            <div className="border-t border-border px-5 py-4">
              <p className="text-[9px] uppercase tracking-wide text-ink-muted mb-2">
                Payment Summary
              </p>
              <div className="space-y-1.5">
                {receipt.paymentSummary.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between font-mono text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-ink-secondary">{p.specialist}</span>
                      {p.versionHash && (
                        <span className="text-ink-muted" title={p.versionHash}>
                          v{p.agentVersion} · {p.versionHash.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-ink">${p.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Proof integrity */}
        {proof ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface border border-border rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">Proof Integrity Checks</span>
              <div className="flex items-center gap-2">
                {proof.status === "proven" && (
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="text-[11px] px-3 py-1 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {verifying ? "Verifying…" : "Verify Proof"}
                  </button>
                )}
                <ProofStatusBadge status={proof.status} />
              </div>
            </div>

            {journal ? (
              <div className="px-5 py-2">
                <IntegrityFlag
                  label="receipt_integrity"
                  ok={journal.receiptIntegrityOk}
                  description="Re-computed receiptHash matches the committed digest — inputs were not tampered."
                />
                <IntegrityFlag
                  label="spend_cap"
                  ok={journal.spendCapOk}
                  description={`Total cost $${journal.totalCost.toFixed(2)} is within the spend cap.`}
                />
                <IntegrityFlag
                  label="payment_correct"
                  ok={journal.paymentCorrect}
                  description="Payment intent amounts sum to the declared total cost."
                />
                <IntegrityFlag
                  label="agent_membership"
                  ok={journal.agentMembershipOk}
                  description="All agent version hashes are non-empty committed snapshots."
                />

                <div className="py-3 flex items-center gap-4 font-mono text-[10px] text-ink-muted">
                  <span>verifier: {journal.verifierType}</span>
                  <span>·</span>
                  <span>at: {new Date(journal.verifiedAt).toLocaleString()}</span>
                </div>
              </div>
            ) : proof.status === "failed" ? (
              <div className="px-5 py-4">
                <p className="text-xs text-error font-mono">{proof.errorMsg ?? "Proof generation failed."}</p>
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="text-xs text-ink-muted italic">
                  Proof is {proof.status} — journal not yet available.
                </p>
              </div>
            )}

            {/* Proof metadata */}
            <div className="border-t border-border px-5 py-3 flex items-center gap-4 font-mono text-[10px] text-ink-muted">
              <span title={proof.id}>proof: {proof.id.slice(0, 12)}</span>
              <span>·</span>
              <span>schema v{proof.schemaVersion}</span>
              {proof.provenAt && (
                <>
                  <span>·</span>
                  <span>proven {new Date(proof.provenAt).toLocaleString()}</span>
                </>
              )}
              {proof.verifiedAt && (
                <>
                  <span>·</span>
                  <span className="text-emerald-600">verified {new Date(proof.verifiedAt).toLocaleString()}</span>
                </>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl px-5 py-4">
            <p className="text-xs text-ink-muted italic">
              Proof not yet generated — task may still be running or PROOF_MODE is disabled.
            </p>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-ink-muted text-center px-4">
          This receipt proves workflow integrity — which agents ran, at which version, at what
          cost, and with what payments confirmed on-chain. It does not prove the correctness of
          LLM-generated content.
        </p>
      </div>
    </div>
  );
}
