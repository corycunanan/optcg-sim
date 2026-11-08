/**
 * Target resolution — compute valid targets and build selection prompts.
 */

import type {
  Action,
  AggregateConstraint,
  CountMode,
  DualTarget,
  EffectResult,
  NamedCardDistribution,
  SourceZone,
  Target,
  TargetType,
  TargetFilter,
  UniquenessConstraint,
} from "../effect-types.js";
import { BATTLE_TARGET_REF, MIXED_POOL_TYPES, REPLACED_CARD_REF, TRIGGERING_CARD_REF } from "../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  LifeCard,
  PlayerState,
  PendingPromptState,
  ResumeContext,
} from "../../types.js";
import { matchesFilter as matchesFilterImpl } from "../conditions.js";
import { getEffectivePower, getEffectiveCostForRead } from "../modifiers.js";
import { findCardInstance } from "../state.js";
import type { ActionResult } from "./types.js";
import { isPresent } from "../type-guards.js";
import { promptEffectDescription } from "./action-utils.js";
import { generateTargetInstruction } from "./target-instruction.js";

export interface LifeCardTargetContext {
  owner: 0 | 1;
  /** Hidden identity is available only to trusted engine target evaluation. */
  visibility: "ENGINE_INTERNAL";
}

export interface TargetValidationContext {
  controller: 0 | 1;
  sourceCardInstanceId: string;
  /**
   * The candidates the prompt being answered offers (OPT-920/OPT-880). When
   * present, an `exact` count and each dual_targets slot pool are limited to
   * these ids, so a requirement never exceeds what the player was offered.
   */
  offeredIds?: readonly string[];
}

/**
 * Present a Life card to trusted target/filter code as a read-only card
 * candidate. This adapter must never be used for client serialization: its
 * engine-internal visibility contract intentionally retains hidden cardId.
 */
export function lifeCardToTargetCandidate(
  lifeCard: LifeCard,
  context: LifeCardTargetContext,
): CardInstance {
  return {
    instanceId: lifeCard.instanceId,
    cardId: lifeCard.cardId,
    zone: "LIFE",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: context.owner,
    owner: context.owner,
  };
}

// ─── Source zone helpers ─────────────────────────────────────────────────────

function getCandidatesFromSourceZones(
  sourceZone: SourceZone | SourceZone[] | undefined,
  player: PlayerState,
  state: GameState
): CardInstance[] {
  if (!sourceZone) return player.hand;
  const zones = Array.isArray(sourceZone) ? sourceZone : [sourceZone];
  // OPT-257 (F4): cards in trigger-resolution staging are physically in
  // player.trash but invisible to trash-targeting effects from the same
  // window. The Bandai ruling for the OP14 Thriller Bark Trigger pattern
  // ("Play X from trash") is that the just-revealed Life card cannot be
  // chosen as its own target.
  const stagingIds = new Set(state.turn.triggerStagingInstanceIds ?? []);
  const playerIndex: 0 | 1 = state.players[0] === player ? 0 : 1;
  const candidates: CardInstance[] = [];
  const seen = new Set<string>();
  for (const zone of zones) {
    let cards: CardInstance[];
    switch (zone) {
      case "TRASH":
        cards = player.trash.filter((c) => !stagingIds.has(c.instanceId));
        break;
      case "DECK":
        cards = player.deck;
        break;
      case "DECK_TOP":
        cards = player.deck.slice(0, 1);
        break;
      case "FIELD":
        cards = [
          player.leader,
          ...player.characters.filter(isPresent),
          ...(player.stage ? [player.stage] : []),
        ];
        break;
      case "LIFE":
        cards = player.life.map((lifeCard) =>
          lifeCardToTargetCandidate(lifeCard, {
            owner: playerIndex,
            visibility: "ENGINE_INTERNAL",
          })
        );
        break;
      default:
        cards = player.hand;
        break;
    }
    for (const c of cards) {
      if (!seen.has(c.instanceId)) {
        seen.add(c.instanceId);
        candidates.push(c);
      }
    }
  }
  return candidates;
}

// ─── matchesFilterForTarget ──────────────────────────────────────────────────

export function matchesFilterForTarget(
  card: CardInstance,
  filter: TargetFilter,
  cardDb: Map<string, CardData>,
  state: GameState,
  resultRefs?: Map<string, EffectResult>,
  filterController?: 0 | 1,
): boolean {
  return matchesFilterImpl(card, filter, cardDb, state, resultRefs, undefined, filterController);
}

// ─── Mixed pools (OPT-792) ───────────────────────────────────────────────────

/**
 * The count bounding a target's whole selection. A mixed pool's
 * `total_count` spans every pool type; schema lint keeps any parent `count`
 * equal to it, and validation still checks both.
 */
