/**
 * OPT-862 (OPT-960) — deck-out is checked mid-resolution (rule 9-1-2).
 *
 * Rules v1.2.0, `docs/rules/rule_comprehensive.md`:
 * - 9-1-2 (line 876): rule processing is resolved immediately when the event
 *   occurs, even while other actions are being carried out.
 * - 9-2-1-2 (line 884): a player with 0 cards in deck has fulfilled the defeat
 *   conditions.
 * - 3-2-3 (line 301): multiple cards moved from a deck move one by one.
 * - 8-3-1 / 8-3-1-1: costs are paid in printed order before the effect resolves.
 * - 1-3-1 (line 57): card text over rules. OP15-022 Brook (`docs/cards/OP-15.md:158`):
 *   "You lose at the end of the turn in which your deck becomes 0 cards."
 * FAQ: faq_op15-eb04.md:146-148 (Brook: the deck-emptying effect still finishes).
 *
 * | Clause | Condition / evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | EB01-051 "[Main] You may trash 2 cards from the top of your deck: K.O. …" + 9-1-2, 9-2-1-2 | deck 2, cost paid | p0 pays MILL 2 | none | ends after the payment, before the K.O. prompt | FINISHED winner 1; paid cards stay in trash (no rollback); no stack; reload has no continuation; stale reply and UNDO rejected | "EB01-051 …" |
 * | synthetic costs [MILL 2, DON!! rest 1] | deck 2 | MILL first | none | the second cost is never paid | DON!! untouched, FINISHED winner 1 | "later cost …" |
 * | MILL 2 THEN K.O. up to 1 | deck 2 | none | none | ends after MILL, no prompt | FINISHED winner 1 | "mid-action MILL …" |
 * | DRAW 3 from a 2-card deck (3-2-3) | deck 2 | none | none | 2 cards drawn, then defeat | hand +2, FINISHED winner 1 | "mid-action DRAW …" |
 * | two watchers on one event: p0's mills the last cards, p1's would draw | p0's deck 2 | none | none | trigger draining stops | p1 never draws, FINISHED winner 1 | "trigger draining …" |
 * | K.O. up to 1 (prompt) THEN MILL 2 THEN DRAW 1, reload before the reply | deck 2 | none | p0 | suspended prompt → reply → MILL empties deck | DRAW never runs, FINISHED winner 1 | "suspended prompt …" |
 * | Brook OP15-022 Leader + EB01-051 cost empties the deck | deck 2 | p0 pays MILL 2 | p0 | delayed loss: K.O. prompt still opens, IN_PROGRESS, sticky flag set; loss at the end-of-turn window | IN_PROGRESS then FINISHED winner 1 | "Brook …" |
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../engine/effect-types.js";
import type { CardData, Env, GameAction, GameState } from "../types.js";
import { GameSession } from "../GameSession.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { expectTerminal, rig, synSchema, type Rig } from "./opt-960-rig.js";
import { CARDS } from "./helpers.js";

const FINGER_PISTOL_TEXT =
  "[Main] You may trash 2 cards from the top of your deck: K.O. up to 1 of your opponent's Characters with a cost of 5 or less.";

function playFingerPistol(r: Rig) {
  const card = r.put("EB01-051", 0, "HAND", { data: { type: "Event", cost: 1, power: null, effectText: FINGER_PISTOL_TEXT } });
  r.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
}

function activate(r: Rig, id: string, actions: Action[], costs?: unknown[]) {
  const card = r.put(id, 0, "CHARACTER", {
    schema: synSchema(id, [
      {
        id: `${id}-main`,
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        ...(costs ? { costs } : {}),
        actions,
      } as never,
    ]),
  });
  return () => r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: `${id}-main` });
}

afterEach(() => vi.unstubAllGlobals());

class MockWebSocket {
  sent: string[] = [];
  send(payload: string): void { this.sent.push(payload); }
}

class MockDurableObjectState {
  storage = {
    put: async () => undefined,
    get: async () => undefined,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };
  getWebSockets(): WebSocket[] { return []; }
  getTags(): string[] { return []; }
}

type SessionInternals = {
  gameState: GameState;
  cardDb: Map<string, CardData>;
  undoHistory: GameState[];
  handleAction(ws: WebSocket, playerIndex: 0 | 1, action: GameAction): Promise<void>;
};

/** "Your opponent draws 1 card" (OPT-859: DRAW honors target.controller). */
const OPPONENT_DRAW_1: Action = {
  type: "DRAW",
  target: { type: "PLAYER", controller: "OPPONENT" },
  params: { amount: 1 },
  chain: "THEN",
} as Action;

