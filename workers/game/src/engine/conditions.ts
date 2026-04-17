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
import type { CardData, CardInstance, GameEvent, GameEventType, GameState, PlayerState } from "../types.js";
import { getEffectivePower } from "./modifiers.js";
import { findCardInstance } from "./state.js";

export interface ConditionContext {
  /** The card instance the effect is on */
  sourceCardInstanceId: string;
  /** The controller of the source card */
  controller: 0 | 1;
  /** Card database for property lookups */
  cardDb: Map<string, CardData>;
  /** Result refs from prior actions in the chain (for REVEALED_CARD_PROPERTY) */
  resultRefs?: Map<string, EffectResult>;
}

/**
 * Evaluate a condition tree against the current game state.
 */
export function evaluateCondition(
  state: GameState,
  condition: Condition,
  ctx: ConditionContext,
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
  ctx: ConditionContext,
): boolean {
  switch (cond.type) {
    case "LIFE_COUNT":
      return compareNum(
        getPlayerByController(state, cond.controller, ctx.controller).life.length,
        cond.operator,
        cond.value,
      );

    case "HAND_COUNT":
      return compareNum(
        getPlayerByController(state, cond.controller, ctx.controller).hand.length,
        cond.operator,
        cond.value,
      );

    case "TRASH_COUNT":
      return compareNum(
        getPlayerByController(state, cond.controller, ctx.controller).trash.length,
        cond.operator,
        cond.value,
      );

    case "DECK_COUNT":
      return compareNum(
        getPlayerByController(state, cond.controller, ctx.controller).deck.length,
        cond.operator,
        cond.value,
      );

    case "DON_FIELD_COUNT": {
      if (cond.controller === "EITHER") {
        return (
          compareNum(getDonFieldCount(state.players[0]), cond.operator, cond.value) ||
          compareNum(getDonFieldCount(state.players[1]), cond.operator, cond.value)
        );
      }
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      return compareNum(getDonFieldCount(p), cond.operator, cond.value);
    }

    case "ACTIVE_DON_COUNT": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const activeCount = p.donCostArea.filter((d) => d.state === "ACTIVE").length;
      return compareNum(activeCount, cond.operator, cond.value);
    }

    case "ALL_DON_STATE": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      if (p.donCostArea.length === 0) return true; // vacuously true
      return p.donCostArea.every((d) => d.state === cond.required_state);
    }

    case "CARD_ON_FIELD": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const cards = getFieldCards(p);
      const matching = cards.filter((c) => {
        if (cond.exclude_self && c.instanceId === ctx.sourceCardInstanceId) return false;
        return matchesFilter(c, cond.filter, ctx.cardDb, state);
      });
      if (cond.count) {
        return compareNum(matching.length, cond.count.operator, cond.count.value);
      }
      return matching.length > 0;
    }

    case "MULTIPLE_NAMED_CARDS": {
      // OPT-227: a field card "treated as all names" satisfies any required name.
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const cards = getFieldCards(p);
      return cond.names.every((name) =>
        cards.some((c) => {
          const data = ctx.cardDb.get(c.cardId);
          return data?.name === name || cardTreatsAsAll(data, "names");
        }),
      );
    }

    case "NAMED_CARD_WITH_PROPERTY": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const cards = getFieldCards(p);
      return cards.some((c) => {
        const data = ctx.cardDb.get(c.cardId);
        if (!data) return false;
        const nameMatches = data.name === cond.name || cardTreatsAsAll(data, "names");
        if (!nameMatches) return false;
        if (cond.property.power) {
          const power = getEffectivePower(c, data, state, ctx.cardDb);
          if (!matchesNumericRange(power, cond.property.power)) return false;
        }
        if (cond.property.cost) {
          if (!matchesNumericRange(data.cost ?? 0, cond.property.cost)) return false;
        }
        return true;
      });
    }

    case "FIELD_PURITY": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const chars = p.characters.filter(Boolean) as CardInstance[];
      if (chars.length === 0) return true; // vacuously true
      return chars.every((c) => matchesFilter(c, cond.filter, ctx.cardDb, state));
    }

    case "LEADER_PROPERTY": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      const data = ctx.cardDb.get(p.leader.cardId);
      if (!data) return false;
      const prop = cond.property;
      if ("power" in prop) {
        const power = getEffectivePower(p.leader, data, state, ctx.cardDb);
        return matchesNumericRange(power, prop.power);
      }
      if ("color_includes" in prop) {
        return data.color.some((c) => c.toUpperCase() === prop.color_includes);
      }
      if ("color" in prop) {
        return data.color.length === 1 && data.color[0].toUpperCase() === prop.color;
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
        return data.types?.some((t) => t.includes(prop.trait_contains as string)) ?? false;
      }
      if ("attribute" in prop) {
        if (cardTreatsAsAll(data, "attributes")) return true;
        const want = prop.attribute.toUpperCase();
        return data.attribute?.some((a) => a.toUpperCase() === want) ?? false;
      }
      if ("name" in prop) {
        if (cardTreatsAsAll(data, "names")) return true;
        return data.name === prop.name;
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
      return compareNum(getEffectivePower(card, data, state, ctx.cardDb), cond.operator, cond.value);
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
      return !data.effectText || data.effectText.trim() === "";
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
        if (_actionType === "ACTIVATED_EVENT") return a.actionType === "USE_COUNTER_EVENT" || a.actionType === "PLAY_CARD";
        if (_actionType === "PLAYED_CHARACTER") return a.actionType === "PLAY_CARD";
        if (_actionType === "USED_BLOCKER") return a.actionType === "DECLARE_BLOCKER";
        if (_actionType === "ATTACKED") return a.actionType === "DECLARE_ATTACK";
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
      let total = 0;
      for (const zone of cond.zones) {
        const z = zone.toUpperCase();
        if (z === "LIFE") total += p.life.length;
        else if (z === "HAND") total += p.hand.length;
        else if (z === "TRASH") total += p.trash.length;
        else if (z === "DECK") total += p.deck.length;
      }
      return compareNum(total, cond.operator, cond.value);
    }

    case "BOARD_WIDE_EXISTENCE": {
      const allChars = [...state.players[0].characters.filter(Boolean) as CardInstance[], ...state.players[1].characters.filter(Boolean) as CardInstance[]];
      const matching = allChars.filter((c) => matchesFilter(c, cond.filter, ctx.cardDb, state));
      if (cond.count) {
        return compareNum(matching.length, cond.count.operator, cond.count.value);
      }
      return matching.length > 0;
    }

    case "RESTED_CARD_COUNT": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      let count = 0;
      if (p.leader.state === "RESTED") count++;
      count += p.characters.filter((c) => c !== null && c.state === "RESTED").length;
      if (p.stage?.state === "RESTED") count++;
      count += p.donCostArea.filter((d) => d.state === "RESTED").length;
      return compareNum(count, cond.operator, cond.value);
    }

    case "DON_GIVEN": {
      const p = getPlayerByController(state, cond.controller, ctx.controller);
      if (cond.mode === "ANY_CARD_HAS_DON") {
        const allCards = [p.leader, ...p.characters.filter(Boolean) as CardInstance[]];
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
        pi === 0 ? (turnNum + 1) / 2 : turnNum / 2,
      );
      return compareNum(playerTurnCount, cond.operator, cond.value);
    }

    case "IS_MY_TURN": {
      const pi = resolveController(cond.controller, ctx.controller);
      return state.turn.activePlayerIndex === pi;
    }

    case "PLAY_METHOD": {
      const playEvent = [...state.eventLog].reverse().find(
        (e): e is Extract<GameEvent, { type: "CARD_PLAYED" }> =>
          e.type === "CARD_PLAYED" && e.payload.cardInstanceId === ctx.sourceCardInstanceId,
      );
      if (!playEvent) return true;
      const source = playEvent.payload.source;
      if (cond.method === "FROM_HAND") return source === "FROM_HAND";
      if (cond.method === "BY_EFFECT") return source === "BY_EFFECT" || source === "PLAY_SELF";
      if (cond.method === "BY_CHARACTER_EFFECT" || cond.method === "BY_EVENT_EFFECT") return source === "BY_EFFECT";
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
      const sourceEvent = [...state.eventLog].reverse().find(
        (e) => e.type === eventType && "cardInstanceId" in e.payload && e.payload.cardInstanceId === ctx.sourceCardInstanceId,
      );
      if (!sourceEvent) return true;
      const causeCardId = "causeCardInstanceId" in sourceEvent.payload
        ? (sourceEvent.payload as { causeCardInstanceId?: string }).causeCardInstanceId
        : undefined;
      if (!causeCardId) return true;
      const causeCard = findInstanceById(state, causeCardId);
      if (!causeCard) return true;
      return matchesFilter(causeCard, cond.source_filter, ctx.cardDb, state);
    }

    case "REVEALED_CARD_PROPERTY": {
      if (!ctx.resultRefs) return false;
      const result = ctx.resultRefs.get(cond.result_ref);
      if (!result || result.targetInstanceIds.length === 0) return false;
      for (const instanceId of result.targetInstanceIds) {
        const card = findInstanceById(state, instanceId);
        if (!card) continue;
        if (matchesFilter(card, cond.filter, ctx.cardDb, state)) return true;
      }
      return false;
    }

    default:
      return true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compareNum(a: number, op: NumericOperator, b: number): boolean {
  switch (op) {
    case "==": return a === b;
    case "!=": return a !== b;
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    default: return false;
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
  selfIndex: 0 | 1,
): PlayerState {
  return state.players[resolveController(controller, selfIndex)];
}

function getDonFieldCount(p: PlayerState): number {
  let count = p.donCostArea.length;
  count += p.leader.attachedDon.length;
  for (const c of p.characters) if (c) count += c.attachedDon.length;
  return count;
}

function getFieldCards(p: PlayerState): CardInstance[] {
  const cards: CardInstance[] = [p.leader, ...p.characters.filter(Boolean) as CardInstance[]];
  if (p.stage) cards.push(p.stage);
  return cards;
}

function findInstanceById(state: GameState, instanceId: string): CardInstance | null {
  for (const player of state.players) {
    if (player.leader.instanceId === instanceId) return player.leader;
    const char = player.characters.find((c) => c?.instanceId === instanceId);
    if (char) return char;
    if (player.stage?.instanceId === instanceId) return player.stage;
    const hand = player.hand.find((c) => c.instanceId === instanceId);
    if (hand) return hand;
    const deck = player.deck.find((c) => c.instanceId === instanceId);
    if (deck) return deck;
    const trash = player.trash.find((c) => c.instanceId === instanceId);
    if (trash) return trash;
    const life = player.life.find((c: any) => c.instanceId === instanceId);
    if (life) return life as unknown as CardInstance;
  }
  return null;
}

function getMetricValue(p: PlayerState, metric: string): number {
  switch (metric) {
    case "LIFE_COUNT": return p.life.length;
    case "DON_FIELD_COUNT": return getDonFieldCount(p);
    case "CHARACTER_COUNT": return p.characters.filter(Boolean).length;
    default: return 0;
  }
}

function hasEffectKeyword(data: CardData, effectType: string): boolean {
  const kw = data.keywords;
  switch (effectType) {
    case "ON_PLAY": return data.effectText.includes("[On Play]");
    case "WHEN_ATTACKING": return data.effectText.includes("[When Attacking]");
    case "ON_KO": return data.effectText.includes("[On K.O.]");
    case "ON_BLOCK": return data.effectText.includes("[On Block]");
    case "COUNTER": return data.effectText.includes("[Counter]");
    case "TRIGGER": return kw.trigger;
    case "ACTIVATE_MAIN": return data.effectText.includes("[Activate: Main]");
    case "BLOCKER": return kw.blocker;
    case "RUSH": return kw.rush || kw.rushCharacter;
    case "DOUBLE_ATTACK": return kw.doubleAttack;
    case "BANISH": return kw.banish;
    default: return false;
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
  kind: "names" | "types" | "attributes",
): boolean {
  const mods = (data?.effectSchema as { rule_modifications?: Array<Record<string, unknown>> } | null)
    ?.rule_modifications ?? [];
  return mods.some(
    (m) => m.rule_type === "TREATED_AS_ALL_IDENTITIES" && m[kind] === true,
  );
}

/**
 * Check if a card instance matches a TargetFilter.
 * Used by condition evaluator and target resolver.
 */
export function matchesFilter(
  card: CardInstance,
  filter: TargetFilter,
  cardDb: Map<string, CardData>,
  state: GameState,
  resultRefs?: Map<string, EffectResult>,
): boolean {
  const data = cardDb.get(card.cardId);
  if (!data) return false;

  // Disjunctive filter
  if (filter.any_of) {
    const baseFilter = { ...filter, any_of: undefined };
    const baseOk = Object.keys(baseFilter).filter((k) => baseFilter[k as keyof TargetFilter] !== undefined).length === 0
      || matchesFilter(card, baseFilter, cardDb, state, resultRefs);
    if (!baseOk) return false;
    return filter.any_of.some((f) => matchesFilter(card, f, cardDb, state, resultRefs));
  }

  // Cost filters
  const cost = data.cost ?? 0;
  const ctrl = card.controller;
  if (filter.cost_exact !== undefined && !matchesDynamicNum(cost, "==", filter.cost_exact, state, ctrl)) return false;
  if (filter.cost_min !== undefined && !matchesDynamicNum(cost, ">=", filter.cost_min, state, ctrl)) return false;
  if (filter.cost_max !== undefined && !matchesDynamicNum(cost, "<=", filter.cost_max, state, ctrl)) return false;
  if (filter.cost_range && (cost < filter.cost_range.min || cost > filter.cost_range.max)) return false;
  if (filter.base_cost_exact !== undefined && cost !== filter.base_cost_exact) return false;
  if (filter.base_cost_min !== undefined && cost < filter.base_cost_min) return false;
  if (filter.base_cost_max !== undefined && cost > filter.base_cost_max) return false;

  // Power filters — compute effective power lazily to avoid circular recursion
  // (getEffectivePower → effectAppliesToCard → matchesFilter → getEffectivePower)
  const hasPowerFilter = filter.power_exact !== undefined || filter.power_min !== undefined
    || filter.power_max !== undefined || filter.power_range !== undefined;
  const hasBasePowerFilter = filter.base_power_exact !== undefined
    || filter.base_power_min !== undefined || filter.base_power_max !== undefined;
  if (hasPowerFilter) {
    const effectivePower = getEffectivePower(card, data, state, cardDb);
    if (filter.power_exact !== undefined && !matchesDynamicNum(effectivePower, "==", filter.power_exact, state, ctrl)) return false;
    if (filter.power_min !== undefined && !matchesDynamicNum(effectivePower, ">=", filter.power_min, state, ctrl)) return false;
    if (filter.power_max !== undefined && !matchesDynamicNum(effectivePower, "<=", filter.power_max, state, ctrl)) return false;
    if (filter.power_range && (effectivePower < filter.power_range.min || effectivePower > filter.power_range.max)) return false;
  }
  if (hasBasePowerFilter) {
    const basePower = data.power ?? 0;
    if (filter.base_power_exact !== undefined && basePower !== filter.base_power_exact) return false;
    if (filter.base_power_min !== undefined && basePower < filter.base_power_min) return false;
    if (filter.base_power_max !== undefined && basePower > filter.base_power_max) return false;
  }

  // Color filters
  const colors = data.color.map((c) => c.toUpperCase());
  if (filter.color && !colors.includes(filter.color)) return false;
  if (filter.color_includes && !filter.color_includes.some((c) => colors.includes(c))) return false;
  if (filter.color_not_matching_ref && resultRefs) {
    const refResult = resultRefs.get(filter.color_not_matching_ref);
    if (refResult && refResult.targetInstanceIds.length > 0) {
      const refCard = findInstanceById(state, refResult.targetInstanceIds[0]);
      if (refCard) {
        const refData = cardDb.get(refCard.cardId);
        if (refData) {
          const refColors = refData.color.map((c) => c.toUpperCase());
          if (colors.some((c) => refColors.includes(c))) return false;
        }
      }
    }
  }

  // Trait filters — OPT-227: blanket "treated as all types" satisfies positive
  // trait checks and fails negative (exclude) checks symmetrically.
  const traits = data.types ?? [];
  const treatsAsAllTypes = cardTreatsAsAll(data, "types");
  if (filter.traits && !treatsAsAllTypes && !filter.traits.every((t) => traits.includes(t))) return false;
  if (filter.traits_any_of && !treatsAsAllTypes && !filter.traits_any_of.some((t) => traits.includes(t))) return false;
  if (filter.traits_contains && !treatsAsAllTypes && !filter.traits_contains.every((t) => traits.some((tr) => tr.includes(t)))) return false;
  if (filter.traits_exclude && (treatsAsAllTypes || filter.traits_exclude.some((t) => traits.includes(t)))) return false;

  // Name filters — OPT-227: blanket "treated as all names" matches any positive
  // name check and is caught by any exclude_name.
  const treatsAsAllNames = cardTreatsAsAll(data, "names");
  if (filter.name && !treatsAsAllNames && data.name !== filter.name) return false;
  if (filter.name_any_of && !treatsAsAllNames && !filter.name_any_of.includes(data.name)) return false;
  if (filter.name_includes && !treatsAsAllNames && !data.name.includes(filter.name_includes)) return false;
  if (filter.exclude_name && (treatsAsAllNames || data.name === filter.exclude_name)) return false;
  if (filter.name_matching_ref && resultRefs) {
    const refResult = resultRefs.get(filter.name_matching_ref);
    if (refResult && refResult.targetInstanceIds.length > 0) {
      const refCard = findInstanceById(state, refResult.targetInstanceIds[0]);
      if (refCard) {
        const refData = cardDb.get(refCard.cardId);
        if (refData && data.name !== refData.name) return false;
      }
    }
  }

  // Keyword / ability filters
  if (filter.keywords) {
    for (const kw of filter.keywords) {
      if (kw === "BLOCKER" && !data.keywords.blocker) return false;
      if (kw === "RUSH" && !data.keywords.rush && !data.keywords.rushCharacter) return false;
      if (kw === "DOUBLE_ATTACK" && !data.keywords.doubleAttack) return false;
      if (kw === "BANISH" && !data.keywords.banish) return false;
      if (kw === "UNBLOCKABLE" && !data.keywords.unblockable) return false;
    }
  }
  if (filter.has_trigger === true && !data.keywords.trigger) return false;
  if (filter.has_trigger === false && data.keywords.trigger) return false;

  // Attribute filters — OPT-227: "treated as all attributes" is omnidirectional.
  // Positive checks pass; attribute_not excludes (e.g. defender's "cannot be
  // K.O.'d by Slash" correctly fires vs. the blanket Leader).
  const treatsAsAllAttrs = cardTreatsAsAll(data, "attributes");
  if (filter.attribute && !treatsAsAllAttrs) {
    const want = filter.attribute.toUpperCase();
    if (!(data.attribute ?? []).some((a) => a.toUpperCase() === want)) return false;
  }
  if (filter.attribute_not) {
    const want = filter.attribute_not.toUpperCase();
    if (treatsAsAllAttrs || (data.attribute ?? []).some((a) => a.toUpperCase() === want)) return false;
  }

  if (filter.has_effect === true) {
    if (!data.effectText || data.effectText.trim() === "") return false;
  }
  if (filter.has_effect === false) {
    if (data.effectText && data.effectText.trim() !== "") return false;
  }

  if (filter.no_base_effect === true) {
    if (data.effectText && data.effectText.trim() !== "") return false;
  }

  if (filter.has_counter === true) {
    if (data.counter === null || data.counter === undefined) return false;
  }
  if (filter.has_counter === false) {
    if (data.counter !== null && data.counter !== undefined) return false;
  }

  if (filter.lacks_effect_type) {
    if (hasEffectKeyword(data, filter.lacks_effect_type)) return false;
  }

  // Card type filter
  if (filter.card_type) {
    const cardType = data.type.toUpperCase();
    if (Array.isArray(filter.card_type)) {
      if (!filter.card_type.some((t) => t.toUpperCase() === cardType)) return false;
    } else {
      if (filter.card_type.toUpperCase() !== cardType) return false;
    }
  }

  // State filters
  if (filter.is_rested === true && card.state !== "RESTED") return false;
  if (filter.is_active === true && card.state !== "ACTIVE") return false;
  if (filter.state && card.state !== filter.state) return false;

  // Ref-based exclusion filter
  if (filter.exclude_ref && resultRefs) {
    const refResult = resultRefs.get(filter.exclude_ref);
    if (refResult && refResult.targetInstanceIds.includes(card.instanceId)) return false;
  }

  // DON-given filters
  if (filter.don_given_count) {
    const donCount = card.attachedDon.length;
    const val = typeof filter.don_given_count.value === "number"
      ? filter.don_given_count.value
      : 0; // DynamicValue resolved at runtime
    if (!compareNum(donCount, filter.don_given_count.operator, val)) return false;
  }

  return true;
}

function matchesDynamicNum(
  actual: number,
  op: NumericOperator,
  expected: number | DynamicValue,
  state?: GameState,
  controller?: 0 | 1,
): boolean {
  if (typeof expected === "number") {
    return compareNum(actual, op, expected);
  }
  if (expected.type === "FIXED") {
    return compareNum(actual, op, expected.value);
  }
  if (expected.type === "GAME_STATE" && state) {
    const resolved = resolveGameStateValue(expected.source, state, expected.controller, controller);
    if (resolved !== null) return compareNum(actual, op, resolved);
  }
  // Unresolvable dynamic values — pass through
  return true;
}

function resolveGameStateValue(
  source: string,
  state: GameState,
  sourceController?: string,
  ctxController?: 0 | 1,
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
      const chars = p.characters.filter(Boolean) as CardInstance[];
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