export function effectiveTargetCount(
  target: Target | undefined,
): CountMode | undefined {
  return target?.mixed_pool?.total_count ?? target?.count;
}

/**
 * The `countMin` a SELECT_TARGET prompt for this target carries: the summed
 * slot minimums for dual_targets, otherwise the effective count's `exact`
 * (an omitted, up_to, all or any_number count allows choosing 0).
 * `buildSelectTargetPrompt` and optional-action validation (OPT-893) share
 * this so the authoring check agrees with the prompt the resolver issues.
 */
export function targetPromptCountMin(target: Target | undefined): number {
  if (target?.dual_targets?.length) {
    return target.dual_targets.reduce(
      (sum, slot) => sum + (slot.count ? resolveCountMin(slot.count) : 0),
      0,
    );
  }
  const count = effectiveTargetCount(target);
  return count && "exact" in count ? count.exact : 0;
}

function violatesCount(selected: number, count: CountMode | undefined): boolean {
  if (!count) return false;
  if ("exact" in count) return selected !== count.exact;
  if ("up_to" in count) return selected > count.up_to;
  return false;
}

/**
 * Resolve each pool type as its own sub-target and union the ids. Only the
 * pool type's own entry in `mixed_pool.filters` applies to it, so per-type
 * qualifiers cannot leak across types.
 */
function computeMixedPoolTargets(
  state: GameState,
  target: Target,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  resultRefs: Map<string, EffectResult>,
): string[] {
  const pool = target.mixed_pool!;
  const union = new Set<string>();
  for (const poolType of pool.types) {
    if (!MIXED_POOL_TYPES.has(poolType)) continue;
    const poolFilter = pool.filters?.[poolType];
    const subTarget: Target = {
      type: poolType,
      ...(target.controller !== undefined ? { controller: target.controller } : {}),
      ...(poolFilter ? { filter: poolFilter } : {}),
    };
    for (const id of computeAllValidTargets(
      state,
      subTarget,
      controller,
      cardDb,
      sourceCardInstanceId,
      resultRefs,
    )) {
      union.add(id);
    }
  }
  return [...union];
}

// ─── validateTargetConstraints ───────────────────────────────────────────────

/**
 * Validates a set of selected instance IDs against target constraints.
 * Returns true if the selection satisfies all constraints.
 */
export function validateTargetConstraints(
  selectedIds: string[],
  target: Target,
  state: GameState,
  cardDb: Map<string, CardData>,
  resultRefs?: Map<string, EffectResult>,
  context?: TargetValidationContext,
): boolean {
  if (new Set(selectedIds).size !== selectedIds.length) return false;
  if (target.dual_targets?.some((slot) => slot.controller !== undefined) && !context) return false;

  const count = target.count;
  // OPT-880: an exact count asks for as many as the offer allows; a stale
  // re-prompt may offer fewer candidates than the count.
  const offered = context?.offeredIds ? new Set(context.offeredIds).size : Infinity;
  const exactCount = (c: CountMode | undefined) =>
    c && "exact" in c ? Math.min(c.exact, offered) : undefined;
  const exact = exactCount(count);
  if (exact !== undefined && selectedIds.length !== exact) return false;
  if (count && "up_to" in count && selectedIds.length > count.up_to) return false;
  // OPT-792: one shared maximum across every mixed-pool type.
  const totalExact = exactCount(target.mixed_pool?.total_count);
  if (totalExact !== undefined
    ? selectedIds.length !== totalExact
    : violatesCount(selectedIds.length, target.mixed_pool?.total_count)) return false;

  if (selectedIds.length === 0) {
    // OPT-920: an empty dual_targets selection is valid only when no slot
    // minimum can be met from the slots' current candidates.
    if (target.dual_targets && target.dual_targets.length > 0) {
      return validateDualTargetConstraints(selectedIds, target, state, cardDb, resultRefs, context);
    }
    return true;
  }

  if (target.aggregate_constraint) {
    if (!validateAggregateConstraint(selectedIds, target.aggregate_constraint, state, cardDb)) return false;
  }
  if (target.uniqueness_constraint) {
    if (!validateUniquenessConstraint(selectedIds, target.uniqueness_constraint, state, cardDb)) return false;
  }
  if (target.named_distribution) {
    if (!validateNamedDistribution(selectedIds, target.named_distribution, state, cardDb)) return false;
  }
  if (target.dual_targets && target.dual_targets.length > 0) {
    if (!validateDualTargetConstraints(selectedIds, target, state, cardDb, resultRefs, context)) return false;
  }

  // unique_names on filter: all selected cards must have distinct names
  if (target.filter?.unique_names) {
    const names = new Set<string>();
    for (const id of selectedIds) {
      const card = findCardInstance(state, id);
      if (!card) continue;
      const data = cardDb.get(card.cardId);
      if (!data) continue;
      if (names.has(data.name)) return false;
      names.add(data.name);
    }
  }

  return true;
}

