-- Existing rows are short-lived anonymous sessions. Give any row still alive
-- during deployment a safe temporary value, then remove the database default
-- so every new session must explicitly provide an intent.
ALTER TABLE "Presence" ADD COLUMN "intent" TEXT NOT NULL DEFAULT 'talk';
ALTER TABLE "Presence" ALTER COLUMN "intent" DROP DEFAULT;
