import { taskStore } from "@/lib/task-store";
import {
  CreateTaskRequest,
  CreateTaskResponse,
  Task,
  TaskEvent,
  TaskResult,
  TaskStatus,
} from "@/types/task";
import {
  completeJob,
  enqueueJob,
  failJob,
  JobType,
  startJob,
} from "@/services/jobs";
import { getActiveAgentVersion, getSpecialistById } from "@/services/discovery";
import { Specialist } from "@/types/specialist";

type ExecutionTransition = {
  from: TaskStatus[];
  to: TaskStatus;
};

const DEFAULT_SPEND_CAP = 50;

/**
 * Current UI-facing task statuses are intentionally preserved while this
 * service becomes the durable lifecycle boundary for later trace/proof/escrow
 * states. Future states should be added here first, then mapped to UI states.
 */
const ALLOWED_TRANSITIONS: ExecutionTransition[] = [
  { from: ["pending"], to: "decomposing" },
  { from: ["decomposing"], to: "discovering" },
  { from: ["funding_pending"], to: "discovering" },
  { from: ["discovering"], to: "processing" },
  { from: ["decomposing", "discovering", "processing"], to: "failed" },
  { from: ["processing"], to: "completed" },
];

export function estimateTaskCost(
  description: string,
  requestedSpecialist?: Specialist
): Pick<
  CreateTaskResponse,
  "estimated_cost" | "subtasks"
> {
  if (requestedSpecialist) {
    const capability = requestedSpecialist.capabilities[0] ?? "general";
    return {
      estimated_cost: requestedSpecialist.priceUsdc,
      subtasks: [`${capability} (${requestedSpecialist.name})`],
    };
  }

  const lower = description.toLowerCase();
  const subtasks: string[] = [];
  let estimatedCost = 0;

  if (
    lower.includes("code") ||
    lower.includes("security") ||
    lower.includes("audit")
  ) {
    subtasks.push("Security Analysis (CodeAuditor)");
    estimatedCost += 1.0;
  }

  if (
    lower.includes("market") ||
    lower.includes("investment") ||
    lower.includes("analysis")
  ) {
    subtasks.push("Market Research (MarketAnalyst)");
    estimatedCost += 0.75;
  }

  if (
    lower.includes("memo") ||
    lower.includes("report") ||
    lower.includes("write")
  ) {
    subtasks.push("Professional Writing (CreativeWriter)");
    estimatedCost += 0.5;
  }

  if (subtasks.length === 0) {
    subtasks.push("General Analysis (Coordinator)");
    estimatedCost = 2.25;
  }

  return { estimated_cost: estimatedCost, subtasks };
}

export async function listExecutions(): Promise<Task[]> {
  return taskStore.getAll();
}

export async function getExecution(id: string): Promise<Task | undefined> {
  return taskStore.getById(id);
}

export async function deleteExecution(id: string): Promise<boolean> {
  return taskStore.delete(id);
}

export async function createExecution(
  request: CreateTaskRequest,
  ownerId?: string
): Promise<{ task: Task; estimate: Pick<CreateTaskResponse, "estimated_cost" | "subtasks"> }> {
  const description = request.description.trim();
  const requestedSpecialist = request.requestedSpecialistId
    ? await getSpecialistById(request.requestedSpecialistId)
    : undefined;
  const requestedVersion = requestedSpecialist
    ? await getActiveAgentVersion(requestedSpecialist.id)
    : null;
  const task: Task = {
    id: crypto.randomUUID(),
    description,
    status: "pending",
    spendCap: request.spendCap ?? DEFAULT_SPEND_CAP,
    walletAddress: request.walletAddress,
    requestedSpecialistId: requestedSpecialist?.id,
    requestedSpecialistName: requestedSpecialist?.name,
    requestedAgentVersionId: requestedVersion?.id,
    requestedAgentVersionHash: requestedVersion?.versionHash,
    approvalStatus: "pending",
    events: [],
    ownerId,
    createdAt: new Date().toISOString(),
  };

  await taskStore.set(task.id, task);
  await transitionExecution(task.id, "decomposing");

  return {
    task: {
      ...task,
      status: "decomposing",
    },
    estimate: estimateTaskCost(description, requestedSpecialist),
  };
}

