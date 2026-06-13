"use client";

/**
 * Hash-chain visualizer for execution trace pages.
 * Renders each ExecutionTraceEvent with its hash, sequence, and linkage
 * so the tamper-evident chain structure is visible at a glance.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { ExecutionTraceEvent } from "@/types/trace";

function abbrev(hash: string, n = 8): string {
  if (!hash || hash.length < n * 2) return hash;
  return `${hash.slice(0, n)}…${hash.slice(-4)}`;
}

const EVENT_COLORS: Record<string, string> = {
  coordinator_start:    "#818cf8",
  coordinator_complete: "#4ade80",
  task_failed:          "#f87171",
  subtask_assigned:     "#a78bfa",
  specialist_invoked:   "#c084fc",
  specialist_completed: "#4ade80",
  specialist_failed:    "#f87171",
  blend_supply_initiated:   "#4ade80",
  blend_supply_confirmed:   "#4ade80",
  blend_withdraw_initiated: "#fbbf24",
  blend_withdraw_confirmed: "#fbbf24",
  blend_rate_check:         "#6ee7b7",
  soroswap_swap_initiated:  "#fbbf24",
  soroswap_swap_confirmed:  "#fbbf24",
  soroswap_quote_fetched:   "#fde68a",
  aquarius_liquidity_added: "#818cf8",
  aquarius_liquidity_removed: "#c4b5fd",
  aquarius_fees_claimed:    "#a5b4fc",
  payment_submitted:        "#38bdf8",
  payment_settled:          "#4ade80",
  anchor_route_selected:    "#7dd3fc",
  task_completed:           "#4ade80",
};

function getColor(eventType: string): string {
  return EVENT_COLORS[eventType] ?? "#64748b";
}

interface ChainNodeProps {
  event: ExecutionTraceEvent;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function ChainNode({ event, isFirst, isLast, expanded, onToggle }: ChainNodeProps) {
  const color = getColor(event.eventType);

  return (
    <div className="relative flex gap-3">
      {/* Vertical connector */}
      <div className="flex flex-col items-center" style={{ width: 24, flexShrink: 0 }}>
        {/* Dot */}
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: color, border: "2px solid rgba(0,0,0,0.12)",
          flexShrink: 0, marginTop: 10, zIndex: 1,
        }} />
        {/* Line below (connector to next) */}
        {!isLast && (
          <div style={{ flex: 1, width: 1, background: "var(--color-border)", marginTop: 2 }} />
        )}
      </div>

      {/* Card */}
      <div className="flex-1 min-w-0 pb-3">
        <button
          onClick={onToggle}
          className="w-full text-left"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] font-bold" style={{ color: "var(--color-ink-muted)" }}>
                  #{event.sequence}
                </span>
                <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{
                  color, background: `${color}14`, border: `1px solid ${color}28`,
                }}>
                  {event.eventType}
                </span>
                {isFirst && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                    genesis
                  </span>
                )}
                {isLast && !isFirst && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.1)", color: "#16834f" }}>
                    root
                  </span>
                )}
              </div>
              <p className="text-xs text-ink mt-1 leading-snug font-medium line-clamp-1">{event.displayMessage}</p>
            </div>
            {expanded ? (
              <ChevronDown size={12} className="text-ink-muted shrink-0 mt-1.5" />
            ) : (
              <ChevronRight size={12} className="text-ink-muted shrink-0 mt-1.5" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="mt-2 ml-0 space-y-1.5 border border-border rounded-md bg-surface-secondary p-3">
            <HashRow label="eventHash" value={event.eventHash} isRoot={isLast} />
            {event.prevEventHash && event.prevEventHash !== "0000000000000000000000000000000000000000000000000000000000000000" && (
              <div className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                <Link2 size={10} className="shrink-0" />
                <span className="font-mono">← {abbrev(event.prevEventHash, 10)}</span>
              </div>
            )}
            <HashRow label="inputHash" value={event.inputHash} />
            <HashRow label="outputHash" value={event.outputHash} />
            <div className="flex justify-between text-[10px] pt-1 border-t border-border">
              <span className="text-ink-muted">actor</span>
              <span className="font-mono text-ink">{event.actor}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-ink-muted">timestamp</span>
              <span className="font-mono text-ink">{new Date(event.timestamp).toISOString().replace("T", " ").slice(0, 22)}Z</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HashRow({ label, value, isRoot }: { label: string; value?: string | null; isRoot?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 text-[10px]">
      <span className="text-ink-muted shrink-0 font-mono">{label}</span>
      <span className={`font-mono break-all text-right ${isRoot ? "text-emerald-700 font-semibold" : "text-ink"}`}>
        {abbrev(value, 12)}
        {isRoot && <span className="ml-1 text-[9px] font-bold text-emerald-600">← trace root</span>}
      </span>
    </div>
  );
}

interface Props {
  events: ExecutionTraceEvent[];
}

export default function HashChainVisualizer({ events }: Props) {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  function toggle(seq: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }

  function toggleAll() {
    if (allExpanded) {
      setExpandedSet(new Set());
      setAllExpanded(false);
    } else {
      setExpandedSet(new Set(sorted.map((e) => e.sequence)));
      setAllExpanded(true);
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="verix-panel text-center py-8">
        <p className="text-sm text-ink-muted">No trace events to visualize.</p>
      </div>
    );
  }

  const traceRoot = sorted[sorted.length - 1].eventHash;

  return (
    <div className="verix-panel">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="verix-label mb-1">Hash-chain visualizer</p>
          <p className="text-xs text-ink-muted">{sorted.length} events · tamper-evident linkage</p>
        </div>
        <div className="flex items-center gap-2">
          {traceRoot && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-surface-secondary">
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink-muted">root</span>
              <span className="font-mono text-[10px] text-ink">{abbrev(traceRoot, 8)}</span>
            </div>
          )}
          <button
            onClick={toggleAll}
            className="verix-control text-xs px-3 py-1.5"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      <div className="max-h-[520px] overflow-y-auto pr-1">
        {sorted.map((event, i) => (
          <ChainNode
            key={event.sequence}
            event={event}
            isFirst={i === 0}
            isLast={i === sorted.length - 1}
            expanded={expandedSet.has(event.sequence)}
            onToggle={() => toggle(event.sequence)}
          />
        ))}
      </div>
    </div>
  );
}
