"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExecutionGraph from "@/components/ExecutionGraph";
import EscrowTimeline from "@/components/EscrowTimeline";
import {
  DEMO_EXPECTED_FLOW,
  DEMO_GOLDEN_PROMPT,
  DEMO_SPEND_CAP_USDC,
  DEMO_TASK_ID,
} from "@/lib/demo-scenario";
import { getProofByTask, getTaskStatus, submitTask, verifyProof } from "@/lib/api-client";
import { ProofRecord } from "@/types/proof";
import { Task } from "@/types/task";
import { ExecutionTraceEvent } from "@/types/trace";

const FALLBACK_TASK_ID = "demo-preview";

function previewEvents(): ExecutionTraceEvent[] {
  const now = new Date().toISOString();
  const eventTypes: Array<[ExecutionTraceEvent["eventType"], string, string, Record<string, unknown>?]> = [
    ["coordinator_start", "coordinator", "Coordinator received the golden prompt", undefined],
    ["task_decomposed", "coordinator", "Router selected three specialist agents", {
      specialists: ["CodeAuditor", "MarketAnalyst", "CreativeWriter"],
    }],
    ["specialist_assigned", "CodeAuditor", "CodeAuditor assigned", { specialistName: "CodeAuditor", amount: 1 }],
    ["specialist_assigned", "MarketAnalyst", "MarketAnalyst assigned", { specialistName: "MarketAnalyst", amount: 0.75 }],
    ["specialist_assigned", "CreativeWriter", "CreativeWriter assigned", { specialistName: "CreativeWriter", amount: 0.5 }],
    ["payment_confirmed", "payment", "Trustless Work payout intents committed", { specialistName: "CodeAuditor", amount: 1 }],
    ["specialist_completed", "CodeAuditor", "CodeAuditor delivered security findings", { specialistName: "CodeAuditor" }],
    ["specialist_completed", "MarketAnalyst", "MarketAnalyst delivered market analysis", { specialistName: "MarketAnalyst" }],
    ["specialist_completed", "CreativeWriter", "CreativeWriter delivered launch memo", { specialistName: "CreativeWriter" }],
    ["task_completed", "coordinator", "Receipt generated from trace root and payment summary", undefined],
    ["proof_generation_started", "system", "Workflow proof generation started", undefined],
    ["proof_verified", "system", "Receipt integrity proof verified", undefined],
    ["milestone_released", "coordinator", "Proof-gated escrow milestone released", undefined],
  ];

  return eventTypes.map(([eventType, actor, displayMessage, metadata], sequence) => ({
    id: `preview-${sequence}`,
    taskId: FALLBACK_TASK_ID,
    sequence,
    eventType,
    actor,
    displayMessage,
    eventHash: `preview_hash_${sequence.toString().padStart(2, "0")}`,
    prevEventHash: sequence > 0 ? `preview_hash_${(sequence - 1).toString().padStart(2, "0")}` : undefined,
    metadata,
    timestamp: now,
  }));
}

function statusTone(status?: string) {
  if (status === "completed" || status === "verified" || status === "proven") return "border-emerald-300 text-emerald-700 bg-emerald-50";
  if (status === "failed") return "border-red-300 text-red-700 bg-red-50";
  if (status === "running" || status === "processing" || status === "decomposing") return "border-indigo-300 text-indigo-700 bg-indigo-50";
  return "border-border text-ink-muted bg-surface-secondary";
}

