/**
 * COPY_POWER source_power: "BASE" — copies the source's changed base power,
 * excluding additive modifiers and DON!! (OP16-036: "base power becomes the same as
 * your opponent's Leader"). Default remains effective power (OP16-055:
 * "…the same as your opponent's Leader's power").
 */

import { describe, expect, it } from "vitest";
import { getEffectiveBasePower, getEffectivePower } from "../engine/modifiers.js";
import { executeCopyPower } from "../engine/effect-resolver/actions/modifiers.js";
import type { Action, EffectResult, RuntimeActiveEffect } from "../engine/effect-types.js";
import type { GameState } from "../types.js";
import { createBattleReadyState, createTestCardDb, CARDS } from "./helpers.js";

const cardDb = createTestCardDb();

/** Opponent leader (player 1) gets +2000 from an active effect. */
function withBuffedOpponentLeader(state: GameState): GameState {
  const buff: RuntimeActiveEffect = {
    id: "leader-buff",
    sourceCardInstanceId: state.players[1].leader.instanceId,
    sourceEffectBlockId: "test",
    category: "auto",
    modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 2000 } }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: state.turn.number },
    controller: 1,
    appliesTo: [state.players[1].leader.instanceId],
    timestamp: 1,
  };
  return { ...state, activeEffects: [...state.activeEffects, buff as any] };
}

function copiedValue(result: ReturnType<typeof executeCopyPower>): number {
  const effect = (result.state.activeEffects as RuntimeActiveEffect[]).find(
    (e) => e.modifiers?.some((m) => (m.type as string) === "SET_POWER"),
  );
  expect(effect).toBeDefined();
  return (effect!.modifiers![0].params as { value: number }).value;
}

describe("COPY_POWER source_power", () => {
  it("copies printed base when only additive power changes with source_power: BASE", () => {
    const state = withBuffedOpponentLeader(createBattleReadyState(cardDb));
    const action: Action = {
      type: "COPY_POWER",
      target: { type: "SELF" },
      params: { source: "OPPONENT_LEADER", source_power: "BASE" },
      duration: { type: "THIS_TURN" },
    };
    const result = executeCopyPower(state, action, "char-0-v1", 0, cardDb, new Map<string, EffectResult>());
    expect(result.succeeded).toBe(true);
    expect(copiedValue(result)).toBe(CARDS.LEADER.power); // 5000, buff ignored
  });

  it("copies the leader's effective power by default", () => {
    const state = withBuffedOpponentLeader(createBattleReadyState(cardDb));
    const action: Action = {
      type: "COPY_POWER",
      target: { type: "SELF" },
      params: { source: "OPPONENT_LEADER" },
      duration: { type: "THIS_TURN" },
    };
    const result = executeCopyPower(state, action, "char-0-v1", 0, cardDb, new Map<string, EffectResult>());
    expect(result.succeeded).toBe(true);
    expect(copiedValue(result)).toBe(CARDS.LEADER.power! + 2000); // 7000, buff included
  });
});


describe("OPT-833: copied base is a setting-layer read", () => {
  it.each(["BASE", "EFFECTIVE"] as const)("%s captures a changed Leader with additive power and active DON!!", (sourcePower) => {
    const state = withBuffedOpponentLeader(createBattleReadyState(cardDb));
    state.turn.activePlayerIndex = 1;
    const source = state.players[1].leader;
    source.attachedDon = [{ instanceId: "source-don", state: "ACTIVE", attachedTo: source.instanceId }];
    state.activeEffects.push({ ...state.activeEffects[0], id: "leader-setting", modifiers: [{ type: "SET_POWER", params: { value: 8000 } }] });
    const target = state.players[0].characters[0]!;
    const result = executeCopyPower(state, {
      type: "COPY_POWER", target: { type: "SELF" },
      params: { source: "OPPONENT_LEADER", source_power: sourcePower },
      duration: { type: "THIS_TURN" },
    }, target.instanceId, 0, cardDb, new Map());
    expect(result.succeeded).toBe(true);
    expect(getEffectivePower(source, cardDb.get(source.cardId)!, state, cardDb)).toBe(11000);
    expect(getEffectiveBasePower(target, cardDb.get(target.cardId)!, result.state, cardDb)).toBe(sourcePower === "BASE" ? 8000 : 11000);
  });
});
