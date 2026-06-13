"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LoaderCircle, Settings, Wallet, Unplug, ChevronRight,
  TrendingUp, ArrowRightLeft, Droplets, ArrowUpRight, ShieldCheck,
  ExternalLink, X, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  submitTask, getTaskStatus, getWalletBalance,
  getTaskHistory, getSpecialists,
  getOrInitSession, getCurrentSession,
} from "@/lib/api-client";
import {
  connectWallet, clearCachedConnectedWallet, getCachedConnectedWallet,
  getWalletOptions, WalletProviderId,
} from "@/lib/wallet-connect";
import { Task, TaskStatus, TaskResult, CreateTaskResponse } from "@/types/task";
import { ExecutionTraceEvent, ExecutionReceipt } from "@/types/trace";
import { Specialist } from "@/types/specialist";
import { WalletBalance } from "@/types/payment";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTOCOL_META: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  blend:    { color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.20)",  icon: <TrendingUp size={12} /> },
  soroswap: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.20)",  icon: <ArrowRightLeft size={12} /> },
  aquarius: { color: "#818cf8", bg: "rgba(129,140,248,0.10)", border: "rgba(129,140,248,0.25)", icon: <Droplets size={12} /> },
  anchor:   { color: "#38bdf8", bg: "rgba(56,189,248,0.08)",  border: "rgba(56,189,248,0.20)",  icon: <ArrowUpRight size={12} /> },
};

type Protocol = "blend" | "soroswap" | "aquarius" | "anchor";

interface MandateField {
  key: string; label: string; type: "number" | "text" | "select";
  placeholder?: string; options?: string[]; unit?: string; defaultValue?: string;
}

interface MandateTemplate {
  id: string; protocol: Protocol; label: string; tag: string;
  agentEndpoint: string; fields: MandateField[];
}

const TEMPLATES: MandateTemplate[] = [
  {
    id: "blend-supply", protocol: "blend", label: "Supply to Blend", tag: "Yield",
    agentEndpoint: "/api/specialists/blend-agent/execute",
    fields: [
      { key: "pool",   label: "Pool",    type: "select",  options: ["USDC-XLM","USDC-ETH","USDC-BTC"], defaultValue: "USDC-XLM" },
      { key: "amount", label: "Amount",  type: "number",  placeholder: "100", unit: "USDC" },
      { key: "minApy", label: "Min APY", type: "number",  placeholder: "5",   unit: "%" },
    ],
  },
  {
    id: "blend-rates", protocol: "blend", label: "Check Blend Rates", tag: "Yield",
    agentEndpoint: "/api/specialists/blend-agent/execute",
    fields: [
      { key: "pool", label: "Pool", type: "select", options: ["USDC-XLM","USDC-ETH","USDC-BTC"], defaultValue: "USDC-XLM" },
    ],
  },
  {
    id: "soroswap-swap", protocol: "soroswap", label: "Swap on Soroswap", tag: "Trading",
    agentEndpoint: "/api/specialists/soroswap-agent/execute",
    fields: [
      { key: "tokenIn",    label: "From",         type: "select", options: ["USDC","XLM","ETH","BTC"], defaultValue: "USDC" },
      { key: "tokenOut",   label: "To",           type: "select", options: ["XLM","USDC","ETH","BTC"], defaultValue: "XLM" },
      { key: "amountIn",   label: "Amount",       type: "number", placeholder: "50",  unit: "USDC" },
      { key: "maxSlippage",label: "Max Slippage", type: "number", placeholder: "0.5", unit: "%" },
    ],
  },
  {
    id: "soroswap-quote", protocol: "soroswap", label: "Get Swap Quote", tag: "Trading",
    agentEndpoint: "/api/specialists/soroswap-agent/execute",
    fields: [
      { key: "tokenIn",  label: "From",   type: "select", options: ["USDC","XLM","ETH","BTC"], defaultValue: "USDC" },
      { key: "tokenOut", label: "To",     type: "select", options: ["XLM","USDC","ETH","BTC"], defaultValue: "XLM" },
      { key: "amountIn", label: "Amount", type: "number", placeholder: "100", unit: "USDC" },
    ],
  },
  {
    id: "aquarius-add", protocol: "aquarius", label: "Add Liquidity", tag: "Liquidity",
    agentEndpoint: "/api/specialists/aquarius-agent/execute",
    fields: [
      { key: "tokenPair", label: "Pool",   type: "select", options: ["XLM/USDC","XLM/AQUA","USDC/BTC"], defaultValue: "XLM/USDC" },
      { key: "amount",    label: "Amount", type: "number", placeholder: "200", unit: "USDC equiv." },
    ],
  },
  {
    id: "aquarius-pool", protocol: "aquarius", label: "Read Pool State", tag: "Liquidity",
    agentEndpoint: "/api/specialists/aquarius-agent/execute",
    fields: [
      { key: "tokenPair", label: "Pool", type: "select", options: ["XLM/USDC","XLM/AQUA","USDC/BTC"], defaultValue: "XLM/USDC" },
    ],
  },
  {
    id: "anchor-payment", protocol: "anchor", label: "Cross-border Payment", tag: "Payments",
    agentEndpoint: "/api/specialists/anchor-agent/execute",
    fields: [
      { key: "amount",        label: "Amount",   type: "number", placeholder: "500",  unit: "USDC" },
      { key: "destination",   label: "Currency", type: "select", options: ["NGN","KES","GHS","ZAR","USD"], defaultValue: "NGN" },
      { key: "maxFeePercent", label: "Max Fee",  type: "number", placeholder: "1.5",  unit: "%" },
    ],
  },
  {
    id: "anchor-routes", protocol: "anchor", label: "Compare Anchor Routes", tag: "Payments",
    agentEndpoint: "/api/specialists/anchor-agent/execute",
    fields: [
      { key: "amount",      label: "Amount",   type: "number", placeholder: "500",  unit: "USDC" },
      { key: "destination", label: "Currency", type: "select", options: ["NGN","KES","GHS","ZAR","USD"], defaultValue: "NGN" },
    ],
  },
];

