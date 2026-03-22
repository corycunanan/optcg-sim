-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "lobbies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
