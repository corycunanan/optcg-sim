-- Retain the newest active lobby per host before enforcing the invariant.
-- Ties are ordered by id so the cleanup remains deterministic.
WITH ranked_waiting_lobbies AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "hostUserId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS row_number
  FROM "lobbies"
  WHERE "status" = 'WAITING'
)
UPDATE "lobbies" AS lobby
SET "status" = 'CLOSED'
FROM ranked_waiting_lobbies AS ranked
WHERE lobby."id" = ranked."id"
  AND ranked.row_number > 1;

-- This partial unique index serves host/status WAITING lookups while ensuring
-- a concurrent create cannot leave more than one active lobby for a host.
CREATE UNIQUE INDEX "lobbies_waiting_host_unique"
  ON "lobbies" ("hostUserId")
  WHERE "status" = 'WAITING';
