ALTER TABLE "cards"
ADD COLUMN IF NOT EXISTS "effectTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "effectTraits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "cards_effectTags_idx" ON "cards" USING GIN ("effectTags");
CREATE INDEX IF NOT EXISTS "cards_effectTraits_idx" ON "cards" USING GIN ("effectTraits");
