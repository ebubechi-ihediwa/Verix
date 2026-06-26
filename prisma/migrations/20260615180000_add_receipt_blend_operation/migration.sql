-- Sprint 7B: Blend supply operation display metadata (additive, backwards compatible)
-- Adds ExecutionReceipt.blendOperation (JSONB). NOT part of receiptHash — the
-- operation is cryptographically committed via traceRoot (blend_*_confirmed
-- trace events). Legacy/non-Blend receipts keep blendOperation = NULL.

-- AlterTable
ALTER TABLE "ExecutionReceipt" ADD COLUMN "blendOperation" JSONB;
