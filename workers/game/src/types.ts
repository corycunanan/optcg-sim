// Re-export all shared game types.
// Worker-only types and engine-internal types are defined below.

export type {
  Zone, CardInstance, LifeCard, DonInstance,
  BattleContext, BattleSubPhase,
  Phase, PerformedAction, TurnState,
  PlayerState,
  ActiveEffect, ActiveProhibition, ScheduledActionEntry, ActiveOneTimeModifier, RegisteredTrigger,
  GameEventType, GameEvent, GameEventPayloadMap, PendingGameEvent,
  GameState,
  CardData, KeywordSet,
  GameAction,
  ServerMessage, ClientMessage,
  PromptType, PromptOptions,
  PendingPromptState,
  EffectStackPhase,
  EffectStackFrame as SharedEffectStackFrame,
  QueuedTrigger as SharedQueuedTrigger,
} from "../../../shared/game-types.js";

import type { CardData, GameState, PendingPromptState, PendingGameEvent } from "../../../shared/game-types.js";

// ─── Engine-internal types ────────────────────────────────────────────────────

/** Alias for the shared PendingGameEvent — used throughout the engine. */
export type PendingEvent = PendingGameEvent;

export interface ExecuteResult {
  state: GameState;
  events: PendingEvent[];
  damagedPlayerIndex?: 0 | 1; // set when a leader takes damage (for defeat check)
  pendingPrompt?: PendingPromptState;
}

export interface ResumeContext {
  effectSourceInstanceId: string;
  controller: 0 | 1;
  pausedAction: import("./engine/effect-types.js").Action | null;
  remainingActions: import("./engine/effect-types.js").Action[];
  resultRefs: [string, unknown][];
  validTargets: string[];
  // Rule 3-7-6-1: when an effect-driven play hits a full board, the prompt asks
  // the controller to pick one of their own Characters to trash before the play
  // resolves. On resume, the chosen victim is rule-trashed (no On K.O. triggers
  // per 3-7-6-1-1) and the original play is re-entered with playTargetId as
  // preselected. Only set when the pending prompt is this overflow choice.
  // OPT-114 commit 3: when the overflow happens mid-batch in a multi-target
  // PLAY_CARD, `batch` carries the remaining frames so resume continues the
  // macro-expansion after the victim is trashed and the current card is placed.
  ruleTrashForPlay?: {
    playTargetId: string;
    batch?: {
      remainingTargetIds: string[];
      remaining: { ACTIVE: number; RESTED: number };
      playedSoFar: string[];
      forcedFirstState?: "ACTIVE" | "RESTED";
    };
  };
  // OPT-114: when a PLAY_CARD with entry_state="PLAYER_CHOICE" pauses to ask the
  // controller which state (ACTIVE/RESTED) to play the current frame in, this
  // carries the pending target instanceId, remaining capacity per state, and
  // the remaining frames so the resume can continue the macro-expansion.
  stateDistributionForPlay?: {
    pendingTargetId: string;
    remainingTargetIds: string[];
    remaining: { ACTIVE: number; RESTED: number };
    playedSoFar: string[];
  };
  // OPT-172: pause-and-return marker for rule 6-2 trigger interleaving.
  batchResumeMarker?: BatchResumeMarker;
}

// ─── OPT-172: batch-trigger pause marker ─────────────────────────────────────

/**
 * Identifies which multi-target action to re-invoke after a mid-batch trigger
 * drain, plus the remaining-batch state to continue with. Rule 6-2: triggered
 * effect from frame N must fully resolve before frame N+1 begins.
 *
 * Kinds are added incrementally per commits 2–4 of OPT-172:
 *   - PLAY_CARD  (commit 2)  ON_PLAY triggers between plays
 *   - KO         (commit 3)  ON_KO triggers between KOs
 *   - SET_REST   (commit 4)  ON_REST triggers between rests
 *
 * Note: TRASH_CARD intentionally has no marker — per rule 10-2-1-3, TRASH
 * emits CARD_TRASHED (not CARD_KO). No ON_KO keyword trigger listens for it,
 * and the ANY_CHARACTER_TRASHED / OPPONENT_CHARACTER_TRASHED custom triggers
 * added in OPT-235 are matched at the pipeline's Step-5 scan rather than as
 * interleaved auto triggers between frames, so a multi-target TRASH batch
 * still can't queue an in-batch trigger drain.
 */
