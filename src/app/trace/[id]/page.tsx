"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { getExecutionTrace, getExecutionReceipt } from "@/lib/api-client";
import { ExecutionTraceEvent, ExecutionReceipt } from "@/types/trace";
import HashChainVisualizer from "@/components/HashChainVisualizer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TraceResponse {
  taskId: string;
  status: string;
  eventCount: number;
  traceRoot: string | null;
  events: ExecutionTraceEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbrev(hash: string, n = 8): string {
  return `${hash.slice(0, n)}…${hash.slice(-n)}`;
}

function statusColor(eventType: string): string {
  if (eventType.includes("failed") || eventType.includes("exceeded"))
    return "bg-error";
  if (eventType.includes("confirmed") || eventType.includes("completed"))
    return "bg-success";
  if (
    eventType.includes("initiated") ||
    eventType.includes("invoked") ||
    eventType.includes("assigned")
  )
    return "bg-warning";
  return "bg-ink-muted";
}

function actorBadgeClass(actor: string): string {
  if (actor === "coordinator")
    return "bg-violet-50 text-violet-700 border-violet-200";
  if (actor === "payment") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-sky-50 text-sky-700 border-sky-200";
}

function proofStatusLabel(status: string) {
  if (status === "proof_ready") return { label: "Proof Ready", cls: "verix-status", style: { color: "var(--color-brand-600)", background: "#ede9fe", borderColor: "#c4b5fd" } };
  if (status === "verified") return { label: "Verified", cls: "verix-status verix-status-success", style: undefined };
  return { label: "Pending", cls: "verix-status verix-status-neutral", style: undefined };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [receipt, setReceipt] = useState<ExecutionReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const traceData = await getExecutionTrace(id);
        setTrace(traceData);
      } catch {
        setError("Execution not found or trace data unavailable.");
        setLoading(false);
        return;
      }

      // Receipt may not exist for in-progress or failed tasks — fetch optimistically
      try {
        const receiptData = await getExecutionReceipt(id);
        setReceipt(receiptData);
      } catch {
        // Non-fatal — execution may still be running
      }

      setLoading(false);
    }
    load();
  }, [id]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ink-muted">Loading trace…</p>
        </div>
      </div>
    );
  }

  if (error || !trace) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-error mb-4">{error ?? "Unknown error"}</p>
          <Link
            href="/dashboard"
            className="text-xs text-ink-muted hover:text-ink underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const proofStatus = receipt ? proofStatusLabel(receipt.status) : null;

  // ── Page layout ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-3 flex items-center gap-4">
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
        <span className="text-xs font-mono text-ink-secondary">
          Execution Trace
        </span>
        <span className="text-border">·</span>
        <span className="text-[10px] font-mono text-ink-muted">{id}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={
            trace.status === "completed" ? "verix-status verix-status-success" :
            trace.status === "failed" ? "verix-status verix-status-error" :
            "verix-status verix-status-warning"
          }>
            {trace.status}
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Receipt summary card */}
        {receipt ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface border border-border rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-border bg-surface-secondary flex items-center justify-between">
              <span className="text-xs font-semibold text-violet-700">Execution Receipt</span>
              {proofStatus && (
                <span className={proofStatus.cls} style={proofStatus.style}>
                  {proofStatus.label}
                </span>
              )}
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
              {[
                { label: "Receipt Hash", value: abbrev(receipt.receiptHash), full: receipt.receiptHash },
                { label: "Trace Root", value: abbrev(receipt.traceRoot), full: receipt.traceRoot },
                { label: "Input Hash", value: abbrev(receipt.taskInputHash), full: receipt.taskInputHash },
                { label: "Output Hash", value: receipt.outputHash ? abbrev(receipt.outputHash) : "—", full: receipt.outputHash },
                { label: "Spend Cap", value: receipt.spendCap != null ? `$${Number(receipt.spendCap).toFixed(2)} USDC` : "—", full: undefined },
                { label: "Total Cost", value: receipt.totalCost != null ? `$${Number(receipt.totalCost).toFixed(2)} USDC` : "—", full: undefined },
                { label: "Agent Snapshots", value: `${receipt.agentVersionHashes.length} committed`, full: undefined },
                { label: "Soroban Anchor", value: receipt.anchorContractId ? abbrev(receipt.anchorContractId, 6) : "—", full: receipt.anchorContractId },
                { label: "Created", value: new Date(receipt.createdAt).toLocaleString(), full: undefined },
              ].map((row) => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-wide text-ink-muted">{row.label}</span>
                  <span
                    className="text-ink-secondary truncate"
                    title={row.full ?? undefined}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Agent version hashes */}
            {receipt.agentVersionHashes.length > 0 && (
              <div className="px-5 pb-4">
                <p className="text-[9px] uppercase tracking-wide text-ink-muted mb-1.5">Agent Version Hashes</p>
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
                <p className="text-[9px] uppercase tracking-wide text-ink-muted mb-2">Payment Summary</p>
                <div className="space-y-1.5">
                  {receipt.paymentSummary.map((p, i) => (
                    <div key={i} className="flex items-center justify-between font-mono text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-secondary">{p.specialist}</span>
                        {p.versionHash && (
                          <span className="text-ink-muted" title={p.versionHash}>
                            v{p.agentVersion} · {p.versionHash.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {p.txHash && (
                          <span className="text-ink-muted" title={p.txHash}>
                            tx:{p.txHash.slice(0, 8)}
                          </span>
                        )}
                        <span className="font-semibold text-ink">${p.amount.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="bg-surface border border-border rounded-2xl px-5 py-4">
            <p className="text-xs text-ink-muted italic">
              Receipt not yet available — task may still be running.
            </p>
          </div>
        )}

        {/* Trace event chain */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-ink uppercase tracking-wide">
              Event Chain
            </h2>
            <span className="text-[10px] text-ink-muted font-mono">
              {trace.eventCount} event{trace.eventCount !== 1 ? "s" : ""}
              {trace.traceRoot && (
                <span className="ml-2" title={trace.traceRoot}>
                  · root {trace.traceRoot.slice(0, 8)}
                </span>
              )}
            </span>
          </div>

          {trace.events.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl px-5 py-4">
              <p className="text-xs text-ink-muted italic">No trace events recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trace.events.map((ev, i) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.6) }}
                  className="bg-surface border border-border rounded-xl px-4 py-3"
                >
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    {/* Sequence + status dot */}
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(ev.eventType)}`} />
                      <span className="text-[10px] font-mono text-ink-muted w-4 text-right">{ev.sequence}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium border ${actorBadgeClass(ev.actor)}`}>
                          {ev.actor}
                        </span>
                        <span className="text-xs font-medium text-ink-secondary font-mono">{ev.eventType}</span>
                      </div>
                      <p className="text-xs text-ink-secondary">{ev.displayMessage}</p>
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-ink-muted shrink-0 font-mono">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>

                  {/* Hash chain row */}
                  <div className="mt-2 ml-7 flex items-center gap-2 font-mono text-[9px] text-ink-muted/70">
                    <span title={ev.eventHash}>{ev.eventHash.slice(0, 16)}</span>
                    {ev.prevEventHash && (
                      <>
                        <span className="text-ink-muted/40">← prev</span>
                        <span title={ev.prevEventHash}>{ev.prevEventHash.slice(0, 16)}</span>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Hash-chain visualizer */}
        {trace.events.length > 0 && (
          <HashChainVisualizer events={trace.events} />
        )}
      </div>
    </div>
  );
}
