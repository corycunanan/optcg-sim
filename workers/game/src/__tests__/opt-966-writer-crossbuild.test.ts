import { writeFileSync } from "node:fs";
/** Execute actual writer snapshots with the separately pinned deployed reader.
 * Run with OPT966_READER_ROOT; no reader mocks or schema-only substitute. */
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { endPhaseRig, synSchema, type EndPhaseRig, fullEndPhaseScenario, fullEndPhaseReply } from "./opt-962-rig.js";

it.skipIf(!process.env.OPT966_READER_ROOT)("replays every End Phase pause from live and undo on deployed reader", async () => {
  const root = process.env.OPT966_READER_ROOT!;
  const { SessionRepository: ReaderRepository } = await import(`${root}/workers/game/src/session/persistence.ts`) as typeof import("../session/persistence.js");
  const { resumePromptLifecycle: readerResume } = await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`) as typeof import("../session/prompt-lifecycle.js");
  const rig = fullEndPhaseScenario();
  rig.act({ type: "ADVANCE_PHASE" });
  const snapshots: GameState[] = [];
  const replies: GameAction[] = [];
  for (let n = 0; rig.state.pendingPrompt; n++) {
    expect(n).toBeLessThan(12);
    rig.state.pendingPrompt.promptId = `crossbuild-phase-${n}`;
    snapshots.push(structuredClone(rig.state));
    const reply = fullEndPhaseReply(rig, n);
    replies.push(reply.action);
    rig.act(reply.action, reply.player);
  }
  expect(snapshots.length).toBe(5);
  const corpus: unknown[] = [];
  for (const [index, paused] of snapshots.entries()) {
    expect(paused.effectStack.some(frame => frame.triggerExecution)).toBe(true);
    const storage = new MemorySessionStorage();
    const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
    await new SessionRepository(storage, options).save({ state: paused, cardDb: rig.db,
      mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [paused] });
    corpus.push({ index, stored: Object.fromEntries(storage.data), replies: replies.slice(index) });
    const loaded = (await new ReaderRepository(storage, options).load())!;
    for (const initial of [loaded.state, loaded.undoHistory[0]]) {
      let actual = initial;
      for (const action of replies.slice(index)) {
        const result = readerResume(actual, action, rig.db, {
          drainPregame: (s) => s, advanceStartOfTurn: (s) => s,
        });
        expect(result.responseRejected).toBeFalsy();
        actual = result.state;
      }
      expect(actual.pendingPrompt).toBeNull();
      expect(actual.effectStack).toEqual([]);
      expect(actual.eventLog).toEqual(rig.state.eventLog);
      expect(actual.players).toEqual(rig.state.players);
      expect(actual.turn).toEqual(rig.state.turn);
      expect(actual.executionContext).toEqual(rig.state.executionContext);
    }
  }
  if (process.env.OPT966_WRITE_CORPUS) writeFileSync(process.env.OPT966_WRITE_CORPUS, JSON.stringify({ writerBase: "dfe08838", cases: corpus, expected: rig.state }, null, 2) + "\n");
});


async function replayPauses(rig: EndPhaseRig, choose: (state: GameState) => GameAction) {
  const root = process.env.OPT966_READER_ROOT!;
  const { SessionRepository: ReaderRepository } = await import(`${root}/workers/game/src/session/persistence.ts`) as typeof import("../session/persistence.js");
  const { resumePromptLifecycle: readerResume } = await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`) as typeof import("../session/prompt-lifecycle.js");
  const pauses: GameState[] = [];
  const actions: GameAction[] = [];
  while (rig.state.pendingPrompt) {
    expect(pauses.length).toBeLessThan(12);
    rig.state.pendingPrompt.promptId = `crossbuild-${pauses.length}`;
    pauses.push(structuredClone(rig.state));
    const reply = choose(rig.state);
    actions.push(reply);
    rig.act(reply, rig.state.pendingPrompt.respondingPlayer);
  }
  expect(pauses.length).toBeGreaterThan(0);
  for (const [index, state] of pauses.entries()) {
    const storage = new MemorySessionStorage();
    const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
    await new SessionRepository(storage, options).save({ state, cardDb: rig.db,
      mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] });
    const loaded = (await new ReaderRepository(storage, options).load())!;
    for (const initial of [loaded.state, loaded.undoHistory[0]]) {
      let actual = initial;
      for (const [offset, action] of actions.slice(index).entries()) {
        expect(actual.pendingPrompt?.options).toEqual(pauses[index + offset].pendingPrompt?.options);
        expect(actual.pendingPrompt?.respondingPlayer).toEqual(pauses[index + offset].pendingPrompt?.respondingPlayer);
        const result = readerResume(actual, action, rig.db, { drainPregame: s => s, advanceStartOfTurn: s => s });
        expect(result.responseRejected).toBeFalsy();
        actual = result.state;
      }
      expect(actual.pendingPrompt).toBeNull();
      expect(actual.effectStack).toEqual([]);
      expect(actual.eventLog).toEqual(rig.state.eventLog);
      expect(actual.players).toEqual(rig.state.players);
      expect(actual.turn).toEqual(rig.state.turn);
      expect(actual.executionContext).toEqual(rig.state.executionContext);
    }
  }
}

