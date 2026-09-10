import { describe, expect, it } from "vitest";
import type { CardData } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { executeSetPowerToZero } from "../engine/effect-resolver/actions/modifiers.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { expireEndOfTurnEffects } from "../engine/duration-tracker.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP07_002_AIN } from "../engine/schemas/op07.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";

function fixture() {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  const target = state.players[1].characters[0]!;
  const data = cardDb.get(target.cardId)!;
  const effect = (
    type: "SET_POWER" | "MODIFY_POWER",
    value: number
  ): RuntimeActiveEffect => ({
    id: `${type}-${value}`,
    sourceCardInstanceId: state.players[0].leader.instanceId,
    sourceEffectBlockId: "test",
    category: "auto",
    controller: 0,
    modifiers:
      type === "SET_POWER"
        ? [{ type, params: { value } }]
        : [{ type, params: { amount: value } }],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    appliesTo: [target.instanceId],
    timestamp: value,
  });
  state.activeEffects = [
    effect("SET_POWER", 8000),
    effect("MODIFY_POWER", 2000),
  ];
  return { state, cardDb, target, data, effect };
}

const zeroAction = {
  type: "SET_POWER_TO_ZERO" as const,
  target: {
    type: "CHARACTER" as const,
    controller: "OPPONENT" as const,
    count: { up_to: 1 },
  },
  duration: { type: "THIS_TURN" as const },
};

