import type { Action, ActionType, EffectSchema } from "./effect-types.js";

/**
 * Authored action types with at least one real resolver/pipeline execution
 * test. Adding a new authored action requires adding its execution regression
 * before the inventory gate will pass.
 */
export const EXECUTED_ACTION_TYPES = [
  "ACTIVATE_EVENT_FROM_HAND",
  "ACTIVATE_EVENT_FROM_TRASH",
  "ADD_DON_FROM_DECK",
  "ADD_TO_LIFE",
  "ADD_TO_LIFE_FROM_DECK",
  "ADD_TO_LIFE_FROM_FIELD",
  "ADD_TO_LIFE_FROM_HAND",
  "APPLY_ONE_TIME_MODIFIER",
  "APPLY_PROHIBITION",
  "COPY_POWER",
  "CHOOSE_VALUE",
  "DEAL_DAMAGE",
  "DECK_SCRY",
  "DISTRIBUTE_DON",
  "DRAIN_LIFE_TO_THRESHOLD",
  "DRAW",
  "EXTRA_TURN",
  "FORCE_OPPONENT_DON_RETURN",
  "FULL_DECK_SEARCH",
  "GIVE_DON",
  "GIVE_OPPONENT_DON_TO_OPPONENT",
  "GRANT_ATTRIBUTE",
  "GRANT_KEYWORD",
  "HAND_WHEEL",
  "KO",
  "LIFE_CARD_TO_DECK",
  "LIFE_SCRY",
  "LIFE_TO_HAND",
  "MILL",
  "MODIFY_COST",
  "MODIFY_POWER",
  "NEGATE_EFFECTS",
  "NEGATE_TRIGGER_TYPE",
  "OPPONENT_ACTION",
  "OPPONENT_CHOICE",
  "PLACE_HAND_TO_DECK",
  "PLAYER_CHOICE",
  "PLAY_CARD",
  "PLAY_FROM_LIFE",
  "PLAY_SELF",
  "REDIRECT_ATTACK",
  "REDISTRIBUTE_DON",
  "REORDER_ALL_LIFE",
  "REST_DON",
  "REST_OPPONENT_DON",
  "RETURN_DON_TO_DECK",
  "RETURN_HAND_TO_DECK",
  "RETURN_TO_DECK",
  "RETURN_TO_HAND",
  "REUSE_EFFECT",
  "REVEAL",
  "REVEAL_HAND",
  "SCHEDULE_ACTION",
  "SEARCH_AND_PLAY",
  "SEARCH_DECK",
  "SEARCH_TRASH_THE_REST",
  "SELF_TAKE_DAMAGE",
  "SET_ACTIVE",
  "SET_BASE_POWER",
  "SET_COST",
  "SET_DON_ACTIVE",
  "SET_POWER_TO_ZERO",
  "SET_REST",
  "SHUFFLE_DECK",
  "SWAP_BASE_POWER",
  "TRASH_CARD",
  "TRASH_FACE_UP_LIFE",
  "TRASH_FROM_HAND",
  "TRASH_FROM_LIFE",
  "TURN_ALL_LIFE_FACE_DOWN",
  "TURN_LIFE_FACE_DOWN",
  "TURN_LIFE_FACE_UP",
  "WIN_GAME",
] as const satisfies readonly ActionType[];

function walkActions(
  actions: Action[] | undefined,
  counts: Map<ActionType, number>
): void {
  for (const action of actions ?? []) {
    counts.set(action.type, (counts.get(action.type) ?? 0) + 1);
    const params = action.params;
    if (params?.action && typeof params.action === "object") {
      walkActions([params.action as Action], counts);
    }
    if (Array.isArray(params?.options)) {
      for (const option of params.options) {
        if (Array.isArray(option)) walkActions(option as Action[], counts);
        else if (
          option &&
          typeof option === "object" &&
          Array.isArray((option as { actions?: unknown }).actions)
        ) {
          walkActions((option as { actions: Action[] }).actions, counts);
        }
      }
    }
  }
}

export function collectAuthoredActionCounts(
  schemas: Readonly<Record<string, EffectSchema>>
): Map<ActionType, number> {
  const counts = new Map<ActionType, number>();
  for (const schema of Object.values(schemas)) {
    for (const block of schema.effects) {
      walkActions(block.actions, counts);
      walkActions(block.replacement_actions, counts);
    }
    for (const ruleModification of schema.rule_modifications ?? []) {
      if (ruleModification.rule_type === "START_OF_GAME_EFFECT") {
        walkActions(ruleModification.actions, counts);
      }
    }
  }
  return counts;
}

export interface ActionCoverageInventory {
  authoredUses: number;
  authoredTypes: ActionType[];
  handledTypes: ActionType[];
  executedTypes: ActionType[];
  missingHandlers: ActionType[];
  missingExecutionTests: ActionType[];
}

export function buildActionCoverageInventory(
  schemas: Readonly<Record<string, EffectSchema>>,
  registeredTypes: readonly ActionType[]
): ActionCoverageInventory {
  const counts = collectAuthoredActionCounts(schemas);
  const authoredTypes = [...counts.keys()].sort();
  const registered = new Set(registeredTypes);
  const executed = new Set<ActionType>(EXECUTED_ACTION_TYPES);
  return {
    authoredUses: [...counts.values()].reduce(
      (total, count) => total + count,
      0
    ),
    authoredTypes,
    handledTypes: authoredTypes.filter((type) => registered.has(type)),
    executedTypes: authoredTypes.filter((type) => executed.has(type)),
    missingHandlers: authoredTypes.filter((type) => !registered.has(type)),
    missingExecutionTests: authoredTypes.filter((type) => !executed.has(type)),
  };
}
