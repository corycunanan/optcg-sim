-- Record the testOrder column that already exists on the Neon dev branch.
-- OPT-262 marks this migration as applied there with `prisma migrate resolve`.
ALTER TABLE "decks" ADD COLUMN "testOrder" JSONB;
