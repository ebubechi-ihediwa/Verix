"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, Plug, Unplug } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Task } from "@/types/task";
import { Specialist } from "@/types/specialist";
import { stellarAccountExplorerUrl } from "@/lib/stellar-config";
import VerixMark from "@/components/VerixMark";
import { WalletProviderId } from "@/lib/wallet-connect";
import PositionMonitor from "@/components/PositionMonitor";

interface ChatSidebarProps {
    taskHistory: Task[];
    activeTaskId: string | null;
    onNewTask: () => void;
    onSelectTask: (taskId: string) => void;
    onDeleteTask: (taskId: string) => void;
    walletBalance: number;
    walletAssetCode: string;
    walletAssetIssuer: string | null;
    nativeBalance: number | null;
    hasConfiguredAsset: boolean;
    hasAnyRequestedAsset: boolean;
    walletAddress: string;
    walletSource: "connected-wallet" | "coordinator";
    walletProvider: WalletProviderId | null;
    walletProviderName: string | null;
    isWalletConnecting: boolean;
    isWalletBalanceRefreshing: boolean;
    onOpenWalletPicker: () => void;
    onDisconnectWallet: () => void;
    networkStatus: "connected" | "disconnected" | "loading";
    isOpen: boolean;
    onToggle: () => void;
    specialists: Specialist[];
    collapsed: boolean;
    onCollapseToggle: () => void;
    /** Current browser session ID — used to gate the delete button per task ownership. */
    sessionId?: string | null;
}