/**
 * Enqueue and immediately start a coordinator execution job.
 *
 * The job row is written to the database BEFORE the runner is invoked, so a
 * process crash or serverless timeout cannot make the in-flight task
 * disappear silently. The job is claimed atomically (queued → running) before
 * the runner fires, preventing double-execution on concurrent requests.
 *
 * Returns the durable job ID so the caller can expose it to clients for
 * status polling.
 */
export async function startExecution(
  task: Task,
  runner: (taskId: string, description: string, spendCap?: number, walletAddress?: string, requestedSpecialistId?: string) => Promise<void>,
  jobType: JobType = "coordinator_execution"
): Promise<string> {
  const payload: Record<string, unknown> = {
    taskId: task.id,
    description: task.description,
    spendCap: task.spendCap ?? null,
    walletAddress: task.walletAddress ?? null,
    requestedSpecialistId: task.requestedSpecialistId ?? null,
  };

  // Enqueue is idempotent: returns existing non-failed job if one exists
  const job = await enqueueJob(jobType, payload, task.id);

  // If the job is already running or done, another caller got there first
  if (job.status === "running" || job.status === "completed") {
    console.log(`[Execution] Job ${job.id} already ${job.status} — skipping duplicate start`);
    return job.id;
  }

  // Atomic claim: only one concurrent caller wins the queued → running race
  const claimed = await startJob(job.id);
  if (!claimed) {
    console.log(`[Execution] Job ${job.id} claimed by concurrent request — skipping`);
    return job.id;
  }

  // Run in the background; the job row tracks state durably
  void (async () => {
    try {
      await runner(task.id, task.description, task.spendCap, task.walletAddress, task.requestedSpecialistId);
      await completeJob(job.id, { taskId: task.id });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown execution failure";
      console.error(`[Execution] Task ${task.id} runner failed:`, error);
      const willRetry = await failJob(job.id, msg);
      if (!willRetry) {
        // Job has exhausted all retries — surface the failure on the task
        await failExecution(task.id, msg);
      }
    }
  })();

  return job.id;
}

export async function transitionExecution(
  taskId: string,
  to: TaskStatus,
  updates: Partial<Task> = {}
): Promise<void> {
  const task = await taskStore.getById(taskId);
  if (!task) {
    throw new Error(`Cannot transition missing execution: ${taskId}`);
  }

  const allowed = ALLOWED_TRANSITIONS.some(
    (transition) => transition.to === to && transition.from.includes(task.status)
  );

  if (!allowed && task.status !== to) {
    throw new Error(`Invalid execution transition ${task.status} -> ${to}`);
  }

  await taskStore.update(taskId, {
    ...updates,
    status: to,
  });
}

export async function updateExecution(
  taskId: string,
  updates: Partial<Task>
): Promise<void> {
  const task = await taskStore.getById(taskId);
  if (!task) {
    throw new Error(`Cannot update missing execution: ${taskId}`);
  }

  await taskStore.update(taskId, updates);
}

export async function appendExecutionEvent(
  taskId: string,
  event: Omit<TaskEvent, "timestamp">
): Promise<void> {
  const task = await taskStore.getById(taskId);
  if (!task) {
    throw new Error(`Cannot append event to missing execution: ${taskId}`);
  }

  await taskStore.update(taskId, {
    events: [
      ...(task.events || []),
      { ...event, timestamp: new Date().toISOString() },
    ],
  });
}

export async function completeExecution(
  taskId: string,
  result: TaskResult,
  totalCost: number
): Promise<void> {
  await transitionExecution(taskId, "completed", {
    result,
    totalCost,
    completedAt: new Date().toISOString(),
  });
}

export async function failExecution(taskId: string, reason: string): Promise<void> {
  await appendExecutionEvent(taskId, {
    type: "system",
    status: "error",
    message: reason,
  }).catch((error) => {
    console.error(`[Execution] Failed to append failure event for ${taskId}:`, error);
  });

  await transitionExecution(taskId, "failed", {
    completedAt: new Date().toISOString(),
  }).catch(async (error) => {
    console.error(`[Execution] Failed transition failed for ${taskId}:`, error);
    await taskStore.update(taskId, {
      status: "failed",
      completedAt: new Date().toISOString(),
    });
  });
}
