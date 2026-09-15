import type {
  CardData,
  GameState,
  PendingEvent,
  QueuedTrigger,
  EffectStackFrame,
} from "../../../types.js";
import type { EffectBlock } from "../../effect-types.js";
import { isOncePerTurnBlock } from "../../effect-types.js";
import { markOncePerTurnUsed } from "../action-utils.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import {
  getEventCardInstanceId,
  replacePendingEventReferences,
} from "../../events.js";
import type { EffectResolverServices } from "../types.js";

/** Rules 8-3-1-7 / 10-2-13-5: keep replacement processing and activation usage,
 * publish its events, and drain waiting auto effects without the post-colon chain.
 * The caller retires its cost/optional frame before entering this terminal path.
 */
export function finishReplacedLifeCost(
  state: GameState,
  events: PendingEvent[],
  block: EffectBlock,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  pendingTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
  services: EffectResolverServices,
  triggerOrderingGroup?: EffectStackFrame["triggerOrderingGroup"]
) {
  if (isOncePerTurnBlock(block))
    state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
  const scannable = events.filter(
    (e) =>
      !e.propagation?.triggerScanned &&
      (e.type !== "CARD_TRASHED" || Boolean(getEventCardInstanceId(e)))
  );
  const scan = scanEventsForTriggers(state, scannable, controller, cardDb);
  replacePendingEventReferences(events, scannable, scan.events);
  return services.processRemainingTriggers(
    scan.state,
    [...pendingTriggers, ...scan.triggers],
    cardDb,
    events,
    triggerOrderingGroup
  );
}
