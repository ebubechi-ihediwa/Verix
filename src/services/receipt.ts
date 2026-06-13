import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/hash";
import { hashReceiptCommitment } from "@/lib/receipt-canonical";
import { computeTraceRoot } from "@/services/trace";
import { ExecutionReceipt, PaymentSummaryItem } from "@/types/trace";
import { enqueueJob, startJob, completeJob, failJob } from "@/services/jobs";
import { env } from "@/lib/env";
import { demoReceiptStore } from "@/lib/demo-store";

/**
 * Receipt Service — Issue #15
 *
 * Generates a canonical ExecutionReceipt from a completed execution.
 * The receipt commits to:
 *   - The task input (taskInputHash)
 *   - The exact AgentVersion snapshots used (agentVersionHashes)
 *   - The spend cap and total cost
 *   - The complete trace (traceRoot — hash-chained from all trace events)
 *   - The output summary (outputHash)
 *   - All on-chain payment entries with version metadata
 *
 * receiptHash = SHA-256(canonical JSON of the above fields), giving
 * downstream proof and escrow systems a single stable digest to verify.
 *
 * The receipt deliberately does NOT claim to prove LLM inference outputs;
 * it proves workflow integrity: which agents ran, in what version, at what
 * price, with what payments confirmed on-chain.
 */

// ── Mapping ───────────────────────────────────────────────────────────────────

