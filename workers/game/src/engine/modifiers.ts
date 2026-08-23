/**
 * Modifier Layer System
 *
 * Power and cost are computed fresh via an ordered layer stack.
 * They are never stored as mutated values on the card.
 *
 * Layer 0: Base printed value (from card DB)
 * Layer 1: Base-setting effects (SET_POWER, e.g., "This Character's power becomes 0")
 * Layer 2: Additive/subtractive modifiers (MODIFY_POWER from effect resolver)
 * DON!! bonus: +1000 × attachedDon, owner's turn only (rules §6-5-5-2)
 */

import type { CardInstance, CardData, GameState } from "../types.js";
import type {
  RuntimeActiveEffect,
  RuntimeOneTimeModifier,
  Modifier,
  EffectBlock,
  TargetFilter,
  EffectResult,
} from "./effect-types.js";
import type { CardData as CardDataType } from "../types.js";
import {
  evaluateCondition as evaluateConditionQuery,
  matchesFilter as matchesFilterQuery,
  type ConditionContext as QueryConditionContext,
  type ConditionQueryServices,
} from "./condition-queries.js";
import {
  isKeywordEffective,
  type EffectiveKeyword,
} from "./effective-keyword.js";
import { findCardInstance } from "./state.js";
import { resolvePermanentDynamicValue } from "./dynamic-values.js";

type ConditionContext = Omit<QueryConditionContext, "queries">;

export interface CostEvaluationDiagnostics {
  layer2Iterations: number;
}

const modifierConditionQueries: ConditionQueryServices = {
  getEffectivePower: (card, data, state, cardDb) =>
    getEffectivePower(card, data, state, cardDb),
  getEffectiveCostForRead: (card, data, state, cardDb) =>
    getEffectiveCostForRead(card, data, state, cardDb),
  getEffectiveFieldCost: (data, state, instanceId, cardDb) =>
    getEffectiveFieldCost(data, state, instanceId, cardDb),
  hasGrantedAttribute: (card, attribute, state, cardDb) =>
    hasGrantedAttribute(card, attribute, state, cardDb),
  hasEffectiveKeyword: (card, data, keyword, state, cardDb) =>
    isKeywordEffective(
      data,
      keyword as EffectiveKeyword,
      isCardNegated(card, state, cardDb),
      hasGrantedKeyword(card, keyword, state, cardDb)
    ),
};
Object.freeze(modifierConditionQueries);

function evaluateCondition(
  state: GameState,
  condition: import("./effect-types.js").Condition,
  ctx: ConditionContext
): boolean {
  return evaluateConditionQuery(state, condition, {
    ...ctx,
    queries: modifierConditionQueries,
  });
}

function matchesFilter(
  card: CardInstance,
  filter: TargetFilter,
  cardDb: Map<string, CardData>,
  state: GameState,
  resultRefs?: Map<string, EffectResult>,
  costOverride?: number,
  filterController?: 0 | 1
): boolean {
  return matchesFilterQuery(
    card,
    filter,
    cardDb,
    state,
    resultRefs,
    costOverride,
    filterController,
    modifierConditionQueries
  );
}

function isLeaderInstance(card: CardInstance, state: GameState): boolean {
  return state.players[card.controller].leader.instanceId === card.instanceId;
}

function isCharacterOnField(
  card: CardInstance,
  state: GameState,
  cardDb: Map<string, CardData>
): boolean {
  const data = cardDb.get(card.cardId);
  return (
    data?.type?.toUpperCase() === "CHARACTER" &&
    state.players[card.controller].characters.some(
      (character) => character?.instanceId === card.instanceId
    )
  );
}

function numericModifierParam(
  modifier: Modifier,
  key: "amount" | "value"
): number | undefined {
  const value = modifier.params?.[key];
  return typeof value === "number" ? value : undefined;
}

