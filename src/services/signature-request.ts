import type { ExecutionSignatureRequest } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Durable wallet-signing request store (Beta Phase 1).
 *
 * Persists the unsigned XDR + the context needed to resume a paused wallet-mode
 * execution. Additive — nothing here is part of a receipt/proof hash.
 */

export type SignatureRequestStatus =
  | "awaiting_signature"
  | "resuming"
  | "resolved"
  | "expired"
  | "failed";

/** Default time a signature request stays valid before expiring. */
export const SIGNATURE_REQUEST_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Blend op + receipt-synthesis snapshot captured at pause time. */
export interface SignatureResumeContext {
  blend: {
    operation: "supply" | "withdraw";
    asset: string;
    network: "testnet" | "mainnet";
    poolId: string;
    amount: number;
    apy: number;
    agentName: string;
    subtaskId: string;
  };
  synth: {
    description: string;
    spendCap: number;
    registrySnapshotHash?: string;
    totalSpent: number;
    payments: unknown[];
    subtasks: unknown[];
  };
}

export interface CreateSignatureRequestInput {
  taskId: string;
  projectId: string;
  sourceWallet: string;
  unsignedXdr: string;
  context: SignatureResumeContext;
  /** Override the default TTL. */
  ttlMs?: number;
  now?: Date;
}

export async function createSignatureRequest(
  input: CreateSignatureRequestInput
): Promise<ExecutionSignatureRequest> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? SIGNATURE_REQUEST_TTL_MS));
  return prisma.executionSignatureRequest.upsert({
    where: { taskId: input.taskId },
    create: {
      taskId: input.taskId,
      projectId: input.projectId,
      signingMode: "wallet",
      sourceWallet: input.sourceWallet,
      unsignedXdr: input.unsignedXdr,
      status: "awaiting_signature",
      context: input.context as unknown as object,
      expiresAt,
    },
    update: {
      sourceWallet: input.sourceWallet,
      unsignedXdr: input.unsignedXdr,
      status: "awaiting_signature",
      context: input.context as unknown as object,
      expiresAt,
      txHash: null,
      resumedAt: null,
    },
  });
}

export async function getSignatureRequest(
  taskId: string
): Promise<ExecutionSignatureRequest | null> {
  return prisma.executionSignatureRequest.findUnique({ where: { taskId } });
}

/** Owner-scoped lookup — returns null if missing OR not owned by the project. */
export async function getSignatureRequestForProject(
  projectId: string,
  taskId: string
): Promise<ExecutionSignatureRequest | null> {
  const row = await prisma.executionSignatureRequest.findUnique({ where: { taskId } });
  if (!row || row.projectId !== projectId) return null;
  return row;
}

export function isExpired(req: ExecutionSignatureRequest, now: Date = new Date()): boolean {
  return req.expiresAt.getTime() <= now.getTime();
}

export function parseContext(req: ExecutionSignatureRequest): SignatureResumeContext {
  return req.context as unknown as SignatureResumeContext;
}

/**
 * Atomically claim a pending request for resume (awaiting_signature → resuming).
 * Returns true only for the caller that wins the race; concurrent/duplicate
 * resume calls get false and should treat the request as already in progress.
 */
export async function claimResume(taskId: string): Promise<boolean> {
  const res = await prisma.executionSignatureRequest.updateMany({
    where: { taskId, status: "awaiting_signature" },
    data: { status: "resuming" },
  });
  return res.count === 1;
}

export async function markResolved(taskId: string, txHash: string): Promise<void> {
  await prisma.executionSignatureRequest.update({
    where: { taskId },
    data: { status: "resolved", txHash, resumedAt: new Date() },
  });
}

export async function markExpired(taskId: string): Promise<void> {
  await prisma.executionSignatureRequest
    .updateMany({ where: { taskId, status: "awaiting_signature" }, data: { status: "expired" } })
    .catch(() => {});
}

/** Revert a failed resume claim back to awaiting_signature so it can be retried. */
export async function releaseClaim(taskId: string): Promise<void> {
  await prisma.executionSignatureRequest
    .updateMany({ where: { taskId, status: "resuming" }, data: { status: "awaiting_signature" } })
    .catch(() => {});
}
