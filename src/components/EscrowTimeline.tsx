"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getEscrowByTask, retryEscrowRelease, submitSignedEscrowTransaction, syncEscrowStatus } from "@/lib/api-client";
import { getAuthorizedWallet, signWalletTransaction } from "@/lib/wallet-connect";
import { stellarTxExplorerUrl } from "@/lib/stellar-config";
import { isDemoEscrowId, trustlessWorkEscrowViewerUrl } from "@/lib/trustless-work";
import { Escrow, EscrowMilestone, EscrowSignaturePhase } from "@/types/escrow";

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
  user_approved: "Approval-gated",
  proof_and_user_approved: "Proof + Approval",
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
  funding_pending: "Funding Pending",
  funding_failed:  "Funding Failed",
  funded:      "Funded",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  disputed:    "Disputed",
};

const escrowStatusStyle: Record<string, string> = {
  pending:     "bg-surface-tertiary text-ink-muted",
  funding_pending: "bg-amber-50 text-amber-700 border border-amber-200",
  funding_failed:  "bg-red-50 text-red-600 border border-red-200",
  funded:      "bg-indigo-50 text-indigo-700 border border-indigo-200",
  in_progress: "bg-amber-50 text-amber-700 border border-amber-200",
  completed:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  cancelled:   "bg-red-50 text-red-600 border border-red-200",
  disputed:    "bg-red-50 text-red-600 border border-red-200",
};

