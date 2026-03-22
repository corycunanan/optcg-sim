-- AddColumn: per-player ready flags for lobby countdown flow
ALTER TABLE "lobbies" ADD COLUMN "host_ready" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "lobbies" ADD COLUMN "guest_ready" BOOLEAN NOT NULL DEFAULT false;
