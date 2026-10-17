/**
 * OPT-963 / OPT-941: replacement continuations on REPLACEMENT and
 * REPLACEMENT_BATCH frames.
 *
 * Rules: §7-1-4-1-2 (the losing Character is K.O.'d), §8-1-3-4-1 (a declined
 * replacement is not resolved), §8-1-3-4-5 (OPT-922: a substitute that cannot
 * be carried out is not applied). Cards: OP10-034 Franky ("if this Character
 * would be K.O.'d in battle, you may add 1 card from the top of your Life
 * cards to your hand instead"), EB03-001 Vivi (Leader; "trash 1 card from
 * your hand instead", a substitute that prompts). Every effect comes from the
 * production schema registry.
 *
 * Boundary: SessionCoordinator + resumePromptLifecycle (GameSession routing),
 * SessionRepository.save/.load for reloads. OPT-872 and OPT-922 keep the
 * detailed battle and batch suites; this file pins the frame shape and the
 * exactly-once hand-off (A) for each path.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import type { EffectBlock, RuntimeActiveEffect } from "../engine/effect-types.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { frameKindOf, toPersistedGameState } from "../session/game-state-schema.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { battleContinuation } from "./trigger-window-helpers.js";

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.data.get(key)) as T | undefined; }
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [k, v] of Object.entries(entries)) this.data.set(k, structuredClone(v));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

const kinds = (state: GameState) => state.effectStack.map(frameKindOf);

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => { p.characters = padChars([]); p.hand = []; });
  const coordinator = new SessionCoordinator();
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, { ...CARDS.VANILLA, id, name: schema?.card_name ?? id, effectText: "", effectSchema: schema ?? null, ...overrides });
  }
  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    if (!db.has(id)) data(id);
    const card: CardInstance = { cardId: id, instanceId: `${id}-${controller}-${serial++}`, owner: controller, controller, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 1 };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "LEADER" || zone === "CHARACTER") state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function send(player: 0 | 1, action: GameAction): { kind: string; reason?: string } {
    const promptId = state.pendingPrompt?.promptId;
    const withId = promptId && action.type !== "UNDO" ? ({ ...action, promptId } as GameAction) : action;
    const result = coordinator.executeAction(state, [], player, withId, db);
    if (result.kind === "resume") {
      const resumed = resumePromptLifecycle(result.state, withId, db, { drainPregame: (s) => s, advanceStartOfTurn: (s) => coordinator.advanceStartOfTurn(s, db) });
      if (resumed.responseRejected) return { kind: "reject", reason: "responseRejected" };
      state = resumed.state;
      return { kind: "resume" };
    }
    if (result.kind === "applied") state = result.state;
    return { kind: result.kind, reason: "reason" in result ? result.reason : undefined };
  }
  function ok(player: 0 | 1, action: GameAction) {
    const r = send(player, action);
    expect(r.kind, `${action.type}: ${r.reason}`).not.toBe("reject");
  }
  const responder = () => state.pendingPrompt!.respondingPlayer;
  function battle(target: CardInstance, attacker: CardInstance) {
    state.turn.activePlayerIndex = attacker.controller;
    state.players[target.controller].characters.find((c) => c?.instanceId === target.instanceId)!.state = "RESTED";
    ok(attacker.controller, { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId });
    while (!state.pendingPrompt && state.turn.battle) {
      ok(state.turn.battleSubPhase === "ATTACK_STEP" ? attacker.controller : target.controller, { type: "PASS" });
    }
  }
  function attacker(power = 7000) {
    const id = `P1-ATTACKER-${power}-${serial}`;
    data(id, { power });
    return put(id, 1);
  }
  async function reload() {
    const storage = new MemoryStorage();
    const repo = new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" });
    await repo.save({ state, cardDb: db, undoHistory: [], mode: "PVP" } as never);
    const loaded = await new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" }).load();
    state = loaded!.state;
    return storage;
  }
  return {
    db, data, put, send, ok, battle, attacker, reload, responder,
    onField: (card: CardInstance) => state.players[card.controller].characters.some((c) => c?.instanceId === card.instanceId),
    events: (type: string) => state.eventLog.filter((e) => e.type === type),
    get state() { return state; },
    set state(next: GameState) { state = next; },
  };
}
type Fixture = ReturnType<typeof fixture>;

function franky(f: Fixture) {
  f.data("OP10-034", { cost: 4, power: 5000, counter: 1000 });
  return f.put("OP10-034", 0);
}
function vivi(f: Fixture) {
  f.data("EB03-001", { type: "Leader", cost: null, power: 5000, counter: null, life: 4 });
  return f.put("EB03-001", 0, "LEADER");
}

function expectBattleClosedOnce(f: Fixture) {
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.turn.battle).toBeNull();
  expect(f.state.effectStack).toEqual([]);
  expect(f.events("END_OF_BATTLE")).toHaveLength(1);
}

describe("OPT-941 battle K.O. replacement: a REPLACEMENT frame above the BATTLE_DAMAGE frame", () => {
  it("the offer is a REPLACEMENT frame on top of the paused Damage Step frame and the prompt names it", () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(kinds(f.state)).toEqual(["BATTLE_DAMAGE", "REPLACEMENT"]);
    const offer = f.state.effectStack[1];
    expect(f.state.pendingPrompt?.resumeContext).toBe(offer.id);
    expect(offer.replacement).toMatchObject({ targetInstanceId: target.instanceId, event: "WOULD_BE_KO" });
    expect(battleContinuation(f.state)).toMatchObject({ stage: "CHARACTER_KO_REPLACEMENT", targetInstanceId: target.instanceId, replacementEffectId: offer.replacement!.effectId });
    expect(battleContinuation(f.state)).not.toHaveProperty("resolution");
  });

  it.each(["accept", "skip"] as const)("%s resolves the offer exactly once: the frame pops, the battle frame records the resolution and ends the battle", (choice) => {
    const f = fixture();
    const target = franky(f);
    const life = f.state.players[0].life.length;
    f.battle(target, f.attacker());
    f.ok(f.responder(), { type: "PLAYER_CHOICE", choiceId: choice });
    expect(f.onField(target)).toBe(choice === "accept");
    expect(f.state.players[0].life).toHaveLength(choice === "accept" ? life - 1 : life);
    expect(f.events("CARD_KO")).toHaveLength(choice === "accept" ? 0 : 1);
    expectBattleClosedOnce(f);
  });

  it("the offer survives a reload and is then answered once; a replayed answer is rejected without change", async () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    await f.reload();
    expect(kinds(f.state)).toEqual(["BATTLE_DAMAGE", "REPLACEMENT"]);
    expect(f.state.pendingPrompt?.resumeContext).toBe(f.state.effectStack[1].id);
    const reply = { type: "PLAYER_CHOICE", choiceId: "accept", promptId: f.state.pendingPrompt!.promptId } as GameAction;
    expect(f.send(0, reply).kind).toBe("resume");
    expectBattleClosedOnce(f);
    const after = structuredClone(f.state);
    expect(f.send(0, reply).kind).toBe("reject");
    expect(f.state).toEqual(after);
  });

  it("a substitute that prompts (EB03-001) resolves above the battle frame; the battle ends once after it", async () => {
    const f = fixture();
    vivi(f);
    f.data("TARGET", { cost: 4, power: 5000 });
    const target = f.put("TARGET", 0);
    f.put(CARDS.VANILLA.id, 0, "HAND");
    f.put(CARDS.VANILLA.id, 0, "HAND");
    f.battle(target, f.attacker());
    expect(kinds(f.state)).toEqual(["BATTLE_DAMAGE", "REPLACEMENT"]);
    f.ok(f.responder(), { type: "PLAYER_CHOICE", choiceId: "accept" });
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(kinds(f.state)[0]).toBe("BATTLE_DAMAGE");
    expect(battleContinuation(f.state)).toMatchObject({ resolution: "REPLACED" });
    await f.reload();
    const choice = (f.state.pendingPrompt!.options as { validTargets: string[] }).validTargets[0];
    f.ok(f.responder(), { type: "SELECT_TARGET", selectedInstanceIds: [choice] });
    expect(f.onField(target)).toBe(true);
    expect(f.state.players[0].hand).toHaveLength(1);
    expectBattleClosedOnce(f);
  });

  it("undo is refused while the offer is pending", () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    const before = structuredClone(f.state);
    expect(f.send(1, { type: "UNDO" }).kind).toBe("reject");
    expect(f.state).toEqual(before);
  });

  it("a stored offer whose REPLACEMENT frame is missing is rejected on load, naming the reference", async () => {
    const f = fixture();
    const target = franky(f);
    f.battle(target, f.attacker());
    const storage = await f.reload();
    const stored = storage.data.get("session") as { state: Record<string, unknown> };
    const broken = toPersistedGameState({ ...(stored.state as unknown as GameState), effectStack: [f.state.effectStack[0]] }) as unknown as Record<string, unknown>;
    storage.data.set("session", { ...stored, state: broken });
    await expect(new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" }).load()).rejects.toMatchObject({
      name: "SessionLoadError",
      message: expect.stringMatching(/names BATTLE_DAMAGE frame "[^"]+" for a OPTIONAL_EFFECT prompt|which is not on the effect stack/),
    });
  });
});

describe("OPT-941 batch replacement: a REPLACEMENT_BATCH frame below the chain's continuation", () => {
  /** Two of p1's Characters are K.O.'d by p0's [On Play]; an optional "add 1 Life to hand instead" protects one. */
  function batchState(): { f: Fixture; block: EffectBlock; source: CardInstance; protectedTarget: CardInstance; other: CardInstance } {
    const f = fixture();
    const source = f.put(CARDS.VANILLA.id, 0);
    const protectedTarget = f.put(CARDS.VANILLA.id, 1);
    const other = f.put(CARDS.VANILLA.id, 1);
    const replacement: RuntimeActiveEffect = {
      id: "life-instead-of-ko",
      sourceCardInstanceId: protectedTarget.instanceId,
      sourceEffectBlockId: "life-instead-of-ko-block",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_BE_KO",
          cause_filter: { by: "ANY" },
          target_filter: null,
          replacement_actions: [{ type: "LIFE_TO_HAND", params: { amount: 1 } }],
          optional: true,
          once_per_turn: false,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [protectedTarget.instanceId],
      timestamp: 1,
    };
    f.state = { ...f.state, activeEffects: [replacement] };
    const block: EffectBlock = {
      id: "ko-two-then-draw",
      category: "auto",
      actions: [
        { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } } },
        { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
      ],
    };
    return { f, block, source, protectedTarget, other };
  }

  function raiseOffer(f: Fixture, block: EffectBlock, source: CardInstance) {
    const result = resolveEffect(f.state, block, source.instanceId, 0, f.db);
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    f.state = { ...result.state, pendingPrompt: result.pendingPrompt! };
  }

  it("the offer is a REPLACEMENT_BATCH frame on top of the chain's continuation and the prompt names it", () => {
    const { f, block, source, protectedTarget } = batchState();
    raiseOffer(f, block, source);
    expect(kinds(f.state)).toEqual(["TRIGGER_DRAIN", "REPLACEMENT_BATCH"]);
    const [chain, offer] = f.state.effectStack;
    expect(chain.pausedAction?.type).toBe("KO");
    expect(chain.remainingActions.map((a) => a.type)).toEqual(["DRAW"]);
    expect(f.state.pendingPrompt?.resumeContext).toBe(offer.id);
    expect(offer.replacementBatch).toMatchObject({ actionKind: "KO", currentMatchIndex: 0, pendingMatches: [{ matchedTargetIds: [protectedTarget.instanceId], optional: true }] });
  });

  it.each(["accept", "skip"] as const)("%s finalizes the unprotected targets once and the chain's suffix runs after", async (choice) => {
    const { f, block, source, protectedTarget, other } = batchState();
    raiseOffer(f, block, source);
    await f.reload();
    expect(kinds(f.state)).toEqual(["TRIGGER_DRAIN", "REPLACEMENT_BATCH"]);
    const hand0 = f.state.players[0].hand.length;
    const life1 = f.state.players[1].life.length;
    f.ok(f.responder(), { type: "PLAYER_CHOICE", choiceId: choice });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toEqual([]);
    expect(f.onField(other)).toBe(false);
    expect(f.onField(protectedTarget)).toBe(choice === "accept");
    expect(f.state.players[1].life).toHaveLength(choice === "accept" ? life1 - 1 : life1);
    expect(f.events("CARD_KO")).toHaveLength(choice === "accept" ? 1 : 2);
    expect(f.state.players[0].hand).toHaveLength(hand0 + 1);
  });

  it("a stored batch offer whose frame is missing is rejected on load, naming the reference", async () => {
    const { f, block, source } = batchState();
    raiseOffer(f, block, source);
    const storage = await f.reload();
    const stored = storage.data.get("session") as { state: Record<string, unknown> };
    const broken = toPersistedGameState({ ...(stored.state as unknown as GameState), effectStack: [f.state.effectStack[0]] }) as unknown as Record<string, unknown>;
    storage.data.set("session", { ...stored, state: broken });
    await expect(new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" }).load()).rejects.toMatchObject({
      name: "SessionLoadError",
      message: expect.stringMatching(/which is not on the effect stack/),
    });
  });
});
