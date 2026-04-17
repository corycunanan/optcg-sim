/**
 * OPT-225 — SWAP_BASE_POWER captures Layer 0 base power at resolution time
 * and persists across removal of either target until its duration expires.
 *
 * FAQ rulings (Bandai):
 *   - Swap reads the Layer 0 (printed) base power of each target at the moment
 *     the effect resolves. Layer 2 buffs layer on top of the resulting SET_POWER.
 *   - If one of the pair is K.O.'d mid-turn, the survivor keeps the swapped base
 *     until end of turn — the two SET_POWER effects are independent.
 *   - A later SWAP_BASE_POWER (or SET_BASE_POWER) beats an earlier one on the
 *     same Character: last base-setter wins.
 *   - At end of turn (or end of battle) both Layer-1 effects expire; Layer-0
 *     restores.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { executeSwapBasePower } from "../engine/effect-resolver/actions/modifiers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { expireEndOfTurnEffects, expireSourceLeftZone } from "../engine/duration-tracker.js";
import { setupGame, createTestCardDb, padChars } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

function makeChar(id: string, power: number): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
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

function makeInstance(cardId: string, instanceId: string, owner: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

/**
 * Build a state with two custom characters on player 0's field.
 * Avoids the DON!! +1000 bonus by swapping to player 1's turn.
 */
function buildPairState(aPower: number, bPower: number): {
  state: GameState;
  cardDb: Map<string, CardData>;
  charA: CardInstance;
  charB: CardInstance;
  dataA: CardData;
  dataB: CardData;
} {
  const { state: base } = setupGame();
  const cardDb = createTestCardDb();

  const dataA = makeChar("CHAR-A", aPower);
  const dataB = makeChar("CHAR-B", bPower);
  cardDb.set(dataA.id, dataA);
  cardDb.set(dataB.id, dataB);

  const charA = makeInstance(dataA.id, "inst-A", 0);
  const charB = makeInstance(dataB.id, "inst-B", 0);

  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([charA, charB]) };

  const state: GameState = {
    ...base,
    players,
    // Player 1's turn so the DON!! +1000/attached bonus does not pollute assertions.
    turn: { ...base.turn, activePlayerIndex: 1, phase: "MAIN" },
  };

  return { state, cardDb, charA, charB, dataA, dataB };
}

const SWAP_ACTION = {
  type: "SWAP_BASE_POWER" as const,
  target: { type: "CHARACTER" as const, controller: "SELF" as const, count: { exact: 2 } },
  duration: { type: "THIS_TURN" as const },
};

