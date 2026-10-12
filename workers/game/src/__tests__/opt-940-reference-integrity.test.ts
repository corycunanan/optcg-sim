/**
 * OPT-940 continuation-reference integrity: a prompt or frame reference that
 * points at no frame, at a frame of an incompatible kind, or at a semantic
 * contradiction is rejected with a message naming the reference.
 *
 * Contract: docs/game-engine/SAVED-STATE-COMPATIBILITY.md §2.3, §2.4.
 */

import { describe, expect, it } from "vitest";
import type { GameState } from "../types.js";
import { convertPersistedGameState } from "../session/persistence.js";
import {
  EFFECT_STACK_FRAME_KINDS,
  frameKindOf,
  type EffectStackFrameKind,
} from "../session/game-state-schema.js";
import { loadGoldenFixture } from "./opt-940-writer-golden.test.js";

type RawState = Record<string, unknown> & {
  effectStack: Array<Record<string, unknown>>;
  pendingPrompt: Record<string, unknown> | null;
  turn: Record<string, unknown>;
};

function rawState(name: string): RawState {
  const golden = loadGoldenFixture().cases[name];
  if (!golden) throw new Error(`no golden case named ${name}`);
  return (JSON.parse(golden.sessionJson) as { state: RawState }).state;
}

function expectRejected(raw: RawState, message: string | RegExp): void {
  expect(() => convertPersistedGameState(raw, "state")).toThrow(message);
}

describe("OPT-940 frame kind contract", () => {
  const expected: Array<[string, number, EffectStackFrameKind]> = [
    ["effect-frame-prompt", 0, "EFFECT"],
    ["legacy-cost-transaction-frame", 0, "COST"],
    ["trigger-order-prompt", 0, "TRIGGER_ORDER"],
    ["batch-resume-frame", 0, "BATCH_RESUME"],
    ["end-phase-parked", 0, "PHASE_BOUNDARY"],
  ];

  it.each(expected)("%s frame %i derives kind %s", (name, index, kind) => {
    const state = convertPersistedGameState(rawState(name), "state");
    expect(frameKindOf(state.effectStack[index])).toBe(kind);
    expect(state.effectStack[index].kind).toBeUndefined();
  });

  it("derives TRIGGER_DRAIN for an interrupted frame without a phase boundary", () => {
    expect(
      frameKindOf({ phase: "INTERRUPTED_BY_TRIGGERS", phaseBoundaryContinuation: undefined })
    ).toBe("TRIGGER_DRAIN");
  });

  it("accepts an explicit kind that agrees with the frame and keeps it on the loaded frame", () => {
    const raw = rawState("effect-frame-prompt");
    raw.effectStack[0].kind = "EFFECT";
    const state = convertPersistedGameState(raw, "state");
    expect(state.effectStack[0].kind).toBe("EFFECT");
  });

  it("rejects an explicit kind that disagrees with the frame's content, naming both", () => {
    const raw = rawState("effect-frame-prompt");
    raw.effectStack[0].kind = "COST";
    expectRejected(
      raw,
      'Stored session state effectStack[0] (frame "golden-effect-frame") declares kind COST but its content is EFFECT'
    );
  });

  it("rejects a kind outside the contract at strict validation", () => {
    const raw = rawState("effect-frame-prompt");
    raw.effectStack[0].kind = "DAMAGE";
    expectRejected(raw, /invalid core shape at effectStack\.0\.kind/);
    expect(EFFECT_STACK_FRAME_KINDS).not.toContain("DAMAGE");
  });
});

describe("OPT-940 reference integrity: prompt → frame", () => {
  it("rejects a string resumeContext that names no frame", () => {
    const raw = rawState("effect-frame-prompt");
    raw.pendingPrompt!.resumeContext = "frame-that-does-not-exist";
    expectRejected(
      raw,
      'Stored session state pendingPrompt.resumeContext names frame "frame-that-does-not-exist", which is not on the effect stack (1 frame)'
    );
  });

  it("rejects a string resumeContext while the effect stack is empty", () => {
    const raw = rawState("effect-frame-prompt");
    raw.effectStack = [];
    expectRejected(raw, /pendingPrompt\.resumeContext names frame "golden-effect-frame", which is not on the effect stack \(0 frames\)/);
  });

  it("rejects a string resumeContext that names the PHASE_BOUNDARY frame below the prompt", () => {
    const raw = rawState("end-phase-parked");
    const phaseFrame = raw.effectStack.find((frame) => frame.phaseBoundaryContinuation)!;
    raw.pendingPrompt!.resumeContext = phaseFrame.id;
    expectRejected(
      raw,
      new RegExp(`pendingPrompt\\.resumeContext names frame "${phaseFrame.id}", a PHASE_BOUNDARY frame that cannot own a prompt`)
    );
  });

  it("rejects duplicate frame ids", () => {
    const raw = rawState("end-phase-parked");
    raw.effectStack[1].id = raw.effectStack[0].id;
    expectRejected(raw, /effectStack\[1\] repeats frame id/);
  });
});

