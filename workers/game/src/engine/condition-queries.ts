/**
 * M4 Condition Evaluator
 *
 * Evaluates schema conditions against the current game state.
 * Conditions are pure boolean checks — they never produce side effects.
 *
 * Used by:
 * - Trigger matching (block-level conditions)
 * - Effect resolver (inline action conditions)
 * - Prohibition registry (conditional prohibitions)
 * - Duration tracker (WHILE_CONDITION expiry)
 */

import type {
  Condition,
  SimpleCondition,
  Controller,
  NumericOperator,
  TargetFilter,
  NumericRange,
  DynamicValue,
  EffectResult,
} from "./effect-types.js";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameEventType,
  GameState,
  PlayerState,
} from "../types.js";
import { findCardInstance } from "./state.js";
import { isPresent } from "./type-guards.js";
import {
  matchesTargetFilter,
  type SharedTargetFilterCard,
} from "../../../../shared/target-filter.js";

export interface ConditionQueryServices {
  getEffectivePower(
    card: CardInstance,
    cardData: CardData,
    state: GameState,
    cardDb: Map<string, CardData>
  ): number;
  getEffectiveCostForRead(
    card: CardInstance,
    cardData: CardData,
    state: GameState,
    cardDb: Map<string, CardData>
  ): number;
  getEffectiveFieldCost(
    cardData: CardData,
    state: GameState,
    cardInstanceId: string,
    cardDb: Map<string, CardData>
  ): number;
  hasGrantedAttribute(
    card: CardInstance,
    attribute: string,
    state: GameState,
    cardDb: Map<string, CardData>
  ): boolean;
  hasEffectiveKeyword(
    card: CardInstance,
    cardData: CardData,
    keyword:
      | "BLOCKER"
      | "RUSH"
      | "RUSH_CHARACTER"
      | "DOUBLE_ATTACK"
      | "BANISH"
      | "UNBLOCKABLE"
      | "TRIGGER",
    state: GameState,
    cardDb: Map<string, CardData>
  ): boolean;
}

export interface ConditionContext {
  /** The card instance the effect is on */
  sourceCardInstanceId: string;
  /** The controller of the source card */
  controller: 0 | 1;
  /** Card database for property lookups */
  cardDb: Map<string, CardData>;
  /** Result refs from prior actions in the chain (for REVEALED_CARD_PROPERTY) */
  resultRefs?: Map<string, EffectResult>;
  /** Pure query dependencies supplied by the engine composition boundary. */
  queries: ConditionQueryServices;
}

/**
 * Evaluate a condition tree against the current game state.
 */
export function evaluateCondition(
  state: GameState,
  condition: Condition,
  ctx: ConditionContext
): boolean {
  // Compound wrappers
  if ("all_of" in condition) {
    return condition.all_of.every((c) => evaluateCondition(state, c, ctx));
  }
  if ("any_of" in condition) {
    return condition.any_of.some((c) => evaluateCondition(state, c, ctx));
  }
  if ("not" in condition) {
    return !evaluateCondition(state, condition.not, ctx);
  }

  // Simple condition — dispatch on type
  return evaluateSimple(state, condition as SimpleCondition, ctx);
}

