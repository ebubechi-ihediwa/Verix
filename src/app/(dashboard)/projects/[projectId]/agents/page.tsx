"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { useProject } from "@/components/console/ProjectContext";
import StatusPill from "@/components/console/StatusPill";
import { listProjectAgents } from "@/lib/console-client";
import type { AgentResponse } from "@/types/sdk";

function shortWallet(w: string): string {
  return w && w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w || "—";
}

export default function AgentsTab() {
  const { project } = useProject();
  const [agents, setAgents] = useState<AgentResponse[] | null>(null);

  useEffect(() => {
    listProjectAgents(project.id)
      .then(setAgents)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load agents");
        setAgents([]);
      });
  }, [project.id]);

  if (agents === null) {
    return <div className="vc-panel h-40 animate-pulse-subtle opacity-50" />;
  }

  if (agents.length === 0) {
    return (
      <div className="vc-panel flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--vc-line)] text-[var(--vc-accent-2)]">
          <Bot size={20} />
        </div>
        <div>
          <h2 className="mb-2 text-[18px]">No agents yet</h2>
          <p className="mx-auto max-w-[420px] text-[13px] leading-relaxed text-[var(--vc-muted)]">
            Deploy a project agent via the SDK gateway:{" "}
            <code className="vc-mono text-[var(--vc-accent-2)]">POST /api/v1/agents</code> with your
            project API key. Agents you create will appear here.
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
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Wallet</Th>
            <Th>Price</Th>
            <Th>Status</Th>
            <Th>Created</Th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} className="border-b border-[var(--vc-line-2)] last:border-0">
              <Td><span className="text-[var(--vc-text)]">{a.name}</span></Td>
              <Td>
                {a.agentType ? (
                  <span className="vc-chip vc-chip-accent">{a.agentType}</span>
                ) : (
                  <span className="text-[var(--vc-faint)]">llm</span>
                )}
              </Td>
              <Td><span className="vc-mono text-[var(--vc-muted)]">{shortWallet(a.walletAddress)}</span></Td>
              <Td><span className="vc-mono">{a.price.toFixed(2)} USDC</span></Td>
              <Td><StatusPill status={a.status} /></Td>
              <Td><span className="text-[var(--vc-faint)]">{new Date(a.createdAt).toLocaleDateString()}</span></Td>
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
