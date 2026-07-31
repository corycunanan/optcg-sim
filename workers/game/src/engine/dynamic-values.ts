/**
 * Shared dynamic-value resolution.
 *
 * Action resolution and permanent-modifier reads both use this module so
 * PER_COUNT / GAME_STATE semantics cannot drift between the two paths.
 */

import type {
  DynamicValue,
  EffectResult,
  TargetFilter,
} from "./effect-types.js";
import type { CardData, CardInstance, GameState } from "../types.js";
import { findCardInstance } from "./state.js";
import { isPresent } from "./type-guards.js";

export type DynamicValueResolution =
  | { resolved: true; value: number }
  | {
      resolved: false;
      reason:
        | "UNSUPPORTED_PERMANENT_TYPE"
        | "UNSUPPORTED_SOURCE"
        | "MISSING_STATE"
        | "MISSING_CONTROLLER"
        | "MISSING_CARD_DB"
        | "MISSING_FILTER_RESOLVER";
      detail: string;
    };

export interface DynamicValueResolutionContext {
  resultRefs: Map<string, EffectResult>;
  state?: GameState;
  controller?: 0 | 1;
  cardDb?: Map<string, CardData>;
  matchesFilter?: (
    card: CardInstance,
    filter: TargetFilter,
    cardDb: Map<string, CardData>,
    state: GameState
  ) => boolean;
}

const THIS_WAY_TO_COST_REF: Record<string, string> = {
  DON_RESTED_THIS_WAY: "__cost_don_rested",
  CARDS_TRASHED_THIS_WAY: "__cost_cards_trashed",
  CHARACTERS_RETURNED_THIS_WAY: "__cost_cards_returned",
  CHARACTERS_KO_THIS_WAY: "__cost_characters_ko",
  CARDS_PLACED_TO_DECK_THIS_WAY: "__cost_cards_placed_to_deck",
};

function resolved(value: number): DynamicValueResolution {
  return { resolved: true, value };
}

function unresolved(
  reason: Extract<DynamicValueResolution, { resolved: false }>["reason"],
  detail: string
): DynamicValueResolution {
  return { resolved: false, reason, detail };
}

function requireStateAndController(
  context: DynamicValueResolutionContext
): DynamicValueResolution | null {
  if (!context.state) {
    return unresolved(
      "MISSING_STATE",
      "dynamic value requires live game state"
    );
  }
  if (context.controller == null) {
    return unresolved(
      "MISSING_CONTROLLER",
      "dynamic value requires the effect controller"
    );
  }
  return null;
}

export function resolveDynamicValue(
  value: DynamicValue,
  context: DynamicValueResolutionContext
): DynamicValueResolution {
  if (value.type === "FIXED") return resolved(value.value ?? 0);

  if (value.type === "PER_COUNT") {
    const missingContext = requireStateAndController(context);
    if (missingContext) return missingContext;

    const state = context.state!;
    const controller = context.controller!;
    const divisor = value.divisor ?? 1;
    const multiplier = value.multiplier ?? 1;
    const costRefKey = THIS_WAY_TO_COST_REF[value.source];
    if (costRefKey) {
      const count = context.resultRefs.get(costRefKey)?.count ?? 0;
      return resolved(Math.floor(count / divisor) * multiplier);
    }

    if (value.source === "REVEALED_CARD_COST") {
      const targetId = value.ref
        ? context.resultRefs.get(value.ref)?.targetInstanceIds[0]
        : undefined;
      if (!targetId) return resolved(0);
      if (!context.cardDb) {
        return unresolved(
          "MISSING_CARD_DB",
          "REVEALED_CARD_COST requires card data"
        );
      }
      const targetCard = findCardInstance(state, targetId);
      const count = targetCard
        ? (context.cardDb.get(targetCard.cardId)?.cost ?? 0)
        : 0;
      return resolved(Math.floor(count / divisor) * multiplier);
    }

    if (value.source === "DON_GIVEN_TO_TARGET") {
      const refResult = value.ref
        ? context.resultRefs.get(value.ref)
        : undefined;
      const targetId = refResult?.targetInstanceIds[0];
      const targetCard = targetId ? findCardInstance(state, targetId) : null;
      const count = targetCard?.attachedDon.length ?? refResult?.count ?? 0;
      return resolved(Math.floor(count / divisor) * multiplier);
    }

    const count = resolvePerCountSource(
      state,
      controller,
      value.source,
      context,
      value.filter
    );
    if (!count.resolved) return count;
    return resolved(Math.floor(count.value / divisor) * multiplier);
  }

  if (value.type === "GAME_STATE") {
    const missingContext = requireStateAndController(context);
    if (missingContext) return missingContext;

    const controller = context.controller!;
    const playerIndex =
      value.controller === "OPPONENT" ? (controller === 0 ? 1 : 0) : controller;
    return resolveGameStateSource(
      context.state!,
      playerIndex,
      value.source,
      context.cardDb
    );
  }

  if (value.type === "ACTION_RESULT") {
    return resolved(context.resultRefs.get(value.ref)?.count ?? 0);
  }

  if (value.type === "CHOSEN_VALUE") {
    const chosen = context.resultRefs.get(value.ref)?.value;
    return resolved(
      typeof chosen === "number" && Number.isInteger(chosen) ? chosen : 0
    );
  }

  if (value.type === "DRAW_TO") {
    const missingContext = requireStateAndController(context);
    if (missingContext) return missingContext;
    return resolved(
      Math.max(
        0,
        value.target_count -
          context.state!.players[context.controller!].hand.length
      )
    );
  }

  return unresolved(
    "UNSUPPORTED_SOURCE",
    `dynamic value type '${String((value as { type?: unknown }).type)}' has no resolver`
  );
}