const KO_UP_TO_1: Action = {
  type: "KO",
  target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
};

describe("OPT-862 mid-cost deck-out (rules 9-1-2 line 876, 9-2-1-2 line 884)", () => {
  it("EB01-051: paying MILL 2 from a 2-card deck ends the game before the K.O. prompt; the paid cost stands; nothing survives reload or a stale reply", async () => {
    const r = rig();
    r.deck(0, 2);
    const milled = r.state.players[0].deck.map((c) => c.cardId);
    r.put(CARDS.VANILLA.id, 1, "CHARACTER", { data: { cost: 2 } });
    playFingerPistol(r);
    r.accept();
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.players[0].deck).toHaveLength(0);
    // Payment rollback did not restore the IN_PROGRESS baseline: the two
    // milled cards and the Event are in the trash.
    expect(r.state.players[0].trash.map((c) => c.cardId).sort()).toEqual([...milled, "EB01-051"].sort());
    expect(r.state.players[1].characters.filter(Boolean)).toHaveLength(1);

    const { rejected, before } = r.respond({ type: "SELECT_TARGET", selectedInstanceIds: [] });
    expect(rejected).toBe(true);
    expect(r.state).toBe(before);
    const undo = new SessionCoordinator().executeAction(r.state, [], 0, { type: "UNDO" }, r.db);
    expect(undo).toMatchObject({ kind: "reject", reason: "Game is already over" });

    await r.reload();
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
  });

  it("EB01-051 through the GameSession action path: the terminal state persists with no undo snapshot and later actions are rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const r = rig();
    r.deck(0, 2);
    r.put(CARDS.VANILLA.id, 1, "CHARACTER", { data: { cost: 2 } });
    const card = r.put("EB01-051", 0, "HAND", { data: { type: "Event", cost: 1, power: null, effectText: FINGER_PISTOL_TEXT } });
    const session = new GameSession(
      new MockDurableObjectState() as unknown as DurableObjectState,
      { GAME_WORKER_SECRET: "test", NEXTJS_URL: "https://app.example.test" } as Env,
    ) as unknown as SessionInternals;
    session.cardDb = r.db;
    session.gameState = {
      ...r.state,
      players: [
        { ...r.state.players[0], connected: true },
        { ...r.state.players[1], connected: true },
      ],
    };
    const ws = new MockWebSocket() as unknown as WebSocket;
    await session.handleAction(ws, 0, { type: "PLAY_CARD", cardInstanceId: card.instanceId });
    expect(session.gameState.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    await session.handleAction(ws, 0, {
      type: "PLAYER_CHOICE",
      choiceId: "accept",
      promptId: session.gameState.pendingPrompt!.promptId,
    } as never);
    expectTerminal(session.gameState, { winner: 1, reason: "Player 1 decked out" });
    expect(session.undoHistory).toEqual([]);
    const finished = session.gameState;
    await session.handleAction(ws, 0, { type: "UNDO" });
    expect(session.gameState).toBe(finished);
  });

  it("later cost: a MILL cost that empties the deck stops the next cost from being paid", () => {
    const r = rig();
    r.deck(0, 2);
    const activeDon = r.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE").length;
    activate(
      r,
      "SYN-MILL-THEN-REST",
      [{ type: "DRAW", params: { amount: 1 } } as Action],
      [{ type: "MILL", amount: 2 }, { type: "DON_REST", amount: 1 }],
    )();
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")).toHaveLength(activeDon);
    expect(r.state.eventLog.some((e) => e.type === "CARD_DRAWN")).toBe(false);
  });
});