function permanentModifierParam(
  modifier: Modifier,
  key: "amount" | "value",
  state: GameState,
  controller: 0 | 1,
  cardDb: Map<string, CardData> | undefined,
  sourceLabel: string
): number | undefined {
  const value = modifier.params?.[key];
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return undefined;

  // Without card data, permanent modifier gates cannot be evaluated. Do not
  // trust a dynamic value that happens not to need card data when every gate
  // was skipped; omitting it preserves the pre-dynamic-modifier behavior.
  if (!cardDb) return undefined;

  const resolution = resolvePermanentDynamicValue(value, {
    state,
    controller,
    cardDb,
    matchesFilter,
  });
  if (resolution.resolved) return resolution.value;
  if (resolution.reason === "MISSING_CARD_DB") return undefined;

  throw new Error(
    `Unable to resolve permanent modifier ${sourceLabel}.${key}: ${resolution.detail}`
  );
}

/**
 * Check whether a card is targeted by a permanent effect's modifiers.
 * For SELF targets (or no target), uses the static appliesTo array.
 * For non-SELF targets (e.g., CHARACTER with filter), dynamically resolves
 * against the card's properties using the modifier's target filter.
 */
export function modifierAppliesToCard(
  effect: RuntimeActiveEffect,
  modifier: Modifier,
  card: CardInstance,
  state: GameState,
  cardDb?: Map<string, CardDataType>,
  costOverride?: number
): boolean {
  // SELF (or implicit SELF) targets are resolved statically at registration.
  if (!modifier.target || modifier.target.type === "SELF") {
    return effect.appliesTo?.includes(card.instanceId) ?? false;
  }

  // Resolver-created effects may pre-resolve arbitrary targets into appliesTo.
  // A permanent block can also place its source there for a sibling SELF
  // modifier, but that membership must not leak into this dynamic modifier.
  if (
    card.instanceId !== effect.sourceCardInstanceId &&
    effect.appliesTo?.includes(card.instanceId)
  ) {
    return true;
  }

  // Dynamic match — check non-SELF modifier targets against the card
  if (!cardDb) return false;
  const targetType = modifier.target.type?.toUpperCase();

  if (targetType === "YOUR_LEADER" || targetType === "OPPONENT_LEADER") {
    const wantSelf = targetType === "YOUR_LEADER";
    if ((card.controller === effect.controller) !== wantSelf) return false;
    if (!isLeaderInstance(card, state)) return false;
  }

  const controller =
    modifier.target.controller ??
    (targetType === "ALL_YOUR_CHARACTERS"
      ? "SELF"
      : targetType === "ALL_OPPONENT_CHARACTERS"
        ? "OPPONENT"
        : undefined);
  if (controller === "SELF" && card.controller !== effect.controller)
    return false;
  if (controller === "OPPONENT" && card.controller === effect.controller)
    return false;

  switch (targetType) {
    case "CHARACTER":
    case "ALL_YOUR_CHARACTERS":
    case "ALL_OPPONENT_CHARACTERS": {
      const data = cardDb.get(card.cardId);
      if (!data || data.type?.toUpperCase() !== "CHARACTER") return false;
      break;
    }
    case "LEADER_OR_CHARACTER":
      if (
        !isLeaderInstance(card, state) &&
        !isCharacterOnField(card, state, cardDb)
      ) {
        return false;
      }
      break;
    case "YOUR_LEADER":
    case "OPPONENT_LEADER":
      break;
    case "CARD_IN_HAND":
      if (card.zone !== "HAND") return false;
      break;
    case "CHARACTER_CARD":
      if (modifier.target.source_zone === "HAND" && card.zone !== "HAND")
        return false;
      break;
    case "SELF":
      return false;
    default:
      // Unknown permanent targets fail closed so a new target cannot become a
      // wildcard across both fields before this resolver explicitly supports it.
      return false;
  }

  return (
    !modifier.target.filter ||
    matchesFilter(
      card,
      modifier.target.filter,
      cardDb,
      state,
      undefined,
      costOverride
    )
  );
}

