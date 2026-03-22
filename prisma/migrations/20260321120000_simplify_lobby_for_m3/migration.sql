-- Simplify lobby system for M3: remove ready states, invites, visibility, public lobbies.
-- Guest joining now auto-starts the game.

-- Drop lobby_invites table and its enum
DROP TABLE IF EXISTS "lobby_invites";
DROP TYPE IF EXISTS "LobbyInviteStatus";

-- Close any lobbies in READY state before removing the enum value
UPDATE "lobbies" SET "status" = 'WAITING' WHERE "status" = 'READY';

-- Remove READY from LobbyStatus enum (must drop default first)
ALTER TABLE "lobbies" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "LobbyStatus_new" AS ENUM ('WAITING', 'IN_GAME', 'CLOSED');
ALTER TABLE "lobbies" ALTER COLUMN "status" TYPE "LobbyStatus_new" USING ("status"::text::"LobbyStatus_new");
DROP TYPE "LobbyStatus";
ALTER TYPE "LobbyStatus_new" RENAME TO "LobbyStatus";
ALTER TABLE "lobbies" ALTER COLUMN "status" SET DEFAULT 'WAITING'::"LobbyStatus";

-- Fill NULL join_code values before making column required
UPDATE "lobbies" SET "join_code" = UPPER(SUBSTR(MD5(RANDOM()::text), 1, 6)) WHERE "join_code" IS NULL;

-- Drop columns no longer needed
ALTER TABLE "lobbies" DROP COLUMN IF EXISTS "visibility";
ALTER TABLE "lobbies" DROP COLUMN IF EXISTS "host_ready";
ALTER TABLE "lobbies" DROP COLUMN IF EXISTS "guest_ready";

-- Make join_code required (no longer nullable)
ALTER TABLE "lobbies" ALTER COLUMN "join_code" SET NOT NULL;

-- Drop the LobbyVisibility enum
DROP TYPE IF EXISTS "LobbyVisibility";

-- Replace the compound index with a simpler one
DROP INDEX IF EXISTS "lobbies_status_visibility_idx";
CREATE INDEX "lobbies_status_idx" ON "lobbies"("status");