describe("OPT-940 reference integrity: trigger ordering group", () => {
  it("rejects a resolved trigger id that is not in the group", () => {
    const raw = rawState("trigger-order-prompt");
    const group = raw.effectStack[0].triggerOrderingGroup as { resolvedTriggerIds: string[] };
    group.resolvedTriggerIds.push("ghost:trigger:0");
    expectRejected(
      raw,
      'Stored session state effectStack[0].triggerOrderingGroup.resolvedTriggerIds[1] names "ghost:trigger:0", which is not a trigger in that group'
    );
  });
});

describe("OPT-940 reference integrity: phase boundary", () => {
  function phaseFrameIndex(raw: RawState): number {
    return raw.effectStack.findIndex((frame) => frame.phaseBoundaryContinuation);
  }

  it("rejects a parked End Phase whose ending player is not the active player", () => {
    const raw = rawState("end-phase-parked");
    const index = phaseFrameIndex(raw);
    (raw.effectStack[index].phaseBoundaryContinuation as { endingPlayerIndex: number }).endingPlayerIndex = 1;
    expectRejected(
      raw,
      new RegExp(`effectStack\\[${index}\\] \\(frame "[^"]+"\\) has phaseBoundaryContinuation\\.endingPlayerIndex 1 but turn\\.activePlayerIndex is 0`)
    );
  });

  it("rejects a parked End Phase outside the END phase", () => {
    const raw = rawState("end-phase-parked");
    raw.turn.phase = "MAIN";
    expectRejected(raw, /parks an End Phase while turn\.phase is MAIN/);
  });

  it("rejects a parked End Phase on a frame that is not interrupted by triggers", () => {
    const raw = rawState("end-phase-parked");
    raw.effectStack[phaseFrameIndex(raw)].phase = "AWAITING_TARGET_SELECTION";
    expectRejected(raw, /is PHASE_BOUNDARY but has phase AWAITING_TARGET_SELECTION/);
  });
});

describe("OPT-940 reference integrity: battle damage records", () => {
  it("rejects a damage continuation with no battle", () => {
    const raw = rawState("stuck-damage-step");
    raw.turn.battle = null;
    expectRejected(
      raw,
      'Stored session state turn.pendingBattleDamageContinuation refers to battle "golden-stuck-battle" but turn.battle is null'
    );
  });

  it("rejects a damage continuation whose battle id differs from the battle", () => {
    const raw = rawState("stuck-damage-step");
    (raw.turn.battle as { battleId: string }).battleId = "other-battle";
    expectRejected(
      raw,
      'refers to battle "golden-stuck-battle" but turn.battle is "other-battle"'
    );
  });

  it("rejects a damage continuation outside the Damage Step", () => {
    const raw = rawState("stuck-damage-step");
    raw.turn.battleSubPhase = "COUNTER_STEP";
    expectRejected(raw, /turn\.pendingBattleDamageContinuation exists while turn\.battleSubPhase is COUNTER_STEP; expected DAMAGE_STEP/);
  });

  it("rejects a battle Trigger window outside the Damage Step", () => {
    const raw = rawState("battle-trigger-window");
    raw.turn.battleSubPhase = "COUNTER_STEP";
    expectRejected(raw, /turn\.battle\.pendingTriggerLifeCard exists while turn\.battleSubPhase is COUNTER_STEP/);
  });

  it("rejects two open Trigger windows", () => {
    const raw = rawState("battle-trigger-window");
    const effect = rawState("effect-damage-trigger-window");
    raw.turn.pendingTriggerFromEffect = effect.turn.pendingTriggerFromEffect;
    expectRejected(raw, "turn.pendingTriggerFromEffect and turn.battle.pendingTriggerLifeCard are both set; only one Trigger window can be open");
  });

  it("rejects a COST frame with no costs and a BATCH_RESUME frame with no marker", () => {
    const cost = rawState("legacy-cost-transaction-frame");
    cost.effectStack[0].costs = [];
    cost.effectStack[0].currentCostIndex = 0;
    expectRejected(cost, /effectStack\[0\] \(frame "golden-legacy-cost-frame"\) is COST but has no costs/);

    const batch = rawState("batch-resume-frame");
    delete batch.effectStack[0].batchResumeMarker;
    expectRejected(batch, /is BATCH_RESUME but has no batchResumeMarker/);
  });
});

describe("OPT-940 reference integrity: every golden shape still loads", () => {
  it.each(Object.keys(loadGoldenFixture().cases))("%s", (name) => {
    const state: GameState = convertPersistedGameState(rawState(name), "state");
    expect(state.id).toBeTypeOf("string");
  });
});