export default function DemoPage() {
  const [taskId, setTaskId] = useState<string>(DEMO_TASK_ID);
  const [task, setTask] = useState<Task | null>(null);
  const [proof, setProof] = useState<ProofRecord | null>(null);
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTask = useCallback(async (id: string) => {
    try {
      const loaded = await getTaskStatus(id);
      setTask(loaded);
      setError(null);
      const loadedProof = await getProofByTask(id).catch(() => null);
      setProof(loadedProof);
    } catch (err) {
      setTask(null);
      setProof(null);
      setError(err instanceof Error ? err.message : "Demo task not found");
    }
  }, []);

  useEffect(() => {
    loadTask(taskId);
  }, [loadTask, taskId]);

  useEffect(() => {
    if (!taskId || task?.status === "completed" || task?.status === "failed") return;
    const timer = window.setInterval(() => loadTask(taskId), 1500);
    return () => window.clearInterval(timer);
  }, [loadTask, task?.status, taskId]);

  const traceEvents = useMemo(() => {
    if (task?.traceEvents && task.traceEvents.length > 0) return task.traceEvents;
    return previewEvents();
  }, [task?.traceEvents]);

  const activeStep = useMemo(() => {
    const eventTypes = new Set(traceEvents.map((event) => event.eventType));
    if (eventTypes.has("milestone_released")) return 7;
    if (eventTypes.has("proof_verified")) return 6;
    if (eventTypes.has("proof_generation_started")) return 5;
    if (eventTypes.has("task_completed")) return 4;
    if (eventTypes.has("specialist_completed")) return 3;
    if (eventTypes.has("spend_cap_check")) return 2;
    if (eventTypes.has("task_decomposed")) return 1;
    return 0;
  }, [traceEvents]);

  const startDemo = async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await submitTask({
        description: DEMO_GOLDEN_PROMPT,
        spendCap: DEMO_SPEND_CAP_USDC,
      });
      setTaskId(response.task_id);
      await loadTask(response.task_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start demo");
    } finally {
      setStarting(false);
    }
  };

  const verifyCurrentProof = async () => {
    if (!proof || proof.status !== "proven") return;
    setVerifying(true);
    try {
      const updated = await verifyProof(proof.id);
      setProof(updated);
      await loadTask(taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const isPreview = !task || traceEvents[0]?.taskId === FALLBACK_TASK_ID;
  const receipt = task?.receipt;

  return (
    <main className="min-h-screen bg-surface-secondary text-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Verix Live Demo</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Proof-backed autonomous work</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-secondary transition-colors hover:border-border-strong hover:text-ink"
            >
              Dashboard
            </Link>
            <button
              onClick={() => loadTask(DEMO_TASK_ID)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-secondary transition-colors hover:border-border-strong hover:text-ink"
            >
              Load Seed
            </button>
            <button
              onClick={startDemo}
              disabled={starting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {starting ? "Starting..." : "Start Golden Path"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        <section className="grid flex-1 grid-cols-1 gap-4 py-5 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-medium text-ink-muted">Execution Graph</p>
                <p className="mt-1 max-w-3xl text-sm text-ink-secondary">{DEMO_GOLDEN_PROMPT}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone(task?.status)}`}>
                {isPreview ? "Fallback Preview" : task?.status ?? "pending"}
              </span>
            </div>

            <div className="flex-1 overflow-auto bg-surface-secondary/40">
              <div className="p-4">
                <div className="rounded-xl border border-border bg-surface shadow-sm">
                  <ExecutionGraph traceEvents={traceEvents} taskStatus={task?.status ?? "completed"} />
                </div>
              </div>

              <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Proof</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{proof?.status ?? (isPreview ? "preview verified" : "not generated")}</p>
                      <p className="mt-1 max-w-sm truncate text-xs font-mono text-ink-muted">
                        {proof?.receiptHash ?? receipt?.receiptHash ?? "receipt pending"}
                      </p>
                    </div>
                    {proof?.status === "proven" && (
                      <button
                        onClick={verifyCurrentProof}
                        disabled={verifying}
                        className="rounded-lg bg-ink px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
                      >
                        {verifying ? "Verifying..." : "Verify"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Receipt</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-ink-muted">Spend</p>
                      <p className="font-mono font-semibold">${(receipt?.totalCost ?? task?.totalCost ?? 2.25).toFixed(2)} USDC</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-muted">Trace Events</p>
                      <p className="font-mono font-semibold">{traceEvents.length}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-ink-muted">Trace Root</p>
                      <p className="truncate font-mono text-xs">{receipt?.traceRoot ?? traceEvents.at(-1)?.eventHash}</p>
                    </div>
                  </div>
                </div>
              </div>

              {taskId && !isPreview && (
                <div className="px-4 pb-4">
                  <EscrowTimeline taskId={taskId} />
                </div>
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Walkthrough</p>
              <div className="mt-4 space-y-3">
                {DEMO_EXPECTED_FLOW.map((step, index) => {
                  const reached = index <= activeStep;
                  return (
                    <div key={step} className="flex gap-3">
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-mono ${
                        reached ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-border bg-surface-secondary text-ink-muted"
                      }`}>
                        {index + 1}
                      </div>
                      <p className={`text-sm leading-6 ${reached ? "text-ink" : "text-ink-muted"}`}>{step}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Run State</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Task ID</span>
                  <span className="max-w-[220px] truncate font-mono">{taskId}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Mode</span>
                  <span>{isPreview ? "labeled fallback" : "real execution"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Spend Cap</span>
                  <span className="font-mono">${DEMO_SPEND_CAP_USDC.toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Settlement</span>
                  <span>Trustless Work</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Network</span>
                  <span>Stellar Testnet</span>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
