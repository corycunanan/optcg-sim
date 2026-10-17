/**
 * OPT-963 / OPT-926: effect damage on the EFFECT_DAMAGE frame.
 *
 * Oracle: rule 4-6-2 (per point), 8-6-2 (ordinary triggers after all damage
 * processing), 8-6-2-1 (the Life Trigger suspends it); FAQ qa_op03.md:283-285
 * (OP03-118: Trigger before the second damage, add to Life, then the second
 * damage); the OPT-926 scenario (OP03-118 above one ordinary Life card,
 * DEAL_DAMAGE 2, the Trigger's optional effect declined: the remaining damage
 * takes the ordinary card). Every scenario is SYNTHETIC / latent: the authored
 * damage effects in the corpus deal one damage (OPT-926 review).
 *
 * Boundary: SessionCoordinator.executeAction + resumePromptLifecycle (the
 * GameSession routing) and SessionRepository.save/.load for reloads.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameEvent, GameState, LifeCard, PlayerState } from "../types.js";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { effectDamageContinuation, effectTriggerWindow } from "./trigger-window-helpers.js";

const NO_KW = { ...CARDS.VANILLA.keywords };

function synCard(id: string, over: Partial<CardData>, effects: EffectBlock[]): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    effectText: "",
    triggerText: null,
    keywords: { ...NO_KW },
    effectSchema: { card_id: id, card_name: id, card_type: over.type ?? "Character", effects } as EffectSchema,
    ...over,
  };
}

/** [Trigger] with an optional effect (the OP03-118 stand-in): "you may draw 1". */
const TRIG_OPTIONAL = synCard("SYN-TRIG-OPTIONAL", { triggerText: "[Trigger] You may draw 1.", keywords: { ...NO_KW, trigger: true } }, [
  { id: "trig_opt", category: "auto", trigger: { keyword: "TRIGGER" }, flags: { optional: true }, actions: [{ type: "DRAW", params: { amount: 1 } }] },
]);
/** [Trigger] that adds a Life card from the deck (qa_op03.md:283-285). */
const TRIG_LIFE = synCard("SYN-TRIG-LIFE", { triggerText: "[Trigger] Add 1 from deck to Life.", keywords: { ...NO_KW, trigger: true } }, [
  { id: "trig_life", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "DOWN" } }] },
]);
/** [Trigger] whose effect opens its own prompt (K.O. up to 1 opposing Character). */
const TRIG_KO = synCard("SYN-TRIG-KO", { triggerText: "[Trigger] K.O. up to 1.", keywords: { ...NO_KW, trigger: true } }, [
  { id: "trig_ko", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }] },
]);
/** p0 Character: [Activate: Main] deal N damage, then draw 1 (the chain suffix). */
function dealer(
  id: string,
  amount: number,
  suffix: EffectBlock["actions"] = [{ type: "DRAW", params: { amount: 1 }, chain: "THEN" }],
  resultRef?: string,
): CardData {
  return synCard(id, {}, [
    {
      id: "deal",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [
        { type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount }, ...(resultRef ? { result_ref: resultRef } : {}) },
        ...suffix,
      ],
    },
  ]);
}
/** p1 Leader stand-in for OP05-098 Enel: when its Life becomes 0, draw 1 (ordinary trigger, rule 8-6-2). */
const ENEL = synCard("SYN-ENEL-DRAW", { type: "Leader", cost: null, power: 5000, life: 5 }, [
  { id: "enel", category: "auto", trigger: { event: "LIFE_COUNT_BECOMES_ZERO", filter: { controller: "SELF" } }, actions: [{ type: "DRAW", params: { amount: 1 } }] },
]);

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.data.get(key) as T | undefined; }
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [k, v] of Object.entries(entries)) this.data.set(k, structuredClone(v));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

const life = (id: string, cardId: string): LifeCard => ({ instanceId: id, cardId, face: "DOWN" });
const idx = (log: readonly GameEvent[], type: string, player?: number) =>
  log.findIndex((e) => e.type === type && (player === undefined || e.playerIndex === player));

