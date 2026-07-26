import React, { useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameAction, GameState } from "@shared/game-types";
import type { BoardState } from "@/components/game/board";

const mocks = vi.hoisted(() => ({
  actionRefs: [] as Array<(action: GameAction) => void>,
  boardStates: [] as BoardState[],
  tickCountdown: null as (() => void) | null,
  sendAction: vi.fn(),
  backToLobbies: vi.fn(),
  viewerRole: "player" as "pending" | "player" | "spectator",
  bottomPlayerIndex: ((value: 0 | 1) => value)(0),
  bottomPlayer: null as GameState["players"][number] | null,
  topPlayer: null as GameState["players"][number] | null,
  gameState: {
    eventLog: [],
    activeEffects: [],
    pendingPrompt: null,
    pregame: null,
  } as unknown as GameState | null,
  cardDbReady: true,
  connectivityFailed: false,
  lastError: null as string | null,
  sessionPerspectives: [] as unknown[],
  solitaireCalls: 0,
}));

vi.mock("@/hooks/use-game-session", () => ({
  useGameSession: (
    _gameId: string,
    _workerUrl: string,
    perspective: unknown
  ) => {
    mocks.sessionPerspectives.push(perspective);
    const [opponentDeadlineRemaining, setOpponentDeadlineRemaining] =
      useState(30_000);
    mocks.tickCountdown = () =>
      setOpponentDeadlineRemaining((remaining) => remaining - 1_000);

    return {
      game: {
        gameState: mocks.gameState,
        cardDb: {},
        cardDbReady: mocks.cardDbReady,
        connectionStatus: "connected",
        lastError: mocks.lastError,
        actionRejection: null,
        acceptedUpdate: null,
        activePrompt: null,
        activePromptId: null,
        gameOver: null,
        sendAction: mocks.sendAction,
        viewerRole: mocks.viewerRole,
        myIndex: 0,
        me: null,
        opp: null,
        bottomPlayerIndex: mocks.bottomPlayerIndex,
        bottomPlayer: mocks.bottomPlayer,
        topPlayer: mocks.topPlayer,
        turn: null,
        isMyTurn: false,
        phase: "MAIN",
        battlePhase: null,
        inBattle: false,
        matchClosed: false,
        canUndo: false,
        retryConnection: vi.fn(),
        connectivityFailed: mocks.connectivityFailed,
      },
      opponent: {
        opponentAway: true,
        opponentAwayText: "Opponent disconnected.",
        gamePausedForOpponent: false,
        opponentDeadlineRemaining,
      },
      navigation: {
        remoteGameStatus: null,
        remoteGameNotFound: false,
        fallbackConcedeAvailable: false,
        fallbackSubmitting: false,
        fallbackError: null,
        handleFallbackConcede: vi.fn(),
        leavingGame: false,
        leaveError: null,
        handleLeaveGame: vi.fn(),
        handleBackToLobbies: mocks.backToLobbies,
      },
      endState: {
        endTitle: "",
        endColorClass: "",
        endReason: "",
      },
    };
  },
}));

vi.mock("@/hooks/use-solitaire-session", () => ({
  useSolitaireSession: () => {
    mocks.solitaireCalls += 1;
    throw new Error("unexpected solitaire player session");
  },
}));

vi.mock("@/components/game/board", () => ({
  Board: ({
    state,
    dispatch,
  }: {
    state: BoardState;
    dispatch: { onAction: (action: GameAction) => void };
  }) => {
    mocks.boardStates.push(state);
    mocks.actionRefs.push(dispatch.onAction);
    return null;
  },
}));

