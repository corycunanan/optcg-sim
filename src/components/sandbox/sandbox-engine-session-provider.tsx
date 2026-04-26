"use client";

// Engine-driven session for the Animation Sandbox playground mode (OPT-305).
// Drives the production `BoardLayout` against the real `runPipeline` loop:
// dispatched actions flow through the engine, the resulting state replaces
// the hook's state, and the engine's growing `eventLog` flows out through
// the same `game.eventLog` field the scripted hook (OPT-286) exposes.
//
// Two pieces:
//   - `hydrateToGameState`: pure builder that fills engine-only `GameState`
//     fields (`effectStack`, `triggerRegistry`, `pendingPrompt`, etc.) so a
//     scenario's `PartialGameState` can be handed straight to `runPipeline`.
//   - `useSandboxEngineSession`: thin React wrapper that owns the engine
//     state, exposes `dispatch`/`reset`, and projects the engine state into
//     the same `game`/`navigation` shape the scripted provider returns.
//
// Field drift surface: the returned `game` mirrors `SandboxGameSession["game"]`
// so `BoardLayout` consumes either hook without branching. The contract test
// in `__tests__/sandbox-engine-session-provider.test.ts` builds a
// `BoardLayoutProps` value from the projection — the same pattern OPT-286
// established for the scripted provider.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CardData,
  CardDb,
  GameAction,
  GameEvent,
  GameState,
  PlayerState,
  PromptOptions,
} from "@shared/game-types";
import type {
  PartialGameState,
  PartialPlayerState,
} from "@/lib/sandbox/scenarios/types";
import { runPipeline } from "@engine/engine/pipeline";
import type {
  SandboxGameSession,
  SandboxGameSessionGame,
  SandboxGameSessionNavigation,
} from "./sandbox-session-provider";

// ─── Public types ──────────────────────────────────────────────────────

export interface SandboxEngineSessionInput {
  initialState: PartialGameState;
  cardDb: Map<string, CardData>;
}

export interface SandboxEngineSession {
  game: SandboxGameSession["game"];
  navigation: SandboxGameSession["navigation"];
  dispatch: (action: GameAction) => void;
  reset: () => void;
  eventLog: GameEvent[];
}

// ─── Pure builders ─────────────────────────────────────────────────────

export function hydrateToGameState(partial: PartialGameState): GameState {
  return {
    id: "sandbox",
    players: [
      hydratePlayer(partial.players[0]),
      hydratePlayer(partial.players[1]),
    ],
    turn: partial.turn,
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pendingPrompt: null,
    effectStack: [],
    eventLog: [],
    status: "IN_PROGRESS",
    winner: null,
    winReason: null,
  };
}

export function buildEngineSessionGame(
  state: GameState,
  cardDb: CardDb,
  myIndex: 0 | 1,
  sendAction: (action: GameAction) => void,
): SandboxGameSessionGame {
  const oppIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
  const me = state.players[myIndex];
  const opp = state.players[oppIndex];
  const turn = state.turn;
  const activePrompt: PromptOptions | null = state.pendingPrompt?.options ?? null;
  const gameOver =
    state.status === "FINISHED" || state.status === "ABANDONED"
      ? { winner: state.winner, reason: state.winReason ?? "" }
      : null;

  return {
    gameState: state,
    cardDb,
    cardDbReady: true,
    connectionStatus: "connected",
    lastError: null,
    activePrompt,
    gameOver,
    sendAction,
    myIndex,
    me,
    opp,
    turn,
    isMyTurn: turn.activePlayerIndex === myIndex,
    phase: turn.phase,
    battlePhase: turn.battleSubPhase,
    inBattle: !!turn.battleSubPhase,
    matchClosed: false,
    canUndo: false,
    retryConnection: noop,
    connectivityFailed: false,
    eventLog: state.eventLog,
  };
}

// ─── React surface ─────────────────────────────────────────────────────

export function useSandboxEngineSession(
  input: SandboxEngineSessionInput,
): SandboxEngineSession {
  const { initialState, cardDb } = input;
  const myIndex = initialState.myIndex;

  const [state, setState] = useState<GameState>(() =>
    hydrateToGameState(initialState),
  );

  const router = useRouter();
  const handleBackToLobbies = useCallback(() => {
    router.push("/sandbox");
  }, [router]);

  const dispatch = useCallback(
    (action: GameAction) => {
      setState((prev) => runPipeline(prev, action, cardDb, myIndex).state);
    },
    [cardDb, myIndex],
  );

  const reset = useCallback(() => {
    setState(hydrateToGameState(initialState));
  }, [initialState]);

  // Engine consumes a Map; BoardLayout consumes a Record. Project once.
  const cardDbRecord = useMemo<CardDb>(
    () => Object.fromEntries(cardDb) as CardDb,
    [cardDb],
  );

  const game = useMemo(
    () => buildEngineSessionGame(state, cardDbRecord, myIndex, dispatch),
    [state, cardDbRecord, myIndex, dispatch],
  );

  const navigation = useMemo<SandboxGameSessionNavigation>(
    () => ({
      remoteGameStatus: null,
      fallbackConcedeAvailable: false,
      fallbackSubmitting: false,
      fallbackError: null,
      handleFallbackConcede: asyncNoop,
      leavingGame: false,
      leaveError: null,
      handleLeaveGame: asyncNoop,
      handleBackToLobbies: async () => {
        handleBackToLobbies();
      },
    }),
    [handleBackToLobbies],
  );

  return {
    game,
    navigation,
    dispatch,
    reset,
    eventLog: state.eventLog,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────

function hydratePlayer(p: PartialPlayerState): PlayerState {
  return {
    playerId: p.playerId,
    leader: p.leader,
    characters: p.characters,
    stage: p.stage,
    donCostArea: p.donCostArea,
    hand: p.hand,
    deck: p.deck,
    trash: p.trash,
    donDeck: p.donDeck,
    life: p.life,
    removedFromGame: [],
    deckList: [],
    connected: true,
    awayReason: null,
    rejoinDeadlineAt: null,
    sleeveUrl: p.sleeveUrl ?? null,
    donArtUrl: p.donArtUrl ?? null,
  };
}

function noop(): void {}
async function asyncNoop(): Promise<void> {}
