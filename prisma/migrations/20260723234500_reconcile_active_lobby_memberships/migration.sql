-- Follow-up reconciliation for the already-applied OPT-518 migration.
--
-- The first backfill could close an IN_GAME lobby when the same user had a
-- newer WAITING/READY room. Its UPDATE stamped every affected lobby during
-- that migration's recorded execution window, so a CLOSED lobby in that
-- window with an IN_PROGRESS game is eligible for repair. Existing IN_GAME
-- lobbies always rank first; repair candidates rank next by game start time.

-- Prisma's shadow-database drift check does not expose its internal
-- _prisma_migrations table. Use the exact recorded window during a normal
-- deploy and a conservative sequential-deploy window in the shadow database.
CREATE TEMP TABLE "_opt518_initial_backfill_window" (
  "started_at" TIMESTAMPTZ NOT NULL,
  "finished_at" TIMESTAMPTZ NOT NULL
) ON COMMIT DROP;

DO $$
BEGIN
  IF to_regclass('_prisma_migrations') IS NOT NULL THEN
    EXECUTE $query$
      INSERT INTO "_opt518_initial_backfill_window" (
        "started_at",
        "finished_at"
      )
      SELECT "started_at", "finished_at"
      FROM "_prisma_migrations"
      WHERE "migration_name" =
        '20260723223000_multi_game_lobbies_active_membership'
        AND "rolled_back_at" IS NULL
        AND "finished_at" IS NOT NULL
      ORDER BY "finished_at" DESC
      LIMIT 1
    $query$;
  ELSE
    INSERT INTO "_opt518_initial_backfill_window" (
      "started_at",
      "finished_at"
    ) VALUES (
      CURRENT_TIMESTAMP - INTERVAL '1 hour',
      CURRENT_TIMESTAMP
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "_opt518_initial_backfill_window"
  ) <> 1 THEN
    RAISE EXCEPTION
      'OPT-518 reconciliation: expected exactly one backfill window row';
  END IF;
END
$$;

-- Two protected live lobbies for one user cannot be reconciled without
-- choosing a game to abandon. Count both explicitly IN_GAME lobbies and
-- CLOSED lobbies that the initial backfill may have damaged, then abort.
DO $$
BEGIN
  IF EXISTS (
    WITH protected_live_lobbies AS (
      SELECT lobby."id", lobby."hostUserId"
      FROM "lobbies" AS lobby
      CROSS JOIN "_opt518_initial_backfill_window" AS initial_backfill
      WHERE lobby."status" = 'IN_GAME'
         OR (
           lobby."status" = 'CLOSED'
           AND lobby."updatedAt" BETWEEN
             initial_backfill."started_at" AND initial_backfill."finished_at"
           AND EXISTS (
             SELECT 1
             FROM "game_sessions" AS game
             WHERE game."lobbyId" = lobby."id"
               AND game."status" = 'IN_PROGRESS'
           )
         )
    ),
    protected_live_memberships AS (
      SELECT lobby."hostUserId" AS user_id, lobby."id" AS lobby_id
      FROM protected_live_lobbies AS lobby

      UNION

      SELECT guest."userId" AS user_id, lobby."id" AS lobby_id
      FROM "lobby_guests" AS guest
      JOIN protected_live_lobbies AS lobby ON lobby."id" = guest."lobbyId"
    )
    SELECT user_id
    FROM protected_live_memberships
    GROUP BY user_id
    HAVING COUNT(DISTINCT lobby_id) > 1
  ) THEN
    RAISE EXCEPTION
      'OPT-518 reconciliation requires manual resolution: a user belongs to multiple protected live lobbies';
  END IF;
END
$$;