/**
 * Permanent modifiers have no action-result context. Restrict them to dynamic
 * types whose value can be recomputed solely from live game state.
 */
export function resolvePermanentDynamicValue(
  value: unknown,
  context: DynamicValueResolutionContext
): DynamicValueResolution {
  if (!value || typeof value !== "object") {
    return unresolved(
      "UNSUPPORTED_PERMANENT_TYPE",
      "permanent dynamic value must be an object"
    );
  }
  const type = (value as { type?: unknown }).type;
  if (type !== "PER_COUNT" && type !== "GAME_STATE") {
    return unresolved(
      "UNSUPPORTED_PERMANENT_TYPE",
      `dynamic value type '${String(type)}' cannot resolve for a permanent modifier`
    );
  }
  return resolveDynamicValue(value as DynamicValue, context);
}

function resolvePerCountSource(
  state: GameState,
  controller: 0 | 1,
  source: import("./effect-types.js").DynamicSource,
  context: DynamicValueResolutionContext,
  filter?: TargetFilter
): DynamicValueResolution {
  const player = state.players[controller];
  const opponent = state.players[controller === 0 ? 1 : 0];

  switch (source) {
    case "HAND_COUNT":
      return resolved(player.hand.length);
    case "CARDS_IN_TRASH":
      return resolved(player.trash.length);
    case "EVENTS_IN_TRASH":
      if (!context.cardDb) {
        return unresolved(
          "MISSING_CARD_DB",
          "EVENTS_IN_TRASH requires card data"
        );
      }
      return resolved(
        player.trash.filter(
          (card) =>
            context.cardDb!.get(card.cardId)?.type.toUpperCase() === "EVENT"
        ).length
      );
    case "CHARACTERS_ON_FIELD":
    case "MATCHING_CHARACTERS_ON_FIELD": {
      let characters = player.characters.filter(isPresent);
      if (filter) {
        if (!context.cardDb) {
          return unresolved(
            "MISSING_CARD_DB",
            `${source} with a filter requires card data`
          );
        }
        if (!context.matchesFilter) {
          return unresolved(
            "MISSING_FILTER_RESOLVER",
            `${source} with a filter requires target-filter resolution`
          );
        }
        characters = characters.filter((card) =>
          context.matchesFilter!(card, filter, context.cardDb!, state)
        );
      }
      if (filter?.unique_names) {
        return resolved(
          new Set(
            characters.map(
              (card) => context.cardDb?.get(card.cardId)?.name ?? card.cardId
            )
          ).size
        );
      }
      return resolved(characters.length);
    }
    case "DON_FIELD_COUNT":
      return resolved(
        player.donCostArea.length +
          player.leader.attachedDon.length +
          player.characters.reduce(
            (sum, card) => sum + (card?.attachedDon.length ?? 0),
            0
          )
      );
    case "RESTED_DON_COUNT":
      return resolved(
        player.donCostArea.filter((don) => don.state === "RESTED").length
      );
    case "OPPONENT_CHARACTERS_ON_FIELD":
      return resolved(opponent.characters.filter(isPresent).length);
    case "DON_RESTED_THIS_WAY":
    case "CARDS_TRASHED_THIS_WAY":
    case "CHARACTERS_RETURNED_THIS_WAY":
    case "CHARACTERS_KO_THIS_WAY":
    case "CARDS_PLACED_TO_DECK_THIS_WAY":
      return resolved(0);
    default:
      return unresolved(
        "UNSUPPORTED_SOURCE",
        `PER_COUNT source '${String(source)}' has no resolver`
      );
  }
}

function resolveGameStateSource(
  state: GameState,
  playerIndex: 0 | 1,
  source: import("./effect-types.js").GameStateSource,
  cardDb?: Map<string, CardData>
): DynamicValueResolution {
  const player = state.players[playerIndex];
  const opponent = state.players[playerIndex === 0 ? 1 : 0];

  switch (source) {
    case "LIFE_COUNT":
      return resolved(player.life.length);
    case "OPPONENT_LIFE_COUNT":
      return resolved(opponent.life.length);
    case "COMBINED_LIFE_COUNT":
      return resolved(player.life.length + opponent.life.length);
    case "DON_FIELD_COUNT":
      return resolved(
        player.donCostArea.length +
          player.leader.attachedDon.length +
          player.characters.reduce(
            (sum, card) => sum + (card?.attachedDon.length ?? 0),
            0
          )
      );
    case "OPPONENT_DON_FIELD_COUNT":
      return resolved(
        opponent.donCostArea.length +
          opponent.leader.attachedDon.length +
          opponent.characters.reduce(
            (sum, card) => sum + (card?.attachedDon.length ?? 0),
            0
          )
      );
    case "HAND_COUNT":
      return resolved(player.hand.length);
    case "DECK_COUNT":
      return resolved(player.deck.length);
    case "RESTED_CARD_COUNT":
      return resolved(
        player.characters.filter(
          (card) => card !== null && card.state === "RESTED"
        ).length
      );
    case "LEADER_BASE_POWER":
      if (!cardDb) {
        return unresolved(
          "MISSING_CARD_DB",
          "LEADER_BASE_POWER requires card data"
        );
      }
      return resolved(cardDb.get(player.leader.cardId)?.power ?? 0);
    default:
      return unresolved(
        "UNSUPPORTED_SOURCE",
        `GAME_STATE source '${String(source)}' has no resolver`
      );
  }
}
