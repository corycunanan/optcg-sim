import { describe, expect, it } from "vitest";
import type { GameState } from "../types.js";
import { endPhaseRig, synSchema, type EndPhaseRig } from "./opt-962-rig.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { convertPersistedGameState, SessionRepository } from "../session/persistence.js";
import { toPersistedGameState, GAME_STATE_SCHEMA_VERSION } from "../session/game-state-schema.js";
import { resumePhaseBoundary } from "../engine/phases.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { hasNativeCostSemantics, hasStructuralCostSemantics } from "../engine/native-cost-semantics.js";
import { fieldTrashSemanticsVersion } from "../engine/field-trash-semantics.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";

function pair(owner: 0 | 1 = 0, version?: 11) {
  const r = endPhaseRig();
  if (version) { r.state.schemaVersion = version; r.state.fieldTrashSemanticsVersion = 8; }
  r.state.turn.activePlayerIndex = owner;
  const maria = r.put("OP08-074", owner, "CHARACTER");
  const ray = r.put("OP13-066", owner, "CHARACTER");
  const dons = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ instanceId: `${tag}-${i}`, state: "ACTIVE" as const, attachedTo: null }));
  r.state.players[owner].donCostArea = dons(3, "own");
  r.state.players[owner].donDeck = dons(6, "deck");
  r.state.players[owner === 0 ? 1 : 0].donCostArea = dons(5, "other");
  const leader = r.state.players[owner].leader;
  leader.attachedDon = [{ instanceId: "given", state: "ACTIVE", attachedTo: leader.instanceId }];
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: maria.instanceId, effectId: "activate_add_don" });
  r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:4" });
  const block = getEffectSchema("OP13-066")!.effects.find(e => e.id === "OP13-066_on_play")!;
  const result = resolveEffect(r.state, block, ray.instanceId, owner, r.db);
  r.state = { ...result.state, pendingPrompt: result.pendingPrompt ?? result.state.pendingPrompt };
  r.act({ type: "SELECT_TARGET", selectedInstanceIds: [] });
  expect(r.state.scheduledActions).toHaveLength(2);
  expect(field(r.state, owner)).toBe(8);
  return r;
}
function field(state: GameState, owner: 0 | 1) {
  const p = state.players[owner];
  return p.donCostArea.length + p.leader.attachedDon.length + p.characters.reduce((n, c) => n + (c?.attachedDon.length ?? 0), 0);
}
const wire = (state: GameState) => JSON.parse(JSON.stringify(toPersistedGameState(state)));
function future(r: EndPhaseRig) {
  // Synthetic future-reader envelope around real authored resolved obligations.
  r.state = convertPersistedGameState({ ...wire(r.state), schemaVersion: 11, fieldTrashSemanticsVersion: r.state.fieldTrashSemanticsVersion ?? 8 }, "state");
}
function answerActionPrompt(r: EndPhaseRig) {
  const options = r.state.pendingPrompt!.options;
  if (options.promptType !== "PLAYER_CHOICE") throw Error("unexpected action prompt");
  const choice = options.choices.find(c => c.id === "choose-value:1") ?? options.choices.find(c => !c.disabled)!;
  r.act({ type: "PLAYER_CHOICE", choiceId: choice.id });
}
async function reload(r: EndPhaseRig, undo: GameState[] = []) {
  const storage = new MemorySessionStorage();
  const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
  await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: undo });
  const loaded = (await new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).load())!;
  r.state = loaded.state;
  return loaded.undoHistory;
}

