import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyProof } from "@/services/proof";
import { createExecution, startExecution } from "@/services/execution";
import { executeCoordinator } from "@/services/coordinator";
import { getAgent } from "@/lib/v1-agents";
import type {
  CreateExecutionRequest,
  CreateExecutionResponse,
  ExecutionDetail,
  ExecutionListItem,
  ReceiptVerifyResponse,
} from "@/types/sdk";

/** Read the developer-facing agent name from a Specialist's config envelope. */
function agentDisplayName(config: unknown, fallback: string): string {
  const raw = (config ?? {}) as { name?: unknown };
  return typeof raw.name === "string" ? raw.name : fallback;
}

/**
 * Project-scoped, read-only views over execution data for the SDK gateway.
 *
 * Tasks/receipts are filtered by the owning project's id via Task.projectId.
 * Anything not owned by the project (including legacy projectId=null rows) is
 * invisible — callers translate `null` into a 404 with no existence leak.
 */

function toNum(d: Prisma.Decimal | null): number | null {
  return d === null || d === undefined ? null : Number(d);
}

export async function listExecutions(projectId: string): Promise<ExecutionListItem[]> {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { receipt: { select: { receiptHash: true } } },
  });

  return tasks.map((t) => ({
    id: t.id,
    description: t.description,
    status: t.status,
    agentId: t.agentId ?? null,
    totalCost: toNum(t.totalCost),
    spendCap: toNum(t.spendCap),
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    receiptHash: t.receipt?.receiptHash ?? null,
  }));
}

export async function getExecutionDetail(
  projectId: string,
  id: string
): Promise<ExecutionDetail | null> {
  const t = await prisma.task.findFirst({
    where: { id, projectId },
    include: { receipt: true },
  });
  if (!t) return null;

  // Resolve the developer-facing agent (name from config.name, project-scoped).
  let agent: ExecutionDetail["agent"] = null;
  if (t.agentId) {
    const spec = await prisma.specialist.findFirst({
      where: { id: t.agentId, projectId },
      select: { id: true, name: true, config: true },
    });
    if (spec) agent = { id: spec.id, name: agentDisplayName(spec.config, spec.name) };
  }

  const traceEventCount = await prisma.executionTraceEvent.count({ where: { taskId: t.id } });

  return {
    id: t.id,
    description: t.description,
    status: t.status,
    agentId: t.agentId ?? null,
    agent,
    totalCost: toNum(t.totalCost),
    spendCap: toNum(t.spendCap),
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    receiptHash: t.receipt?.receiptHash ?? null,
    result: t.result ?? null,
    trace:
      traceEventCount > 0
        ? { root: t.receipt?.traceRoot ?? "", eventCount: traceEventCount }
        : null,
    receipt: t.receipt
      ? {
          receiptHash: t.receipt.receiptHash,
          traceRoot: t.receipt.traceRoot,
          totalCost: toNum(t.receipt.totalCost),
          spendCap: toNum(t.receipt.spendCap),
          status: t.receipt.status,
          createdAt: t.receipt.createdAt.toISOString(),
        }
      : null,
  };
}

/**
 * Create a project-scoped execution and run it through the existing coordinator.
 *
 * The chosen agent is validated as belonging to the project, then the task is
 * PINNED to it (requestedSpecialistId) and recorded with projectId + agentId.
 * The coordinator resolves the agent's PUBLIC name (config.name) everywhere, so
 * the internal `vx_agent_<hex>` Specialist.name never leaks into trace/receipt.
 * The agent's v1 AgentVersion makes proof constraint 4 (membership) pass.
 * Returns null if the agent is missing or not owned by the project (route → 404).
 */
export async function createProjectExecution(
  projectId: string,
  ownerId: string,
  input: CreateExecutionRequest
): Promise<CreateExecutionResponse | null> {
  const agent = await getAgent(projectId, input.agentId);
  if (!agent) return null;

  const description = (input.description ?? input.mandate ?? "").trim();

  const { task } = await createExecution(
    {
      description,
      spendCap: input.spendCap,
      walletAddress: input.walletAddress,
      projectId,
      agentId: agent.id,
      // Pin execution to the selected project agent.
      requestedSpecialistId: agent.id,
    },
    ownerId
  );

  const jobId = await startExecution(task, executeCoordinator);

  return {
    id: task.id,
    status: task.status,
    agentId: agent.id,
    jobId,
    createdAt: task.createdAt,
  };
}

/** Resolve a receipt by hash, scoped to the project (via its task). Null = 404. */
export async function getReceiptForProject(projectId: string, receiptHash: string) {
  const receipt = await prisma.executionReceipt.findFirst({
    where: { receiptHash },
    include: { task: { select: { projectId: true } } },
  });
  if (!receipt || receipt.task.projectId !== projectId) return null;
  return receipt;
}

async function buildVerifyResponse(
  receiptHash: string,
  proofId: string,
  errorOverride?: string
): Promise<ReceiptVerifyResponse> {
  const p = await prisma.proof.findUnique({ where: { id: proofId } });
  if (!p) return { receiptHash, verified: false, proof: null };
  return {
    receiptHash,
    verified: p.status === "verified",
    proof: {
      id: p.id,
      status: p.status,
      schemaVersion: p.schemaVersion,
      journal: p.status === "verified" ? p.journal : null,
      verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      error: errorOverride ?? p.errorMsg ?? null,
    },
  };
}

/**
 * Verify the proof backing a receipt, scoped to the project.
 *   - null            → receipt not found / not owned by project (404)
 *   - proof: null     → receipt has no proof record yet
 *   - otherwise runs the existing verifier (idempotent) and returns its status
 */
export async function verifyReceiptForProject(
  projectId: string,
  receiptHash: string
): Promise<ReceiptVerifyResponse | null> {
  const receipt = await getReceiptForProject(projectId, receiptHash);
  if (!receipt) return null;

  const proof = await prisma.proof.findUnique({ where: { receiptId: receipt.id } });
  if (!proof) return { receiptHash, verified: false, proof: null };

  try {
    await verifyProof(proof.id);
    return buildVerifyResponse(receiptHash, proof.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    return buildVerifyResponse(receiptHash, proof.id, msg);
  }
}
