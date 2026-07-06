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

const rayleighRestrictionSchema = {
  rule_modifications: [
    {
      rule_type: "DECK_RESTRICTION",
      restriction: "CANNOT_INCLUDE",
      filter: { cost_min: 5 },
    },
  ],
};

const imuRestrictionSchema = {
  rule_modifications: [
    {
      rule_type: "DECK_RESTRICTION",
      restriction: "CANNOT_INCLUDE",
      filter: { card_type: "EVENT", cost_min: 2 },
    },
  ],
};

const namiRestrictionSchema = {
  effects: [
    {
      id: "deck_restriction",
      category: "rule_modification",
      rule: {
        rule_type: "DECK_RESTRICTION",
        restriction: "ONLY_INCLUDE",
        filter: { traits: ["East Blue"] },
      },
    },
  ],
};

function makeCard(
  cardId: string,
  name: string,
  quantity: number,
  effectSchema: unknown = null,
  overrides: Partial<DeckCard["card"]> = {}
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
      ...overrides,
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

describe("validateDeck leader deck restrictions", () => {
  it("rejects cost 5+ cards for OP12-001 Silvers Rayleigh", () => {
    const rayleigh: DeckLeader = {
      ...leader,
      id: "OP12-001",
      name: "Silvers Rayleigh",
      effectSchema: rayleighRestrictionSchema,
    };
    const result = validateDeck(rayleigh, [
      makeCard("OP12-010", "Legal Low Cost", 4, null, { cost: 4 }),
      makeCard("OP12-011", "Illegal High Cost", 4, null, { cost: 5 }),
    ]).results.find((r) => r.id === "leader-deck-restriction")!;

    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OP12-011"]);
  });

  it("only rejects Events with cost 2+ for OP13-079 Imu", () => {
    const imu: DeckLeader = {
      ...leader,
      id: "OP13-079",
      name: "Imu",
      effectSchema: imuRestrictionSchema,
    };
    const result = validateDeck(imu, [
      makeCard("OP13-090", "Legal Event", 4, null, {
        type: "Event",
        cost: 1,
      }),
      makeCard("OP13-091", "Legal Character", 4, null, {
        type: "Character",
        cost: 2,
      }),
      makeCard("OP13-092", "Illegal Event", 4, null, {
        type: "Event",
        cost: 2,
      }),
    ]).results.find((r) => r.id === "leader-deck-restriction")!;

    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OP13-092"]);
  });

  it("only allows East Blue cards for P-117 Nami", () => {
    const nami: DeckLeader = {
      ...leader,
      id: "P-117",
      name: "Nami",
      effectSchema: namiRestrictionSchema,
    };
    const result = validateDeck(nami, [
      makeCard("P-118", "Legal East Blue", 4, null, {
        traits: ["East Blue", "Straw Hat Crew"],
      }),
      makeCard("P-119", "Illegal Non-East Blue", 4, null, {
        traits: ["Straw Hat Crew"],
      }),
    ]).results.find((r) => r.id === "leader-deck-restriction")!;

    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["P-119"]);
  });
});
