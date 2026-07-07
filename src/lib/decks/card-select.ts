/**
 * Prisma select for full card records in deck API responses.
 *
 * Shared by the deck routes so the field list can't drift between them —
 * validation reads `effectSchema` from these payloads, and a route that
 * forgets a field silently weakens deck legality checks client-side.
 */
export const CARD_SELECT = {
  id: true,
  name: true,
  color: true,
  type: true,
  cost: true,
  power: true,
  counter: true,
  life: true,
  imageUrl: true,
  banStatus: true,
  blockNumber: true,
  traits: true,
  attribute: true,
  effectText: true,
  triggerText: true,
  rarity: true,
  originSet: true,
  effectSchema: true,
} as const;
