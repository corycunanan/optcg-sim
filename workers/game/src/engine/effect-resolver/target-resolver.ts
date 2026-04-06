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
  Target,
  TargetFilter,
  UniquenessConstraint,
} from "../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PendingPromptState,
  ResumeContext,
} from "../../types.js";
import { matchesFilter as matchesFilterImpl } from "../conditions.js";
import { getEffectivePower, getEffectiveCost } from "../modifiers.js";
import { findCardInstance } from "../state.js";
import type { ActionResult } from "./types.js";

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
): boolean {
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
    if (!validateDualTargetConstraints(selectedIds, target.dual_targets, state, cardDb, resultRefs)) return false;
  }

  return true;
}

function resolveCardProperty(instanceId: string, property: "power" | "cost", state: GameState, cardDb: Map<string, CardData>): number {
  const card = findCardInstance(state, instanceId);
  if (!card) return 0;
  const data = cardDb.get(card.cardId);
  if (!data) return 0;
  if (property === "power") return getEffectivePower(card, data, state);
  return getEffectiveCost(data, state, instanceId, cardDb);
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
  distribution: NamedCardDistribution,
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

function validateDualTargetConstraints(
  selectedIds: string[],
  dualTargets: DualTarget[],
  state: GameState,
  cardDb: Map<string, CardData>,
  resultRefs?: Map<string, EffectResult>,
): boolean {
  // Pre-compute which slots each selected ID can go into
  const perSlotValidSets: Set<string>[] = dualTargets.map((dt) => {
    const valid = new Set<string>();
    for (const id of selectedIds) {
      if (isEmptyFilter(dt.filter)) {
        valid.add(id);
      } else {
        const card = findCardInstance(state, id);
        if (card && matchesFilterForTarget(card, dt.filter, cardDb, state, resultRefs)) {
          valid.add(id);
        }
      }
    }
    return valid;
  });

  const slotMaxes = dualTargets.map((dt, i) => resolveCountMax(dt.count, perSlotValidSets[i].size));
  const slotMins = dualTargets.map((dt) => resolveCountMin(dt.count));
  const assignments: string[][] = dualTargets.map(() => []);

  function backtrack(idx: number): boolean {
    if (idx === selectedIds.length) {
      return assignments.every((a, i) => a.length >= slotMins[i]);
    }
    const id = selectedIds[idx];
    for (let s = 0; s < dualTargets.length; s++) {
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

  // Dual targets: get base candidates (no filter/count), then union per-slot filtered IDs
  if (target.dual_targets && target.dual_targets.length > 0) {
    const baseTarget: Target = { ...target, filter: undefined, count: undefined, dual_targets: undefined };
    const allCandidateIds = computeAllValidTargets(state, baseTarget, controller, cardDb, sourceCardInstanceId, _resultRefs);
    const unionSet = new Set<string>();
    for (const dt of target.dual_targets) {
      for (const id of allCandidateIds) {
        if (isEmptyFilter(dt.filter)) {
          unionSet.add(id);
        } else {
          const card = findCardInstance(state, id);
          if (card && matchesFilterForTarget(card, dt.filter, cardDb, state, _resultRefs)) {
            unionSet.add(id);
          }
        }
      }
    }
    return [...unionSet];
  }

  switch (targetType) {
    case "SELF": return [sourceCardInstanceId];
    case "YOUR_LEADER": return [state.players[controller].leader.instanceId];
    case "OPPONENT_LEADER": {
      const opp = controller === 0 ? 1 : 0;
      return [state.players[opp].leader.instanceId];
    }
    case "ALL_YOUR_CHARACTERS":
      return state.players[controller].characters.map((c) => c.instanceId);
    case "ALL_OPPONENT_CHARACTERS": {
      const opp = controller === 0 ? 1 : 0;
      return state.players[opp].characters.map((c) => c.instanceId);
    }
    case "CHARACTER":
    case "LEADER_OR_CHARACTER": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : ctrl === "OPPONENT" ? (controller === 0 ? 1 : 0) : -1;
      let candidates: CardInstance[] = [];
      if (pi === -1) {
        candidates = [...state.players[0].characters, ...state.players[1].characters];
        if (targetType === "LEADER_OR_CHARACTER") candidates = [state.players[0].leader, ...candidates, state.players[1].leader];
      } else {
        candidates = [...state.players[pi].characters];
        if (targetType === "LEADER_OR_CHARACTER") candidates = [state.players[pi].leader, ...candidates];
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
      // Determine source zone — CHARACTER_CARD/EVENT_CARD/STAGE_CARD may specify source_zone
      const sourceZone = (target as any).source_zone as string | undefined;
      let candidates: CardInstance[];
      if (sourceZone === "TRASH") {
        candidates = state.players[pi].trash;
      } else if (sourceZone === "DECK") {
        candidates = state.players[pi].deck;
      } else {
        candidates = state.players[pi].hand;
      }
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
      let candidates = state.players[pi].trash;
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
          if ((target.filter as any).is_active && d.state !== "ACTIVE") return false;
          if ((target.filter as any).is_rested && d.state !== "RESTED") return false;
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
      const ref = (target as any).ref as string;
      if (ref && _resultRefs.has(ref)) {
        return _resultRefs.get(ref)!.targetInstanceIds ?? [];
      }
      return [];
    }
    default: return [];
  }
}

// ─── autoSelectTargets ───────────────────────────────────────────────────────

export function autoSelectTargets(
  target: Target | undefined,
  allValidIds: string[],
): string[] {
  if (!target || allValidIds.length === 0) return [];
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
  const auto = ["SELF", "YOUR_LEADER", "OPPONENT_LEADER", "ALL_YOUR_CHARACTERS", "ALL_OPPONENT_CHARACTERS"];
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
          const slotValidIds = allValidIds.filter((id) => {
            if (isEmptyFilter(dt.filter)) return true;
            const card = findCardInstance(state, id);
            return card ? matchesFilterForTarget(card, dt.filter, cardDb, state, resultRefs) : false;
          });
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
    resultRefs: [...resultRefs.entries()].map(([k, v]) => [k, v as unknown]),
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
    promptType: "SELECT_TARGET",
    options: { cards, validTargets: allValidIds, effectDescription, countMin, countMax, ctaLabel: "Confirm", aggregateConstraint, uniquenessConstraint, namedDistribution, dualTargets: dualTargetsMetadata },
    respondingPlayer: controller,
    resumeContext: resumeCtx,
  };

  return { state, events: [], succeeded: false, pendingPrompt };
}

// ─── resolveTargetInstances ──────────────────────────────────────────────────

export function resolveTargetInstances(
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

  switch (targetType) {
    case "SELF":
      return [sourceCardInstanceId];

    case "YOUR_LEADER":
      return [state.players[controller].leader.instanceId];

    case "OPPONENT_LEADER": {
      const opp = controller === 0 ? 1 : 0;
      return [state.players[opp].leader.instanceId];
    }

    case "ALL_YOUR_CHARACTERS":
      return state.players[controller].characters.map((c) => c.instanceId);

    case "ALL_OPPONENT_CHARACTERS": {
      const opp = controller === 0 ? 1 : 0;
      return state.players[opp].characters.map((c) => c.instanceId);
    }

    case "CHARACTER":
    case "LEADER_OR_CHARACTER": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : ctrl === "OPPONENT" ? (controller === 0 ? 1 : 0) : -1;

      let candidates: CardInstance[] = [];
      if (pi === -1) {
        // EITHER — both players
        candidates = [
          ...state.players[0].characters,
          ...state.players[1].characters,
        ];
        if (targetType === "LEADER_OR_CHARACTER") {
          candidates = [state.players[0].leader, ...candidates, state.players[1].leader];
        }
      } else {
        candidates = [...state.players[pi].characters];
        if (targetType === "LEADER_OR_CHARACTER") {
          candidates = [state.players[pi].leader, ...candidates];
        }
      }

      // Apply filter
      if (target.filter) {
        candidates = candidates.filter((c) => {
          if (target.filter!.exclude_self && c.instanceId === sourceCardInstanceId) return false;
          return matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs);
        });
      }

      // Apply self_ref
      if (target.self_ref) {
        return candidates.filter((c) => c.instanceId === sourceCardInstanceId).map((c) => c.instanceId);
      }

      // Apply count
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("all" in count) return candidates.map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);
      if ("any_number" in count) return candidates.map((c) => c.instanceId);

      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    case "CARD_IN_HAND":
    case "CHARACTER_CARD":
    case "EVENT_CARD":
    case "STAGE_CARD": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      const sourceZone = (target as any).source_zone as string | undefined;
      let candidates: CardInstance[];
      if (sourceZone === "TRASH") {
        candidates = state.players[pi].trash;
      } else if (sourceZone === "DECK") {
        candidates = state.players[pi].deck;
      } else {
        candidates = state.players[pi].hand;
      }
      if (targetType === "CHARACTER_CARD") {
        candidates = candidates.filter((c) => { const d = cardDb.get(c.cardId); return d && d.type?.toUpperCase() === "CHARACTER"; });
      } else if (targetType === "EVENT_CARD") {
        candidates = candidates.filter((c) => { const d = cardDb.get(c.cardId); return d && d.type?.toUpperCase() === "EVENT"; });
      } else if (targetType === "STAGE_CARD") {
        candidates = candidates.filter((c) => { const d = cardDb.get(c.cardId); return d && d.type?.toUpperCase() === "STAGE"; });
      }
      if (target.filter) {
        candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs));
      }
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);
      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    case "CARD_IN_TRASH": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].trash;
      if (target.filter) {
        candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs));
      }
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("all" in count) return candidates.map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);
      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    case "CARD_IN_DECK": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].deck;
      if (target.filter) {
        candidates = candidates.filter((c) => matchesFilterForTarget(c, target.filter!, cardDb, state, _resultRefs));
      }
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);
      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    case "DON_IN_COST_AREA": {
      const ctrl = target.controller ?? "SELF";
      const pi = ctrl === "SELF" ? controller : (controller === 0 ? 1 : 0);
      let candidates = state.players[pi].donCostArea;
      if (target.filter) {
        candidates = candidates.filter((d) => {
          if ((target.filter as any).is_active && d.state !== "ACTIVE") return false;
          if ((target.filter as any).is_rested && d.state !== "RESTED") return false;
          return true;
        });
      }
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((d) => d.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((d) => d.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((d) => d.instanceId);
      return candidates.slice(0, 1).map((d) => d.instanceId);
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
      const candidates = state.players[opp].life;
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    case "LIFE_CARD": {
      const candidates = state.players[controller].life;
      const count = target.count;
      if (!count) return candidates.slice(0, 1).map((c) => c.instanceId);
      if ("up_to" in count) return candidates.slice(0, count.up_to).map((c) => c.instanceId);
      if ("exact" in count) return candidates.slice(0, count.exact).map((c) => c.instanceId);
      return candidates.slice(0, 1).map((c) => c.instanceId);
    }

    case "PLAYER": {
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
      const ref = (target as any).ref as string;
      if (ref && _resultRefs.has(ref)) {
        return _resultRefs.get(ref)!.targetInstanceIds ?? [];
      }
      return [];
    }

    default:
      return [];
  }
}