/**
 * OPT-253: Is this Character currently effect-negated?
 *
 * True when any activeEffect carries a NEGATE_EFFECTS_FLAG modifier that lists
 * the card in its appliesTo set and whose duration condition (if any) currently
 * holds. The flag is source-independent: we deliberately skip the normal
 * `isEffectConditionMet` path on the negation effect itself to avoid recursion
 * (and to prevent an attacker mutually-negating their way out of a negation).
 */
export function isCardNegated(
  card: CardInstance,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): boolean {
  const effects = state.activeEffects;
  for (const effect of effects) {
    if (!effect.modifiers?.some((m) => m.type === "NEGATE_EFFECTS_FLAG"))
      continue;
    if (!effect.appliesTo?.includes(card.instanceId)) continue;

    const duration = effect.duration;
    if (duration?.type === "WHILE_CONDITION" && duration.condition) {
      if (!cardDb) return true;
      const condCtx: ConditionContext = {
        sourceCardInstanceId: effect.sourceCardInstanceId,
        controller: effect.controller,
        cardDb,
      };
      if (!evaluateCondition(state, duration.condition, condCtx)) continue;
    }
    return true;
  }
  return false;
}

/**
 * OPT-253: Is this effect's source Character currently negated?
 * If so, its non-negation modifiers should be treated as inactive.
 */
function isEffectSourceNegated(
  effect: RuntimeActiveEffect,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): boolean {
  if (!effect.sourceCardInstanceId) return false;
  const source = findCardInstance(state, effect.sourceCardInstanceId);
  if (!source) return false;
  return isCardNegated(source, state, cardDb);
}

/**
 * Evaluate the permanent block's conditions and block-level duration.
 */
export function isPermanentBlockGateMet(
  state: GameState,
  block: Pick<EffectBlock, "conditions" | "duration">,
  conditionContext: ConditionContext
): boolean {
  if (
    block.conditions &&
    !evaluateCondition(state, block.conditions, conditionContext)
  ) {
    return false;
  }

  const blockDuration = block.duration;
  if (
    blockDuration?.type === "WHILE_CONDITION" &&
    blockDuration.condition &&
    !evaluateCondition(state, blockDuration.condition, conditionContext)
  ) {
    return false;
  }

  return true;
}

function isModifierGateMet(
  block: Pick<EffectBlock, "conditions" | "duration">,
  modifier: Modifier | undefined,
  state: GameState,
  ctx: ConditionContext
): boolean {
  if (!isPermanentBlockGateMet(state, block, ctx)) return false;

  const modifierDuration = modifier?.duration;
  if (
    modifierDuration?.type === "WHILE_CONDITION" &&
    modifierDuration.condition &&
    !evaluateCondition(state, modifierDuration.condition, ctx)
  ) {
    return false;
  }

  return true;
}

/**
 * Check whether a permanent WHILE_CONDITION effect's condition is currently met.
 * Returns true for effects that have no WHILE_CONDITION duration (always active).
 *
 * OPT-253: also returns false if the effect's source Character is currently
 * effect-negated, except for the negation flag itself (which must stay active
 * regardless of who negated whom, to avoid recursion and mutual-negation cycles).
 */
export function isEffectConditionMet(
  effect: RuntimeActiveEffect,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): boolean {
  if (!cardDb) return true; // can't evaluate without cardDb — assume active

  // OPT-253: suppress effects whose source Character is negated. The
  // NEGATE_EFFECTS_FLAG modifier itself is exempt to keep the negation
  // itself resolvable even if the negator is later negated.
  const isNegationFlag = effect.modifiers?.some(
    (m) => m.type === "NEGATE_EFFECTS_FLAG"
  );
  if (!isNegationFlag && isEffectSourceNegated(effect, state, cardDb))
    return false;

  const condCtx: ConditionContext = {
    sourceCardInstanceId: effect.sourceCardInstanceId,
    controller: effect.controller,
    cardDb,
  };

  return isModifierGateMet(effect, undefined, state, condCtx);
}

/**
 * A modifier-level duration narrows its containing block. It can never make a
 * modifier active when the block's conditions or duration are false.
 */
