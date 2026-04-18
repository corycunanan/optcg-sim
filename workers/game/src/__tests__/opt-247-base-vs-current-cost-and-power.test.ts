/**
 * OPT-247 (E1) + OPT-248 (E2) — Base vs current cost/power in filter predicates.
 *
 * Bandai rulings:
 *   • "cost of N or less" / "power of N or less" → CURRENT (post-modifier) value.
 *   • "base cost of N or less" / "base power of N or less" → printed Layer 0.
 *
 * The engine encodes the split via flat filter keys:
 *   cost_*  / power_*        → current (effective)
 *   base_cost_* / base_power_* → base (printed)
 *
 * OPT-247 also fixes a default-flip bug: cost_* filters previously evaluated
 * against base cost when no costOverride was passed, contradicting the FAQ.
 */

import { describe, it, expect } from "vitest";
import { matchesFilter } from "../engine/conditions.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { setupGame, createTestCardDb, padChars } from "./helpers.js";

import { OP10_098_LIBERATION, OP10_026_KINEMON, OP10_027_KINEMON } from "../engine/schemas/op10.js";
import { OP09_098_BLACK_HOLE } from "../engine/schemas/op09.js";
import { OP13_077_GO_ALL_THE_WAY_TO_THE_TOP } from "../engine/schemas/op13.js";
import { EB03_021_ALVIDA, EB03_025_HINA, EB03_027_MARGUERITE } from "../engine/schemas/eb03.js";
import { ST12_001_RORONOA_ZORO_AND_SANJI } from "../engine/schemas/st12.js";
import { ST26_001_SOBA_MASK } from "../engine/schemas/st26.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeChar(id: string, cost: number, power: number): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost,
    power,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
  };
}

