import type { ReplacementScanProgress } from "./engine/replacements.js";
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
  LifeCard,
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
  /**
   * Server-only mapping for a blind choice from a hand (OPT-838). The
   * responder sees only the opaque tokens, in this shuffled order; replies are
   * validated against the tokens and translated to instance ids before resume.
   * Never projected to any client.
   */
  blindSlots?: BlindHandSlot[];
}

/** One opaque face-down slot of a blind hand choice and the card it names. */
export interface BlindHandSlot {
  token: string;
  instanceId: string;
}

export type PregamePromptResumeContext = {
  type: "PREGAME_PRIORITY_CHOICE" | "PREGAME_MULLIGAN";
};

/**
 * Exhaustive persisted prompt continuation shapes used by the worker. A
 * string names the frame that owns the prompt (every replacement and damage
 * prompt since OPT-963); the structural ResumeContext is the version 1
 * legacy shape (SAVED-STATE-COMPATIBILITY.md §4).
 */
export type PromptResumeContext =
  | ResumeContext
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
  /** Retained native envelope: saves and later pauses may never downgrade. */
  schemaVersion?: 6 | 7 | 8;
  /** Required for native8: recorded game-wide capability, never upgraded on load. */
  costSemanticsVersion?: 6 | 7 | 8;
  activeEffects: RuntimeActiveEffect[];
  prohibitions: RuntimeProhibition[];
  scheduledActions: RuntimeScheduledAction[];
  oneTimeModifiers: RuntimeOneTimeModifier[];
  triggerRegistry: RuntimeRegisteredTrigger[];
  pendingPrompt: PendingPromptState | null;
  effectStack: EffectStackFrame[];
  /** Historical reader/projection shape only. Runtime debt belongs to EVENT_ACTIVATION frames. */
  pendingEventActivationEvents?: PendingEvent[];
}

/** Alias for the shared PendingGameEvent — used throughout the engine. */
export type PendingEvent = PendingGameEvent;