export function isModifierConditionMet(
  effect: RuntimeActiveEffect,
  modifier: Modifier,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): boolean {
  if (!cardDb) return true; // can't evaluate without cardDb — assume active

  const isNegationFlag = effect.modifiers?.some(
    (candidate) => candidate.type === "NEGATE_EFFECTS_FLAG"
  );
  if (!isNegationFlag && isEffectSourceNegated(effect, state, cardDb))
    return false;

  return isModifierGateMet(effect, modifier, state, {
    sourceCardInstanceId: effect.sourceCardInstanceId,
    controller: effect.controller,
    cardDb,
  });
}

/**
 * OPT-241: Within a single modifier layer, simultaneous effects resolve
 * turn-player-first, non-turn-player-second. For "last wins" layers
 * (SET_POWER, SET_COST) this places the non-turn-player's effect last so
 * it wins the tie, matching Bandai's ruling.
 */
function sortByTurnPlayerPriority<T extends { controller: 0 | 1 }>(
  items: T[],
  turnPlayerIndex: 0 | 1
): T[] {
  const turnPlayer: T[] = [];
  const nonTurnPlayer: T[] = [];
  for (const item of items) {
    if (item.controller === turnPlayerIndex) turnPlayer.push(item);
    else nonTurnPlayer.push(item);
  }
  return [...turnPlayer, ...nonTurnPlayer];
}

/**
 * Returns the effective power of a card in the current game state.
 * Power can be negative — no floor (rules §1-3-6-1).
 */
export function getEffectivePower(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): number {
  // Layer 0: base printed value
  let power = cardData.power ?? 0;

  // OPT-455: power modifiers are field phenomena. A card in the trash, deck,
  // hand, or life reads its printed power — a field aura ("all your
  // Characters gain +1000") must not shift a trash candidate's eligibility
  // for filters like OP10-026's "[Kin'emon] with 0 power from your trash"
  // (effectAppliesToCard's dynamic matching has no zone gate, so without
  // this early return broad auras leak into non-field reads).
  const onField =
    card.zone === "CHARACTER" ||
    card.zone === "LEADER" ||
    card.zone === "STAGE";
  if (!onField) return power;

  const turnPlayerIndex = state.turn.activePlayerIndex;

  // Layer 1: base-setting effects
  const effects = state.activeEffects;
  const baseSetters = sortByTurnPlayerPriority(
    effects.filter((e) =>
      e.modifiers?.some(
        (m) =>
          m.type === "SET_POWER" &&
          modifierAppliesToCard(e, m, card, state, cardDb) &&
          isModifierConditionMet(e, m, state, cardDb)
      )
    ),
    turnPlayerIndex
  );
  if (baseSetters.length > 0) {
    // Last base-setter wins (timestamp/priority order). Turn-player resolves
    // first, non-turn-player resolves last and therefore clobbers.
    const lastSetter = baseSetters[baseSetters.length - 1];
    const mod = lastSetter.modifiers?.find(
      (m) =>
        m.type === "SET_POWER" &&
        modifierAppliesToCard(lastSetter, m, card, state, cardDb) &&
        isModifierConditionMet(lastSetter, m, state, cardDb)
    );
    const value = mod
      ? permanentModifierParam(
          mod,
          "value",
          state,
          lastSetter.controller,
          cardDb,
          lastSetter.sourceEffectBlockId
        )
      : undefined;
    if (value !== undefined) power = value;
  }

  // Layer 2: additive/subtractive modifiers (commutative, but sort for
  // determinism and to make ordering visible in event traces).
  const additiveEffects = sortByTurnPlayerPriority(
    effects.filter((e) =>
      e.modifiers?.some(
        (m) =>
          m.type === "MODIFY_POWER" &&
          modifierAppliesToCard(e, m, card, state, cardDb) &&
          isModifierConditionMet(e, m, state, cardDb)
      )
    ),
    turnPlayerIndex
  );
  for (const effect of additiveEffects) {
    for (const mod of effect.modifiers ?? []) {
      if (mod.type !== "MODIFY_POWER") continue;
      if (!modifierAppliesToCard(effect, mod, card, state, cardDb)) continue;
      if (!isModifierConditionMet(effect, mod, state, cardDb)) continue;
      const amount = permanentModifierParam(
        mod,
        "amount",
        state,
        effect.controller,
        cardDb,
        effect.sourceEffectBlockId
      );
      if (amount !== undefined) {
        power += amount;
      }
    }
  }

  // DON!! bonus: +1000 per attached DON!!, owner's turn only
  const isOwnersTurn = state.turn.activePlayerIndex === card.owner;
  if (isOwnersTurn) {
    power += card.attachedDon.length * 1000;
  }

  return power;
}

