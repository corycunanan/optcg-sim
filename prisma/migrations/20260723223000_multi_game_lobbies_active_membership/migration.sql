-- OPT-518 active-lobby invariant:
-- `users.active_lobby_id` is the single source of truth for a user's current
-- lobby. Application transactions claim it when hosting/joining and release
-- it when leaving/closing. A lobby may have multiple active members, while a
-- user row can point to only one lobby.
--
-- Historical dev data predates this invariant. Soft-close any active lobby
-- that is not the newest active lobby for every member before backfilling the
-- pointer. Rows and GameSession history are preserved.
ALTER TABLE "users"
  ADD COLUMN "active_lobby_id" TEXT;

WITH active_memberships AS (
  SELECT
    lobby."hostUserId" AS user_id,
    lobby."id" AS lobby_id,
    lobby."updatedAt" AS lobby_updated_at
  FROM "lobbies" AS lobby
  WHERE lobby."status" <> 'CLOSED'

  UNION

  SELECT
    guest."userId" AS user_id,
    lobby."id" AS lobby_id,
    lobby."updatedAt" AS lobby_updated_at
  FROM "lobby_guests" AS guest
  JOIN "lobbies" AS lobby ON lobby."id" = guest."lobbyId"
  WHERE lobby."status" <> 'CLOSED'
),
ranked_memberships AS (
  SELECT
    user_id,
    lobby_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY lobby_updated_at DESC, lobby_id DESC
    ) AS row_number
  FROM active_memberships
),
conflicting_lobbies AS (
  SELECT DISTINCT lobby_id
  FROM ranked_memberships
  WHERE row_number > 1
)
UPDATE "lobbies" AS lobby
SET
  "status" = 'CLOSED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM conflicting_lobbies AS conflicting
WHERE lobby."id" = conflicting.lobby_id;

WITH active_memberships AS (
  SELECT lobby."hostUserId" AS user_id, lobby."id" AS lobby_id
  FROM "lobbies" AS lobby
  WHERE lobby."status" <> 'CLOSED'

  UNION

  SELECT guest."userId" AS user_id, lobby."id" AS lobby_id
  FROM "lobby_guests" AS guest
  JOIN "lobbies" AS lobby ON lobby."id" = guest."lobbyId"
  WHERE lobby."status" <> 'CLOSED'
)
UPDATE "users" AS app_user
SET "active_lobby_id" = membership.lobby_id
FROM active_memberships AS membership
WHERE app_user."id" = membership.user_id;

ALTER TABLE "users"
  ADD CONSTRAINT "users_active_lobby_id_fkey"
  FOREIGN KEY ("active_lobby_id")
  REFERENCES "lobbies"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "users_active_lobby_id_idx"
  ON "users"("active_lobby_id");

-- The pointer supersedes the narrower WAITING-host-only invariant.
DROP INDEX "lobbies_waiting_host_unique";

-- A lobby persists across games and owns ordered historical sessions.
DROP INDEX "game_sessions_lobbyId_key";

CREATE INDEX "game_sessions_lobbyId_idx"
  ON "game_sessions"("lobbyId");
