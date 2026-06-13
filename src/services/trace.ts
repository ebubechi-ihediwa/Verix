import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sha256, hashCanonical } from "@/lib/hash";
import { ExecutionTraceEvent, TraceEventType } from "@/types/trace";
import { demoTraceStore } from "@/lib/demo-store";

function demoGetLast(taskId: string) {
  const events = demoTraceStore.get(taskId) ?? [];
  return events[events.length - 1] ?? null;
}

function demoAppend(taskId: string, ev: ExecutionTraceEvent) {
  const events = demoTraceStore.get(taskId) ?? [];
  demoTraceStore.set(taskId, [...events, ev]);
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function toTraceEvent(row: {
  id: string;
  taskId: string;
  sequence: number;
  eventType: string;
  actor: string;
  displayMessage: string;
  inputHash: string | null;
  outputHash: string | null;
  eventHash: string;
  prevEventHash: string | null;
  metadata: unknown;
  timestamp: Date;
}): ExecutionTraceEvent {
  return {
    id: row.id,
    taskId: row.taskId,
    sequence: row.sequence,
    eventType: row.eventType as TraceEventType,
    actor: row.actor,
    displayMessage: row.displayMessage,
    inputHash: row.inputHash ?? undefined,
    outputHash: row.outputHash ?? undefined,
    eventHash: row.eventHash,
    prevEventHash: row.prevEventHash ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    timestamp: row.timestamp.toISOString(),
  };
}

// ── Core recorder ─────────────────────────────────────────────────────────────

export async function recordTraceEvent(
  taskId: string,
  eventType: TraceEventType,
  actor: string,
  displayMessage: string,
  options: {
    inputHash?: string;
    outputHash?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<ExecutionTraceEvent> {
  if (!env.DATABASE_URL) {
    const last = demoGetLast(taskId);
    const sequence = (last?.sequence ?? -1) + 1;
    const prevEventHash = last?.eventHash;
    const eventHash = hashCanonical({
      taskId, sequence, eventType, actor,
      inputHash: options.inputHash ?? null,
      outputHash: options.outputHash ?? null,
      prevEventHash: prevEventHash ?? null,
    });
    const ev: ExecutionTraceEvent = {
      id: `${taskId}-${sequence}`,
      taskId, sequence, eventType: eventType as TraceEventType, actor, displayMessage,
      inputHash: options.inputHash,
      outputHash: options.outputHash,
      eventHash,
      prevEventHash,
      metadata: options.metadata,
      timestamp: new Date().toISOString(),
    };
    demoAppend(taskId, ev);
    return ev;
  }

  const lastEvent = await prisma.executionTraceEvent.findFirst({
    where: { taskId },
    orderBy: { sequence: "desc" },
    select: { sequence: true, eventHash: true },
  });

  const sequence = (lastEvent?.sequence ?? -1) + 1;
  const prevEventHash = lastEvent?.eventHash ?? undefined;

  const eventHash = hashCanonical({
    taskId, sequence, eventType, actor,
    inputHash: options.inputHash ?? null,
    outputHash: options.outputHash ?? null,
    prevEventHash: prevEventHash ?? null,
  });

  const row = await prisma.executionTraceEvent.create({
    data: {
      taskId, sequence, eventType, actor, displayMessage,
      inputHash: options.inputHash ?? null,
      outputHash: options.outputHash ?? null,
      eventHash,
      prevEventHash: prevEventHash ?? null,
      metadata: options.metadata as object ?? undefined,
    },
  });

  return toTraceEvent(row);
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function getTraceEvents(taskId: string): Promise<ExecutionTraceEvent[]> {
  if (!env.DATABASE_URL) {
    return demoTraceStore.get(taskId) ?? [];
  }
  const rows = await prisma.executionTraceEvent.findMany({
    where: { taskId },
    orderBy: { sequence: "asc" },
  });
  return rows.map(toTraceEvent);
}

// ── Trace root ────────────────────────────────────────────────────────────────

export async function computeTraceRoot(taskId: string): Promise<string> {
  if (!env.DATABASE_URL) {
    const events = demoTraceStore.get(taskId) ?? [];
    const last = events[events.length - 1];
    return last?.eventHash ?? sha256(`empty:${taskId}`);
  }
  const lastEvent = await prisma.executionTraceEvent.findFirst({
    where: { taskId },
    orderBy: { sequence: "desc" },
    select: { eventHash: true },
  });
  return lastEvent?.eventHash ?? sha256(`empty:${taskId}`);
}
