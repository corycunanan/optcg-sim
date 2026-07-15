import type { EffectBlock } from "../effect-types.js";
import type { CardData, GameState } from "../../types.js";
import { evaluateCondition } from "../conditions.js";

/** Evaluate a post-colon condition exactly when the post-cost chain starts. */
export function postCostConditionsMet(
  state: GameState,
  block: EffectBlock,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>
): boolean {
  if (!block.post_cost_conditions) return true;
  return evaluateCondition(state, block.post_cost_conditions, {
    sourceCardInstanceId,
    controller,
    cardDb,
  });
}
