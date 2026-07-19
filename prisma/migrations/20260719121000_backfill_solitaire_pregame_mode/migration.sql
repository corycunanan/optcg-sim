-- The preceding migration must commit before PostgreSQL permits use of the
-- newly added SOLITAIRE_RANDOM enum label.
UPDATE "lobbies"
SET "pregame_mode" = 'SOLITAIRE_RANDOM'
WHERE "mode" = 'SOLITAIRE'
  AND "pregame_mode" = 'PRIORITY_ROLL';
