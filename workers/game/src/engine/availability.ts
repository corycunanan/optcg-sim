import type { EffectAvailability } from "../../../../shared/game-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { evaluateCondition } from "./conditions.js";
import {
  type Cost,
  isOncePerTurnBlock,
  type EffectBlock,
  type EffectResult,
  type Target,
} from "./effect-types.js";
import { computeAllValidTargets } from "./effect-resolver/target-resolver.js";
import { isCardNegated } from "./modifiers.js";
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

function costMayChangeZones(cost: Cost): boolean {
  switch (cost.type) {
    case "CHOICE":
      return (
        cost.options.length === 0 ||
        cost.options.some((branch) =>
          branch.some((option) => costMayChangeZones(option))
        )
      );
    case "CHOOSE_ONE_COST":
      return (
        !cost.options?.length ||
        cost.options.some((option) => costMayChangeZones(option))
      );
    case "DON_REST":
    case "REST_SELF":
    case "REST_CARDS":
    case "REST_NAMED_CARD":
    case "LEADER_POWER_REDUCTION":
    case "REST_DON":
    case "TURN_LIFE_FACE_UP":
    case "TURN_LIFE_FACE_DOWN":
      return false;
    default:
      // Fail closed for every movement-like cost and any future Cost variant.
      return true;
  }
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

  // Costs resolve before actions and can create an otherwise-empty target
  // population. Predicting from the pre-cost state would be a false negative.
  if (block.costs?.some((cost) => costMayChangeZones(cost))) return false;

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
    if (isCardNegated(card, state, cardDb)) {
      return { effectId: block.id, status: "blocked", reason: "CONDITION" };
    }
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

/** Restrict derived availability to the cards controlled by one recipient. */
export function effectAvailabilityForController(
  state: GameState,
  availability: Record<string, EffectAvailability[]>,
  controller: 0 | 1
): Record<string, EffectAvailability[]> {
  const controlledInstanceIds = new Set(
    relevantCards(state)
      .filter((card) => card.controller === controller)
      .map((card) => card.instanceId)
  );

  return Object.fromEntries(
    Object.entries(availability).filter(([instanceId]) =>
      controlledInstanceIds.has(instanceId)
    )
  );
}
