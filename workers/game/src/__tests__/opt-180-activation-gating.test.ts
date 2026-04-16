/**
 * OPT-180 — Activation gating via choice-aware payability.
 *
 * validateActivateEffect runs isCostPayable (CHOICE-aware) on each block cost,
 * so ACTIVATE_EFFECT is rejected before execution only when no branch is payable.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";

const EFFECT_ID = "imu-activate";

const CHOICE_SCHEMA: EffectSchema = {
  effects: [
    {
      id: EFFECT_ID,
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [
        {
          type: "CHOICE",
          options: [
            [{ type: "TRASH_OWN_CHARACTER", amount: 1, filter: { traits: ["Celestial Dragons"] } }],
            [{ type: "TRASH_FROM_HAND", amount: 1 }],
          ],
        },
      ],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

const UNPAYABLE_SCHEMA: EffectSchema = {
  effects: [
    {
      id: EFFECT_ID,
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "DON_MINUS", amount: 99 }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
      flags: { once_per_turn: true, optional: true },
    },
  ],
};

function imuCard(id: string, traits: string[], schema: EffectSchema): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    types: traits,
    effectSchema: schema,
  };
}

const IMU_CD = imuCard("TEST-IMU-CD", ["Celestial Dragons"], CHOICE_SCHEMA);
const IMU_PLAIN = imuCard("TEST-IMU-PLAIN", [], CHOICE_SCHEMA);
const IMU_UNPAYABLE = imuCard("TEST-IMU-UNPAY", [], UNPAYABLE_SCHEMA);

function cardDbWithImus(): Map<string, CardData> {
  const db = createTestCardDb();
  db.set(IMU_CD.id, IMU_CD);
  db.set(IMU_PLAIN.id, IMU_PLAIN);
  db.set(IMU_UNPAYABLE.id, IMU_UNPAYABLE);
  return db;
}

const SOURCE_ID = "char-0-imu";

function sourceInstance(cardId: string): CardInstance {
  return {
    instanceId: SOURCE_ID,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

function withPlayer(
  state: ReturnType<typeof createBattleReadyState>,
  playerIdx: 0 | 1,
  patch: Partial<PlayerState>,
): ReturnType<typeof createBattleReadyState> {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[playerIdx] = { ...newPlayers[playerIdx], ...patch };
  return { ...state, players: newPlayers };
}

function placeSource(
  state: ReturnType<typeof createBattleReadyState>,
  cardId: string,
) {
  const existing = state.players[0].characters.filter(Boolean) as CardInstance[];
  const others = existing.slice(0, 2);
  return withPlayer(state, 0, {
    characters: padChars([sourceInstance(cardId), ...others]),
  });
}

describe("OPT-180: activation gating via choice-aware payability", () => {
  it("Celestial Dragons char on field + non-empty hand → valid", () => {
    const cardDb = cardDbWithImus();
    const state = placeSource(createBattleReadyState(cardDb), IMU_CD.id);
    expect(state.players[0].hand.length).toBeGreaterThan(0);

    const result = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: SOURCE_ID, effectId: EFFECT_ID },
      cardDb,
      0,
    );

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("No Celestial Dragons char + non-empty hand → valid (hand branch payable)", () => {
    const cardDb = cardDbWithImus();
    const state = placeSource(createBattleReadyState(cardDb), IMU_PLAIN.id);
    expect(state.players[0].hand.length).toBeGreaterThan(0);

    const result = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: SOURCE_ID, effectId: EFFECT_ID },
      cardDb,
      0,
    );

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("No Celestial Dragons char + empty hand → invalid with 'Cost cannot be paid'", () => {
    const cardDb = cardDbWithImus();
    const base = placeSource(createBattleReadyState(cardDb), IMU_PLAIN.id);
    const state = withPlayer(base, 0, { hand: [] });

    const result = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: SOURCE_ID, effectId: EFFECT_ID },
      cardDb,
      0,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cost cannot be paid");
  });

  it("Non-CHOICE unpayable cost (DON_MINUS 99) → invalid", () => {
    const cardDb = cardDbWithImus();
    const state = placeSource(createBattleReadyState(cardDb), IMU_UNPAYABLE.id);

    const result = runPipeline(
      state,
      { type: "ACTIVATE_EFFECT", cardInstanceId: SOURCE_ID, effectId: EFFECT_ID },
      cardDb,
      0,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Cost cannot be paid");
  });
});
