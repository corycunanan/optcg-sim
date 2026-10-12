/**
 * OPT-949 (OPT-960, Game Engine Consolidation PR 2) — one joint
 * rule-processing checkpoint and one terminal writer.
 *
 * Rules v1.2.0, `docs/rules/rule_comprehensive.md`:
 * - 9-1-2 (line 876): rule processing is resolved immediately, even while
 *   other actions are being carried out.
 * - 9-2-1 (line 880): every player who meets a defeat condition when rule
 *   processing begins loses (both → draw).
 * - 9-2-1-1 (line 882): Leader takes damage while at 0 Life. 9-2-1-2 (line
 *   884): 0 cards in deck.
 * - 1-2-1 (line 35): when the opponent loses, the other player wins.
 * - 1-3-1 (line 57): card text over rules (WIN_GAME).
 * - 11-1-1-1 (line 1022): a draw only when neither player can stop a loop.
 * Decision 3 (rev4 §10): evaluate both players at one checkpoint; never run
 * later instructions to manufacture simultaneous defeat. Decision 5: budget
 * exhaustion is an engine-limit outcome, distinct from a rules draw.
 *
 * | Clause | Condition / evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | 9-2-1, 9-2-1-2 | both decks 0 at one checkpoint (synthetic: constructed state, no authored sequence reaches it because every move is its own checkpoint) | none | none | one evaluation | FINISHED, winner null, one GAME_OVER | "joint …" |
 * | 9-2-1, 9-2-1-1/-2 | p0 deck 0 and p1 qualifying lethal damage at one checkpoint (synthetic) | none | none | one evaluation | draw | "mixed …" |
 * | 9-2-1, 1-2-1, Decision 3 | instruction 1 empties p0's deck; instruction 2 would empty p1's deck or open a prompt | none | none | stop after 1 | winner 1, p1 deck intact, no prompt | "sequential …" |
 * | 9-2-1-1 | Life reaches 0 through a move or nonlethal damage; a later deck-changing checkpoint | none | none | play continues | IN_PROGRESS | "zero Life …" |
 * | 1-3-1 (WIN_GAME) | WIN_GAME mid-chain, also after a prompt reply | none | none | stop at WIN_GAME | winner = controller, later DRAW never runs, no prompt/stack; reload has no continuation; stale reply rejected | "WIN_GAME …" |
 * | concession, abandonment, external result, engine limit, engine contract, rules defeat, joint draw, Brook delayed loss | each writer | none | none | terminal | distinct winReason/engineOutcome, terminal contract | "terminal writer …" |
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Action } from "../engine/effect-types.js";
import type { CardData, Env, GameState } from "../types.js";
import { runRuleProcessing } from "../engine/defeat.js";
import { executeActionChain, executeEffectAction } from "../engine/effect-resolver/resolver.js";
import { MAX_RESOLUTION_ACTIONS } from "../engine/engine-limits.js";
import { ENGINE_CONTRACT_REASON, ENGINE_LIMIT_REASON, terminateGame } from "../engine/terminal.js";
import { GameSession } from "../GameSession.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { expectTerminal, rig, synSchema } from "./opt-960-rig.js";
import { CARDS } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const KO_UP_TO_1: Action = {
  type: "KO",
  target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
  chain: "THEN",
} as Action;

function activate(r: ReturnType<typeof rig>, id: string, actions: Action[], costs?: unknown[]) {
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

describe("joint checkpoint: both players evaluated once (rule 9-2-1 line 880; Decision 3)", () => {
  it("joint (synthetic checkpoint): both decks empty at one checkpoint is a draw", () => {
    const r = rig();
    r.state.players[0].deck = [];
    r.state.players[1].deck = [];
    const after = runRuleProcessing(r.state, {}, r.db);
    expectTerminal(after, { winner: null, reason: "Player 1 decked out; Player 2 decked out — draw" });
  });

  it("mixed (synthetic checkpoint): p0 deck-out plus p1 qualifying lethal damage at one checkpoint is a draw", () => {
    const r = rig();
    r.state.players[0].deck = [];
    r.state.players[1].life = [];
    const after = runRuleProcessing(r.state, { lethalDamage: [1] }, r.db);
    expectTerminal(after, { winner: null, reason: "Player 1 decked out; Player 2's life reached 0 — draw" });
  });

  it("a later checkpoint never reopens or rewrites a finished game (first terminal outcome stands)", () => {
    const r = rig();
    r.state.players[1].deck = [];
    const first = runRuleProcessing(r.state, {}, r.db);
    expect(first.winner).toBe(0);
    const emptied = { ...first, players: [{ ...first.players[0], deck: [] }, first.players[1]] } as GameState;
    const second = runRuleProcessing(emptied, {}, r.db);
    expect(second).toBe(emptied);
    expect(second.winner).toBe(0);
    expect(second.eventLog.filter((e) => e.type === "GAME_OVER")).toHaveLength(1);
  });
});

describe("sequential instructions: the earlier terminal checkpoint ends play (rules 9-2-1 line 880, 1-2-1 line 35; Decision 3)", () => {
  it("DRAW empties p0's deck, so the THEN opponent MILL never runs and the result is not a draw", () => {
    const r = rig();
    r.deck(0, 1);
    r.deck(1, 1);
    activate(r, "SYN-SEQ-DRAW", [
      { type: "DRAW", params: { amount: 1 } } as Action,
      { type: "OPPONENT_ACTION", params: { action: { type: "MILL", params: { amount: 1 } } }, chain: "THEN" } as Action,
    ])();
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.players[1].deck).toHaveLength(1);
  });

  it("MILL empties p0's deck, so the THEN K.O. never opens its prompt", () => {
    const r = rig();
    r.deck(0, 2);
    r.put(CARDS.VANILLA.id, 1, "CHARACTER");
    activate(r, "SYN-SEQ-MILL", [{ type: "MILL", params: { amount: 2 } } as Action, KO_UP_TO_1])();
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.players[1].characters.filter(Boolean)).toHaveLength(1);
  });
});

describe("zero Life without qualifying lethal damage stays playable (rule 9-2-1-1 line 882)", () => {
  it("trashing the last Life card through a move is not defeat", () => {
    const r = rig();
    r.life(0, 1);
    activate(r, "SYN-TRASH-LIFE", [{ type: "TRASH_FROM_LIFE", params: { amount: 1 } } as Action])();
    expect(r.state.players[0].life).toHaveLength(0);
    expect(r.state.status).toBe("IN_PROGRESS");
    expect(r.gameOvers()).toHaveLength(0);
  });

  it("a nonlethal battle hit that takes the last Life card leaves no stale context for a later checkpoint", () => {
    const r = rig();
    r.life(1, 1);
    r.deck(0, 5);
    const draw = activate(r, "SYN-LATER-DRAW", [{ type: "DRAW", params: { amount: 1 } } as Action]);
    r.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: r.state.players[0].leader.instanceId,
      targetInstanceId: r.state.players[1].leader.instanceId,
    });
    r.act({ type: "PASS" });
    r.act({ type: "PASS" });
    expect(r.state.players[1].life).toHaveLength(0);
    expect(r.state.status).toBe("IN_PROGRESS");
    // A later deck-changing action runs a checkpoint; p1's earlier nonlethal
    // hit must not become lethal now that p1 is at 0 Life.
    draw();
    expect(r.state.players[0].deck).toHaveLength(4);
    expect(r.state.status).toBe("IN_PROGRESS");
    expect(r.gameOvers()).toHaveLength(0);
  });
});

describe("WIN_GAME through the common terminal writer (rule 1-3-1 line 57)", () => {
  it("WIN_GAME mid-chain stops the later instructions and clears every decision", async () => {
    const r = rig();
    r.deck(0, 3);
    r.put(CARDS.VANILLA.id, 1, "CHARACTER");
    activate(r, "SYN-WINNER", [
      { type: "WIN_GAME" } as Action,
      { type: "DRAW", params: { amount: 1 }, chain: "THEN" } as Action,
      KO_UP_TO_1,
    ])();
    expectTerminal(r.state, { winner: 0, reason: "Player 1 won by a card effect" });
    expect(r.state.players[0].deck).toHaveLength(3);
    expect(r.state.eventLog.some((e) => e.type === "CARD_DRAWN")).toBe(false);
    await r.reload();
    expectTerminal(r.state, { winner: 0, reason: "Player 1 won by a card effect" });
  });

  it("WIN_GAME after a prompt reply: the reply resolves, the game ends, later instructions never run, a stale reply is rejected without mutation", () => {
    const r = rig();
    r.deck(0, 3);
    const victim = r.put(CARDS.VANILLA.id, 1, "CHARACTER");
    activate(r, "SYN-KO-THEN-WIN", [
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } } as Action,
      { type: "WIN_GAME", chain: "THEN" } as Action,
      { type: "DRAW", params: { amount: 1 }, chain: "THEN" } as Action,
    ])();
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select([victim.instanceId]);
    expectTerminal(r.state, { winner: 0, reason: "Player 1 won by a card effect" });
    expect(r.state.players[0].deck).toHaveLength(3);
    const { rejected, before } = r.respond({ type: "SELECT_TARGET", selectedInstanceIds: [victim.instanceId] });
    expect(rejected).toBe(true);
    expect(r.state).toBe(before);
    const coordinator = new SessionCoordinator();
    const routed = coordinator.executeAction(r.state, [], 1, { type: "UNDO" }, r.db);
    expect(routed).toMatchObject({ kind: "reject", reason: "Game is already over" });
  });
});

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
  alarm(): Promise<void>;
  handlePregameLeave(playerIndex: 0 | 1): Promise<void>;
  handleNotifyEnd(request: Request): Promise<Response>;
};

/** A live state with a pending prompt, a frame and a parked effect Trigger: everything a writer must clear. */
function liveDecisionState(): { state: GameState; db: Map<string, CardData> } {
  const r = rig();
  r.deck(0, 3);
  r.put(CARDS.VANILLA.id, 1, "CHARACTER");
  activate(r, "SYN-PENDING", [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } } as Action])();
  expect(r.promptType()).toBe("SELECT_TARGET");
  expect(r.state.effectStack.length).toBeGreaterThan(0);
  return { state: r.state, db: r.db };
}