function evaluateSimple(
  state: GameState,
  cond: SimpleCondition,
  ctx: ConditionContext
): boolean {
  switch (cond.type) {
    case "LIFE_COUNT":
      return compareNum(
        getPlayerByController(state, cond.controller, ctx.controller).life
          .length,
        cond.operator,
        cond.value
      );

    case "HAND_COUNT":
      return compareNum(
        getPlayerByController(state, cond.controller, ctx.controller).hand
          .length,
        cond.operator,
        cond.value
      );

    case "CHARACTER_TOTAL_COST": {
      // OPT-444: unqualified "cost" reads the effective (post-modifier) cost,
      // consistent with cost_* target filters (OPT-247). Field cost only —
      // pending play-time discounts must not change an on-field total.
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const total = p.characters.reduce((sum, c) => {
        if (!c) return sum;
        const data = ctx.cardDb.get(c.cardId);
        if (!data) return sum;
        return (
          sum +
          ctx.queries.getEffectiveFieldCost(
            data,
            state,
            c.instanceId,
            ctx.cardDb
          )
        );
      }, 0);
      return compareNum(total, cond.operator, cond.value);
    }

    case "TRASH_COUNT": {
      // OPT-257 (F4): exclude trigger-staging instances from trash count —
      // a card mid-Trigger-resolution is not yet "in trash" for queries.
      const stagingIds = new Set(state.turn.triggerStagingInstanceIds ?? []);
      const trashCount = getPlayerByController(
        state,
        cond.controller,
        ctx.controller
      ).trash.filter((c) => !stagingIds.has(c.instanceId)).length;
      return compareNum(trashCount, cond.operator, cond.value);
    }

    case "DECK_COUNT":
      return compareNum(
        getPlayerByController(state, cond.controller, ctx.controller).deck
          .length,
        cond.operator,
        cond.value
      );

    case "DON_FIELD_COUNT": {
      if (cond.controller === "EITHER") {
        return (
          compareNum(
            getDonFieldCount(state.players[0], cond.state),
            cond.operator,
            cond.value
          ) ||
          compareNum(
            getDonFieldCount(state.players[1], cond.state),
            cond.operator,
            cond.value
          )
        );
      }
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      return compareNum(
        getDonFieldCount(p, cond.state),
        cond.operator,
        cond.value
      );
    }

    case "ACTIVE_DON_COUNT": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const activeCount = p.donCostArea.filter(
        (d) => d.state === "ACTIVE"
      ).length;
      return compareNum(activeCount, cond.operator, cond.value);
    }

    case "ALL_DON_STATE": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      if (p.donCostArea.length === 0) return true; // vacuously true
      return p.donCostArea.every((d) => d.state === cond.required_state);
    }

    case "CARD_ON_FIELD": {
      // EITHER/ANY scans both fields (OP16-081 Otama — the JP text's
      // "cost-8+ Character" is controller-agnostic per the official FAQ).
      const checkBoth =
        cond.controller === "EITHER" || cond.controller === "ANY";
      const cards = checkBoth
        ? state.players.flatMap((pl) => getFieldCards(pl))
        : getFieldCards(
            getPlayerByController(state, cond.controller, ctx.controller)
          );
      const matching = cards.filter((c) => {
        if (cond.exclude_self && c.instanceId === ctx.sourceCardInstanceId)
          return false;
        return matchesFilter(
          c,
          cond.filter,
          ctx.cardDb,
          state,
          undefined,
          undefined,
          undefined,
          ctx.queries
        );
      });
      // unique_names: count distinct card names (OP16-038 "5 Characters with
      // different card names"), not card instances.
      const matchCount = cond.filter?.unique_names
        ? new Set(
            matching.map((c) => ctx.cardDb.get(c.cardId)?.name ?? c.cardId)
          ).size
        : matching.length;
      if (cond.count) {
        return compareNum(matchCount, cond.count.operator, cond.count.value);
      }
      return matchCount > 0;
    }

    case "MULTIPLE_NAMED_CARDS": {
      // OPT-227: a field card "treated as all names" satisfies any required name.
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const cards = getFieldCards(p);
      return cond.names.every((name) =>
        cards.some((c) => {
          const data = ctx.cardDb.get(c.cardId);
          return data?.name === name || cardTreatsAsAll(data, "names");
        })
      );
    }

    case "NAMED_CARD_WITH_PROPERTY": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const cards = getFieldCards(p);
      return cards.some((c) => {
        const data = ctx.cardDb.get(c.cardId);
        if (!data) return false;
        const nameMatches =
          data.name === cond.name || cardTreatsAsAll(data, "names");
        if (!nameMatches) return false;
        if (cond.property.power) {
          const power = ctx.queries.getEffectivePower(
            c,
            data,
            state,
            ctx.cardDb
          );
          if (!matchesNumericRange(power, cond.property.power)) return false;
        }
        if (cond.property.cost) {
          if (!matchesNumericRange(data.cost ?? 0, cond.property.cost))
            return false;
        }
        return true;
      });
    }

    case "FIELD_PURITY": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const chars = p.characters.filter(isPresent);
      // OP16-022 Leader Luffy FAQ: "all your Characters are X" requires at
      // least one Character — an empty field does NOT satisfy the condition.
      if (chars.length === 0) return false;
      return chars.every((c) =>
        matchesFilter(
          c,
          cond.filter,
          ctx.cardDb,
          state,
          undefined,
          undefined,
          undefined,
          ctx.queries
        )
      );
    }

    case "LEADER_PROPERTY": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const data = ctx.cardDb.get(p.leader.cardId);
      if (!data) return false;
      const prop = cond.property;
      if ("power" in prop) {
        const power = ctx.queries.getEffectivePower(
          p.leader,
          data,
          state,
          ctx.cardDb
        );
        return matchesNumericRange(power, prop.power);
      }
      if ("color_includes" in prop) {
        return data.color.some((c) => c.toUpperCase() === prop.color_includes);
      }
      if ("color" in prop) {
        return (
          data.color.length === 1 && data.color[0].toUpperCase() === prop.color
        );
      }
      if ("trait" in prop) {
        // {Type} notation — exact match in types array.
        // OPT-227: a Leader "treated as all types" satisfies any trait check.
        if (cardTreatsAsAll(data, "types")) return true;
        return data.types?.includes(prop.trait) ?? false;
      }
      if ("trait_contains" in prop) {
        // "type including X" — substring match
        if (cardTreatsAsAll(data, "types")) return true;
        return (
          data.types?.some((t) => t.includes(prop.trait_contains as string)) ??
          false
        );
      }
      if ("attribute" in prop) {
        if (cardTreatsAsAll(data, "attributes")) return true;
        const want = prop.attribute.toUpperCase();
        return (
          (data.attribute?.some((a) => a.toUpperCase() === want) ?? false) ||
          ctx.queries.hasGrantedAttribute(p.leader, want, state, ctx.cardDb)
        );
      }
      if ("name" in prop) {
        if (cardTreatsAsAll(data, "names")) return true;
        return data.name === prop.name;
      }
      if ("name_includes" in prop) {
        if (cardTreatsAsAll(data, "names")) return true;
        return data.name.includes(prop.name_includes as string);
      }
      if ("multicolored" in prop) {
        const isMulti = data.color.length > 1;
        return prop.multicolored ? isMulti : !isMulti;
      }
      return false;
    }

    case "SELF_POWER": {
      const card = findInstanceById(state, ctx.sourceCardInstanceId);
      if (!card) return false;
      const data = ctx.cardDb.get(card.cardId);
      if (!data) return false;
      return compareNum(
        ctx.queries.getEffectivePower(card, data, state, ctx.cardDb),
        cond.operator,
        cond.value
      );
    }

    case "SELF_COST": {
      const card = findInstanceById(state, ctx.sourceCardInstanceId);
      if (!card) return false;
      const data = ctx.cardDb.get(card.cardId);
      if (!data) return false;
      // OPT-450: zone-aware — an on-field source must not see pending
      // play-time discounts; a hand-zone source (Event predicates) keeps them.
      return compareNum(
        ctx.queries.getEffectiveCostForRead(card, data, state, ctx.cardDb),
        cond.operator,
        cond.value
      );
    }

    case "SELF_STATE": {
      const card = findInstanceById(state, ctx.sourceCardInstanceId);
      if (!card) return false;
      return card.state === cond.required_state;
    }

    case "NO_BASE_EFFECT": {
      const card = findInstanceById(state, ctx.sourceCardInstanceId);
      if (!card) return false;
      const data = ctx.cardDb.get(card.cardId);
      if (!data) return false;
      return !hasBaseEffect(data);
    }

    case "HAS_EFFECT_TYPE":
    case "LACKS_EFFECT_TYPE": {
      // These are typically used as target filters, not standalone conditions
      // For standalone use, check the source card
      const card = findInstanceById(state, ctx.sourceCardInstanceId);
      if (!card) return false;
      const data = ctx.cardDb.get(card.cardId);
      if (!data) return false;
      const has = hasEffectKeyword(data, cond.effect_type);
      return cond.type === "HAS_EFFECT_TYPE" ? has : !has;
    }

    case "COMPARATIVE": {
      const selfPlayer = state.players[ctx.controller];
      const oppPlayer = state.players[ctx.controller === 0 ? 1 : 0];
      const selfVal = getMetricValue(selfPlayer, cond.metric);
      const oppVal = getMetricValue(oppPlayer, cond.metric);
      const margin = cond.margin ?? 0;
      return compareNum(selfVal, cond.operator, oppVal + margin);
    }

    case "COMBINED_TOTAL": {
      const p0Val = getMetricValue(state.players[0], cond.metric);
      const p1Val = getMetricValue(state.players[1], cond.metric);
      return compareNum(p0Val + p1Val, cond.operator, cond.value);
    }

    case "WAS_PLAYED_THIS_TURN": {
      const card = findInstanceById(state, ctx.sourceCardInstanceId);
      return card?.turnPlayed === state.turn.number;
    }

    case "ACTION_PERFORMED_THIS_TURN": {
      // Check actionsPerformedThisTurn for matching action references
      const _actionType = cond.action;
      return state.turn.actionsPerformedThisTurn.some((a) => {
        if (_actionType === "ACTIVATED_EVENT") {
          if (
            a.actionType !== "USE_COUNTER_EVENT" &&
            a.actionType !== "PLAY_CARD"
          )
            return false;
          return matchesPerformedCard(
            state,
            a,
            cond.controller,
            cond.filter,
            "EVENT",
            ctx
          );
        }
        if (_actionType === "PLAYED_CHARACTER") {
          if (a.actionType !== "PLAY_CARD") return false;
          return matchesPerformedCard(
            state,
            a,
            cond.controller,
            cond.filter,
            "CHARACTER",
            ctx
          );
        }
        if (_actionType === "USED_BLOCKER") {
          if (a.actionType !== "DECLARE_BLOCKER") return false;
          return matchesPerformedCard(
            state,
            a,
            cond.controller,
            cond.filter,
            "CHARACTER",
            ctx
          );
        }
        if (_actionType === "ATTACKED") {
          // Resolution-time entries (OPT-413) carry the attacker and the
          // FINAL battle target, so controller/filter scoping is reliable —
          // OP12-020 Zoro ("battled a Character") and the OP16-080 redirect
          // ruling (redirected-to-Leader must NOT count as a Character battle).
          if (a.actionType === "ATTACKED") {
            // Card-scoping (OPT-424): "SELF_CARD" requires that THIS source card
            // performed the attack — OP12-020 Zoro's "If this Leader battles..."
            // must not fire when a friendly Character did the battling. Follows
            // the ctx.sourceCardInstanceId self-scoping pattern used elsewhere.
            if (
              cond.source === "SELF_CARD" &&
              a.attackerInstanceId !== ctx.sourceCardInstanceId
            )
              return false;
            if (
              cond.controller &&
              cond.controller !== "EITHER" &&
              cond.controller !== "ANY"
            ) {
              const attackerPi =
                cond.controller === "OPPONENT"
                  ? ctx.controller === 0
                    ? 1
                    : 0
                : ctx.controller;
              if (a.controller !== attackerPi) return false;
            }
            const wantType = (cond.filter as { card_type?: string } | undefined)
              ?.card_type;
            if (wantType && a.targetType !== wantType.toUpperCase())
              return false;
            return true;
          }
          // Legacy declaration-time entries (persisted mid-turn states):
          // only satisfy unscoped conditions. A SELF_CARD-scoped condition can
          // never be confirmed from a declaration-time entry (no attacker id).
          return (
            a.actionType === "DECLARE_ATTACK" &&
            !cond.controller &&
            !cond.filter &&
            !cond.source
          );
        }
        if (_actionType === "CHARACTER_KO") {
          if (a.actionType !== "CHARACTER_KO") return false;
          // cond.controller scopes whose character was K.O.'d (OP16-100:
          // OPPONENT = an opponent character). Unscoped/EITHER matches any.
          if (
            !cond.controller ||
            cond.controller === "EITHER" ||
            cond.controller === "ANY"
          )
            return true;
          const ownerPi =
            cond.controller === "OPPONENT"
              ? ctx.controller === 0
                ? 1
                : 0
            : ctx.controller;
          return a.controller === ownerPi;
        }
        return false;
      });
    }

    case "FACE_UP_LIFE": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const faceUpCount = p.life.filter((l) => l.face === "UP").length;
      if (cond.operator && cond.value !== undefined) {
        return compareNum(faceUpCount, cond.operator, cond.value);
      }
      return faceUpCount > 0;
    }

    case "CARD_TYPE_IN_ZONE": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const zone = cond.zone.toUpperCase();
      let cards: Array<{ cardId: string }> = [];
      if (zone === "TRASH") cards = p.trash;
      else if (zone === "HAND") cards = p.hand;
      else if (zone === "DECK") cards = p.deck;
      else if (zone === "FIELD") cards = getFieldCards(p);
      const count = cards.filter((c) => {
        const data = ctx.cardDb.get(c.cardId);
        return data?.type?.toUpperCase() === cond.card_type.toUpperCase();
      }).length;
      return compareNum(count, cond.operator, cond.value);
    }

    case "COMBINED_ZONE_COUNT": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      // OPT-257 (F4): see TRASH_COUNT — staging cards are excluded from trash.
      const stagingIds = new Set(state.turn.triggerStagingInstanceIds ?? []);
      let total = 0;
      for (const zone of cond.zones) {
        const z = zone.toUpperCase();
        if (z === "LIFE") total += p.life.length;
        else if (z === "HAND") total += p.hand.length;
        else if (z === "TRASH")
          total += p.trash.filter((c) => !stagingIds.has(c.instanceId)).length;
        else if (z === "DECK") total += p.deck.length;
      }
      return compareNum(total, cond.operator, cond.value);
    }

    case "BOARD_WIDE_EXISTENCE": {
      const allChars = [
        ...state.players[0].characters.filter(isPresent),
        ...state.players[1].characters.filter(isPresent),
      ];
      const matching = allChars.filter((c) =>
        matchesFilter(
          c,
          cond.filter,
          ctx.cardDb,
          state,
          undefined,
          undefined,
          undefined,
          ctx.queries
        )
      );
      if (cond.count) {
        return compareNum(
          matching.length,
          cond.count.operator,
          cond.count.value
        );
      }
      return matching.length > 0;
    }

    case "RESTED_CARD_COUNT": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      let count = 0;
      if (p.leader.state === "RESTED") count++;
      count += p.characters.filter(
        (c) => c !== null && c.state === "RESTED"
      ).length;
      if (p.stage?.state === "RESTED") count++;
      count += p.donCostArea.filter((d) => d.state === "RESTED").length;
      return compareNum(count, cond.operator, cond.value);
    }

    case "DON_GIVEN": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      if (cond.mode === "ANY_CARD_HAS_DON") {
        const allCards = [p.leader, ...p.characters.filter(isPresent)];
        return allCards.some((c) => c.attachedDon.length > 0);
      }
      // SPECIFIC_CARD mode — check if the source card has DON attached
      if (cond.mode === "SPECIFIC_CARD") {
        const sourceCard = findCardInstance(state, ctx.sourceCardInstanceId);
        if (!sourceCard) return false;
        const donCount = sourceCard.attachedDon.length;
        if (cond.operator && cond.value !== undefined) {
          return compareNum(donCount, cond.operator, cond.value);
        }
        return donCount > 0;
      }
      return false;
    }

    case "TURN_COUNT": {
      // Turn counting: each player's turn number = ceil(turn.number / 2) for alternating turns
      // Simplified: use the global turn number for now
      const turnNum = state.turn.number;
      // For the controller, their "turn number" depends on order
      // Player 0 has turns 1, 3, 5, ... → their Nth turn = 2N-1
      // Player 1 has turns 2, 4, 6, ... → their Nth turn = 2N
      const pi = resolveController(cond.controller, ctx.controller);
      const playerTurnCount = Math.ceil(
        pi === 0 ? (turnNum + 1) / 2 : turnNum / 2
      );
      return compareNum(playerTurnCount, cond.operator, cond.value);
    }

    case "IS_MY_TURN": {
      const pi = resolveController(cond.controller, ctx.controller);
      return state.turn.activePlayerIndex === pi;
    }

    case "PLAY_METHOD": {
      const playEvent = [...state.eventLog]
        .reverse()
        .find(
        (e): e is Extract<GameEvent, { type: "CARD_PLAYED" }> =>
            e.type === "CARD_PLAYED" &&
            e.payload.cardInstanceId === ctx.sourceCardInstanceId
      );
      if (!playEvent) return true;
      const source = playEvent.payload.source;
      if (cond.method === "FROM_HAND") return source === "FROM_HAND";
      if (cond.method === "BY_EFFECT")
        return source === "BY_EFFECT" || source === "PLAY_SELF";
      if (
        cond.method === "BY_CHARACTER_EFFECT" ||
        cond.method === "BY_EVENT_EFFECT"
      )
        return source === "BY_EFFECT";
      return true;
    }

    case "SOURCE_PROPERTY": {
      const contextMap: Record<string, GameEventType> = {
        KO_BY_EFFECT: "CARD_KO",
        KO_IN_BATTLE: "CARD_KO",
        REMOVAL_BY_EFFECT: "CARD_RETURNED_TO_HAND",
        REST_BY_EFFECT: "CARD_STATE_CHANGED",
      };
      const eventType = contextMap[cond.context];
      if (!eventType) return true;
      const sourceEvent = [...state.eventLog]
        .reverse()
        .find(
          (e) =>
            e.type === eventType &&
            "cardInstanceId" in e.payload &&
            e.payload.cardInstanceId === ctx.sourceCardInstanceId
      );
      if (!sourceEvent) return true;
      const causeCardId =
        "causeCardInstanceId" in sourceEvent.payload
          ? (sourceEvent.payload as { causeCardInstanceId?: string })
              .causeCardInstanceId
        : undefined;
      if (!causeCardId) return true;
      const causeCard = findInstanceById(state, causeCardId);
      if (!causeCard) return true;
      return matchesFilter(
        causeCard,
        cond.source_filter,
        ctx.cardDb,
        state,
        undefined,
        undefined,
        undefined,
        ctx.queries
      );
    }

    case "REVEALED_CARD_PROPERTY": {
      if (!ctx.resultRefs) return false;
      const result = ctx.resultRefs.get(cond.result_ref);
      if (!result || result.targetInstanceIds.length === 0) return false;
      const revealedCards: CardInstance[] = result.revealedCards
        ? result.revealedCards.map((snapshot) => ({
            instanceId: snapshot.instanceId,
            cardId: snapshot.cardId,
            zone: snapshot.source === "LIFE_TOP" ? "LIFE" : "DECK",
            state: "ACTIVE",
            attachedDon: [],
            turnPlayed: null,
            controller: snapshot.controller,
            owner: snapshot.controller,
          }))
        : result.targetInstanceIds.flatMap((instanceId) => {
            const card = findInstanceById(state, instanceId);
            return card ? [card] : [];
          });
      for (const card of revealedCards) {
        if (
          cond.filter &&
          !matchesFilter(
            card,
            cond.filter,
            ctx.cardDb,
            state,
            undefined,
            undefined,
            undefined,
            ctx.queries
          )
        )
          continue;
        if (cond.compare) {
          const data = ctx.cardDb.get(card.cardId);
          if (!data) continue;
          const expected = resolveConditionNumericValue(
            cond.compare.value,
            ctx.resultRefs
          );
          if (expected === null) continue;
          const actual =
            cond.compare.property === "COST" ? (data.cost ?? 0) : 0;
          if (!compareNum(actual, cond.compare.operator, expected)) continue;
        }
        if (cond.filter || cond.compare) return true;
      }
      return false;
    }

    default:
      return true;
  }
}

