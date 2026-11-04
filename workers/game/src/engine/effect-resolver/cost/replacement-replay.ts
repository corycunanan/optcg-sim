/** Shared cost replay grammar and native7 executable-continuation validation. */
import { GameActionSchema } from "../../../../../../shared/validators/client-message.js";
import type { Cost, SimpleCost } from "../../effect-types.js";
import type { EffectStackFrame, GameState, GameAction } from "../../../types.js";
import { costSelectionCount, isOpponentLifePlacement } from "./targets.js";
import { blockShufflesDeck } from "./prompts.js";
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
const FIXED_REPLAY_COSTS: ReadonlySet<string> = new Set(["TRASH_SELF", "PLACE_SELF_TO_DECK", ...FIXED_STAGE_EXIT_COSTS]);
export function fixedCostExitTarget(state: GameState, cost: Cost, controller: 0 | 1, source: string): string | undefined {
  if (FIXED_SOURCE_EXIT_COSTS.includes(cost.type)) return source;
  if (FIXED_STAGE_EXIT_COSTS.includes(cost.type)) return state.players[controller].stage?.instanceId;
  return undefined;
}
type ReplayContext = Pick<EffectStackFrame, "costs" | "currentCostIndex" | "validTargets" | "costArrangeStage" | "sourceCardInstanceId" | "effectBlock">;
type ReplayStage = "FIXED_EXIT" | "FIELD_SELECTION" | "COMPOUND_SELECTION" | "COMPOUND_ARRANGEMENT" | "LIFE_DESTINATION";
const unique = (ids: string[]) => ids.every(id => id.length > 0) && new Set(ids).size === ids.length;

/** Classify saved producer evidence before inspecting the replay action. */
function classifyCostReplayStage(frame: ReplayContext): ReplayStage | null {
  const cost = frame.costs[frame.currentCostIndex];
  if (!cost || !unique(frame.validTargets)) return null;
  const amount = costSelectionCount(cost as SimpleCost);
  const compound = cost.type === "PLACE_SELF_AND_TRASH_TO_DECK" || cost.type === "PLACE_SELF_AND_HAND_TO_DECK";
  if (compound) {
    const shuffles = blockShufflesDeck(frame.effectBlock);
    if (frame.costArrangeStage) return !shuffles && frame.validTargets.length === amount + 1 && frame.validTargets.includes(frame.sourceCardInstanceId)
      ? "COMPOUND_ARRANGEMENT" : null;
    return shuffles && frame.validTargets.length > amount && !frame.validTargets.includes(frame.sourceCardInstanceId) ? "COMPOUND_SELECTION" : null;
  }
  if (frame.costArrangeStage) return null;
  if (FIXED_REPLAY_COSTS.has(cost.type)) return frame.validTargets.length === 0 ? "FIXED_EXIT" : null;
  if (!FIELD_EXIT_COSTS.has(cost.type) || amount < 1) return null;
  if (cost.type === "ADD_OWN_CHARACTER_TO_LIFE" && isOpponentLifePlacement(cost) && cost.position === "TOP_OR_BOTTOM") {
    if (frame.validTargets.length !== 2) return null;
    const first = parseLifeDestinationChoiceId(frame.validTargets[0]);
    if (!first || !unique(first.ids) || first.ids.length !== amount) return null;
    return ["TOP", "BOTTOM"].every(end => frame.validTargets.includes(lifeDestinationChoiceId(first.ids, end as "TOP" | "BOTTOM")))
      ? "LIFE_DESTINATION" : null;
  }
  return frame.validTargets.length >= amount ? "FIELD_SELECTION" : null;
}

/** Strict parked grammar; never consults a board changed by substitute execution. */
function replayViolation(frame: ReplayContext, input: unknown): string | null {
  const parsed = GameActionSchema.safeParse(input);
  if (!parsed.success) return "malformed replacement replay action";
  const action = parsed.data;
  const stage = classifyCostReplayStage(frame);
  if (!stage) return "replacement replay does not match a captured cost stage";
  const cost = frame.costs[frame.currentCostIndex] as SimpleCost;
  const amount = costSelectionCount(cost);
  switch (stage) {
    case "FIXED_EXIT":
      return action.type === "PLAYER_CHOICE" && action.choiceId === "__PAY_FIXED_COST__" ? null : "invalid fixed replacement replay";
    case "LIFE_DESTINATION":
      return action.type === "PLAYER_CHOICE" && frame.validTargets.includes(action.choiceId) ? null : "invalid replacement Life destination replay";
    case "FIELD_SELECTION":
    case "COMPOUND_SELECTION":
      return action.type === "SELECT_TARGET" && unique(action.selectedInstanceIds) && action.selectedInstanceIds.length === amount && action.selectedInstanceIds.every(id => frame.validTargets.includes(id))
        ? null : "invalid replacement selection replay";
    case "COMPOUND_ARRANGEMENT":
      return action.type === "ARRANGE_TOP_CARDS" && action.keptCardInstanceId === "" && action.keptCardInstanceIds === undefined && action.destination === (cost.position === "TOP" ? "top" : "bottom") &&
        unique(action.orderedInstanceIds) && action.orderedInstanceIds.length === frame.validTargets.length && action.orderedInstanceIds.every(id => frame.validTargets.includes(id))
        ? null : "invalid replacement arrangement replay";
  }
}

/** One parser for captured semantic actions and strict native7 ingress. */
export function parseCostReplacementReplay(frame: ReplayContext, input: unknown):
  { action: GameAction; violation: null } | { action: null; violation: string } {
  const violation = replayViolation(frame, input);
  if (violation) return { action: null, violation };
  return { action: GameActionSchema.parse(input) as GameAction, violation: null };
}

/** Construct only semantics already validated/computed by the payment handler.
 * Historical unanswered offers may use this at explicit writer promotion, never at native7 ingress.
 * No identities are removed, invented, deduplicated or reordered here.
 */
export function canonicalCostReplacementReplay(frame: ReplayContext, input: GameAction): GameAction {
  const cost = frame.costs[frame.currentCostIndex];
  let semantic = input;
  if (input.type === "ARRANGE_TOP_CARDS" && cost) {
    semantic = { ...input, destination: (cost as SimpleCost).position === "TOP" ? "top" : "bottom" };
  } else if (input.type === "PLAYER_CHOICE" && cost?.type === "ADD_OWN_CHARACTER_TO_LIFE") {
    const destination = parseLifeDestinationChoiceId(input.choiceId);
    if (destination) semantic = { ...input, choiceId: lifeDestinationChoiceId(destination.ids, destination.position) };
  }
  const parsed = parseCostReplacementReplay(frame, semantic);
  if (parsed.violation) throw new Error(`Invalid canonical COST replay: ${parsed.violation}`);
  return parsed.action!;
}

/** Ownership is checked before an optional answer can execute any substitute. */
export function costReplacementReplayViolation(_state: GameState, frame: EffectStackFrame): string | null {
  if ((frame.kind !== undefined && frame.kind !== "COST") || frame.phase !== "AWAITING_COST_SELECTION" || frame.costReplacementChecked !== true || !frame.costReplacementAction) {
    return "replacement replay lacks a checked COST owner";
  }
  return parseCostReplacementReplay(frame, frame.costReplacementAction).violation;
}
