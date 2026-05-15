import { Task } from "@/types/task";
import { prisma } from "@/lib/db";

type DbTaskWithSubtasks = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.task.findFirst<{
        include: { subtasks: true };
      }>
    >
  >
>;

/**
 * Write-through task storage: in-memory Map + Prisma persistence.
 * Prisma is the durable source of truth; the Map is only a hot cache that
 * survives Turbopack/HMR during local development.
 */
class TaskStore {
  /* package-visible for HMR migration */
  tasks: Map<string, Task> = new Map();
  private loadPromise: Promise<void> | null = null;

  private toTask(t: DbTaskWithSubtasks): Task {
    return {
      id: t.id,
      description: t.description,
      status: t.status as Task["status"],
      totalCost: t.totalCost ? Number(t.totalCost) : undefined,
      spendCap: t.spendCap ? Number(t.spendCap) : undefined,
      result: t.result as unknown as Task["result"],
      events: (t.events as unknown as Task["events"]) ?? [],
      walletAddress: (t as unknown as { walletAddress?: string | null }).walletAddress ?? undefined,
      requestedSpecialistId: (t as unknown as { requestedSpecialistId?: string | null }).requestedSpecialistId ?? undefined,
      requestedSpecialistName: (t as unknown as { requestedSpecialistName?: string | null }).requestedSpecialistName ?? undefined,
      requestedAgentVersionId: (t as unknown as { requestedAgentVersionId?: string | null }).requestedAgentVersionId ?? undefined,
      requestedAgentVersionHash: (t as unknown as { requestedAgentVersionHash?: string | null }).requestedAgentVersionHash ?? undefined,
      approvalStatus: ((t as unknown as { approvalStatus?: string | null }).approvalStatus as Task["approvalStatus"]) ?? "pending",
      approvedAt: (t as unknown as { approvedAt?: Date | null }).approvedAt?.toISOString(),
      approvedByWallet: (t as unknown as { approvedByWallet?: string | null }).approvedByWallet ?? undefined,
      approvalResultHash: (t as unknown as { approvalResultHash?: string | null }).approvalResultHash ?? undefined,
      ownerId: (t as unknown as { ownerId?: string | null }).ownerId ?? undefined,
      subtasks:
        t.subtasks?.map((s) => ({
          id: s.id,
          capability: s.capability,
          specialistId: s.specialistId ?? undefined,
          specialistName: s.specialistName ?? undefined,
          status: s.status as Task["status"],
          cost: s.cost ? Number(s.cost) : undefined,
          result: s.result ?? undefined,
          agentVersionId: s.agentVersionId ?? undefined,
        })) ?? [],
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString(),
    };
  }