describe("OPT-981 reader11 end-of-turn ordering", () => {
  it.each([false, true])("preserves authored order-dependent outcomes through the enabled writer, reverse=%s", reverse => {
    const r = pair();
    r.act({ type: "ADVANCE_PHASE" });
    r.act({ type: "PLAYER_CHOICE", choiceId: `end-of-turn-obligation:${reverse ? 1 : 0}` });
    for (let n = 0; r.state.pendingPrompt && n < 8; n++) answerActionPrompt(r);
    expect(field(r.state, 0)).toBe(reverse ? 5 : 6);
    expect(field(r.state, 1)).toBe(5);
    expect(r.state.turn.activePlayerIndex).toBe(1);
    expect(r.state.schemaVersion).toBe(11);
    expect(GAME_STATE_SCHEMA_VERSION).toBe(8);
  });

  it.each([0, 1] as const)("offers the step owner %i both orders, with reload and undo", async owner => {
    for (const first of [0, 1]) for (const reloaded of [false, true]) {
      const r = pair(owner);
      future(r);
      r.act({ type: "ADVANCE_PHASE" });
      expect(r.state.pendingPrompt?.respondingPlayer).toBe(owner);
      expect(r.state.pendingPrompt?.options).toMatchObject({ promptType: "PLAYER_CHOICE", choices: [{ id: "end-of-turn-obligation:0" }, { id: "end-of-turn-obligation:1" }] });
      const snapshot = structuredClone(r.state);
      if (reloaded) await reload(r, [snapshot]);
      r.act({ type: "PLAYER_CHOICE", choiceId: `end-of-turn-obligation:${first}` }, owner);
      for (let n = 0; r.state.pendingPrompt && n < 8; n++) {
        if (reloaded) await reload(r, [snapshot]);
        answerActionPrompt(r);
      }
      expect(field(r.state, owner)).toBe(first === 0 ? 6 : 5);
      expect(r.state.turn.activePlayerIndex).toBe(owner === 0 ? 1 : 0);
      expect(r.state.effectStack).toHaveLength(0);
      expect(r.state.schemaVersion).toBe(11);
      // Restore a real saved undo snapshot and choose the other order.
      const [undo] = await reload(r, [snapshot]);
      r.state = undo;
      r.act({ type: "PLAYER_CHOICE", choiceId: `end-of-turn-obligation:${1 - first}` }, owner);
      for (let n = 0; r.state.pendingPrompt && n < 8; n++) answerActionPrompt(r);
      expect(field(r.state, owner)).toBe(first === 0 ? 5 : 6);
    }
  });

  it("hands non-turn-player obligations to their owner before handing off", () => {
    const r = pair(1);
    future(r);
    r.state.turn.activePlayerIndex = 0;
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
    expect(r.state.effectStack.at(-1)?.phaseBoundaryContinuation?.stage).toBe("NON_TURN_PLAYER_END_OF_TURN");
    r.act({ type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:1" }, 1);
    for (let n = 0; r.state.pendingPrompt && n < 8; n++) answerActionPrompt(r);
    expect(field(r.state, 1)).toBe(5);
    expect(r.state.turn.activePlayerIndex).toBe(1);
  });

  it("restores an actual coordinator UNDO from persisted history before choosing an order", async () => {
    const r = pair(); future(r);
    const coordinator = new SessionCoordinator();
    const attached = coordinator.executeAction(r.state, [], 0, {
      type: "ATTACH_DON", targetInstanceId: r.state.players[0].leader.instanceId, count: 1,
    }, r.db);
    expect(attached.kind).toBe("applied");
    r.state = attached.state;
    const history = await reload(r, attached.undoHistory);
    const undone = coordinator.executeAction(r.state, history, 0, { type: "UNDO" }, r.db);
    expect(undone.kind).toBe("undo");
    r.state = undone.state;
    r.act({ type: "ADVANCE_PHASE" });
    r.act({ type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:1" });
    for (let n = 0; r.state.pendingPrompt && n < 8; n++) answerActionPrompt(r);
    expect(field(r.state, 0)).toBe(5);
  });

  it("asks again after one of three continuous synthetic obligations, without executing siblings", async () => {
    const r = endPhaseRig();
    r.state.schemaVersion = 11; r.state.fieldTrashSemanticsVersion = 8;
    r.state.scheduledActions = [1, 2, 3].map((amount, index) => ({
      id: `synthetic-${index}`, timing: "END_OF_THIS_TURN", controller: 0,
      sourceEffectId: r.state.players[0].leader.instanceId, boundToInstanceId: null,
      action: { type: "DRAW", params: { amount } },
    }));
    const before = r.state.players[0].hand.length;
    r.act({ type: "ADVANCE_PHASE" });
    r.act({ type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:2" });
    expect(r.state.players[0].hand).toHaveLength(before + 3);
    expect(r.state.pendingPrompt?.options).toMatchObject({ choices: [{ id: "end-of-turn-obligation:0" }, { id: "end-of-turn-obligation:1" }] });
    await reload(r);
    const original = structuredClone(r.state);
    const rejected = new SessionCoordinator().executeAction(r.state, [], 1, { type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:0" }, r.db);
    expect(rejected.kind).toBe("reject");
    expect(rejected.state).toEqual(original);
    r.act({ type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:1" });
    expect(r.state.players[0].hand).toHaveLength(before + 6);
    expect(r.state.pendingPrompt).toBeNull();
  });

  it("retains independent capabilities and mixed8/9/10/11 undo envelopes", async () => {
    for (const cost of [6, 7, 8] as const) for (const trash of [8, 9] as const) {
      const r = endPhaseRig();
      r.state.schemaVersion = 11; r.state.costSemanticsVersion = cost; r.state.fieldTrashSemanticsVersion = trash;
      const base = wire(r.state);
      const history = [8, 9, 10, 11].map(version => {
        const raw = { ...base, schemaVersion: version };
        if (version < 10) delete raw.fieldTrashSemanticsVersion;
        return convertPersistedGameState(raw, "undoHistory[0]");
      });
      for (const entry of history) {
        const retained = await reload(r, [entry]);
        expect(retained[0].schemaVersion).toBe(entry.schemaVersion);
      }
      expect(hasNativeCostSemantics(r.state)).toBe(cost >= 7);
      expect(hasStructuralCostSemantics(r.state)).toBe(cost === 8);
      expect(fieldTrashSemanticsVersion(r.state)).toBe(trash);
    }
  });

  it("does not rebuild a persisted ordering prompt during an idle drain", async () => {
    const r = pair(); future(r); r.act({ type: "ADVANCE_PHASE" }); await reload(r);
    const before = r.state;
    expect(before.pendingPrompt?.promptId).toBeDefined();
    const result = resumePhaseBoundary(before, r.db);
    expect(result.state).toBe(before);
    expect(result.state.pendingPrompt).toBe(before.pendingPrompt);
    expect(result.state.pendingPrompt?.options).toMatchObject({ choices: [
      { label: expect.stringContaining("Return DON!!") },
      { label: expect.stringContaining("Add DON!!") },
    ] });
  });

  it("does not use hidden hand cards to name a historical obligation", () => {
    const r = endPhaseRig();
    r.state.schemaVersion = 11; r.state.fieldTrashSemanticsVersion = 8;
    r.state.scheduledActions = [1, 2].map((amount, index) => ({
      id: `historical-hand-source-${index}`, timing: "END_OF_THIS_TURN", controller: 0,
      sourceEffectId: r.state.players[0].hand[0].instanceId, boundToInstanceId: null,
      action: { type: "DRAW", params: { amount } },
    }));
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.pendingPrompt?.options).toMatchObject({ choices: [
      { label: "Resolved effect: Draw cards (1)" },
      { label: "Resolved effect: Draw cards (2)" },
    ] });
  });

  it.each([10, 11] as const)("scans selected trash on the ending player's turn at schema%i, including prompted/terminal watchers", async version => {
    for (const prompted of [false, true]) for (const terminal of [false, true]) {
      const r = endPhaseRig({ deckSize: terminal ? 1 : 6 });
      r.state.schemaVersion = version; r.state.fieldTrashSemanticsVersion = 9;
      const victim = r.putSyn("SYN-trash-victim", null, 0, "CHARACTER");
      r.putSyn("SYN-your-turn-trash-watcher", synSchema("SYN-your-turn-trash-watcher", "Character", [{
        id: "your-turn-trash-watch", category: "auto",
        trigger: { event: "ANY_CHARACTER_TRASHED", turn_restriction: "YOUR_TURN" },
        ...(prompted ? { flags: { optional: true } } : {}),
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      }]), 0, "CHARACTER");
      r.state.scheduledActions = [{
        id: "trash-first", timing: "END_OF_THIS_TURN", controller: 0,
        sourceEffectId: victim.instanceId, boundToInstanceId: null,
        action: { type: "TRASH_CARD", target: { type: "SELF" } },
      }, {
        id: "don-second", timing: "END_OF_THIS_TURN", controller: 0,
        sourceEffectId: r.state.players[0].leader.instanceId, boundToInstanceId: null,
        action: { type: "ADD_DON_FROM_DECK", params: { amount: 1 } },
      }];
      const before = r.state.players[0].hand.length;
      const dons = field(r.state, 0);
      r.act({ type: "ADVANCE_PHASE" });
      if (r.state.schemaVersion === 11) {
        await reload(r);
        r.act({ type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:0" });
      }
      if (prompted) {
        expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
        expect(r.state.turn.activePlayerIndex).toBe(0);
        expect(field(r.state, 0)).toBe(dons);
        await reload(r);
        r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
      }
      expect(r.state.players[0].hand).toHaveLength(before + 1);
      const events = r.state.eventLog.map(event => event.type);
      expect(events.filter(type => type === "CARD_DRAWN")).toHaveLength(1);
      expect(events.indexOf("CARD_TRASHED")).toBeLessThan(events.indexOf("CARD_DRAWN"));
      if (terminal) {
        expect(r.state.status).toBe("FINISHED");
        expect(r.state.turn.activePlayerIndex).toBe(0);
        expect(field(r.state, 0)).toBe(dons);
        expect(events).not.toContain("TURN_ENDED");
        expect(events.at(-1)).toBe("GAME_OVER");
      } else {
        expect(events.indexOf("CARD_DRAWN")).toBeLessThan(events.indexOf("TURN_ENDED"));
        expect(r.state.turn.activePlayerIndex).toBe(1);
      }
    }
  });

  it.each([0, 1] as const)("offers newly created obligations alongside remaining work for step owner %i", async owner => {
    const r = endPhaseRig();
    r.state.schemaVersion = 11; r.state.fieldTrashSemanticsVersion = 8;
    const source = r.state.players[owner].leader.instanceId;
    r.state.scheduledActions = [{
      id: "synthetic-nested-scheduler", timing: "END_OF_THIS_TURN", controller: owner,
      sourceEffectId: source, boundToInstanceId: null,
      action: { type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN",
        action: { type: "DRAW", params: { amount: 2 } },
      } },
    }, {
      id: "synthetic-existing-draw", timing: "END_OF_THIS_TURN", controller: owner,
      sourceEffectId: source, boundToInstanceId: null,
      action: { type: "DRAW", params: { amount: 1 } },
    }];
    r.state.activeEffects.push({
      id: "synthetic-step-expiry", sourceCardInstanceId: source, sourceEffectBlockId: "",
      category: "auto", controller: owner, modifiers: [], appliesTo: [source], timestamp: 1,
      duration: { type: "UNTIL_END_OF_YOUR_NEXT_TURN" },
      expiresAt: { wave: "END_OF_TURN", turn: r.state.turn.number, player: 0 },
    });
    const before = r.state.players[owner].hand.length;
    r.act({ type: "ADVANCE_PHASE" });
    r.act({ type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:0" }, owner);
    expect(r.state.players[owner].hand).toHaveLength(before);
    expect(r.state.pendingPrompt?.respondingPlayer).toBe(owner);
    expect(r.state.pendingPrompt?.options).toMatchObject({ choices: [{ id: "end-of-turn-obligation:0" }, { id: "end-of-turn-obligation:1" }] });
    expect(r.state.scheduledActions).toHaveLength(0);
    expect(r.state.effectStack.at(-1)?.phaseBoundaryContinuation?.remainingScheduledActions.map(entry => entry.action.type === "DRAW" ? entry.action.params : null)).toEqual([{ amount: 1 }, { amount: 2 }]);
    expect(r.state.activeEffects.some(effect => effect.id === "synthetic-step-expiry")).toBe(true);
    await reload(r);
    r.act({ type: "PLAYER_CHOICE", choiceId: "end-of-turn-obligation:1" }, owner);
    expect(r.state.players[owner].hand).toHaveLength(before + 3);
    expect(r.state.activeEffects.some(effect => effect.id === "synthetic-step-expiry")).toBe(false);
    expect(r.state.turn.activePlayerIndex).toBe(1);
    expect(r.state.effectStack).toHaveLength(0);
  });

  it("retains11 while newly scheduling authored work and upgrading field-trash capability", () => {
    const r = pair(0, 11);
    expect(r.state.schemaVersion).toBe(11);
    const inherited = pair().state.scheduledActions.map(entry => ({
      sourceIdentity: entry.sourceIdentity, sourceCardSnapshot: entry.sourceCardSnapshot,
    }));
    expect(r.state.scheduledActions.map(entry => ({
      sourceIdentity: entry.sourceIdentity, sourceCardSnapshot: entry.sourceCardSnapshot,
    }))).toEqual(inherited);
    const source = r.putSyn("SYN-reader11-trash", null, 0, "CHARACTER");
    const resolved = resolveEffect(r.state, {
      id: "synthetic-reader11-trash", category: "auto",
      actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
    }, source.instanceId, 0, r.db);
    r.state = resolved.state;
    expect(r.state.schemaVersion).toBe(11);
    expect(r.state.fieldTrashSemanticsVersion).toBe(9);
    expect(r.state.players[0].characters.some(card => card?.instanceId === source.instanceId)).toBe(false);
    expect(convertPersistedGameState(wire(r.state), "state").schemaVersion).toBe(11);
  });

  it("strictly rejects malformed and mismatched ordering owners without mutating input", () => {
    const r = pair(); future(r); r.act({ type: "ADVANCE_PHASE" });
    const valid = wire(r.state);
    const mutations: ((raw: typeof valid) => void)[] = [
      raw => { raw.schemaVersion = 10; },
      raw => { raw.effectStack.at(-1).phaseBoundaryContinuation.awaitingOrder = false; },
      raw => { raw.effectStack.at(-1).phase = "INTERRUPTED_BY_TRIGGERS"; },
      raw => { raw.pendingPrompt.respondingPlayer = 1; },
      raw => { raw.effectStack.at(-1).controller = 1; },
      raw => { raw.pendingPrompt.resumeContext = "missing"; },
      raw => { raw.pendingPrompt.options.choices[0].id = "done"; },
      raw => { raw.effectStack.at(-1).phaseBoundaryContinuation.remainingScheduledActions.pop(); },
      raw => { raw.pendingPrompt = null; },
      raw => { raw.effectStack.at(-1).phaseBoundaryContinuation.extra = true; },
    ];
    for (const mutate of mutations) {
      const raw = structuredClone(valid); mutate(raw); const before = structuredClone(raw);
      expect(() => convertPersistedGameState(raw, "undoHistory[0]")).toThrow();
      expect(raw).toEqual(before);
    }
  });
});
