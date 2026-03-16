-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('Leader', 'Character', 'Event', 'Stage');

-- CreateEnum
CREATE TYPE "BanStatus" AS ENUM ('LEGAL', 'BANNED', 'RESTRICTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "originSet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT[],
    "type" "CardType" NOT NULL,
    "cost" INTEGER,
    "power" INTEGER,
    "counter" INTEGER,
    "attribute" TEXT[],
    "life" INTEGER,
    "traits" TEXT[],
    "rarity" TEXT NOT NULL,
    "effectText" TEXT NOT NULL,
    "triggerText" TEXT,
    "effectSchema" JSONB,
    "imageUrl" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "banStatus" "BanStatus" NOT NULL DEFAULT 'LEGAL',
    "isReprint" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_sets" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "setLabel" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "isOrigin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "card_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "art_variants" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "set" TEXT NOT NULL,

    CONSTRAINT "art_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errata" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "effectText" TEXT NOT NULL,

    CONSTRAINT "errata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'Standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_cards" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "deck_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_authId_key" ON "users"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "cards_type_idx" ON "cards"("type");

-- CreateIndex
CREATE INDEX "cards_cost_idx" ON "cards"("cost");

-- CreateIndex
CREATE INDEX "cards_originSet_idx" ON "cards"("originSet");

-- CreateIndex
CREATE INDEX "cards_banStatus_idx" ON "cards"("banStatus");

-- CreateIndex
CREATE INDEX "cards_blockNumber_idx" ON "cards"("blockNumber");

-- CreateIndex
CREATE INDEX "card_sets_cardId_idx" ON "card_sets"("cardId");

-- CreateIndex
CREATE INDEX "card_sets_packId_idx" ON "card_sets"("packId");

-- CreateIndex
CREATE INDEX "card_sets_setLabel_idx" ON "card_sets"("setLabel");

-- CreateIndex
CREATE UNIQUE INDEX "card_sets_cardId_packId_key" ON "card_sets"("cardId", "packId");

-- CreateIndex
CREATE UNIQUE INDEX "art_variants_variantId_key" ON "art_variants"("variantId");

-- CreateIndex
CREATE INDEX "art_variants_cardId_idx" ON "art_variants"("cardId");

-- CreateIndex
CREATE INDEX "errata_cardId_idx" ON "errata"("cardId");

-- CreateIndex
CREATE INDEX "decks_userId_idx" ON "decks"("userId");

-- CreateIndex
CREATE INDEX "deck_cards_deckId_idx" ON "deck_cards"("deckId");

-- CreateIndex
CREATE UNIQUE INDEX "deck_cards_deckId_cardId_key" ON "deck_cards"("deckId", "cardId");

-- AddForeignKey
ALTER TABLE "card_sets" ADD CONSTRAINT "card_sets_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "art_variants" ADD CONSTRAINT "art_variants_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errata" ADD CONSTRAINT "errata_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
