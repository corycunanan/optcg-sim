-- CreateEnum
CREATE TYPE "LobbyInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELED');

-- CreateTable
CREATE TABLE "lobby_invites" (
    "id" TEXT NOT NULL,
    "lobby_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "status" "LobbyInviteStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lobby_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lobby_invites_to_user_id_status_idx" ON "lobby_invites"("to_user_id", "status");

-- CreateIndex
CREATE INDEX "lobby_invites_lobby_id_status_idx" ON "lobby_invites"("lobby_id", "status");

-- AddForeignKey
ALTER TABLE "lobby_invites" ADD CONSTRAINT "lobby_invites_lobby_id_fkey" FOREIGN KEY ("lobby_id") REFERENCES "lobbies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lobby_invites" ADD CONSTRAINT "lobby_invites_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lobby_invites" ADD CONSTRAINT "lobby_invites_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