export default function ChatSidebar({
    taskHistory,
    activeTaskId,
    onNewTask,
    onSelectTask,
    onDeleteTask,
    walletBalance,
    walletAssetCode,
    walletAssetIssuer,
    nativeBalance,
    hasConfiguredAsset,
    hasAnyRequestedAsset,
    walletAddress,
    walletSource,
    walletProvider,
    walletProviderName,
    isWalletConnecting,
    isWalletBalanceRefreshing,
    onOpenWalletPicker,
    onDisconnectWallet,
    networkStatus,
    isOpen,
    onToggle,
    specialists,
    collapsed,
    onCollapseToggle,
    sessionId,
}: ChatSidebarProps) {
    // A task is deletable if it has no owner (legacy/seeded data) or the
    // current session is the owner.
    const canDelete = (task: Task) =>
        !task.ownerId || task.ownerId === sessionId;
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; description: string } | null>(null);
    const shortAddress =
        walletAddress && walletAddress.length > 10
            ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
            : walletAddress;

    const statusColor =
        networkStatus === "connected"
            ? "bg-emerald-400"
            : networkStatus === "loading"
                ? "bg-yellow-400 animate-pulse"
                : "bg-red-400";

    return (
        <>
            {/* Mobile overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/30 z-30 lg:hidden"
                        onClick={onToggle}
                    />
                )}
            </AnimatePresence>

            {/* Desktop sidebar wrapper — animates width smoothly */}
            <motion.aside
                animate={{ width: collapsed ? 64 : 288 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`
                    hidden lg:flex flex-col bg-ink shrink-0 overflow-hidden relative
                `}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {collapsed ? (
                        /* -------- Collapsed view -------- */
                        <motion.div
                            key="collapsed"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex flex-col items-center py-4 gap-3 h-full border-r border-white/10"
                        >
                            {/* Expand button */}
                            <button
                                onClick={onCollapseToggle}
                                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-colors"
                                title="Expand sidebar"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                </svg>
                            </button>

                            {/* New task */}
                            <button
                                onClick={onNewTask}
                                className="w-9 h-9 rounded-xl border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                title="New Task"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            </button>

                            <div className="flex-1" />

                            {/* Wallet indicator */}
                            <div className="flex flex-col items-center gap-1.5 pb-1">
                                <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                                <span className="text-[9px] font-mono text-white/50 leading-none">
                                    {walletBalance > 0 ? walletBalance.toFixed(0) : nativeBalance?.toFixed(0) ?? "0"}
                                </span>
                            </div>
                        </motion.div>
                    ) : (
                        /* -------- Full view -------- */
                        <motion.div
                            key="expanded"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15, delay: 0.1 }}
                            className="flex flex-col h-full w-72"
                        >
                            {/* Header */}
                            <div className="px-4 pt-5 pb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <VerixMark inverted />
                                </div>
                                <button
                                    onClick={onCollapseToggle}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                    title="Collapse sidebar"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
                                    </svg>
                                </button>
                            </div>

                            {/* New Task Button */}
                            <div className="px-3 pb-3">
                                <button
                                    onClick={onNewTask}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/15 text-white/90 hover:bg-white/10 transition-all text-sm font-medium"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    New execution
                                </button>
                            </div>

                            {/* Task History */}
                            <div className="flex-1 overflow-y-auto chat-scrollbar px-2 space-y-0.5">
                                {taskHistory.length === 0 ? (
                                    <div className="px-3 py-8 text-center">
                                        <p className="text-xs text-white/30">No tasks yet</p>
                                        <p className="text-[10px] text-white/20 mt-1">Submit a task to get started</p>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-[10px] text-white/30 uppercase tracking-wider px-3 pt-3 pb-1.5">
                                            Executions
                                        </p>
                                        {taskHistory.map((task) => (
                                            <div key={task.id} className="relative group">
                                                <motion.button
                                                    whileHover={{ x: 2 }}
                                                    transition={{ duration: 0.15 }}
                                                    onClick={() => onSelectTask(task.id)}
                                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${activeTaskId === task.id
                                                        ? "bg-white/15 text-white"
                                                        : "text-white/60 hover:text-white/90 hover:bg-white/8"
                                                        }`}
                                                >
                                                    <p className="truncate text-[13px] leading-snug pr-6">
                                                        {task.description}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${task.status === "completed" ? "bg-emerald-400" : "bg-red-400"}`} />
                                                        <span className="text-[10px] text-white/30">
                                                            {new Date(task.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                                        </span>
                                                        {task.totalCost !== undefined && (
                                                            <span className="text-[10px] font-mono text-white/30">${task.totalCost.toFixed(2)}</span>
                                                        )}
                                                    </div>
                                                </motion.button>
                                                {/* Delete button — only shown when session owns the task */}
                                                {canDelete(task) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteConfirm({ id: task.id, description: task.description });
                                                        }}
                                                        className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10"
                                                        title="Delete chat"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>

                            {/* DeFi Position Monitor */}
                            <div className="border-t border-white/10">
                                <PositionMonitor activeTaskId={activeTaskId} />
                            </div>

                            {/* Specialists */}
                            <div className="border-t border-white/10 px-3 py-3">
                                <div className="flex items-center justify-between px-1 mb-2">
                                    <p className="text-[10px] text-white/30 uppercase tracking-wider">Agents ({specialists.length})</p>
                                    <Link href="/settings" className="text-[10px] text-white/30 hover:text-white/60 transition-colors">Manage</Link>
                                </div>
                                <div className="space-y-1">
                                    {specialists.map((s) => (
                                        <div key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-white/50 text-xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                            <span className="flex-1 truncate">{s.name}</span>
                                            <span className="font-mono text-white/25 text-[10px]">${s.priceUsdc.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Wallet Card */}
                            <div className="border-t border-white/10 px-3 py-3">
                                <div className="rounded-xl bg-white/[0.06] border border-white/10 overflow-hidden">
                                    {/* Balance */}
                                    <div className="px-4 pt-3.5 pb-3">
                                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
                                            {walletSource === "connected-wallet" ? "Connected wallet" : "Settlement account"}
                                        </p>
                                        <p className="text-2xl font-bold font-mono text-white leading-tight">
                                            {isWalletBalanceRefreshing && !walletBalance && nativeBalance === null
                                                ? "..."
                                                : (walletBalance > 0 ? walletBalance : nativeBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            <span className="text-xs font-medium text-white/40 ml-1">
                                                {walletBalance > 0 ? walletAssetCode : "XLM"}
                                            </span>
                                        </p>
                                        {!hasConfiguredAsset && nativeBalance !== null && (
                                            <p className="mt-1 text-[10px] text-amber-300/80">
                                                {hasAnyRequestedAsset
                                                    ? `${walletAssetCode} issuer differs from configured escrow asset.`
                                                    : `No configured ${walletAssetCode} trustline or balance; showing XLM.`}
                                            </p>
                                        )}
                                    </div>
                                    {/* Details */}
                                    <div className="border-t border-white/8 px-4 py-2.5 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-white/30">Address</span>
                                            <span className="text-[10px] font-mono text-white/50">{shortAddress || "Not connected"}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-white/30">Network</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                                                <span className="text-[10px] text-white/50">
                                                    {isWalletBalanceRefreshing ? "Syncing balance..." : networkStatus === "connected" ? "Stellar Testnet" : networkStatus === "loading" ? "Connecting..." : "Disconnected"}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-white/30">Runtime</span>
                                            <span className="text-[10px] font-medium text-emerald-400">Stellar/Soroban</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-white/30">Protocol</span>
                                            <span className="text-[10px] text-white/50">
                                                {walletProviderName ?? (walletProvider ? walletProvider : "Trustless Work")}
                                            </span>
                                        </div>
                                        {walletAssetIssuer && (
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] text-white/30">Asset issuer</span>
                                                <span className="truncate text-[10px] font-mono text-white/50">
                                                    {walletAssetIssuer.slice(0, 8)}...{walletAssetIssuer.slice(-6)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t border-white/8 px-4 py-2">
                                        {walletSource === "connected-wallet" ? (
                                            <button
                                                onClick={onDisconnectWallet}
                                                className="flex w-full items-center justify-center gap-1.5 border border-white/10 px-2 py-1.5 text-[10px] text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
                                            >
                                                <Unplug className="h-3 w-3" aria-hidden="true" />
                                                Disconnect wallet
                                            </button>
                                        ) : (
                                            <button
                                                onClick={onOpenWalletPicker}
                                                disabled={isWalletConnecting}
                                                className="flex w-full items-center justify-center gap-1.5 border border-white/10 px-2 py-1.5 text-[10px] text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-50"
                                            >
                                                {isWalletConnecting ? (
                                                    <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                                                ) : (
                                                    <Plug className="h-3 w-3" aria-hidden="true" />
                                                )}
                                                Connect wallet
                                            </button>
                                        )}
                                    </div>
                                    {/* Explorer link */}
                                    {walletAddress && walletAddress !== "Not configured" && (
                                        <div className="border-t border-white/8 px-4 py-2">
                                            <a
                                                href={stellarAccountExplorerUrl(walletAddress)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-center gap-1.5 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                                            >
                                                View on Explorer
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                                </svg>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.aside>

            {/* Mobile sidebar — kept as fixed overlay */}
            <aside
                className={`fixed lg:hidden z-40 inset-y-0 left-0 w-72 bg-ink flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                {/* Mobile header */}
                <div className="px-4 pt-5 pb-3 flex items-center justify-between">
                    <VerixMark inverted />
                    <button
                        onClick={onToggle}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Mobile new task */}
                <div className="px-3 pb-3">
                    <button
                        onClick={onNewTask}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/15 text-white/90 hover:bg-white/10 transition-all text-sm font-medium"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        New execution
                    </button>
                </div>

                {/* Mobile task history */}
                <div className="flex-1 overflow-y-auto chat-scrollbar px-2 space-y-0.5">
                    {taskHistory.length === 0 ? (
                        <div className="px-3 py-8 text-center">
                            <p className="text-xs text-white/30">No tasks yet</p>
                            <p className="text-[10px] text-white/20 mt-1">Submit a task to get started</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-[10px] text-white/30 uppercase tracking-wider px-3 pt-3 pb-1.5">Executions</p>
                            {taskHistory.map((task) => (
                                <button
                                    key={task.id}
                                    onClick={() => onSelectTask(task.id)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all group ${activeTaskId === task.id ? "bg-white/15 text-white" : "text-white/60 hover:text-white/90 hover:bg-white/8"}`}
                                >
                                    <p className="truncate text-[13px] leading-snug">{task.description}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${task.status === "completed" ? "bg-emerald-400" : "bg-red-400"}`} />
                                        <span className="text-[10px] text-white/30">
                                            {new Date(task.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                        </span>
                                        {task.totalCost !== undefined && (
                                            <span className="text-[10px] font-mono text-white/30">${task.totalCost.toFixed(2)}</span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </>
                    )}
                </div>

                {/* Mobile wallet footer */}
                <div className="border-t border-white/10 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                        <span className="text-xs text-white/50">
                            {walletSource === "connected-wallet"
                                ? "Connected wallet"
                                : networkStatus === "connected"
                                    ? "Coordinator wallet"
                                    : networkStatus === "loading"
                                        ? "Connecting..."
                                        : "Disconnected"}
                        </span>
                    </div>
                        <span className="text-xs font-mono font-semibold text-white/80">
                            {walletBalance > 0 ? walletBalance.toFixed(2) : nativeBalance?.toFixed(2) ?? "0.00"} {walletBalance > 0 ? walletAssetCode : "XLM"}
                        </span>
                </div>
                <button
                    onClick={walletSource === "connected-wallet" ? onDisconnectWallet : onOpenWalletPicker}
                    disabled={isWalletConnecting}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 border border-white/10 px-2 py-1.5 text-[10px] text-white/50 transition-colors hover:border-white/20 hover:text-white/80 disabled:opacity-50"
                >
                    {isWalletConnecting ? (
                        <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : walletSource === "connected-wallet" ? (
                        <Unplug className="h-3 w-3" aria-hidden="true" />
                    ) : (
                        <Plug className="h-3 w-3" aria-hidden="true" />
                    )}
                    {walletSource === "connected-wallet" ? "Disconnect wallet" : "Connect wallet"}
                </button>
            </div>
            </aside>

            {/* Delete Confirmation Dialog */}
            <AnimatePresence>
                {deleteConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={() => setDeleteConfirm(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 8 }}
                            transition={{ duration: 0.15 }}
                            className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-white">Delete Chat</h3>
                                    <p className="text-xs text-white/40 mt-0.5">This action cannot be undone</p>
                                </div>
                            </div>

                            <p className="text-sm text-white/60 mb-5 leading-relaxed">
                                Are you sure you want to delete{" "}
                                <span className="text-white/80 font-medium">
                                    &ldquo;{deleteConfirm.description.length > 60
                                        ? deleteConfirm.description.slice(0, 60) + "..."
                                        : deleteConfirm.description}&rdquo;
                                </span>?
                            </p>

                            <div className="flex gap-2.5 justify-end">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onDeleteTask(deleteConfirm.id);
                                        setDeleteConfirm(null);
                                    }}
                                    className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
