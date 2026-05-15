"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, LoaderCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TaskResult } from "@/types/task";
import { ExecutionReceipt } from "@/types/trace";
import { ProofRecord } from "@/types/proof";
import { approveTaskResult, getProofByTask, verifyProof } from "@/lib/api-client";
import { getAuthorizedWallet } from "@/lib/wallet-connect";
import EscrowTimeline from "@/components/EscrowTimeline";
import { stellarTxExplorerUrl } from "@/lib/stellar-config";

export type ChatMessageRole =
    | "user"
    | "coordinator"
    | "specialist"
    | "payment"
    | "system"
    | "result"
    | "thinking";

export interface ThinkingStep {
    message: string;
    status: "info" | "success" | "error" | "pending";
    type: string;
    timestamp: string;
    // Trace fields — present when the step originates from an ExecutionTraceEvent
    actor?: string;
    eventType?: string;
    eventHash?: string;
    sequence?: number;
}

export interface ChatMessageData {
    id: string;
    role: ChatMessageRole;
    content: string;
    timestamp: string;
    status?: "info" | "success" | "error" | "pending";
    specialistName?: string;
    result?: TaskResult;
    taskId?: string;
    receipt?: ExecutionReceipt;
    walletAddress?: string;
    approvalStatus?: "pending" | "approved";
    approvedAt?: string;
    approvedByWallet?: string;
    approvalResultHash?: string;
    thinkingSteps?: ThinkingStep[];
    thinkingDuration?: number;
}

const roleConfig: Record<
    ChatMessageRole,
    { label: string; bubbleClass: string }
> = {
    user: {
        label: "You",
        bubbleClass:
            "bg-accent text-white ml-auto rounded-2xl rounded-br-md",
    },
    coordinator: {
        label: "Verix",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl rounded-bl-md",
    },
    specialist: {
        label: "Verix",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl rounded-bl-md",
    },
    payment: {
        label: "Verix",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl rounded-bl-md",
    },
    system: {
        label: "System",
        bubbleClass: "",
    },
    result: {
        label: "Verix",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl",
    },
    thinking: {
        label: "Verix",
        bubbleClass: "",
    },
};

// Shared message entrance animation
const msgVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

function VerixAvatar({ size = 32 }: { size?: number }) {
    return (
        <div
            className="shrink-0 border border-ink bg-ink text-white grid place-items-center font-mono font-semibold"
            style={{ width: size, height: size }}
        >
            <span style={{ fontSize: Math.max(9, Math.floor(size / 3)) }}>VX</span>
        </div>
    );
}

interface ChatMessageProps {
    message: ChatMessageData;
}

