import type { ActionType } from "../effect-types.js";

/**
 * How an action's handler lets the player choose its targets (OPT-893).
 *
 * - `TARGET_COUNT`: the handler asks `needsPlayerTargetSelection(action.target, …)`
 *   and prompts through `buildSelectTargetPrompt`, so the SELECT_TARGET bounds
 *   come from the target's count (`targetPromptCountMin`). An omitted count
 *   there yields countMin 0: the selection prompt already is the decline.
 * - `OTHER`: the handler never builds a SELECT_TARGET from `action.target`'s
 *   count (it acts on a fixed pool, takes an amount from params, or builds its
 *   own amount-based prompt). An omitted count never lets the player choose 0,
 *   so action-level `optional` is the only way to decline.
 *
 * Every ActionType must be classified, so adding one fails the type check
 * until it is placed here. `target-prompt-actions.test.ts` re-derives the
 * `TARGET_COUNT` set from the handler source registered in ACTION_HANDLERS and
 * fails on any drift.
 */
export type TargetPromptKind = "TARGET_COUNT" | "OTHER";

export const ACTION_TARGET_PROMPT_KIND = {
  // Card movement
  DRAW: "OTHER",
  SEARCH_DECK: "OTHER",
  TRASH_CARD: "TARGET_COUNT",
  KO: "TARGET_COUNT",
  RETURN_TO_HAND: "TARGET_COUNT",
  RETURN_TO_DECK: "TARGET_COUNT",
  PLAY_CARD: "TARGET_COUNT",
  ADD_TO_LIFE: "TARGET_COUNT",
  MILL: "OTHER",
  REVEAL: "OTHER",
  FULL_DECK_SEARCH: "OTHER",
  DECK_SCRY: "OTHER",
  SEARCH_TRASH_THE_REST: "OTHER",
  SEARCH_AND_PLAY: "OTHER",
  PLACE_HAND_TO_DECK: "OTHER",
  HAND_WHEEL: "OTHER",
  REVEAL_HAND: "OTHER",
  SHUFFLE_DECK: "OTHER",
  // Power & stats
  MODIFY_POWER: "TARGET_COUNT",
  SET_BASE_POWER: "TARGET_COUNT",
  MODIFY_COST: "TARGET_COUNT",
  SET_POWER_TO_ZERO: "TARGET_COUNT",
  SWAP_BASE_POWER: "TARGET_COUNT",
  // Prompts on params.source_target, not action.target.
  COPY_POWER: "OTHER",
  SET_COST: "TARGET_COUNT",
  // Keywords
  GRANT_KEYWORD: "TARGET_COUNT",
  NEGATE_EFFECTS: "TARGET_COUNT",
  // DON!!
  GIVE_DON: "TARGET_COUNT",
  RETURN_DON_TO_DECK: "OTHER",
  ADD_DON_FROM_DECK: "OTHER",
  SET_DON_ACTIVE: "OTHER",
  REST_DON: "OTHER",
  REDISTRIBUTE_DON: "OTHER",
  FORCE_OPPONENT_DON_RETURN: "OTHER",
  REST_OPPONENT_DON: "OTHER",
  GIVE_OPPONENT_DON_TO_OPPONENT: "TARGET_COUNT",
  DISTRIBUTE_DON: "TARGET_COUNT",
  RETURN_ATTACHED_DON_TO_COST: "OTHER",
  // State change
  SET_ACTIVE: "TARGET_COUNT",
  SET_REST: "TARGET_COUNT",
  APPLY_PROHIBITION: "TARGET_COUNT",
  REMOVE_PROHIBITION: "OTHER",
  // Meta / flow
  PLAYER_CHOICE: "OTHER",
  OPPONENT_CHOICE: "OTHER",
  CHOOSE_VALUE: "OTHER",
  WIN_GAME: "OTHER",
  OPPONENT_ACTION: "OTHER",
  EXTRA_TURN: "OTHER",
  SCHEDULE_ACTION: "OTHER",
  // Life
  TURN_LIFE_FACE_UP: "OTHER",
  TURN_LIFE_FACE_DOWN: "OTHER",
  TURN_ALL_LIFE_FACE_DOWN: "OTHER",
  LIFE_SCRY: "TARGET_COUNT",
  REORDER_ALL_LIFE: "OTHER",
  ADD_TO_LIFE_FROM_DECK: "OTHER",
  ADD_TO_LIFE_FROM_HAND: "TARGET_COUNT",
  ADD_TO_LIFE_FROM_FIELD: "TARGET_COUNT",
  PLAY_FROM_LIFE: "OTHER",
  LIFE_TO_HAND: "OTHER",
  TRASH_FROM_LIFE: "OTHER",
  DRAIN_LIFE_TO_THRESHOLD: "OTHER",
  LIFE_CARD_TO_DECK: "OTHER",
  TRASH_FACE_UP_LIFE: "OTHER",
  // Battle
  REDIRECT_ATTACK: "TARGET_COUNT",
  DEAL_DAMAGE: "OTHER",
  SELF_TAKE_DAMAGE: "OTHER",
  // Effect / meta
  ACTIVATE_EVENT_FROM_HAND: "TARGET_COUNT",
  ACTIVATE_EVENT_FROM_TRASH: "TARGET_COUNT",
  REUSE_EFFECT: "OTHER",
  NEGATE_TRIGGER_TYPE: "OTHER",
  GRANT_ATTRIBUTE: "OTHER",
  // Builds its own amount-based prompt: an explicit up_to / any_number target
  // count allows 0, an omitted count uses params.amount with countMin = max.
  TRASH_FROM_HAND: "OTHER",
  RETURN_HAND_TO_DECK: "OTHER",
  GRANT_COUNTER: "OTHER",
  APPLY_ONE_TIME_MODIFIER: "OTHER",
  PLAY_SELF: "OTHER",
} as const satisfies Record<ActionType, TargetPromptKind>;

/** Whether this action's handler prompts SELECT_TARGET with the target's count. */
export function promptsFromTargetCount(type: ActionType): boolean {
  return ACTION_TARGET_PROMPT_KIND[type] === "TARGET_COUNT";
}
