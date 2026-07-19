import React, { useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameAction, GameState } from "@shared/game-types";

const mocks = vi.hoisted(() => ({
  actionRefs: [] as Array<(action: GameAction) => void>,
  tickCountdown: null as (() => void) | null,
  sendAction: vi.fn(),
  backToLobbies: vi.fn(),
}));

vi.mock("@/hooks/use-game-session", () => ({
  useGameSession: () => {
    const [opponentDeadlineRemaining, setOpponentDeadlineRemaining] =
      useState(30_000);
    mocks.tickCountdown = () =>
      setOpponentDeadlineRemaining((remaining) => remaining - 1_000);

    return {
      game: {
        gameState: {
          eventLog: [],
          activeEffects: [],
          pendingPrompt: null,
          pregame: null,
        } as unknown as GameState,
        cardDb: {},
        cardDbReady: true,
        connectionStatus: "connected",
        lastError: null,
        actionRejection: null,
        acceptedUpdate: null,
        activePrompt: null,
        activePromptId: null,
        gameOver: null,
        sendAction: mocks.sendAction,
        myIndex: 0,
        me: null,
        opp: null,
        turn: null,
        isMyTurn: false,
        phase: "MAIN",
        battlePhase: null,
        inBattle: false,
        matchClosed: false,
        canUndo: false,
        retryConnection: vi.fn(),
        connectivityFailed: false,
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

vi.mock("@/components/game/board", () => ({
  Board: ({
    dispatch,
  }: {
    dispatch: { onAction: (action: GameAction) => void };
  }) => {
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
  mocks.tickCountdown = null;
  mocks.sendAction.mockReset();
  mocks.backToLobbies.mockReset();
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
        <LiveGameShell gameId="game-1" workerUrl="https://worker.test" />,
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
});