// Maps template id → agent action string
const TEMPLATE_ACTION: Record<string, string> = {
  "blend-supply":    "supply",
  "blend-rates":     "check-rates",
  "soroswap-swap":   "swap",
  "soroswap-quote":  "quote",
  "aquarius-add":    "add-liquidity",
  "aquarius-pool":   "read-pool",
  "anchor-payment":  "execute-payment",
  "anchor-routes":   "compare-routes",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending:         "Pending",
  funding_pending: "Awaiting Funding",
  decomposing:     "Routing",
  discovering:     "Discovering",
  processing:      "Executing",
  completed:       "Completed",
  failed:          "Failed",
};

function abbrev(h: string, n = 8) {
  return h ? `${h.slice(0, n)}…${h.slice(-4)}` : "";
}

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function detectProtocol(desc: string): Protocol | null {
  const d = desc.toLowerCase();
  if (d.includes("blend") || d.includes("supply") || d.includes("lending") || d.includes("yield")) return "blend";
  if (d.includes("soroswap") || d.includes("swap") || d.includes("slippage")) return "soroswap";
  if (d.includes("aquarius") || d.includes("liquidity") || d.includes("amm") || d.includes("pool")) return "aquarius";
  if (d.includes("anchor") || d.includes("cross-border") || d.includes("payment") || d.includes("route")) return "anchor";
  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TraceEventRow({ ev, isLast }: { ev: ExecutionTraceEvent; isLast: boolean }) {
  const isOk    = ev.eventType.includes("confirmed") || ev.eventType.includes("completed") || ev.eventType === "task_completed";
  const isError = ev.eventType.includes("failed") || ev.eventType.includes("exceeded");
  const isPending = !isOk && !isError;

  return (
    <div className="flex gap-3 items-start">
      {/* connector */}
      <div className="flex flex-col items-center" style={{ width: 20, flexShrink: 0 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", marginTop: 5, flexShrink: 0,
          background: isError ? "#f87171" : isOk ? "#4ade80" : isPending ? "#fbbf24" : "#94a3b8",
        }} />
        {!isLast && <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.07)", marginTop: 3 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 10 }}>
        <div className="flex items-center gap-2">
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.28)", fontFamily: "var(--font-mono)",
          }}>#{ev.sequence}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)",
            fontFamily: "var(--font-mono)",
          }}>{ev.eventType}</span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: "2px 0 0", lineHeight: 1.45 }}>
          {ev.displayMessage}
        </p>
        {ev.eventHash && (
          <p style={{ fontSize: 9.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.18)", marginTop: 2 }}>
            {abbrev(ev.eventHash, 12)}
          </p>
        )}
      </div>
    </div>
  );
}