CREATE TEMP TABLE "_opt518_lobby_reconciliation" ON COMMIT DROP AS
WITH initial_backfill AS (
  SELECT "started_at", "finished_at"
  FROM "_opt518_initial_backfill_window"
),
candidate_lobbies AS (
  SELECT
    lobby."id",
    lobby."hostUserId",
    lobby."status",
    lobby."updatedAt",
    live_game."startedAt" AS live_game_started_at,
    (
      lobby."status" = 'CLOSED'
      AND live_game."startedAt" IS NOT NULL
      AND lobby."updatedAt" BETWEEN
        initial_backfill."started_at" AND initial_backfill."finished_at"
    ) AS was_closed_by_initial_backfill
  FROM "lobbies" AS lobby
  CROSS JOIN initial_backfill
  LEFT JOIN LATERAL (
    SELECT MAX(game."startedAt") AS "startedAt"
    FROM "game_sessions" AS game
    WHERE game."lobbyId" = lobby."id"
      AND game."status" = 'IN_PROGRESS'
  ) AS live_game ON TRUE
  WHERE lobby."status" <> 'CLOSED'
     OR (
       live_game."startedAt" IS NOT NULL
       AND lobby."updatedAt" BETWEEN
         initial_backfill."started_at" AND initial_backfill."finished_at"
     )
),
candidate_memberships AS (
  SELECT
    lobby."hostUserId" AS user_id,
    lobby."id" AS lobby_id,
    lobby."status" AS lobby_status,
    lobby."updatedAt" AS lobby_updated_at,
    lobby.live_game_started_at,
    (
      lobby."status" = 'IN_GAME'
      OR lobby.was_closed_by_initial_backfill
    ) AS is_live_candidate
  FROM candidate_lobbies AS lobby

  UNION

  SELECT
    guest."userId" AS user_id,
    lobby."id" AS lobby_id,
    lobby."status" AS lobby_status,
    lobby."updatedAt" AS lobby_updated_at,
    lobby.live_game_started_at,
    (
      lobby."status" = 'IN_GAME'
      OR lobby.was_closed_by_initial_backfill
    ) AS is_live_candidate
  FROM "lobby_guests" AS guest
  JOIN candidate_lobbies AS lobby ON lobby."id" = guest."lobbyId"
),
ranked_memberships AS (
  SELECT
    user_id,
    lobby_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        is_live_candidate DESC,
        (lobby_status = 'IN_GAME') DESC,
        live_game_started_at DESC NULLS LAST,
        lobby_updated_at DESC,
        lobby_id DESC
    ) AS row_number
  FROM candidate_memberships
),
conflicting_lobbies AS (
  SELECT DISTINCT lobby_id
  FROM ranked_memberships
  WHERE row_number > 1
),
repair_candidates AS (
  SELECT id AS lobby_id
  FROM candidate_lobbies
  WHERE was_closed_by_initial_backfill
)
SELECT
  lobby."id" AS lobby_id,
  conflicting.lobby_id IS NOT NULL AS should_close,
  repair_candidate.lobby_id IS NOT NULL
    AND conflicting.lobby_id IS NULL AS should_restore_live
FROM candidate_lobbies AS lobby
LEFT JOIN conflicting_lobbies AS conflicting
  ON conflicting.lobby_id = lobby."id"
LEFT JOIN repair_candidates AS repair_candidate
  ON repair_candidate.lobby_id = lobby."id";

UPDATE "lobbies" AS lobby
SET
  "status" = 'CLOSED',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_opt518_lobby_reconciliation" AS reconciliation
WHERE lobby."id" = reconciliation.lobby_id
  AND reconciliation.should_close;

UPDATE "lobbies" AS lobby
SET
  "status" = 'IN_GAME',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_opt518_lobby_reconciliation" AS reconciliation
WHERE lobby."id" = reconciliation.lobby_id
  AND reconciliation.should_restore_live;

-- Rebuild pointers from the reconciled active set so users in restored games,
-- including otherwise non-conflicting opponents, regain their membership.
UPDATE "users"
SET "active_lobby_id" = NULL;

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
