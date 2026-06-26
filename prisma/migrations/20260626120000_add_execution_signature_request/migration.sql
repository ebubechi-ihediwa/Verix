-- Beta Phase 1: durable wallet-signing requests (additive, backwards compatible)
-- Persists the unsigned XDR + resume context so a wallet-mode execution can pause
-- (Task.status="awaiting_signature") and resume after the user signs. Not part of
-- any receipt/proof hash.

-- CreateTable
CREATE TABLE "ExecutionSignatureRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "signingMode" TEXT NOT NULL DEFAULT 'wallet',
    "sourceWallet" TEXT NOT NULL,
    "unsignedXdr" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_signature',
    "txHash" TEXT,
    "context" JSONB NOT NULL,
    "resumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionSignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionSignatureRequest_taskId_key" ON "ExecutionSignatureRequest"("taskId");
CREATE INDEX "ExecutionSignatureRequest_projectId_idx" ON "ExecutionSignatureRequest"("projectId");
CREATE INDEX "ExecutionSignatureRequest_status_idx" ON "ExecutionSignatureRequest"("status");
