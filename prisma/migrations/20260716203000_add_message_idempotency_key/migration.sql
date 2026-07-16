-- Existing rows predate client-generated idempotency keys. Their globally
-- unique message ids are safe backfill values and keep the column required for
-- every row after this migration.
ALTER TABLE "messages" ADD COLUMN "idempotencyKey" TEXT;

UPDATE "messages"
SET "idempotencyKey" = "id";

ALTER TABLE "messages"
ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "messages_fromUserId_toUserId_idempotencyKey_key"
ON "messages"("fromUserId", "toUserId", "idempotencyKey");
