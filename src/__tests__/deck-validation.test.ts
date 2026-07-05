import { describe, expect, it } from "vitest";

import {
  validateDeck,
  type DeckCard,
  type DeckLeader,
} from "../lib/deck-builder/validation";

const topLevelCopyLimitOverride = {
  rule_modifications: [
    { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
  ],
  effects: [],
};

const effectBlockCopyLimitOverride = {
  effects: [
    {
      id: "unlimited_copies",
      category: "rule_modification",
      rule: { rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" },
    },
  ],
};

function makeCard(
  cardId: string,
  name: string,
  quantity: number,
  effectSchema: unknown = null
): DeckCard {
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
      effectSchema,
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
  return validateDeck(leader, cards).results.find(
    (r) => r.id === "copy-limit"
  )!;
}

describe("validateDeck copy limit", () => {
  it("fails a normal card above 4 copies", () => {
    const result = copyLimitResult([makeCard("OP16-048", "Buggy", 5)]);
    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OP16-048"]);
  });

  it("does not allow formerly hardcoded IDs without a schema rule", () => {
    const result = copyLimitResult([makeCard("OP01-075", "Pacifista", 8)]);
    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OP01-075"]);
  });

  it("allows any number of copies for top-level COPY_LIMIT_OVERRIDE rules", () => {
    const result = copyLimitResult([
      makeCard("OP01-075", "Pacifista", 20, topLevelCopyLimitOverride),
    ]);
    expect(result.passed).toBe(true);
  });

  it("allows any number of copies for rule-modification effect blocks", () => {
    const result = copyLimitResult([
      makeCard("OP08-072", "Biscuit Warrior", 12, effectBlockCopyLimitOverride),
    ]);
    expect(result.passed).toBe(true);
  });

  it("still flags normal cards alongside an unlimited card", () => {
    const result = copyLimitResult([
      makeCard(
        "OP16-042",
        "Prisoner of Impel Down",
        30,
        effectBlockCopyLimitOverride
      ),
      makeCard("OP16-050", "Miss Olive", 6),
    ]);
    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OP16-050"]);
  });
});
