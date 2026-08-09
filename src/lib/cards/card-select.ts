import type { Prisma } from "@prisma/client";

/**
 * Card projection for the deck-builder search grid and card-info tooltip.
 */
export const CARD_SEARCH_SELECT = {
  id: true,
  name: true,
  color: true,
  type: true,
  cost: true,
  power: true,
  counter: true,
  life: true,
  traits: true,
  attribute: true,
  effectText: true,
  triggerText: true,
  imageUrl: true,
  banStatus: true,
  blockNumber: true,
  rarity: true,
  originSet: true,
} as const satisfies Prisma.CardSelect;

/** Public card database projection matching the card browser client contract. */
export const CARD_BROWSER_SELECT = {
  id: true,
  originSet: true,
  name: true,
  color: true,
  type: true,
  cost: true,
  power: true,
  counter: true,
  attribute: true,
  traits: true,
  rarity: true,
  effectText: true,
  triggerText: true,
  imageUrl: true,
  blockNumber: true,
  banStatus: true,
  isReprint: true,
  _count: { select: { artVariants: true } },
  cardSets: {
    where: { isOrigin: true },
    take: 1,
    select: { setLabel: true },
  },
} as const satisfies Prisma.CardSelect;
