-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "player1DeckId" TEXT NOT NULL,
    "player2DeckId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "winnerId" TEXT,
    "winReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_action_logs" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "playerIndex" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionData" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_lobbyId_key" ON "game_sessions"("lobbyId");

-- CreateIndex
CREATE INDEX "game_sessions_player1Id_idx" ON "game_sessions"("player1Id");

-- CreateIndex
CREATE INDEX "game_sessions_player2Id_idx" ON "game_sessions"("player2Id");

-- CreateIndex
CREATE INDEX "game_sessions_status_idx" ON "game_sessions"("status");

-- CreateIndex
CREATE INDEX "game_action_logs_gameSessionId_timestamp_idx" ON "game_action_logs"("gameSessionId", "timestamp");

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_action_logs" ADD CONSTRAINT "game_action_logs_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
