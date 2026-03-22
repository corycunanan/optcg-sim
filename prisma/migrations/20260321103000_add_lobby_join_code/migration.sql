ALTER TABLE "lobbies"
ADD COLUMN "join_code" TEXT;

CREATE UNIQUE INDEX "lobbies_join_code_key" ON "lobbies"("join_code");