export interface ExecuteResult {
  state: GameState;
  events: PendingEvent[];
  /** Already matched work released by a synchronous continuation owner. Never persisted here. */
  queuedTriggers?: QueuedTrigger[];
  /**
   * Set only when the rules determined that a Leader took damage while its
   * player had 0 Life (9-2-1-1; battle: 7-1-4-1-1-1). Rule processing reads
   * this as qualifying lethal damage. Nonlethal damage never sets it.
   */
  lethalDamagePlayerIndex?: 0 | 1;
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

/**
 * Where a parked End Phase resumes (OPT-924, rule 6-6-1). Persisted from game
 * state schema version 2; SAVED-STATE-COMPATIBILITY.md §6 is the contract.
 *
 * - `END_OF_YOUR_TURN_WAVE`: 6-6-1-1, the ending player's [End of Your Turn] wave.
 * - `END_OF_OPPONENT_TURN_WAVE`: 6-6-1-1-2, the non-turn player's [End of Your Opponent's Turn] wave.
 * - `TURN_PLAYER_END_OF_TURN`: 6-6-1-2 step 1, the turn player's "at the end of this turn" obligations.
 * - `NON_TURN_PLAYER_END_OF_TURN`: 6-6-1-2 step 2, the non-turn player's.
 * - `LEGACY_SCHEDULED_ACTIONS`: a version 1 (stage-less) frame. Expiry already
 *   ran, the waves are skipped; resume drains `remainingScheduledActions` and
 *   hands off exactly as the version 1 engine did.
 *
 * 6-6-1-3 ("during this turn" expiry) and the 6-6-1-4 hand-off never park, so
 * they have no stage.
 */
export const END_PHASE_STAGES = [
  "END_OF_YOUR_TURN_WAVE",
  "END_OF_OPPONENT_TURN_WAVE",
  "TURN_PLAYER_END_OF_TURN",
  "NON_TURN_PLAYER_END_OF_TURN",
  "LEGACY_SCHEDULED_ACTIONS",
] as const;
export type EndPhaseStage = (typeof END_PHASE_STAGES)[number];

/**
 * The rule 6-6-1-2 step a collected scheduled obligation belongs to: step 1
 * (`TURN_PLAYER`) for the turn player's, step 2 (`NON_TURN_PLAYER`) for the
 * non-turn player's. The rules have no "scheduled action"; the engine maps a
 * `SCHEDULE_ACTION` with timing `END_OF_THIS_TURN` to "at the end of this
 * turn" processing of its controller.
 */
export const END_PHASE_STEPS = ["TURN_PLAYER", "NON_TURN_PLAYER"] as const;
export type EndPhaseStep = (typeof END_PHASE_STEPS)[number];

export interface EndPhaseScheduledAction {
  action: import("./engine/effect-types.js").Action;
  controller: 0 | 1;
  sourceEffectId: string;
  /** Present on every entry of a staged frame; absent on legacy entries. */
  step?: EndPhaseStep;
}

export interface PhaseBoundaryContinuation {
  kind: "END_PHASE";
  endingPlayerIndex: 0 | 1;
  /** Absent only on a version 1 object before conversion; absent means `LEGACY_SCHEDULED_ACTIONS`. */
  stage?: EndPhaseStage;
  remainingScheduledActions: EndPhaseScheduledAction[];
  /**
   * `sourceCardInstanceId:effectBlockId` of every [End of Your Turn] /
   * [End of Your Opponent's Turn] effect already activated in this End Phase
   * (6-6-1-1-1: each activates once). Present on every staged frame.
   */
  activatedWaveEffects?: string[];
}

// ─── OPT-963 typed continuations (game-state schema version 3) ───────────────
//
// Each kind below is one family of paused work owned by one EffectStackFrame
// (SAVED-STATE-COMPATIBILITY.md §2, §8). The frame's base fields are reused:
// `accumulatedEvents` holds events raised while the frame is open and not yet
// published or scanned, `pendingTriggers` holds the ordinary triggers rule
// 8-6-2 defers until the damage processing completes.

/** A single optional replacement offer (REPLACEMENT frame); pops when answered. */
export interface ReplacementContinuation extends ReplacementScanProgress {
  effectId: string;
  targetInstanceId: string;
  event: import("./engine/replacements.js").ReplacementEvent;
}

/** The replacement batch state machine (REPLACEMENT_BATCH frame, OPT-219). */
export interface ReplacementBatchContinuation {
  visitedEffectIds?: string[];
  events?: import("./engine/replacements.js").ReplacementEvent[];
  cause?: "battle" | "effect";
  orderingEffectIds?: string[];
  actionKind: import("./engine/replacements.js").BatchActionKind;
  event: import("./engine/replacements.js").ReplacementEvent;
  /** Every target the caller originally queued for this event. */
  allTargetIds: string[];
  /** Targets already saved by earlier replacements. */
  protectedIds: string[];
  /** Pending matches to resolve, in registration order. */
  pendingMatches: import("./engine/replacements.js").ReplacementBatchMatch[];
  /** Index into pendingMatches of the match being offered or applied. */
  currentMatchIndex: number;
  /** Controller of the action that produced the event. */
  causingController: 0 | 1;
  causingSource?: import("../../../shared/game-types.js").EffectSourceIdentity;
  /** Only used when actionKind === "RETURN_TO_DECK". */
  returnToDeckPosition?: "TOP" | "BOTTOM";
}

/**
 * The Damage Step of a battle paused (BATTLE_DAMAGE frame). The remaining
 * damage count stays on `turn.battle.damagesRemaining`, locked at Damage Step
 * entry (rule 7-1-4-1-1-3); the frame names the battle by `battleId`.
 */
/** Exact battle completion obligation below every End-of-Battle child (native8). */
export interface BattleCompletionContinuation {
  battleId: string;
  attackerInstanceId: string;
  targetInstanceId: string;
  turnPlayerIndex: 0 | 1;
  turnNumber: number;
  aborted: boolean;
}

export type BattleDamageContinuation =
  | {
      stage: "TRIGGER_WINDOW";
      battleId: string;
      damagedPlayerIndex: 0 | 1;
      /** The revealed Life card awaiting the defender's choice (8-6-2-1). */
      lifeCard: LifeCard;
    }
  | {
      stage: "TRIGGER_EFFECT";
      battleId: string;
      damagedPlayerIndex: 0 | 1;
      /** The Life card whose accepted [Trigger] effect resolves in the frames above. */
      lifeCardInstanceId: string;
    }
  | {
      /** OPT-872: the losing Character's K.O. waits on a replacement (rules §7-1-4-1-2, §8-1-3-4-1). */
      stage: "CHARACTER_KO_REPLACEMENT";
      battleId: string;
      targetInstanceId: string;
      /** The optional replacement whose offer paused the step; absent for a mandatory one. */
      replacementEffectId?: string;
      causingPlayerIndex: 0 | 1;
      attackerIsCharacter: boolean;
      /** Set when the offer is answered; absent while it is pending. */
      resolution?: "REPLACED" | "NOT_REPLACED";
    };

/**
 * A DEAL_DAMAGE instruction paused (EFFECT_DAMAGE frame). `parentFrameId`
 * names the chain continuation directly below it (an INTERRUPTED_BY_TRIGGERS
 * frame paused on the DEAL_DAMAGE); absent when the chain already ran on
 * (a lifted version 2 record).
 */
export type EffectDamageContinuation = {
  damagedPlayerIndex: 0 | 1;
  /** Points still to deal after the current one resolves. */
  remainingDamages: number;
  /** Points dealt so far by this instruction (its result count). */
  dealt: number;
  sourceCardInstanceId: string;
  /** Controller of the effect that dealt the damage. */
  controllerIndex: 0 | 1;
  parentFrameId?: string;
} & (
  | { stage: "TRIGGER_WINDOW"; lifeCard: LifeCard }
  | { stage: "TRIGGER_EFFECT"; lifeCardInstanceId: string }
);

export interface ResumeContext {
  effectSourceInstanceId: string;
  controller: 0 | 1;
  /** Clause-scoped description to retain across paused action-chain resumes. */
  effectDescription?: string;
  /** Outer effect owner when the paused action temporarily uses another controller. */
  remainingActionsController?: 0 | 1;
  pausedAction: import("./engine/effect-types.js").Action | null;
  remainingActions: import("./engine/effect-types.js").Action[];
  resultRefs: [string, import("./engine/effect-types.js").EffectResult][];
  validTargets: string[];
  /**
   * Per-owner Rule 3-1-7 ordering choices collected before a RETURN_TO_DECK or
   * (OPT-797) ADD_TO_LIFE_FROM_FIELD batch commits.
   */
  returnToDeckArrangement?: ReturnToDeckArrangement;
  /** Selected field identities waiting for a Life destination choice. */
  fieldToLifeTargetIds?: string[];
  /**
   * OPT-868/OPT-861: a GIVE_DON identity step — the recipient already chosen
   * and the side (owner) whose cost area supplies the DON!!. Sessions saved
   * before this field carry the binding as a `give-don-identity:` marker in
   * validTargets instead; both forms resume.
   */
  giveDonIdentity?: { owner: 0 | 1; recipient: string };
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

export interface EventActivationDebt {
  publication: "AFTER_STACK" | "AFTER_EFFECT";
  sourceZone: "HAND" | "TRASH";
  sourceClass: "EVENT";
  events: PendingEvent[];
}
/** A FIFO resolution cohort; an explicitly open cohort collects future work. */
export interface TriggerGeneration {
  triggers: QueuedTrigger[];
  orderingGroup?: { triggers: QueuedTrigger[]; resolvedTriggerIds: string[] };
}

export interface TriggerExecution {
  generations: TriggerGeneration[];
  /** Open cohort collecting reports until the current older generation finishes.
   * Missing means every stored generation is closed; never infer from position. */
  collectingGenerationIndex?: number;
  /** Removed from its generation before selection; cleared before activation. */
  selectedTrigger?: QueuedTrigger;
}

export interface EffectStackFrame {
  /** Version 5 reader: owns generations independently of suspended effect children. */
  triggerExecution?: TriggerExecution;
  eventActivation?: EventActivationDebt;
  playOverflow?: EffectStackFrame["ruleTrashForPlay"];
  pregameContinuation?: {
    phase: "START_OF_GAME_FX";
    effectFrameId: string;
    controller: 0 | 1;
  };

