-- Existing presence rows predate session authentication and intentionally
-- remain unauthenticated. They cannot pass the new token check and will age
-- out through the existing short presence TTL.
ALTER TABLE "Presence" ADD COLUMN "tokenHash" TEXT;

-- Support bounded mailbox cleanup and signal deletion without table scans.
CREATE INDEX "Signal_fromId_idx" ON "Signal"("fromId");
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");