interface Rig {
  state: GameState;
  db: Map<string, CardData>;
  coord: SessionCoordinator;
  start: number;
  /** Route as GameSession does; returns the coordinator's rejection reason when rejected. */
  act(player: 0 | 1, action: GameAction): string | null;
  reload(): Promise<void>;
  log(): GameEvent[];
}

function rig(opts: { p1Life: LifeCard[]; dealer: CardData; p1Leader?: CardData; p0Deck?: number; p1Deck?: number; p0Chars?: CardData[] }): Rig {
  const db = new Map(createTestCardDb());
  for (const card of [TRIG_OPTIONAL, TRIG_LIFE, TRIG_KO, opts.dealer, ...(opts.p1Leader ? [opts.p1Leader] : []), ...(opts.p0Chars ?? [])]) db.set(card.id, card);
  let state = createBattleReadyState(db);
  const dealerInstance: CardInstance = { instanceId: "dealer-0", cardId: opts.dealer.id, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 1, controller: 0, owner: 0 };
  const extra: CardInstance[] = (opts.p0Chars ?? []).map((card, i) => ({ instanceId: `p0-extra-${i}`, cardId: card.id, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 1, controller: 0, owner: 0 }));
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([dealerInstance, ...extra]), deck: players[0].deck.slice(0, opts.p0Deck ?? 10) };
  players[1] = { ...players[1], life: opts.p1Life, deck: players[1].deck.slice(0, opts.p1Deck ?? 10).map((c) => ({ ...c, cardId: CARDS.VANILLA.id })) };
  if (opts.p1Leader) players[1] = { ...players[1], leader: { ...players[1].leader, cardId: opts.p1Leader.id } };
  state = { ...state, players };
  state = registerTriggersForCard(state, dealerInstance, opts.dealer);
  if (opts.p1Leader) state = registerTriggersForCard(state, players[1].leader, opts.p1Leader);
  const coord = new SessionCoordinator();
  const self: Rig = {
    state,
    db,
    coord,
    start: state.eventLog.length,
    act(player, action) {
      const withId = "promptId" in action || !self.state.pendingPrompt ? action : ({ ...action, promptId: self.state.pendingPrompt.promptId } as GameAction);
      const r = coord.executeAction(self.state, [], player, withId, db);
      if (r.kind === "reject") return r.reason;
      if (r.kind === "resume") {
        const resumed = resumePromptLifecycle(r.state, withId, db, { drainPregame: (s) => s, advanceStartOfTurn: (s) => s });
        if (resumed.responseRejected) return "responseRejected";
        self.state = coord.surfaceRevealTrigger(resumed.state, db);
        return null;
      }
      self.state = r.state;
      return null;
    },
    async reload() {
      const storage = new MemoryStorage();
      const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
      await repo.save({ state: self.state, cardDb: self.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
      const loaded = await new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).load();
      expect(loaded).not.toBeNull();
      self.state = loaded!.state;
      self.db = loaded!.cardDb;
    },
    log: () => self.state.eventLog.slice(self.start),
  };
  return self;
}

