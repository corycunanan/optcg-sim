// Re-export all shared game types.
// Worker-only types and engine-internal types are defined below.

export type {
  Zone, CardInstance, LifeCard, DonInstance,
  BattleContext, BattleSubPhase,
  Phase, PerformedAction, TurnState,
  PlayerState,
  ActiveEffect, ActiveProhibition, ScheduledActionEntry, ActiveOneTimeModifier, RegisteredTrigger,
  EngineLimitDiagnostic, EngineTerminalOutcome,
  EngineExecutionContext,
  GameEventType,
  GameEvent,
  GameEventPayloadMap,
  PendingGameEvent,
  KeywordSet,
  GameAction,
  ServerMessage,
  ClientMessage,
  PromptType,
  PromptOptions,
  EffectStackPhase,
  EffectStackFrame as SharedEffectStackFrame,
  QueuedTrigger as SharedQueuedTrigger,
} from "../../../shared/game-types.js";
export type { LobbyMode, PregameMode } from "../../../shared/game-init.js";

import type {
  CardData as SharedCardData,
  GameAction,
  GameState as SharedGameState,
  PendingGameEvent,
  PendingPromptState as SharedPendingPromptState,
} from "../../../shared/game-types.js";
import type {
  DeckCardData as SharedDeckCardData,
  GameInitPayload as SharedGameInitPayload,
  PlayerInitData as SharedPlayerInitData,
} from "../../../shared/game-init.js";
import type {
  EffectSchema,
  RuntimeActiveEffect,
  RuntimeOneTimeModifier,
  RuntimeProhibition,
  RuntimeRegisteredTrigger,
  RuntimeScheduledAction,
} from "./engine/effect-types.js";

// ─── Engine-internal types ────────────────────────────────────────────────────

/** Card data after the game-init/schema boundary has validated effect schemas. */
export interface CardData extends Omit<SharedCardData, "effectSchema"> {
  effectSchema: EffectSchema | null;
}

/** Prompt state persisted and executed inside the worker after validation. */
export interface PendingPromptState extends Omit<
  SharedPendingPromptState,
  "resumeContext"
> {
  resumeContext: PromptResumeContext;
}

export type PregamePromptResumeContext = {
  type: "PREGAME_PRIORITY_CHOICE" | "PREGAME_MULLIGAN";
};

/** Exhaustive persisted prompt continuation shapes used by the worker. */
export type PromptResumeContext =
  | ResumeContext
  | import("./engine/replacements.js").ReplacementBatchResumeContext
  | import("./engine/replacements.js").ReplacementResumeContext
  | PregamePromptResumeContext
  | string
  | null;

/**
 * Worker-owned state replaces shared transport stubs with executable runtime
 * contracts. It remains structurally assignable to the shared public state.
 */
export interface GameState extends Omit<
  SharedGameState,
  | "activeEffects"
  | "prohibitions"
  | "scheduledActions"
  | "oneTimeModifiers"
  | "triggerRegistry"
  | "pendingPrompt"
  | "effectStack"
> {
  activeEffects: RuntimeActiveEffect[];
  prohibitions: RuntimeProhibition[];
  scheduledActions: RuntimeScheduledAction[];
  oneTimeModifiers: RuntimeOneTimeModifier[];
  triggerRegistry: RuntimeRegisteredTrigger[];
  pendingPrompt: PendingPromptState | null;
  effectStack: EffectStackFrame[];
}

/** Alias for the shared PendingGameEvent — used throughout the engine. */
export type PendingEvent = PendingGameEvent;

export interface ExecuteResult {
  state: GameState;
  events: PendingEvent[];
  damagedPlayerIndex?: 0 | 1; // set when a leader takes damage (for defeat check)
  pendingPrompt?: PendingPromptState;
}

export interface ReturnToDeckArrangement {
  targetIds: string[];
  orderedOwnerGroups: Array<{
    owner: 0 | 1;
    targetIds: string[];
  }>;
  remainingOwners: Array<0 | 1>;
}

export interface PhaseBoundaryContinuation {
  kind: "END_PHASE";
  endingPlayerIndex: 0 | 1;
  remainingScheduledActions: Array<{
    action: import("./engine/effect-types.js").Action;
    controller: 0 | 1;
    sourceEffectId: string;
  }>;
}

