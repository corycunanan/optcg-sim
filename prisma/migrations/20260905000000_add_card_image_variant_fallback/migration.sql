ALTER TABLE "cards"
ADD COLUMN IF NOT EXISTS "imageIsVariantFallback" BOOLEAN NOT NULL DEFAULT false;

UPDATE "cards"
SET "imageIsVariantFallback" = true
WHERE "id" IN ('ST31-004', 'ST32-002');
