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
  ruleTrashForPlay?: { playTargetId: string };
}

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
  ruleTrashForPlay?: { playTargetId: string };
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
