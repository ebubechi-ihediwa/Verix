"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { TaskResult } from "@/types/task";
import { ExecutionReceipt } from "@/types/trace";

const EXPLORER_URL =
    "https://staging-utter-unripe-menkar.explorer.staging-v3.skalenodes.com";

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
        label: "Prism",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl rounded-bl-md",
    },
    specialist: {
        label: "Prism",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl rounded-bl-md",
    },
    payment: {
        label: "Prism",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl rounded-bl-md",
    },
    system: {
        label: "System",
        bubbleClass: "",
    },
    result: {
        label: "Prism",
        bubbleClass:
            "bg-surface border border-border text-ink rounded-2xl",
    },
    thinking: {
        label: "Prism",
        bubbleClass: "",
    },
};

// Shared message entrance animation
const msgVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

function PrismAvatar({ size = 32 }: { size?: number }) {
    return (
        <div
            className="rounded-full overflow-hidden shrink-0 bg-white border border-border"
            style={{ width: size, height: size }}
        >
            <Image
                src="/prism-logo.jpg"
                alt="Prism"
                width={size}
                height={size}
                className="object-cover w-full h-full"
            />
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
                    <PrismAvatar size={16} />
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
        return <ResultCard result={message.result} taskId={message.taskId} receipt={message.receipt} />;
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
            <PrismAvatar />

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
            <PrismAvatar />

            {/* Thinking container */}
            <div className="flex-1 max-w-[85%]">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink-secondary transition-colors py-1 group"
                >
                    <motion.svg
                        animate={{ rotate: isOpen ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </motion.svg>
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
function ResultCard({ result, taskId, receipt }: { result: TaskResult; taskId?: string; receipt?: ExecutionReceipt }) {
    const [activeTab, setActiveTab] = useState(0);

    return (
        <motion.div
            variants={msgVariants}
            initial="hidden"
            animate="visible"
            className="py-3"
        >
            <div className="flex gap-3">
                {/* Avatar */}
                <PrismAvatar />

                {/* Card */}
                <div className="flex-1 bg-surface border border-border rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-violet-50 to-indigo-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-violet-700">
                                Task Complete
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-ink-muted font-mono">
                                {result.totalTime.toFixed(1)}s &middot; $
                                {result.totalCost.toFixed(2)} USDC
                            </span>
                            {taskId && (
                                <Link
                                    href={`/trace/${taskId}`}
                                    className="text-[10px] font-medium text-violet-600 hover:text-violet-800 transition-colors underline underline-offset-2"
                                >
                                    View Trace →
                                </Link>
                            )}
                            {taskId && (
                                <Link
                                    href={`/receipts/${taskId}`}
                                    className="text-[10px] font-medium text-emerald-600 hover:text-emerald-800 transition-colors underline underline-offset-2"
                                >
                                    View Receipt →
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="px-5 py-3 border-b border-border">
                        <p className="text-sm text-ink-secondary">{result.summary}</p>
                    </div>

                    {/* Deliverable Tabs */}
                    {result.deliverables.length > 0 && (
                        <>
                            <div className="flex border-b border-border overflow-x-auto">
                                {result.deliverables.map((d, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setActiveTab(i)}
                                        className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === i
                                            ? "text-ink border-b-2 border-accent"
                                            : "text-ink-muted hover:text-ink-secondary"
                                            }`}
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
                                    <p className="text-[10px] text-ink-muted mb-2">
                                        By {result.deliverables[activeTab].specialistName}
                                    </p>
                                    <div className="text-xs text-ink-secondary whitespace-pre-wrap font-mono leading-relaxed bg-surface-secondary p-3 rounded-lg border border-border max-h-60 overflow-y-auto chat-scrollbar">
                                        {result.deliverables[activeTab].content}
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </>
                    )}

                    {/* Payment Trail */}
                    <div className="border-t border-border px-5 py-3">
                        <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-2">
                            Payment Audit Trail
                        </p>
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
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${p.status === "confirmed"
                                                    ? "bg-success"
                                                    : p.status === "failed"
                                                        ? "bg-error"
                                                        : "bg-warning"
                                                    }`}
                                            />
                                            <span className="font-medium text-ink">
                                                {p.specialist}
                                            </span>
                                        </div>
                                        <span className="font-mono font-semibold text-ink">
                                            ${p.amount.toFixed(2)}
                                        </span>
                                    </div>

                                    <div className="space-y-1 font-mono text-[10px]">
                                        {p.txHash && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-ink-muted">Tx</span>
                                                <a
                                                    href={`${EXPLORER_URL}/tx/${p.txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-ink-secondary hover:text-ink underline"
                                                >
                                                    {p.txHash.slice(0, 10)}...{p.txHash.slice(-8)}
                                                </a>
                                            </div>
                                        )}
                                        {p.agentVersion !== undefined && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-ink-muted">Agent version</span>
                                                <span className="text-ink-secondary">
                                                    v{p.agentVersion}
                                                    {p.versionHash && (
                                                        <span className="text-ink-muted ml-1" title={p.versionHash}>
                                                            · {p.versionHash.slice(0, 8)}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="text-ink-muted">Gas</span>
                                            <span className="text-success">$0.00 (gasless)</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
                            <span className="text-ink-secondary">Total Paid</span>
                            <span className="font-mono font-semibold text-ink">
                                ${result.totalCost.toFixed(2)} USDC
                            </span>
                        </div>
                    </div>

                    {/* Execution Receipt */}
                    {receipt && (
                        <div className="border-t border-border px-5 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] text-ink-muted uppercase tracking-wide">
                                    Execution Receipt
                                </p>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                    receipt.status === "proof_ready"
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : receipt.status === "verified"
                                        ? "bg-violet-50 text-violet-700 border border-violet-200"
                                        : "bg-surface-tertiary text-ink-muted border border-border"
                                }`}>
                                    <span className={`w-1 h-1 rounded-full ${
                                        receipt.status === "proof_ready" ? "bg-emerald-500" :
                                        receipt.status === "verified" ? "bg-violet-500" : "bg-ink-muted"
                                    }`} />
                                    {receipt.status === "proof_ready" ? "Proof Ready" :
                                     receipt.status === "verified" ? "Verified" : "Pending"}
                                </span>
                            </div>
                            <div className="space-y-1.5 font-mono text-[10px]">
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-muted">Receipt Hash</span>
                                    <span className="text-ink-secondary" title={receipt.receiptHash}>
                                        {receipt.receiptHash.slice(0, 8)}…{receipt.receiptHash.slice(-8)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-muted">Trace Root</span>
                                    <span className="text-ink-secondary" title={receipt.traceRoot}>
                                        {receipt.traceRoot.slice(0, 8)}…{receipt.traceRoot.slice(-8)}
                                    </span>
                                </div>
                                {receipt.agentVersionHashes.length > 0 && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-ink-muted">Agent Versions</span>
                                        <span className="text-ink-secondary">
                                            {receipt.agentVersionHashes.length} snapshot{receipt.agentVersionHashes.length !== 1 ? "s" : ""} committed
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between">
                                    <span className="text-ink-muted">Input Hash</span>
                                    <span className="text-ink-secondary" title={receipt.taskInputHash}>
                                        {receipt.taskInputHash.slice(0, 8)}…{receipt.taskInputHash.slice(-8)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