  /**
   * OPT-940 frame-kind contract (docs/game-engine/SAVED-STATE-COMPATIBILITY.md
   * §2). Names the family of paused work; `phase` still names what the frame
   * waits for. Optional in game-state schema version 1: the reader derives it
   * with `frameKindOf` when absent and rejects a stored value that disagrees.
   * No writer sets it in version 1.
   */
  kind?: import("./session/game-state-schema.js").EffectStackFrameKind;
  /** Notify activation watchers only after the nested Event Main finishes. */
  eventActivationCompletion?: PendingEvent;
  id: string;
  sourceCardInstanceId: string;
  controller: 0 | 1;
  /** Clause-scoped description to retain across persisted continuations. */
  effectDescription?: string;
  /** Controller for the chain after a responder-controlled paused action. */
  remainingActionsController?: 0 | 1;
  effectBlock: import("./engine/effect-types.js").EffectBlock;
  phase: import("../../../shared/game-types.js").EffectStackPhase;

  // Action chain state
  pausedAction: import("./engine/effect-types.js").Action | null;
  remainingActions: import("./engine/effect-types.js").Action[];
  resultRefs: [string, import("./engine/effect-types.js").EffectResult][];
  validTargets: string[];
  /** Persisted per-owner Rule 3-1-7 ordering progress for RETURN_TO_DECK and ADD_TO_LIFE_FROM_FIELD. */
  returnToDeckArrangement?: ReturnToDeckArrangement;
  /** Selected field identities waiting for a Life destination choice. */
  fieldToLifeTargetIds?: string[];
  /**
   * OPT-868/OPT-861: a GIVE_DON identity step — the recipient already chosen
   * and the side (owner) whose cost area supplies the DON!!. Sessions saved
   * before this field carry the binding as a `give-don-identity:` marker in
   * validTargets instead; both forms resume.
   */
  giveDonIdentity?: { owner: 0 | 1; recipient: string };
  /** Result of the action that paused before this continuation. */
  priorActionSucceeded?: boolean;
  /** AND transaction waiting for all snapshot-locked target choices. */
  simultaneousGroup?: import("./engine/effect-resolver/simultaneous.js").SimultaneousGroupPlan;
  /** End-phase work parked below a scheduled effect's prompt frame. */
  phaseBoundaryContinuation?: PhaseBoundaryContinuation;
  /** OPT-963 REPLACEMENT frame: the pending optional replacement offer. */
  replacement?: ReplacementContinuation;
  /** OPT-963 REPLACEMENT_BATCH frame: the batch state machine. */
  replacementBatch?: ReplacementBatchContinuation;
  /** OPT-963 BATTLE_DAMAGE frame: the paused Damage Step. */
  battleDamage?: BattleDamageContinuation;
  battleCompletion?: BattleCompletionContinuation;
  /** OPT-963 EFFECT_DAMAGE frame: the paused DEAL_DAMAGE instruction. */
  effectDamage?: EffectDamageContinuation;

