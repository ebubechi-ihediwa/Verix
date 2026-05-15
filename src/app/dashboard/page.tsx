"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import ChatMessage, { ChatMessageData, ThinkingStep } from "@/components/ChatMessage";
import ChatSidebar from "@/components/ChatSidebar";
import ExecutionGraph from "@/components/ExecutionGraph";
import { Task, TaskStatus, TaskResult, Subtask, TaskEvent } from "@/types/task";
import { ExecutionTraceEvent } from "@/types/trace";
import {
  submitTask,
  getTaskStatus,
  getWalletBalance,
  getTaskHistory,
  getSpecialists,
  deleteTask,
  getOrInitSession,
  getCurrentSession,
} from "@/lib/api-client";
import { Specialist } from "@/types/specialist";

// Pure helper — defined outside component so it is stable across renders
function traceEventToThinkingStep(e: ExecutionTraceEvent): ThinkingStep {
  const deriveStatus = (type: string): ThinkingStep["status"] => {
    if (type.includes("failed") || type.includes("exceeded")) return "error";
    if (type.includes("confirmed") || type.includes("completed")) return "success";
    if (type.includes("initiated") || type.includes("invoked") || type.includes("assigned")) return "pending";
    return "info";
  };
  return {
    message: e.displayMessage,
    status: deriveStatus(e.eventType),
    type: e.actor === "payment" ? "payment" : e.actor === "coordinator" ? "coordinator" : "specialist",
    timestamp: e.timestamp,
    actor: e.actor,
    eventType: e.eventType,
    eventHash: e.eventHash,
    sequence: e.sequence,
  };
}

