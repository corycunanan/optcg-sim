-- Add Lobby Room UX schema foundations without changing current API behavior.
-- State machine: PVP lobbies move WAITING -> READY -> IN_GAME; Solitaire lobbies
-- can move WAITING -> IN_GAME once the host configures both deck slots and starts.

CREATE TYPE "LobbyMode" AS ENUM ('PVP', 'SOLITAIRE', 'PVCOMPUTER');

ALTER TYPE "LobbyStatus" ADD VALUE 'READY';

ALTER TABLE "lobbies"
  ADD COLUMN "mode" "LobbyMode" NOT NULL DEFAULT 'PVP',
  ADD COLUMN "host_ready" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "hostDeckId" DROP NOT NULL;

ALTER TABLE "lobby_guests"
  ADD COLUMN "guest_ready" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "deckId" DROP NOT NULL;

ALTER TABLE "game_sessions"
  ADD COLUMN "mode" "LobbyMode" NOT NULL DEFAULT 'PVP';
