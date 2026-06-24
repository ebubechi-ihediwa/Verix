-- Sprint 5A: project-scoped execution via /api/v1/executions (additive)
-- Adds Task.agentId — the project Specialist chosen through the SDK gateway.
-- Linkage only; the coordinator still routes normally. No drops or renames.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "agentId" TEXT;

-- CreateIndex
CREATE INDEX "Task_agentId_idx" ON "Task"("agentId");
