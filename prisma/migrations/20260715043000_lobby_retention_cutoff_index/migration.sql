-- Replace the status-only index with one that also serves the daily retention
-- sweep's status + updatedAt cutoff while retaining status-prefix lookups.
DROP INDEX "lobbies_status_idx";

CREATE INDEX "lobbies_status_updatedAt_id_idx"
  ON "lobbies" ("status", "updatedAt", "id");
