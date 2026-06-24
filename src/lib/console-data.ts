import { prisma } from "@/lib/db";
import { resolvePublicName } from "@/services/discovery";
import type { ProofJournal } from "@/types/proof";
import type { ConsoleExecutionRow, ConsoleVerificationRow } from "@/types/sdk";

/**
 * Project-scoped, read-only aggregations for the Developer Console tabs.
 *
 * Cookie-authed (the console routes gate with requireUser + getOwnedProject);
 * this module only takes a projectId and never imports the coordinator, so the
 * console route bundles stay light. Agent names are always the PUBLIC name
 * (config.name) — the internal vx_agent_ sentinel is never surfaced.
 */

const HEX64 = /^[0-9a-f]{64}$/;

/** Map agentId → public display name (config.name), resolved in one query. */
async function agentNameMap(agentIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(agentIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.specialist.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, config: true },
  });
  return new Map(rows.map((r) => [r.id, resolvePublicName(r.name, r.config)]));
}

/** Executions + receipt/proof status for the Receipts tab. */
export async function listProjectExecutions(projectId: string): Promise<ConsoleExecutionRow[]> {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      receipt: { select: { receiptHash: true, anchorStatus: true, anchorTxHash: true } },
    },
  });
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);
  const proofs = await prisma.proof.findMany({
    where: { taskId: { in: taskIds } },
    select: { taskId: true, status: true },
  });
  const proofByTask = new Map(proofs.map((p) => [p.taskId, p.status]));
  const names = await agentNameMap(tasks.map((t) => t.agentId));

  return tasks.map((t) => ({
    id: t.id,
    status: t.status,
    agentName: t.agentId ? names.get(t.agentId) ?? null : null,
    receiptHash: t.receipt?.receiptHash ?? null,
    proofStatus: proofByTask.get(t.id) ?? null,
    anchorStatus: t.receipt ? t.receipt.anchorStatus ?? "pending" : null,
    anchorTxHash: t.receipt?.anchorTxHash ?? null,
    createdAt: t.createdAt.toISOString(),
  }));
}

/** Proof/journal rows (the 5 constraints) for the Verifications tab. */
export async function listProjectVerifications(projectId: string): Promise<ConsoleVerificationRow[]> {
  const tasks = await prisma.task.findMany({ where: { projectId }, select: { id: true } });
  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length === 0) return [];

  const proofs = await prisma.proof.findMany({
    where: { taskId: { in: taskIds } },
    orderBy: { createdAt: "desc" },
  });

  // Anchor state lives on the receipt — join by taskId.
  const receipts = await prisma.executionReceipt.findMany({
    where: { taskId: { in: taskIds } },
    select: { taskId: true, anchorStatus: true, anchoredAt: true },
  });
  const anchorByTask = new Map(
    receipts.map((r) => [r.taskId, { status: r.anchorStatus, anchoredAt: r.anchoredAt }])
  );

  return proofs.map((p) => {
    const j = (p.journal ?? null) as ProofJournal | null;
    const constraints = j
      ? {
          receiptIntegrity: Boolean(j.receiptIntegrityOk),
          spendCap: Boolean(j.spendCapOk),
          paymentCorrect: Boolean(j.paymentCorrect),
          agentMembership: Boolean(j.agentMembershipOk),
          // Constraint 5 isn't stored as a boolean; derive it from the trace root.
          traceCommitment: typeof j.traceRoot === "string" && HEX64.test(j.traceRoot),
        }
      : null;
    const anchor = anchorByTask.get(p.taskId);
    return {
      taskId: p.taskId,
      receiptHash: p.receiptHash,
      status: p.status,
      verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      constraints,
      anchorStatus: anchor ? anchor.status ?? "pending" : null,
      anchoredAt: anchor?.anchoredAt ? anchor.anchoredAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    };
  });
}