describe("OPT-832: set power to zero is a captured reduction (§4-12)", () => {
  it("Ain's authored On Play reduces a pre-set and buffed opponent to zero, permits later buffs, and expires", () => {
    const { state, cardDb, target, data, effect } = fixture();
    const ain: CardData = {
      ...CARDS.VANILLA,
      id: "OP07-002",
      name: "Ain",
      cost: 7,
      power: 6000,
      counter: null,
      color: ["Red"],
      attribute: ["Special"],
      types: ["FILM", "Neo Navy"],
      effectText:
        "[On Play] Set the power of up to 1 of your opponent's Characters to 0 during this turn.",
      effectSchema: OP07_002_AIN,
    };
    cardDb.set(ain.id, ain);
    const inHand = {
      ...state.players[0].leader,
      instanceId: "ain-hand",
      cardId: ain.id,
      zone: "HAND" as const,
      attachedDon: [],
    };
    state.players[0].hand.push(inHand);
    expect(getEffectivePower(target, data, state, cardDb)).toBe(10000);
    const played = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: inHand.instanceId },
      cardDb,
      0
    );
    expect(played.valid).toBe(true);
    expect(
      played.state.players[0].donCostArea.filter(
        (don) => don.state === "ACTIVE"
      )
    ).toHaveLength(1);
    expect(
      played.state.players[0].characters.some((card) => card?.cardId === ain.id)
    ).toBe(true);
    expect(played.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const resolved = resumeFromStack(
      played.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] },
      cardDb
    );
    expect(resolved.pendingPrompt).toBeUndefined();
    expect(getEffectivePower(target, data, resolved.state, cardDb)).toBe(0);
    expect(resolved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "POWER_MODIFIED",
          payload: { targetInstanceId: target.instanceId, amount: -10000 },
        }),
      ])
    );
    resolved.state.activeEffects.push(effect("MODIFY_POWER", 3000));
    expect(getEffectivePower(target, data, resolved.state, cardDb)).toBe(3000);
    const expired = expireEndOfTurnEffects(resolved.state);
    expect(getEffectivePower(target, data, expired, cardDb)).toBe(13000);
  });

  it("captures attached DON on the target's turn and persists the reduction independently", () => {
    const { state, cardDb, target, data } = fixture();
    state.turn.activePlayerIndex = 1;
    target.attachedDon = [
      {
        instanceId: "attached",
        state: "ACTIVE",
        attachedTo: target.instanceId,
      },
    ];
    const reduced = executeSetPowerToZero(
      state,
      zeroAction,
      "source",
      0,
      cardDb,
      new Map(),
      [target.instanceId]
    );
    expect(getEffectivePower(target, data, reduced.state, cardDb)).toBe(0);
    target.attachedDon = [];
    expect(getEffectivePower(target, data, reduced.state, cardDb)).toBe(-1000);
    expect(
      getEffectivePower(
        target,
        data,
        expireEndOfTurnEffects(reduced.state),
        cardDb
      )
    ).toBe(10000);
  });

  it.each([0, -2000])(
    "leaves an already nonpositive power of %i unchanged",
    (power) => {
      const { state, cardDb, target, data, effect } = fixture();
      state.activeEffects = [
        effect("SET_POWER", 0),
        effect("MODIFY_POWER", power),
      ];
      const reduced = executeSetPowerToZero(
        state,
        zeroAction,
        "source",
        0,
        cardDb,
        new Map(),
        [target.instanceId]
      );
      expect(getEffectivePower(target, data, reduced.state, cardDb)).toBe(
        power
      );
      expect(reduced.state.activeEffects).toHaveLength(2);
      expect(reduced.events).toEqual([]);
    }
  );

  it("captures a different amount for each target from the original state", () => {
    const { state, cardDb, target, data } = fixture();
    const other = state.players[1].characters[1]!;
    const otherData = { ...cardDb.get(other.cardId)!, power: 3000 };
    cardDb.set(other.cardId, otherData);
    const reduced = executeSetPowerToZero(
      state,
      {
        ...zeroAction,
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { all: true },
        },
      },
      "source",
      0,
      cardDb,
      new Map(),
      [target.instanceId, other.instanceId]
    );
    expect(getEffectivePower(target, data, reduced.state, cardDb)).toBe(0);
    expect(getEffectivePower(other, otherData, reduced.state, cardDb)).toBe(0);
    expect(
      reduced.events
        .filter((event) => event.type === "POWER_MODIFIED")
        .map((event) => event.payload?.amount)
    ).toEqual([-10000, -3000]);
  });
  it("snapshots all reductions before the first target changes a conditional aura", () => {
    const { state, cardDb, target, effect } = fixture();
    const other = state.players[1].characters[1]!;
    const otherData = { ...cardDb.get(other.cardId)!, power: 3000 };
    cardDb.set(other.cardId, otherData);
    cardDb.set(target.cardId, { ...cardDb.get(target.cardId)!, cost: 9 });
    const aura = effect("MODIFY_POWER", 2000);
    aura.id = "conditional-aura";
    aura.appliesTo = [other.instanceId];
    aura.conditions = {
      type: "CARD_ON_FIELD",
      controller: "OPPONENT",
      filter: { card_type: "CHARACTER", base_cost_exact: 9, power_min: 9000 },
    };
    state.activeEffects.push(aura);
    expect(getEffectivePower(other, otherData, state, cardDb)).toBe(5000);
    const reduced = executeSetPowerToZero(
      state,
      { ...zeroAction, target: { type: "CHARACTER", count: { all: true } } },
      "source",
      0,
      cardDb,
      new Map(),
      [target.instanceId, other.instanceId]
    );
    // First target loses power and turns off the +2000 aura. The second target
    // still receives the originally captured -5000, rather than a later -3000.
    expect(getEffectivePower(other, otherData, reduced.state, cardDb)).toBe(
      -2000
    );
    expect(
      reduced.events
        .filter((event) => event.type === "POWER_MODIFIED")
        .map((event) => event.payload?.amount)
    ).toEqual([-10000, -5000]);
  });

  it("declining the up-to-one selection applies no reduction", () => {
    const { state, cardDb } = fixture();
    const reduced = executeSetPowerToZero(
      state,
      zeroAction,
      "source",
      0,
      cardDb,
      new Map(),
      []
    );
    expect(reduced.state).toBe(state);
    expect(reduced.succeeded).toBe(false);
    expect(reduced.events).toEqual([]);
  });
});
