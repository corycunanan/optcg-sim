/**
 * OPT-228 — Leaders may override the starting DON!! deck size via
 * DON_DECK_SIZE_OVERRIDE rule_modifications (e.g. OP15-058 Enel → 6 DON).
 * The size is resolved once at setup and frozen into state: runtime negation
 * of the Leader effect does not rebuild the deck.
 */

import { describe, it, expect } from "vitest";
import { buildInitialState } from "../engine/setup.js";
import type { EffectSchema } from "../engine/effect-types.js";
import type { CardData, GameInitPayload } from "../types.js";
import { CARDS } from "./helpers.js";

function noKeywords() {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

function makeLeader(id: string, overrideSize?: number): CardData {
  const schema: EffectSchema | null = overrideSize
    ? {
        card_id: id,
        card_name: id,
        card_type: "Leader",
        rule_modifications: [
          { rule_type: "DON_DECK_SIZE_OVERRIDE", size: overrideSize },
        ],
        effects: [],
      }
    : null;

  return {
    id,
    name: id,
    type: "Leader",
    color: ["Blue"],
    cost: null,
    power: 5000,
    counter: null,
    life: 4,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: schema,
    imageUrl: null,
  };
}

function makePayload(leader0: CardData, leader1: CardData): GameInitPayload {
  const deckCards = Array.from({ length: 50 }, () => ({
    cardId: CARDS.VANILLA.id,
    quantity: 1,
    cardData: CARDS.VANILLA,
  }));
  return {
    gameId: "opt-228-test",
    player1: {
      userId: "u1",
      leader: { cardId: leader0.id, quantity: 1, cardData: leader0 },
      deck: deckCards,
    },
    player2: {
      userId: "u2",
      leader: { cardId: leader1.id, quantity: 1, cardData: leader1 },
      deck: deckCards,
    },
    format: "standard",
  };
}

describe("OPT-228: variable DON!! deck size", () => {
  it("defaults to 10 DON when Leader has no DON_DECK_SIZE_OVERRIDE", () => {
    const leader = makeLeader("LEADER-STANDARD");
    const { state } = buildInitialState(makePayload(leader, leader));
    expect(state.players[0].donDeck).toHaveLength(10);
    expect(state.players[1].donDeck).toHaveLength(10);
  });

  it("Enel-style Leader with DON_DECK_SIZE_OVERRIDE=6 starts with 6 DON", () => {
    const enel = makeLeader("LEADER-ENEL-LIKE", 6);
    const opponent = makeLeader("LEADER-STANDARD");
    const { state } = buildInitialState(makePayload(enel, opponent));
    expect(state.players[0].donDeck).toHaveLength(6);
    // Opponent unaffected by player 1's override.
    expect(state.players[1].donDeck).toHaveLength(10);
  });

  it("both players carrying the override get their own size", () => {
    const enel = makeLeader("LEADER-ENEL-LIKE", 6);
    const { state } = buildInitialState(makePayload(enel, enel));
    expect(state.players[0].donDeck).toHaveLength(6);
    expect(state.players[1].donDeck).toHaveLength(6);
  });

  it("override values beyond Enel's 6 are respected (schema-driven, not hardcoded)", () => {
    const custom = makeLeader("LEADER-CUSTOM", 3);
    const opponent = makeLeader("LEADER-STANDARD");
    const { state } = buildInitialState(makePayload(custom, opponent));
    expect(state.players[0].donDeck).toHaveLength(3);
  });

  it("deck size is locked into state at setup — mid-game mutation of the schema does not rebuild", () => {
    const enel = makeLeader("LEADER-ENEL-LIKE", 6);
    const opponent = makeLeader("LEADER-STANDARD");
    const { state, cardDb } = buildInitialState(makePayload(enel, opponent));

    // Simulate the Leader effect being negated later in the game: strip the
    // rule_modifications from the live cardDb schema.
    const mutated = cardDb.get("LEADER-ENEL-LIKE");
    if (mutated?.effectSchema) {
      (mutated.effectSchema as EffectSchema).rule_modifications = [];
    }

    // The already-built donDeck is 6 and stays 6 — state is the source of truth.
    expect(state.players[0].donDeck).toHaveLength(6);
  });

  it("OP15-058 Enel schema carries DON_DECK_SIZE_OVERRIDE=6 (registry wiring check)", async () => {
    const { OP15_058_ENEL } = await import("../engine/schemas/op15.js");
    const mods = OP15_058_ENEL.rule_modifications ?? [];
    const donSize = mods.find((m) => m.rule_type === "DON_DECK_SIZE_OVERRIDE");
    expect(donSize).toBeDefined();
    expect(donSize && "size" in donSize ? donSize.size : null).toBe(6);
  });
});
