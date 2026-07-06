import { describe, expect, it } from "vitest";

import {
  createInitialState,
  deckBuilderReducer,
  type DeckCardEntry,
} from "../lib/deck-builder/state";

const copyLimitOverrideSchema = {
  rule_modifications: [
    { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
  ],
  effects: [],
};

function makeCard(
  id: string,
  effectSchema: unknown = null
): DeckCardEntry["card"] {
  return {
    id,
    name: id,
    color: ["Blue"],
    type: "Character",
    cost: 1,
    power: 1000,
    counter: 1000,
    life: null,
    imageUrl: "",
    banStatus: "LEGAL",
    blockNumber: 1,
    traits: [],
    attribute: [],
    effectText: "",
    triggerText: null,
    rarity: "C",
    originSet: "OP-01",
    effectSchema,
  };
}

describe("deckBuilderReducer copy limits", () => {
  it("keeps ordinary cards capped at four copies", () => {
    let state = createInitialState();
    const card = makeCard("OP01-001");

    for (let i = 0; i < 5; i++) {
      state = deckBuilderReducer(state, { type: "ADD_CARD", card });
    }

    expect(state.cards.get(card.id)?.quantity).toBe(4);
  });

  it("allows schema-driven unlimited-copy cards above four copies", () => {
    let state = createInitialState();
    const card = makeCard("OP01-075", copyLimitOverrideSchema);

    for (let i = 0; i < 8; i++) {
      state = deckBuilderReducer(state, { type: "ADD_CARD", card });
    }

    expect(state.cards.get(card.id)?.quantity).toBe(8);
  });

  it("preserves over-four quantities when importing unlimited-copy cards", () => {
    const card = makeCard("OP08-072", copyLimitOverrideSchema);
    const state = deckBuilderReducer(createInitialState(), {
      type: "IMPORT_CARDS",
      leader: null,
      cards: [
        {
          cardId: card.id,
          quantity: 12,
          selectedArtUrl: null,
          card,
        },
      ],
    });

    expect(state.cards.get(card.id)?.quantity).toBe(12);
  });
});