export default function ChatMessage({ message }: ChatMessageProps) {
    const config = roleConfig[message.role];

    // --- System messages: centered, muted ---
    if (message.role === "system") {
        return (
            <motion.div
                variants={msgVariants}
                initial="hidden"
                animate="visible"
                className="flex justify-center py-2"
            >
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-tertiary border border-border">
                    <VerixAvatar size={16} />
                    <span
                        className={`text-xs ${message.status === "error"
                            ? "text-error"
                            : "text-ink-muted"
                            }`}
                    >
                        {message.content}
                    </span>
                </div>
            </motion.div>
        );
    }

    // --- User messages: right-aligned ---
    if (message.role === "user") {
        return (
            <motion.div
                variants={msgVariants}
                initial="hidden"
                animate="visible"
                className="flex justify-end py-2 pl-16"
            >
                <div className={`max-w-[80%] px-4 py-3 ${config.bubbleClass}`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-[10px] opacity-60 mt-1.5 text-right">
                        {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </p>
                </div>
            </motion.div>
        );
    }

    // --- Result message: full-width rich card ---
    if (message.role === "result" && message.result) {
        return (
            <ResultCard
                result={message.result}
                taskId={message.taskId}
                receipt={message.receipt}
                walletAddress={message.walletAddress}
                approvalStatus={message.approvalStatus}
                approvedAt={message.approvedAt}
                approvedByWallet={message.approvedByWallet}
                approvalResultHash={message.approvalResultHash}
            />
        );
    }

    // --- Thinking block: collapsible process steps ---
    if (message.role === "thinking") {
        return <ThinkingBlock message={message} />;
    }

    // --- Agent messages: left-aligned with avatar ---
    return (
        <motion.div
            variants={msgVariants}
            initial="hidden"
            animate="visible"
            className="flex gap-3 py-2 pr-16"
        >
            {/* Avatar */}
            <VerixAvatar />

            {/* Bubble */}
            <div className={`max-w-[85%] px-4 py-3 ${config.bubbleClass}`}>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-ink-secondary">
                        {message.specialistName || config.label}
                    </span>
                    {message.status && (
                        <span
                            className={`w-1.5 h-1.5 rounded-full ${message.status === "success"
                                ? "bg-success"
                                : message.status === "error"
                                    ? "bg-error"
                                    : message.status === "pending"
                                        ? "bg-warning"
                                        : "bg-ink-muted"
                                }`}
                        />
                    )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-[10px] text-ink-muted mt-1.5">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </p>
            </div>
        </motion.div>
    );
}

// ---------- Thinking Block (collapsible process steps) ----------
function ThinkingBlock({ message }: { message: ChatMessageData }) {
    const [isOpen, setIsOpen] = useState(false);
    const steps = message.thinkingSteps || [];
    const duration = message.thinkingDuration;
    const isComplete = duration !== undefined;

    const statusDotColor = (status: string) => {
        switch (status) {
            case "success": return "bg-success";
            case "error": return "bg-error";
            case "pending": return "bg-warning";
            default: return "bg-ink-muted";
        }
    };

    return (
        <motion.div
            variants={msgVariants}
            initial="hidden"
            animate="visible"
            className="flex gap-3 py-2"
        >
            {/* Avatar */}
            <VerixAvatar />

            {/* Thinking container */}
            <div className="flex-1 max-w-[85%]">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink-secondary transition-colors py-1 group"
                >
                        <motion.span
                            animate={{ rotate: isOpen ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="grid h-3 w-3 place-items-center"
                        >
                            <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        </motion.span>
                    {isComplete ? (
                        <span>Processed for {duration.toFixed(1)}s</span>
                    ) : (
                        <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-subtle" />
                            Processing...
                        </span>
                    )}
                    <span className="text-ink-muted/50">
                        · {steps.length} step{steps.length !== 1 ? "s" : ""}
                    </span>
                </button>

                {/* Expandable content with AnimatePresence */}
                <AnimatePresence initial={false}>
                    {isOpen && (
                        <motion.div
                            key="thinking-steps"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            style={{ overflow: "hidden" }}
                        >
                            <div className="mt-1 ml-1 pl-3 border-l-2 border-border space-y-1.5">
                                {steps.map((step, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.2, delay: i * 0.04 }}
                                        className="flex items-start gap-2 py-0.5"
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${statusDotColor(step.status)}`} />
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {step.actor && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-surface-tertiary border border-border text-ink-muted shrink-0">
                                                        {step.actor}
                                                    </span>
                                                )}
                                                <span className="text-xs text-ink-secondary">{step.message}</span>
                                            </div>
                                            {step.eventHash && (
                                                <span className="text-[9px] font-mono text-ink-muted/60 tracking-tight" title={step.eventHash}>
                                                    #{step.sequence !== undefined ? `${step.sequence} · ` : ""}{step.eventHash.slice(0, 12)}
                                                </span>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ---------- Result Card (embedded inline) ----------
function ResultCard({
    result,
    taskId,
    receipt,
    walletAddress,
    approvalStatus,
    approvedAt,
    approvedByWallet,
    approvalResultHash,
}: {
    result: TaskResult;
    taskId?: string;
    receipt?: ExecutionReceipt;
    walletAddress?: string;
    approvalStatus?: "pending" | "approved";
    approvedAt?: string;
    approvedByWallet?: string;
    approvalResultHash?: string;
}) {
    const [activeTab, setActiveTab] = useState(0);
    const [proof, setProof] = useState<ProofRecord | null>(null);
    const [showTechDetails, setShowTechDetails] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [approval, setApproval] = useState({
        status: approvalStatus ?? "pending",
        approvedAt,
        approvedByWallet,
        approvalResultHash,
    });
    const [approving, setApproving] = useState(false);
    const [approvalError, setApprovalError] = useState<string | null>(null);

    useEffect(() => {
        if (!taskId) return;
        getProofByTask(taskId).then(setProof).catch(() => null);
    }, [taskId]);

    const handleVerify = async () => {
        if (!proof || verifying) return;
        setVerifying(true);
        try {
            const updated = await verifyProof(proof.id);
            setProof(updated);
        } catch {
            // silently ignore — proof may not be in "proven" state yet
        } finally {
            setVerifying(false);
        }
    };

    const isVerified = receipt?.status === "verified" || proof?.status === "verified";
    const canVerify = proof?.status === "proven" && !isVerified;
    const isApproved = approval.status === "approved";

    const handleApprove = async () => {
        if (!taskId || approving || isApproved) return;
        setApproving(true);
        setApprovalError(null);
        try {
            const wallet = await getAuthorizedWallet();
            if (!wallet) throw new Error("Reconnect your Stellar wallet before approving payout release.");
            if (walletAddress && wallet.address !== walletAddress) {
                throw new Error("Connected wallet does not match the task payer wallet.");
            }
            const updated = await approveTaskResult(taskId, wallet.address);
            setApproval({
                status: updated.approvalStatus,
                approvedAt: updated.approvedAt,
                approvedByWallet: updated.approvedByWallet,
                approvalResultHash: updated.approvalResultHash,
            });
        } catch (error) {
            setApprovalError(error instanceof Error ? error.message : "Approval failed.");
        } finally {
            setApproving(false);
        }
    };

    return (
        <motion.div
            variants={msgVariants}
            initial="hidden"
            animate="visible"
            className="py-3"
        >
            <div className="flex gap-3">
                {/* Avatar */}
                <VerixAvatar />

                {/* Card */}
                <div className="flex-1 bg-surface border border-border rounded-2xl overflow-hidden">
                    {/* Verified banner — prominent when cryptographically attested */}
                    {isVerified && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="px-5 py-2.5 bg-violet-50 border-b border-violet-200 flex items-center gap-2"
                        >
                            <span className="text-violet-500 text-sm">OK</span>
                            <span className="text-xs font-semibold text-violet-700">Workflow Verified</span>
                            <span className="text-[10px] text-violet-500 ml-1">
                                receipt integrity / spend cap / payment intents / agent membership
                            </span>
                        </motion.div>
                    )}

                    {/* Header */}
                    <div className="px-5 py-3 border-b border-border bg-surface-secondary flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">Execution Complete</span>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-ink-muted font-mono">
                                {result.totalTime.toFixed(1)}s &middot; ${result.totalCost.toFixed(2)} USDC
                            </span>
                            {taskId && (
                                <Link href={`/trace/${taskId}`} className="text-[10px] font-medium text-violet-600 hover:text-violet-800 transition-colors underline underline-offset-2">
                                    View Trace
                                    <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
                                </Link>
                            )}
                            {taskId && (
                                <Link href={`/receipts/${taskId}`} className="text-[10px] font-medium text-emerald-600 hover:text-emerald-800 transition-colors underline underline-offset-2">
                                    View Receipt
                                    <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden="true" />
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="px-5 py-3 border-b border-border">
                        <p className="text-sm text-ink-secondary">{result.summary}</p>
                    </div>

                    {/* Approval gate */}
                    <div className="px-5 py-3 border-b border-border bg-surface-secondary/60">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] text-ink-muted uppercase tracking-wide">Payout Approval</p>
                                <p className="mt-1 text-xs text-ink-secondary">
                                    {isApproved
                                        ? `Approved by ${approval.approvedByWallet?.slice(0, 8)}...${approval.approvedByWallet?.slice(-6)}`
                                        : "Approve the delivered result before escrow milestones can be released."}
                                </p>
                                {approval.approvalResultHash && (
                                    <p className="mt-1 font-mono text-[10px] text-ink-muted">
                                        result {approval.approvalResultHash.slice(0, 10)}...{approval.approvalResultHash.slice(-8)}
                                    </p>
                                )}
                                {approvalError && (
                                    <p className="mt-1 text-[10px] text-red-600">{approvalError}</p>
                                )}
                            </div>
                            {isApproved ? (
                                <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
                                    Approved
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleApprove}
                                    disabled={approving || !taskId}
                                    className="shrink-0 rounded-md border border-ink bg-ink px-2.5 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {approving ? "Approving..." : "Approve payout"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Deliverable Tabs */}
                    {result.deliverables.length > 0 && (
                        <>
                            <div className="flex border-b border-border overflow-x-auto">
                                {result.deliverables.map((d, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setActiveTab(i)}
                                        className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === i ? "text-ink border-b-2 border-accent" : "text-ink-muted hover:text-ink-secondary"}`}
                                    >
                                        {d.title}
                                    </button>
                                ))}
                            </div>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2 }}
                                    className="p-4"
                                >
                                    <p className="text-[10px] text-ink-muted mb-2">By {result.deliverables[activeTab].specialistName}</p>
                                    <div className="text-xs text-ink-secondary whitespace-pre-wrap font-mono leading-relaxed bg-surface-secondary p-3 rounded-lg border border-border max-h-60 overflow-y-auto chat-scrollbar">
                                        {result.deliverables[activeTab].content}
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </>
                    )}

                    {/* Payment Trail */}
                    <div className="border-t border-border px-5 py-3">
                        <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-2">Payment Audit Trail</p>
                        <div className="space-y-2">
                            {result.paymentBreakdown.map((p, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.25, delay: i * 0.08 }}
                                    className="bg-surface-secondary rounded-lg border border-border p-3 text-xs"
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${p.status === "confirmed" ? "bg-success" : p.status === "failed" ? "bg-error" : "bg-warning"}`} />
                                            <span className="font-medium text-ink">{p.specialist}</span>
                                            {p.splitRole === "subcontractor" && (
                                                <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] text-ink-muted">
                                                    subcontracted
                                                </span>
                                            )}
                                        </div>
                                        <span className="font-mono font-semibold text-ink">${p.amount.toFixed(2)}</span>
                                    </div>
                                    <div className="space-y-1 font-mono text-[10px]">
                                        {p.txHash && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-ink-muted">Tx</span>
                                                <a href={stellarTxExplorerUrl(p.txHash)} target="_blank" rel="noopener noreferrer" className="text-ink-secondary hover:text-ink underline">
                                                    {p.txHash.slice(0, 10)}...{p.txHash.slice(-8)}
                                                </a>
                                            </div>
                                        )}
                                        {p.agentVersion !== undefined && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-ink-muted">Agent version</span>
                                                <span className="text-ink-secondary">
                                                    v{p.agentVersion}
                                                    {p.versionHash && <span className="text-ink-muted ml-1" title={p.versionHash}>· {p.versionHash.slice(0, 8)}</span>}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="text-ink-muted">Settlement mode</span>
                                            <span className="text-success">Stellar/Trustless Work intent</span>
                                        </div>
                                        {p.delegatedBySpecialistName && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-ink-muted">Delegated by</span>
                                                <span className="text-ink-secondary">{p.delegatedBySpecialistName}</span>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
                            <span className="text-ink-secondary">Total Paid</span>
                            <span className="font-mono font-semibold text-ink">${result.totalCost.toFixed(2)} USDC</span>
                        </div>
                    </div>

                    {/* Escrow Milestone Timeline */}
                    {taskId && (
                        <div className="border-t border-border px-5 py-3">
                            <EscrowTimeline taskId={taskId} />
                        </div>
                    )}

                    {/* Receipt + Proof Summary */}
                    {receipt && (
                        <div className="border-t border-border px-5 py-3">
                            <div className="flex items-center justify-between mb-2.5">
                                <p className="text-[10px] text-ink-muted uppercase tracking-wide">Execution Receipt</p>
                                <div className="flex items-center gap-2">
                                    {canVerify && (
                                        <button
                                            onClick={handleVerify}
                                            disabled={verifying}
                                            className="text-[9px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-300 hover:bg-violet-200 transition-colors disabled:opacity-50"
                                        >
                                            {verifying ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                                                    Verifying...
                                                </span>
                                            ) : "Verify Proof"}
                                        </button>
                                    )}
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                        isVerified
                                            ? "bg-violet-50 text-violet-700 border border-violet-200"
                                            : receipt.status === "proof_ready"
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            : "bg-surface-tertiary text-ink-muted border border-border"
                                    }`}>
                                        <span className={`w-1 h-1 rounded-full ${isVerified ? "bg-violet-500" : receipt.status === "proof_ready" ? "bg-emerald-500" : "bg-ink-muted"}`} />
                                        {isVerified ? "Verified" : receipt.status === "proof_ready" ? "Proof Ready" : "Pending"}
                                    </span>
                                </div>
                            </div>

                            {/* Proof coverage note */}
                            {proof && (
                                <p className="text-[9px] text-ink-muted mb-2.5 leading-relaxed">
                                    {isVerified
                                        ? "This local workflow proof verifies receipt integrity, spend cap compliance, payment-intent totals, and agent membership."
                                        : proof.status === "proven"
                                        ? "Proof journal generated. Run verification to commit the receipt status."
                                        : proof.status === "running"
                                        ? "Proof generation in progress..."
                                        : proof.status === "failed"
                                        ? `Proof generation failed: ${proof.errorMsg ?? "unknown error"}`
                                        : "Awaiting proof generation."}
                                </p>
                            )}

                            {/* Key receipt fields (always visible) */}
                            <div className="space-y-1.5 font-mono text-[10px]">
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-muted">Receipt Hash</span>
                                    <span className="text-ink-secondary" title={receipt.receiptHash}>{receipt.receiptHash.slice(0, 8)}…{receipt.receiptHash.slice(-8)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-muted">Trace Root</span>
                                    <span className="text-ink-secondary" title={receipt.traceRoot}>{receipt.traceRoot.slice(0, 8)}…{receipt.traceRoot.slice(-8)}</span>
                                </div>
                            </div>

                            {/* Collapsible technical details */}
                            <button
                                onClick={() => setShowTechDetails(!showTechDetails)}
                                className="mt-2 flex items-center gap-1 text-[9px] text-ink-muted hover:text-ink-secondary transition-colors"
                            >
                                <motion.span
                                    animate={{ rotate: showTechDetails ? 90 : 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="grid h-2.5 w-2.5 place-items-center"
                                >
                                    <ChevronRight className="h-2.5 w-2.5" aria-hidden="true" />
                                </motion.span>
                                Technical details
                            </button>

                            <AnimatePresence initial={false}>
                                {showTechDetails && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.22 }}
                                        style={{ overflow: "hidden" }}
                                    >
                                        <div className="mt-2 space-y-1.5 font-mono text-[10px] pt-2 border-t border-border">
                                            <div className="flex items-center justify-between">
                                                <span className="text-ink-muted">Input Hash</span>
                                                <span className="text-ink-secondary" title={receipt.taskInputHash}>{receipt.taskInputHash.slice(0, 8)}…{receipt.taskInputHash.slice(-8)}</span>
                                            </div>
                                            {receipt.outputHash && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-ink-muted">Output Hash</span>
                                                    <span className="text-ink-secondary" title={receipt.outputHash}>{receipt.outputHash.slice(0, 8)}…{receipt.outputHash.slice(-8)}</span>
                                                </div>
                                            )}
                                            {receipt.agentVersionHashes.length > 0 && (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-ink-muted">Agent Snapshots ({receipt.agentVersionHashes.length})</span>
                                                    {receipt.agentVersionHashes.map((h, i) => (
                                                        <span key={i} className="text-ink-muted/70 pl-2" title={h}>{h.slice(0, 12)}…</span>
                                                    ))}
                                                </div>
                                            )}
                                            {receipt.spendCap != null && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-ink-muted">Spend Cap</span>
                                                    <span className="text-ink-secondary">${receipt.spendCap.toFixed(2)} USDC</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
