-- CreateIndex
CREATE INDEX "decks_leaderId_idx" ON "decks"("leaderId");

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