/**
 * Returns the effective cost for playing a card.
 * Clamped to minimum 0 for payment purposes (rules §1-3-5-1).
 *
 * @param cardDb - Optional card database, required for hand-zone modifier evaluation
 */
export function getEffectiveCost(
  cardData: CardData,
  state?: GameState,
  cardInstanceId?: string,
  cardDb?: Map<string, CardData>,
  playTimeAdjustments = true,
  diagnostics?: CostEvaluationDiagnostics
): number {
  // Layer 0
  let cost = cardData.cost ?? 0;
  if (diagnostics) diagnostics.layer2Iterations = 0;

  // Layer 1 & 2: Cost modifiers from active effects
  if (state && cardInstanceId) {
    const card = findCardInstance(state, cardInstanceId);
    const effects = state.activeEffects;
    const turnPlayerIndex = state.turn.activePlayerIndex;

    // Pass `cost` (base Layer 0 at this point) as override so any cost_* filter
    // inside a modifier's target filter resolves against base — this also
    // breaks recursion: OPT-247 made cost_* default to getEffectiveCost(), and
    // without an override the filter would call back into us.
    // Layer 1: SET_COST — last wins after turn-player-first sort.
    const setters = sortByTurnPlayerPriority(
      effects.filter((e) =>
        e.modifiers?.some(
          (m) =>
            m.type === "SET_COST" &&
            (card && cardDb
              ? modifierAppliesToCard(e, m, card, state, cardDb, cost)
              : e.appliesTo?.includes(cardInstanceId)) &&
            isModifierConditionMet(e, m, state, cardDb)
        )
      ),
      turnPlayerIndex
    );
    for (const effect of setters) {
      for (const mod of effect.modifiers ?? []) {
        if (mod.type !== "SET_COST") continue;
        const applies =
          card && cardDb
            ? modifierAppliesToCard(effect, mod, card, state, cardDb, cost)
            : effect.appliesTo?.includes(cardInstanceId);
        if (!applies || !isModifierConditionMet(effect, mod, state, cardDb))
          continue;
        const value = permanentModifierParam(
          mod,
          "value",
          state,
          effect.controller,
          cardDb,
          effect.sourceEffectBlockId
        );
        if (value !== undefined) {
          cost = value;
        }
      }
    }

    // Layer 2: MODIFY_COST — OPT-242: include-once fixed-point iteration.
    // A threshold filter (e.g., cost_min: 2) re-evaluates against the cost
    // accumulated so far. Per Bandai ruling, once an effect is applied it
    // stays applied (even if its own contribution pushes the card past the
    // threshold). We therefore only add new effects, never remove included
    // ones — this also guarantees termination (cycle-free).
    cost = applyLayer2CostModifiers(
      cost,
      cardInstanceId,
      card,
      state,
      cardDb,
      effects,
      turnPlayerIndex,
      diagnostics
    );

    // Play-time-only adjustments (OPT-444: skipped for on-field cost reads —
    // a pending "next time you play X" discount or hand-zone self-reduction
    // must not change the cost of a permanent already in play).
    if (playTimeAdjustments) {
      // One-time modifiers (unconsumed, matching cost modification for this play action)
      const oneTimeModifiers = state.oneTimeModifiers;
      for (const otm of oneTimeModifiers) {
        if (otm.consumed) continue;
        if (otm.modification.type !== "MODIFY_COST") continue;
        if (!matchesOneTimeFilter(otm, cardData, state)) continue;

        const amount = numericModifierParam(otm.modification, "amount");
        if (amount !== undefined) cost += amount;
      }

      // Hand-zone permanent modifiers (self-cost-reduction while in hand)
      if (cardDb) {
        cost += getHandZoneSelfCostModifier(
          cardData,
          state,
          cardInstanceId,
          cardDb
        );
      }
    }
  }

  return Math.max(0, cost);
}

