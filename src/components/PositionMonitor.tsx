"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, TrendingUp, ArrowRightLeft, Droplets, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { getTaskHistory } from "@/lib/api-client";
import { Task } from "@/types/task";

type Protocol = "blend" | "soroswap" | "aquarius" | "anchor";

interface Position {
  taskId: string;
  protocol: Protocol;
  action: string;
  summary: string;
  amount?: string;
  timestamp: string;
  status: "completed" | "failed";
}

const PROTOCOL_META: Record<Protocol, { icon: React.ReactNode; color: string; label: string }> = {
  blend:    { icon: <TrendingUp size={13} />, color: "#4ade80", label: "Blend" },
  soroswap: { icon: <ArrowRightLeft size={13} />, color: "#fbbf24", label: "Soroswap" },
  aquarius: { icon: <Droplets size={13} />, color: "#818cf8", label: "Aquarius" },
  anchor:   { icon: <ArrowUpRight size={13} />, color: "#38bdf8", label: "Anchor" },
};

function detectProtocol(desc: string): Protocol | null {
  const d = desc.toLowerCase();
  if (d.includes("blend") || d.includes("supply") || d.includes("lending")) return "blend";
  if (d.includes("soroswap") || d.includes("swap") || d.includes("slippage")) return "soroswap";
  if (d.includes("aquarius") || d.includes("liquidity") || d.includes("amm") || d.includes("pool")) return "aquarius";
  if (d.includes("anchor") || d.includes("cross-border") || d.includes("payment")) return "anchor";
  return null;
}

function extractPositionData(task: Task): Position | null {
  const protocol = detectProtocol(task.description);
  if (!protocol) return null;

  const action = task.description.slice(0, 60) + (task.description.length > 60 ? "…" : "");
  const summary = task.result
    ? (typeof task.result.summary === "string" ? task.result.summary : action)
    : action;

  return {
    taskId: task.id,
    protocol,
    action,
    summary,
    timestamp: task.completedAt ?? task.createdAt,
    status: task.status === "completed" ? "completed" : "failed",
  };
}

function timeAgo(iso: string): string {
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 60) return `${Math.round(delta)}s ago`;
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

interface Props {
  /** If provided, also highlight this recently-active task */
  activeTaskId?: string | null;
}

export default function PositionMonitor({ activeTaskId }: Props) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const tasks = await getTaskHistory();
        if (cancelled) return;
        const extracted = tasks
          .map(extractPositionData)
          .filter((p): p is Position => p !== null)
          .slice(0, 8);
        setPositions(extracted);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [activeTaskId]);

  if (loading) {
    return (
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.25)" }}>
        <LoaderCircle size={13} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 12 }}>Loading positions…</span>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", margin: 0 }}>
          No DeFi positions yet. Submit a mandate to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>
          Recent positions
        </span>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.2)" }}>{positions.length}</span>
      </div>
      <div>
        {positions.map((pos, i) => {
          const meta = PROTOCOL_META[pos.protocol];
          const isActive = pos.taskId === activeTaskId;
          return (
            <Link
              key={pos.taskId}
              href={`/trace/${pos.taskId}`}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "11px 16px",
                borderBottom: i < positions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                textDecoration: "none",
                background: isActive ? "rgba(99,102,241,0.06)" : "transparent",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = isActive ? "rgba(99,102,241,0.06)" : "transparent"; }}
            >
              {/* Protocol icon pill */}
              <div style={{
                width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                background: `${meta.color}12`,
                border: `1px solid ${meta.color}28`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: meta.color, marginTop: 1,
              }}>
                {meta.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#eef0f8", lineHeight: 1.3 }}>{meta.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    {isActive && (
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block",
                        boxShadow: "0 0 6px #4ade80",
                      }} />
                    )}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{timeAgo(pos.timestamp)}</span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", margin: 0, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pos.summary}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