export interface ResumeContext {
  effectSourceInstanceId: string;
  controller: 0 | 1;
  /** Outer effect owner when the paused action temporarily uses another controller. */
  remainingActionsController?: 0 | 1;
  pausedAction: import("./engine/effect-types.js").Action | null;
  remainingActions: import("./engine/effect-types.js").Action[];
  resultRefs: [string, import("./engine/effect-types.js").EffectResult][];
  validTargets: string[];
  /** Per-owner Rule 3-1-7 ordering choices collected before a deck-return batch commits. */
  returnToDeckArrangement?: ReturnToDeckArrangement;
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
      queuedTriggers?: QueuedTrigger[];
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
    queuedTriggers?: QueuedTrigger[];
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
      pausedAction: import("./engine/effect-types.js").ActionOf<"PLAY_CARD">;
      resumeFrame: {
        remainingTargetIds: string[];
        remaining: { ACTIVE: number; RESTED: number };
        playedSoFar: string[];
        forcedFirstState?: "ACTIVE" | "RESTED";
      };
    }
  | {
      kind: "KO";
      pausedAction: import("./engine/effect-types.js").ActionOf<"KO">;
      remainingTargetIds: string[];
      koedSoFar: string[];
    }
  | {
      kind: "SET_REST";
      pausedAction: import("./engine/effect-types.js").ActionOf<"SET_REST">;
      remainingTargetIds: string[];
      restedSoFar: string[];
    };

// ─── Typed Effect Stack (worker-side, casts shared unknown fields) ────────────

export interface EffectStackFrame {
  id: string;
  sourceCardInstanceId: string;
  controller: 0 | 1;
  /** Controller for the chain after a responder-controlled paused action. */
  remainingActionsController?: 0 | 1;
  effectBlock: import("./engine/effect-types.js").EffectBlock;
  phase: import("../../../shared/game-types.js").EffectStackPhase;

  // Action chain state
  pausedAction: import("./engine/effect-types.js").Action | null;
  remainingActions: import("./engine/effect-types.js").Action[];
  resultRefs: [string, import("./engine/effect-types.js").EffectResult][];
  validTargets: string[];
  /** Persisted per-owner Rule 3-1-7 ordering progress for RETURN_TO_DECK. */
  returnToDeckArrangement?: ReturnToDeckArrangement;
  /** Result of the action that paused before this continuation. */
  priorActionSucceeded?: boolean;
  /** AND transaction waiting for all snapshot-locked target choices. */
  simultaneousGroup?: import("./engine/effect-resolver/simultaneous.js").SimultaneousGroupPlan;
  /** Outer replacement batch to continue after a nested substitute prompt. */
  replacementBatchContinuation?: import("./engine/replacements.js").ReplacementBatchResumeContext;
  /** End-phase work parked below a scheduled effect's prompt frame. */
  phaseBoundaryContinuation?: PhaseBoundaryContinuation;

  // Cost tracking
  costs: import("./engine/effect-types.js").Cost[];
  currentCostIndex: number;
  costsPaid: boolean;
  oncePerTurnMarked: boolean;
  costResultRefs: [string, { targetInstanceIds: string[]; count: number }][];
  /** Cost mutations staged off the authoritative root until every cost pays. */
  costTransactionState?: import("./engine/effect-resolver/cost/transaction.js").CostTransactionState;
  /** Validated response parked while an optional cost-exit replacement prompts. */
  costReplacementAction?: GameAction;
  /** Prevents a declined replacement from being offered again on resume. */
  costReplacementChecked?: boolean;

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
      queuedTriggers?: QueuedTrigger[];
    };
  };
  // OPT-114: mirror of ResumeContext.stateDistributionForPlay so the per-frame
  // state-choice prompt survives disconnect/stack persistence.
  stateDistributionForPlay?: {
    pendingTargetId: string;
    remainingTargetIds: string[];
    remaining: { ACTIVE: number; RESTED: number };
    playedSoFar: string[];
    queuedTriggers?: QueuedTrigger[];
  };
  // OPT-172: mirror of ActionResult.pendingBatchTriggers so the pending
  // batch-resume survives stack persistence through disconnects.
  batchResumeMarker?: BatchResumeMarker;
  // OPT-371: true while a PLACE_FROM_TRASH_TO_DECK cost frame is awaiting the
  // ARRANGE_TOP_CARDS ordering response (validTargets = the chosen cards).
  // Guards against arrange packets arriving during the select stage, where
  // validTargets still holds every candidate.
  costArrangeStage?: boolean;
}

export interface QueuedTrigger {
  sourceCardInstanceId: string;
  groupSourceInstanceId?: string;
  controller: 0 | 1;
  effectBlock: import("./engine/effect-types.js").EffectBlock;
  triggeringEvent: PendingGameEvent;
}

// ─── Init payload (Next.js → DO on game start) ────────────────────────────────

/** Worker-specialized views of the shared wire contract after schema validation. */
export type GameInitPayload = SharedGameInitPayload<CardData>;
export type PlayerInitData = SharedPlayerInitData<CardData>;
export type DeckCardData = SharedDeckCardData<CardData>;

// ─── Worker environment bindings ─────────────────────────────────────────────

export interface Env {
  GAME_SESSION: DurableObjectNamespace;
  USER_CHANNEL: DurableObjectNamespace;
  NEXTJS_URL: string;
  GAME_WORKER_SECRET: string;
  LOG_URL?: string;
}
