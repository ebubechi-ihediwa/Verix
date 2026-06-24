import { prisma } from "@/lib/db";
import { stellarTxExplorerUrl } from "@/lib/stellar-config";
import { anchorVerifiedReceipt } from "@/services/anchor";
import type { ExecutionReceipt } from "@/types/trace";

/**
 * Receipt anchoring (Sprint 5D).
 *
 * Thin, status-tracking wrapper over services/anchor.anchorVerifiedReceipt (which
 * owns the Soroban receipt_anchor contract call). This module persists an
 * `anchorStatus` on the receipt and is the single integration point used by the
 * verification flow.
 *
 * Guarantees:
 *  - Idempotent: an already-anchored receipt is never re-submitted on-chain.
 *  - Non-fatal: if Soroban is unavailable/unconfigured it records status="pending"
 *    and returns — it never throws, so it cannot fail an execution.
 */

export type AnchorStatus = "pending" | "anchored" | "failed";

export interface AnchorView {
  status: AnchorStatus;
  txHash: string | null;
  contractId: string | null;
  anchoredAt: string | null;
  explorerUrl: string | null;
}

/** Map a receipt row's anchor columns into the client-safe AnchorView. */
export function toAnchorView(row: {
  anchorStatus?: string | null;
  anchorTxHash?: string | null;
  anchorContractId?: string | null;
  anchoredAt?: Date | string | null;
}): AnchorView {
  const status: AnchorStatus =
    row.anchorStatus === "anchored" || row.anchorStatus === "failed"
      ? row.anchorStatus
      : "pending";
  const anchoredAt =
    row.anchoredAt instanceof Date
      ? row.anchoredAt.toISOString()
      : row.anchoredAt ?? null;
  return {
    status,
    txHash: row.anchorTxHash ?? null,
    contractId: row.anchorContractId ?? null,
    anchoredAt,
    explorerUrl: row.anchorTxHash ? stellarTxExplorerUrl(row.anchorTxHash) : null,
  };
}

async function setStatus(taskId: string, status: AnchorStatus): Promise<Date | null> {
  try {
    const row = await prisma.executionReceipt.update({
      where: { taskId },
      data: { anchorStatus: status },
      select: { anchoredAt: true },
    });
    return row.anchoredAt ?? null;
  } catch {
    return null;
  }
}

/**
 * Anchor a verified receipt on Soroban. Idempotent and non-fatal.
 * Returns the resulting AnchorView (status "anchored" on success, otherwise
 * "pending" — e.g. when Soroban is unavailable/unconfigured).
 */
export async function anchorReceipt(receipt: ExecutionReceipt): Promise<AnchorView> {
  // Idempotency: if already anchored, return the stored anchor without re-submitting.
  const existing = await prisma.executionReceipt
    .findUnique({
      where: { taskId: receipt.taskId },
      select: { anchorStatus: true, anchorTxHash: true, anchorContractId: true, anchoredAt: true },
    })
    .catch(() => null);

  if (existing?.anchorStatus === "anchored") {
    return toAnchorView(existing);
  }

  // anchorVerifiedReceipt never throws; it returns { anchored:false, reason } when
  // Soroban is unconfigured/unreachable and persists tx/contract/anchoredAt on success.
  const result = await anchorVerifiedReceipt(receipt);

  if (result.anchored) {
    const anchoredAt = await setStatus(receipt.taskId, "anchored");
    return {
      status: "anchored",
      txHash: result.txHash ?? null,
      contractId: result.contractId ?? null,
      anchoredAt: anchoredAt ? anchoredAt.toISOString() : new Date().toISOString(),
      explorerUrl:
        result.explorerUrl ?? (result.txHash ? stellarTxExplorerUrl(result.txHash) : null),
    };
  }

  // Unavailable / not configured / transient error → pending (retryable). Never fail.
  await setStatus(receipt.taskId, "pending");
  return {
    status: "pending",
    txHash: null,
    contractId: result.contractId ?? null,
    anchoredAt: null,
    explorerUrl: null,
  };
}

/** Resolve the stored anchor metadata for a receipt hash (null if unknown). */
export async function getAnchoredReceipt(receiptHash: string): Promise<AnchorView | null> {
  const row = await prisma.executionReceipt.findFirst({
    where: { receiptHash },
    select: { anchorStatus: true, anchorTxHash: true, anchorContractId: true, anchoredAt: true },
  });
  if (!row) return null;
  return toAnchorView(row);
}

/** True only when the receipt is anchored on-chain (status + tx present). */
export async function isReceiptAnchored(receiptHash: string): Promise<boolean> {
  const row = await prisma.executionReceipt.findFirst({
    where: { receiptHash },
    select: { anchorStatus: true, anchorTxHash: true },
  });
  return row?.anchorStatus === "anchored" && Boolean(row.anchorTxHash);
}