export type BatchResumeMarker =
  | {
      kind: "PLAY_CARD";
      pausedAction: import("./engine/effect-types.js").Action;
      resumeFrame: {
        remainingTargetIds: string[];
        remaining: { ACTIVE: number; RESTED: number };
        playedSoFar: string[];
        forcedFirstState?: "ACTIVE" | "RESTED";
      };
    }
  | {
      kind: "KO";
      pausedAction: import("./engine/effect-types.js").Action;
      remainingTargetIds: string[];
      koedSoFar: string[];
    }
  | {
      kind: "SET_REST";
      pausedAction: import("./engine/effect-types.js").Action;
      remainingTargetIds: string[];
      restedSoFar: string[];
    };

// ─── Typed Effect Stack (worker-side, casts shared unknown fields) ────────────

export interface EffectStackFrame {
  id: string;
  sourceCardInstanceId: string;
  controller: 0 | 1;
  effectBlock: import("./engine/effect-types.js").EffectBlock;
  phase: import("../../../shared/game-types.js").EffectStackPhase;

  // Action chain state
  pausedAction: import("./engine/effect-types.js").Action | null;
  remainingActions: import("./engine/effect-types.js").Action[];
  resultRefs: [string, unknown][];
  validTargets: string[];

  // Cost tracking
  costs: import("./engine/effect-types.js").Cost[];
  currentCostIndex: number;
  costsPaid: boolean;
  oncePerTurnMarked: boolean;
  costResultRefs: [string, { targetInstanceIds: string[]; count: number }][];

  // Queued triggers waiting to resolve after this frame
  pendingTriggers: QueuedTrigger[];

  // Simultaneous triggers awaiting player ordering choice
  simultaneousTriggers: QueuedTrigger[];

  // Events accumulated during partial execution
  accumulatedEvents: PendingEvent[];

  // OPT-171: carries the pending rule-3-7-6-1 overflow info through frame
  // persistence so the resume handler can trash the chosen victim and re-enter
  // the original PLAY_CARD with playTargetId as preselected.
  // OPT-114 commit 3: `batch` extends this to multi-target mid-batch overflow.
  ruleTrashForPlay?: {
    playTargetId: string;
    batch?: {
      remainingTargetIds: string[];
      remaining: { ACTIVE: number; RESTED: number };
      playedSoFar: string[];
      forcedFirstState?: "ACTIVE" | "RESTED";
    };
  };
  // OPT-114: mirror of ResumeContext.stateDistributionForPlay so the per-frame
  // state-choice prompt survives disconnect/stack persistence.
  stateDistributionForPlay?: {
    pendingTargetId: string;
    remainingTargetIds: string[];
    remaining: { ACTIVE: number; RESTED: number };
    playedSoFar: string[];
  };
  // OPT-172: mirror of ActionResult.pendingBatchTriggers so the pending
  // batch-resume survives stack persistence through disconnects.
  batchResumeMarker?: BatchResumeMarker;
}

export interface QueuedTrigger {
  sourceCardInstanceId: string;
  controller: 0 | 1;
  effectBlock: import("./engine/effect-types.js").EffectBlock;
  triggeringEvent: PendingGameEvent;
}

// ─── Init payload (Next.js → DO on game start) ────────────────────────────────

export interface GameInitPayload {
  gameId: string;
  player1: PlayerInitData;
  player2: PlayerInitData;
  format: string;
}

export interface PlayerInitData {
  userId: string;
  deck: DeckCardData[];
  leader: DeckCardData;
  sleeveUrl?: string | null;
  donArtUrl?: string | null;
  /** Fixed card order for testing: life and hand card assignments */
  testOrder?: { life: string[]; hand: string[] } | null;
}

export interface DeckCardData {
  cardId: string;
  quantity: number;
  cardData: CardData;
}

// ─── Worker environment bindings ─────────────────────────────────────────────

export interface Env {
  GAME_SESSION: DurableObjectNamespace;
  NEXTJS_URL: string;
  GAME_WORKER_SECRET: string;
}