vi.mock("@/components/game/scaled-board", () => ({
  MinViewportGate: ({ children }: { children: ReactNode }) => children,
  PortalRoot: () => null,
  ScaledBoard: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/ui", () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("./event-log", () => ({ EventLog: () => null }));
vi.mock("./game-button", () => ({ GameButton: () => null }));
vi.mock("./pregame/pregame-overlay", () => ({ PregameOverlay: () => null }));

import { LiveGameShell } from "./live-game-shell";

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.actionRefs.length = 0;
  mocks.boardStates.length = 0;
  mocks.tickCountdown = null;
  mocks.sendAction.mockReset();
  mocks.backToLobbies.mockReset();
  mocks.viewerRole = "player";
  mocks.bottomPlayerIndex = 0;
  mocks.bottomPlayer = null;
  mocks.topPlayer = null;
  mocks.gameState = {
    eventLog: [],
    activeEffects: [],
    pendingPrompt: null,
    pregame: null,
  } as unknown as GameState;
  mocks.cardDbReady = true;
  mocks.connectivityFailed = false;
  mocks.lastError = null;
  mocks.sessionPerspectives.length = 0;
  mocks.solitaireCalls = 0;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("LiveGameShell dispatch wiring", () => {
  it("keeps onAction stable across an opponent countdown render", () => {
    act(() => {
      renderer = create(
        <LiveGameShell
          gameId="game-1"
          workerUrl="https://worker.test"
          viewerRole="player"
        />
      );
    });
    const initialOnAction = mocks.actionRefs.at(-1);
    expect(initialOnAction).toBeTypeOf("function");

    act(() => mocks.tickCountdown?.());

    const rerenderedOnAction = mocks.actionRefs.at(-1);
    expect(rerenderedOnAction).toBe(initialOnAction);
    rerenderedOnAction?.({ type: "ADVANCE_PHASE" });
    expect(mocks.sendAction).toHaveBeenCalledWith({ type: "ADVANCE_PHASE" });
  });

  it("maps spectator identity to OPT-562's read-only board mode", () => {
    mocks.viewerRole = "spectator";
    mocks.bottomPlayerIndex = 1;
    mocks.bottomPlayer = {
      playerId: "player-1",
    } as GameState["players"][number];
    mocks.topPlayer = {
      playerId: "player-0",
    } as GameState["players"][number];

    act(() => {
      renderer = create(
        <LiveGameShell
          gameId="game-1"
          workerUrl="https://worker.test"
          viewerRole="spectator"
          bottomPlayerIndex={1}
        />
      );
    });

    expect(mocks.sessionPerspectives.at(-1)).toEqual({
      viewerRole: "spectator",
      bottomPlayerIndex: 1,
    });
    const state = mocks.boardStates.at(-1);
    expect(state?.interactionMode).toBe("spectator");
    expect(state?.bottomPlayerIndex).toBe(1);
    expect(state?.me?.playerId).toBe("player-0");
    expect(state?.opp?.playerId).toBe("player-1");
  });

  it("keeps pending player identity out of the interactive board", () => {
    mocks.viewerRole = "pending";

    act(() => {
      renderer = create(
        <LiveGameShell
          gameId="game-1"
          workerUrl="https://worker.test"
          viewerRole="player"
        />
      );
    });

    expect(mocks.boardStates).toHaveLength(0);
  });

  it("shows the controller's finite recovery state after spectator token authorization fails", () => {
    mocks.viewerRole = "spectator";
    mocks.gameState = null;
    mocks.cardDbReady = false;
    mocks.connectivityFailed = true;
    mocks.lastError = "Failed to get auth token";

    act(() => {
      renderer = create(
        <LiveGameShell
          gameId="game-1"
          workerUrl="https://worker.test"
          viewerRole="spectator"
          bottomPlayerIndex={0}
        />
      );
    });

    const output = JSON.stringify(renderer?.toJSON());
    expect(output).toContain("Can");
    expect(output).toContain("reach the game server");
    expect(output).toContain("Failed to get auth token");
    expect(mocks.boardStates).toHaveLength(0);
  });

  it("uses one spectator session even when the game mode is Solitaire", () => {
    mocks.viewerRole = "spectator";

    act(() => {
      renderer = create(
        <LiveGameShell
          gameId="game-1"
          workerUrl="https://worker.test"
          gameMode="SOLITAIRE"
          viewerRole="spectator"
          bottomPlayerIndex={0}
        />
      );
    });

    expect(mocks.solitaireCalls).toBe(0);
    expect(mocks.sessionPerspectives.at(-1)).toEqual({
      viewerRole: "spectator",
      bottomPlayerIndex: 0,
    });
  });
});
