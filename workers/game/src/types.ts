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
} from "../../../shared/game-types.js";

import type { CardData, GameEventType, GameState } from "../../../shared/game-types.js";

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
}

export interface DeckCardData {
  cardId: string;
  quantity: number;
  cardData: CardData;
}
