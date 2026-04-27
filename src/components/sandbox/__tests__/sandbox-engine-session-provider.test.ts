// Smoke / field-drift test for the engine-driven sandbox session (OPT-305).
//
// Mirrors the OPT-286 pattern: we don't mount BoardLayout in the node test
// environment, but the production board reads a fixed prop set
// (`BoardLayoutProps`) — that's the *real* drift surface. The test exercises
// the pure pieces of the hook (`hydrateToGameState`, `buildEngineSessionGame`)
// against a real `runPipeline` call, which is exactly what the hook does on
// dispatch — minus React state.

import { describe, expect, it } from "vitest";
import { runPipeline } from "@engine/engine/pipeline";
import type {
  CardData,
  GameAction,
  KeywordSet,
  TurnState,
} from "@shared/game-types";
import type { BoardLayoutProps } from "@/components/game/board-layout";
import {
  makeCard,
  makeDonStack,
  makeLifeStack,
  playerSlot,
} from "@/lib/sandbox/scenarios/helpers";
import type { PartialGameState } from "@/lib/sandbox/scenarios/types";
import {
  buildEngineSessionGame,
  hydrateToGameState,
} from "../sandbox-engine-session-provider";

// ─── Fixtures ──────────────────────────────────────────────────────────

function noKeywords(): KeywordSet {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

function makeCardData(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 2000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

const LEADER_DATA = makeCardData("LEADER-T", {
  type: "Leader",
  cost: null,
  power: 5000,
  life: 5,
});
const CHAR_DATA = makeCardData("CHAR-VANILLA", {
  cost: 1,
  power: 2000,
});

const TURN: TurnState = {
  number: 2,
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
          cardId: LEADER_DATA.id,
          zone: "LEADER",
          controller: 0,
        }),
        hand: [
          makeCard({
            instanceId: "p0-char-1",
            cardId: CHAR_DATA.id,
            zone: "HAND",
            controller: 0,
          }),
        ],
        donCostArea: makeDonStack({ count: 1, prefix: "p0-don" }),
        donDeck: makeDonStack({ count: 9, prefix: "p0-don-deck" }),
        life: makeLifeStack({ count: 5, cardId: CHAR_DATA.id, prefix: "p0-life" }),
      }),
      playerSlot({
        playerId: "p1",
        leader: makeCard({
          instanceId: "p1-leader",
          cardId: LEADER_DATA.id,
          zone: "LEADER",
          controller: 1,
        }),
        life: makeLifeStack({ count: 5, cardId: CHAR_DATA.id, prefix: "p1-life" }),
      }),
    ],
  };
}

