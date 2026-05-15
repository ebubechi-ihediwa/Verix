ALTER TABLE "Task" ADD COLUMN "walletAddress" TEXT;
ALTER TABLE "Task" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Task" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "approvedByWallet" TEXT;
ALTER TABLE "Task" ADD COLUMN "approvalResultHash" TEXT;
