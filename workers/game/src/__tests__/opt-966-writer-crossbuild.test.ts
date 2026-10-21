import { writeFileSync } from "node:fs";
/** Execute actual writer snapshots with the separately pinned deployed reader.
 * Run with OPT966_READER_ROOT; no reader mocks or schema-only substitute. */
import { expect, it } from "vitest";
import type { GameAction, GameState } from "../types.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { endPhaseRig, synSchema, type EndPhaseRig, fullEndPhaseScenario, fullEndPhaseReply } from "./opt-962-rig.js";

async function writerRoundTrip(state: GameState, cardDb: EndPhaseRig["db"]) {
  const storage = new MemorySessionStorage();
  const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
  await new SessionRepository(storage, options).save({ state, cardDb, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] });
  return (await new SessionRepository(storage, options).load())!.state;
}

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
    rig.state = await writerRoundTrip(rig.state, rig.db);
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
      for (const [offset, action] of replies.slice(index).entries()) {
        actual.pendingPrompt!.promptId = `crossbuild-phase-${index + offset}`;
        const nextStorage = new MemorySessionStorage();
        await new ReaderRepository(nextStorage, options).save({ ...loaded, state: actual, undoHistory: [actual] });
        actual = (await new ReaderRepository(nextStorage, options).load())!.state;
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


async function replayPauses(rig: EndPhaseRig, choose: (state: GameState) => GameAction, name: string) {
  const root = process.env.OPT966_READER_ROOT!;
  const { SessionRepository: ReaderRepository } = await import(`${root}/workers/game/src/session/persistence.ts`) as typeof import("../session/persistence.js");
  const { resumePromptLifecycle: readerResume } = await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`) as typeof import("../session/prompt-lifecycle.js");
  const pauses: GameState[] = [];
  const actions: GameAction[] = [];
  while (rig.state.pendingPrompt) {
    expect(pauses.length).toBeLessThan(12);
    rig.state.pendingPrompt.promptId = `crossbuild-${pauses.length}`;
    rig.state = await writerRoundTrip(rig.state, rig.db);
    pauses.push(structuredClone(rig.state));
    const reply = choose(rig.state);
    actions.push(reply);
    rig.act(reply, rig.state.pendingPrompt!.respondingPlayer);
  }
  expect(pauses.length).toBeGreaterThan(0);
  const corpus: unknown[] = [];
  for (const [index, state] of pauses.entries()) {
    const storage = new MemorySessionStorage();
    const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
    await new SessionRepository(storage, options).save({ state, cardDb: rig.db,
      mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [state] });
    corpus.push({ index, stored: Object.fromEntries(storage.data), replies: actions.slice(index) });
    const loaded = (await new ReaderRepository(storage, options).load())!;
    for (const initial of [loaded.state, loaded.undoHistory[0]]) {
      let actual = initial;
      for (const [offset, action] of actions.slice(index).entries()) {
        actual.pendingPrompt!.promptId = `crossbuild-${index + offset}`;
        const nextStorage = new MemorySessionStorage();
        await new ReaderRepository(nextStorage, options).save({ ...loaded, state: actual, undoHistory: [actual] });
        actual = (await new ReaderRepository(nextStorage, options).load())!.state;
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
  if (process.env.OPT966_WRITE_ADDITIONAL_CORPUS) writeFileSync(`${process.env.OPT966_WRITE_ADDITIONAL_CORPUS}/${name}.json`, JSON.stringify({ writerBase: "dfe08838", cases: corpus, expected: rig.state }, null, 2) + "\n");
  return pauses;
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
  const pauses = await replayPauses(rig, state => state.pendingPrompt!.options.promptType === "REVEAL_TRIGGER"
    ? { type: "REVEAL_TRIGGER", reveal: true }
    : { type: "SELECT_TARGET", selectedInstanceIds: [child.instanceId] }, "opt966-life-writer-corpus");
  expect(pauses.map(s => s.pendingPrompt!.options.promptType)).toEqual(["REVEAL_TRIGGER", "SELECT_TARGET"]);
  expect(rig.state.eventLog.filter(e => e.type === "CARD_DRAWN")).toHaveLength(3);
  expect(rig.state.players[1].life).toHaveLength(0);
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
  const pauses = await replayPauses(rig, () => ({ type: "PLAYER_CHOICE", choiceId: "accept" }), "opt966-replacement-writer-corpus");
  expect(pauses.map(s => s.pendingPrompt!.options.promptType)).toEqual(["OPTIONAL_EFFECT"]);
  expect(rig.state.eventLog.filter(e => e.type === "CARD_KO")).toHaveLength(1);
  expect(rig.state.eventLog.filter(e => e.type === "CARD_DRAWN")).toHaveLength(1);
});

it.skipIf(!process.env.OPT966_READER_ROOT)("replays scheduled draw watcher prompts after the loaded wave owner drains", async () => {
  const rig = endPhaseRig();
  rig.putSyn("WAVE", synSchema("WAVE", "Character", [{
    id: "wave", category: "auto", trigger: { keyword: "END_OF_YOUR_TURN" }, flags: { optional: true },
    actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
  }]), 0, "CHARACTER");
  rig.putSyn("WATCHER", synSchema("WATCHER", "Character", [{
    id: "watch", category: "auto", trigger: { event: "DRAW_OUTSIDE_DRAW_PHASE", filter: { controller: "SELF" } }, flags: { optional: true },
    actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
  }]), 0, "CHARACTER");
  rig.state.scheduledActions = [{ id: "draw", timing: "END_OF_THIS_TURN", action: { type: "DRAW", params: { amount: 1 } }, boundToInstanceId: null, sourceEffectId: "draw-source", controller: 0 }];
  rig.act({ type: "ADVANCE_PHASE" });
  const pauses = await replayPauses(rig, () => ({ type: "PLAYER_CHOICE", choiceId: "accept" }), "opt966-scheduled-watcher-writer-corpus");
  expect(pauses.map(s => s.pendingPrompt!.options.promptType)).toEqual(["OPTIONAL_EFFECT", "OPTIONAL_EFFECT"]);
  expect(rig.state.eventLog.filter(e => e.type === "POWER_MODIFIED")).toHaveLength(2);
  expect(rig.state.eventLog.filter(e => e.type === "CARD_DRAWN")).toHaveLength(1);
});

it.skipIf(!process.env.OPT966_READER_ROOT)("replays a prompted Start of Turn watcher reached in the same End Phase resume", async () => {
  const rig = endPhaseRig();
  rig.putSyn("ENDING-WAVE", synSchema("ENDING-WAVE", "Character", [{
    id: "wave", category: "auto", trigger: { keyword: "END_OF_YOUR_TURN" }, flags: { optional: true },
    actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
  }]), 0, "CHARACTER");
  rig.putSyn("START-WATCHER", synSchema("START-WATCHER", "Character", [{
    id: "start", category: "auto", trigger: { keyword: "START_OF_TURN" }, flags: { optional: true },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]), 1, "CHARACTER");
  rig.act({ type: "ADVANCE_PHASE" });
  const pauses = await replayPauses(rig, () => ({ type: "PLAYER_CHOICE", choiceId: "accept" }), "opt966-handoff-writer-corpus");
  expect(pauses.map(s => s.pendingPrompt!.options.promptType)).toEqual(["OPTIONAL_EFFECT", "OPTIONAL_EFFECT"]);
  expect(pauses.map(s => s.pendingPrompt!.respondingPlayer)).toEqual([0, 1]);
  expect(pauses.every(s => s.effectStack.some(frame => frame.triggerExecution))).toBe(true);
  expect(rig.state.eventLog.filter(e => e.type === "CARD_DRAWN")).toHaveLength(1);
  expect(rig.state.eventLog.filter(e => e.type === "TURN_STARTED")).toHaveLength(1);
  expect(rig.state.players[1].hand).toHaveLength(3);
});

it.skipIf(!process.env.OPT966_READER_ROOT).each([false, true])("reparks legacy scheduled work below every new child, explicit stage=%s", async explicitStage => {
  const rig = endPhaseRig();
  rig.putSyn("LEGACY-WAVE", synSchema("LEGACY-WAVE", "Character", [{
    id: "wave", category: "auto", trigger: { keyword: "END_OF_YOUR_TURN" }, flags: { optional: true },
    actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 100 }, duration: { type: "THIS_TURN" } }],
  }]), 0, "CHARACTER");
  const child = rig.putSyn("LEGACY-CHILD", synSchema("LEGACY-CHILD", "Character", [{
    id: "child", category: "auto", trigger: { keyword: "ON_PLAY" }, flags: { optional: true },
    actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
  }]), 0, "HAND");
  rig.act({ type: "ADVANCE_PHASE" });
  // The bootstrap wave is already activated; omit its registration from this
  // historical fixture so the legacy handoff window has no second wave.
  rig.state.triggerRegistry = rig.state.triggerRegistry.filter(trigger => !trigger.sourceCardInstanceId.startsWith("LEGACY-WAVE"));
  // Supported mixed saved graph: loaded legacy phase continuation below a v5
  // owner. Subsequent scopes and re-parks are produced by the actual writer.
  const phase = rig.state.effectStack.find(frame => frame.phaseBoundaryContinuation)!.phaseBoundaryContinuation!;
  delete phase.activatedWaveEffects;
  if (explicitStage) phase.stage = "LEGACY_SCHEDULED_ACTIONS";
  else delete phase.stage;
  phase.remainingScheduledActions = [
    { sourceEffectId: "legacy-play", controller: 0,
      action: { type: "PLAY_CARD", target: { type: "CHARACTER_CARD", controller: "SELF", source_zone: "HAND", filter: { name: "LEGACY-CHILD" }, count: { up_to: 1 } }, params: { source_zone: "HAND", cost_override: "FREE" } } },
    { sourceEffectId: "later-marker", controller: 0, action: { type: "DRAW", params: { amount: 1 } } },
  ];
  const pauses = await replayPauses(rig, state => {
    expect(state.turn.activePlayerIndex).toBe(0);
    expect(state.effectStack.findIndex(frame => frame.phaseBoundaryContinuation)).toBeLessThan(state.effectStack.findIndex(frame => frame.triggerExecution));
    return state.pendingPrompt!.options.promptType === "SELECT_TARGET"
      ? { type: "SELECT_TARGET", selectedInstanceIds: [child.instanceId] }
      : { type: "PLAYER_CHOICE", choiceId: "accept" };
  }, `opt966-legacy-${explicitStage ? "explicit" : "absent"}-writer-corpus`);
  expect(pauses.map(state => state.pendingPrompt!.options.promptType)).toEqual(["OPTIONAL_EFFECT", "SELECT_TARGET", "OPTIONAL_EFFECT"]);
  expect(pauses.map(state => state.turn.activePlayerIndex)).toEqual([0, 0, 0]);
  const parked = pauses[1].effectStack;
  expect(parked.findIndex(frame => frame.phaseBoundaryContinuation)).toBeLessThan(parked.findIndex(frame => frame.triggerExecution));
  const types = rig.state.eventLog.map(event => event.type);
  const childPower = rig.state.eventLog.findIndex(event => event.type === "POWER_MODIFIED" && event.payload?.amount === 1000);
  expect(childPower).toBeGreaterThan(-1);
  expect(childPower).toBeLessThan(types.indexOf("CARD_DRAWN"));
  expect(childPower).toBeLessThan(types.indexOf("TURN_ENDED"));
});


it.skipIf(!process.env.OPT966_READER_ROOT)("replays a prompted battle substitute and its surviving KO watcher", async () => {
  const rig = endPhaseRig();
  rig.state.turn.activePlayerIndex = 1;
  rig.putSyn("BATTLE-REPLACER", synSchema("BATTLE-REPLACER", "Leader", [{
    id: "replace", category: "replacement", replaces: { event: "WOULD_BE_KO", target_filter: { controller: "SELF", base_cost_min: 4 } },
    flags: { optional: true, once_per_turn: true }, replacement_actions: [
      { type: "KO", target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 }, filter: { cost_max: 1 } } },
      { type: "TRASH_FROM_HAND", params: { amount: 1 } },
      { type: "TRASH_FROM_HAND", params: { amount: 1 } },
      { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } },
    ],
  }]), 0, "LEADER");
  rig.putSyn("VICTIM", null, 0, "CHARACTER", { cost: 1 });
  rig.putSyn("SURVIVING-WATCHER", synSchema("SURVIVING-WATCHER", "Character", [{
    id: "watch", category: "auto", trigger: { event: "ANY_CHARACTER_KO", filter: { controller: "SELF" } },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]), 0, "CHARACTER", { cost: 5 });
  rig.putSyn("EXTRA-HAND-A", null, 0, "HAND");
  rig.putSyn("EXTRA-HAND-B", null, 0, "HAND");
  const target = rig.put("OP09-083", 0, "CHARACTER", { cost: 5, power: 6000 });
  target.state = "RESTED";
  const attacker = rig.putSyn("ATTACKER", null, 1, "CHARACTER", { cost: 5, power: 7000 });
  rig.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, 1);
  for (let n = 0; !rig.state.pendingPrompt && rig.state.turn.battle; n++) {
    expect(n).toBeLessThan(6);
    rig.act({ type: "PASS" }, rig.state.turn.battleSubPhase === "ATTACK_STEP" ? 1 : 0);
  }
  const pauses = await replayPauses(rig, state => state.pendingPrompt!.options.promptType === "SELECT_TARGET"
    ? { type: "SELECT_TARGET", selectedInstanceIds: [state.players[0].hand[0].instanceId] }
    : { type: "PLAYER_CHOICE", choiceId: "accept" }, "opt966-battle-debt-writer-corpus");
  expect(pauses.map(state => state.pendingPrompt!.options.promptType)).toEqual(["OPTIONAL_EFFECT", "SELECT_TARGET", "SELECT_TARGET"]);
  expect(pauses.every(state => state.effectStack.some(frame => frame.triggerExecution))).toBe(true);
  const types = rig.state.eventLog.map(event => event.type);
  expect(types.filter(type => type === "CARD_DRAWN")).toHaveLength(1);
  expect(types.filter(type => type === "CARD_TRASHED")).toHaveLength(2);
  expect(types.filter(type => type === "POWER_MODIFIED")).toHaveLength(1);
  expect(types.indexOf("POWER_MODIFIED")).toBeLessThan(types.indexOf("END_OF_BATTLE"));
  expect(types.indexOf("COMBAT_VICTORY")).toBeLessThan(types.indexOf("CARD_TRASHED"));
  expect(types.indexOf("END_OF_BATTLE")).toBeLessThan(types.indexOf("CARD_DRAWN"));
  expect(rig.state.players[0].characters.some(card => card?.instanceId === target.instanceId)).toBe(true);
});
