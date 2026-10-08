-- CreateTable ConnectionPair
CREATE TABLE "ConnectionPair" (
    "id" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    CONSTRAINT "ConnectionPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable AbuseGuard
CREATE TABLE "AbuseGuard" (
    "id" TEXT NOT NULL,
    "targetHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AbuseGuard_pkey" PRIMARY KEY ("id")
);

-- CreateTable ModeratorAction
CREATE TABLE "ModeratorAction" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModeratorAction_pkey" PRIMARY KEY ("id")
);

-- AlterTable SafetyReport
ALTER TABLE "SafetyReport" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "SafetyReport" ADD COLUMN "actionTaken" TEXT;
ALTER TABLE "SafetyReport" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- CreateIndexes
CREATE INDEX "ConnectionPair_initiatorId_status_idx" ON "ConnectionPair"("initiatorId", "status");
CREATE INDEX "ConnectionPair_receiverId_status_idx" ON "ConnectionPair"("receiverId", "status");
CREATE INDEX "ConnectionPair_createdAt_idx" ON "ConnectionPair"("createdAt");

CREATE UNIQUE INDEX "AbuseGuard_targetHash_key" ON "AbuseGuard"("targetHash");
CREATE INDEX "AbuseGuard_targetHash_idx" ON "AbuseGuard"("targetHash");
CREATE INDEX "AbuseGuard_blockedUntil_idx" ON "AbuseGuard"("blockedUntil");

CREATE INDEX "ModeratorAction_createdAt_idx" ON "ModeratorAction"("createdAt");
CREATE INDEX "SafetyReport_status_idx" ON "SafetyReport"("status");

-- AddForeignKey
ALTER TABLE "ConnectionPair" ADD CONSTRAINT "ConnectionPair_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "Presence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionPair" ADD CONSTRAINT "ConnectionPair_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Presence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
