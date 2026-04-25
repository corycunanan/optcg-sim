// Smoke / field-drift test for the sandbox session.
//
// We don't mount BoardLayout in the node test environment, but the production
// board reads a fixed prop set (BoardLayoutProps) — that's the *real* drift
// surface. Building a BoardLayoutProps value from the synthesized session
// catches any new prop the production board adds that the sandbox forgets to
// supply, at PR time, and without pulling in JSDOM.

import { describe, expect, it } from "vitest";
import type { CardDb, TurnState } from "@shared/game-types";
import type { BoardLayoutProps } from "@/components/game/board-layout";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "@/lib/sandbox/scenarios/helpers";
import type { PartialGameState } from "@/lib/sandbox/scenarios/types";
import { buildSandboxSession } from "./sandbox-session-provider";

const TURN: TurnState = {
  number: 1,
  activePlayerIndex: 0,
  phase: "MAIN",
  battleSubPhase: null,
  battle: null,
  oncePerTurnUsed: {},
  actionsPerformedThisTurn: [],
  deckHitZeroThisTurn: [false, false],
};

function fixtureState(): PartialGameState {
  return {
    myIndex: 0,
    turn: TURN,
    players: [
      playerSlot({
        playerId: "p0",
        leader: makeCard({
          instanceId: "p0-leader",
          cardId: "OP01-001",
          zone: "LEADER",
          controller: 0,
        }),
        deck: [
          makeCard({
            instanceId: "p0-deck-top",
            cardId: "OP01-030",
            zone: "DECK",
            controller: 0,
          }),
        ],
        life: makeLifeStack({ count: 4, cardId: "OP01-040", prefix: "p0-life" }),
        donCostArea: makeDonStack({ count: 2, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 8, prefix: "p0-don-deck" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: "OP01-002",
          zone: "LEADER",
          controller: 1,
        }),
      }),
    ],
  };
}

const CARD_DB: CardDb = {};

describe("buildSandboxSession", () => {
  it("returns a session with all four top-level groups populated", () => {
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events: [],
      cardDb: CARD_DB,
    });
    expect(session.game).toBeDefined();
    expect(session.opponent).toBeDefined();
    expect(session.navigation).toBeDefined();
    expect(session.endState).toBeDefined();
  });

  it("hydrates a full GameState from the partial scenario state", () => {
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events: [],
      cardDb: CARD_DB,
    });
    const gs = session.game.gameState;
    expect(gs.id).toBe("sandbox");
    expect(gs.status).toBe("IN_PROGRESS");
    expect(gs.players).toHaveLength(2);
    // Each player has the engine-only fields the board may read.
    for (const p of gs.players) {
      expect(p.removedFromGame).toEqual([]);
      expect(p.deckList).toEqual([]);
      expect(p.connected).toBe(true);
      expect(p.awayReason).toBeNull();
      expect(p.rejoinDeadlineAt).toBeNull();
    }
    expect(gs.activeEffects).toEqual([]);
    expect(gs.triggerRegistry).toEqual([]);
    expect(gs.effectStack).toEqual([]);
  });

  it("exposes me/opp/turn/isMyTurn derived from myIndex", () => {
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events: [],
      cardDb: CARD_DB,
    });
    expect(session.game.myIndex).toBe(0);
    expect(session.game.me.playerId).toBe("p0");
    expect(session.game.opp.playerId).toBe("p1");
    expect(session.game.isMyTurn).toBe(true);
    expect(session.game.turn).toBe(session.game.gameState.turn);
  });

  it("threads the same eventLog reference to game.eventLog and gameState.eventLog", () => {
    const events = [
      {
        type: "CARD_DRAWN" as const,
        playerIndex: 0 as const,
        timestamp: 0,
        payload: { cardId: "OP01-030", cardInstanceId: "p0-deck-top" },
      },
    ];
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events,
      cardDb: CARD_DB,
    });
    expect(session.game.eventLog).toBe(events);
    expect(session.game.gameState.eventLog).toBe(events);
    // Replay landed: drawn card reached the hand.
    expect(session.game.me.hand.map((c) => c.instanceId)).toContain("p0-deck-top");
  });

  it("forwards sendAction to the supplied onAction callback", () => {
    const calls: unknown[] = [];
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events: [],
      cardDb: CARD_DB,
      onAction: (action) => calls.push(action),
    });
    session.game.sendAction({ type: "PASS" });
    expect(calls).toEqual([{ type: "PASS" }]);
  });

  it("provides a sendAction no-op when onAction is omitted", () => {
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events: [],
      cardDb: CARD_DB,
    });
    expect(() => session.game.sendAction({ type: "PASS" })).not.toThrow();
  });

  it("uses the supplied onBackToLobbies handler", async () => {
    let called = false;
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events: [],
      cardDb: CARD_DB,
      onBackToLobbies: () => {
        called = true;
      },
    });
    await session.navigation.handleBackToLobbies();
    expect(called).toBe(true);
  });

  it("populates every BoardLayoutProps field with no runtime undefineds", () => {
    const session = buildSandboxSession({
      initialState: fixtureState(),
      events: [],
      cardDb: CARD_DB,
    });
    // Type-checking this object is the actual contract: if BoardLayoutProps
    // grows a new field, this assignment fails to compile and the smoke test
    // fails before runtime.
    const props: BoardLayoutProps = {
      me: session.game.me,
      opp: session.game.opp,
      myIndex: session.game.myIndex,
      turn: session.game.turn,
      cardDb: session.game.cardDb,
      isMyTurn: session.game.isMyTurn,
      battlePhase: session.game.battlePhase,
      connectionStatus: session.game.connectionStatus,
      eventLog: session.game.eventLog,
      activeEffects: session.game.gameState.activeEffects,
      activePrompt: session.game.activePrompt,
      onAction: session.game.sendAction,
      onLeave: () => session.navigation.handleBackToLobbies(),
      matchClosed: session.game.matchClosed,
      canUndo: session.game.canUndo,
    };
    for (const [key, value] of Object.entries(props)) {
      expect(value, `BoardLayoutProps.${key}`).not.toBeUndefined();
    }
  });
});
