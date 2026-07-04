import { describe, expect, it } from "vitest";

import { validateDeck, type DeckCard, type DeckLeader } from "../lib/deck-builder/validation";

function makeCard(cardId: string, name: string, quantity: number): DeckCard {
  return {
    cardId,
    quantity,
    card: {
      id: cardId,
      name,
      color: ["Blue"],
      type: "Character",
      cost: 1,
      power: 1000,
      counter: 1000,
      imageUrl: "",
      banStatus: "LEGAL",
      blockNumber: 6,
      traits: ["Impel Down"],
      rarity: "C",
    },
  };
}

const leader: DeckLeader = {
  id: "OP16-041",
  name: "Buggy",
  color: ["Blue"],
  type: "Leader",
  life: 5,
  power: 5000,
  imageUrl: "",
  traits: ["Impel Down"],
  effectText: "",
};

function copyLimitResult(cards: DeckCard[]) {
  return validateDeck(leader, cards).results.find((r) => r.id === "copy-limit")!;
}

describe("validateDeck copy limit", () => {
  it("fails a normal card above 4 copies", () => {
    const result = copyLimitResult([makeCard("OP16-048", "Buggy", 5)]);
    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OP16-048"]);
  });

  it("allows any number of copies for COPY_LIMIT_OVERRIDE cards", () => {
    const result = copyLimitResult([
      makeCard("OP16-042", "Prisoner of Impel Down", 20),
      makeCard("OP01-075", "Pacifista", 8),
    ]);
    expect(result.passed).toBe(true);
  });

  it("normalizes variant suffixes before checking the override list", () => {
    const result = copyLimitResult([
      makeCard("OP16-042_p1", "Prisoner of Impel Down", 12),
    ]);
    expect(result.passed).toBe(true);
  });

  it("still flags normal cards alongside an unlimited card", () => {
    const result = copyLimitResult([
      makeCard("OP16-042", "Prisoner of Impel Down", 30),
      makeCard("OP16-050", "Miss Olive", 6),
    ]);
    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OP16-050"]);
  });
});
