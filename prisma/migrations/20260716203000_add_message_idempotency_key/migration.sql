-- PostgreSQL 16 provides gen_random_uuid() as a core function, so this does
-- not depend on the pgcrypto extension. The database default keeps inserts
-- from servers running the previous application version live-safe.
ALTER TABLE "messages" ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX "messages_fromUserId_toUserId_idempotencyKey_key"
ON "messages"("fromUserId", "toUserId", "idempotencyKey");