function ReceiptCard({ receipt, taskId }: { receipt: ExecutionReceipt; taskId: string }) {
  return (
    <div style={{
      background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.18)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} style={{ color: "#4ade80" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Execution Receipt
          </span>
        </div>
        <Link
          href={`/receipts/${taskId}`}
          style={{
            fontSize: 10.5, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", gap: 4,
            textDecoration: "none",
          }}
        >
          Verify <ExternalLink size={10} />
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
        {[
          { label: "Receipt hash", value: abbrev(receipt.receiptHash ?? "", 10) },
          { label: "Trace root",   value: abbrev(receipt.traceRoot ?? "", 10) },
          { label: "Total cost",   value: `$${(receipt.totalCost ?? 0).toFixed(4)} USDC` },
          { label: "Agents",       value: String((receipt.agentVersionHashes ?? []).length) },
          { label: "Spend cap",    value: receipt.spendCap != null ? `$${receipt.spendCap.toFixed(2)}` : "—" },
          { label: "Payments",     value: String((receipt.paymentSummary ?? []).length) },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{label}</p>
            <p style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.75)", margin: "1px 0 0" }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  // Wallet
  const [walletAddress, setWalletAddress]           = useState("");
  const [walletBalance, setWalletBalance]           = useState(0);
  const [walletAssetCode, setWalletAssetCode]       = useState("USDC");
  const [walletSource, setWalletSource]             = useState<"connected-wallet" | "coordinator">("coordinator");
  const [walletProvider, setWalletProvider]         = useState<WalletProviderId | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus]           = useState<"connected" | "disconnected" | "loading">("loading");
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [isBalanceRefreshing, setIsBalanceRefreshing] = useState(false);
  const [showWalletPicker, setShowWalletPicker]     = useState(false);
  const [walletOptions, setWalletOptions]           = useState<Array<{ id: WalletProviderId; name: string; description: string; availability: string }>>([]);
  const [walletOptionsLoading, setWalletOptionsLoading] = useState(false);
  const [walletError, setWalletError]               = useState<string | null>(null);

  // Mandate builder
  const [selectedTemplate, setSelectedTemplate]     = useState<MandateTemplate | null>(null);
  const [fieldValues, setFieldValues]               = useState<Record<string, string>>({});
  const [spendCap, setSpendCap]                     = useState(10);

  // Execution state
  const [taskId, setTaskId]                         = useState<string | null>(null);
  const [taskStatus, setTaskStatus]                 = useState<TaskStatus | null>(null);
  const [traceEvents, setTraceEvents]               = useState<ExecutionTraceEvent[]>([]);
  const [receipt, setReceipt]                       = useState<ExecutionReceipt | null>(null);
  const [result, setResult]                         = useState<TaskResult | null>(null);
  const [isSubmitting, setIsSubmitting]             = useState(false);
  const [elapsedTime, setElapsedTime]               = useState(0);
  const [specialists, setSpecialists]               = useState<Specialist[]>([]);

  // History (left panel)
  const [history, setHistory]                       = useState<Task[]>([]);

  // Confirm modal
  const [showConfirm, setShowConfirm]               = useState(false);

  // SSE + polling refs
  const sseRef                  = useRef<EventSource | null>(null);
  const syncedRef               = useRef(0);
  const walletReqRef            = useRef(0);
  const traceEndRef             = useRef<HTMLDivElement>(null);

  // Session
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_sessionId, setSessionId]                  = useState<string | null>(getCurrentSession);

  // Auto-scroll trace feed
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [traceEvents]);

  // ── Wallet helpers ──────────────────────────────────────────────────────────

  const applyBalance = useCallback((data: WalletBalance, src: "connected-wallet" | "coordinator") => {
    setWalletBalance(data.balance);
    setWalletAssetCode(data.assetCode ?? "USDC");
    setWalletAddress(data.address);
    setWalletSource(data.source ?? src);
  }, []);

  const fetchBalance = useCallback(async (addr?: string) => {
    const rid = walletReqRef.current + 1;
    walletReqRef.current = rid;
    setIsBalanceRefreshing(true);
    setNetworkStatus(addr?.startsWith("G") ? "connected" : "loading");
    try {
      const data = await getWalletBalance(addr);
      if (rid !== walletReqRef.current) return;
      applyBalance(data, addr ? "connected-wallet" : "coordinator");
      if (!data.error) setWalletError(null);
      setNetworkStatus("connected");
    } catch {
      if (rid !== walletReqRef.current) return;
      setNetworkStatus(addr?.startsWith("G") ? "connected" : "disconnected");
    } finally {
      if (rid === walletReqRef.current) setIsBalanceRefreshing(false);
    }
  }, [applyBalance]);

  const handleConnect = useCallback(async (id: WalletProviderId) => {
    setIsWalletConnecting(true);
    setWalletError(null);
    try {
      const w = await connectWallet(id);
      setWalletProvider(w.provider);
      setWalletProviderName(w.providerName);
      setWalletSource("connected-wallet");
      setWalletAddress(w.address);
      setNetworkStatus("connected");
      setShowWalletPicker(false);
      void fetchBalance(w.address);
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : "Connection failed");
      setNetworkStatus("disconnected");
    } finally {
      setIsWalletConnecting(false);
    }
  }, [fetchBalance]);

  const handleDisconnect = useCallback(() => {
    clearCachedConnectedWallet();
    setWalletProvider(null); setWalletProviderName(null);
    setWalletSource("coordinator"); setWalletError(null);
    setWalletAddress(""); setWalletBalance(0);
    setNetworkStatus("loading");
    void fetchBalance();
  }, [fetchBalance]);

  // ── Boot ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const cached = getCachedConnectedWallet();
    if (cached) {
      setWalletProvider(cached.provider);
      setWalletProviderName(cached.providerName);
      setWalletAddress(cached.address);
      setWalletSource("connected-wallet");
      setNetworkStatus("connected");
      void fetchBalance(cached.address);
    } else {
      void fetchBalance();
    }
    getOrInitSession().then(setSessionId).catch(() => {});
    getSpecialists().then(setSpecialists).catch(() => {});
    getTaskHistory()
      .then((tasks) => setHistory(tasks.filter(t => t.status === "completed" || t.status === "failed")))
      .catch(() => {});
  }, [fetchBalance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load wallet options when picker opens
  useEffect(() => {
    if (!showWalletPicker || walletOptions.length || walletOptionsLoading) return;
    setWalletOptionsLoading(true);
    getWalletOptions()
      .then(setWalletOptions)
      .catch(() => setWalletOptions([]))
      .finally(() => setWalletOptionsLoading(false));
  }, [showWalletPicker, walletOptions.length, walletOptionsLoading]);

  // ── Elapsed time while running ──────────────────────────────────────────────

  useEffect(() => {
    if (!taskStatus || taskStatus === "completed" || taskStatus === "failed" || taskStatus === "pending") return;
    const iv = setInterval(() => setElapsedTime(p => p + 0.1), 100);
    return () => clearInterval(iv);
  }, [taskStatus]);

  // ── SSE trace event stream ──────────────────────────────────────────────────

  useEffect(() => {
    if (!taskId) return;
    const sse = new EventSource(`/api/executions/${encodeURIComponent(taskId)}/events`);
    sseRef.current = sse;
    sse.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; payload: unknown };
        if (msg.type === "trace_event") {
          const ev = msg.payload as ExecutionTraceEvent;
          if (ev.sequence >= syncedRef.current) {
            setTraceEvents(prev => {
              if (prev.some(x => x.sequence === ev.sequence)) return prev;
              return [...prev, ev].sort((a, b) => a.sequence - b.sequence);
            });
            syncedRef.current = ev.sequence + 1;
          }
        } else if (msg.type === "task_complete") {
          sse.close(); sseRef.current = null;
        }
      } catch { /* ignore */ }
    };
    sse.onerror = () => { sse.close(); sseRef.current = null; };
    return () => { sse.close(); sseRef.current = null; };
  }, [taskId]);

  // ── Polling ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!taskId) return;
    const iv = setInterval(async () => {
      try {
        const task = await getTaskStatus(taskId);
        setTaskStatus(task.status);
        if (task.traceEvents?.length) {
          setTraceEvents(task.traceEvents);
          syncedRef.current = task.traceEvents.length;
        }
        if (task.receipt) setReceipt(task.receipt);
        if (task.result) {
          setResult(task.result);
          void fetchBalance(walletSource === "connected-wallet" ? walletAddress : undefined);
          getTaskHistory()
            .then(tasks => setHistory(tasks.filter(t => t.status === "completed" || t.status === "failed")))
            .catch(() => {});
          clearInterval(iv);
        }
        if (task.status === "failed") {
          void fetchBalance(walletSource === "connected-wallet" ? walletAddress : undefined);
          clearInterval(iv);
        }
      } catch { /* retry */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [taskId, fetchBalance, walletAddress, walletSource]);

  // ── Template selection ──────────────────────────────────────────────────────

  function selectTemplate(tpl: MandateTemplate) {
    const defaults: Record<string, string> = {};
    tpl.fields.forEach(f => { if (f.defaultValue) defaults[f.key] = f.defaultValue; });
    setSelectedTemplate(tpl);
    setFieldValues(defaults);
  }

  function resetExecution() {
    setTaskId(null); setTaskStatus(null);
    setTraceEvents([]); setReceipt(null);
    setResult(null); setElapsedTime(0);
    syncedRef.current = 0;
    sseRef.current?.close(); sseRef.current = null;
  }

  const canSubmit = selectedTemplate?.fields.every(f => !!fieldValues[f.key]) ?? false;

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleConfirmSubmit() {
    if (!selectedTemplate || !canSubmit) return;
    setShowConfirm(false);
    setIsSubmitting(true);
    resetExecution();

    // Build a human-readable description from the field values
    const fieldSummary = selectedTemplate.fields
      .map(f => `${f.label}: ${fieldValues[f.key]}${f.unit ? " " + f.unit : ""}`)
      .join(", ");
    const description = `${selectedTemplate.label}. ${fieldSummary}. Protocol: ${selectedTemplate.protocol}. Action: ${TEMPLATE_ACTION[selectedTemplate.id]}.`;

    try {
      const res: CreateTaskResponse = await submitTask({
        description,
        spendCap,
        walletAddress,
        walletProvider: walletProviderName ?? walletProvider ?? undefined,
      });
      setTaskId(res.task_id);
      setTaskStatus("decomposing");
      toast.success("Mandate submitted — execution started.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submission failed";
      toast.error(msg);
      setTaskStatus("failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const isRunning = taskStatus && taskStatus !== "completed" && taskStatus !== "failed";
  const isDone    = taskStatus === "completed" || taskStatus === "failed";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "var(--color-dark-bg, #05070f)",
      fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      color: "var(--color-dark-text, #eef0f8)",
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header style={{
        height: 52, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 20px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(5,7,15,0.85)", backdropFilter: "blur(12px)",
      }}>
        {/* Logo + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <Image src="/logo-mark.png" alt="Verix" width={976} height={344} priority style={{ height: 26, width: "auto", objectFit: "contain", display: "block" }} />
          </Link>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", letterSpacing: "0.02em" }}>
            Execution Terminal
          </span>
          {isRunning && taskStatus && (
            <>
              <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", animation: "pulse 1.5s ease infinite" }} />
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>
                  {STATUS_LABELS[taskStatus]} · {elapsedTime.toFixed(1)}s
                </span>
              </div>
            </>
          )}
          {isDone && taskStatus && (
            <>
              <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                padding: "2px 8px", borderRadius: 999,
                background: taskStatus === "completed" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                color: taskStatus === "completed" ? "#4ade80" : "#f87171",
                border: `1px solid ${taskStatus === "completed" ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
              }}>
                {taskStatus === "completed" ? "Settled" : "Failed"}
              </span>
            </>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Balance chip */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
          }}>
            {isBalanceRefreshing
              ? <LoaderCircle size={11} style={{ animation: "spin 1s linear infinite", color: "rgba(255,255,255,0.3)" }} />
              : <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: networkStatus === "connected" ? "#4ade80" : networkStatus === "loading" ? "#fbbf24" : "#f87171",
                }} />
            }
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              ${walletBalance.toFixed(2)}
              <span style={{ marginLeft: 4, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{walletAssetCode}</span>
            </span>
          </div>

          {/* Wallet button */}
          {walletSource === "connected-wallet" ? (
            <button
              onClick={handleDisconnect}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: "transparent", border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(255,255,255,0.45)", cursor: "pointer",
              }}
            >
              <Unplug size={12} />
              {walletAddress ? `${walletAddress.slice(0, 5)}…${walletAddress.slice(-4)}` : "Wallet"}
            </button>
          ) : (
            <button
              onClick={() => setShowWalletPicker(true)}
              disabled={isWalletConnecting}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "#5b5fc7", border: "none", color: "#fff", cursor: "pointer",
              }}
            >
              {isWalletConnecting ? <LoaderCircle size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Wallet size={12} />}
              Connect wallet
            </button>
          )}

          <Link href="/marketplace" style={{
            display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
            borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.38)",
            border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
            background: "transparent",
          }}>
            Agents
          </Link>

          <Link href="/settings" style={{
            width: 32, height: 32, borderRadius: 8, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)",
            textDecoration: "none",
          }}>
            <Settings size={14} />
          </Link>
        </div>
      </header>

      {/* ── Body: three panels ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: positions / history ─────────────────────────────────────── */}
        <aside style={{
          width: 240, flexShrink: 0, display: "flex", flexDirection: "column",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          background: "var(--color-dark-subtle, #0a0c15)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: 0 }}>
              Executions
            </p>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
            {/* Active task */}
            {taskId && taskStatus && (
              <div style={{
                padding: "10px 10px", borderRadius: 8, marginBottom: 4,
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
              }}>
                <div className="flex items-center gap-2 mb-1">
                  {isRunning
                    ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", flexShrink: 0 }} />
                    : <span style={{ width: 6, height: 6, borderRadius: "50%", background: taskStatus === "completed" ? "#4ade80" : "#f87171", flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
                    {isRunning ? STATUS_LABELS[taskStatus] : taskStatus === "completed" ? "Settled" : "Failed"}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0, fontFamily: "var(--font-mono)" }}>
                  {taskId.slice(0, 18)}…
                </p>
                {traceEvents.length > 0 && (
                  <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)", margin: "4px 0 0" }}>
                    {traceEvents.length} events
                  </p>
                )}
              </div>
            )}

            {/* History */}
            {history.length === 0 && !taskId && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "24px 8px" }}>
                No executions yet
              </p>
            )}
            {history.map(task => {
              const proto = detectProtocol(task.description);
              const meta  = proto ? PROTOCOL_META[proto] : null;
              return (
                <Link
                  key={task.id}
                  href={`/trace/${task.id}`}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "9px 10px", borderRadius: 8, marginBottom: 2,
                    textDecoration: "none",
                    background: task.id === taskId ? "rgba(99,102,241,0.08)" : "transparent",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = task.id === taskId ? "rgba(99,102,241,0.08)" : "transparent")}
                >
                  {meta && (
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: meta.bg, border: `1px solid ${meta.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center", color: meta.color, marginTop: 1,
                    }}>
                      {meta.icon}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.6)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task.description.slice(0, 40)}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: task.status === "completed" ? "#4ade80" : "#f87171" }} />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>{timeAgo(task.createdAt)}</span>
                      {task.totalCost != null && (
                        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.22)" }}>
                          ${task.totalCost.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Agent count footer */}
          <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <Link href="/marketplace" style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)" }}>
                {specialists.length} agents online
              </span>
              <ChevronRight size={11} style={{ color: "rgba(255,255,255,0.2)" }} />
            </Link>
          </div>
        </aside>

        {/* ── CENTER: mandate builder + execution feed ───────────────────────── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Mandate builder */}
          <div style={{
            flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "var(--color-dark-surface, #0f1120)",
          }}>
            {/* Protocol selector tabs */}
            <div style={{
              display: "flex", gap: 2, padding: "12px 20px 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              {(["blend","soroswap","aquarius","anchor"] as Protocol[]).map(proto => {
                const m = PROTOCOL_META[proto];
                const active = selectedTemplate?.protocol === proto;
                return (
                  <button
                    key={proto}
                    onClick={() => {
                      const first = TEMPLATES.find(t => t.protocol === proto);
                      if (first) selectTemplate(first);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 14px 9px", borderRadius: "8px 8px 0 0",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: active ? "rgba(255,255,255,0.04)" : "transparent",
                      border: active ? `1px solid rgba(255,255,255,0.09)` : "1px solid transparent",
                      borderBottom: active ? "1px solid var(--color-dark-surface, #0f1120)" : "1px solid transparent",
                      color: active ? m.color : "rgba(255,255,255,0.3)",
                      transition: "color 0.15s, background 0.15s",
                      marginBottom: -1,
                    }}
                  >
                    <span style={{ color: active ? m.color : "rgba(255,255,255,0.25)" }}>{m.icon}</span>
                    {proto.charAt(0).toUpperCase() + proto.slice(1)}
                  </button>
                );
              })}
            </div>

            {selectedTemplate ? (
              <div style={{ padding: "16px 20px" }}>
                {/* Action selector */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {TEMPLATES.filter(t => t.protocol === selectedTemplate.protocol).map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => selectTemplate(tpl)}
                      style={{
                        padding: "4px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                        background: tpl.id === selectedTemplate.id ? PROTOCOL_META[tpl.protocol].bg : "rgba(255,255,255,0.04)",
                        border: `1px solid ${tpl.id === selectedTemplate.id ? PROTOCOL_META[tpl.protocol].border : "rgba(255,255,255,0.08)"}`,
                        color: tpl.id === selectedTemplate.id ? PROTOCOL_META[tpl.protocol].color : "rgba(255,255,255,0.4)",
                        transition: "all 0.15s",
                      }}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>

                {/* Fields row */}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  {selectedTemplate.fields.map(field => (
                    <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{
                        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: "rgba(255,255,255,0.3)",
                      }}>
                        {field.label}{field.unit ? <span style={{ fontWeight: 400, marginLeft: 3, color: "rgba(255,255,255,0.18)" }}>({field.unit})</span> : null}
                      </label>
                      {field.type === "select" ? (
                        <select
                          value={fieldValues[field.key] ?? ""}
                          onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                          style={{
                            padding: "7px 10px", borderRadius: 7, fontSize: 13, fontWeight: 500,
                            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                            color: "#eef0f8", outline: "none", minWidth: 110,
                          }}
                        >
                          <option value="" disabled>Choose…</option>
                          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <input
                            type={field.type}
                            value={fieldValues[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                            style={{
                              padding: "7px 10px", borderRadius: 7, fontSize: 13, fontWeight: 500,
                              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                              color: "#eef0f8", outline: "none", width: 110,
                              paddingRight: field.unit ? 36 : 10,
                            }}
                          />
                          {field.unit && (
                            <span style={{
                              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                              fontSize: 10, color: "rgba(255,255,255,0.25)", pointerEvents: "none",
                            }}>{field.unit}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Spend cap */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
                      Spend cap (USDC)
                    </label>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[5, 10, 25, 50].map(cap => (
                        <button
                          key={cap}
                          onClick={() => setSpendCap(cap)}
                          style={{
                            padding: "7px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                            fontFamily: "var(--font-mono)", cursor: "pointer",
                            background: spendCap === cap ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${spendCap === cap ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
                            color: spendCap === cap ? "#a5b4fc" : "rgba(255,255,255,0.35)",
                            transition: "all 0.12s",
                          }}
                        >
                          ${cap}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Execute button */}
                  <button
                    onClick={() => {
                      if (!canSubmit || isSubmitting || isRunning) return;
                      if (walletSource !== "connected-wallet") {
                        setShowWalletPicker(true); return;
                      }
                      setShowConfirm(true);
                    }}
                    disabled={!canSubmit || isSubmitting || !!isRunning}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 650,
                      background: canSubmit && !isRunning ? "#5b5fc7" : "rgba(91,95,199,0.25)",
                      border: "none", color: canSubmit && !isRunning ? "#fff" : "rgba(255,255,255,0.3)",
                      cursor: canSubmit && !isRunning ? "pointer" : "not-allowed",
                      transition: "background 0.15s", alignSelf: "flex-end",
                    }}
                  >
                    {isSubmitting
                      ? <><LoaderCircle size={13} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</>
                      : <>Execute mandate <ChevronRight size={13} /></>
                    }
                  </button>

                  {/* New mandate button (when done) */}
                  {isDone && (
                    <button
                      onClick={resetExecution}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.45)", cursor: "pointer", alignSelf: "flex-end",
                      }}
                    >
                      <RefreshCw size={12} /> New mandate
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* No template selected yet */
              <div style={{ padding: "24px 20px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", margin: 0 }}>
                  Select a protocol above to configure a mandate.
                </p>
              </div>
            )}
          </div>

          {/* ── Execution feed ──────────────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

            {/* Idle state */}
            {!taskId && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: 0 }}>
                  Ready to execute
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0, textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
                  Select a protocol, configure the mandate fields, and submit.
                  Every action is hash-chained and anchored on Soroban.
                </p>
                <div style={{
                  marginTop: 8, display: "flex", alignItems: "center", gap: 10,
                  fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "var(--font-mono)",
                }}>
                  {["Initialize","Route","Execute","Receipt","Anchor"].map((s, i, arr) => (
                    <span key={s} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {s}{i < arr.length - 1 && <span style={{ color: "rgba(255,255,255,0.1)" }}>→</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Live trace feed */}
            {taskId && (
              <div style={{ maxWidth: 680 }}>
                {/* Run header */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 20,
                }}>
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: "0 0 4px" }}>
                      Execution trace
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", margin: 0, fontFamily: "var(--font-mono)" }}>
                      {taskId}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link
                      href={`/trace/${taskId}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                        borderRadius: 7, fontSize: 11.5, color: "rgba(255,255,255,0.4)",
                        border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      Full trace <ExternalLink size={10} />
                    </Link>
                    {receipt && (
                      <Link
                        href={`/receipts/${taskId}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                          borderRadius: 7, fontSize: 11.5, color: "#4ade80",
                          border: "1px solid rgba(74,222,128,0.25)", textDecoration: "none",
                          background: "rgba(74,222,128,0.06)",
                        }}
                      >
                        <ShieldCheck size={11} /> Receipt
                      </Link>
                    )}
                  </div>
                </div>

                {/* Trace events */}
                {traceEvents.length === 0 && isRunning && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    <LoaderCircle size={14} style={{ animation: "spin 1s linear infinite" }} />
                    Waiting for first trace event…
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column" }}>
                  {traceEvents.map((ev, i) => (
                    <TraceEventRow key={ev.id ?? ev.sequence} ev={ev} isLast={i === traceEvents.length - 1} />
                  ))}
                  <div ref={traceEndRef} />
                </div>

                {/* Receipt card */}
                {receipt && (
                  <div style={{ marginTop: 24 }}>
                    <ReceiptCard receipt={receipt} taskId={taskId} />
                  </div>
                )}

                {/* Result summary */}
                {result && (
                  <div style={{
                    marginTop: 16, padding: "14px 16px", borderRadius: 10,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: "0 0 6px" }}>
                      Result summary
                    </p>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
                      {result.summary}
                    </p>
                    {result.totalCost > 0 && (
                      <p style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
                        Total cost: ${result.totalCost.toFixed(4)} USDC · {result.totalTime.toFixed(1)}s
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT: proof / anchor status ─────────────────────────────────── */}
        <aside style={{
          width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
          background: "var(--color-dark-subtle, #0a0c15)",
        }}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: 0 }}>
              Proof status
            </p>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            {!taskId ? (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", margin: 0 }}>
                No active execution
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* 5 constraints */}
                {[
                  { label: "Receipt integrity",   done: !!receipt },
                  { label: "Spend cap",            done: !!receipt },
                  { label: "Payment correctness",  done: isDone && taskStatus === "completed" },
                  { label: "Agent membership",     done: !!(receipt?.agentVersionHashes?.length) },
                  { label: "Trace commitment",     done: !!(receipt?.traceRoot) },
                ].map(({ label, done }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                      background: done ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${done ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, color: done ? "#4ade80" : "rgba(255,255,255,0.2)",
                    }}>
                      {done ? "✓" : isRunning ? "·" : "–"}
                    </div>
                    <span style={{ fontSize: 11, color: done ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)" }}>
                      {label}
                    </span>
                  </div>
                ))}

                {receipt && (
                  <>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                    <div>
                      <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 4px" }}>Trace root</p>
                      <p style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)", margin: 0, wordBreak: "break-all" }}>
                        {abbrev(receipt.traceRoot ?? "", 12)}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 4px" }}>Receipt hash</p>
                      <p style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)", margin: 0, wordBreak: "break-all" }}>
                        {abbrev(receipt.receiptHash ?? "", 12)}
                      </p>
                    </div>
                    <Link
                      href={`/receipts/${taskId}`}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        padding: "7px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                        background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)",
                        color: "#4ade80", textDecoration: "none",
                      }}
                    >
                      <ShieldCheck size={12} /> Verify receipt
                    </Link>
                  </>
                )}

                {/* Events count */}
                {traceEvents.length > 0 && (
                  <>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Events</span>
                      <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}>
                        {traceEvents.length}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Elapsed</span>
                      <span style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}>
                        {elapsedTime.toFixed(1)}s
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Wallet picker modal ──────────────────────────────────────────────── */}
      {showWalletPicker && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            background: "var(--color-dark-surface, #0f1120)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
            width: "100%", maxWidth: 420, padding: "24px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", margin: "0 0 6px" }}>
                  Stellar wallet
                </p>
                <h3 style={{ fontSize: 16, fontWeight: 650, color: "#eef0f8", margin: 0 }}>Connect to continue</h3>
                <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.38)", margin: "6px 0 0", lineHeight: 1.5 }}>
                  Your wallet is used as the payer identity for escrow and USDC settlement.
                </p>
              </div>
              <button onClick={() => setShowWalletPicker(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: 4 }}>
                <X size={16} />
              </button>
            </div>

            {walletError && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: "#f87171" }}>
                {walletError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {walletOptionsLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  <LoaderCircle size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Detecting wallets…
                </div>
              )}
              {walletOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleConnect(opt.id)}
                  disabled={isWalletConnecting}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 9, fontSize: 13, cursor: "pointer",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
                    color: "#eef0f8", textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.18)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.09)"; }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{opt.name}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{opt.description}</div>
                  </div>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                    color: opt.availability === "available" ? "#4ade80" : opt.availability === "external" ? "#fbbf24" : "rgba(255,255,255,0.3)",
                  }}>
                    {opt.availability === "available" ? "ready" : opt.availability === "external" ? "external" : "install"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm modal ────────────────────────────────────────────────────── */}
      {showConfirm && selectedTemplate && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            background: "var(--color-dark-surface, #0f1120)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
            width: "100%", maxWidth: 420, padding: "24px",
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", margin: "0 0 8px" }}>
              Confirm mandate
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 650, color: "#eef0f8", margin: "0 0 16px" }}>
              {selectedTemplate.label}
            </h3>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: "14px", marginBottom: 16 }}>
              {selectedTemplate.fields.map(f => (
                <div key={f.key} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.38)" }}>{f.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
                    {fieldValues[f.key]}{f.unit ? " " + f.unit : ""}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: 6, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "rgba(255,255,255,0.38)" }}>Spend cap</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "#a5b4fc", fontWeight: 600 }}>${spendCap.toFixed(2)} USDC</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.38)" }}>Payer wallet</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.55)", fontSize: 11.5 }}>
                  {walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-4)}` : "—"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.4)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                style={{
                  flex: 2, padding: "10px", borderRadius: 9, fontSize: 13, fontWeight: 650,
                  background: "#5b5fc7", border: "none", color: "#fff", cursor: "pointer",
                }}
              >
                Execute →
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        select option { background: #0f1120; color: #eef0f8; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}
