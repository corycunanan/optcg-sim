/**
 * Target resolution — compute valid targets and build selection prompts.
 */

import type {
  Action,
  EffectResult,
  Target,
  TargetFilter,
} from "../effect-types.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PendingPromptState,
  ResumeContext,
} from "../../types.js";
import { matchesFilter as matchesFilterImpl } from "../conditions.js";
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
  const count = action.target?.count;
  const countMin = (count && "exact" in count) ? count.exact : 0;
  const countMax = !count ? 1
    : "exact" in count ? count.exact
    : "up_to" in count ? count.up_to
    : allValidIds.length;

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

  const pendingPrompt: PendingPromptState = {
    promptType: "SELECT_TARGET",
    options: { cards, validTargets: allValidIds, effectDescription, countMin, countMax, ctaLabel: "Confirm" },
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
