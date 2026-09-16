import { describe, expect, it } from "vitest";

import {
  collectDeckRestrictionRules,
  isCardAllowedByDeckRestrictionRules,
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

describe("OPT-852 restricted card numbers", () => {
  function restrictedResult(cards: DeckCard[]) {
    return validateDeck(leader, cards).results.find((r) => r.id === "restricted")!;
  }

  it.each(["_p1", "_p2", "_r1"])(
    "limits base and %s art to one total copy and reports every row",
    (suffix) => {
      const base = makeCard("OP01-075", "Base art", 1, null, {
        banStatus: "RESTRICTED",
      });
      const variant = makeCard(`OP01-075${suffix}`, "Alternate art", 1, null, {
        banStatus: "RESTRICTED",
      });
      expect(restrictedResult([base]).passed).toBe(true);
      expect(restrictedResult([variant]).passed).toBe(true);
      expect(restrictedResult([base, variant])).toMatchObject({
        passed: false,
        cardIds: [base.cardId, variant.cardId],
        message: "Base art (2), Alternate art (2) — restricted cards limited to 1 copy",
      });
    }
  );

  it.each([false, true])(
    "restricts the whole number when only one row is restricted (reverse: %s)",
    (reverse) => {
      const rows = [
        makeCard("OP01-075", "Same name", 1),
        makeCard("OP01-075_p1", "Same name", 1, null, {
          banStatus: "RESTRICTED",
        }),
      ];
      if (reverse) rows.reverse();
      expect(restrictedResult(rows)).toMatchObject({
        passed: false,
        cardIds: rows.map((row) => row.cardId),
      });
      expect(restrictedResult(rows.map((row) => ({
        ...row,
        card: { ...row.card, banStatus: "LEGAL" },
      }))).passed).toBe(true);
    }
  );

  it("keeps distinct restricted numbers separate even with the same name", () => {
    const base = makeCard("OP01-075", "Same name", 1, null, {
      banStatus: "RESTRICTED",
    });
    const distinct = makeCard("OP02-075_p1", "Same name", 1, null, {
      banStatus: "RESTRICTED",
    });
    expect(restrictedResult([base, distinct]).passed).toBe(true);
    expect(restrictedResult([
      base,
      { ...distinct, cardId: "OP01-075_p1" },
    ]).passed).toBe(false);
  });

  it("enforces restrictions and bans despite authored unlimited copies", () => {
    const rows = [
      makeCard("OP01-075", "Base art", 4, topLevelCopyLimitOverride),
      makeCard("OP01-075_p1", "Alternate art", 1, null, {
        banStatus: "RESTRICTED",
      }),
      makeCard("OP08-072", "Banned card", 8, effectBlockCopyLimitOverride, {
        banStatus: "BANNED",
      }),
    ];
    const validation = validateDeck(leader, rows);
    expect(validation.results.find((r) => r.id === "copy-limit")?.passed).toBe(true);
    expect(validation.results.find((r) => r.id === "restricted")).toMatchObject({
      passed: false,
      cardIds: ["OP01-075", "OP01-075_p1"],
      message: "Base art (5), Alternate art (5) — restricted cards limited to 1 copy",
    });
    expect(validation.results.find((r) => r.id === "ban-status")).toMatchObject({
      passed: false,
      cardIds: ["OP08-072"],
    });
  });
});

describe("validateDeck leader deck restrictions", () => {
  it("evaluates proactive dimming from the slim search-card fields", () => {
    const rules = collectDeckRestrictionRules({
      effectSchema: rayleighRestrictionSchema,
    });

    expect(
      isCardAllowedByDeckRestrictionRules(rules, {
        name: "Legal Low Cost",
        type: "Character",
        cost: 4,
        traits: [],
      })
    ).toBe(true);
    expect(
      isCardAllowedByDeckRestrictionRules(rules, {
        name: "Illegal High Cost",
        type: "Character",
        cost: 5,
        traits: [],
      })
    ).toBe(false);
  });

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

  it("applies previously-unknown keys to ONLY_INCLUDE restrictions", () => {
    const expandedLeader: DeckLeader = {
      ...leader,
      effectSchema: {
        rule_modifications: [
          {
            rule_type: "DECK_RESTRICTION",
            restriction: "ONLY_INCLUDE",
            filter: {
              color: "BLUE",
              name_includes: "Monkey",
              traits_any_of: ["Straw Hat Crew", "Navy"],
              traits_contains: ["Hat"],
              cost_max: { type: "FIXED", value: 3 },
              power_min: 5000,
            },
          },
        ],
      },
    };
    const result = validateDeck(expandedLeader, [
      makeCard("OPT-412-OK", "Monkey.D.Luffy", 4, null, {
        color: ["Blue"],
        cost: 3,
        power: 5000,
        traits: ["Straw Hat Crew"],
      }),
      makeCard("OPT-412-NAME", "Roronoa Zoro", 4, null, {
        color: ["Blue"],
        cost: 3,
        power: 5000,
        traits: ["Straw Hat Crew"],
      }),
      makeCard("OPT-412-COLOR", "Monkey.D.Garp", 4, null, {
        color: ["Red"],
        cost: 3,
        power: 5000,
        traits: ["Navy"],
      }),
      makeCard("OPT-412-COST", "Monkey.D.Dragon", 4, null, {
        color: ["Blue"],
        cost: 4,
        power: 5000,
        traits: ["Straw Hat Crew"],
      }),
    ]).results.find((r) => r.id === "leader-deck-restriction")!;

    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual([
      "OPT-412-NAME",
      "OPT-412-COLOR",
      "OPT-412-COST",
    ]);
  });

  it("applies previously-unknown keys to CANNOT_INCLUDE restrictions", () => {
    const restrictedLeader: DeckLeader = {
      ...leader,
      effectSchema: {
        rule_modifications: [
          {
            rule_type: "DECK_RESTRICTION",
            restriction: "CANNOT_INCLUDE",
            filter: {
              color_includes: ["RED", "GREEN"],
              name_any_of: ["Forbidden Event", "Forbidden Character"],
              cost_range: { min: 2, max: 4 },
            },
          },
        ],
      },
    };
    const result = validateDeck(restrictedLeader, [
      makeCard("OPT-412-BANNED", "Forbidden Event", 4, null, {
        color: ["Red"],
        type: "Event",
        cost: 2,
      }),
      makeCard("OPT-412-WRONG-NAME", "Allowed Event", 4, null, {
        color: ["Red"],
        type: "Event",
        cost: 2,
      }),
      makeCard("OPT-412-WRONG-COLOR", "Forbidden Event", 4, null, {
        color: ["Blue"],
        type: "Event",
        cost: 2,
      }),
    ]).results.find((r) => r.id === "leader-deck-restriction")!;

    expect(result.passed).toBe(false);
    expect(result.cardIds).toEqual(["OPT-412-BANNED"]);
  });

  it("fails closed for filter keys outside the shared vocabulary", () => {
    const card = {
      name: "Any Card",
      type: "Character",
      cost: 1,
      traits: [],
    };

    expect(
      isCardAllowedByDeckRestrictionRules(
        [{ restriction: "ONLY_INCLUDE", filter: { future_key: true } }],
        card
      )
    ).toBe(false);
    expect(
      isCardAllowedByDeckRestrictionRules(
        [{ restriction: "CANNOT_INCLUDE", filter: { future_key: true } }],
        card
      )
    ).toBe(true);
  });
});

// Rule 2-1-3 applies to construction; rule 5-1-2-3 still counts card numbers.
describe("OPT-788 alias deck restrictions", () => {
  const aliases = {
    rule_modifications: [
      { rule_type: "NAME_ALIAS", aliases: ["Kouzuki Oden"] },
    ],
  };
  it("keeps different card numbers separate but combines variants", () => {
    expect(
      copyLimitResult([
        makeCard("OP01-121", "Yamato", 4, aliases),
        makeCard("OP02-030", "Kouzuki Oden", 4),
      ])?.passed
    ).toBe(true);
    expect(
      copyLimitResult([
        makeCard("OP01-121", "Yamato", 4, aliases),
        makeCard("OP01-121_p1", "Yamato", 1, aliases),
      ])?.passed
    ).toBe(false);
  });
  it("preserves unlimited-copy overrides across card-number variants", () => {
    expect(
      copyLimitResult([
        makeCard("OP01-075", "Pacifista", 4, topLevelCopyLimitOverride),
        makeCard("OP01-075_p1", "Pacifista", 4, topLevelCopyLimitOverride),
      ])?.passed
    ).toBe(true);
  });
  it("applies name restrictions to aliases", () => {
    const card = makeCard("OP01-121", "Yamato", 1, aliases).card;
    expect(
      isCardAllowedByDeckRestrictionRules(
        [{ restriction: "ONLY_INCLUDE", filter: { name: "Kouzuki Oden" } }],
        card
      )
    ).toBe(true);
    expect(
      isCardAllowedByDeckRestrictionRules(
        [{ restriction: "CANNOT_INCLUDE", filter: { name: "Kouzuki Oden" } }],
        card
      )
    ).toBe(false);
  });
});
