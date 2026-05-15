"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getEscrowByTask } from "@/lib/api-client";
import { Escrow, EscrowMilestone, MilestoneStatus } from "@/types/escrow";

interface EscrowTimelineProps {
  taskId: string;
}

type Step = {
  label: string;
  reached: boolean;
  active: boolean;
  failed: boolean;
};

function milestoneSteps(ms: EscrowMilestone): Step[] {
  const s = ms.status;
  return [
    {
      label: "Created",
      reached: true,
      active: s === "pending",
      failed: false,
    },
    {
      label: "Funded",
      reached: ["funded", "in_progress", "released", "refunded"].includes(s),
      active: s === "funded",
      failed: false,
    },
    {
      label: ms.releaseCondition === "proof_verified" ? "Awaiting Proof" : "In Progress",
      reached: ["in_progress", "released"].includes(s),
      active: s === "in_progress",
      failed: false,
    },
    {
      label: s === "refunded" ? "Refunded" : s === "failed" ? "Failed" : "Released",
      reached: s === "released" || s === "refunded",
      active: false,
      failed: s === "failed" || s === "refunded",
    },
  ];
}

const releaseConditionLabel: Record<string, string> = {
  proof_verified: "Proof-gated",
  receipt_ready:  "Receipt-gated",
  manual:         "Manual",
  auto:           "Auto",
};

function MilestoneRow({ ms }: { ms: EscrowMilestone }) {
  const steps = milestoneSteps(ms);

  return (
    <div className="py-2.5 border-b border-border last:border-0">
      {/* Milestone header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink truncate max-w-[120px]" title={ms.specialistId}>
            {ms.specialistId.length > 16 ? ms.specialistId.slice(0, 14) + "…" : ms.specialistId}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-tertiary border border-border font-mono text-ink-muted">
            {releaseConditionLabel[ms.releaseCondition] ?? ms.releaseCondition}
          </span>
        </div>
        <span className="text-xs font-mono font-semibold text-ink">
          ${ms.amount.toFixed(2)}
        </span>
      </div>

      {/* Step track */}
      <div className="flex items-center gap-0">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1 min-w-0">
            {/* Step dot */}
            <div className="flex flex-col items-center shrink-0">
              <motion.div
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                className={`w-3 h-3 rounded-full border-2 ${
                  step.failed
                    ? "bg-red-400 border-red-400"
                    : step.active
                    ? "bg-indigo-400 border-indigo-400 animate-pulse"
                    : step.reached
                    ? "bg-emerald-400 border-emerald-400"
                    : "bg-surface border-border"
                }`}
              />
              <span className={`text-[8px] font-mono mt-1 whitespace-nowrap ${
                step.failed ? "text-red-500" :
                step.active ? "text-indigo-600" :
                step.reached ? "text-emerald-700" :
                "text-ink-muted/50"
              }`}>
                {step.label}
              </span>
            </div>
            {/* Connector line (between dots) */}
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-1 ${step.reached ? "bg-emerald-300" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Release tx */}
      {ms.releaseTxHash && (
        <p className="text-[9px] font-mono text-ink-muted mt-1.5 truncate">
          tx: {ms.releaseTxHash.slice(0, 10)}…{ms.releaseTxHash.slice(-8)}
        </p>
      )}
    </div>
  );
}

const escrowStatusLabel: Record<string, string> = {
  pending:     "Pending",
  funded:      "Funded",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  disputed:    "Disputed",
};

const escrowStatusStyle: Record<string, string> = {
  pending:     "bg-surface-tertiary text-ink-muted",
  funded:      "bg-indigo-50 text-indigo-700 border border-indigo-200",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  completed:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled:   "bg-red-50 text-red-600 border border-red-200",
  disputed:    "bg-red-50 text-red-600 border border-red-200",
};

export default function EscrowTimeline({ taskId }: EscrowTimelineProps) {
  const [escrow, setEscrow] = useState<(Escrow & { milestones: EscrowMilestone[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getEscrowByTask(taskId);
        if (!cancelled) setEscrow(data.escrow);
      } catch {
        // escrow may not exist — silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [taskId]);

  if (loading || !escrow) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-3 border border-border rounded-xl overflow-hidden bg-surface"
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border bg-surface-secondary flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-ink-muted uppercase tracking-wide font-medium">
            Escrow · Trustless Work
          </span>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${escrowStatusStyle[escrow.status] ?? "bg-surface-tertiary text-ink-muted"}`}>
          {escrowStatusLabel[escrow.status] ?? escrow.status}
        </span>
      </div>

      {/* Summary row */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between text-xs">
        <span className="text-ink-muted">Total locked</span>
        <span className="font-mono font-semibold text-ink">${escrow.totalAmount.toFixed(2)} USDC</span>
      </div>

      {/* Milestones */}
      <div className="px-4">
        {escrow.milestones.length === 0 ? (
          <p className="text-xs text-ink-muted py-3">No milestones yet.</p>
        ) : (
          escrow.milestones.map((ms) => <MilestoneRow key={ms.id} ms={ms} />)
        )}
      </div>
    </motion.div>
  );
}
