/**
 * Timing baseline F12 (README §2). Oracle = README, never the engine.
 *
 * Rule 8-6-2-1 (line 864): the Trigger suspends damage processing; Decision 2 (rev4 §10):
 * the Trigger choice is inside the damage point, before the next instruction.
 * OP06-116 Reject, option 2: "If your opponent has 1 Life card, deal 1 damage to your
 * opponent. Then, add 1 card from the top of your Life cards to your hand."
 * FAQ qa_op06.md:367-371 (F12d: option 2 while the opponent did not have 1 Life: cannot add from Life).
 */
import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameEvent, GameState, LifeCard, PlayerState } from "../../types.js";
import { OP06_116_REJECT } from "../../engine/schemas/op06.js";
import { SessionCoordinator } from "../../session/coordinator.js";
import { resumePromptLifecycle } from "../../session/prompt-lifecycle.js";
import { SessionRepository, type SessionStorage } from "../../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "../helpers.js";

const NO_KW = { ...CARDS.VANILLA.keywords };
const REJECT: CardData = {
  id: "OP06-116",
  name: "Reject",
  type: "Event",
  color: ["Purple"],
  cost: 1,
  power: null,
  counter: null,
  life: null,
  attribute: [],
  types: [],
  effectText: "[Main] Choose one: K.O. up to 1 cost 5 or less, or if the opponent has 1 Life, deal 1 damage. Then add 1 Life to hand.",
  triggerText: null,
  keywords: NO_KW,
  effectSchema: OP06_116_REJECT,
  imageUrl: null,
};
/** Stands in for any [Trigger] Life card whose own effect is distinct (ADD_TO_LIFE_FROM_DECK). */
const SYN_TRIGGER_LIFE: CardData = {
  ...CARDS.TRIGGER,
  id: "SYN-TRIGGER-LIFE",
  name: "SYN-TRIGGER-LIFE",
  triggerText: "[Trigger] Add 1 from deck to Life.",
  effectSchema: {
    card_id: "SYN-TRIGGER-LIFE",
    card_name: "SYN-TRIGGER-LIFE",
    card_type: "Character",
    effects: [
      {
        id: "syn_trigger_life",
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        actions: [{ type: "ADD_TO_LIFE_FROM_DECK", params: { amount: 1, position: "TOP", face: "DOWN" } }],
      },
    ],
  },
};
const P0_LIFE_CARD = CARDS.BANISH.id; // unique cardId so p0's Life card is identifiable in any zone

class MemoryStorage implements SessionStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries;
    for (const [k, v] of Object.entries(entries)) this.data.set(k, structuredClone(v));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

const life = (id: string, cardId: string): LifeCard => ({ instanceId: id, cardId, face: "DOWN" });
const count = (cards: readonly { cardId: string }[], cardId: string) => cards.filter((c) => c.cardId === cardId).length;
const idx = (log: readonly GameEvent[], type: string, player?: number) =>
  log.findIndex((e) => e.type === type && (player === undefined || e.playerIndex === player));
const activatedIdx = (log: readonly GameEvent[]) =>
  log.findIndex((e) => e.type === "TRIGGER_ACTIVATED" && (e.payload as { activated?: boolean }).activated === true);

interface Rig {
  state: GameState;
  db: Map<string, CardData>;
  coord: SessionCoordinator;
  start: number;
}

function setup(p1Life: LifeCard[]): Rig {
  const db = new Map(createTestCardDb());
  db.set(SYN_TRIGGER_LIFE.id, SYN_TRIGGER_LIFE);
  db.set(REJECT.id, REJECT);
  let state = createBattleReadyState(db);
  const reject: CardInstance = {
    instanceId: "reject-1",
    cardId: REJECT.id,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    hand: [...players[0].hand, reject],
    life: [life("p0-life-a", P0_LIFE_CARD), life("p0-life-b", P0_LIFE_CARD)],
  };
  players[1] = {
    ...players[1],
    life: p1Life,
    deck: players[1].deck.map((c) => ({ ...c, cardId: CARDS.VANILLA.id })),
  };
  state = { ...state, players };
  return { state, db, coord: new SessionCoordinator(), start: state.eventLog.length };
}

/** Play OP06-116 and choose option 2 (the damage option), as GameSession does: execute, resume, then surface. */
function playOptionTwo(rig: Rig): void {
  const played = rig.coord.executeAction(rig.state, [], 0, { type: "PLAY_CARD", cardInstanceId: "reject-1" }, rig.db);
  expect(played.kind, "reason" in played ? played.reason : "").toBe("applied");
  rig.state = played.state;
  const prompt = rig.state.pendingPrompt;
  expect(prompt?.options.promptType).toBe("PLAYER_CHOICE");
  const choices = (prompt!.options as unknown as { choices: { id: string }[] }).choices;
  const resumed = resumePromptLifecycle(
    structuredClone(rig.state),
    { type: "PLAYER_CHOICE", choiceId: choices[1].id, promptId: prompt!.promptId } as never,
    rig.db,
    { drainPregame: (s) => s, advanceStartOfTurn: (s) => s },
  );
  expect(resumed.responseRejected).toBe(false);
  rig.state = rig.coord.surfaceRevealTrigger(resumed.state, rig.db);
}

