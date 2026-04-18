/**
 * OPT-242 D4 — Permanent effects with threshold filters must re-evaluate
 * against effective cost, not base cost.
 *
 * Background: OP10-042 Usopp reads "+1 cost to your {Dressrosa} Characters
 * with cost ≥ 2". If an auto effect reduces a Dressrosa Character's cost
 * below 2, Usopp's permanent should no longer apply. Conversely, if an
 * effect's +1 pushes a card past its own threshold, the effect stays
 * applied (per Bandai ruling — "once applied, stays applied").
 *
 * The engine models this with include-once fixed-point iteration inside
 * the Layer 2 MODIFY_COST pass: re-check each unincluded effect's filter
 * against the running cost; stop when a full pass adds nothing.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectiveCost } from "../engine/modifiers.js";
import { setupGame, createTestCardDb, CARDS, padChars } from "./helpers.js";

const DRESSROSA = "Dressrosa";

function makeDressrosaChar(
  owner: 0 | 1,
  suffix: string,
  cost: number,
): { card: CardData; instance: CardInstance } {
  const cardId = `DRES-${cost}-${suffix}`;
  const card: CardData = {
    id: cardId,
    name: `Dressrosa ${suffix}`,
    type: "Character",
    color: ["Blue"],
    cost,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [DRESSROSA],
    effectText: "",
    triggerText: null,
    keywords: {
      rush: false, rushCharacter: false, doubleAttack: false, banish: false,
      blocker: false, trigger: false, unblockable: false,
    },
    effectSchema: null,
    imageUrl: null,
  };
  const instance: CardInstance = {
    instanceId: `dres-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
  return { card, instance };
}

function buildState(
  target: CardInstance,
  effects: RuntimeActiveEffect[],
  extraCards: CardData[] = [],
): { state: GameState; cardDb: Map<string, CardData> } {
  const { state: baseState } = setupGame();
  const cardDb = createTestCardDb();
  for (const c of extraCards) cardDb.set(c.id, c);

  const players = [...baseState.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([target]) };

  const state: GameState = {
    ...baseState,
    players,
    turn: { ...baseState.turn, activePlayerIndex: 0, phase: "MAIN" },
    activeEffects: effects as any,
  };
  return { state, cardDb };
}

function usoppPermanent(): RuntimeActiveEffect {
  // Mirrors OP10-042's permanent: "All of your {Dressrosa} Characters with
  // cost ≥ 2 get +1 cost."
  return {
    id: "usopp-perm",
    sourceCardInstanceId: "usopp-leader",
    sourceEffectBlockId: "permanent_cost_buff",
    category: "permanent",
    modifiers: [
      {
        type: "MODIFY_COST",
        target: {
          type: "ALL_YOUR_CHARACTERS",
          filter: { traits: [DRESSROSA], cost_min: 2 },
        },
        params: { amount: 1 },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [], // dynamic target — resolved each call via filter
    timestamp: 1,
  };
}

describe("OPT-242 D4: threshold-filtered permanent modifiers re-evaluate on effective cost", () => {
  it("Usopp +1 applies when base cost is ≥ 2", () => {
    const { card, instance } = makeDressrosaChar(0, "base2", 2);
    const { state, cardDb } = buildState(instance, [usoppPermanent()], [card]);
    // 2 (base) + 1 (Usopp) = 3. Filter re-checked: 3 ≥ 2 still true → stays.
    expect(getEffectiveCost(card, state, instance.instanceId, cardDb)).toBe(3);
  });

  it("Usopp does NOT apply when base cost is below threshold", () => {
    const { card, instance } = makeDressrosaChar(0, "base1", 1);
    const { state, cardDb } = buildState(instance, [usoppPermanent()], [card]);
    expect(getEffectiveCost(card, state, instance.instanceId, cardDb)).toBe(1);
  });

  it("auto -cost effect dropping the char below threshold causes Usopp to drop off", () => {
    // Base 4, auto -3, Usopp. Without the fix, Usopp filter reads base 4 ≥ 2
    // → applies, final = 4 - 3 + 1 = 2. With the fix, the post-auto cost is
    // 1, which fails cost_min: 2 → Usopp does not apply, final = 1.
    const { card, instance } = makeDressrosaChar(0, "base4", 4);
    const autoReduce: RuntimeActiveEffect = {
      id: "auto-minus-3",
      sourceCardInstanceId: "other-src",
      sourceEffectBlockId: "auto-reduction",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_YOUR_CHARACTERS" },
          params: { amount: -3 },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [instance.instanceId],
      timestamp: 2,
    };
    const { state, cardDb } = buildState(instance, [autoReduce, usoppPermanent()], [card]);
    expect(getEffectiveCost(card, state, instance.instanceId, cardDb)).toBe(1);
  });

  it("once applied, a threshold permanent stays applied even if its +1 pushes past the condition", () => {
    // Upper-threshold permanent: "cost ≤ 4 → +1 cost". A base-4 character's
    // post-bonus cost is 5. On the next iteration the filter no longer
    // matches (5 > 4), but the include-once rule keeps the effect applied.
    const { card, instance } = makeDressrosaChar(0, "base4cap", 4);
    const capPerm: RuntimeActiveEffect = {
      id: "cap4-plus-1",
      sourceCardInstanceId: "cap-src",
      sourceEffectBlockId: "cap",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "ALL_YOUR_CHARACTERS",
            filter: { cost_max: 4 },
          },
          params: { amount: 1 },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 1,
    };
    const { state, cardDb } = buildState(instance, [capPerm], [card]);
    expect(getEffectiveCost(card, state, instance.instanceId, cardDb)).toBe(5);
  });

  it("two opposing threshold permanents reach a stable state without infinite loop", () => {
    // A: cost ≤ 3 → +1.  B: cost ≥ 4 → -1.  Base 3.
    // Pass: A sees 3 → apply → 4 (A included). B sees 4 → apply → 3 (B included).
    // Next pass: nothing un-included → terminate. Final: 3.
    const { card, instance } = makeDressrosaChar(0, "toggle", 3);
    const plusOne: RuntimeActiveEffect = {
      id: "plus-if-le-3",
      sourceCardInstanceId: "a-src",
      sourceEffectBlockId: "a",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_YOUR_CHARACTERS", filter: { cost_max: 3 } },
          params: { amount: 1 },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 1,
    };
    const minusOne: RuntimeActiveEffect = {
      id: "minus-if-ge-4",
      sourceCardInstanceId: "b-src",
      sourceEffectBlockId: "b",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "ALL_YOUR_CHARACTERS", filter: { cost_min: 4 } },
          params: { amount: -1 },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 2,
    };

    const t0 = performance.now();
    const { state, cardDb } = buildState(instance, [plusOne, minusOne], [card]);
    const cost = getEffectiveCost(card, state, instance.instanceId, cardDb);
    const elapsed = performance.now() - t0;

    expect(cost).toBe(3);
    // Liveness check — iteration should terminate quickly, well under 50ms.
    expect(elapsed).toBeLessThan(50);
  });

  it("Usopp does not apply to non-Dressrosa characters regardless of cost", () => {
    const card: CardData = {
      ...CARDS.VANILLA,
      id: "NONDRES-3",
      types: [], // no Dressrosa trait
      cost: 3,
    };
    const instance: CardInstance = {
      instanceId: "nondres-0",
      cardId: card.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const { state, cardDb } = buildState(instance, [usoppPermanent()], [card]);
    expect(getEffectiveCost(card, state, instance.instanceId, cardDb)).toBe(3);
  });

  it("Usopp applies to opposing player's Dressrosa chars only when targeting SELF — OPT-242 scope check", () => {
    // Usopp's permanent is controller=0 with target SELF. An opponent's
    // Dressrosa Character must not receive the buff.
    const { card, instance } = makeDressrosaChar(1, "oppdres", 3);
    // Seat the opponent's character on P1's board.
    const { state: baseState } = setupGame();
    const cardDb = createTestCardDb();
    cardDb.set(card.id, card);
    const players = [...baseState.players] as [PlayerState, PlayerState];
    players[1] = { ...players[1], characters: padChars([instance]) };
    const state: GameState = {
      ...baseState,
      players,
      turn: { ...baseState.turn, activePlayerIndex: 0, phase: "MAIN" },
      activeEffects: [usoppPermanent()] as any,
    };
    expect(getEffectiveCost(card, state, instance.instanceId, cardDb)).toBe(3);
  });
});