function resolveCardProperty(instanceId: string, property: "power" | "cost", state: GameState, cardDb: Map<string, CardData>): number {
  const card = findCardInstance(state, instanceId);
  if (!card) return 0;
  const data = cardDb.get(card.cardId);
  if (!data) return 0;
  if (property === "power") return getEffectivePower(card, data, state, cardDb);
  // OPT-450: zone-aware — aggregate constraints over on-field targets must
  // not see pending play-time discounts.
  return getEffectiveCostForRead(card, data, state, cardDb);
}

function validateAggregateConstraint(
  selectedIds: string[],
  constraint: AggregateConstraint,
  state: GameState,
  cardDb: Map<string, CardData>,
): boolean {
  const sum = selectedIds.reduce((acc, id) => acc + resolveCardProperty(id, constraint.property, state, cardDb), 0);
  const threshold = typeof constraint.value === "number" ? constraint.value : 0;
  switch (constraint.operator) {
    case "<=": return sum <= threshold;
    case ">=": return sum >= threshold;
    case "==": return sum === threshold;
    default: return true;
  }
}

function resolveCardFieldValue(instanceId: string, field: "name" | "color", state: GameState, cardDb: Map<string, CardData>): string {
  const card = findCardInstance(state, instanceId);
  if (!card) return "";
  const data = cardDb.get(card.cardId);
  if (!data) return "";
  if (field === "name") return data.name;
  // For color, join sorted array to create a unique key
  return Array.isArray(data.color) ? [...data.color].sort().join(",") : String(data.color);
}

