CREATE TYPE "GameEndReasonCode" AS ENUM (
  'LEADER_KO',
  'DECK_OUT',
  'LIFE_LOSS',
  'CONCEDE',
  'DISCONNECT_TIMEOUT',
  'FALLBACK_CONCEDE',
  'UNKNOWN'
);

ALTER TABLE "game_sessions" ADD COLUMN "reasonCode" "GameEndReasonCode";
