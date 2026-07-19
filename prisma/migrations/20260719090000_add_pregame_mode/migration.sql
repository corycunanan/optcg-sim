-- Snapshot the host-selected pre-game flow on both the lobby and game session.
-- The database defaults keep old application versions safe when this migration
-- is deployed before the new lobby/start code.
CREATE TYPE "PregameMode" AS ENUM (
  'PRIORITY_ROLL',
  'HOST_FIRST',
  'GUEST_FIRST',
  'RANDOM_FIXED'
);

ALTER TABLE "lobbies"
  ADD COLUMN "pregame_mode" "PregameMode" NOT NULL DEFAULT 'PRIORITY_ROLL';

ALTER TABLE "game_sessions"
  ADD COLUMN "pregame_mode" "PregameMode" NOT NULL DEFAULT 'PRIORITY_ROLL';
