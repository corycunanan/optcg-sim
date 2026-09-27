import type {
  CardData,
  GameState,
  PendingEvent,
  QueuedTrigger,
  EffectStackFrame,
} from "../../../types.js";
import type { EffectBlock, EffectResult } from "../../effect-types.js";
import { isOncePerTurnBlock } from "../../effect-types.js";
import { markOncePerTurnUsed } from "../action-utils.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import {
  getEventCardInstanceId,
  replacePendingEventReferences,
} from "../../events.js";
import {
  completeHandTrashCostSources,
  isHandTrashByEffect,
} from "../../hand-trash.js";
import type { EffectResolverServices } from "../types.js";

/** Rules 8-3-1-7 / 10-2-13-5: keep replacement processing and activation usage,
 * publish its events, and drain waiting auto effects without the post-colon chain.
 * The caller retires its cost/optional frame before entering this terminal path.
 * Like the committed-cost siblings (resolveEffect, finishCostsAndRunActions,
 * handleAwaitingOptionalResponse), complete hand-trash cost attribution from
 * the frame's source snapshot, then admit canonical hand trash to this scan so
 * its watchers queue alongside `pendingTriggers` (OPT-795, OPT-857).
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
  resultRefs: Map<string, EffectResult>,
  triggerOrderingGroup?: EffectStackFrame["triggerOrderingGroup"]
) {
  if (isOncePerTurnBlock(block))
    state = markOncePerTurnUsed(state, block.id, sourceCardInstanceId);
  completeHandTrashCostSources(
    events,
    state,
    sourceCardInstanceId,
    controller,
    resultRefs
  );
  const scannable = events.filter(
    (e) =>
      !e.propagation?.triggerScanned &&
      (e.type !== "CARD_TRASHED" ||
        Boolean(getEventCardInstanceId(e)) ||
        isHandTrashByEffect(e))
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