/**
 * OPT-444: effective cost of a card already on the field — base cost plus
 * SET_COST / MODIFY_COST active effects only. Play-time adjustments (pending
 * one-time "next play" discounts, hand-zone self-reductions) are excluded.
 */
export function getEffectiveFieldCost(
  cardData: CardData,
  state: GameState,
  cardInstanceId: string,
  cardDb?: Map<string, CardData>
): number {
  return getEffectiveCost(cardData, state, cardInstanceId, cardDb, false);
}

/**
 * OPT-450: zone-aware cost read for predicates and filters.
 *
 * One-time "next play" discounts modify what you PAY when playing a card —
 * never the card's cost property (CR 1-3-9-1 defines cost as the printed
 * value; 2-7-6 lets effects change it, but e.g. OP02-025's discount is
 * expressly scoped to "play ... from your hand"). matchesOneTimeFilter has
 * no zone restriction, so without this gate a pending discount shifted cost
 * predicates in EVERY zone: a cost-5 permanent matched "K.O. cost ≤ 4", and
 * a printed-cost-4 deck card matched Oden's "play a cost-3 from your deck".
 *
 * Reads therefore use layers 0–2 only (base + SET_COST/MODIFY_COST), plus —
 * for cards actually in hand — the continuous while-in-hand self-reductions,
 * which genuinely change a hand card's cost while it is there.
 *
 * Play/validation/payment paths intentionally do NOT use this — they read
 * getEffectiveCost directly so play-time discounts apply to what you pay.
 */
export function getEffectiveCostForRead(
  card: CardInstance,
  cardData: CardData,
  state: GameState,
  cardDb?: Map<string, CardData>
): number {
  let cost = getEffectiveCost(cardData, state, card.instanceId, cardDb, false);
  if (card.zone === "HAND" && cardDb) {
    cost += getHandZoneSelfCostModifier(
      cardData,
      state,
      card.instanceId,
      cardDb
    );
  }
  return Math.max(0, cost);
}

/**
 * OPT-242: Apply Layer 2 MODIFY_COST modifiers with include-once iteration.
 *
 * Each iteration, any un-included Layer 2 modifier whose filter now matches the
 * accumulated cost is included and applied. Iteration stops when a full pass
 * adds nothing. Once included, a modifier stays included for the remainder of
 * this evaluation (no un-applying), per Bandai ruling.
 *
 * This resolves threshold scenarios like OP10-042 Usopp ("your {Dressrosa}
 * Characters with cost ≥2 get +1 cost") interacting with auto cost-reduction:
 * the filter sees the post-reduction cost rather than the base cost.
 */
const MAX_COST_LAYER2_ITERATIONS = 16;

