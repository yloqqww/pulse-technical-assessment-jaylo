CREATE TABLE "SessionBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionBlock_pkey" PRIMARY KEY ("blockerId", "blockedId")
);

CREATE TABLE "SafetyReport" (
    "id" TEXT NOT NULL,
    "reporterSessionId" TEXT NOT NULL,
    "reportedSessionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SafetyReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionBlock_blockedId_idx" ON "SessionBlock"("blockedId");
CREATE UNIQUE INDEX "SafetyReport_reporterSessionId_reportedSessionId_key" ON "SafetyReport"("reporterSessionId", "reportedSessionId");
CREATE INDEX "SafetyReport_reportedSessionId_idx" ON "SafetyReport"("reportedSessionId");
CREATE INDEX "SafetyReport_expiresAt_idx" ON "SafetyReport"("expiresAt");

ALTER TABLE "SessionBlock" ADD CONSTRAINT "SessionBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Presence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionBlock" ADD CONSTRAINT "SessionBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "Presence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
