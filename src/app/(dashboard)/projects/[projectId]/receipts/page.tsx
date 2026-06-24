"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ScrollText } from "lucide-react";
import { useProject } from "@/components/console/ProjectContext";
import StatusPill from "@/components/console/StatusPill";
import AnchorBadge from "@/components/console/AnchorBadge";
import { listProjectExecutions } from "@/lib/console-client";
import type { ConsoleExecutionRow } from "@/types/sdk";

function shortHash(h: string | null): string {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—";
}

export default function ReceiptsTab() {
  const { project } = useProject();
  const [rows, setRows] = useState<ConsoleExecutionRow[] | null>(null);

  useEffect(() => {
    listProjectExecutions(project.id)
      .then(setRows)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load executions");
        setRows([]);
      });
  }, [project.id]);

  if (rows === null) {
    return <div className="vc-panel h-40 animate-pulse-subtle opacity-50" />;
  }

  if (rows.length === 0) {
    return (
      <div className="vc-panel flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--vc-line)] text-[var(--vc-accent-2)]">
          <ScrollText size={20} />
        </div>
        <div>
          <h2 className="mb-2 text-[18px]">No executions yet</h2>
          <p className="mx-auto max-w-[420px] text-[13px] leading-relaxed text-[var(--vc-muted)]">
            Submit a mandate via{" "}
            <code className="vc-mono text-[var(--vc-accent-2)]">POST /api/v1/executions</code>. Each
            run produces a hash-chained receipt and proof, listed here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-panel overflow-hidden">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[var(--vc-line)] text-[var(--vc-faint)]">
            <Th>Execution</Th>
            <Th>Status</Th>
            <Th>Agent</Th>
            <Th>Receipt hash</Th>
            <Th>Proof</Th>
            <Th>Anchor</Th>
            <Th>Created</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--vc-line-2)] last:border-0">
              <Td><span className="vc-mono text-[var(--vc-muted)]">{r.id.slice(0, 8)}</span></Td>
              <Td><StatusPill status={r.status} /></Td>
              <Td><span className="text-[var(--vc-text)]">{r.agentName ?? "—"}</span></Td>
              <Td><span className="vc-mono text-[var(--vc-muted)]">{shortHash(r.receiptHash)}</span></Td>
              <Td><StatusPill status={r.proofStatus} /></Td>
              <Td><AnchorBadge status={r.receiptHash ? r.anchorStatus : null} txHash={r.anchorTxHash} /></Td>
              <Td><span className="text-[var(--vc-faint)]">{new Date(r.createdAt).toLocaleDateString()}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium uppercase tracking-[0.12em] text-[11px]">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}
