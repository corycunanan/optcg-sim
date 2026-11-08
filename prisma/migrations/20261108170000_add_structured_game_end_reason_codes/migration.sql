-- OPT-978: structured end reasons written by the game worker's terminal writer.
-- AlterEnum
ALTER TYPE "GameEndReasonCode" ADD VALUE 'JOINT_DRAW';
ALTER TYPE "GameEndReasonCode" ADD VALUE 'CARD_EFFECT_WIN';
ALTER TYPE "GameEndReasonCode" ADD VALUE 'DECK_OUT_WIN_INSTEAD';
ALTER TYPE "GameEndReasonCode" ADD VALUE 'PREGAME_LEAVE';
ALTER TYPE "GameEndReasonCode" ADD VALUE 'ENGINE_LIMIT';
ALTER TYPE "GameEndReasonCode" ADD VALUE 'ENGINE_CONTRACT';
