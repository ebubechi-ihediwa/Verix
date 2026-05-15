import { hashCanonical } from "@/lib/hash";
import { PaymentSummaryItem } from "@/types/trace";

export interface ReceiptCommitmentInput {
  taskId: string;
  taskInputHash: string;
  agentVersionHashes: string[];
  spendCap?: number | null;
  totalCost?: number | null;
  traceRoot: string;
  outputHash?: string | null;
  registrySnapshotHash?: string | null;
  paymentSummary: PaymentSummaryItem[];
}

/**
 * Build the single canonical payload committed by ExecutionReceipt.receiptHash.
 *
 * Proof generation and receipt generation must use this exact shape. Keeping the
 * builder shared prevents silent verifier drift when receipt fields evolve.
 */
export function buildReceiptCommitmentPayload(input: ReceiptCommitmentInput): Record<string, unknown> {
  return {
    taskId: input.taskId,
    taskInputHash: input.taskInputHash,
    agentVersionHashes: [...input.agentVersionHashes].sort(),
    spendCap: input.spendCap ?? null,
    totalCost: input.totalCost ?? null,
    traceRoot: input.traceRoot,
    outputHash: input.outputHash ?? null,
    registrySnapshotHash: input.registrySnapshotHash ?? null,
    paymentSummary: input.paymentSummary.map((p) => ({
      specialist: p.specialist,
      amount: p.amount,
      txHash: p.txHash,
      recipientAddress: p.recipientAddress,
      agentVersion: p.agentVersion,
      versionHash: p.versionHash,
      subtaskId: p.subtaskId,
      parentSubtaskId: p.parentSubtaskId,
      splitRole: p.splitRole,
      delegatedBySpecialistName: p.delegatedBySpecialistName,
    })),
  };
}

export function hashReceiptCommitment(input: ReceiptCommitmentInput): string {
  return hashCanonical(buildReceiptCommitmentPayload(input));
}
