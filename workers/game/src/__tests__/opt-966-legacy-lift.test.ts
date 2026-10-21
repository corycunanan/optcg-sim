import { expect, it } from "vitest";
import fixture from "./fixtures/opt-965-battle-debt.synthetic.json";
import type { CardData } from "../types.js";
import { convertPersistedGameState, parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { buildTriggerSelectionPrompt } from "../engine/trigger-ordering.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";
import { continuationBoundary, pushFrame } from "../engine/effect-stack.js";
import { MAX_EFFECT_STACK_DEPTH } from "../engine/engine-limits.js";

it.each(["live", "undo"] as const)("legacy ordering above battle preserves graph, debt and completion: %s", location => {
  const db = new Map(Object.entries(fixture.cardDb)) as Map<string, CardData>;
  const loaded = convertPersistedGameState(structuredClone(fixture.state), "state");
  const battle = loaded.effectStack.find(frame => frame.battleDamage)!;
  const trigger = battle.pendingTriggers[0];
  // The same selection builder used by the old public trigger queue. Independent
  // review also reproduced this graph through the pinned reader's public group API.
  const ordered = buildTriggerSelectionPrompt({ ...loaded, pendingPrompt: null, effectStack: [battle] }, [trigger, { ...trigger }], [], db);
  const raw = toPersistedGameState({ ...ordered.state, pendingPrompt: { ...ordered.pendingPrompt!, promptId: "legacy-order" } });
  const parsed = parseStoredSession({ state: structuredClone(raw), cardDb: fixture.cardDb, undoHistory: [structuredClone(raw)] });
  const state = location === "live" ? parsed.state : parsed.undoHistory[0];
  const rejected = resumeFromStack(state, { type: "PLAYER_CHOICE", choiceId: "invalid" }, db);
  expect(rejected.rejected).toBe(true);
  expect(rejected.state).toBe(state);
  expect(rejected.state).toEqual(state);
  const action = { type: "PLAYER_CHOICE" as const, choiceId: state.effectStack.at(-1)!.simultaneousTriggers[0].orderingId! };
  const result = resumeFromStack({ ...state, pendingPrompt: null }, action, db);
  const retained = result.state.effectStack.filter(frame => frame.id === battle.id);
  expect(retained).toHaveLength(1);
  expect(retained[0]).toEqual(battle);
  expect(result.state.players[0].hand).toHaveLength(state.players[0].hand.length + 2);
  expect(result.events.filter(event => event.type === "CARD_DRAWN")).toHaveLength(2);
  expect(new Set(result.state.effectStack.map(frame => frame.id)).size).toBe(result.state.effectStack.length);
  const complete = resumePromptLifecycle(state, action, db, { drainPregame: s => s, advanceStartOfTurn: s => s });
  expect(complete.responseRejected).toBeFalsy();
  expect(complete.state.pendingPrompt).toBeNull();
  expect(complete.state.effectStack).toEqual([]);
  expect(complete.state.turn.battle).toBeNull();
  expect(complete.state.eventLog.filter(event => event.type === "END_OF_BATTLE")).toHaveLength(1);
  expect(complete.state.eventLog.filter(event => event.type === "CARD_DRAWN")).toHaveLength(3);
});

it.each(["live", "undo"] as const)("legacy lifting at the stack budget returns terminal without replaying work: %s", location => {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  for (let n = 0; n < MAX_EFFECT_STACK_DEPTH; n++) {
    const boundary = continuationBoundary(state, state.players[0].leader.instanceId, 0);
    state = pushFrame(boundary.state, boundary.frame);
  }
  const raw = toPersistedGameState(state);
  const parsed = parseStoredSession({ state: structuredClone(raw), cardDb: Object.fromEntries(db), undoHistory: [structuredClone(raw)] });
  state = location === "live" ? parsed.state : parsed.undoHistory[0];
  const beforePlayers = structuredClone(state.players);
  const result = resumeFromStack(state, { type: "PASS" }, db);
  expect(result.kind).toBe("terminal");
  expect(result.state.effectStack).toEqual([]);
  expect(result.state.pendingPrompt).toBeNull();
  expect(result.state.players).toEqual(beforePlayers);
  expect(result.state.eventLog.filter(event => event.type === "GAME_OVER")).toHaveLength(1);
});
