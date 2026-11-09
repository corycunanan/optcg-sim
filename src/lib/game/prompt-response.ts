import type { GameAction } from "@shared/game-types";

/** Action types that answer the pending prompt rather than start a new action. */
export const PROMPT_RESPONSE_TYPES: ReadonlySet<GameAction["type"]> = new Set<
  GameAction["type"]
>([
  "ARRANGE_TOP_CARDS",
  "PLAYER_CHOICE",
  "REDISTRIBUTE_DON",
  "REVEAL_TRIGGER",
  "SELECT_TARGET",
  "PASS",
]);

/**
 * Stamps a prompt reply with the id of the prompt it answers, as the session
 * requires (OPT-963). The board sends replies without one; the live socket
 * and the sandbox both add it here. Other actions pass through unchanged.
 */
export function withPromptId(
  action: GameAction,
  promptId: string | null | undefined
): GameAction {
  return promptId && PROMPT_RESPONSE_TYPES.has(action.type)
    ? ({ ...action, promptId } as GameAction)
    : action;
}
