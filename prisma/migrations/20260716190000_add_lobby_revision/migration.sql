-- Add a monotonic application-managed version for lobby room snapshots.
ALTER TABLE "lobbies" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
