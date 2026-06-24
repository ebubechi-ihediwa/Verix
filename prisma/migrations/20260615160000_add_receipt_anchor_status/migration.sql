-- Sprint 5D: Soroban receipt anchoring status (additive, backwards compatible)
-- Adds ExecutionReceipt.anchorStatus to track "pending" | "anchored" | "failed".
-- Anchoring is best-effort and idempotent; a null/pending value means not yet
-- anchored (e.g. Soroban unavailable). No drops or renames.

-- AlterTable
ALTER TABLE "ExecutionReceipt" ADD COLUMN "anchorStatus" TEXT;