function toReceipt(row: {
  id: string;
  taskId: string;
  taskInputHash: string;
  agentVersionHashes: string[];
  spendCap: unknown;
  totalCost: unknown;
  traceRoot: string;
  outputHash: string | null;
  registrySnapshotHash: string | null;
  anchorContractId: string | null;
  anchorTxHash: string | null;
  anchoredAt: Date | null;
  paymentSummary: unknown;
  receiptHash: string;
  status: string;
  createdAt: Date;
}): ExecutionReceipt {
  return {
    id: row.id,
    taskId: row.taskId,
    taskInputHash: row.taskInputHash,
    agentVersionHashes: row.agentVersionHashes,
    spendCap: row.spendCap != null ? Number(row.spendCap) : undefined,
    totalCost: row.totalCost != null ? Number(row.totalCost) : undefined,
    traceRoot: row.traceRoot,
    outputHash: row.outputHash ?? undefined,
    registrySnapshotHash: row.registrySnapshotHash ?? undefined,
    anchorContractId: row.anchorContractId ?? undefined,
    anchorTxHash: row.anchorTxHash ?? undefined,
    anchoredAt: row.anchoredAt?.toISOString(),
    paymentSummary: (row.paymentSummary as PaymentSummaryItem[]) ?? [],
    receiptHash: row.receiptHash,
    status: row.status as ExecutionReceipt["status"],
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Proof job wiring ──────────────────────────────────────────────────────────

async function runProofJob(receipt: ExecutionReceipt): Promise<void> {
  const job = await enqueueJob("proof_generation", { receiptId: receipt.id }, receipt.taskId);
  const claimed = await startJob(job.id);
  if (!claimed) return; // another worker claimed it

  try {
    const { generateProof } = await import("@/services/proof");
    await generateProof(receipt);
    await completeJob(job.id, { receiptId: receipt.id });
  } catch (err) {
    await failJob(job.id, err instanceof Error ? err.message : String(err));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ReceiptInput {
  taskId: string;
  description: string;
  spendCap?: number;
  totalCost?: number;
  agentVersionIds: string[];
  resultSummary?: string;
  registrySnapshotHash?: string;
  paymentBreakdown: Array<{
    specialist: string;
    amount: number;
    txHash?: string;
    to?: string;
    agentVersion?: number;
    versionHash?: string;
    subtaskId?: string;
    parentSubtaskId?: string;
    splitRole?: "primary" | "subcontractor";
    delegatedBySpecialistName?: string;
  }>;
}

/**
 * Generate (or regenerate) the ExecutionReceipt for a completed task.
 *
 * Accepts structured data from the coordinator rather than re-fetching
 * the task from the DB, avoiding a potential timing race between the
 * final task write and the receipt generation read.
 */
export async function generateReceipt(input: ReceiptInput): Promise<ExecutionReceipt> {
  const {
    taskId,
    description,
    spendCap,
    totalCost,
    agentVersionIds,
    resultSummary,
    registrySnapshotHash,
    paymentBreakdown,
  } = input;

  // Hash the raw task input so receipts commit to the exact prompt
  const taskInputHash = sha256(description);

  // Collect versionHash values from the AgentVersion snapshots that were active
  // at invocation — these prove which exact agent metadata was used
  let agentVersionHashes: string[] = [];
  if (agentVersionIds.length > 0 && env.DATABASE_URL) {
    const versions = await prisma.agentVersion.findMany({
      where: { id: { in: agentVersionIds } },
      select: { versionHash: true },
    });
    agentVersionHashes = versions.map((v) => v.versionHash);
  } else if (agentVersionIds.length > 0) {
    // In demo mode agentVersionIds are synthetic hashes already
    agentVersionHashes = agentVersionIds;
  }

  // The trace root is the eventHash of the last chained trace event
  const traceRoot = await computeTraceRoot(taskId);

  // Output hash commits to the final result summary without encoding the full LLM output
  const outputHash = resultSummary ? sha256(resultSummary) : undefined;

  // Payment summary — included verbatim so the receipt self-describes all transfers
  const paymentSummary: PaymentSummaryItem[] = paymentBreakdown.map((p) => ({
    specialist: p.specialist,
    amount: p.amount,
    txHash: p.txHash,
    recipientAddress: p.to,
    agentVersion: p.agentVersion,
    versionHash: p.versionHash,
    subtaskId: p.subtaskId,
    parentSubtaskId: p.parentSubtaskId,
    splitRole: p.splitRole,
    delegatedBySpecialistName: p.delegatedBySpecialistName,
  }));

  // Canonical receipt content — deterministic JSON so receiptHash is stable
  const receiptHash = hashReceiptCommitment({
    taskId,
    taskInputHash,
    agentVersionHashes,
    spendCap,
    totalCost,
    traceRoot,
    outputHash,
    registrySnapshotHash,
    paymentSummary,
  });

  if (!env.DATABASE_URL) {
    const receipt: ExecutionReceipt = {
      id: `receipt-${taskId}`,
      taskId,
      taskInputHash,
      agentVersionHashes,
      spendCap,
      totalCost,
      traceRoot,
      outputHash,
      registrySnapshotHash,
      paymentSummary,
      receiptHash,
      status: "proof_ready",
      createdAt: new Date().toISOString(),
    };
    demoReceiptStore.set(taskId, receipt);
    return receipt;
  }

  const row = await prisma.executionReceipt.upsert({
    where: { taskId },
    create: {
      taskId,
      taskInputHash,
      agentVersionHashes,
      spendCap: spendCap ?? null,
      totalCost: totalCost ?? null,
      traceRoot,
      outputHash: outputHash ?? null,
      registrySnapshotHash: registrySnapshotHash ?? null,
      paymentSummary: paymentSummary as unknown as object,
      receiptHash,
      status: "proof_ready",
    },
    update: {
      taskInputHash,
      agentVersionHashes,
      spendCap: spendCap ?? null,
      totalCost: totalCost ?? null,
      traceRoot,
      outputHash: outputHash ?? null,
      registrySnapshotHash: registrySnapshotHash ?? null,
      paymentSummary: paymentSummary as unknown as object,
      receiptHash,
      status: "proof_ready",
    },
  });

  const receipt = toReceipt(row);

  // Fire-and-forget proof job when proof mode is active
  if (env.PROOF_MODE !== "disabled") {
    runProofJob(receipt).catch((err) =>
      console.error("[receipt] proof job enqueue failed:", err)
    );
  }

  return receipt;
}

export async function getReceipt(taskId: string): Promise<ExecutionReceipt | null> {
  if (!env.DATABASE_URL) {
    return demoReceiptStore.get(taskId) ?? null;
  }
  const row = await prisma.executionReceipt.findUnique({ where: { taskId } });
  return row ? toReceipt(row) : null;
}
