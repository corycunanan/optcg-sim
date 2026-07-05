/**
 * COPY_POWER source_power: "BASE" — copies the source's printed power,
 * ignoring active modifiers on it (OP16-036: "base power becomes the same as
 * your opponent's Leader"). Default remains effective power (OP16-055:
 * "…the same as your opponent's Leader's power").
 */

import { describe, expect, it } from "vitest";
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
  it("copies the leader's printed power with source_power: BASE", () => {
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
