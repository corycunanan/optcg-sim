/**
 * Aura modifier tests — OPT-126
 *
 * Verifies that permanent effects with broad targets (ALL_YOUR_CHARACTERS)
 * apply to all matching characters, not just the source card.
 * Also verifies controller inference (YOUR = SELF).
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectivePower, getEffectiveCost, hasGrantedKeyword } from "../engine/modifiers.js";
import { setupGame, createTestCardDb, CARDS, padChars } from "./helpers.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCharInstance(
  cardId: string,
  owner: 0 | 1,
  suffix: string,
): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

/** Create a state with characters on both sides and an aura effect registered. */
function createAuraTestState(auraEffect: RuntimeActiveEffect): {
  state: GameState;
  cardDb: Map<string, CardData>;
  p0Chars: CardInstance[];
  p1Chars: CardInstance[];
} {
  const { state: baseState } = setupGame();
  const cardDb = createTestCardDb();

  const p0Chars = [
    makeCharInstance(CARDS.VANILLA.id, 0, "a"),
    makeCharInstance(CARDS.BLOCKER.id, 0, "b"),
  ];
  const p1Chars = [
    makeCharInstance(CARDS.VANILLA.id, 1, "a"),
    makeCharInstance(CARDS.BLOCKER.id, 1, "b"),
  ];

  const players = [...baseState.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars(p0Chars) };
  players[1] = { ...players[1], characters: padChars(p1Chars) };

  const state: GameState = {
    ...baseState,
    players,
    turn: { ...baseState.turn, activePlayerIndex: 0, phase: "MAIN" },
    activeEffects: [auraEffect] as any,
  };

  return { state, cardDb, p0Chars, p1Chars };
}

// ─── Power Aura Tests ────────────────────────────────────────────────────────

describe("Power aura (MODIFY_POWER with ALL_YOUR_CHARACTERS)", () => {
  const powerAura: RuntimeActiveEffect = {
    id: "aura-power-1",
    sourceCardInstanceId: "leader-0", // source is the leader, not a character
    sourceEffectBlockId: "block-1",
    category: "permanent",
    modifiers: [
      {
        type: "MODIFY_POWER",
        target: { type: "ALL_YOUR_CHARACTERS" },
        params: { amount: 1000 },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [], // non-SELF targets leave appliesTo empty
    timestamp: 1,
  };

  it("applies power buff to all controller's characters", () => {
    const { state, cardDb, p0Chars } = createAuraTestState(powerAura);

    for (const char of p0Chars) {
      const data = cardDb.get(char.cardId)!;
      const basePower = data.power!;
      const effective = getEffectivePower(char, data, state, cardDb);
      expect(effective).toBe(basePower + 1000);
    }
  });

  it("does NOT apply power buff to opponent's characters", () => {
    const { state, cardDb, p1Chars } = createAuraTestState(powerAura);

    for (const char of p1Chars) {
      const data = cardDb.get(char.cardId)!;
      const basePower = data.power!;
      const effective = getEffectivePower(char, data, state, cardDb);
      expect(effective).toBe(basePower);
    }
  });
});

// ─── Cost Aura Tests ─────────────────────────────────────────────────────────

describe("Cost aura (MODIFY_COST with ALL_YOUR_CHARACTERS)", () => {
  const costAura: RuntimeActiveEffect = {
    id: "aura-cost-1",
    sourceCardInstanceId: "leader-0",
    sourceEffectBlockId: "block-2",
    category: "permanent",
    modifiers: [
      {
        type: "MODIFY_COST",
        target: { type: "ALL_YOUR_CHARACTERS" },
        params: { amount: 1 },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [],
    timestamp: 1,
  };

  it("applies cost modifier to all controller's characters", () => {
    const { state, cardDb, p0Chars } = createAuraTestState(costAura);

    for (const char of p0Chars) {
      const data = cardDb.get(char.cardId)!;
      const baseCost = data.cost!;
      const effective = getEffectiveCost(data, state, char.instanceId, cardDb);
      expect(effective).toBe(baseCost + 1);
    }
  });

  it("does NOT apply cost modifier to opponent's characters", () => {
    const { state, cardDb, p1Chars } = createAuraTestState(costAura);

    for (const char of p1Chars) {
      const data = cardDb.get(char.cardId)!;
      const baseCost = data.cost!;
      const effective = getEffectiveCost(data, state, char.instanceId, cardDb);
      expect(effective).toBe(baseCost);
    }
  });
});

// ─── Filtered Aura Tests ─────────────────────────────────────────────────────

describe("Filtered power aura (ALL_YOUR_CHARACTERS with trait filter)", () => {
  // Add a FILM-trait card to the test DB
  const FILM_CARD: CardData = {
    id: "CHAR-FILM",
    name: "Film Character",
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: ["FILM"],
    effectText: "",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: null,
    imageUrl: null,
  };

  const filteredPowerAura: RuntimeActiveEffect = {
    id: "aura-filtered-1",
    sourceCardInstanceId: "leader-0",
    sourceEffectBlockId: "block-3",
    category: "permanent",
    modifiers: [
      {
        type: "MODIFY_POWER",
        target: {
          type: "ALL_YOUR_CHARACTERS",
          filter: { traits: ["FILM"] },
        },
        params: { amount: 2000 },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [],
    timestamp: 1,
  };

  it("applies only to characters matching the trait filter", () => {
    const { state: baseState } = setupGame();
    const cardDb = createTestCardDb();
    cardDb.set(FILM_CARD.id, FILM_CARD);

    const filmChar = makeCharInstance(FILM_CARD.id, 0, "film");
    const nonFilmChar = makeCharInstance(CARDS.VANILLA.id, 0, "nf");

    const players = [...baseState.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([filmChar, nonFilmChar]) };

    const state: GameState = {
      ...baseState,
      players,
      turn: { ...baseState.turn, activePlayerIndex: 0, phase: "MAIN" },
      activeEffects: [filteredPowerAura] as any,
    };

    // FILM character gets +2000
    const filmPower = getEffectivePower(filmChar, FILM_CARD, state, cardDb);
    expect(filmPower).toBe(4000 + 2000);

    // Non-FILM character does NOT get +2000
    const vanillaData = cardDb.get(CARDS.VANILLA.id)!;
    const vanillaPower = getEffectivePower(nonFilmChar, vanillaData, state, cardDb);
    expect(vanillaPower).toBe(4000);
  });
});

// ─── Keyword Grant Aura Tests ────────────────────────────────────────────────

describe("Keyword grant aura (GRANT_KEYWORD with ALL_YOUR_CHARACTERS)", () => {
  const keywordAura: RuntimeActiveEffect = {
    id: "aura-kw-1",
    sourceCardInstanceId: "leader-0",
    sourceEffectBlockId: "block-4",
    category: "permanent",
    modifiers: [
      {
        type: "GRANT_KEYWORD",
        target: { type: "ALL_YOUR_CHARACTERS" },
        params: { keyword: "blocker" },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [],
    timestamp: 1,
  };

  it("grants keyword to all controller's characters", () => {
    const { state, cardDb, p0Chars } = createAuraTestState(keywordAura);

    for (const char of p0Chars) {
      expect(hasGrantedKeyword(char, "blocker", state, cardDb)).toBe(true);
    }
  });

  it("does NOT grant keyword to opponent's characters", () => {
    const { state, cardDb, p1Chars } = createAuraTestState(keywordAura);

    for (const char of p1Chars) {
      expect(hasGrantedKeyword(char, "blocker", state, cardDb)).toBe(false);
    }
  });
});
