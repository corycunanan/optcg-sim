import { candidateExpected } from "./fixtures/opt-968-candidate-expectations.js";
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { SessionRepository } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import corpus from "./fixtures/opt-966-counter-prefix-writer.json";

const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
async function loadCase(index: number) {
  const storage = new MemorySessionStorage();
  await storage.put(structuredClone(corpus.cases[index].stored));
  return (await new SessionRepository(storage, options).load())!;
}

it.each(corpus.cases)("replays actual Counter pause $index through every subsequent live/undo save", async ({index, replies}) => {
  const loaded = await loadCase(index);
  for (const initial of [loaded.state, loaded.undoHistory[0]]) {
    let actual = initial;
    for (const [offset, action] of replies.entries()) {
      actual.pendingPrompt!.promptId = `crossbuild-${index + offset}`;
      const storage = new MemorySessionStorage();
      await new SessionRepository(storage, options).save({ ...loaded, state: actual, undoHistory: [actual] });
      actual = (await new SessionRepository(storage, options).load())!.state;
      expect(actual).toEqual(
          { ...candidateExpected<GameState>(`event-owner/${index}/pause/${offset}`), schemaVersion: 7 }
        );
      const completion = actual.effectStack.find(
          (frame) => frame.eventActivation)!;
      expect(completion.accumulatedEvents).toEqual([]);
      expect(actual.pendingPrompt!.respondingPlayer).toBe(index + offset === 2 ? 0 : 1);
      const result = resumePromptLifecycle(actual, action as GameAction, loaded.cardDb, {
        drainPregame: (state) => state, advanceStartOfTurn: (state) => state,
      });
      expect(result.responseRejected).toBe(false);
      actual = result.state;
    }
    expect(actual).toEqual({ ...candidateExpected<GameState>(`event-owner/${index}/final`), schemaVersion: 7 });
    expect(actual.effectStack).toEqual([]);
    expect(actual.pendingPrompt).toBeNull();
    for (const type of ["POWER_MODIFIED", "EVENT_ACTIVATED_FROM_HAND", "COUNTER_USED"])
      expect(actual.eventLog.filter((event) => event.type === type)).toHaveLength(1);
    expect(actual.eventLog.filter((event) => event.type === "CARD_DRAWN")).toHaveLength(2);
  }
});

