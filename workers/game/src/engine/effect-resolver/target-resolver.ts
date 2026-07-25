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
  TargetFilter,
  UniquenessConstraint,
} from "../effect-types.js";
import { TRIGGERING_CARD_REF } from "../effect-types.js";
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

export interface LifeCardTargetContext {
  owner: 0 | 1;
  /** Hidden identity is available only to trusted engine target evaluation. */
  visibility: "ENGINE_INTERNAL";
}

export interface TargetValidationContext {
  controller: 0 | 1;
  sourceCardInstanceId: string;
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
): boolean {
  return matchesFilterImpl(card, filter, cardDb, state, resultRefs);
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
  if (count && "exact" in count && selectedIds.length !== count.exact) return false;
  if (count && "up_to" in count && selectedIds.length > count.up_to) return false;

  if (selectedIds.length === 0) {
    // Empty selection is invalid if dual_targets has exact-count slots
    if (target.dual_targets && target.dual_targets.length > 0) {
      return target.dual_targets.every(dt => !("exact" in dt.count));
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
  const perSlotValidSets: Set<string>[] = target.dual_targets!.map((slot) =>
    new Set(resolveDualTargetSlot(
      state,
      target,
      slot,
      cardDb,
      resultRefs,
      context,
      selectedIds,
    ) ?? []),
  );

  const slotMaxes = target.dual_targets!.map((dt, i) => resolveCountMax(dt.count, perSlotValidSets[i].size));
  const slotMins = target.dual_targets!.map((dt) => resolveCountMin(dt.count));
  const assignments: string[][] = target.dual_targets!.map(() => []);

  function backtrack(idx: number): boolean {
    if (idx === selectedIds.length) {
      return assignments.every((a, i) => a.length >= slotMins[i]);
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
      if (target.filter && !matchesFilterForTarget(leader, target.filter, cardDb, state, _resultRefs)) return [];
      return [leader.instanceId];
    }
    case "OPPONENT_LEADER": {
      const opp = controller === 0 ? 1 : 0;
      const leader = state.players[opp].leader;
      if (target.filter && !matchesFilterForTarget(leader, target.filter, cardDb, state, _resultRefs)) return [];
      return [leader.instanceId];
    }
    case "ALL_YOUR_CHARACTERS":
      return state.players[controller].characters.filter(Boolean).map((c) => c!.instanceId);
    case "ALL_OPPONENT_CHARACTERS": {
      const opp = controller === 0 ? 1 : 0;
      return state.players[opp].characters.filter(Boolean).map((c) => c!.instanceId);
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
          return matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs);
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
      if (target.filter) candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs));
      return candidates.map((c) => c.instanceId);
    }
    case "CARD_IN_TRASH": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      // OPT-257 (F4): exclude trigger-staging instances from trash queries.
      const stagingIds = new Set(state.turn.triggerStagingInstanceIds ?? []);
      let candidates = state.players[pi].trash.filter((c) => !stagingIds.has(c.instanceId));
      if (target.filter) candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs));
      return candidates.map((c) => c.instanceId);
    }
    case "CARD_IN_DECK": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].deck;
      if (target.filter) candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs));
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
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      const stage = state.players[pi].stage;
      if (!stage) return [];
      if (target.filter && !matchesFilterForTarget(stage, target.filter, cardDb, state, _resultRefs)) return [];
      return [stage.instanceId];
    }
    case "OPPONENT_LIFE": {
      const opp = controller === 0 ? 1 : 0;
      return state.players[opp].life.map((c) => c.instanceId);
    }
    case "LIFE_CARD": {
      return state.players[controller].life.map((c) => c.instanceId);
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
        return _resultRefs.get(ref)!.targetInstanceIds ?? [];
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
  const count = target.count;
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
  if (!target.type) return false;
  // Deterministic targets — never prompt
  const auto = ["SELF", "YOUR_LEADER", "OPPONENT_LEADER", "ALL_YOUR_CHARACTERS", "ALL_OPPONENT_CHARACTERS", "TRIGGERING_CARD"];
  if (auto.includes(target.type)) return false;
  if (target.self_ref) return false;
  // Dual targets always require player selection — assignment is combinatorial
  if (target.dual_targets && target.dual_targets.length > 0) {
    return allValidIds.length > 0;
  }
  // Constraints require player selection — auto-select can't validate combinatorial choices
  if (target.aggregate_constraint || target.uniqueness_constraint || target.named_distribution) {
    return allValidIds.length > 0;
  }
  const count = target.count;
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
): ActionResult {
  const target = action.target;

  // Compute dual_targets metadata for the prompt
  const dualTargetsMetadata = target?.dual_targets?.length
    ? {
        slots: target.dual_targets.map((dt) => {
          const slotValidIds = resolveDualTargetSlot(
            state,
            target,
            dt,
            cardDb,
            resultRefs,
            { controller, sourceCardInstanceId },
          ) ?? [];
          return {
            validIds: slotValidIds,
            countMin: resolveCountMin(dt.count),
            countMax: resolveCountMax(dt.count, slotValidIds.length),
          };
        }),
      }
    : undefined;

  // Compute countMin/countMax — use summed slot bounds for dual_targets
  let countMin: number;
  let countMax: number;
  if (dualTargetsMetadata) {
    countMin = dualTargetsMetadata.slots.reduce((sum, s) => sum + s.countMin, 0);
    countMax = dualTargetsMetadata.slots.reduce((sum, s) => sum + s.countMax, 0);
  } else {
    const count = target?.count;
    countMin = (count && "exact" in count) ? count.exact : 0;
    countMax = !count ? 1
      : "exact" in count ? count.exact
      : "up_to" in count ? count.up_to
      : allValidIds.length;
  }

  const cards: CardInstance[] = [];
  for (const id of allValidIds) {
    const c = findCardInstance(state, id);
    if (c) cards.push(c);
  }

  const sourceCard = findCardInstance(state, sourceCardInstanceId);
  const sourceCardData = sourceCard ? cardDb.get(sourceCard.cardId) : undefined;
  const effectDescription = sourceCardData?.effectText ?? "";

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

  const pendingPrompt: PendingPromptState = {
    options: { promptType: "SELECT_TARGET", cards, validTargets: allValidIds, effectDescription, countMin, countMax, ctaLabel: "Confirm", aggregateConstraint, uniquenessConstraint, namedDistribution, dualTargets: dualTargetsMetadata },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events: [], succeeded: false, pendingPrompt };
}
