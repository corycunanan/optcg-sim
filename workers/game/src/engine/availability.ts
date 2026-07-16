import type { EffectAvailability } from "../../../../shared/game-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { evaluateCondition } from "./conditions.js";
import {
  isOncePerTurnBlock,
  type EffectBlock,
  type EffectResult,
  type Target,
} from "./effect-types.js";
import { computeAllValidTargets } from "./effect-resolver/target-resolver.js";
import {
  areEffectCostsPayable,
  getActivateEffectTimingError,
} from "./validation.js";

const RESOLUTION_CONTEXT_TARGETS = new Set<Target["type"]>([
  "SELECTED_CARDS",
  "TRIGGERING_CARD",
  "TRIGGERING_CARD_IN_TRASH",
]);

function relevantCards(state: GameState): CardInstance[] {
  return state.players.flatMap((player) => [
    player.leader,
    ...player.characters.filter((card): card is CardInstance => card !== null),
    ...(player.stage ? [player.stage] : []),
  ]);
}

function isActivateMain(block: EffectBlock): boolean {
  return (
    block.category === "activate" &&
    block.trigger !== undefined &&
    "keyword" in block.trigger &&
    block.trigger.keyword === "ACTIVATE_MAIN"
  );
}

function lacksAllActionTargets(
  state: GameState,
  block: EffectBlock,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string
): boolean {
  const actions = block.actions;
  if (!actions?.length) return false;

  // Targets fed by earlier action results or trigger context cannot be known
  // until live resolution. Skip the enhancement for the whole block.
  if (
    actions.some(
      (action) =>
        action.target === undefined ||
        action.target_ref !== undefined ||
        RESOLUTION_CONTEXT_TARGETS.has(action.target.type)
    )
  ) {
    return false;
  }

  const emptyResultRefs = new Map<string, EffectResult>();
  return actions.every(
    (action) =>
      computeAllValidTargets(
        state,
        action.target,
        controller,
        cardDb,
        sourceCardInstanceId,
        emptyResultRefs
      ).length === 0
  );
}

function availabilityForBlock(
  state: GameState,
  block: EffectBlock,
  card: CardInstance,
  cardDb: Map<string, CardData>
): EffectAvailability | null {
  const controller = card.controller;
  const conditionContext = {
    sourceCardInstanceId: card.instanceId,
    controller,
    cardDb,
  };

  if (block.category === "permanent") {
    const conditionMet =
      block.conditions === undefined ||
      evaluateCondition(state, block.conditions, conditionContext);
    return conditionMet
      ? { effectId: block.id, status: "active" }
      : { effectId: block.id, status: "blocked", reason: "CONDITION" };
  }

  if (!isActivateMain(block)) return null;

  if (
    getActivateEffectTimingError(state) !== null ||
    state.turn.activePlayerIndex !== controller
  ) {
    return { effectId: block.id, status: "blocked", reason: "PHASE" };
  }

  if (
    isOncePerTurnBlock(block) &&
    state.turn.oncePerTurnUsed[block.id]?.includes(card.instanceId)
  ) {
    return { effectId: block.id, status: "used" };
  }

  if (
    block.costs?.length &&
    !areEffectCostsPayable(
      state,
      block.costs,
      controller,
      cardDb,
      card.instanceId
    )
  ) {
    return { effectId: block.id, status: "blocked", reason: "COST" };
  }

  if (
    block.conditions !== undefined &&
    !evaluateCondition(state, block.conditions, conditionContext)
  ) {
    return { effectId: block.id, status: "blocked", reason: "CONDITION" };
  }

  if (
    lacksAllActionTargets(state, block, controller, cardDb, card.instanceId)
  ) {
    return { effectId: block.id, status: "blocked", reason: "NO_TARGET" };
  }

  return { effectId: block.id, status: "usable" };
}

/** Compute public effect presentation state for leaders, Characters, and Stages. */
export function computeEffectAvailability(
  state: GameState,
  cardDb: Map<string, CardData>
): Record<string, EffectAvailability[]> {
  const availability: Record<string, EffectAvailability[]> = {};

  for (const card of relevantCards(state)) {
    const schema = cardDb.get(card.cardId)?.effectSchema;
    if (!schema) continue;

    const entries = schema.effects
      .map((block) => availabilityForBlock(state, block, card, cardDb))
      .filter((entry): entry is EffectAvailability => entry !== null);
    if (entries.length > 0) availability[card.instanceId] = entries;
  }

  return availability;
}
