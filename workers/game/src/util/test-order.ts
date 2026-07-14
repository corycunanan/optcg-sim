import type { PlayerInitData } from "../types.js";

const OPENING_HAND_SIZE = 5;

/**
 * Validate the deterministic setup order before any deck state is built.
 * testOrder is a trusted-server testing hook, but invalid data must still fail
 * closed rather than silently changing the game to a random shuffle.
 */
export function assertValidTestOrder(player: PlayerInitData): void {
  const testOrder = player.testOrder;
  if (!testOrder) return;

  const leaderLife =
    player.leader.cardData.life ?? player.leader.cardData.cost ?? 5;
  if (testOrder.life.length !== leaderLife) {
    throw new Error(
      `PlayerInitData.testOrder.life must contain exactly ${leaderLife} cards`
    );
  }
  if (testOrder.hand.length !== OPENING_HAND_SIZE) {
    throw new Error(
      `PlayerInitData.testOrder.hand must contain exactly ${OPENING_HAND_SIZE} cards`
    );
  }

  const available = new Map<string, number>();
  for (const entry of player.deck) {
    available.set(
      entry.cardId,
      (available.get(entry.cardId) ?? 0) + entry.quantity
    );
  }

  for (const [zone, cardIds] of [
    ["hand", testOrder.hand],
    ["life", testOrder.life],
  ] as const) {
    for (const cardId of cardIds) {
      const remaining = available.get(cardId) ?? 0;
      if (remaining === 0) {
        throw new Error(
          `PlayerInitData.testOrder.${zone} references unavailable card '${cardId}'`
        );
      }
      available.set(cardId, remaining - 1);
    }
  }
}