function resolveConditionNumericValue(
  value: number | DynamicValue,
  resultRefs: Map<string, EffectResult>
): number | null {
  if (typeof value === "number") return value;
  if (value.type === "FIXED") return value.value;
  if (value.type === "ACTION_RESULT")
    return resultRefs.get(value.ref)?.count ?? null;
  if (value.type === "CHOSEN_VALUE") {
    const chosen = resultRefs.get(value.ref)?.value;
    return typeof chosen === "number" && Number.isInteger(chosen)
      ? chosen
      : null;
  }
  return null;
}

/**
 * Match a card-backed performed action against its player scope, semantic card
 * category, and optional TargetFilter (OPT-443).
 *
 * The acted card is reconstructed from the pre-execution snapshot recorded by
 * the pipeline. This matters for Events, which have already moved to trash
 * with a new instance id by the time a later condition is evaluated. Legacy
 * records without a snapshot fail closed: accepting them would reintroduce the
 * PLAY_CARD-is-every-card-type false positives this helper prevents.
 */
function matchesPerformedCard(
  state: GameState,
  action: GameState["turn"]["actionsPerformedThisTurn"][number],
  controller: Controller | undefined,
  filter: TargetFilter | undefined,
  requiredCardType: "CHARACTER" | "EVENT",
  ctx: ConditionContext
): boolean {
  if (action.controller === undefined || !action.cardId || !action.cardType)
    return false;

  if (controller && controller !== "EITHER" && controller !== "ANY") {
    const expectedController =
      controller === "SELF" ? ctx.controller : ctx.controller === 0 ? 1 : 0;
    if (action.controller !== expectedController) return false;
  }

  if (action.cardType.toUpperCase() !== requiredCardType) return false;
  if (!filter) return true;

  const cardData = ctx.cardDb.get(action.cardId);
  if (!cardData) return false;

  // Use the recorded printed values, not a post-hoc zone lookup. Card data is
  // otherwise reused so all printed-property TargetFilter fields (name, type,
  // traits, attributes, keywords, etc.) share the canonical matcher.
  const snapshotCardData: CardData = {
    ...cardData,
    cost: action.baseCost ?? cardData.cost,
  };
  const snapshotCardDb = new Map(ctx.cardDb);
  snapshotCardDb.set(action.cardId, snapshotCardData);
  const snapshotCard: CardInstance = {
    instanceId: `performed-${action.timestamp}-${action.cardId}`,
    cardId: action.cardId,
    zone: action.actionType === "DECLARE_BLOCKER" ? "CHARACTER" : "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: action.controller,
    owner: action.controller,
  };

  return matchesFilter(
    snapshotCard,
    filter,
    snapshotCardDb,
    state,
    ctx.resultRefs,
    action.baseCost,
    ctx.controller,
    ctx.queries
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compareNum(a: number, op: NumericOperator, b: number): boolean {
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    default:
      return false;
  }
}

function resolveController(c: Controller, selfIndex: 0 | 1): 0 | 1 {
  if (c === "SELF") return selfIndex;
  if (c === "OPPONENT") return selfIndex === 0 ? 1 : 0;
  return selfIndex; // EITHER/ANY → check both externally
}

function getPlayerByController(
  state: GameState,
  controller: Controller,
  selfIndex: 0 | 1
): PlayerState {
  return state.players[resolveController(controller, selfIndex)];
}

function getDonFieldCount(
  p: PlayerState,
  state?: import("./effect-types.js").CardState
): number {
  if (state) {
    return p.donCostArea.filter((don) => don.state === state).length;
  }
  let count = p.donCostArea.length;
  count += p.leader.attachedDon.length;
  for (const c of p.characters) if (c) count += c.attachedDon.length;
  return count;
}

function getFieldCards(p: PlayerState): CardInstance[] {
  const cards: CardInstance[] = [p.leader, ...p.characters.filter(isPresent)];
  if (p.stage) cards.push(p.stage);
  return cards;
}

function findInstanceById(
  state: GameState,
  instanceId: string
): CardInstance | null {
  return findCardInstance(state, instanceId);
}

function getMetricValue(p: PlayerState, metric: string): number {
  switch (metric) {
    case "LIFE_COUNT":
      return p.life.length;
    case "DON_FIELD_COUNT":
      return getDonFieldCount(p);
    case "CHARACTER_COUNT":
      return p.characters.filter(Boolean).length;
    case "HAND_COUNT":
      return p.hand.length;
    default:
      return 0;
  }
}

/**
 * OPT-249: Does this card have a "base effect" per Bandai's rulings?
 *
 * Relevant comprehensive rules:
 *   • 2-8-5  — A card without card text may be described as having "no base effect".
 *   • 2-11-2 — [Trigger] is part of the card text (but is NOT counted as a base
 *              effect for filter purposes — it fires only from Life).
 *   • 8-2-2  — Cards with invalid (negated) effects are NOT treated as "no base
 *              effect". The predicate is schema-level, not runtime-level.
 *
 * Implementation notes:
 *   • This is a pure function over CardData. It intentionally does NOT consult
 *     runtime state (activeEffects, EFFECTS_NEGATED, etc.) so that a Character
 *     whose [On Play] has been negated still reports `true` per 8-2-2.
 *   • We rely on the pipeline invariant that `data.effectText` holds only the
 *     non-Trigger card text; the [Trigger] body lives in `data.triggerText`
 *     (see `pipeline/transform.ts:163-164`). So a non-empty `effectText`
 *     means the card has printed text other than [Trigger] — which covers
 *     [On Play], [When Attacking], [Activate: Main], [Main], [Counter],
 *     keyword-only bodies (`[Blocker] (...)`, `[Rush] (...)`), passive
 *     modifiers, etc. An empty `effectText` covers truly vanilla cards and
 *     Trigger-only cards.
 *   • We deliberately do NOT consult `data.keywords` here: the KeywordSet
 *     is derived from both `effectText` AND `triggerText` (see
 *     `src/lib/game/keywords.ts`), so a card whose only mention of "Blocker"
 *     lives inside its [Trigger] body would yield a false positive.
 *   • The printed counter symbol (`data.counter` as a number) is a stat, not
 *     an effect — it does not appear in `effectText` and correctly does not
 *     flip this predicate.
 */
export function hasBaseEffect(data: CardData): boolean {
  return data.effectText.trim().length > 0;
}

function hasEffectKeyword(data: CardData, effectType: string): boolean {
  const kw = data.keywords;
  switch (effectType) {
    case "ON_PLAY":
      return data.effectText.includes("[On Play]");
    case "WHEN_ATTACKING":
      return data.effectText.includes("[When Attacking]");
    case "ON_KO":
      return data.effectText.includes("[On K.O.]");
    case "ON_BLOCK":
      return data.effectText.includes("[On Block]");
    case "COUNTER":
      return data.effectText.includes("[Counter]");
    case "TRIGGER":
      return kw.trigger;
    case "ACTIVATE_MAIN":
      return data.effectText.includes("[Activate: Main]");
    case "BLOCKER":
      return kw.blocker;
    case "RUSH":
      return kw.rush || kw.rushCharacter;
    case "DOUBLE_ATTACK":
      return kw.doubleAttack;
    case "BANISH":
      return kw.banish;
    default:
      return false;
  }
}

/**
 * OPT-227: Does this card have the OP-15 Enel-style "treated as all
 * names/types/attributes" blanket rule modification for the given kind?
 *
 * Applied to identity checks in both positive ("has name X") and negative
 * ("exclude name X") directions — per Bandai rulings, the blanket is
 * omnidirectional, so defender protections keyed on the attacker's
 * attributes still apply.
 */
export function cardTreatsAsAll(
  data: CardData | undefined,
  kind: "names" | "types" | "attributes"
): boolean {
  const mods = data?.effectSchema?.rule_modifications ?? [];
  return mods.some(
    (m) => m.rule_type === "TREATED_AS_ALL_IDENTITIES" && m[kind] === true
  );
}

/**
 * Check if a card instance matches a TargetFilter.
 * Used by condition evaluator and target resolver.
 */
function toSharedTargetFilterCard(
  card: CardInstance,
  data: CardData
): SharedTargetFilterCard {
  return {
    controller: card.controller,
    cost: data.cost ?? 0,
    baseCost: data.cost ?? 0,
    power: data.power ?? 0,
    basePower: data.power ?? 0,
    colors: data.color,
    traits: data.types ?? [],
    name: data.name,
    attributes: data.attribute ?? [],
    cardType: data.type,
    state: card.state,
    attachedDonCount: card.attachedDon.length,
    instanceId: card.instanceId,
    hasTrigger: data.keywords.trigger,
    hasEffect: Boolean(data.effectText?.trim()),
    hasBaseEffect: hasBaseEffect(data),
    hasCounter: data.counter !== null && data.counter !== undefined,
    treatsAsAllNames: cardTreatsAsAll(data, "names"),
    treatsAsAllTraits: cardTreatsAsAll(data, "types"),
    treatsAsAllAttributes: cardTreatsAsAll(data, "attributes"),
  };
}

/**
 * Check if a card instance matches a TargetFilter.
 * Used by condition evaluation, modifiers, replacements, and target resolution.
 */
export function matchesFilter(
  card: CardInstance,
  filter: TargetFilter,
  cardDb: Map<string, CardData>,
  state: GameState,
  resultRefs?: Map<string, EffectResult>,
  costOverride?: number,
  filterController?: 0 | 1,
  queries?: ConditionQueryServices
): boolean {
  const data = cardDb.get(card.cardId);
  if (!data) return false;

  const sharedCard = toSharedTargetFilterCard(card, data);
  const getReferencedCard = (
    ref: string
  ): SharedTargetFilterCard | undefined => {
    const targetId = resultRefs?.get(ref)?.targetInstanceIds[0];
    if (!targetId) return undefined;
    const referenced = findInstanceById(state, targetId);
    if (!referenced) return undefined;
    const referencedData = cardDb.get(referenced.cardId);
    return referencedData
      ? toSharedTargetFilterCard(referenced, referencedData)
      : undefined;
  };

  return matchesTargetFilter(sharedCard, filter, {
    filterController,
    costOverride,
    getEffectiveCost: queries
      ? () => queries.getEffectiveCostForRead(card, data, state, cardDb)
      : undefined,
    getEffectivePower: queries
      ? () => queries.getEffectivePower(card, data, state, cardDb)
      : undefined,
    hasKeyword: queries
      ? (_candidate, keyword) => {
          if (
            keyword !== "BLOCKER" &&
            keyword !== "RUSH" &&
            keyword !== "RUSH_CHARACTER" &&
            keyword !== "DOUBLE_ATTACK" &&
            keyword !== "BANISH" &&
            keyword !== "UNBLOCKABLE"
          ) {
            return true;
          }
          return queries.hasEffectiveKeyword(
            card,
            data,
            keyword,
            state,
            cardDb
          );
        }
      : undefined,
    hasGrantedAttribute: queries
      ? (_candidate, attribute) =>
          queries.hasGrantedAttribute(card, attribute, state, cardDb)
      : undefined,
    hasEffectKeyword: (_candidate, keyword) => hasEffectKeyword(data, keyword),
    resolveDynamicValue: (value) => {
      if (value.type !== "GAME_STATE") return null;
      const source =
        "source" in value && typeof value.source === "string"
          ? value.source
          : "";
      const controller =
        "controller" in value && typeof value.controller === "string"
          ? value.controller
          : undefined;
      return resolveGameStateValue(source, state, controller, card.controller);
    },
    getReferencedCard,
    getReferencedInstanceIds: (ref) => resultRefs?.get(ref)?.targetInstanceIds,
  });
}

function resolveGameStateValue(
  source: string,
  state: GameState,
  sourceController?: string,
  ctxController?: 0 | 1
): number | null {
  const pi = ctxController ?? 0;
  const opp: 0 | 1 = pi === 0 ? 1 : 0;
  const resolvedPi = sourceController === "OPPONENT" ? opp : pi;
  const p = state.players[resolvedPi];
  switch (source) {
    case "DON_FIELD_COUNT":
      return p.donCostArea.length;
    case "OPPONENT_DON_FIELD_COUNT":
      return state.players[opp].donCostArea.length;
    case "LIFE_COUNT":
      return p.life.length;
    case "OPPONENT_LIFE_COUNT":
      return state.players[opp].life.length;
    case "COMBINED_LIFE_COUNT":
      return state.players[0].life.length + state.players[1].life.length;
    case "HAND_COUNT":
      return p.hand.length;
    case "DECK_COUNT":
      return p.deck.length;
    case "RESTED_CARD_COUNT": {
      const chars = p.characters.filter(isPresent);
      return chars.filter((c) => c.state === "RESTED").length;
    }
    default:
      return null;
  }
}

function matchesNumericRange(value: number, range: NumericRange): boolean {
  if ("any_of" in range) {
    return range.any_of.some((r) => matchesNumericRange(value, r));
  }
  if ("min" in range && "max" in range) {
    return value >= range.min && value <= range.max;
  }
  if ("operator" in range) {
    const expected = typeof range.value === "number" ? range.value : 0;
    return compareNum(value, range.operator, expected);
  }
  return true;
}
