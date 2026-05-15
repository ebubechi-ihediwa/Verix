/**
 * Durable job service — DB-backed queue for long-running background work.
 *
 * A Job is a durable record of a single unit of execution. The row exists
 * before the work starts so a process crash or serverless timeout cannot make
 * an in-flight task disappear silently. Status transitions:
 *
 *   queued → running → completed
 *                    ↘ failed  (retried up to maxAttempts, then terminal)
 *
 * Atomic claiming: uses a WHERE-filtered UPDATE so only one caller can
 * transition queued → running even under concurrent requests.
 *
 * Demo-mode fallback: when the database is unavailable (no DATABASE_URL),
 * all state lives in a process-level Map so the coordinator still works
 * for local demos without a Postgres instance.
 */

import { prisma } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type JobType =
  | "coordinator_execution"
  | "coordinator_execution_resume"
  | "proof_generation"
  | "escrow_sync";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  taskId?: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMsg?: string;
  attempts: number;
  maxAttempts: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ── In-memory fallback (demo / no-DB mode) ────────────────────────────────────

const globalForJobs = globalThis as unknown as {
  __jobStore: Map<string, Job> | undefined;
};

function getInMemoryStore(): Map<string, Job> {
  if (!globalForJobs.__jobStore) {
    globalForJobs.__jobStore = new Map();
  }
  return globalForJobs.__jobStore;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function toJob(row: {
  id: string;
  type: string;
  status: string;
  taskId: string | null;
  payload: unknown;
  result: unknown;
  errorMsg: string | null;
  attempts: number;
  maxAttempts: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}): Job {
  return {
    id: row.id,
    type: row.type as JobType,
    status: row.status as JobStatus,
    taskId: row.taskId ?? undefined,
    payload: (row.payload as Record<string, unknown>) ?? {},
    result: row.result ? (row.result as Record<string, unknown>) : undefined,
    errorMsg: row.errorMsg ?? undefined,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a new job.
 *
 * Idempotent by (taskId, type): if a non-failed job already exists for the
 * same task and job type, the existing job is returned unchanged. This prevents
 * double-execution when a route handler is called twice (e.g. hot-reload,
 * client retry).
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  taskId?: string
): Promise<Job> {
  // Idempotency check
  if (taskId) {
    const existing = await getJobForTask(taskId, type);
    if (existing && existing.status !== "failed") {
      console.log(`[Jobs] Returning existing ${type} job ${existing.id} (${existing.status})`);
      return existing;
    }
  }

  const job: Job = {
    id: crypto.randomUUID(),
    type,
    status: "queued",
    taskId,
    payload,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
  };

  try {
    const row = await prisma.job.create({
      data: {
        id: job.id,
        type: job.type,
        status: "queued",
        taskId: job.taskId,
        payload: job.payload as object,
        maxAttempts: job.maxAttempts,
      },
    });
    console.log(`[Jobs] Enqueued ${type} job ${row.id}`);
    return toJob(row);
  } catch (err) {
    console.warn("[Jobs] DB unavailable, using in-memory job store:", (err as Error).message?.slice(0, 80));
    getInMemoryStore().set(job.id, job);
    return job;
  }
}

/**
 * Atomically claim a queued job for execution.
 *
 * Uses a filtered UPDATE (WHERE status='queued') so that only one concurrent
 * caller can win the claim. Returns `true` when the job was successfully
 * claimed, `false` when another process already started it.
 */
export async function startJob(jobId: string): Promise<boolean> {
  try {
    const result = await prisma.job.updateMany({
      where: { id: jobId, status: "queued" },
      data: {
        status: "running",
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    if (result.count === 1) {
      console.log(`[Jobs] Claimed job ${jobId}`);
      return true;
    }

    console.warn(`[Jobs] Failed to claim job ${jobId} — already running or completed`);
    return false;
  } catch (err) {
    console.warn("[Jobs] DB unavailable for startJob:", (err as Error).message?.slice(0, 80));
    // In-memory fallback: CAS-style claim
    const store = getInMemoryStore();
    const job = store.get(jobId);
    if (!job || job.status !== "queued") return false;
    store.set(jobId, {
      ...job,
      status: "running",
      startedAt: new Date().toISOString(),
      attempts: job.attempts + 1,
    });
    return true;
  }
}

/**
 * Mark a job as successfully completed and store its output.
 */
export async function completeJob(
  jobId: string,
  result: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "completed", result: result as object, completedAt: new Date() },
    });
    console.log(`[Jobs] Completed job ${jobId}`);
  } catch (err) {
    console.warn("[Jobs] DB unavailable for completeJob:", (err as Error).message?.slice(0, 80));
    const store = getInMemoryStore();
    const job = store.get(jobId);
    if (job) {
      store.set(jobId, {
        ...job,
        status: "completed",
        result,
        completedAt: new Date().toISOString(),
      });
    }
  }
}

/**
 * Record a job failure.
 *
 * If the job has remaining attempts it is re-queued (status → "queued") so a
 * future caller can claim it. Once maxAttempts is exhausted the job is
 * permanently failed.
 *
 * Returns `true` when the job will be retried, `false` when it is terminal.
 */
export async function failJob(jobId: string, errorMsg: string): Promise<boolean> {
  try {
    const current = await prisma.job.findUnique({
      where: { id: jobId },
      select: { attempts: true, maxAttempts: true },
    });

    if (!current) {
      console.error(`[Jobs] Cannot fail unknown job ${jobId}`);
      return false;
    }

    const exhausted = current.attempts >= current.maxAttempts;
    const nextStatus = exhausted ? "failed" : "queued";

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        errorMsg,
        ...(exhausted ? { completedAt: new Date() } : {}),
      },
    });

    if (exhausted) {
      console.error(`[Jobs] Job ${jobId} permanently failed after ${current.attempts} attempt(s): ${errorMsg}`);
    } else {
      console.warn(`[Jobs] Job ${jobId} failed (attempt ${current.attempts}/${current.maxAttempts}), re-queued`);
    }

    return !exhausted;
  } catch (err) {
    console.warn("[Jobs] DB unavailable for failJob:", (err as Error).message?.slice(0, 80));
    const store = getInMemoryStore();
    const job = store.get(jobId);
    if (job) {
      const exhausted = job.attempts >= job.maxAttempts;
      store.set(jobId, {
        ...job,
        status: exhausted ? "failed" : "queued",
        errorMsg,
        ...(exhausted ? { completedAt: new Date().toISOString() } : {}),
      });
      return !exhausted;
    }
    return false;
  }
}

/**
 * Retrieve a job by its ID.
 */
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    const row = await prisma.job.findUnique({ where: { id: jobId } });
    return row ? toJob(row) : null;
  } catch {
    return getInMemoryStore().get(jobId) ?? null;
  }
}

/**
 * Find the most recent job for a given task and job type.
 */
export async function getJobForTask(
  taskId: string,
  type: JobType
): Promise<Job | null> {
  try {
    const row = await prisma.job.findFirst({
      where: { taskId, type },
      orderBy: { createdAt: "desc" },
    });
    return row ? toJob(row) : null;
  } catch {
    const store = getInMemoryStore();
    let latest: Job | null = null;
    for (const job of store.values()) {
      if (job.taskId === taskId && job.type === type) {
        if (!latest || job.createdAt > latest.createdAt) latest = job;
      }
    }
    return latest;
  }
}

/**
 * Return all jobs for a given task, newest first.
 */
export async function getJobsForTask(taskId: string): Promise<Job[]> {
  try {
    const rows = await prisma.job.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toJob);
  } catch {
    const store = getInMemoryStore();
    return Array.from(store.values())
      .filter((j) => j.taskId === taskId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
