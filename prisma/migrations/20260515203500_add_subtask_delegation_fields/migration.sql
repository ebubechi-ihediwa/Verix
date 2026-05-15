ALTER TABLE "Subtask" ADD COLUMN "parentSubtaskId" TEXT;
ALTER TABLE "Subtask" ADD COLUMN "delegatedBySpecialistName" TEXT;
ALTER TABLE "Subtask" ADD COLUMN "delegationDepth" INTEGER NOT NULL DEFAULT 0;