function applyLayer2CostModifiers(
  startingCost: number,
  cardInstanceId: string,
  card: CardInstance | null,
  state: GameState,
  cardDb: Map<string, CardData> | undefined,
  effects: RuntimeActiveEffect[],
  turnPlayerIndex: 0 | 1,
  diagnostics?: CostEvaluationDiagnostics
): number {
  let cost = startingCost;

  // Candidates: effects carrying a MODIFY_COST modifier. Block and
  // modifier-level gates plus applicability are re-evaluated each pass.
  const rawCandidates = effects.filter((e) =>
    e.modifiers?.some((m) => m.type === "MODIFY_COST")
  );
  const candidates = sortByTurnPlayerPriority(rawCandidates, turnPlayerIndex);

  const includedModifierKeys = new Set<string>();
  for (let iter = 0; iter < MAX_COST_LAYER2_ITERATIONS; iter++) {
    if (diagnostics) diagnostics.layer2Iterations = iter + 1;
    let addedThisPass = false;
    for (const effect of candidates) {
      for (const [modifierIndex, mod] of (effect.modifiers ?? []).entries()) {
        const inclusionKey = `${effect.id}:${modifierIndex}`;
        if (includedModifierKeys.has(inclusionKey)) continue;

        if (mod.type !== "MODIFY_COST") continue;
        const applies =
          card && cardDb
            ? modifierAppliesToCard(effect, mod, card, state, cardDb, cost)
            : effect.appliesTo?.includes(cardInstanceId);
        if (!applies || !isModifierConditionMet(effect, mod, state, cardDb))
          continue;
        const amount = permanentModifierParam(
          mod,
          "amount",
          state,
          effect.controller,
          cardDb,
          effect.sourceEffectBlockId
        );
        if (amount !== undefined) {
          cost += amount;
          includedModifierKeys.add(inclusionKey);
          addedThisPass = true;
        }
      }
    }
    if (!addedThisPass) break;
  }

  return cost;
}

// ─── Hand-Zone Modifiers ────────────────────────────────────────────────────

/**
 * Evaluate hand-zone permanent blocks on a card's own schema.
 * Returns the total cost adjustment (negative = cheaper).
 *
 * These are permanent effect blocks with `zone: "HAND"` and MODIFY_COST modifiers
 * that reduce the card's own cost while it sits in hand, conditioned on game state.
 */
function getHandZoneSelfCostModifier(
  cardData: CardData,
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>
): number {
  const card = findCardInstance(state, cardInstanceId);
  if (!card || card.zone !== "HAND") return 0;

  const schema = cardData.effectSchema;
  if (!schema?.effects) return 0;

  const ctx: ConditionContext = {
    sourceCardInstanceId: cardInstanceId,
    controller: card.controller,
    cardDb,
  };

  let adjustment = 0;

  for (const block of schema.effects) {
    if (block.category !== "permanent") continue;
    if (block.zone !== "HAND") continue;
    if (!block.modifiers) continue;

    for (const mod of block.modifiers) {
      if (mod.type !== "MODIFY_COST") continue;
      if (!isModifierGateMet(block, mod, state, ctx)) continue;
      const amount = permanentModifierParam(
        mod,
        "amount",
        state,
        card.controller,
        cardDb,
        block.id
      );
      if (amount !== undefined) adjustment += amount;
    }
  }

  return adjustment;
}

/**
 * Check if a card has a specific granted keyword from active effects.
 */
export function hasGrantedKeyword(
  card: CardInstance,
  keyword: string,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): boolean {
  const effects = state.activeEffects;
  return effects.some((e) =>
    e.modifiers?.some(
      (m) =>
        m.type === "GRANT_KEYWORD" &&
        m.params?.keyword === keyword &&
        modifierAppliesToCard(e, m, card, state, cardDb) &&
        isModifierConditionMet(e, m, state, cardDb)
    )
  );
}

/**
 * Check if a card has a specific granted attribute from active effects
 * (GRANT_ATTRIBUTE modifiers, e.g. OP15-093 "gains the Slash attribute").
 * Attribute values are compared case-insensitively — schemas use uppercase
 * ("SLASH") while card data stores title-case (["Slash"]).
 */
export function hasGrantedAttribute(
  card: CardInstance,
  attribute: string,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): boolean {
  const want = attribute.toUpperCase();
  const effects = state.activeEffects;
  return effects.some((e) =>
    e.modifiers?.some(
      (m) =>
        m.type === "GRANT_ATTRIBUTE" &&
        typeof m.params?.attribute === "string" &&
        m.params.attribute.toUpperCase() === want &&
        modifierAppliesToCard(e, m, card, state, cardDb) &&
        isModifierConditionMet(e, m, state, cardDb)
    )
  );
}

