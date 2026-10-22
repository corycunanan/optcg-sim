/** Shared cost replay grammar and native7 executable-continuation validation. */
import { GameActionSchema } from "../../../../../../shared/validators/client-message.js";
import type { Cost, SimpleCost } from "../../effect-types.js";
import type { EffectStackFrame, GameState } from "../../../types.js";
import { costSelectionCount, isOpponentLifePlacement } from "./targets.js";
const LIFE_DESTINATION_CHOICE_PREFIX = "cost-life:";
/** OPT-828: a Life-end choice id bound to the Characters chosen to pay the cost. */
export function lifeDestinationChoiceId(ids: string[], end: "TOP" | "BOTTOM"): string {
  return `${LIFE_DESTINATION_CHOICE_PREFIX}${JSON.stringify(ids)}:${end}`;
}

export function isLifeDestinationChoiceId(id: string): boolean {
  return id.startsWith(LIFE_DESTINATION_CHOICE_PREFIX);
}

export function parseLifeDestinationChoiceId(
  id: string,
): { ids: string[]; position: "TOP" | "BOTTOM" } | null {
  if (!isLifeDestinationChoiceId(id)) return null;
  const split = id.lastIndexOf(":");
  const end = id.slice(split + 1);
  if (end !== "TOP" && end !== "BOTTOM") return null;
  try {
    const ids: unknown = JSON.parse(id.slice(LIFE_DESTINATION_CHOICE_PREFIX.length, split));
    if (!Array.isArray(ids) || !ids.every((value) => typeof value === "string")) return null;
    return { ids, position: end };
  } catch {
    return null;
  }
}

export const FIELD_EXIT_COSTS: ReadonlySet<Cost["type"]> = new Set([
  "KO_OWN_CHARACTER", "TRASH_OWN_CHARACTER", "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE",
  "RETURN_OWN_CHARACTER_TO_HAND", "PLACE_OWN_CHARACTER_TO_DECK", "ADD_OWN_CHARACTER_TO_LIFE",
]);
const FIXED_SOURCE_EXIT_COSTS = ["TRASH_SELF", "PLACE_SELF_TO_DECK", "PLACE_SELF_AND_HAND_TO_DECK"];
const FIXED_STAGE_EXIT_COSTS = ["PLACE_STAGE_TO_DECK", "TRASH_OWN_STAGE"];
export const FIXED_EXIT_COSTS: ReadonlySet<string> = new Set([...FIXED_SOURCE_EXIT_COSTS, ...FIXED_STAGE_EXIT_COSTS]);
export function fixedCostExitTarget(state: GameState, cost: Cost, controller: 0 | 1, source: string): string | undefined {
  if (FIXED_SOURCE_EXIT_COSTS.includes(cost.type)) return source;
  if (FIXED_STAGE_EXIT_COSTS.includes(cost.type)) return state.players[controller].stage?.instanceId;
  return undefined;
}
export function costReplacementReplayViolation(state: GameState, frame: EffectStackFrame): string | null {
  const parsed = GameActionSchema.safeParse(frame.costReplacementAction);
  if (!parsed.success) return "malformed replacement replay action";
  const action = parsed.data;
  const cost = frame.costs[frame.currentCostIndex];
  if (!cost) return "replacement replay has no current cost";
  const unique = (ids: string[]) => ids.length > 0 && ids.every(id => id.length > 0) && new Set(ids).size === ids.length;
  const compound = cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" || cost.type === "PLACE_SELF_AND_HAND_TO_DECK";
  const amount = costSelectionCount(cost as SimpleCost);
  if (action.type === "PLAYER_CHOICE") {
    if (action.choiceId === "__PAY_FIXED_COST__") return FIXED_EXIT_COSTS.has(cost.type) ? null : "fixed replay sentinel does not match current cost";
    if (cost.type !== "ADD_OWN_CHARACTER_TO_LIFE" || !isOpponentLifePlacement(cost) || cost.position !== "TOP_OR_BOTTOM") return "destination replay does not match current cost";
    const destination = parseLifeDestinationChoiceId(action.choiceId);
    return destination && unique(destination.ids) && destination.ids.length === amount && frame.validTargets.includes(action.choiceId)
      ? null : "invalid replacement Life destination replay";
  }
  if (action.type === "SELECT_TARGET") {
    if ((!compound && !FIELD_EXIT_COSTS.has(cost.type)) || frame.costArrangeStage ||
        (cost.type === "ADD_OWN_CHARACTER_TO_LIFE" && isOpponentLifePlacement(cost) && cost.position === "TOP_OR_BOTTOM")) return "selection replay does not match current cost stage";
    return unique(action.selectedInstanceIds) && action.selectedInstanceIds.length === amount && action.selectedInstanceIds.every(id => frame.validTargets.includes(id))
      ? null : "invalid replacement selection replay";
  }
  if (action.type === "ARRANGE_TOP_CARDS") {
    const ids = action.orderedInstanceIds;
    const destination = (cost as SimpleCost).position === "TOP" ? "top" : "bottom";
    return compound && frame.costArrangeStage && action.keptCardInstanceId === "" && !action.keptCardInstanceIds && action.destination === destination &&
      unique(ids) && ids.length === amount + 1 && ids.length === frame.validTargets.length && ids.includes(frame.sourceCardInstanceId) && ids.every(id => frame.validTargets.includes(id))
      ? null : "invalid replacement arrangement replay";
  }
  return "unsupported replacement replay action";
}
