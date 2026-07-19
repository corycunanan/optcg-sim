-- PostgreSQL allows enum values to be added transactionally, but a newly
-- added value cannot be used until that transaction commits. This migration
-- only extends the type; application writes begin after deployment completes.
ALTER TYPE "PregameMode" ADD VALUE 'SIDE_A_FIRST';
ALTER TYPE "PregameMode" ADD VALUE 'SIDE_B_FIRST';
ALTER TYPE "PregameMode" ADD VALUE 'SOLITAIRE_RANDOM';
