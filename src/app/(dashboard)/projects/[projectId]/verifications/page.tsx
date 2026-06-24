"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Check, X, Minus } from "lucide-react";
import { useProject } from "@/components/console/ProjectContext";
import StatusPill from "@/components/console/StatusPill";
import AnchorBadge from "@/components/console/AnchorBadge";
import { listProjectVerifications } from "@/lib/console-client";
import type { ConsoleVerificationRow, VerificationConstraints } from "@/types/sdk";

const CONSTRAINTS: { key: keyof VerificationConstraints; label: string }[] = [
  { key: "receiptIntegrity", label: "Receipt" },
  { key: "spendCap", label: "Spend cap" },
  { key: "paymentCorrect", label: "Payment" },
  { key: "agentMembership", label: "Membership" },
  { key: "traceCommitment", label: "Trace" },
];

export default function VerificationsTab() {
  const { project } = useProject();
  const [rows, setRows] = useState<ConsoleVerificationRow[] | null>(null);

  useEffect(() => {
    listProjectVerifications(project.id)
      .then(setRows)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load verifications");
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
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="mb-2 text-[18px]">No verifications yet</h2>
          <p className="mx-auto max-w-[440px] text-[13px] leading-relaxed text-[var(--vc-muted)]">
            Once executions produce proofs, the 5 deterministic constraints —
            receipt integrity, spend cap, payment correctness, agent membership, and trace
            commitment — are shown here.
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
            <Th>Proof</Th>
            {CONSTRAINTS.map((c) => (
              <Th key={c.key}>{c.label}</Th>
            ))}
            <Th>Anchor</Th>
            <Th>Anchored</Th>
            <Th>Verified</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.taskId} className="border-b border-[var(--vc-line-2)] last:border-0">
              <Td><span className="vc-mono text-[var(--vc-muted)]">{r.taskId.slice(0, 8)}</span></Td>
              <Td><StatusPill status={r.status} /></Td>
              {CONSTRAINTS.map((c) => (
                <Td key={c.key}>
                  <ConstraintMark value={r.constraints ? r.constraints[c.key] : null} />
                </Td>
              ))}
              <Td><AnchorBadge status={r.anchorStatus} /></Td>
              <Td>
                <span className="text-[var(--vc-faint)]">
                  {r.anchoredAt ? new Date(r.anchoredAt).toLocaleDateString() : "—"}
                </span>
              </Td>
              <Td>
                <span className="text-[var(--vc-faint)]">
                  {r.verifiedAt ? new Date(r.verifiedAt).toLocaleDateString() : "—"}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConstraintMark({ value }: { value: boolean | null }) {
  if (value === null) return <Minus size={14} className="text-[var(--vc-faint)]" />;
  return value ? (
    <Check size={15} className="text-[var(--vc-m-teal)]" />
  ) : (
    <X size={15} className="text-[#ff9a9a]" />
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium uppercase tracking-[0.12em] text-[11px]">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}