function validateUniquenessConstraint(
  selectedIds: string[],
  constraint: UniquenessConstraint,
  state: GameState,
  cardDb: Map<string, CardData>,
): boolean {
  const seen = new Set<string>();
  for (const id of selectedIds) {
    const value = resolveCardFieldValue(id, constraint.field, state, cardDb);
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

function validateNamedDistribution(
  selectedIds: string[],
  _distribution: NamedCardDistribution,
  state: GameState,
  cardDb: Map<string, CardData>,
): boolean {
  const nameCounts = new Map<string, number>();
  for (const id of selectedIds) {
    const card = findCardInstance(state, id);
    if (!card) continue;
    const data = cardDb.get(card.cardId);
    if (!data) continue;
    const count = nameCounts.get(data.name) ?? 0;
    if (count >= 1) return false; // More than 1 of the same name
    nameCounts.set(data.name, count + 1);
  }
  return true;
}

// ─── Dual target helpers ────────────────────────────────────────────────────

function resolveCountMin(count: CountMode): number {
  if ("exact" in count) return count.exact;
  return 0;
}

function resolveCountMax(count: CountMode, poolSize: number): number {
  if ("exact" in count) return count.exact;
  if ("up_to" in count) return count.up_to;
  return poolSize;
}

function isEmptyFilter(filter: TargetFilter | undefined): boolean {
  return !filter || Object.keys(filter).length === 0;
}

function resolveDualTargetSlot(
  state: GameState,
  target: Target,
  slot: DualTarget,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult> | undefined,
  context: TargetValidationContext | undefined,
  candidateIds: string[] = [],
): string[] | null {
  if (!context) {
    if (slot.controller !== undefined) return null;
    return candidateIds.filter((id) => {
      if (isEmptyFilter(slot.filter)) return true;
      const card = findCardInstance(state, id);
      return card
        ? matchesFilterForTarget(card, slot.filter, cardDb, state, resultRefs)
        : false;
    });
  }

  const slotTarget: Target = {
    ...target,
    controller: slot.controller ?? target.controller,
    filter: slot.filter,
    count: undefined,
    dual_targets: undefined,
  };
  return computeAllValidTargets(
    state,
    slotTarget,
    context.controller,
    cardDb,
    context.sourceCardInstanceId,
    resultRefs ?? new Map<string, EffectResult>(),
  );
}

function validateDualTargetConstraints(
  selectedIds: string[],
  target: Target,
  state: GameState,
  cardDb: Map<string, CardData>,
  resultRefs?: Map<string, EffectResult>,
  context?: TargetValidationContext,
): boolean {
  // Pre-compute which slots each selected ID can go into
  const offered = context?.offeredIds ? new Set(context.offeredIds) : undefined;
  const perSlotValidSets: Set<string>[] = target.dual_targets!.map((slot) =>
    new Set((resolveDualTargetSlot(
      state,
      target,
      slot,
      cardDb,
      resultRefs,
      context,
      selectedIds,
    ) ?? []).filter((id) => !offered || offered.has(id))),
  );

  const slotMaxes = target.dual_targets!.map((dt, i) => resolveCountMax(dt.count, perSlotValidSets[i].size));
  const slotMins = target.dual_targets!.map((dt) => resolveCountMin(dt.count));
  // OPT-920: with a context the slot sets are each slot's full candidate pool
  // in the current state, so the selection must meet as many slot minimums as
  // those candidates can (an effect does as much as it can; an `exact: 1` slot
  // with no candidate selects 0). Without one the sets hold only the selected
  // ids, so every slot minimum stays required.
  const required = context
    ? maxFillableSlotMinimums(perSlotValidSets, slotMins)
    : slotMins.reduce((sum, min) => sum + min, 0);
  const assignments: string[][] = target.dual_targets!.map(() => []);

  function backtrack(idx: number): boolean {
    if (idx === selectedIds.length) {
      return assignments.reduce(
        (sum, a, i) => sum + Math.min(a.length, slotMins[i]),
        0,
      ) >= required;
    }
    const id = selectedIds[idx];
    for (let s = 0; s < target.dual_targets!.length; s++) {
      if (perSlotValidSets[s].has(id) && assignments[s].length < slotMaxes[s]) {
        assignments[s].push(id);
        if (backtrack(idx + 1)) return true;
        assignments[s].pop();
      }
    }
    return false;
  }

  return backtrack(0);
}

/**
 * OPT-920: the most slot-minimum seats the candidates can fill at once — a
 * maximum bipartite matching of candidate ids onto `slotMins[i]` seats per
 * slot, where an id may sit only in a slot whose pool holds it. For disjoint
 * pools this is the sum of `min(slotMin, pool size)`; overlapping pools can
 * fill fewer because one card fills one seat.
 */
export function maxFillableSlotMinimums(
  slotPools: ReadonlyArray<ReadonlySet<string>>,
  slotMins: readonly number[],
): number {
  const seats: number[] = [];
  slotMins.forEach((min, slot) => {
    for (let i = 0; i < Math.min(min, slotPools[slot].size); i++) seats.push(slot);
  });
  const seatHolder: (string | undefined)[] = seats.map(() => undefined);
  const candidates = [...new Set(slotPools.flatMap((pool) => [...pool]))];

  function place(id: string, visited: Set<number>): boolean {
    for (let seat = 0; seat < seats.length; seat++) {
      if (visited.has(seat) || !slotPools[seats[seat]].has(id)) continue;
      visited.add(seat);
      const holder = seatHolder[seat];
      if (holder === undefined || place(holder, visited)) {
        seatHolder[seat] = id;
        return true;
      }
    }
    return false;
  }

  let filled = 0;
  for (const id of candidates) {
    if (filled === seats.length) break;
    if (place(id, new Set())) filled++;
  }
  return filled;
}

// ─── Candidate pool bounds ───────────────────────────────────────────────────

/**
 * Most candidates `computeAllValidTargets` can return for a target type, per
 * controlled side: `1` where its case returns at most one id (the player
 * marker, the deck's top card, the top Life card, a player's single Stage, the
 * single triggering card), otherwise unbounded. Keyed by every TargetType so a
 * new type must be classified here, next to the switch it mirrors.
 */
const TARGET_TYPE_POOL_PER_SIDE: Record<TargetType, number> = {
  SELF: 1,
  YOUR_LEADER: 1,
  OPPONENT_LEADER: 1,
  CHARACTER: Infinity,
  STAGE: 1,
  LEADER_OR_CHARACTER: Infinity,
  FIELD_CARD: Infinity,
  ALL_YOUR_CHARACTERS: Infinity,
  ALL_OPPONENT_CHARACTERS: Infinity,
  CHARACTER_CARD: Infinity,
  STAGE_CARD: Infinity,
  EVENT_CARD: Infinity,
  CARD_IN_HAND: Infinity,
  CARD_IN_TRASH: Infinity,
  CARD_ON_TOP_OF_DECK: 1,
  CARD_IN_DECK: Infinity,
  LIFE_CARD: 1,
  DON_IN_COST_AREA: Infinity,
  DON_ATTACHED: Infinity,
  DON_IN_DON_DECK: Infinity,
  PLAYER: 1,
  SELECTED_CARDS: Infinity,
  OPPONENT_LIFE: Infinity,
  TRIGGERING_CARD: 1,
  TRIGGERING_CARD_IN_TRASH: 1,
  BATTLE_TARGET: Infinity,
  REPLACED_CARD: Infinity,
};

/** Target types whose case resolves both players' pools for `controller: "EITHER"`. */
const EITHER_SIDE_TARGET_TYPES: ReadonlySet<TargetType> = new Set<TargetType>([
  "STAGE",
  "LIFE_CARD",
]);

/**
 * Upper bound on the candidate pool `computeAllValidTargets` can produce for
 * this target (OPT-893). Optional-action validation probes
 * `needsPlayerTargetSelection` with a pool this large, so a target that can
 * never offer more than one candidate is not treated as a multi-candidate
 * prompt.
 */
export function targetCandidatePoolMax(target: Target | undefined): number {
  if (!target) return 0;
  if (target.mixed_pool || target.dual_targets?.length) return Infinity;
  if (!target.type) return 0;
  const perSide = TARGET_TYPE_POOL_PER_SIDE[target.type];
  return EITHER_SIDE_TARGET_TYPES.has(target.type) && target.controller === "EITHER"
    ? perSide * 2
    : perSide;
}

// ─── computeAllValidTargets ──────────────────────────────────────────────────

export function computeAllValidTargets(
  state: GameState,
  target: Target | undefined,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId: string,
  _resultRefs: Map<string, EffectResult>,
): string[] {
  if (!target) return [];
  // OPT-792: a mixed pool is the union of its per-type sub-targets. It is
  // resolved before the single-type dispatch below, which reads only `type`.
  if (target.mixed_pool) {
    return computeMixedPoolTargets(
      state,
      target,
      controller,
      cardDb,
      sourceCardInstanceId,
      _resultRefs,
    );
  }
  const targetType = target.type;
  if (!targetType) return [];

  // Dual targets: resolve each slot as a normal target, then union their pools.
  if (target.dual_targets && target.dual_targets.length > 0) {
    const unionSet = new Set<string>();
    for (const slot of target.dual_targets) {
      const slotValidIds = resolveDualTargetSlot(
        state,
        target,
        slot,
        cardDb,
        _resultRefs,
        { controller, sourceCardInstanceId },
      ) ?? [];
      for (const id of slotValidIds) {
        unionSet.add(id);
      }
    }
    return [...unionSet];
  }

  switch (targetType) {
    case "SELF": return [sourceCardInstanceId];
    case "YOUR_LEADER": {
      const leader = state.players[controller].leader;
      if (target.filter && !matchesFilterForTarget(leader, target.filter, cardDb, state, _resultRefs, controller)) return [];
      return [leader.instanceId];
    }
    case "OPPONENT_LEADER": {
      const opp = controller === 0 ? 1 : 0;
      const leader = state.players[opp].leader;
      if (target.filter && !matchesFilterForTarget(leader, target.filter, cardDb, state, _resultRefs, controller)) return [];
      return [leader.instanceId];
    }
    case "ALL_YOUR_CHARACTERS": {
      let candidates = state.players[controller].characters.filter(isPresent);
      if (target.filter) candidates = candidates.filter((c) => {
        if (target.filter!.exclude_self && c.instanceId === sourceCardInstanceId) return false;
        return matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs, controller);
      });
      return candidates.map((c) => c.instanceId);
    }
    case "ALL_OPPONENT_CHARACTERS": {
      const opp = controller === 0 ? 1 : 0;
      let candidates = state.players[opp].characters.filter(isPresent);
      if (target.filter) candidates = candidates.filter((c) => {
        if (target.filter!.exclude_self && c.instanceId === sourceCardInstanceId) return false;
        return matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs, controller);
      });
      return candidates.map((c) => c.instanceId);
    }
    case "CHARACTER":
    case "LEADER_OR_CHARACTER":
    case "FIELD_CARD": {
      // FIELD_CARD = leader + characters + stage ("your cards" on the field).
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : ctrl === "OPPONENT" ? (controller === 0 ? 1 : 0) : -1;
      const includeLeader = targetType === "LEADER_OR_CHARACTER" || targetType === "FIELD_CARD";
      let candidates: CardInstance[] = [];
      if (pi === -1) {
        candidates = [
          ...state.players[0].characters.filter(isPresent),
          ...state.players[1].characters.filter(isPresent),
        ];
        if (includeLeader)
          candidates = [
            state.players[0].leader,
            ...candidates,
            state.players[1].leader,
          ];
        if (targetType === "FIELD_CARD") {
          candidates = [
            ...candidates,
            ...[state.players[0].stage, state.players[1].stage].filter(
              isPresent
            ),
          ];
        }
      } else {
        candidates = state.players[pi].characters.filter(isPresent);
        if (includeLeader)
          candidates = [state.players[pi].leader, ...candidates];
        if (targetType === "FIELD_CARD" && state.players[pi].stage) {
          candidates = [...candidates, state.players[pi].stage];
        }
      }
      if (target.filter) {
        candidates = candidates.filter((c) => {
          if (target.filter!.exclude_self && c.instanceId === sourceCardInstanceId) return false;
          return matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs, controller);
        });
      }
      if (target.self_ref) return candidates.filter((c) => c.instanceId === sourceCardInstanceId).map((c) => c.instanceId);
      return candidates.map((c) => c.instanceId);
    }
    case "CARD_IN_HAND":
    case "CHARACTER_CARD":
    case "EVENT_CARD":
    case "STAGE_CARD": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      // Determine source zone(s) — may be a single zone or array of zones
      let candidates: CardInstance[];
      candidates = getCandidatesFromSourceZones(target.source_zone, state.players[pi], state);
      // Apply card_type filter for typed target types
      if (targetType === "CHARACTER_CARD") {
        candidates = candidates.filter((c) => {
          const data = cardDb.get(c.cardId);
          return data && data.type?.toUpperCase() === "CHARACTER";
        });
      } else if (targetType === "EVENT_CARD") {
        candidates = candidates.filter((c) => {
          const data = cardDb.get(c.cardId);
          return data && data.type?.toUpperCase() === "EVENT";
        });
      } else if (targetType === "STAGE_CARD") {
        candidates = candidates.filter((c) => {
          const data = cardDb.get(c.cardId);
          return data && data.type?.toUpperCase() === "STAGE";
        });
      }
      if (target.filter) candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs, controller));
      return candidates.map((c) => c.instanceId);
    }
    case "CARD_IN_TRASH": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      // OPT-257 (F4): exclude trigger-staging instances from trash queries.
      const stagingIds = new Set(state.turn.triggerStagingInstanceIds ?? []);
      let candidates = state.players[pi].trash.filter((c) => !stagingIds.has(c.instanceId));
      if (target.filter) candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs, controller));
      return candidates.map((c) => c.instanceId);
    }
    case "CARD_IN_DECK": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].deck;
      if (target.filter) candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs, controller));
      return candidates.map((c) => c.instanceId);
    }
    case "DON_IN_COST_AREA": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].donCostArea;
      if (target.filter) {
        candidates = candidates.filter((d) => {
          if (target.filter!.is_active && d.state !== "ACTIVE") return false;
          if (target.filter!.is_rested && d.state !== "RESTED") return false;
          return true;
        });
      }
      return candidates.map((d) => d.instanceId);
    }
    case "STAGE": {
      const ctrl = target.controller ?? "SELF";
      const playerIndexes: (0 | 1)[] = ctrl === "EITHER"
        ? [0, 1]
        : [ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0)];
      let candidates = playerIndexes
        .map((playerIndex) => state.players[playerIndex].stage)
        .filter(isPresent);
      if (target.filter) {
        candidates = candidates.filter((stage) =>
          matchesFilterForTarget(stage, target.filter!, cardDb, state, _resultRefs, controller));
      }
      return candidates.map((stage) => stage.instanceId);
    }
    case "OPPONENT_LIFE": {
      const opp = controller === 0 ? 1 : 0;
      return state.players[opp].life.map((c) => c.instanceId);
    }
    case "LIFE_CARD": {
      const ctrl = target.controller ?? "SELF";
      const playerIndexes: (0 | 1)[] = ctrl === "EITHER"
        ? [0, 1]
        : [ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0)];
      // Authored LIFE_CARD targets are exclusively top-of-Life effects. Keep
      // OPPONENT_LIFE as the distinct full-stack target type.
      return playerIndexes.flatMap((playerIndex) =>
        state.players[playerIndex].life.slice(0, 1).map((card) => card.instanceId));
    }
    case "PLAYER": {
      // Return player index as a string identifier
      const ctrl = target.controller ?? "OPPONENT";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      return [`player-${pi}`];
    }
    case "CARD_ON_TOP_OF_DECK": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      const deck = state.players[pi].deck;
      if (deck.length === 0) return [];
      return [deck[0].instanceId];
    }
    case "SELECTED_CARDS": {
      // Reference to previously selected targets — resolved via result_refs
      const ref = target.ref;
      if (ref && _resultRefs.has(ref)) {
        const ids = _resultRefs.get(ref)!.targetInstanceIds ?? [];
        if (!target.filter) return ids;
        // OPT-999: a filtered reference ("play the other card rested if it
        // has a cost of 4 or less") narrows the referenced cards as they are now.
        return ids.filter((id) => {
          const card = findCardInstance(state, id);
          return !!card && matchesFilterForTarget(card, target.filter!, cardDb, state, _resultRefs, controller);
        });
      }
      return [];
    }
    case "TRIGGERING_CARD": {
      // The card that triggered this auto effect (seeded by resolveEffect).
      // Fizzles (empty) if the card left the field before resolution.
      const ids = _resultRefs.get(TRIGGERING_CARD_REF)?.targetInstanceIds ?? [];
      return ids.filter((id) => {
        const card = findCardInstance(state, id);
        return card && (card.zone === "CHARACTER" || card.zone === "LEADER" || card.zone === "STAGE");
      });
    }
    case "TRIGGERING_CARD_IN_TRASH": {
      // OPT-432: "play this Character card from your trash" — the exact
      // triggering instance, only while it is still in the trash. If a cost
      // consumed it (or it moved anywhere else), the play fizzles per Rule
      // 1-3-2; another copy is never substituted.
      const ids = _resultRefs.get(TRIGGERING_CARD_REF)?.targetInstanceIds ?? [];
      return ids.filter((id) => findCardInstance(state, id)?.zone === "TRASH");
    }
    case "BATTLE_TARGET": {
      // OPT-797: the opposing combatant seeded by resolveEffect from the
      // battle event. A card that left the field is a new card (Rule 3-1-6)
      // with a new instance id, so a K.O.'d or moved combatant resolves to
      // nothing and is never substituted.
      const ids = _resultRefs.get(BATTLE_TARGET_REF)?.targetInstanceIds ?? [];
      return ids.filter((id) => {
        const card = findCardInstance(state, id);
        if (!card || (card.zone !== "CHARACTER" && card.zone !== "LEADER")) return false;
        return !target.filter || matchesFilterForTarget(card, target.filter, cardDb, state, _resultRefs, controller);
      });
    }
    case "REPLACED_CARD": {
      // OPT-797: the card(s) whose event this replacement replaces, seeded by
      // applyReplacement. Only cards still on the field resolve.
      const ids = _resultRefs.get(REPLACED_CARD_REF)?.targetInstanceIds ?? [];
      return ids.filter((id) => {
        const zone = findCardInstance(state, id)?.zone;
        return zone === "CHARACTER" || zone === "STAGE" || zone === "LEADER";
      });
    }
    default: return [];
  }
}

