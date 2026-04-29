-- DropForeignKey
ALTER TABLE "lobbies" DROP CONSTRAINT "lobbies_hostDeckId_fkey";

-- DropForeignKey
ALTER TABLE "lobby_guests" DROP CONSTRAINT "lobby_guests_deckId_fkey";

-- AddForeignKey
ALTER TABLE "lobbies" ADD CONSTRAINT "lobbies_hostDeckId_fkey" FOREIGN KEY ("hostDeckId") REFERENCES "decks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lobby_guests" ADD CONSTRAINT "lobby_guests_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
