// Re-export all shared game types.
// Worker-only types and engine-internal types are defined below.

export type {
  Zone, CardInstance, LifeCard, DonInstance,
  BattleContext, BattleSubPhase,
  Phase, PerformedAction, TurnState,
  PlayerState,
  ActiveEffect, ActiveProhibition, ScheduledActionEntry, ActiveOneTimeModifier, RegisteredTrigger,
  GameEventType, GameEvent,
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

import type { CardData, GameEventType, GameState, PendingPromptState } from "../../../shared/game-types.js";

// ─── Engine-internal types ────────────────────────────────────────────────────

export interface PendingEvent {
  type: GameEventType;
  playerIndex?: 0 | 1;
  payload?: Record<string, unknown>;
}

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

  // Queued triggers waiting to resolve after this frame
  pendingTriggers: QueuedTrigger[];

  // Simultaneous triggers awaiting player ordering choice
  simultaneousTriggers: QueuedTrigger[];

  // Events accumulated during partial execution
  accumulatedEvents: PendingEvent[];
}

export interface QueuedTrigger {
  sourceCardInstanceId: string;
  controller: 0 | 1;
  effectBlock: import("./engine/effect-types.js").EffectBlock;
  triggeringEvent: PendingEvent;
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
  /** Dev-only: move all cards with SEARCH_DECK effects to the top of the deck before dealing */
  debug?: { searchersFirst?: boolean };
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
