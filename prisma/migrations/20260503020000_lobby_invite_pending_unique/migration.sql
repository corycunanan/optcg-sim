-- Enforce: at most one *live* PENDING invite per (lobby, recipient) at a time.
-- The POST /api/lobbies/[id]/invite route sweeps stale PENDING rows
-- (status PENDING but past expiresAt) to EXPIRED before insertion, so a
-- naturally expired invite doesn't permanently block re-invites.
-- Partial-index expressions in Postgres must be IMMUTABLE, so we can't
-- include `expires_at > NOW()`; the app-level sweep covers the gap.
CREATE UNIQUE INDEX "lobby_invites_lobby_id_to_user_id_pending_unique"
  ON "lobby_invites" ("lobby_id", "to_user_id")
  WHERE status = 'PENDING';