/**
 * Check if a card has a specific removed keyword from active effects.
 */
export function hasRemovedKeyword(
  card: CardInstance,
  keyword: string,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): boolean {
  const effects = state.activeEffects;
  return effects.some((e) =>
    e.modifiers?.some(
      (m) =>
        m.type === "REMOVE_KEYWORD" &&
        m.params?.keyword === keyword &&
        modifierAppliesToCard(e, m, card, state, cardDb) &&
        isModifierConditionMet(e, m, state, cardDb)
    )
  );
}

/**
 * Returns the power contributed by symbol counters played this battle.
 * Stored on BattleContext.counterPowerAdded, not on the card.
 */
export function getBattleDefenderPower(
  defenderCard: CardInstance,
  defenderCardData: CardData,
  counterPowerAdded: number,
  state: GameState,
  cardDb?: Map<string, CardDataType>
): number {
  return (
    getEffectivePower(defenderCard, defenderCardData, state, cardDb) +
    counterPowerAdded
  );
}

// ─── One-Time Modifiers ──────────────────────────────────────────────────────

/**
 * Consume all matching one-time modifiers when a card is played.
 * Returns a new GameState with consumed modifiers marked.
 */
export function consumeOneTimeModifiers(
  state: GameState,
  cardData: CardData,
  controller: 0 | 1
): GameState {
  const modifiers = state.oneTimeModifiers;
  let changed = false;

  const updated = modifiers.map((otm) => {
    if (otm.consumed) return otm;
    if (otm.controller !== controller) return otm;
    if (otm.modification.type !== "MODIFY_COST") return otm;
    if (!matchesOneTimeFilter(otm, cardData, state)) return otm;

    changed = true;
    return { ...otm, consumed: true };
  });

  if (!changed) return state;
  return { ...state, oneTimeModifiers: updated };
}

/**
 * Remove all consumed one-time modifiers from state.
 */
export function cleanupConsumedOneTimeModifiers(state: GameState): GameState {
  const modifiers = state.oneTimeModifiers;
  const remaining = modifiers.filter((m) => !m.consumed);
  if (remaining.length === modifiers.length) return state;
  return { ...state, oneTimeModifiers: remaining };
}

/**
 * Remove expired one-time modifiers (by turn number for THIS_TURN duration).
 */
export function expireOneTimeModifiers(state: GameState): GameState {
  const modifiers = state.oneTimeModifiers;
  const remaining = modifiers.filter((m) => {
    if (m.consumed) return false;
    if (m.expires.type === "THIS_TURN") return false; // End of turn = expired
    return true;
  });
  if (remaining.length === modifiers.length) return state;
  return { ...state, oneTimeModifiers: remaining };
}

function matchesOneTimeFilter(
  otm: RuntimeOneTimeModifier,
  cardData: CardData,
  _state: GameState
): boolean {
  const filter = otm.appliesTo.filter;
  if (!filter) return true;

  if (typeof filter.cost_max === "number") {
    if ((cardData.cost ?? 0) > filter.cost_max) return false;
  }
  if (typeof filter.cost_min === "number") {
    if ((cardData.cost ?? 0) < filter.cost_min) return false;
  }
  if (filter.traits) {
    const traits = filter.traits;
    const cardTraits = cardData.types ?? [];
    if (!traits.every((t: string) => cardTraits.includes(t))) return false;
  }
  if (filter.color) {
    if (!cardData.color.some((color) => color.toUpperCase() === filter.color))
      return false;
  }
  if (filter.name) {
    if (cardData.name !== filter.name) return false;
  }
  if (filter.card_type) {
    const allowedTypes = Array.isArray(filter.card_type)
      ? filter.card_type
      : [filter.card_type];
    if (
      !allowedTypes.some(
        (type) => cardData.type.toUpperCase() === type.toUpperCase()
      )
    )
      return false;
  }
  return true;
}