function fixtureCardDb(): Map<string, CardData> {
  return new Map([
    [LEADER_DATA.id, LEADER_DATA],
    [CHAR_DATA.id, CHAR_DATA],
  ]);
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("hydrateToGameState", () => {
  it("fills engine-only fields with empty stubs", () => {
    const state = hydrateToGameState(fixtureState());
    expect(state.id).toBe("sandbox");
    expect(state.status).toBe("IN_PROGRESS");
    expect(state.activeEffects).toEqual([]);
    expect(state.prohibitions).toEqual([]);
    expect(state.scheduledActions).toEqual([]);
    expect(state.oneTimeModifiers).toEqual([]);
    expect(state.triggerRegistry).toEqual([]);
    expect(state.effectStack).toEqual([]);
    expect(state.pendingPrompt).toBeNull();
    expect(state.eventLog).toEqual([]);
    expect(state.winner).toBeNull();
    expect(state.winReason).toBeNull();
  });

  it("preserves the partial state's turn and players, adds engine PlayerState fields", () => {
    const state = hydrateToGameState(fixtureState());
    expect(state.turn).toBe(TURN);
    for (const p of state.players) {
      expect(p.removedFromGame).toEqual([]);
      expect(p.deckList).toEqual([]);
      expect(p.connected).toBe(true);
      expect(p.awayReason).toBeNull();
      expect(p.rejoinDeadlineAt).toBeNull();
    }
    expect(state.players[0].playerId).toBe("p0");
    expect(state.players[1].playerId).toBe("p1");
  });
});

describe("engine-driven dispatch", () => {
  it("PLAY_CARD emits CARD_PLAYED, moves the card hand → characters, grows eventLog", () => {
    const state = hydrateToGameState(fixtureState());
    const cardDb = fixtureCardDb();
    const action: GameAction = {
      type: "PLAY_CARD",
      cardInstanceId: "p0-char-1",
    };

    const result = runPipeline(state, action, cardDb, 0);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();

    const cardPlayed = result.state.eventLog.filter(
      (e) => e.type === "CARD_PLAYED",
    );
    expect(cardPlayed.length).toBeGreaterThanOrEqual(1);
    expect(cardPlayed[0].payload.cardId).toBe(CHAR_DATA.id);

    const me = result.state.players[0];
    expect(me.hand).toHaveLength(0);
    const playedChar = me.characters.find((c) => c !== null);
    expect(playedChar).toBeDefined();
    expect(playedChar?.cardId).toBe(CHAR_DATA.id);

    expect(result.state.eventLog.length).toBeGreaterThan(state.eventLog.length);
  });
});

describe("reset semantics", () => {
  it("re-hydrates from the partial scenario state with an empty eventLog", () => {
    // The hook owns no state beyond the engine's GameState; reset is a fresh
    // hydration. Verify a freshly-hydrated state has the original hand and an
    // empty eventLog regardless of any prior dispatch.
    const fresh = hydrateToGameState(fixtureState());
    expect(fresh.eventLog).toEqual([]);
    expect(fresh.players[0].hand).toHaveLength(1);
    expect(fresh.players[0].hand[0]?.instanceId).toBe("p0-char-1");
    expect(fresh.players[0].characters.every((c) => c === null)).toBe(true);
  });
});

describe("buildEngineSessionGame", () => {
  it("populates every BoardLayoutProps field with no runtime undefineds", () => {
    const state = hydrateToGameState(fixtureState());
    const cardDbRecord = {
      [LEADER_DATA.id]: LEADER_DATA,
      [CHAR_DATA.id]: CHAR_DATA,
    };
    const sendAction = () => {};
    const game = buildEngineSessionGame(state, cardDbRecord, 0, sendAction);

    // Type-checking this object is the actual contract: if BoardLayoutProps
    // grows a new field, this assignment fails to compile and the smoke test
    // fails before runtime.
    const props: BoardLayoutProps = {
      me: game.me,
      opp: game.opp,
      myIndex: game.myIndex,
      turn: game.turn,
      cardDb: game.cardDb,
      isMyTurn: game.isMyTurn,
      battlePhase: game.battlePhase,
      connectionStatus: game.connectionStatus,
      eventLog: game.eventLog,
      activeEffects: game.gameState.activeEffects,
      activePrompt: game.activePrompt,
      onAction: game.sendAction,
      onLeave: () => {},
      matchClosed: game.matchClosed,
      canUndo: game.canUndo,
    };
    for (const [key, value] of Object.entries(props)) {
      expect(value, `BoardLayoutProps.${key}`).not.toBeUndefined();
    }
  });

  it("threads state.eventLog through both game.eventLog and game.gameState.eventLog", () => {
    const state = hydrateToGameState(fixtureState());
    const game = buildEngineSessionGame(state, {}, 0, () => {});
    expect(game.eventLog).toBe(state.eventLog);
    expect(game.gameState.eventLog).toBe(state.eventLog);
  });

  it("derives me/opp/turn/isMyTurn from myIndex", () => {
    const state = hydrateToGameState(fixtureState());
    const game = buildEngineSessionGame(state, {}, 0, () => {});
    expect(game.myIndex).toBe(0);
    expect(game.me.playerId).toBe("p0");
    expect(game.opp.playerId).toBe("p1");
    expect(game.isMyTurn).toBe(true);
    expect(game.turn).toBe(state.turn);
    expect(game.activePrompt).toBeNull();
  });
});
