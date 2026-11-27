/**
 * OPT-1059: event payload fields the board needs to animate Life and mill
 * moves. Life to hand names the side the Life card showed (`sourceFace`), and
 * a deck trash (mill) names the cards it moved, top card first.
 */
import { describe, expect, it } from "vitest";
import type { GameState, LifeCard } from "../types.js";
import { executeMill } from "../engine/effect-resolver/actions/draw-search.js";
import { executeLifeToHand } from "../engine/effect-resolver/actions/life.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

describe("OPT-1059 motion payloads", () => {
  it("names the milled cards by their new trash ids, top card first", () => {
    const db = createTestCardDb();
    const state: GameState = createBattleReadyState(db);
    const top = state.players[0].deck.slice(0, 2).map((card) => card.cardId);
    const r = executeMill(
      state,
      { type: "MILL", params: { amount: 2 } },
      state.players[0].leader.instanceId,
      0,
      db,
      new Map(),
    );
    const event = r.events.find((e) => e.type === "CARD_TRASHED");
    expect(event?.payload).toMatchObject({ count: 2, reason: "mill", from: "DECK" });
    const cards = (event?.payload as { cards?: { instanceId: string; cardId: string }[] }).cards;
    expect(cards?.map((card) => card.cardId)).toEqual(top);
    const trashIds = new Set(r.state.players[0].trash.map((card) => card.instanceId));
    for (const card of cards ?? []) expect(trashIds.has(card.instanceId)).toBe(true);
  });

  it.each(["UP", "DOWN"] as const)(
    "carries a %s Life card's side on its way to the hand",
    (face) => {
      const db = createTestCardDb();
      const state: GameState = createBattleReadyState(db);
      state.players[0].life = state.players[0].life.map(
        (card): LifeCard => ({ ...card, face }),
      );
      const r = executeLifeToHand(
        state,
        { type: "LIFE_TO_HAND", params: { amount: 1, position: "TOP" } },
        state.players[0].leader.instanceId,
        0,
        db,
        new Map(),
      );
      const event = r.events.find((e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE");
      expect(event?.payload).toMatchObject({ sourceFace: face });
    },
  );
});
