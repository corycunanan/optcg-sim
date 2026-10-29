import { describe, expect, it } from "vitest";
import type { CardData, GameState } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Rules 7-1-1-3/4: finish the attack effect before admitting Block Step
// actions, even though the engine has already assigned its early step label.
function attack(optional = false, onBlock = false) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.triggerRegistry = [];
  const data: CardData = {
    ...CARDS.BLOCKER,
    id: "OPT1000-DECISION",
    effectSchema: {
      effects: [
        {
          id: "decision",
          category: "auto",
          trigger: { keyword: onBlock ? "ON_BLOCK" : "ON_OPPONENT_ATTACK" },
          flags: { optional },
          actions: [
            {
              type: "TRASH_CARD",
              target: {
                type: "CHARACTER",
                controller: "EITHER",
                count: { up_to: 1 },
              },
            },
          ],
        },
      ],
    },
  };
  db.set(data.id, data);
  const source = {
    ...state.players[0].characters[0]!,
    cardId: data.id,
    instanceId: "decision-source",
    owner: 1 as const,
    controller: 1 as const,
  };
  state.players[1].characters = padChars([source]);
  state = registerCardEnteredField(state, source, data);
  const attacker = state.players[0].characters[0]!.instanceId;
  let result = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    db,
    0
  );
  expect(result.valid, result.error).toBe(true);
  expect(result.state.turn.battleSubPhase).toBe("BLOCK_STEP");
  if (onBlock) {
    result = runPipeline(
      result.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: source.instanceId },
      db,
      1
    );
    expect(result.valid, result.error).toBe(true);
    expect(result.state.turn.battleSubPhase).toBe("COUNTER_STEP");
  }
  return { state: result.state, db, attacker };
}

const services = {
  drainPregame: (s: GameState) => s,
  advanceStartOfTurn: (s: GameState) => s,
};

describe("OPT-1000 direct pipeline PASS admission", () => {
  it.each(
    [false, true].flatMap((optional) =>
      [false, true].map((onBlock) => ({ optional, onBlock }))
    )
  )(
    "rejects PASS without mutation while optional=$optional, onBlock=$onBlock",
    ({ optional, onBlock }) => {
      const { state, db } = attack(optional, onBlock);
      expect(state.pendingPrompt?.options.promptType).toBe(
        optional ? "OPTIONAL_EFFECT" : "SELECT_TARGET"
      );
      const before = structuredClone(state);
      const result = runPipeline(state, { type: "PASS" }, db, 1);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(
        "A player decision must finish before another game action"
      );
      expect(result.state).toBe(state);
      expect(result.state).toEqual(before);
      expect(state).toEqual(before); // includes prompt, stack, event/action history and execution context
    }
  );

  it("keeps coordinator rejection and undo history, then accepts the legitimate target reply", () => {
    const { state, db, attacker } = attack();
    const coordinator = new SessionCoordinator();
    const before = structuredClone(state);
    const history = [state];
    const rejected = coordinator.executeAction(
      state,
      history,
      1,
      { type: "PASS" },
      db
    );
    expect(rejected.kind).toBe("reject");
    expect(rejected.state).toBe(state);
    expect(rejected.undoHistory).toEqual(history);
    expect(state).toEqual(before);
    const reply = {
      type: "SELECT_TARGET" as const,
      selectedInstanceIds: [attacker],
      promptId: state.pendingPrompt!.promptId,
    };
    expect(coordinator.executeAction(state, history, 1, reply, db).kind).toBe(
      "resume"
    );
    const resumed = resumePromptLifecycle(state, reply, db, services);
    expect(resumed.responseRejected).toBe(false);
    expect(resumed.state.pendingPrompt).toBeNull();
    expect(
      resumed.state.players[0].characters.some(
        (c) => c?.instanceId === attacker
      )
    ).toBe(false);
    expect(resumed.state.turn.battle).toBeNull();
  });

  it("preserves OPTIONAL_EFFECT PASS decline through the session prompt boundary", () => {
    const { state, db } = attack(true);
    const reply = {
      type: "PASS" as const,
      promptId: state.pendingPrompt!.promptId,
    };
    expect(
      new SessionCoordinator().executeAction(state, [], 1, reply, db).kind
    ).toBe("resume");
    const resumed = resumePromptLifecycle(state, reply, db, services);
    expect(resumed.responseRejected).toBe(false);
    expect(resumed.state.pendingPrompt).toBeNull();
    expect(resumed.state.effectStack).toEqual([]);
    expect(resumed.state.turn.battleSubPhase).toBe("BLOCK_STEP");
    const passed = runPipeline(resumed.state, { type: "PASS" }, db, 1);
    expect(passed.valid, passed.error).toBe(true);
    expect(passed.state.turn.battleSubPhase).toBe("COUNTER_STEP");
  });

  it("accepts ordinary Block and Counter PASS without a prompt", () => {
    const db = createTestCardDb();
    const initial = createBattleReadyState(db);
    initial.triggerRegistry = [];
    initial.players[1].life = initial.players[1].life.map((c) => ({
      ...c,
      cardId: CARDS.VANILLA.id,
    }));
    const attackResult = runPipeline(
      initial,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: initial.players[0].leader.instanceId,
        targetInstanceId: initial.players[1].leader.instanceId,
      },
      db,
      0
    );
    expect(attackResult.valid).toBe(true);
    expect(attackResult.state.pendingPrompt).toBeNull();
    const block = runPipeline(attackResult.state, { type: "PASS" }, db, 1);
    expect(block.valid, block.error).toBe(true);
    expect(block.state.turn.battleSubPhase).toBe("COUNTER_STEP");
    expect(block.state.pendingPrompt).toBeNull();
    const counter = runPipeline(block.state, { type: "PASS" }, db, 1);
    expect(counter.valid, counter.error).toBe(true);
    expect(counter.state.turn.battleSubPhase).toBeNull();
    expect(counter.state.players[1].life).toHaveLength(
      initial.players[1].life.length - 1
    );
  });
});
