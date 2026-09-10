/**
 * OPT-241 D3 — Turn-player priority remains relevant to SET_COST and trigger
 * ordering. OPT-832 corrects SET_POWER: §4-9-2-1 gives the highest setting
 * precedence regardless of turn player or registration order.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectivePower, getEffectiveCost } from "../engine/modifiers.js";
import { setupGame, createTestCardDb, CARDS, padChars } from "./helpers.js";

function makeCharInstance(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
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

function createDualAuraState(
  effects: RuntimeActiveEffect[],
  activePlayerIndex: 0 | 1,
): { state: GameState; cardDb: Map<string, CardData>; target: CardInstance } {
  const { state: baseState } = setupGame();
  const cardDb = createTestCardDb();

  const target = makeCharInstance(CARDS.VANILLA.id, 0, "target");
  const players = [...baseState.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([target]) };
  // Opponent has a source character so its effect has a field anchor.
  players[1] = { ...players[1], characters: padChars([makeCharInstance(CARDS.VANILLA.id, 1, "src")]) };

  const state: GameState = {
    ...baseState,
    players,
    turn: { ...baseState.turn, activePlayerIndex, phase: "MAIN" },
    activeEffects: effects as any,
  };

  return { state, cardDb, target };
}

describe("OPT-241 D3: Turn-player priority in modifier layers", () => {
  // ─── Power: two SET_POWER effects on the same target ───────────────────────

  const makeSetPower = (controller: 0 | 1, value: number, id: string): RuntimeActiveEffect => ({
    id,
    sourceCardInstanceId: `src-${controller}`,
    sourceEffectBlockId: `block-${id}`,
    category: "permanent",
    modifiers: [
      {
        type: "SET_POWER",
        target: { type: "CHARACTER", controller: "OPPONENT" },
        params: { value },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller,
    appliesTo: ["char-0-target"],
    timestamp: 1,
  });

  it("highest SET_POWER wins when both players have one (turn player 0)", () => {
    // P1 has the higher setting.
    const p0SetsTo = makeSetPower(0, 1000, "p0");
    const p1SetsTo = makeSetPower(1, 9000, "p1");
    const { state, cardDb, target } = createDualAuraState([p0SetsTo, p1SetsTo], 0);

    const data = cardDb.get(target.cardId)!;
    expect(getEffectivePower(target, data, state, cardDb)).toBe(9000);
  });

  it("order of registration does not affect highest SET_POWER", () => {
    // Swap registration order. P1 still has the higher setting.
    const p0SetsTo = makeSetPower(0, 1000, "p0");
    const p1SetsTo = makeSetPower(1, 9000, "p1");
    const { state, cardDb, target } = createDualAuraState([p1SetsTo, p0SetsTo], 0);

    const data = cardDb.get(target.cardId)!;
    expect(getEffectivePower(target, data, state, cardDb)).toBe(9000);
  });

  it("flipping the turn player preserves the highest SET_POWER", () => {
    // P1 remains the higher setting even on its own turn.
    const p0SetsTo = makeSetPower(0, 1000, "p0");
    const p1SetsTo = makeSetPower(1, 9000, "p1");
    const { state, cardDb, target } = createDualAuraState([p0SetsTo, p1SetsTo], 1);

    const data = cardDb.get(target.cardId)!;
    expect(getEffectivePower(target, data, state, cardDb)).toBe(9000);
  });

  // ─── Power: Layer 1 (SET) always before Layer 2 (MODIFY) ───────────────────

  it("SET_POWER (layer 1) resolves before MODIFY_POWER (layer 2) regardless of controller", () => {
    // P0 (turn player) has MODIFY +5000; P1 has SET = 0.
    // Layers resolve Layer 1 first, so SET = 0 then +5000 → 5000.
    const p1SetZero: RuntimeActiveEffect = {
      id: "p1-set",
      sourceCardInstanceId: "src-1",
      sourceEffectBlockId: "block-p1",
      category: "permanent",
      modifiers: [{ type: "SET_POWER", target: { type: "CHARACTER" }, params: { value: 0 } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: ["char-0-target"],
      timestamp: 1,
    };
    const p0ModifyPlus: RuntimeActiveEffect = {
      id: "p0-mod",
      sourceCardInstanceId: "src-0",
      sourceEffectBlockId: "block-p0",
      category: "permanent",
      modifiers: [{ type: "MODIFY_POWER", target: { type: "CHARACTER" }, params: { amount: 5000 } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-0-target"],
      timestamp: 1,
    };
    const { state, cardDb, target } = createDualAuraState([p0ModifyPlus, p1SetZero], 0);

    const data = cardDb.get(target.cardId)!;
    expect(getEffectivePower(target, data, state, cardDb)).toBe(5000);
  });

  // ─── Cost: SET_COST layering + turn-player tiebreak ────────────────────────

  const makeSetCost = (controller: 0 | 1, value: number, id: string): RuntimeActiveEffect => ({
    id,
    sourceCardInstanceId: `src-${controller}`,
    sourceEffectBlockId: `block-${id}`,
    category: "permanent",
    modifiers: [
      {
        type: "SET_COST",
        target: { type: "CHARACTER" },
        params: { value },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller,
    appliesTo: ["char-0-target"],
    timestamp: 1,
  });

  it("opponent's SET_COST wins tie in Layer 1 cost", () => {
    const p0SetTo = makeSetCost(0, 2, "p0-cost");
    const p1SetTo = makeSetCost(1, 7, "p1-cost");
    const { state, cardDb, target } = createDualAuraState([p0SetTo, p1SetTo], 0);

    const data = cardDb.get(target.cardId)!;
    expect(getEffectiveCost(data, state, target.instanceId, cardDb)).toBe(7);
  });

  it("SET_COST keeps turn-player priority even when the winning setting is lower", () => {
    const effects = [makeSetCost(0, 7, "p0-cost"), makeSetCost(1, 2, "p1-cost")];
    for (const turnPlayer of [0, 1] as const) {
      const { state, cardDb, target } = createDualAuraState(effects, turnPlayer);
      expect(getEffectiveCost(cardDb.get(target.cardId)!, state, target.instanceId, cardDb))
        .toBe(turnPlayer === 0 ? 2 : 7);
    }
  });

  it("SET_COST (layer 1) applies before MODIFY_COST (layer 2)", () => {
    // P1 SET_COST=3, P0 (turn player) MODIFY_COST+1 → 3 + 1 = 4.
    // Previously the loop iterated effects in array order, so outcome depended
    // on registration. Now layered SET → MODIFY is deterministic.
    const p1Set: RuntimeActiveEffect = {
      id: "p1-set-cost",
      sourceCardInstanceId: "src-1",
      sourceEffectBlockId: "block-p1c",
      category: "permanent",
      modifiers: [{ type: "SET_COST", target: { type: "CHARACTER" }, params: { value: 3 } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: ["char-0-target"],
      timestamp: 1,
    };
    const p0Modify: RuntimeActiveEffect = {
      id: "p0-mod-cost",
      sourceCardInstanceId: "src-0",
      sourceEffectBlockId: "block-p0c",
      category: "permanent",
      modifiers: [{ type: "MODIFY_COST", target: { type: "CHARACTER" }, params: { amount: 1 } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-0-target"],
      timestamp: 1,
    };

    // Registration order: MODIFY first, SET second. Before the fix the loop
    // produced `base + 1 → set 3` = 3. After layering it is `set 3 → + 1` = 4.
    const { state, cardDb, target } = createDualAuraState([p0Modify, p1Set], 0);
    const data = cardDb.get(target.cardId)!;
    expect(getEffectiveCost(data, state, target.instanceId, cardDb)).toBe(4);
  });

  // ─── Commutative MODIFY ordering still stable ──────────────────────────────

  it("MODIFY_POWER is commutative — turn-player flip does not change sum", () => {
    const p0Mod: RuntimeActiveEffect = {
      id: "p0-pm",
      sourceCardInstanceId: "src-0",
      sourceEffectBlockId: "block-p0pm",
      category: "permanent",
      modifiers: [{ type: "MODIFY_POWER", target: { type: "CHARACTER" }, params: { amount: 1000 } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-0-target"],
      timestamp: 1,
    };
    const p1Mod: RuntimeActiveEffect = {
      ...p0Mod,
      id: "p1-pm",
      sourceCardInstanceId: "src-1",
      sourceEffectBlockId: "block-p1pm",
      controller: 1,
      modifiers: [{ type: "MODIFY_POWER", target: { type: "CHARACTER" }, params: { amount: 2000 } }],
    };

    const asP0 = createDualAuraState([p0Mod, p1Mod], 0);
    const asP1 = createDualAuraState([p0Mod, p1Mod], 1);
    const data = asP0.cardDb.get(asP0.target.cardId)!;
    const base = data.power!;
    expect(getEffectivePower(asP0.target, data, asP0.state, asP0.cardDb)).toBe(base + 3000);
    expect(getEffectivePower(asP1.target, data, asP1.state, asP1.cardDb)).toBe(base + 3000);
  });
});

// ─── Trigger ordering (re-export of existing behavior, locked here) ─────────

import { orderMatchedTriggers } from "../engine/triggers.js";

describe("OPT-241: trigger-ordering.ts turn-player priority (regression)", () => {
  it("orderMatchedTriggers places turn player's triggers before opponent's", () => {
    const triggers = [
      { trigger: { controller: 1 as const }, effectBlock: {} } as any,
      { trigger: { controller: 0 as const }, effectBlock: {} } as any,
      { trigger: { controller: 1 as const }, effectBlock: {} } as any,
      { trigger: { controller: 0 as const }, effectBlock: {} } as any,
    ];
    const ordered = orderMatchedTriggers(triggers, 0);
    expect(ordered.map((t) => t.trigger.controller)).toEqual([0, 0, 1, 1]);

    const ordered1 = orderMatchedTriggers(triggers, 1);
    expect(ordered1.map((t) => t.trigger.controller)).toEqual([1, 1, 0, 0]);
  });
});
