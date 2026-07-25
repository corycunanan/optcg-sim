-- AlterTable
ALTER TABLE "lobbies" ADD COLUMN     "allow_spectators" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lobby_spectators" (
    "id" TEXT NOT NULL,
    "lobby_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lobby_spectators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lobby_spectators_user_id_idx" ON "lobby_spectators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lobby_spectators_lobby_id_user_id_key" ON "lobby_spectators"("lobby_id", "user_id");

-- AddForeignKey
ALTER TABLE "lobby_spectators" ADD CONSTRAINT "lobby_spectators_lobby_id_fkey" FOREIGN KEY ("lobby_id") REFERENCES "lobbies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lobby_spectators" ADD CONSTRAINT "lobby_spectators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