function replyReveal(rig: Rig, reveal: boolean): void {
  const prompt = rig.state.pendingPrompt;
  expect(prompt?.options.promptType).toBe("REVEAL_TRIGGER");
  expect(prompt?.respondingPlayer).toBe(1);
  const r = rig.coord.executeAction(
    rig.state,
    [],
    1,
    { type: "REVEAL_TRIGGER", reveal, promptId: prompt?.promptId } as never,
    rig.db,
  );
  expect(r.kind, "reason" in r ? r.reason : "").toBe("applied");
  rig.state = r.state;
}

function expectWindowOpenBeforeLifeToHand(rig: Rig): void {
  // README: while the REVEAL_TRIGGER prompt is pending for p1, p0 Life is still 2 and p1 Life is 0.
  expect(rig.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
  expect(rig.state.pendingPrompt?.respondingPlayer).toBe(1);
  expect(rig.state.players[0].life.length).toBe(2);
  expect(rig.state.players[1].life.length).toBe(0);
}

describe("F12 [Rule 8-6-2-1 line 864; Decision 2; OP06-116 text; FAQ qa_op06.md:367-371] Reject: defender's Trigger window completes before the activator's Life-to-hand", () => {
  const oneTrigger = () => [life("p1-life-trig", SYN_TRIGGER_LIFE.id)];

  // Engine: executeDealDamage parks the Trigger and the resolver continues; p0's Life is already 1
  // when the prompt surfaces. Decision 2 / rule 8-6-2-1: Trigger window first, then LIFE_TO_HAND.
  it.fails("F12a accept: Trigger window, then p0 adds from p0's own Life (ratchet OPT-963)", () => {
    const rig = setup(oneTrigger());
    const hand0 = count(rig.state.players[0].hand, P0_LIFE_CARD);
    playOptionTwo(rig);
    expectWindowOpenBeforeLifeToHand(rig);
    replyReveal(rig, true);
    const log = rig.state.eventLog.slice(rig.start);
    expect(activatedIdx(log)).toBeGreaterThanOrEqual(0);
    expect(rig.state.players[0].life.length).toBe(1);
    expect(count(rig.state.players[0].hand, P0_LIFE_CARD)).toBe(hand0 + 1);
    expect(count(rig.state.players[1].trash, SYN_TRIGGER_LIFE.id)).toBe(1);
    expect(count(rig.state.players[1].hand, P0_LIFE_CARD)).toBe(0);
  });

  it.fails("F12b decline: Trigger declined, then p0 adds from p0's own Life (ratchet OPT-963)", () => {
    const rig = setup(oneTrigger());
    const hand0 = count(rig.state.players[0].hand, P0_LIFE_CARD);
    playOptionTwo(rig);
    expectWindowOpenBeforeLifeToHand(rig);
    replyReveal(rig, false);
    const log = rig.state.eventLog.slice(rig.start);
    expect(activatedIdx(log)).toBe(-1);
    expect(idx(log, "CARD_ADDED_TO_HAND_FROM_LIFE", 1)).toBeGreaterThanOrEqual(0);
    expect(rig.state.players[0].life.length).toBe(1);
    expect(count(rig.state.players[0].hand, P0_LIFE_CARD)).toBe(hand0 + 1);
    expect(count(rig.state.players[1].hand, SYN_TRIGGER_LIFE.id)).toBe(1);
    expect(count(rig.state.players[1].hand, P0_LIFE_CARD)).toBe(0);
  });

  it.fails("F12c accept after a reload between the choice and the Trigger reply (ratchet OPT-963)", async () => {
    const rig = setup(oneTrigger());
    const hand0 = count(rig.state.players[0].hand, P0_LIFE_CARD);
    playOptionTwo(rig);
    expectWindowOpenBeforeLifeToHand(rig);
    const storage = new MemoryStorage();
    const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
    await repo.save({
      state: rig.state,
      cardDb: rig.db,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory: [],
    });
    const loaded = await repo.load();
    expect(loaded).not.toBeNull();
    rig.state = loaded!.state;
    rig.db = loaded!.cardDb;
    expect(rig.state.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    replyReveal(rig, true);
    const log = rig.state.eventLog.slice(rig.start);
    expect(activatedIdx(log)).toBeGreaterThanOrEqual(0);
    expect(rig.state.players[0].life.length).toBe(1);
    expect(count(rig.state.players[0].hand, P0_LIFE_CARD)).toBe(hand0 + 1);
    expect(count(rig.state.players[1].trash, SYN_TRIGGER_LIFE.id)).toBe(1);
  });

  // Engine: the DEAL_DAMAGE condition is false, yet the chained LIFE_TO_HAND still moves p0's top Life
  // to hand (p0 Life 2 -> 1). FAQ qa_op06.md:367-371: "No, you cannot" add from your Life.
  it.fails("F12d option 2 while the opponent has 2 Life: no damage, no add from Life (confirmed FAQ failure, no ticket yet)", () => {
    const rig = setup([life("p1-a", CARDS.VANILLA.id), life("p1-b", CARDS.VANILLA.id)]);
    const hand0 = count(rig.state.players[0].hand, P0_LIFE_CARD);
    playOptionTwo(rig);
    const log = rig.state.eventLog.slice(rig.start);
    expect(rig.state.players[1].life.length).toBe(2);
    expect(rig.state.players[0].life.length).toBe(2);
    expect(idx(log, "CARD_ADDED_TO_HAND_FROM_LIFE")).toBe(-1);
    expect(count(rig.state.players[0].hand, P0_LIFE_CARD)).toBe(hand0);
  });
});
