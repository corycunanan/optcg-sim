-- Add deck customization columns: sleeve, DON art, and per-card art variant selection

-- Deck-level customization
ALTER TABLE "decks" ADD COLUMN "sleeveUrl" TEXT;
ALTER TABLE "decks" ADD COLUMN "donArtUrl" TEXT;

-- Per-card art variant selection
ALTER TABLE "deck_cards" ADD COLUMN "selectedArtUrl" TEXT;
