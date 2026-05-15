"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ExecutionTraceEvent } from "@/types/trace";

type NodeStatus = "idle" | "active" | "completed" | "failed" | "verified" | "released";

interface GraphNode {
  id: string;
  label: string;
  type: "coordinator" | "specialist" | "receipt" | "proof" | "escrow";
  status: NodeStatus;
  detail?: string;
}

interface ExecutionGraphProps {
  traceEvents: ExecutionTraceEvent[];
  taskStatus?: string | null;
}

const statusStyle: Record<NodeStatus, { border: string; dot: string; badge: string }> = {
  idle:      { border: "border-border",     dot: "bg-ink-muted/40",          badge: "text-ink-muted" },
  active:    { border: "border-indigo-400", dot: "bg-indigo-400 animate-pulse", badge: "text-indigo-600" },
  completed: { border: "border-emerald-400",dot: "bg-emerald-400",             badge: "text-emerald-700" },
  failed:    { border: "border-red-400",    dot: "bg-red-400",                 badge: "text-red-600" },
  verified:  { border: "border-violet-400", dot: "bg-violet-400",              badge: "text-violet-700" },
  released:  { border: "border-sky-400",    dot: "bg-sky-400",                 badge: "text-sky-700" },
};

const statusLabel: Record<NodeStatus, string> = {
  idle:      "waiting",
  active:    "running",
  completed: "done",
  failed:    "failed",
  verified:  "verified",
  released:  "released",
};

const typeIcon: Record<GraphNode["type"], string> = {
  coordinator: "C",
  specialist:  "A",
  receipt:     "R",
  proof:       "P",
  escrow:      "E",
};

function deriveNodes(events: ExecutionTraceEvent[], taskStatus?: string | null): GraphNode[][] {
  const coordinator: GraphNode = { id: "coord", label: "Coordinator", type: "coordinator", status: "idle" };
  const specialistMap = new Map<string, GraphNode>();
  const receipt: GraphNode = { id: "receipt", label: "Receipt", type: "receipt", status: "idle" };
  const proof: GraphNode = { id: "proof", label: "Proof", type: "proof", status: "idle" };
  const escrow: GraphNode = { id: "escrow", label: "Escrow", type: "escrow", status: "idle" };

  for (const ev of events) {
    const t = ev.eventType;
    const meta = (ev.metadata ?? {}) as Record<string, unknown>;

    // Coordinator
    if (t === "coordinator_start") coordinator.status = "active";
    if (t === "task_decomposed") coordinator.status = "active";
    if (t === "task_completed") { coordinator.status = "completed"; receipt.status = "completed"; }
    if (t === "task_failed") coordinator.status = "failed";

    // Specialists — actor is the specialist name for specialist_* events
    if (t === "specialist_assigned") {
      const name = (meta.specialistName as string) ?? ev.actor;
      if (!specialistMap.has(name)) {
        specialistMap.set(name, { id: name, label: name, type: "specialist", status: "idle" });
      }
    }
    if (t === "specialist_invoked") {
      const name = (meta.specialistName as string) ?? ev.actor;
      const node = specialistMap.get(name);
      if (node) node.status = "active";
    }
    if (t === "delegation_approved" || t === "delegation_executed") {
      const name = (meta.specialistName as string) ?? ev.actor;
      if (!specialistMap.has(name)) {
        specialistMap.set(name, {
          id: name,
          label: name,
          type: "specialist",
          status: t === "delegation_executed" ? "completed" : "active",
          detail: "delegated",
        });
      } else {
        const node = specialistMap.get(name);
        if (node) {
          node.status = t === "delegation_executed" ? "completed" : "active";
          node.detail = "delegated";
        }
      }
    }
    if (t === "specialist_completed") {
      const name = (meta.specialistName as string) ?? ev.actor;
      const node = specialistMap.get(name);
      if (node) node.status = "completed";
    }
    if (t === "specialist_failed") {
      const name = (meta.specialistName as string) ?? ev.actor;
      const node = specialistMap.get(name);
      if (node) node.status = "failed";
    }

    // Payment detail on specialist node
    if (t === "payment_confirmed") {
      const name = meta.specialistName as string | undefined;
      const amount = meta.amount as number | undefined;
      if (name && amount != null) {
        const node = specialistMap.get(name);
        if (node) node.detail = `$${Number(amount).toFixed(2)} USDC`;
      }
    }

    // Receipt
    if (t === "task_completed" && ev.outputHash) {
      receipt.detail = ev.outputHash.slice(0, 8) + "…";
    }

    // Proof
    if (t === "proof_generation_started") proof.status = "active";
    if (t === "proof_generated") proof.status = "active";
    if (t === "proof_verified") { proof.status = "verified"; proof.detail = "attested"; }
    if (t === "proof_generation_failed") proof.status = "failed";

    // Escrow
    if (t === "milestone_released") { escrow.status = "released"; escrow.detail = "settled"; }
    if (t === "milestone_release_failed") escrow.status = "failed";
  }

  if (taskStatus === "completed" && receipt.status === "idle") receipt.status = "completed";

  const specialists = [...specialistMap.values()];
  const columns: GraphNode[][] = [];

  columns.push([coordinator]);
  if (specialists.length > 0) columns.push(specialists);
  if (receipt.status !== "idle") columns.push([receipt]);
  if (proof.status !== "idle") columns.push([proof]);
  if (escrow.status !== "idle") columns.push([escrow]);

  return columns;
}

function Node({ node }: { node: GraphNode }) {
  const s = statusStyle[node.status];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`relative flex items-start gap-2 px-3 py-2.5 rounded-md border bg-surface ${s.border} min-w-[112px] max-w-[148px]`}
    >
      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="grid h-4 w-4 place-items-center border border-border bg-surface-secondary font-mono text-[8px] font-semibold text-ink-muted">
            {typeIcon[node.type]}
          </span>
          <span className="text-xs font-medium text-ink truncate">{node.label}</span>
        </div>
        <span className={`text-[9px] font-mono ${s.badge}`}>{statusLabel[node.status]}</span>
        {node.detail && (
          <p className="text-[9px] font-mono text-ink-muted truncate mt-0.5">{node.detail}</p>
        )}
      </div>
    </motion.div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center shrink-0 self-center">
      <div className="w-4 h-px bg-border" />
      <svg className="w-2 h-2 text-ink-muted/60 -ml-0.5" viewBox="0 0 8 8" fill="currentColor">
        <path d="M0 0 L8 4 L0 8 Z" />
      </svg>
    </div>
  );
}

export default function ExecutionGraph({ traceEvents, taskStatus }: ExecutionGraphProps) {
  const columns = deriveNodes(traceEvents, taskStatus);

  if (columns.length === 0 || (columns.length === 1 && columns[0][0].status === "idle")) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface-secondary/60 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <p className="verix-label mb-2.5">
          Execution DAG
        </p>
        <div className="flex items-start gap-1 overflow-x-auto pb-1">
          <AnimatePresence initial={false}>
            {columns.map((col, ci) => (
              <div key={ci} className="flex items-start gap-1 shrink-0">
                {ci > 0 && <Arrow />}
                <div className="flex flex-col gap-1.5">
                  {col.map((node) => (
                    <Node key={node.id} node={node} />
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