// ─── autoSelectTargets ───────────────────────────────────────────────────────

export function autoSelectTargets(
  target: Target | undefined,
  allValidIds: string[],
): string[] {
  if (allValidIds.length === 0) return [];
  // No target spec — IDs come from a target_ref, use them directly
  if (!target) return allValidIds;
  // dual_targets: return all provided IDs — they've already been validated by feasibility check
  if (target.dual_targets && target.dual_targets.length > 0) return allValidIds;
  // OPT-797: a replacement covering several cards in one event replaces the
  // event for each of them, so its substitute acts on every replaced card.
  if (target.type === "ALL_YOUR_CHARACTERS" || target.type === "ALL_OPPONENT_CHARACTERS" || target.type === "REPLACED_CARD") {
    return allValidIds;
  }
  const count = effectiveTargetCount(target);
  if (!count) return allValidIds.slice(0, 1);
  if ("all" in count) return allValidIds;
  if ("exact" in count) return allValidIds.slice(0, count.exact);
  if ("up_to" in count) return allValidIds.slice(0, count.up_to);
  if ("any_number" in count) return allValidIds;
  return allValidIds.slice(0, 1);
}

// ─── needsPlayerTargetSelection ──────────────────────────────────────────────

export function needsPlayerTargetSelection(
  target: Target | undefined,
  allValidIds: string[],
): boolean {
  if (!target) return false;
  if (!target.type && !target.mixed_pool) return false;
  // Deterministic targets — never prompt
  const auto = ["SELF", "YOUR_LEADER", "OPPONENT_LEADER", "ALL_YOUR_CHARACTERS", "ALL_OPPONENT_CHARACTERS", "TRIGGERING_CARD", "BATTLE_TARGET", "REPLACED_CARD"];
  if (!target.mixed_pool && target.type && auto.includes(target.type)) return false;
  if (target.self_ref) return false;
  // Dual targets always require player selection — assignment is combinatorial
  if (target.dual_targets && target.dual_targets.length > 0) {
    return allValidIds.length > 0;
  }
  // Constraints require player selection — auto-select can't validate combinatorial choices
  if (target.aggregate_constraint || target.uniqueness_constraint || target.named_distribution) {
    return allValidIds.length > 0;
  }
  const count = effectiveTargetCount(target);
  if (!count) return allValidIds.length > 1;
  if ("all" in count || "any_number" in count) return false;
  // "up to N" — always prompt when there are valid targets, since the player
  // can choose 0 to N targets (skipping is valid)
  if ("up_to" in count) return allValidIds.length > 0;
  // "exact N" — only prompt when there are more candidates than needed
  if ("exact" in count) return allValidIds.length > count.exact;
  return allValidIds.length > 1;
}