function makeInstance(cardId: string, instanceId: string, controller: 0 | 1 = 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

type ModifierSeed =
  | { type: "MODIFY_COST"; amount: number }
  | { type: "MODIFY_POWER"; amount: number };

/**
 * Build a state with a single character on player 1's field (the opponent from
 * player 0's perspective, matching how KO / K.O.-gate filters are typically
 * evaluated). Turn belongs to player 0, so the DON!! +1000 bonus doesn't
 * pollute power assertions on the player-1 character.
 */
function buildTarget(
  baseCost: number,
  basePower: number,
  seeds: ModifierSeed[] = [],
): { state: GameState; cardDb: Map<string, CardData>; card: CardInstance; data: CardData } {
  const { state: base } = setupGame();
  const cardDb = createTestCardDb();
  const data = makeChar("TARGET-CHAR", baseCost, basePower);
  cardDb.set(data.id, data);
  const card = makeInstance(data.id, "inst-target", 1);

  const players = [...base.players] as [PlayerState, PlayerState];
  players[1] = { ...players[1], characters: padChars([card]) };

  const activeEffects: RuntimeActiveEffect[] = seeds.map((seed, i) => ({
    id: `eff-${i}`,
    sourceCardInstanceId: `src-${i}`,
    sourceEffectBlockId: "blk",
    category: "permanent",
    modifiers: [{ type: seed.type, params: { amount: seed.amount } }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: base.turn.number },
    controller: 0,
    appliesTo: [card.instanceId],
    timestamp: i,
  }));

  const state: GameState = {
    ...base,
    players,
    activeEffects: activeEffects as GameState["activeEffects"],
    turn: { ...base.turn, activePlayerIndex: 0, phase: "MAIN" },
  };

  return { state, cardDb, card, data };
}

// ─── OPT-247 (E1) — Cost filters ─────────────────────────────────────────────

describe("OPT-247: cost_* reads current (effective) cost", () => {
  it("matches when a -2 modifier drops current below threshold (base 5, current 3, filter cost_max:3)", () => {
    const { state, cardDb, card } = buildTarget(5, 4000, [{ type: "MODIFY_COST", amount: -2 }]);
    expect(matchesFilter(card, { cost_max: 3 }, cardDb, state)).toBe(true);
  });

  it("rejects when a +2 modifier pushes current above threshold (base 3, current 5, filter cost_max:3)", () => {
    const { state, cardDb, card } = buildTarget(3, 4000, [{ type: "MODIFY_COST", amount: 2 }]);
    expect(matchesFilter(card, { cost_max: 3 }, cardDb, state)).toBe(false);
  });

  it("with no modifiers, current cost equals base", () => {
    const { state, cardDb, card } = buildTarget(4, 4000);
    expect(matchesFilter(card, { cost_max: 4 }, cardDb, state)).toBe(true);
    expect(matchesFilter(card, { cost_max: 3 }, cardDb, state)).toBe(false);
  });

  it("cost_range honors effective cost", () => {
    const { state, cardDb, card } = buildTarget(7, 4000, [{ type: "MODIFY_COST", amount: -3 }]);
    expect(matchesFilter(card, { cost_range: { min: 3, max: 5 } }, cardDb, state)).toBe(true);
    expect(matchesFilter(card, { cost_range: { min: 6, max: 8 } }, cardDb, state)).toBe(false);
  });

  it("effective cost is clamped at zero (base 2, -5 modifier → current 0)", () => {
    const { state, cardDb, card } = buildTarget(2, 4000, [{ type: "MODIFY_COST", amount: -5 }]);
    expect(matchesFilter(card, { cost_exact: 0 }, cardDb, state)).toBe(true);
  });
});

describe("OPT-247: base_cost_* reads printed Layer 0 cost regardless of modifiers", () => {
  it("rejects when base exceeds threshold even though current is under (base 5, current 3, filter base_cost_max:4)", () => {
    const { state, cardDb, card } = buildTarget(5, 4000, [{ type: "MODIFY_COST", amount: -2 }]);
    expect(matchesFilter(card, { base_cost_max: 4 }, cardDb, state)).toBe(false);
  });

  it("matches when base is under threshold even though current is over (base 4, current 6, filter base_cost_max:4)", () => {
    const { state, cardDb, card } = buildTarget(4, 4000, [{ type: "MODIFY_COST", amount: 2 }]);
    expect(matchesFilter(card, { base_cost_max: 4 }, cardDb, state)).toBe(true);
  });
});

// ─── OPT-248 (E2) — Power filters ────────────────────────────────────────────

describe("OPT-248: power_* reads current (effective) power", () => {
  it("matches when a +3000 buff lifts current above threshold, power_min:7000 (base 5000 → current 8000)", () => {
    const { state, cardDb, card } = buildTarget(3, 5000, [{ type: "MODIFY_POWER", amount: 3000 }]);
    expect(matchesFilter(card, { power_min: 7000 }, cardDb, state)).toBe(true);
  });

  it("rejects when a -3000 debuff drops current below threshold, power_min:5000 (base 6000 → current 3000)", () => {
    const { state, cardDb, card } = buildTarget(3, 6000, [{ type: "MODIFY_POWER", amount: -3000 }]);
    expect(matchesFilter(card, { power_min: 5000 }, cardDb, state)).toBe(false);
  });
});

describe("OPT-248: base_power_* reads printed Layer 0 power regardless of modifiers", () => {
  it("OP13-077 shape: base 5000 with +2000 buff to 7000 → base_power_max:5000 matches", () => {
    const { state, cardDb, card } = buildTarget(3, 5000, [{ type: "MODIFY_POWER", amount: 2000 }]);
    expect(matchesFilter(card, { base_power_max: 5000 }, cardDb, state)).toBe(true);
  });

  it("OP13-077 shape: base 6000 with -2000 debuff to 4000 → base_power_max:5000 does NOT match", () => {
    const { state, cardDb, card } = buildTarget(3, 6000, [{ type: "MODIFY_POWER", amount: -2000 }]);
    expect(matchesFilter(card, { base_power_max: 5000 }, cardDb, state)).toBe(false);
  });

  it("EB03-025 Hina shape: base_power_exact:6000 only matches printed 6000 (buffs ignored)", () => {
    const { state, cardDb, card } = buildTarget(3, 6000, [{ type: "MODIFY_POWER", amount: 3000 }]);
    expect(matchesFilter(card, { base_power_exact: 6000 }, cardDb, state)).toBe(true);
    const b = buildTarget(3, 5000, [{ type: "MODIFY_POWER", amount: 1000 }]);
    expect(matchesFilter(b.card, { base_power_exact: 6000 }, b.cardDb, b.state)).toBe(false);
  });
});

// ─── Encoding lint — schemas emit the correct mode per card text ─────────────

describe("OPT-247 / OPT-248: schema encodings match card text's base-vs-current intent", () => {
  it("OP10-098 Liberation uses base_cost_max (card text: 'base cost')", () => {
    const json = JSON.stringify(OP10_098_LIBERATION);
    expect(json).toContain("base_cost_max");
    expect(json).not.toMatch(/"cost_max"/);
  });

  it("OP09-098 Black Hole uses cost_max (card text: 'cost of 4 or less' — no 'base')", () => {
    const json = JSON.stringify(OP09_098_BLACK_HOLE);
    expect(json).toMatch(/"cost_max":\s*4/);
    expect(json).not.toContain("base_cost");
  });

  it("OP13-077 uses base_power_max (card text: 'base power')", () => {
    const json = JSON.stringify(OP13_077_GO_ALL_THE_WAY_TO_THE_TOP);
    expect(json).toContain("base_power_max");
    expect(json).not.toMatch(/"power_max"/);
  });

  it("EB03-021 Alvida uses base_power_max and base_cost_max (card text: 'base power'/'base cost')", () => {
    const json = JSON.stringify(EB03_021_ALVIDA);
    expect(json).toContain("base_power_max");
    expect(json).toContain("base_cost_max");
  });

  it("EB03-025 Hina uses base_power_exact (card text: '6000 base power')", () => {
    const json = JSON.stringify(EB03_025_HINA);
    expect(json).toContain("base_power_exact");
  });

  it("EB03-027 Marguerite uses base_power_exact (card text: '7000 base power')", () => {
    const json = JSON.stringify(EB03_027_MARGUERITE);
    expect(json).toContain("base_power_exact");
  });

  it("ST26-001 Soba Mask uses base_power_min (card text: '7000 base power or more')", () => {
    const json = JSON.stringify(ST26_001_SOBA_MASK);
    expect(json).toContain("base_power_min");
  });

  it("ST12-001 uses power_max (card text: '7000 power or less' — no 'base')", () => {
    const json = JSON.stringify(ST12_001_RORONOA_ZORO_AND_SANJI);
    expect(json).toMatch(/"power_max":\s*7000/);
    expect(json).not.toContain("base_power");
  });

  it("OP10-026/027 Kin'emon use power_exact (card text: 'with N power' — no 'base')", () => {
    // Regression: previously encoded as base_power_exact; card text omits "base".
    expect(JSON.stringify(OP10_026_KINEMON)).toContain("\"power_exact\":0");
    expect(JSON.stringify(OP10_027_KINEMON)).toContain("\"power_exact\":1000");
    expect(JSON.stringify(OP10_026_KINEMON)).not.toContain("base_power");
    expect(JSON.stringify(OP10_027_KINEMON)).not.toContain("base_power");
  });
});