it.skipIf(!process.env.OPT966_READER_ROOT)("replays Life reveal and prompted Trigger child from actual writer live and undo", async () => {
  const rig = endPhaseRig();
  const source = rig.putSyn("DEALER", synSchema("DEALER", "Character", [{
    id: "deal", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [
      { type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 2 } },
      { type: "DRAW", params: { amount: 1 } },
    ],
  }]), 0, "CHARACTER");
  const child = rig.putSyn("CHILD", synSchema("CHILD", "Character", [{
    id: "onplay", category: "auto", trigger: { keyword: "ON_PLAY" },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]), 1, "HAND");
  rig.putSyn("LIFE", synSchema("LIFE", "Character", [{
    id: "life", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [
      { type: "PLAY_CARD", target: { type: "CHARACTER_CARD", source_zone: "HAND", controller: "SELF", count: { up_to: 1 }, filter: { name: "CHILD" } }, params: { source_zone: "HAND", cost_override: "FREE" } },
      { type: "DRAW", params: { amount: 1 } },
    ],
  }]), 1, "HAND", { triggerText: "Play a CHILD, then draw 1.", keywords: { ...rig.db.get("CHAR-VANILLA")!.keywords, trigger: true } });
  rig.state.players[1].life = [
    { instanceId: "life-first", cardId: "LIFE", face: "DOWN" },
    { instanceId: "life-last", cardId: "CHAR-VANILLA", face: "DOWN" },
  ];
  rig.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "deal" });
  await replayPauses(rig, state => state.pendingPrompt!.options.promptType === "REVEAL_TRIGGER"
    ? { type: "REVEAL_TRIGGER", reveal: true }
    : { type: "SELECT_TARGET", selectedInstanceIds: [child.instanceId] });
});

it.skipIf(!process.env.OPT966_READER_ROOT)("replays replacement offer and own suffix from actual writer live and undo", async () => {
  const rig = endPhaseRig();
  const source = rig.putSyn("KO-SOURCE", synSchema("KO-SOURCE", "Character", [{
    id: "ko", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } } },
      { type: "DRAW", params: { amount: 1 } },
    ],
  }]), 0, "CHARACTER");
  const protectedTarget = rig.putSyn("PROTECTED", null, 1, "CHARACTER");
  rig.putSyn("OTHER", null, 1, "CHARACTER");
  rig.state.activeEffects = [{
    id: "replace", sourceCardInstanceId: protectedTarget.instanceId,
    sourceEffectBlockId: "replace", category: "replacement", modifiers: [{
      type: "REPLACEMENT_EFFECT", params: { trigger: "WOULD_BE_KO", cause_filter: { by: "ANY" }, target_filter: null,
        replacement_actions: [{ type: "LIFE_TO_HAND", params: { amount: 1 } }], optional: true, once_per_turn: false },
    }], duration: { type: "PERMANENT" }, expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 1, appliesTo: [protectedTarget.instanceId], timestamp: 1,
  }];
  rig.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "ko" });
  await replayPauses(rig, () => ({ type: "PLAYER_CHOICE", choiceId: "accept" }));
});