  /** Load all tasks from the database into memory (runs once, waits if in-flight) */
  private ensureLoaded(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const dbTasks = await prisma.task.findMany({
          include: { subtasks: true },
          orderBy: { createdAt: "desc" },
        });
        for (const t of dbTasks) {
          // Only load tasks not already in memory (in-flight tasks win)
          if (!this.tasks.has(t.id)) {
            this.tasks.set(t.id, this.toTask(t));
          }
        }
        console.log(`[TaskStore] Loaded ${dbTasks.length} task(s) from database`);
      } catch (error) {
        console.error("[TaskStore] Failed to load from database:", error);
      }
    })();
    return this.loadPromise;
  }

  async set(id: string, task: Task): Promise<void> {
    this.tasks.set(id, task);
    console.log(`[TaskStore] Stored task ${id}, total tasks: ${this.tasks.size}`);

    try {
      await prisma.task.upsert({
        where: { id },
        create: {
          id,
          description: task.description,
          status: task.status,
          totalCost: task.totalCost,
          spendCap: task.spendCap,
          result: task.result as object ?? undefined,
          events: task.events as object[] ?? [],
          walletAddress: task.walletAddress,
          requestedSpecialistId: task.requestedSpecialistId,
          requestedSpecialistName: task.requestedSpecialistName,
          requestedAgentVersionId: task.requestedAgentVersionId,
          requestedAgentVersionHash: task.requestedAgentVersionHash,
          approvalStatus: task.approvalStatus ?? "pending",
          approvedAt: task.approvedAt ? new Date(task.approvedAt) : null,
          approvedByWallet: task.approvedByWallet,
          approvalResultHash: task.approvalResultHash,
          ownerId: task.ownerId,
          createdAt: new Date(task.createdAt),
          completedAt: task.completedAt ? new Date(task.completedAt) : null,
        },
        update: {
          description: task.description,
          status: task.status,
          totalCost: task.totalCost,
          spendCap: task.spendCap,
          result: task.result as object ?? undefined,
          events: task.events as object[] ?? [],
          walletAddress: task.walletAddress,
          requestedSpecialistId: task.requestedSpecialistId,
          requestedSpecialistName: task.requestedSpecialistName,
          requestedAgentVersionId: task.requestedAgentVersionId,
          requestedAgentVersionHash: task.requestedAgentVersionHash,
          approvalStatus: task.approvalStatus ?? "pending",
          approvedAt: task.approvedAt ? new Date(task.approvedAt) : null,
          approvedByWallet: task.approvedByWallet,
          approvalResultHash: task.approvalResultHash,
          ownerId: task.ownerId,
          completedAt: task.completedAt ? new Date(task.completedAt) : null,
        },
      });
      await this.persistSubtasks(id, task);
    } catch (error) {
      console.error(`[TaskStore] Failed to persist task ${id}:`, error);
    }
  }

  get(id: string): Task | undefined {
    const task = this.tasks.get(id);
    console.log(`[TaskStore] Retrieved task ${id}: ${task ? "found" : "not found"}`);
    return task;
  }

  async getById(id: string): Promise<Task | undefined> {
    const cached = this.tasks.get(id);
    if (cached) return cached;

    try {
      const dbTask = await prisma.task.findUnique({
        where: { id },
        include: { subtasks: true },
      });
      if (!dbTask) return undefined;
      const task = this.toTask(dbTask);
      this.tasks.set(id, task);
      return task;
    } catch (error) {
      console.error(`[TaskStore] Failed to load task ${id} from database:`, error);
      return undefined;
    }
  }

  async update(id: string, updates: Partial<Task>): Promise<void> {
    const existing = this.tasks.get(id) ?? await this.getById(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.tasks.set(id, updated);
      console.log(`[TaskStore] Updated task ${id}`);

      try {
        await prisma.task.update({
          where: { id },
          data: {
            status: updated.status,
            totalCost: updated.totalCost,
            spendCap: updated.spendCap,
            result: updated.result as object ?? undefined,
            events: updated.events as object[] ?? [],
            walletAddress: updated.walletAddress,
            requestedSpecialistId: updated.requestedSpecialistId,
            requestedSpecialistName: updated.requestedSpecialistName,
            requestedAgentVersionId: updated.requestedAgentVersionId,
            requestedAgentVersionHash: updated.requestedAgentVersionHash,
            approvalStatus: updated.approvalStatus ?? "pending",
            approvedAt: updated.approvedAt ? new Date(updated.approvedAt) : null,
            approvedByWallet: updated.approvedByWallet,
            approvalResultHash: updated.approvalResultHash,
            ownerId: updated.ownerId,
            completedAt: updated.completedAt ? new Date(updated.completedAt) : null,
          },
        });
        await this.persistSubtasks(id, updated);
      } catch (error) {
        console.error(`[TaskStore] Failed to persist update for task ${id}:`, error);
      }
    } else {
      console.warn(`[TaskStore] Cannot update non-existent task ${id}`);
    }
  }

  has(id: string): boolean {
    return this.tasks.has(id);
  }

  async delete(id: string): Promise<boolean> {
    const cached = this.tasks.delete(id);
    const persisted = cached ? undefined : await this.getById(id);
    const existed = cached || Boolean(persisted);
    this.tasks.delete(id);
    console.log(`[TaskStore] Deleted task ${id}: ${existed}`);
    if (existed) {
      try {
        await prisma.payment.deleteMany({ where: { taskId: id } });
        await prisma.subtask.deleteMany({ where: { taskId: id } });
        await prisma.task.delete({ where: { id } });
      } catch (error) {
        console.error(`[TaskStore] Failed to delete task ${id} from DB:`, error);
      }
    }
    return existed;
  }

  clear(): void {
    this.tasks.clear();
    console.log("[TaskStore] Cleared all cached tasks");
  }

  size(): number {
    return this.tasks.size;
  }

  async getAll(): Promise<Task[]> {
    await this.ensureLoaded();
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private async persistSubtasks(taskId: string, task: Task): Promise<void> {
    if (!task.subtasks) return;

    const specialistNames = task.subtasks
      .map((s) => s.specialistName)
      .filter((name): name is string => Boolean(name));
    const specialists = specialistNames.length > 0
      ? await prisma.specialist.findMany({
        where: { name: { in: specialistNames } },
        select: { id: true, name: true },
      })
      : [];
    const specialistIdByName = new Map(specialists.map((s) => [s.name, s.id]));

    await prisma.$transaction(
      task.subtasks.map((subtask) =>
        prisma.subtask.upsert({
          where: { id: subtask.id },
          create: {
            id: subtask.id,
            taskId,
            capability: subtask.capability,
            specialistId: subtask.specialistId ?? (
              subtask.specialistName
                ? specialistIdByName.get(subtask.specialistName)
                : undefined
            ),
            specialistName: subtask.specialistName,
            status: subtask.status,
            cost: subtask.cost,
            result: subtask.result,
            agentVersionId: subtask.agentVersionId ?? null,
            completedAt: subtask.status === "completed" ? new Date() : null,
          },
          update: {
            capability: subtask.capability,
            specialistId: subtask.specialistId ?? (
              subtask.specialistName
                ? specialistIdByName.get(subtask.specialistName)
                : undefined
            ),
            specialistName: subtask.specialistName,
            status: subtask.status,
            cost: subtask.cost,
            result: subtask.result,
            agentVersionId: subtask.agentVersionId ?? null,
            completedAt: subtask.status === "completed" ? new Date() : null,
          },
        })
      )
    );
  }
}

// Use globalThis to survive Turbopack/HMR module re-evaluations in dev mode
const globalForTaskStore = globalThis as unknown as {
  __taskStore: TaskStore | undefined;
};

function getOrCreateStore(): TaskStore {
  const cached = globalForTaskStore.__taskStore;
  if (cached && typeof cached.getAll === "function") {
    return cached;
  }
  const fresh = new TaskStore();
  if (cached) {
    try {
      const oldTasks = (cached as unknown as { tasks: Map<string, Task> }).tasks;
      if (oldTasks instanceof Map) {
        oldTasks.forEach((task, id) => fresh.tasks.set(id, task));
        console.log(`[TaskStore] Migrated ${oldTasks.size} task(s) from stale instance`);
      }
    } catch {
      // ignore migration errors
    }
  }
  return fresh;
}

export const taskStore = getOrCreateStore();

if (process.env.NODE_ENV !== "production") {
  globalForTaskStore.__taskStore = taskStore;
}
