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
  CardDb,
  GameAction,
  GameEvent,
  PlayerState,
  PromptOptions,
} from "@shared/game-types";
import type { CardData, GameState } from "@engine/types";
import type {
  PartialGameState,
  PartialPlayerState,
} from "@/lib/sandbox/scenarios/types";
import { runPipeline } from "@engine/engine/pipeline";
import { surfaceDamageFramePrompt } from "@engine/engine/damage-frames";
import { resumePromptLifecycle } from "@engine/session/prompt-lifecycle";
import { reconcileExecutionContextIdCounter } from "@engine/engine/execution-context";
import { createSandboxExecutionContext } from "@/lib/sandbox/execution-context";
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

export interface SandboxEngineState {
  gameState: GameState;
  promptSequence: number;
}

// ─── Pure builders ─────────────────────────────────────────────────────

export function hydrateToGameState(partial: PartialGameState): GameState {
  // OPT-891: the fixed sandbox context starts at idCounter 0; raise it past any
  // allocator-format ids a scenario authored so the engine never reuses one.
  return reconcileExecutionContextIdCounter({
    id: "sandbox",
    executionContext: createSandboxExecutionContext(),
    players: [
      hydratePlayer(partial.players[0]),
      hydratePlayer(partial.players[1]),
    ],
    turn: partial.turn,
    pregame: null,
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
  });
}

const SANDBOX_LIFECYCLE_SERVICES = {
  drainPregame: (state: GameState) => state,
  advanceStartOfTurn: (state: GameState) => state,
};

/**
 * One sandbox action, routed as GameSession does (OPT-963): a reply to the
 * pending prompt (a Trigger window's Reveal/Skip, a target selection, a
 * choice) goes through the prompt lifecycle; everything else through the
 * pipeline, which rejects prompt replies. A rejected reply leaves the state
 * as it was. The next Trigger window's prompt is surfaced afterwards, as the
 * coordinator does after every action.
 */
export function applySandboxAction(
  gameState: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  myIndex: 0 | 1
): GameState {
  if (gameState.pendingPrompt && action.type !== "CONCEDE") {
    // A stale reply names another prompt (the coordinator's own check).
    const expected = gameState.pendingPrompt.promptId;
    const given = "promptId" in action ? action.promptId : undefined;
    if (expected && given !== expected) return gameState;
    const resumed = resumePromptLifecycle(
      gameState,
      action,
      cardDb,
      SANDBOX_LIFECYCLE_SERVICES
    );
    return resumed.responseRejected
      ? gameState
      : surfaceDamageFramePrompt(resumed.state, cardDb);
  }
  const next = runPipeline(gameState, action, cardDb, myIndex);
  return next.valid ? surfaceDamageFramePrompt(next.state, cardDb) : next.state;
}

export function withSandboxPromptIdentity(
  gameState: GameState,
  promptSequence: number
): SandboxEngineState {
  if (!gameState.pendingPrompt || gameState.pendingPrompt.promptId) {
    return { gameState, promptSequence };
  }

  const nextPromptSequence = promptSequence + 1;
  return {
    gameState: {
      ...gameState,
      pendingPrompt: {
        ...gameState.pendingPrompt,
        promptId: `sandbox-engine-prompt-${nextPromptSequence}`,
      },
    },
    promptSequence: nextPromptSequence,
  };
}

export function buildEngineSessionGame(
  state: GameState,
  cardDb: CardDb,
  myIndex: 0 | 1,
  sendAction: (action: GameAction) => void
): SandboxGameSessionGame {
  const oppIndex: 0 | 1 = myIndex === 0 ? 1 : 0;
  const me = state.players[myIndex];
  const opp = state.players[oppIndex];
  const turn = state.turn;
  const activePrompt: PromptOptions | null =
    state.pendingPrompt?.options ?? null;
  const activePromptId = state.pendingPrompt?.promptId ?? null;
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
    activePromptId,
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
  input: SandboxEngineSessionInput
): SandboxEngineSession {
  const { initialState, cardDb } = input;
  const myIndex = initialState.myIndex;

  const [engineState, setEngineState] = useState<SandboxEngineState>(() => ({
    gameState: hydrateToGameState(initialState),
    promptSequence: 0,
  }));
  const state = engineState.gameState;

  const router = useRouter();
  const handleBackToLobbies = useCallback(() => {
    router.push("/sandbox");
  }, [router]);

  const dispatch = useCallback(
    (action: GameAction) => {
      setEngineState((previous) => {
        const next = applySandboxAction(
          previous.gameState,
          action,
          cardDb,
          myIndex
        );
        return withSandboxPromptIdentity(next, previous.promptSequence);
      });
    },
    [cardDb, myIndex]
  );

  const reset = useCallback(() => {
    setEngineState({
      gameState: hydrateToGameState(initialState),
      promptSequence: 0,
    });
  }, [initialState]);

  // Engine consumes a Map; BoardLayout consumes a Record. Project once.
  const cardDbRecord = useMemo<CardDb>(() => {
    const record: CardDb = {};
    for (const [cardId, data] of cardDb) record[cardId] = data;
    return record;
  }, [cardDb]);

  const game = useMemo(
    () => buildEngineSessionGame(state, cardDbRecord, myIndex, dispatch),
    [state, cardDbRecord, myIndex, dispatch]
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
    [handleBackToLobbies]
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