describe("OPT-862 mid-action deck-out (rules 9-1-2 line 876, 9-2-1-2 line 884, 3-2-3 line 301)", () => {
  it("mid-action MILL: MILL 2 empties the deck, so the THEN K.O. prompt never opens", () => {
    const r = rig();
    r.deck(0, 2);
    r.put(CARDS.VANILLA.id, 1, "CHARACTER");
    activate(r, "SYN-MILL2-KO", [{ type: "MILL", params: { amount: 2 } } as Action, { ...KO_UP_TO_1, chain: "THEN" } as Action])();
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.eventLog.filter((e) => e.type === "CARD_TRASHED" && e.playerIndex === 0)).toHaveLength(1);
  });

  it("mid-action DRAW: drawing 3 from a 2-card deck draws both cards one by one, then the player loses", () => {
    const r = rig();
    r.deck(0, 2);
    const hand = r.state.players[0].hand.length;
    const hand1 = r.state.players[1].hand.length;
    activate(r, "SYN-DRAW3", [{ type: "DRAW", params: { amount: 3 } } as Action, OPPONENT_DRAW_1])();
    expect(r.state.players[0].hand).toHaveLength(hand + 2);
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(2);
    // The THEN instruction (the opponent draws 1) never ran.
    expect(r.state.players[1].hand).toHaveLength(hand1);
  });

  it("trigger draining: p0's watcher empties p0's deck, so p1's queued watcher never resolves", () => {
    const r = rig();
    r.deck(0, 2);
    r.deck(1, 5);
    r.put("SYN-WATCH-MILL", 0, "CHARACTER", {
      schema: synSchema("SYN-WATCH-MILL", [
        {
          id: "watch-mill",
          category: "auto",
          trigger: { event: "CHARACTER_PLAYED", filter: { controller: "SELF" } },
          actions: [{ type: "MILL", params: { amount: 2 } }],
        } as never,
      ]),
    });
    r.put("SYN-WATCH-DRAW", 1, "CHARACTER", {
      schema: synSchema("SYN-WATCH-DRAW", [
        {
          id: "watch-draw",
          category: "auto",
          trigger: { event: "CHARACTER_PLAYED", filter: { controller: "OPPONENT" } },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        } as never,
      ]),
    });
    const hand1 = r.state.players[1].hand.length;
    const played = r.put(CARDS.VANILLA.id, 0, "HAND");
    r.act({ type: "PLAY_CARD", cardInstanceId: played.instanceId });
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.players[1].hand).toHaveLength(hand1);
    expect(r.state.players[1].deck).toHaveLength(5);
  });

  it("suspended prompt: after a reload and the reply, MILL empties the deck and the THEN opponent DRAW never runs", async () => {
    const r = rig();
    r.deck(0, 2);
    const hand1 = r.state.players[1].hand.length;
    const victim = r.put(CARDS.VANILLA.id, 1, "CHARACTER");
    activate(r, "SYN-KO-MILL-DRAW", [
      KO_UP_TO_1,
      { type: "MILL", params: { amount: 2 }, chain: "THEN" } as Action,
      OPPONENT_DRAW_1,
    ])();
    expect(r.promptType()).toBe("SELECT_TARGET");
    await r.reload();
    r.select([victim.instanceId]);
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.eventLog.some((e) => e.type === "CARD_DRAWN")).toBe(false);
    expect(r.state.players[1].hand).toHaveLength(hand1);
    await r.reload();
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
  });
});

describe("OPT-862 Brook's delayed deck-out is unchanged (OP15-022 text, docs/cards/OP-15.md:158; rule 1-3-1 line 57)", () => {
  it("Brook: an EB01-051 cost that empties the deck does not end the game; the K.O. still resolves; the loss comes at the end-of-turn window", () => {
    const r = rig();
    r.leader(0, "OP15-022");
    r.deck(0, 2);
    const victim = r.put(CARDS.VANILLA.id, 1, "CHARACTER", { data: { cost: 2 } });
    playFingerPistol(r);
    r.accept();
    expect(r.state.status).toBe("IN_PROGRESS");
    expect(r.state.players[0].deck).toHaveLength(0);
    expect(r.state.turn.deckHitZeroThisTurn?.[0]).toBe(true);
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select([victim.instanceId]);
    expect(r.state.players[1].characters.filter(Boolean)).toHaveLength(0);
    expect(r.state.status).toBe("IN_PROGRESS");
    r.act({ type: "ADVANCE_PHASE" });
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
  });
});
