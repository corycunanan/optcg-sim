import type { EffectAvailability } from "../../../../shared/game-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { evaluateCondition } from "./conditions.js";
import {
  type Cost,
  isOncePerTurnBlock,
  type EffectBlock,
  type EffectResult,
  type Target,
  type TargetFilter,
} from "./effect-types.js";
import { computeAllValidTargets } from "./effect-resolver/target-resolver.js";
import {
  isCardNegated,
  isPermanentBlockGateMet,
} from "./modifiers.js";
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

type CostMutationDimension = "ZONE" | "REST" | "POWER" | "LIFE_FACE";

function costMutationDimensions(cost: Cost): CostMutationDimension[] {
  switch (cost.type) {
    case "CHOICE":
      return cost.options.length === 0
        ? ["ZONE"]
        : cost.options.flatMap((branch) =>
            branch.flatMap((option) => costMutationDimensions(option))
          );
    case "CHOOSE_ONE_COST":
      return !cost.options?.length
        ? ["ZONE"]
        : cost.options.flatMap((option) => costMutationDimensions(option));
    case "DON_REST":
    case "REST_SELF":
    case "REST_CARDS":
    case "REST_NAMED_CARD":
    case "REST_DON":
      return ["REST"];
    case "LEADER_POWER_REDUCTION":
      return ["POWER"];
    case "TURN_LIFE_FACE_UP":
    case "TURN_LIFE_FACE_DOWN":
      return ["LIFE_FACE"];
    default:
      // Fail closed for every movement-like cost and any future Cost variant.
      return ["ZONE"];
  }
}

function targetFilters(target: Target): TargetFilter[] {
  return [
    ...(target.filter ? [target.filter] : []),
    ...(target.dual_targets?.map((dualTarget) => dualTarget.filter) ?? []),
    ...(target.named_distribution?.shared_filter
      ? [target.named_distribution.shared_filter]
      : []),
  ];
}

function filterTreeReads(
  filter: TargetFilter,
  dimension: Exclude<CostMutationDimension, "ZONE">
): boolean {
  const readsHere = (() => {
    switch (dimension) {
      case "REST":
        return (
          filter.is_rested !== undefined ||
          filter.is_active !== undefined ||
          filter.state !== undefined
        );
      case "POWER":
        return (
          filter.power_exact !== undefined ||
          filter.power_min !== undefined ||
          filter.power_max !== undefined ||
          filter.power_range !== undefined ||
          filter.base_power_exact !== undefined ||
          filter.base_power_min !== undefined ||
          filter.base_power_max !== undefined
        );
      case "LIFE_FACE": {
        // No authored TargetFilter field currently reads Life face state. Keep
        // common future spellings fail-closed until the typed union owns one.
        const fields = filter as TargetFilter & Record<string, unknown>;
        return [
          "face",
          "life_face",
          "is_face_up",
          "is_face_down",
          "face_up",
          "face_down",
        ].some((field) => fields[field] !== undefined);
      }
    }
  })();

  return (
    readsHere ||
    (filter.any_of?.some((nested) => filterTreeReads(nested, dimension)) ??
      false)
  );
}

function costsCanCreateActionTargets(block: EffectBlock): boolean {
  const mutations =
    block.costs?.flatMap((cost) => costMutationDimensions(cost)) ?? [];
  if (mutations.includes("ZONE")) return true;
  const stateMutations = mutations.filter(
    (dimension): dimension is Exclude<CostMutationDimension, "ZONE"> =>
      dimension !== "ZONE"
  );

  return stateMutations.some((dimension) =>
    block.actions?.some((action) => {
      const target = action.target;
      if (!target || target.controller === "OPPONENT") return false;
      return targetFilters(target).some((filter) =>
        filterTreeReads(filter, dimension)
      );
    })
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

  // Costs resolve before actions and can create an otherwise-empty target
  // population. Skip only where the mutation and target-filter population can
  // interact; explicit opponent-only targets cannot overlap own-card costs.
  if (costsCanCreateActionTargets(block)) return false;

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
    return isPermanentBlockGateMet(state, block, conditionContext)
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

/**
 * Combine both controllers' derived availability for a spectator.
 *
 * Keys are card instance IDs, which are expected to be globally unique across
 * both players. An overlap signals that uniqueness invariant was violated, so
 * throw instead of silently choosing one controller's entry. Broadcast-path
 * callers must contain this error per spectator so spectator delivery alone
 * fails without interrupting delivery to any other recipient.
 */
export function effectAvailabilityForSpectator(
  state: GameState,
  availability: Record<string, EffectAvailability[]>
): Record<string, EffectAvailability[]> {
  const controllerZero = effectAvailabilityForController(
    state,
    availability,
    0
  );
  const controllerOne = effectAvailabilityForController(state, availability, 1);

  for (const instanceId of Object.keys(controllerZero)) {
    if (Object.prototype.hasOwnProperty.call(controllerOne, instanceId)) {
      throw new Error(
        `Effect availability invariant violated: card instance ${instanceId} belongs to both controllers`
      );
    }
  }

  return { ...controllerZero, ...controllerOne };
}

/** Select controller-scoped or merged spectator availability without guessing. */
export function effectAvailabilityForRecipient(
  state: GameState,
  availability: Record<string, EffectAvailability[]>,
  recipientPlayerIndex: 0 | 1 | null
): Record<string, EffectAvailability[]> {
  return recipientPlayerIndex === null
    ? effectAvailabilityForSpectator(state, availability)
    : effectAvailabilityForController(
        state,
        availability,
        recipientPlayerIndex
      );
}