export default function EscrowTimeline({ taskId }: EscrowTimelineProps) {
  const [escrow, setEscrow] = useState<(Escrow & { milestones: EscrowMilestone[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingState, setSigningState] = useState<"idle" | "signing" | "submitted" | "failed">("idle");
  const [signingError, setSigningError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ at?: string; error?: string; synced?: boolean } | null>(null);
  const [retryingRelease, setRetryingRelease] = useState(false);

  async function loadEscrow(cancelled = false) {
    try {
      const data = await getEscrowByTask(taskId);
      if (!cancelled) setEscrow(data.escrow);
    } catch {
      // escrow may not exist - silently ignore
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

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

  const metadata = (escrow.metadata ?? {}) as Record<string, unknown>;
  const createXdr = typeof metadata.unsignedCreateTransaction === "string"
    ? metadata.unsignedCreateTransaction
    : "";
  const fundXdr = typeof metadata.unsignedFundTransaction === "string"
    ? metadata.unsignedFundTransaction
    : "";
  const signaturePhase: EscrowSignaturePhase | null = fundXdr ? "fund" : createXdr ? "create" : null;
  const unsignedXdr = fundXdr || createXdr;
  const canSign = escrow.status === "funding_pending" && Boolean(signaturePhase && unsignedXdr);
  const viewerUrl = trustlessWorkEscrowViewerUrl(escrow.externalId);
  const fundingTxHash = typeof metadata.fundTxHash === "string"
    ? metadata.fundTxHash
    : typeof metadata.createTxHash === "string"
      ? metadata.createTxHash
      : "";

  async function handleSignEscrow() {
    if (!escrow || !signaturePhase || !unsignedXdr) return;
    const currentEscrow = escrow;
    setSigningState("signing");
    setSigningError(null);

    try {
      const wallet = await getAuthorizedWallet();
      if (!wallet) throw new Error("Reconnect your Stellar wallet before signing escrow funding.");
      if (wallet.address !== currentEscrow.payerAddress) {
        throw new Error("Connected wallet does not match the task payer wallet.");
      }

      const signed = await signWalletTransaction(
        unsignedXdr,
        wallet.address,
        wallet.networkPassphrase
      );
      setSigningState("submitted");
      await submitSignedEscrowTransaction(currentEscrow.id, {
        signedXdr: signed.signedTxXdr,
        phase: signaturePhase,
        signerAddress: signed.signerAddress ?? wallet.address,
      });
      await loadEscrow(false);
      setSigningState("idle");
    } catch (error) {
      setSigningState("failed");
      setSigningError(error instanceof Error ? error.message : "Wallet signing failed.");
    }
  }

  async function handleSyncEscrow() {
    if (!escrow) return;
    setSyncing(true);
    try {
      const result = await syncEscrowStatus(escrow.id);
      setSyncStatus({
        at: new Date().toISOString(),
        synced: result.synced,
        error: result.error ?? undefined,
      });
      await loadEscrow(false);
    } catch (error) {
      setSyncStatus({
        at: new Date().toISOString(),
        synced: false,
        error: error instanceof Error ? error.message : "Escrow sync failed.",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleRetryRelease() {
    if (!escrow) return;
    setRetryingRelease(true);
    try {
      await retryEscrowRelease(escrow.id);
      await loadEscrow(false);
      setSyncStatus({ at: new Date().toISOString(), synced: true });
    } catch (error) {
      setSyncStatus({
        at: new Date().toISOString(),
        synced: false,
        error: error instanceof Error ? error.message : "Release retry failed.",
      });
    } finally {
      setRetryingRelease(false);
    }
  }

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
      <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
          <span className="text-ink-muted">Total locked</span>
          {escrow.externalId && isDemoEscrowId(escrow.externalId) && (
            <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[9px] text-ink-muted">demo escrow</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewerUrl && (
            <a href={viewerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium text-violet-600 underline underline-offset-2">
              View on Trustless Work
            </a>
          )}
          {fundingTxHash && (
            <a href={stellarTxExplorerUrl(fundingTxHash)} target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium text-emerald-600 underline underline-offset-2">
              Funding tx
            </a>
          )}
          <button
            type="button"
            onClick={handleSyncEscrow}
            disabled={syncing}
            className="text-[10px] font-medium text-ink-muted underline underline-offset-2 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <span className="font-mono font-semibold text-ink">${escrow.totalAmount.toFixed(2)} USDC</span>
        </div>
      </div>

      {(syncStatus || escrow.milestones.some((ms) => ms.status === "failed")) && (
        <div className="border-b border-border px-4 py-2 text-[10px] text-ink-muted">
          <div className="flex items-center justify-between gap-3">
            <span>
              {syncStatus?.error
                ? `Sync/recovery error: ${syncStatus.error}`
                : syncStatus?.at
                  ? `Last checked ${new Date(syncStatus.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${syncStatus.synced ? " - synced" : " - local/demo"}`
                  : "Release retry available for failed milestones."}
            </span>
            {escrow.milestones.some((ms) => ms.status === "failed") && (
              <button
                type="button"
                onClick={handleRetryRelease}
                disabled={retryingRelease}
                className="shrink-0 rounded border border-border px-2 py-1 text-[10px] font-medium text-ink disabled:opacity-50"
              >
                {retryingRelease ? "Retrying..." : "Retry release"}
              </button>
            )}
          </div>
        </div>
      )}

      {canSign && (
        <div className="px-4 py-3 border-b border-border bg-amber-50/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">Wallet signature required</p>
              <p className="mt-1 text-[11px] text-ink-muted">
                Review and sign the Trustless Work {signaturePhase === "create" ? "deployment" : "funding"} transaction before agent execution proceeds.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignEscrow}
              disabled={signingState === "signing" || signingState === "submitted"}
              className="shrink-0 rounded-md border border-ink bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingState === "signing"
                ? "Signing..."
                : signingState === "submitted"
                  ? "Submitting..."
                  : signaturePhase === "create"
                    ? "Sign deploy"
                    : "Sign funding"}
            </button>
          </div>
          <div className="mt-3 grid gap-1.5 text-[10px]">
            <div className="flex justify-between gap-3">
              <span className="text-ink-muted">Payer</span>
              <span className="font-mono text-ink truncate">{escrow.payerAddress}</span>
            </div>
            {escrow.milestones.slice(0, 3).map((ms) => (
              <div key={ms.id} className="flex justify-between gap-3">
                <span className="text-ink-muted truncate">{ms.specialistId}</span>
                <span className="font-mono text-ink truncate">
                  ${ms.amount.toFixed(2)} -&gt; {ms.recipientAddress.slice(0, 8)}...{ms.recipientAddress.slice(-6)}
                </span>
              </div>
            ))}
          </div>
          {signingError && (
            <p className="mt-2 text-[10px] text-red-600">{signingError}</p>
          )}
        </div>
      )}

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