// ─── buildSelectTargetPrompt ─────────────────────────────────────────────────

export function buildSelectTargetPrompt(
  state: GameState,
  action: Action,
  allValidIds: string[],
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  // OPT-928: the target this prompt selects for, when it is not
  // `action.target` (COPY_POWER selects its power source). Its count sets the
  // prompt bounds; the paused action stays the original.
  promptTarget: Target | undefined = action.target,
): ActionResult {
  const target = promptTarget;

  // Compute dual_targets metadata for the prompt
  const authoritativeValidIds = new Set(allValidIds);
  const dualTargetsMetadata = target?.dual_targets?.length
    ? {
        slots: target.dual_targets.map((dt) => {
          const slotValidIds = (resolveDualTargetSlot(
            state,
            target,
            dt,
            cardDb,
            resultRefs,
            { controller, sourceCardInstanceId },
          ) ?? []).filter((id) => authoritativeValidIds.has(id));
          // OPT-920: a slot cannot ask for more cards than it has candidates.
          return {
            validIds: slotValidIds,
            countMin: Math.min(resolveCountMin(dt.count), slotValidIds.length),
            countMax: Math.min(resolveCountMax(dt.count, slotValidIds.length), slotValidIds.length),
          };
        }),
      }
    : undefined;

  // Compute countMin/countMax — use summed slot bounds for dual_targets
  let countMin: number;
  let countMax: number;
  if (dualTargetsMetadata) {
    // OPT-920: the overall minimum is what the slots can fill together, which
    // overlapping slot pools can make smaller than the per-slot sum.
    countMin = maxFillableSlotMinimums(
      dualTargetsMetadata.slots.map((s) => new Set(s.validIds)),
      dualTargetsMetadata.slots.map((s) => s.countMin),
    );
    countMax = dualTargetsMetadata.slots.reduce((sum, s) => sum + s.countMax, 0);
  } else {
    const count = effectiveTargetCount(target);
    // OPT-880: an exact count never asks for more cards than are offered (a
    // stale re-prompt can offer fewer candidates than the count).
    const offered = new Set(allValidIds).size;
    countMin = Math.min(targetPromptCountMin(target), offered);
    countMax = !count ? 1
      : "exact" in count ? Math.min(count.exact, offered)
      : "up_to" in count ? count.up_to
      : allValidIds.length;
  }

  const cards: CardInstance[] = [];
  for (const id of allValidIds) {
    const c = findCardInstance(state, id);
    if (c) cards.push(c);
  }

  const effectDescription = promptEffectDescription(
    state,
    cardDb,
    sourceCardInstanceId,
  ) || "";

  const resumeCtx: ResumeContext = {
    effectSourceInstanceId: sourceCardInstanceId,
    controller,
    pausedAction: action,
    remainingActions: [], // filled in by executeActionChain
    resultRefs: [...resultRefs.entries()],
    validTargets: allValidIds,
  };

  // Build constraint metadata for UI-side validation
  const aggregateConstraint = target?.aggregate_constraint
    ? { property: target.aggregate_constraint.property, operator: target.aggregate_constraint.operator, value: typeof target.aggregate_constraint.value === "number" ? target.aggregate_constraint.value : 0 }
    : undefined;
  const uniquenessConstraint = target?.uniqueness_constraint ?? undefined;
  const namedDistribution = target?.named_distribution
    ? { names: target.named_distribution.names }
    : undefined;
  const instruction = target
    ? generateTargetInstruction(action, target, countMin, countMax)
    : undefined;

  const pendingPrompt: PendingPromptState = {
    options: {
      promptType: "SELECT_TARGET",
      cards,
      validTargets: allValidIds,
      effectDescription,
      ...(instruction ? { instruction } : {}),
      countMin,
      countMax,
      ctaLabel: "Confirm",
      aggregateConstraint,
      uniquenessConstraint,
      namedDistribution,
      dualTargets: dualTargetsMetadata,
      // Choosing which Life stack/card to inspect must not reveal every
      // face-down candidate. The selected identity is disclosed later by the
      // private LIFE_SCRIED event and the one-card arrange prompt.
      blindSelection: target?.type === "LIFE_CARD" ? true : undefined,
    },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events: [], succeeded: false, pendingPrompt };
}