export default function Dashboard() {
  // Core state
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [result, setResult] = useState<TaskResult | null>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletAddress, setWalletAddress] = useState("");
  const [networkStatus, setNetworkStatus] = useState<
    "connected" | "disconnected" | "loading"
  >("loading");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [spendCap, setSpendCap] = useState(10);

  // Chat state
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const thinkingIdRef = useRef<string | null>(null);

  // Task history
  const [taskHistory, setTaskHistory] = useState<Task[]>([]);

  // Session
  const [sessionId, setSessionId] = useState<string | null>(getCurrentSession);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);

  // Confirmation modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDescription, setPendingDescription] = useState("");

  // Graph events for live execution DAG
  const [graphEvents, setGraphEvents] = useState<ExecutionTraceEvent[]>([]);

  // Server event tracking
  const syncedEventsCount = useRef(0);

  // SSE connection for live trace events
  const sseRef = useRef<EventSource | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Helper: add a thinking step to the current thinking block
  const addThinkingStep = useCallback(
    (step: ThinkingStep) => {
      setMessages((prev) => {
        const updated = [...prev];
        const thinkingIdx = updated.findIndex(
          (m) => m.id === thinkingIdRef.current
        );
        if (thinkingIdx !== -1) {
          const thinking = { ...updated[thinkingIdx] };
          thinking.thinkingSteps = [...(thinking.thinkingSteps || []), step];
          updated[thinkingIdx] = thinking;
        }
        return updated;
      });
    },
    []
  );

  // Helper: finalize thinking block with duration
  const finalizeThinking = useCallback(
    (duration: number) => {
      setMessages((prev) => {
        const updated = [...prev];
        const thinkingIdx = updated.findIndex(
          (m) => m.id === thinkingIdRef.current
        );
        if (thinkingIdx !== -1) {
          const thinking = { ...updated[thinkingIdx] };
          thinking.thinkingDuration = duration;
          updated[thinkingIdx] = thinking;
        }
        return updated;
      });
    },
    []
  );

  // Auto-resize textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  // Fetch wallet balance
  const fetchWalletBalance = useCallback(async () => {
    try {
      const data = await getWalletBalance();
      setWalletBalance(data.balance);
      setWalletAddress(data.address);
      setNetworkStatus("connected");
    } catch {
      setNetworkStatus("disconnected");
    }
  }, []);

  // Fetch task history
  const fetchHistory = useCallback(async () => {
    try {
      const tasks = await getTaskHistory();
      setTaskHistory(
        tasks.filter((t) => t.status === "completed" || t.status === "failed")
      );
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchWalletBalance();
    fetchHistory();
    getSpecialists().then(setSpecialists).catch(() => { });
    // Ensure the session is initialised and cached in localStorage
    getOrInitSession().then(setSessionId).catch(() => { });
  }, [fetchWalletBalance, fetchHistory]);

  // Add a chat message
  const addMessage = useCallback(
    (
      role: ChatMessageData["role"],
      content: string,
      status?: ChatMessageData["status"],
      extra?: Partial<ChatMessageData>
    ) => {
      const msg: ChatMessageData = {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date().toISOString(),
        status,
        ...extra,
      };
      setMessages((prev) => [...prev, msg]);
    },
    []
  );

  // Sync legacy task events into the thinking block (fallback when no trace events)
  const syncEvents = useCallback(
    (events: TaskEvent[]) => {
      if (!events || events.length <= syncedEventsCount.current) return;

      const newEvents = events.slice(syncedEventsCount.current);
      syncedEventsCount.current = events.length;

      for (const event of newEvents) {
        addThinkingStep({
          message: event.message,
          status: event.status,
          type: event.type,
          timestamp: event.timestamp,
        });
      }
    },
    [addThinkingStep]
  );

  // Sync structured trace events into the thinking block (preferred over legacy events)
  const syncTraceEvents = useCallback(
    (traceEvents: ExecutionTraceEvent[]) => {
      if (!traceEvents || traceEvents.length <= syncedEventsCount.current) return;

      const newEvents = traceEvents.slice(syncedEventsCount.current);
      syncedEventsCount.current = traceEvents.length;

      for (const event of newEvents) {
        addThinkingStep(traceEventToThinkingStep(event));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addThinkingStep]
  );

  // Elapsed time counter
  useEffect(() => {
    if (
      !taskStatus ||
      taskStatus === "completed" ||
      taskStatus === "failed" ||
      taskStatus === "pending"
    )
      return;

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 0.1);
    }, 100);

    return () => clearInterval(interval);
  }, [taskStatus]);

  // SSE subscription — streams trace events with ~1s latency while a task is active.
  // The existing 2s polling useEffect remains active as fallback: syncTraceEvents
  // checks syncedEventsCount so events processed by SSE are not re-added.
  useEffect(() => {
    if (!taskId) return;

    const sse = new EventSource(`/api/executions/${encodeURIComponent(taskId)}/events`);
    sseRef.current = sse;

    sse.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; payload: unknown };
        if (msg.type === "trace_event") {
          const event = msg.payload as ExecutionTraceEvent;
          if (event.sequence >= syncedEventsCount.current) {
            addThinkingStep(traceEventToThinkingStep(event));
            syncedEventsCount.current = event.sequence + 1;
            setGraphEvents((prev) => {
              if (prev.some((ev) => ev.sequence === event.sequence)) return prev;
              return [...prev, event].sort((a, b) => a.sequence - b.sequence);
            });
          }
        } else if (msg.type === "task_complete") {
          sse.close();
          sseRef.current = null;
        }
      } catch {
        // ignore malformed messages
      }
    };

    sse.onerror = () => {
      sse.close();
      sseRef.current = null;
    };

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [taskId, addThinkingStep]);

  // Estimate cost
  const estimateCost = (description: string) => {
    const lower = description.toLowerCase();
    const hasCode =
      lower.includes("code") ||
      lower.includes("security") ||
      lower.includes("audit");
    const hasMarket =
      lower.includes("market") ||
      lower.includes("investment") ||
      lower.includes("analysis");
    const hasWriting =
      lower.includes("memo") ||
      lower.includes("report") ||
      lower.includes("write");

    let cost = 0;
    if (hasCode) cost += 1.0;
    if (hasMarket) cost += 0.75;
    if (hasWriting) cost += 0.5;

    setEstimatedCost(cost || 2.25);
  };

  // Poll task status
  useEffect(() => {
    if (!taskId) return;

    const interval = setInterval(async () => {
      try {
        const task = await getTaskStatus(taskId);
        setTaskStatus(task.status);

        if (task.subtasks) setSubtasks(task.subtasks);
        if (task.totalCost) setTotalCost(task.totalCost);
        if (task.traceEvents && task.traceEvents.length > 0) {
          syncTraceEvents(task.traceEvents);
          setGraphEvents(task.traceEvents);
        } else if (task.events) {
          syncEvents(task.events);
        }

        if (task.result) {
          setResult(task.result);
          // Finalize thinking block
          finalizeThinking(elapsedTime);
          // Add result as a proper chat response — include receipt when available
          addMessage("result", "Task completed successfully", "success", {
            result: task.result,
            taskId: taskId ?? undefined,
            receipt: task.receipt ?? undefined,
          });
          fetchWalletBalance();
          clearInterval(interval);
        }
        if (task.status === "failed") {
          finalizeThinking(elapsedTime);
          addMessage("system", "Task failed.", "error");
          fetchWalletBalance();
          clearInterval(interval);
        }
      } catch {
        // Silently retry
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [taskId, addMessage, syncEvents, syncTraceEvents, fetchWalletBalance]);

  // Step 1: User submits → show confirmation
  const handleRequestSubmit = () => {
    const description = inputValue.trim();
    if (!description || isSubmitting) return;
    estimateCost(description);
    setPendingDescription(description);
    setShowConfirm(true);
  };

  // Step 2: User confirms → actually submit
  const handleConfirmSubmit = async () => {
    setShowConfirm(false);
    const description = pendingDescription;
    setIsSubmitting(true);

    // Add user message to chat
    addMessage("user", description);
    setInputValue("");

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Reset state for new task
    setSubtasks([]);
    setResult(null);
    setTotalCost(0);
    setElapsedTime(0);
    setGraphEvents([]);
    syncedEventsCount.current = 0;
    sseRef.current?.close();
    sseRef.current = null;

    // Create thinking block
    const thinkingId = crypto.randomUUID();
    thinkingIdRef.current = thinkingId;
    const thinkingMsg: ChatMessageData = {
      id: thinkingId,
      role: "thinking",
      content: "",
      timestamp: new Date().toISOString(),
      thinkingSteps: [
        {
          message: "Received your task. Analyzing...",
          status: "info",
          type: "coordinator",
          timestamp: new Date().toISOString(),
        },
      ],
    };
    setMessages((prev) => [...prev, thinkingMsg]);

    try {
      const response = await submitTask({ description, spendCap });
      setTaskId(response.task_id);
      setTaskStatus("decomposing");
      setEstimatedCost(response.estimated_cost);

      addThinkingStep({
        message: `Task decomposed into ${response.subtasks.length} subtask(s).`,
        status: "success",
        type: "coordinator",
        timestamp: new Date().toISOString(),
      });

      response.subtasks.forEach((s) => {
        addThinkingStep({
          message: `Subtask identified: ${s}`,
          status: "info",
          type: "coordinator",
          timestamp: new Date().toISOString(),
        });
      });
    } catch (error) {
      addThinkingStep({
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        status: "error",
        type: "system",
        timestamp: new Date().toISOString(),
      });
      setTaskStatus("failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load past task
  const handleViewHistory = async (historicTaskId: string) => {
    try {
      const task = await getTaskStatus(historicTaskId);
      setTaskId(historicTaskId);
      setTaskStatus(task.status);

      if (task.subtasks) setSubtasks(task.subtasks);
      if (task.totalCost) setTotalCost(task.totalCost);
      if (task.result) setResult(task.result);

      // Rebuild chat messages from stored events
      const rebuiltMessages: ChatMessageData[] = [];

      // Add the original user prompt
      rebuiltMessages.push({
        id: crypto.randomUUID(),
        role: "user",
        content: task.description,
        timestamp: task.createdAt,
      });

      // Add events as a thinking block — prefer structured trace events over legacy blob
      const hasTrace = task.traceEvents && task.traceEvents.length > 0;
      const hasLegacy = task.events && task.events.length > 0;

      if (hasTrace && task.traceEvents) {
        const thinkingSteps: ThinkingStep[] = task.traceEvents.map(traceEventToThinkingStep);
        const firstTime = new Date(task.traceEvents[0].timestamp).getTime();
        const lastTime = new Date(task.traceEvents[task.traceEvents.length - 1].timestamp).getTime();
        const duration = (lastTime - firstTime) / 1000;

        rebuiltMessages.push({
          id: crypto.randomUUID(),
          role: "thinking",
          content: "",
          timestamp: task.traceEvents[0].timestamp,
          thinkingSteps,
          thinkingDuration: duration > 0 ? duration : undefined,
        });
      } else if (hasLegacy && task.events) {
        const thinkingSteps: ThinkingStep[] = task.events.map((e) => ({
          message: e.message,
          status: e.status,
          type: e.type,
          timestamp: e.timestamp,
        }));

        const firstTime = new Date(task.events[0].timestamp).getTime();
        const lastTime = new Date(
          task.events[task.events.length - 1].timestamp
        ).getTime();
        const duration = (lastTime - firstTime) / 1000;

        rebuiltMessages.push({
          id: crypto.randomUUID(),
          role: "thinking",
          content: "",
          timestamp: task.events[0].timestamp,
          thinkingSteps,
          thinkingDuration: duration > 0 ? duration : undefined,
        });
      }

      // Add result if present — include receipt so the card can show proof status
      if (task.result) {
        rebuiltMessages.push({
          id: crypto.randomUUID(),
          role: "result",
          content: "Task completed successfully",
          status: "success",
          timestamp: task.completedAt || task.createdAt,
          result: task.result,
          taskId: historicTaskId,
          receipt: task.receipt ?? undefined,
        });
      }

      setMessages(rebuiltMessages);
      setSidebarOpen(false);
    } catch {
      // ignore
    }
  };

  // New Task
  const handleNewTask = () => {
    setTaskStatus(null);
    setTaskId(null);
    setMessages([]);
    setSubtasks([]);
    setResult(null);
    setTotalCost(0);
    setEstimatedCost(null);
    setElapsedTime(0);
    setInputValue("");
    syncedEventsCount.current = 0;
    thinkingIdRef.current = null;
    sseRef.current?.close();
    sseRef.current = null;
    fetchWalletBalance();
    fetchHistory();
    setSidebarOpen(false);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  // Handle Enter key to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleRequestSubmit();
    }
  };

  const isWorking =
    taskStatus &&
    taskStatus !== "completed" &&
    taskStatus !== "failed";
  const isDone = taskStatus === "completed" || taskStatus === "failed";
  const hasMessages = messages.length > 0;

  // Status labels
  const statusLabels: Record<TaskStatus, string> = {
    pending: "Pending",
    decomposing: "Decomposing Task",
    discovering: "Finding Specialists",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
  };

  return (
    <div className="h-screen flex overflow-hidden bg-surface-secondary">
      {/* Sidebar */}
      <ChatSidebar
        taskHistory={taskHistory}
        activeTaskId={taskId}
        onNewTask={handleNewTask}
        onSelectTask={handleViewHistory}
        onDeleteTask={async (id) => {
          try {
            await deleteTask(id);
            setTaskHistory((prev) => prev.filter((t) => t.id !== id));
            if (taskId === id) {
              setTaskId(null);
              setMessages([]);
              setResult(null);
              setSubtasks([]);
              setTaskStatus(null);
            }
          } catch (e) {
            console.error("Failed to delete task:", e);
          }
        }}
        sessionId={sessionId}
        walletBalance={walletBalance}
        walletAddress={walletAddress}
        networkStatus={networkStatus}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        specialists={specialists}
        collapsed={sidebarCollapsed}
        onCollapseToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
          {/* Hamburger for mobile */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-tertiary transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            {isWorking && taskStatus ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse-subtle" />
                <span className="text-sm font-medium text-ink">
                  {statusLabels[taskStatus]}
                </span>
                <span className="text-xs text-ink-muted font-mono">
                  {elapsedTime.toFixed(1)}s
                </span>
              </div>
            ) : isDone ? (
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${taskStatus === "completed" ? "bg-success" : "bg-error"
                    }`}
                />
                <span className="text-sm font-medium text-ink">
                  {taskStatus === "completed"
                    ? "Task Complete"
                    : "Task Failed"}
                </span>
                {totalCost > 0 && (
                  <span className="text-xs text-ink-muted font-mono">
                    ${totalCost.toFixed(2)} USDC
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm font-medium text-ink">New Task</span>
            )}
          </div>

          {/* Wallet badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-secondary border border-border">
            <span
              className={`w-1.5 h-1.5 rounded-full ${networkStatus === "connected"
                ? "bg-success"
                : networkStatus === "loading"
                  ? "bg-warning animate-pulse"
                  : "bg-error"
                }`}
            />
            <span className="text-xs font-mono font-semibold text-ink">
              ${walletBalance.toFixed(2)}
            </span>
          </div>

          {/* Settings link */}
          <Link
            href="/settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-tertiary transition-colors"
            title="Agent Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </Link>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto chat-scrollbar">
          {!hasMessages ? (
            /* Empty state — welcome screen */
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-6">
                <span className="text-3xl">◈</span>
              </div>
              <h1 className="text-2xl font-bold text-ink mb-2">
                How can I help you?
              </h1>
              <p className="text-sm text-ink-secondary text-center max-w-md mb-10">
                Submit a complex task and autonomous AI agents will decompose,
                execute, and pay each other on-chain to deliver results.
              </p>

              {/* Suggestion Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
                {[
                  {
                    icon: "🛡️",
                    title: "Security Audit",
                    desc: "Analyze codebase for security vulnerabilities",
                  },
                  {
                    icon: "📊",
                    title: "Market Research",
                    desc: "Research a company's market position and competitors",
                  },
                  {
                    icon: "✍️",
                    title: "Investment Memo",
                    desc: "Create a professional investment analysis document",
                  },
                  {
                    icon: "🔍",
                    title: "Full Analysis",
                    desc: "Audit code, research market, and write investment memo",
                  },
                ].map((chip) => (
                  <button
                    key={chip.title}
                    onClick={() => {
                      setInputValue(chip.desc);
                      inputRef.current?.focus();
                    }}
                    className="text-left p-4 rounded-xl border border-border bg-surface hover:border-border-strong hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5">{chip.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors">
                          {chip.title}
                        </p>
                        <p className="text-xs text-ink-muted mt-0.5">
                          {chip.desc}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* How it works */}
              <div className="mt-12 text-center">
                <p className="text-[10px] text-ink-muted uppercase tracking-widest mb-4">
                  How it works
                </p>
                <div className="flex items-center gap-4 text-xs text-ink-muted">
                  <span>Submit Task</span>
                  <span className="text-ink-muted/30">→</span>
                  <span>Agents Collaborate</span>
                  <span className="text-ink-muted/30">→</span>
                  <span>On-chain Payments</span>
                  <span className="text-ink-muted/30">→</span>
                  <span>Get Results</span>
                </div>
              </div>
            </div>
          ) : (
            /* Chat Thread */
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {/* Typing indicator when working */}
              {isWorking && (
                <div className="flex gap-3 py-2 pr-16">
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-white border border-border">
                    <Image src="/prism-logo.jpg" alt="Prism" width={32} height={32} className="object-cover w-full h-full" />
                  </div>
                  <div className="px-4 py-3 bg-surface border border-border rounded-2xl rounded-bl-md">
                    <div className="flex items-center gap-1">
                      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-muted" />
                      <span
                        className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-muted"
                        style={{ animationDelay: "0.2s" }}
                      />
                      <span
                        className="typing-dot w-1.5 h-1.5 rounded-full bg-ink-muted"
                        style={{ animationDelay: "0.4s" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Live Execution Graph — shown when a task is active */}
        {taskId && graphEvents.length > 0 && (
          <ExecutionGraph traceEvents={graphEvents} taskStatus={taskStatus} />
        )}

        {/* Input Bar */}
        <div className="shrink-0 border-t border-border bg-surface">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="relative flex items-end gap-2 bg-surface-secondary border border-border rounded-2xl px-4 py-2 focus-within:border-border-strong focus-within:shadow-sm transition-all">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Describe your task..."
                rows={1}
                disabled={isSubmitting}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted resize-none focus:outline-none py-1.5 max-h-40 chat-scrollbar"
              />
              <button
                onClick={handleRequestSubmit}
                disabled={!inputValue.trim() || isSubmitting}
                className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center shrink-0 hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all mb-0.5"
              >
                {isSubmitting ? (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-ink-muted text-center mt-2">
              Agents pay via x402 on SKALE Calypso · Zero gas fees · Instant
              finality
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold text-ink mb-2">
              Confirm Task Submission
            </h3>
            <p className="text-sm text-ink-secondary mb-4">
              Review the details before autonomous agents begin working and
              making payments.
            </p>

            <div className="bg-surface-secondary rounded-lg border border-border p-4 space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Task</span>
                <span className="text-ink text-right max-w-[60%] truncate">
                  {pendingDescription}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Estimated Cost</span>
                <span className="font-mono font-semibold text-ink">
                  ${estimatedCost?.toFixed(2) ?? "0.00"} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Spend Cap</span>
                <span className="font-mono text-ink">
                  ${spendCap.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Wallet Balance</span>
                <span className="font-mono text-ink">
                  ${walletBalance.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Network</span>
                <span className="text-ink">SKALE Calypso (gasless)</span>
              </div>
            </div>

            {estimatedCost !== null && estimatedCost > walletBalance && (
              <div className="bg-error/10 text-error text-sm p-3 rounded-lg mb-4">
                Insufficient balance. You need ${estimatedCost.toFixed(2)} but
                only have ${walletBalance.toFixed(2)}.
              </div>
            )}

            {estimatedCost !== null && estimatedCost > spendCap && (
              <div className="bg-warning/10 text-warning text-sm p-3 rounded-lg mb-4">
                Estimated cost exceeds your spend cap of $
                {spendCap.toFixed(2)}.
              </div>
            )}

            {/* Spend cap adjuster */}
            <div className="mb-4">
              <label className="text-xs text-ink-muted uppercase tracking-wide block mb-2">
                Spend Cap (max per task)
              </label>
              <div className="flex items-center gap-2">
                {[5, 10, 25, 50].map((cap) => (
                  <button
                    key={cap}
                    onClick={() => setSpendCap(cap)}
                    className={`px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${spendCap === cap
                      ? "bg-ink text-surface border-ink"
                      : "bg-surface-secondary text-ink-secondary border-border hover:border-border-strong"
                      }`}
                  >
                    ${cap}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-secondary border border-border rounded-lg hover:bg-surface-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={
                  (estimatedCost !== null && estimatedCost > walletBalance) ||
                  isSubmitting
                }
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-accent text-surface rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Approve & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
