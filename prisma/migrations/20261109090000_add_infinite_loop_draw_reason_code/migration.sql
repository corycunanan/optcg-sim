-- OPT-952: rule 11-1-1-1 draw for an infinite loop neither player can stop.
-- AlterEnum
ALTER TYPE "GameEndReasonCode" ADD VALUE 'INFINITE_LOOP_DRAW';
