"use client";

// Fake `useGameSession` for the Animation Sandbox. Drives the production
// `BoardLayout` against a hand-authored scenario without touching the
// WebSocket or worker. Two pieces:
//
//   - `buildSandboxSession`: pure derivation. Tests + the runner (OPT-289)
//     consume it directly.
//   - `useSandboxGameSession`: thin React wrapper that wires up the
//     router-based handleBackToLobbies and memoizes the session. The
//     `SandboxSessionProvider` component is a render-prop convenience.
//
// Field drift surface: this file's session shape must satisfy every field
// `BoardLayout` (and any other production consumer of `useGameSession`)
// reads. See `__tests__/sandbox-session-provider.test.ts` for the contract
// assertion that catches drift at PR time.

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
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
import { applyEvent } from "@/lib/sandbox/apply-event";

// ─── Public types ──────────────────────────────────────────────────────

export interface SandboxSessionInput {
  initialState: PartialGameState;
  events: GameEvent[];
  cardDb: CardDb;
  activePrompt?: PromptOptions | null;
  onAction?: (action: GameAction) => void;
  onBackToLobbies?: () => Promise<void> | void;
}

export interface SandboxGameSession {
  game: SandboxGameSessionGame;
  opponent: SandboxGameSessionOpponent;
  navigation: SandboxGameSessionNavigation;
  endState: SandboxGameSessionEndState;
}

export interface SandboxGameSessionGame {
  gameState: GameState;
  cardDb: CardDb;
  cardDbReady: boolean;
  connectionStatus: "connected";
  lastError: string | null;
  activePrompt: PromptOptions | null;
  gameOver: { winner: 0 | 1 | null; reason: string } | null;
  sendAction: (action: GameAction) => void;
  myIndex: 0 | 1;
  me: PlayerState;
  opp: PlayerState;
  turn: GameState["turn"];
  isMyTurn: boolean;
  phase: string;
  battlePhase: string | null;
  inBattle: boolean;
  matchClosed: false;
  canUndo: false;
  retryConnection: () => void;
  connectivityFailed: false;
  // Sandbox extension: the slice of events the runner has replayed. The
  // production hook surfaces this via `gameState.eventLog`; we mirror it
  // there too, but expose the same array at the top level so OPT-289's
  // runner UI can read it without drilling.
  eventLog: GameEvent[];
}

export interface SandboxGameSessionOpponent {
  opponentAway: false;
  opponentAwayText: string;
  gamePausedForOpponent: false;
  opponentDeadlineRemaining: null;
}

export interface SandboxGameSessionNavigation {
  remoteGameStatus: null;
  fallbackConcedeAvailable: false;
  fallbackSubmitting: false;
  fallbackError: null;
  handleFallbackConcede: () => Promise<void>;
  leavingGame: false;
  leaveError: null;
  handleLeaveGame: () => Promise<void>;
  handleBackToLobbies: () => Promise<void>;
}

export interface SandboxGameSessionEndState {
  endTitle: string;
  endColorClass: string;
  endReason: string;
}

// ─── Pure builder ──────────────────────────────────────────────────────

export function buildSandboxSession(
  input: SandboxSessionInput,
): SandboxGameSession {
  const {
    initialState,
    events,
    cardDb,
    activePrompt = null,
    onAction,
    onBackToLobbies,
  } = input;

  const replayed = events.reduce<PartialGameState>(
    (s, e) => applyEvent(s, e),
    initialState,
  );

  const myIndex = replayed.myIndex;
  const oppIndex: 0 | 1 = myIndex === 0 ? 1 : 0;

  const players: [PlayerState, PlayerState] = [
    hydratePlayer(replayed.players[0]),
    hydratePlayer(replayed.players[1]),
  ];

  const gameState: GameState = {
    id: "sandbox",
    players,
    turn: replayed.turn,
    activeEffects: [],
    prohibitions: [],
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    pendingPrompt: null,
    effectStack: [],
    eventLog: events,
    status: "IN_PROGRESS",
    winner: null,
    winReason: null,
  };

  const me = players[myIndex];
  const opp = players[oppIndex];
  const turn = gameState.turn;
  const isMyTurn = turn.activePlayerIndex === myIndex;
  const phase = turn.phase;
  const battlePhase = turn.battleSubPhase;
  const inBattle = !!battlePhase;

  const sendAction = onAction ?? noop;
  const handleBack = onBackToLobbies ?? asyncNoop;

  return {
    game: {
      gameState,
      cardDb,
      cardDbReady: true,
      connectionStatus: "connected",
      lastError: null,
      activePrompt,
      gameOver: null,
      sendAction,
      myIndex,
      me,
      opp,
      turn,
      isMyTurn,
      phase,
      battlePhase,
      inBattle,
      matchClosed: false,
      canUndo: false,
      retryConnection: noop,
      connectivityFailed: false,
      eventLog: events,
    },
    opponent: {
      opponentAway: false,
      opponentAwayText: "",
      gamePausedForOpponent: false,
      opponentDeadlineRemaining: null,
    },
    navigation: {
      remoteGameStatus: null,
      fallbackConcedeAvailable: false,
      fallbackSubmitting: false,
      fallbackError: null,
      handleFallbackConcede: asyncNoop,
      leavingGame: false,
      leaveError: null,
      handleLeaveGame: asyncNoop,
      handleBackToLobbies: async () => {
        await handleBack();
      },
    },
    endState: {
      endTitle: "MATCH ENDED",
      endColorClass: "text-gb-accent-amber",
      endReason: "",
    },
  };
}

// ─── React surface ─────────────────────────────────────────────────────

export function useSandboxGameSession(
  input: Omit<SandboxSessionInput, "onBackToLobbies">,
): SandboxGameSession {
  const router = useRouter();
  const handleBackToLobbies = useCallback(() => {
    router.push("/sandbox");
  }, [router]);

  return useMemo(
    () => buildSandboxSession({ ...input, onBackToLobbies: handleBackToLobbies }),
    [input, handleBackToLobbies],
  );
}

interface SandboxSessionProviderProps
  extends Omit<SandboxSessionInput, "onBackToLobbies"> {
  children: (session: SandboxGameSession) => React.ReactNode;
}

export function SandboxSessionProvider({
  children,
  ...input
}: SandboxSessionProviderProps) {
  const session = useSandboxGameSession(input);
  return <>{children(session)}</>;
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