function session(state: GameState, db: Map<string, CardData>): SessionInternals {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  const s = new GameSession(
    new MockDurableObjectState() as unknown as DurableObjectState,
    { GAME_WORKER_SECRET: "test", NEXTJS_URL: "https://app.example.test" } as Env,
  ) as unknown as SessionInternals;
  s.cardDb = db;
  s.gameState = state;
  return s;
}

describe("terminal writer inventory: every writer goes through terminateGame with a distinct outcome (OPT-949 acceptance 4, OPT-925 final scope)", () => {
  it("rules defeat (deck-out at action end)", () => {
    const r = rig();
    r.deck(1, 0);
    r.act({ type: "ADVANCE_PHASE" });
    expectTerminal(r.state, { winner: 0, reason: "Player 2 decked out" });
    expect(r.state.engineOutcome ?? null).toBeNull();
  });

  it("concession during a pending prompt", () => {
    const { state, db } = liveDecisionState();
    const r = rig();
    r.state = state;
    for (const [k, v] of db) r.db.set(k, v);
    r.state = { ...r.state };
    const coordinator = new SessionCoordinator();
    const result = coordinator.executeAction(r.state, [], 1, { type: "CONCEDE" }, r.db);
    expect(result.kind).toBe("applied");
    expectTerminal(result.state, { winner: 0, reason: "Player 2 conceded" });
  });

  it("abandonment: one player fails to rejoin (FINISHED) and both fail (ABANDONED)", async () => {
    const one = liveDecisionState();
    const s1 = session(
      {
        ...one.state,
        players: [
          { ...one.state.players[0], connected: true },
          { ...one.state.players[1], connected: false, rejoinDeadlineAt: 1 },
        ],
      },
      one.db,
    );
    await s1.alarm();
    expectTerminal(s1.gameState, { winner: 0, reason: "Player 2 failed to rejoin in time" });

    const both = liveDecisionState();
    const s2 = session(
      {
        ...both.state,
        players: [
          { ...both.state.players[0], connected: false, rejoinDeadlineAt: 1 },
          { ...both.state.players[1], connected: false, rejoinDeadlineAt: 1 },
        ],
      },
      both.db,
    );
    await s2.alarm();
    expectTerminal(s2.gameState, { status: "ABANDONED", winner: null, reason: "Both players failed to rejoin in time" });
  });

  it("abandonment during pre-game clears the pre-game record", async () => {
    const live = liveDecisionState();
    const s = session(live.state, live.db);
    await s.handlePregameLeave(1);
    expectTerminal(s.gameState, { winner: 0, reason: "Player 2 left during pre-game" });
    expect(s.gameState.pregame).toBeNull();
  });

  it("external result (Next.js notify-end)", async () => {
    const live = liveDecisionState();
    const s = session(live.state, live.db);
    const response = await s.handleNotifyEnd(
      new Request("https://worker.test/notify-end", {
        method: "POST",
        headers: { Authorization: "Bearer test" },
        body: JSON.stringify({ winnerIndex: 1, reason: "Player conceded while disconnected" }),
      }),
    );
    expect(response.status).toBe(200);
    expectTerminal(s.gameState, { winner: 1, reason: "Player conceded while disconnected" });
  });

  it("engine limit: a long legal chain past the action budget is labelled ENGINE_LIMIT, not a rules draw (Decision 5)", () => {
    const r = rig();
    const actions = Array.from({ length: MAX_RESOLUTION_ACTIONS + 1 }, () => ({ type: "DRAW", params: { amount: 0 } }) as Action);
    const result = executeActionChain(r.state, actions, r.state.players[0].leader.instanceId, 0, r.db);
    expectTerminal(result.state, { winner: null, reason: ENGINE_LIMIT_REASON });
    expect(result.state.engineOutcome).toMatchObject({ type: "ENGINE_LIMIT", diagnostic: { kind: "ACTION_BUDGET" } });
    expect(result.state.winReason).not.toMatch(/draw/i);
  });

  it("engine contract: an unhandled action type is ENGINE_ERROR_DRAW", () => {
    const r = rig();
    const result = executeEffectAction(
      r.state,
      { type: "NOT_A_REAL_ACTION" } as unknown as Action,
      r.state.players[0].leader.instanceId,
      0,
      r.db,
      new Map(),
    );
    expectTerminal(result.state, { winner: null, reason: ENGINE_CONTRACT_REASON });
    expect(result.state.engineOutcome).toMatchObject({ type: "ENGINE_ERROR_DRAW", diagnostic: { kind: "ENGINE_CONTRACT" } });
  });

  it("the writer clears a parked effect Trigger and a paused battle continuation", () => {
    const { state } = liveDecisionState();
    const loaded: GameState = {
      ...state,
      turn: {
        ...state.turn,
        pendingTriggerFromEffect: {
          lifeCard: { instanceId: "life-x", cardId: CARDS.VANILLA.id, face: "DOWN" },
          damagedPlayerIndex: 1,
          remainingDamages: 1,
          sourceCardInstanceId: "src",
          controllerIndex: 0,
        },
      },
    };
    expectTerminal(terminateGame(loaded, { kind: "CONCESSION", concedingPlayer: 0 }), { winner: 1, reason: "Player 1 conceded" });
  });
});