function activate(r: Rig) {
  expect(r.act(0, { type: "ACTIVATE_EFFECT", cardInstanceId: "dealer-0", effectId: "deal" })).toBeNull();
}
function expectWindow(r: Rig, lifeInstanceId: string) {
  expect(r.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
  expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
  expect(effectTriggerWindow(r.state)?.lifeCard.instanceId).toBe(lifeInstanceId);
}
function reveal(r: Rig, reveal: boolean) {
  expect(r.act(1, { type: "REVEAL_TRIGGER", reveal })).toBeNull();
}

describe("OPT-926 (synthetic, latent): the remaining damage of a multi-damage effect survives the Life Trigger", () => {
  it("OP03-118 scenario: the first point reveals the Trigger, its optional effect is declined, the second point takes the ordinary card", () => {
    const r = rig({ p1Life: [life("l-trig", TRIG_OPTIONAL.id), life("l-vanilla", CARDS.VANILLA.id)], dealer: dealer("SYN-DEALER-2", 2) });
    const hand1 = r.state.players[1].hand.length;
    const hand0 = r.state.players[0].hand.length;
    activate(r);
    expectWindow(r, "l-trig");
    // The chain is parked below the window: the suffix draw has not happened.
    expect(r.state.players[0].hand).toHaveLength(hand0);
    expect(effectDamageContinuation(r.state)?.remainingDamages).toBe(1);
    reveal(r, true);
    // The Trigger's optional effect asks; decline it (OPT-926's scenario).
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(effectDamageContinuation(r.state)?.stage).toBe("TRIGGER_EFFECT");
    expect(r.act(1, { type: "PASS" })).toBeNull();
    // Expected (ticket): the remaining damage takes the ordinary Life card.
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[1].life).toEqual([]);
    expect(r.state.players[1].hand.map((c) => c.cardId)).toContain(CARDS.VANILLA.id);
    expect(r.state.players[1].hand.length).toBe(hand1 + 1);
    expect(r.state.players[1].trash.some((c) => c.cardId === TRIG_OPTIONAL.id)).toBe(true);
    // The suffix ran after the window, once.
    expect(r.state.players[0].hand).toHaveLength(hand0 + 1);
    expect(r.state.effectStack).toEqual([]);
  });

  it("the Trigger declined outright: the second point takes the ordinary card", () => {
    const r = rig({ p1Life: [life("l-trig", TRIG_OPTIONAL.id), life("l-vanilla", CARDS.VANILLA.id)], dealer: dealer("SYN-DEALER-2", 2) });
    const hand1 = r.state.players[1].hand.length;
    activate(r);
    expectWindow(r, "l-trig");
    reveal(r, false);
    expect(r.state.players[1].life).toEqual([]);
    expect(r.state.players[1].hand.length).toBe(hand1 + 2);
    const log = r.log();
    expect(log.filter((e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE" && e.playerIndex === 1)).toHaveLength(2);
  });

  it("qa_op03.md:283-285: the Trigger adds a Life card and the second point takes the added card", () => {
    const r = rig({ p1Life: [life("l-trig", TRIG_LIFE.id), life("l-vanilla", CARDS.VANILLA.id)], dealer: dealer("SYN-DEALER-2", 2) });
    const hand1 = r.state.players[1].hand.length;
    activate(r);
    expectWindow(r, "l-trig");
    reveal(r, true);
    expect(r.state.pendingPrompt).toBeNull();
    // The added card (from the deck) was the second point's Life check; the ordinary card remains.
    expect(r.state.players[1].life.map((c) => c.instanceId)).toEqual(["l-vanilla"]);
    expect(r.state.players[1].hand.length).toBe(hand1 + 1);
    expect(r.state.status).toBe("IN_PROGRESS");
  });

  it("the Trigger's own prompt: the second point and the suffix wait for it, across a reload", async () => {
    const r = rig({ p1Life: [life("l-trig", TRIG_KO.id), life("l-vanilla", CARDS.VANILLA.id)], dealer: dealer("SYN-DEALER-2", 2), p0Chars: [CARDS.VANILLA] });
    const hand0 = r.state.players[0].hand.length;
    activate(r);
    expectWindow(r, "l-trig");
    reveal(r, true);
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(r.state.players[1].life.map((c) => c.instanceId)).toEqual(["l-vanilla"]);
    await r.reload();
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(effectDamageContinuation(r.state)).toMatchObject({ stage: "TRIGGER_EFFECT", remainingDamages: 1, dealt: 1 });
    expect(r.state.players[0].hand).toHaveLength(hand0);
    const victim = (r.state.pendingPrompt!.options as { validTargets: string[] }).validTargets[0];
    expect(r.act(1, { type: "SELECT_TARGET", selectedInstanceIds: [victim] })).toBeNull();
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[1].life).toEqual([]);
    expect(r.state.players[0].hand).toHaveLength(hand0 + 1);
    expect(r.state.effectStack).toEqual([]);
  });

  it("reload across the stored REVEAL_TRIGGER prompt, then decline: the remaining point still resolves", async () => {
    const r = rig({ p1Life: [life("l-trig", TRIG_OPTIONAL.id), life("l-vanilla", CARDS.VANILLA.id)], dealer: dealer("SYN-DEALER-2", 2) });
    activate(r);
    expectWindow(r, "l-trig");
    await r.reload();
    expectWindow(r, "l-trig");
    expect(effectDamageContinuation(r.state)?.parentFrameId).toBe(r.state.effectStack[0].id);
    reveal(r, false);
    expect(r.state.players[1].life).toEqual([]);
    expect(r.state.effectStack).toEqual([]);
  });

  it("two DEAL_DAMAGE instructions in one chain each own their window; nothing is overwritten (A)", () => {
    const two = dealer("SYN-DEALER-1-1", 1, [{ type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 1 }, chain: "THEN" }, { type: "DRAW", params: { amount: 1 }, chain: "THEN" }]);
    const r = rig({ p1Life: [life("l-trig-a", TRIG_OPTIONAL.id), life("l-trig-b", TRIG_OPTIONAL.id)], dealer: two });
    const hand0 = r.state.players[0].hand.length;
    activate(r);
    expectWindow(r, "l-trig-a");
    const firstFrame = r.state.effectStack.at(-1)!.id;
    reveal(r, false);
    expectWindow(r, "l-trig-b");
    expect(r.state.effectStack.at(-1)!.id).not.toBe(firstFrame);
    expect(effectDamageContinuation(r.state)).toMatchObject({ remainingDamages: 0, dealt: 1 });
    reveal(r, false);
    expect(r.state.players[1].life).toEqual([]);
    expect(r.state.players[0].hand).toHaveLength(hand0 + 1);
    expect(r.state.effectStack).toEqual([]);
  });

  it("the DEAL_DAMAGE result_ref reports the points actually dealt after the window", () => {
    // Suffix: draw as many as the damage dealt (reads the result ref).
    const d = dealer("SYN-DEALER-REF", 2, [{ type: "DRAW", params: { amount: { type: "ACTION_RESULT", ref: "dmg" } }, chain: "THEN" }], "dmg");
    const r = rig({ p1Life: [life("l-trig", TRIG_OPTIONAL.id), life("l-vanilla", CARDS.VANILLA.id)], dealer: d });
    const hand0 = r.state.players[0].hand.length;
    activate(r);
    reveal(r, false);
    expect(r.state.players[0].hand.length - hand0).toBe(2);
  });
});

describe("OPT-963 (B): ordinary triggers raised by effect damage wait for the whole instruction (rule 8-6-2)", () => {
  it("a LIFE_COUNT_BECOMES_ZERO watcher fulfilled on the last point does not resolve while the Trigger window is open", () => {
    const r = rig({ p1Life: [life("l-vanilla", CARDS.VANILLA.id), life("l-trig", TRIG_OPTIONAL.id)], dealer: dealer("SYN-DEALER-2", 2), p1Leader: ENEL });
    const hand1 = r.state.players[1].hand.length;
    activate(r);
    expectWindow(r, "l-trig");
    // Point 1 took the ordinary card (hand +1); the Life count reached 0 on point 2's check,
    // but Enel's draw waits: no p1 CARD_DRAWN yet.
    expect(r.state.players[1].life).toEqual([]);
    expect(idx(r.log(), "CARD_DRAWN", 1)).toBe(-1);
    reveal(r, false);
    const log = r.log();
    expect(idx(log, "CARD_DRAWN", 1)).toBeGreaterThan(idx(log, "CARD_ADDED_TO_HAND_FROM_LIFE", 1));
    expect(r.state.players[1].hand.length).toBe(hand1 + 3);
  });
});

describe("OPT-963 undo and references", () => {
  it("undo is refused while the window is pending and the state is unchanged", () => {
    const r = rig({ p1Life: [life("l-trig", TRIG_OPTIONAL.id)], dealer: dealer("SYN-DEALER-1", 1) });
    activate(r);
    expectWindow(r, "l-trig");
    const before = structuredClone(r.state);
    const result = r.coord.executeAction(r.state, [before], 0, { type: "UNDO" }, r.db);
    expect(result.kind).toBe("reject");
    expect(r.state).toEqual(before);
  });

  it("a stored REVEAL_TRIGGER prompt whose frame is gone is rejected on load, naming the reference", async () => {
    const r = rig({ p1Life: [life("l-trig", TRIG_OPTIONAL.id)], dealer: dealer("SYN-DEALER-1", 1) });
    activate(r);
    expectWindow(r, "l-trig");
    const storage = new MemoryStorage();
    const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
    await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
    const stored = storage.data.get("session") as { state: Record<string, unknown> & { effectStack: Array<{ id: string }> } };
    const orphan = toPersistedGameState({ ...(stored.state as unknown as GameState), effectStack: [] }) as unknown as Record<string, unknown>;
    storage.data.set("session", { ...stored, state: orphan });
    await expect(repo.load()).rejects.toMatchObject({
      name: "SessionLoadError",
      message: expect.stringMatching(/pendingPrompt\.resumeContext names frame "[^"]+", which is not on the effect stack \(0 frames\)/),
    });
  });
});

describe("OPT-960 note: events retained on a suspended frame when a checkpoint ends the game inside a resumed frame", () => {
  it("the parent chain's retained point events reach the log before the one GAME_OVER", () => {
    // p0's chain: DEAL_DAMAGE 1 (p1's last Life card has a [Trigger] that K.O.s up to 1), then draw.
    // p1 accepts; the Trigger's SELECT_TARGET is answered; the K.O.'d p0 Character's
    // [On K.O.] draws 2 from a 1-card deck: p0 loses inside the resumed Trigger frame.
    const watcher = synCard("SYN-ONKO-DRAW2", {}, [
      { id: "onko", category: "auto", trigger: { keyword: "ON_KO" }, actions: [{ type: "DRAW", params: { amount: 2 } }] },
    ]);
    const r = rig({ p1Life: [life("l-trig", TRIG_KO.id)], dealer: dealer("SYN-DEALER-1", 1), p0Deck: 1, p0Chars: [watcher] });
    r.state = registerTriggersForCard(r.state, r.state.players[0].characters.find((c) => c?.cardId === watcher.id)!, watcher);
    activate(r);
    expectWindow(r, "l-trig");
    // The point's LIFE_COUNT_BECOMES_ZERO and TRIGGER_ACTIVATED offer are retained on the parent chain.
    const retained = r.state.effectStack[0].accumulatedEvents.map((e) => e.type);
    expect(retained).toContain("LIFE_COUNT_BECOMES_ZERO");
    expect(retained).toContain("TRIGGER_ACTIVATED");
    reveal(r, true);
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const victim = r.state.players[0].characters.find((c) => c?.cardId === watcher.id)!.instanceId;
    expect(r.act(1, { type: "SELECT_TARGET", selectedInstanceIds: [victim] })).toBeNull();
    expect(r.state.status).toBe("FINISHED");
    expect(r.state.winner).toBe(1);
    const log = r.log();
    const gameOver = log.map((e) => e.type).lastIndexOf("GAME_OVER");
    expect(log.filter((e) => e.type === "GAME_OVER")).toHaveLength(1);
    expect(idx(log, "LIFE_COUNT_BECOMES_ZERO", 1)).toBeGreaterThanOrEqual(0);
    expect(idx(log, "LIFE_COUNT_BECOMES_ZERO", 1)).toBeLessThan(gameOver);
    expect(idx(log, "CARD_KO")).toBeLessThan(gameOver);
  });
});
