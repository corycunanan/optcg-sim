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

describe("deckBuilderReducer save revisions", () => {
  it("clears dirty state when the saved revision is still current", () => {
    let state = deckBuilderReducer(createInitialState(), {
      type: "SET_NAME",
      name: "Saved name",
    });
    state = deckBuilderReducer(state, { type: "SAVE_START" });
    state = deckBuilderReducer(state, {
      type: "SAVE_SUCCESS",
      id: "deck-1",
    });

    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
    expect(state.saveRevision).toBeNull();
  });

  it("keeps edits made after save started dirty when that save resolves", () => {
    let state = deckBuilderReducer(createInitialState(), {
      type: "SET_NAME",
      name: "Name sent to server",
    });
    state = deckBuilderReducer(state, { type: "SAVE_START" });
    state = deckBuilderReducer(state, {
      type: "SET_NAME",
      name: "Newer local name",
    });
    state = deckBuilderReducer(state, {
      type: "SAVE_SUCCESS",
      id: "deck-1",
    });

    expect(state.name).toBe("Newer local name");
    expect(state.isDirty).toBe(true);
    expect(state.isSaving).toBe(false);
    expect(state.saveRevision).toBeNull();
  });
});

describe("deckBuilderReducer deck customization", () => {
  it("changes the sleeve from default to custom and back to default", () => {
    let state = createInitialState();

    state = deckBuilderReducer(state, {
      type: "SET_SLEEVE",
      sleeveUrl: "/images/card-sleeves/custom.jpg",
    });
    expect(state.sleeveUrl).toBe("/images/card-sleeves/custom.jpg");

    state = deckBuilderReducer(state, {
      type: "SET_SLEEVE",
      sleeveUrl: null,
    });
    expect(state.sleeveUrl).toBeNull();
    expect(state.isDirty).toBe(true);
    expect(state.editRevision).toBe(2);
  });

  it("changes DON art from default to custom and back to default", () => {
    let state = createInitialState();

    state = deckBuilderReducer(state, {
      type: "SET_DON_ART",
      donArtUrl: "/images/DON/custom.jpg",
    });
    expect(state.donArtUrl).toBe("/images/DON/custom.jpg");

    state = deckBuilderReducer(state, {
      type: "SET_DON_ART",
      donArtUrl: null,
    });
    expect(state.donArtUrl).toBeNull();
    expect(state.isDirty).toBe(true);
    expect(state.editRevision).toBe(2);
  });
});