it.skipIf(!process.env.OPT966_READER_ROOT)("preserves normal v4 Counter pipeline bytes at every pause", async () => {
  const root = process.env.OPT966_READER_ROOT!;
  const baselinePipeline = (await import(`${root}/workers/game/src/engine/pipeline.ts`
    )) as typeof import("../engine/pipeline.js");
  const baselineResume = (await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`
    )) as typeof import("../session/prompt-lifecycle.js");
  const { SessionRepository: BaselineRepository } = (await import(`${root}/workers/game/src/session/persistence.ts`
    )) as typeof import("../session/persistence.js");
  const { runPipeline } = await import("../engine/pipeline.js");
  const { endPhaseRig } = await import("./opt-962-rig.js");
  const { getEffectSchema } = await import("../engine/schema-registry.js");
  const rig = endPhaseRig();
  const host = rig.putSyn("PRB02-009", getEffectSchema("PRB02-009")!, 0, "CHARACTER");
  const counter = rig.putSyn("OP01-058", getEffectSchema("OP01-058")!, 1, "HAND");
  rig.db.set(counter.cardId, { ...rig.db.get(counter.cardId)!, type: "Event", cost: 2, counter: null, effectText: "[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, rest up to 1 of your opponent’s Characters with a cost of 4 or less." });
  let actual = rig.state;
  let expected = structuredClone(actual);
  const actions: [GameAction, 0 | 1][] = [
    [{ type: "DECLARE_ATTACK", attackerInstanceId: actual.players[0].leader.instanceId, targetInstanceId: actual.players[1].leader.instanceId }, 0],
    [{ type: "PASS" }, 1],
    [{ type: "USE_COUNTER_EVENT", cardInstanceId: counter.instanceId, counterTargetInstanceId: actual.players[1].leader.instanceId }, 1],
    [{ type: "SELECT_TARGET", selectedInstanceIds: [actual.players[1].leader.instanceId] }, 1],
    [{ type: "SELECT_TARGET", selectedInstanceIds: [host.instanceId] }, 1],
    [{ type: "PLAYER_CHOICE", choiceId: "accept" }, 0],
  ];
  let pauses = 0;
  for (const [action, player] of actions) {
    const services = { drainPregame: (state: GameState) => state, advanceStartOfTurn: (state: GameState) => state };
    actual = actual.pendingPrompt ? resumePromptLifecycle(actual, action, rig.db, services).state : runPipeline(actual, action, rig.db, player).state;
    expected = expected.pendingPrompt ? baselineResume.resumePromptLifecycle(expected, action, rig.db, services).state : baselinePipeline.runPipeline(expected, action, rig.db, player).state;
    if (actual.pendingPrompt) {
      actual.pendingPrompt.promptId = expected.pendingPrompt!.promptId = `v4-counter-${pauses++}`;
      expect(actual.effectStack.some((frame) => frame.triggerExecution)).toBe(false);
      const storages = [new MemorySessionStorage(), new MemorySessionStorage()];
      await new SessionRepository(storages[0], options).save({ state: actual, cardDb: rig.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [actual] });
      await new BaselineRepository(storages[1], options).save({ state: expected, cardDb: rig.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [expected] });
      expect(Object.fromEntries(storages[0].data)).toEqual(Object.fromEntries(storages[1].data));
      actual = (await new SessionRepository(storages[0], options).load())!.state;
      expected = (await new BaselineRepository(storages[1], options).load())!.state;
    }
    expect(actual).toEqual(expected);
  }
  expect(pauses).toBe(3);
  expect(actual.pendingPrompt).toBeNull();
  expect(actual.eventLog.filter((event) => event.type === "CARD_DRAWN")).toHaveLength(2);
});

it.each(["owner", "inner", "battle", "stale"] as const)("retains independent propagation flags on nearest eligible %s owner", async (topology) => {
  const { retainPropagationBeforePrompt } = await import("../engine/effect-resolver/resume/events.js");
  const { default: battle } = await import("./fixtures/opt-966-battle-debt-writer.json");
  const state = (await loadCase(2)).state;
  const completion = state.effectStack.find(
      (frame) => frame.eventActivation)!;
  const owner = state.effectStack.find((frame) => frame.triggerExecution)!;
  owner.accumulatedEvents = [];
  const prompt = state.effectStack.at(-1)!;
  const storage = new MemorySessionStorage();
  await storage.put(structuredClone(battle.cases[2].stored));
  const battleState = (await new SessionRepository(storage, options).load())!.state;
  const damage = battleState.effectStack.find((frame) => frame.battleDamage)!;
  damage.accumulatedEvents = [];
  state.turn.battle = battleState.turn.battle;
  const inner = { ...structuredClone(owner), id: "inner-owner" };
  if (topology === "stale") damage.battleDamage!.battleId = "stale-battle";
  state.effectStack = [completion, owner, ...(topology === "inner" ? [inner] : topology === "owner" ? [] : [damage]), prompt];
  const event = { type: "CARD_DRAWN" as const, playerIndex: 0 as const, payload: { cardId: "probe" }, propagation: { eventLogEmitted: true as const } };
  const equalPayload = structuredClone(event);
  const complete = { ...event, propagation: { eventLogEmitted: true as const, triggerScanned: true as const } };
  const result = retainPropagationBeforePrompt(state, [event, event, equalPayload, complete]);
  const expectedId = topology === "inner" ? inner.id : topology === "battle" ? damage.id : owner.id;
  const retained = result.effectStack.find(
      (frame) => frame.id === expectedId)!.accumulatedEvents;
  expect(retained).toHaveLength(2);
  expect(retained[0]).toBe(event);
  expect(retained[1]).toBe(equalPayload);
  expect(retained.every(
        (item) => item.propagation?.eventLogEmitted && !item.propagation?.triggerScanned)).toBe(true);
  expect(result.effectStack.find((frame) => frame.eventActivation)!.accumulatedEvents).toEqual([]);
  expect(result.eventLog).toBe(state.eventLog);
  expect(result.executionContext).toBe(state.executionContext);
});

it("does not reopen terminal work", async () => {
  const { retainPropagationBeforePrompt } = await import("../engine/effect-resolver/resume/events.js");
  const { terminateGame } = await import("../engine/terminal.js");
  const state = terminateGame((await loadCase(2)).state, { kind: "WIN_GAME", winner: 0 });
  const result = retainPropagationBeforePrompt(state, [{ type: "CARD_DRAWN", playerIndex: 0, payload: { cardId: "probe" } }]);
  expect(result).toBe(state);
  expect(result.effectStack).toEqual([]);
});
