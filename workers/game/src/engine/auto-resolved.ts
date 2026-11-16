/**
 * Event-log record for a prompt the engine resolved without asking, because
 * it had one meaningful answer (an order nobody keeps, top vs bottom of a
 * one-card Life, a single legal value, a "you may" that can do nothing).
 * The player still sees what happened as an "Auto-resolved" log entry.
 *
 * `detail` is public: it must never name a card whose identity is hidden.
 */

import type { GameState, PendingEvent } from "../types.js";
import { findCardInstance } from "./state.js";

export function promptAutoResolvedEvent(
  state: GameState,
  playerIndex: 0 | 1,
  detail: string,
  sourceCardInstanceId?: string,
): PendingEvent {
  const cardId = sourceCardInstanceId
    ? findCardInstance(state, sourceCardInstanceId)?.cardId
    : undefined;
  return {
    type: "PROMPT_AUTO_RESOLVED",
    playerIndex,
    payload: cardId ? { detail, cardId } : { detail },
  };
}

/** "1 card" / "3 cards". */
export function cardCount(count: number): string {
  return `${count} card${count === 1 ? "" : "s"}`;
}