  // Cost tracking
  costs: import("./engine/effect-types.js").Cost[];
  currentCostIndex: number;
  costsPaid: boolean;
  oncePerTurnMarked: boolean;
  costResultRefs: [string, { targetInstanceIds: string[]; count: number }][];
  /** Cost mutations staged off the authoritative root until every cost pays. */
  costTransactionState?: import("./engine/effect-resolver/cost/transaction.js").CostTransactionState;
  /** Immutable committed root expected before applying the staged overlay. */
  costExpectedRoot?: import("./engine/effect-resolver/cost/transaction.js").CostTransactionState;
  /** Validated response parked while an optional cost-exit replacement prompts. */
  costReplacementAction?: GameAction;
  /** Prevents a declined replacement from being offered again on resume. */
  costReplacementChecked?: boolean;
  /** Final result of this exact COST owner's replacement scan. Absent is
   * waiting/legacy unknown, never implicit acceptance. Reader-first: producers
   * remain disabled until the outcome-aware reader is deployed. */
  costReplacementResolution?: "REPLACED" | "NOT_REPLACED";

  // Queued triggers waiting to resolve after this frame
  pendingTriggers: QueuedTrigger[];

  // Simultaneous triggers awaiting player ordering choice
  simultaneousTriggers: QueuedTrigger[];

  // Full ordering group retained while chosen effects and nested prompts resolve
  triggerOrderingGroup?: {
    triggers: QueuedTrigger[];
    resolvedTriggerIds: string[];
  };

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
  // Hand identity locked while the controller chooses the rule-trash victim.
  namedPlayCostTargetId?: string;
}

export interface QueuedSourceSnapshot {
  instanceId: string;
  cardId: string;
  controller: 0 | 1;
  effectBlockId: string;
}

export interface QueuedTrigger {
  sourceSnapshot?: QueuedSourceSnapshot;
  sourceCardInstanceId: string;
  orderingId?: string;
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