describe("OPT-225: SWAP_BASE_POWER captures Layer 0 at resolution", () => {
  it("swaps two Characters' base powers (3000 ↔ 5000)", () => {
    const { state, cardDb, charA, charB, dataA, dataB } = buildPairState(3000, 5000);

    const result = executeSwapBasePower(
      state, SWAP_ACTION, "leader-0", 0, cardDb, new Map(), [charA.instanceId, charB.instanceId],
    );
    expect(result.succeeded).toBe(true);

    expect(getEffectivePower(charA, dataA, result.state, cardDb)).toBe(5000);
    expect(getEffectivePower(charB, dataB, result.state, cardDb)).toBe(3000);
  });

  it("captures Layer 0 base only — pre-existing MODIFY_POWER aura does not leak into the captured value", () => {
    // Setup a +1000 aura (Layer 2) already active on both characters.
    const { state: base, cardDb, charA, charB, dataA, dataB } = buildPairState(3000, 5000);
    const aura: RuntimeActiveEffect = {
      id: "aura-1",
      sourceCardInstanceId: "external",
      sourceEffectBlockId: "",
      category: "permanent",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 } }],
      duration: { type: "WHILE_IN_PLAY" } as any,
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" } as any,
      controller: 0,
      appliesTo: [charA.instanceId, charB.instanceId],
      timestamp: 1,
    };
    const state: GameState = { ...base, activeEffects: [aura] as any };

    // Sanity: aura applies, A=4000, B=6000 before swap.
    expect(getEffectivePower(charA, dataA, state, cardDb)).toBe(4000);
    expect(getEffectivePower(charB, dataB, state, cardDb)).toBe(6000);

    const result = executeSwapBasePower(
      state, SWAP_ACTION, "leader-0", 0, cardDb, new Map(), [charA.instanceId, charB.instanceId],
    );
    expect(result.succeeded).toBe(true);

    // A captured B's base = 5000 (Layer 0 only, not 6000), aura still layers +1000 → 6000.
    // B captured A's base = 3000, aura layers +1000 → 4000.
    expect(getEffectivePower(charA, dataA, result.state, cardDb)).toBe(6000);
    expect(getEffectivePower(charB, dataB, result.state, cardDb)).toBe(4000);
  });

  it("survivor keeps the swapped base after the other target leaves the field", () => {
    const { state, cardDb, charA, charB, dataB } = buildPairState(3000, 5000);

    const swapped = executeSwapBasePower(
      state, SWAP_ACTION, "leader-0", 0, cardDb, new Map(), [charA.instanceId, charB.instanceId],
    );
    expect(swapped.succeeded).toBe(true);

    // K.O. charA: pull it out of the character zone and run the source-left-zone sweep.
    const afterKo: GameState = {
      ...swapped.state,
      players: [
        { ...swapped.state.players[0], characters: padChars([charB]) },
        swapped.state.players[1],
      ] as [PlayerState, PlayerState],
    };
    const cleaned = expireSourceLeftZone(afterKo, charA.instanceId);

    // charB is still on the field and still reads the swapped value (3000 — A's base).
    expect(getEffectivePower(charB, dataB, cleaned, cardDb)).toBe(3000);
  });

  it("subsequent MODIFY_POWER buff layers on top of the swapped Layer-1 value", () => {
    const { state: base, cardDb, charA, charB, dataA, dataB } = buildPairState(3000, 5000);

    const swapped = executeSwapBasePower(
      base, SWAP_ACTION, "leader-0", 0, cardDb, new Map(), [charA.instanceId, charB.instanceId],
    );

    const postBuff: RuntimeActiveEffect = {
      id: "buff-1",
      sourceCardInstanceId: "leader-0",
      sourceEffectBlockId: "",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", params: { amount: 2000 } }],
      duration: { type: "THIS_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: base.turn.number } as any,
      controller: 0,
      appliesTo: [charA.instanceId],
      timestamp: Date.now() + 100,
    };
    const state: GameState = {
      ...swapped.state,
      activeEffects: [...swapped.state.activeEffects, postBuff] as any,
    };

    // charA: Layer-1 SET_POWER=5000 (B's base) + Layer-2 +2000 = 7000.
    expect(getEffectivePower(charA, dataA, state, cardDb)).toBe(7000);
    // charB: unaffected by the buff (not in appliesTo) — still 3000 (A's base).
    expect(getEffectivePower(charB, dataB, state, cardDb)).toBe(3000);
  });

  it("a second swap on the same Character wins — last base-setter applies", () => {
    const { state, cardDb, charA, charB, dataA } = buildPairState(3000, 5000);

    // Add a third character to swap A with.
    const dataC = makeChar("CHAR-C", 8000);
    cardDb.set(dataC.id, dataC);
    const charC = makeInstance(dataC.id, "inst-C", 0);
    const staged: GameState = {
      ...state,
      players: [
        { ...state.players[0], characters: padChars([charA, charB, charC]) },
        state.players[1],
      ] as [PlayerState, PlayerState],
    };

    // Swap 1: A ↔ B. A now reads 5000.
    const swap1 = executeSwapBasePower(
      staged, SWAP_ACTION, "leader-0", 0, cardDb, new Map(), [charA.instanceId, charB.instanceId],
    );
    expect(getEffectivePower(charA, dataA, swap1.state, cardDb)).toBe(5000);

    // Swap 2: A ↔ C. A now reads 8000 (C's base), superseding the first swap.
    const swap2 = executeSwapBasePower(
      swap1.state, SWAP_ACTION, "leader-0", 0, cardDb, new Map(), [charA.instanceId, charC.instanceId],
    );
    expect(getEffectivePower(charA, dataA, swap2.state, cardDb)).toBe(8000);
  });

  it("both Layer-1 SET_POWER effects expire at end of turn — bases restore", () => {
    const { state, cardDb, charA, charB, dataA, dataB } = buildPairState(3000, 5000);

    const swapped = executeSwapBasePower(
      state, SWAP_ACTION, "leader-0", 0, cardDb, new Map(), [charA.instanceId, charB.instanceId],
    );
    expect(getEffectivePower(charA, dataA, swapped.state, cardDb)).toBe(5000);

    const expired = expireEndOfTurnEffects(swapped.state);
    expect(expired.activeEffects).toHaveLength(0);
    expect(getEffectivePower(charA, dataA, expired, cardDb)).toBe(3000);
    expect(getEffectivePower(charB, dataB, expired, cardDb)).toBe(5000);
  });

  it("OP14-001 Law Leader schema encodes SWAP_BASE_POWER with count:2 and THIS_TURN", async () => {
    const { OP14_001_TRAFALGAR_LAW } = await import("../engine/schemas/op14.js");
    const block = OP14_001_TRAFALGAR_LAW.effects?.[0];
    const action = block?.actions?.[0];
    expect(action?.type).toBe("SWAP_BASE_POWER");
    expect(action?.target?.count).toEqual({ exact: 2 });
    expect(action?.duration).toEqual({ type: "THIS_TURN" });
  });
});
