/**
 * M4 Prohibition Registry — Pipeline Step 2
 *
 * Scans active prohibitions to veto game actions before they execute.
 * Implements rules §6-6-2: certain effects forbid specific actions.
 *
 * Examples: "This Character can't attack", "Your opponent can't play
 * Characters with cost 2 or less", "Cannot be K.O.'d by effects"
 */

import type { RuntimeProhibition, ProhibitionType, TargetFilter } from "./effect-types.js";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import { evaluateCondition, matchesFilter, type ConditionContext } from "./conditions.js";

/**
 * Check if an action is prohibited by any active prohibition.
 * Returns a veto message if prohibited, or null if allowed.
 */
export function checkProhibitions(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): string | null {
  const prohibitions = state.prohibitions as RuntimeProhibition[];
  if (prohibitions.length === 0) return null;

  for (const prohibition of prohibitions) {
    // Check uses remaining
    if (prohibition.usesRemaining !== null && prohibition.usesRemaining <= 0) continue;

    // Check conditional override
    if (prohibition.conditionalOverride) {
      const ctx: ConditionContext = {
        sourceCardInstanceId: prohibition.sourceCardInstanceId,
        controller: prohibition.controller,
        cardDb,
      };
      if (evaluateCondition(state, prohibition.conditionalOverride, ctx)) {
        continue; // Override active — skip this prohibition
      }
    }

    const veto = matchesProhibition(prohibition, action, state, cardDb, actingPlayerIndex);
    if (veto) return veto;
  }

  return null;
}

function matchesProhibition(
  prohibition: RuntimeProhibition,
  action: GameAction,
  state: GameState,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): string | null {
  const type = prohibition.prohibitionType;
  const scope = prohibition.scope ?? {};

  switch (type) {
    case "CANNOT_ATTACK": {
      if (action.type !== "DECLARE_ATTACK") return null;
      // Check if the attacker is in the prohibition's appliesTo list
      if (prohibition.appliesTo && prohibition.appliesTo.length > 0) {
        if (!prohibition.appliesTo.includes(action.attackerInstanceId)) return null;
      }
      // Check controller
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      return "This card cannot attack (prohibited by an effect)";
    }

    case "CANNOT_BLOCK": {
      if (action.type !== "DECLARE_BLOCKER") return null;
      if (prohibition.appliesTo && prohibition.appliesTo.length > 0) {
        if (!prohibition.appliesTo.includes(action.blockerInstanceId)) return null;
      }
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      return "This card cannot block (prohibited by an effect)";
    }

    case "CANNOT_BE_BLOCKED": {
      // This is checked during block step, not at action validation
      // The battle system checks this
      return null;
    }

    case "CANNOT_PLAY_CHARACTER":
    case "CANNOT_PLAY_EVENT": {
      if (action.type !== "PLAY_CARD") return null;

      const card = findCardInHand(state, action.cardInstanceId);
      if (!card) return null;
      const data = cardDb.get(card.cardId);
      if (!data) return null;

      if (type === "CANNOT_PLAY_CHARACTER" && data.type !== "Character") return null;
      if (type === "CANNOT_PLAY_EVENT" && data.type !== "Event") return null;

      // Check if the card matches the scope filter
      if (scope.filter) {
        if (!matchesFilter(card, scope.filter as TargetFilter, cardDb, state)) return null;
      }

      // Check controller
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;

      return `Cannot play this ${data.type} (prohibited by an effect)`;
    }

    case "CANNOT_USE_COUNTER": {
      if (action.type !== "USE_COUNTER" && action.type !== "USE_COUNTER_EVENT") return null;
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      return "Cannot use counter (prohibited by an effect)";
    }

    case "CANNOT_USE_BLOCKER": {
      if (action.type !== "DECLARE_BLOCKER") return null;
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      return "Cannot use Blocker (prohibited by an effect)";
    }

    case "CANNOT_ACTIVATE_EFFECT": {
      if (action.type !== "ACTIVATE_EFFECT") return null;
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      return "Cannot activate effect (prohibited by an effect)";
    }

    case "CANNOT_ADD_LIFE": {
      // Checked by the effect resolver when ADD_TO_LIFE_FROM_DECK is attempted
      return null;
    }

    case "CANNOT_BE_KO": {
      // Checked by the effect resolver and battle system when KO is attempted
      return null;
    }

    case "CANNOT_BE_RETURNED_TO_HAND": {
      // Checked by the effect resolver when RETURN_TO_HAND is attempted
      return null;
    }

    case "CANNOT_BE_RETURNED_TO_DECK": {
      // Checked by the effect resolver
      return null;
    }

    case "CANNOT_ATTACH_DON": {
      if (action.type !== "ATTACH_DON") return null;
      if (prohibition.appliesTo && prohibition.appliesTo.length > 0) {
        if (!prohibition.appliesTo.includes(action.targetInstanceId)) return null;
      }
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      return "Cannot attach DON!! to this card (prohibited by an effect)";
    }

    case "CANNOT_ACTIVATE_ON_PLAY": {
      // Checked by the trigger system when ON_PLAY triggers are matched
      return null;
    }

    default:
      return null;
  }
}

/**
 * Check if a specific card-level prohibition applies.
 * Used by the effect resolver for effect-level prohibitions
 * (e.g., "cannot be KO'd", "cannot be returned to hand").
 */
export function isProhibitedForCard(
  state: GameState,
  targetInstanceId: string,
  prohibitionType: ProhibitionType,
  cardDb: Map<string, CardData>,
): boolean {
  const prohibitions = state.prohibitions as RuntimeProhibition[];

  for (const p of prohibitions) {
    if (p.prohibitionType !== prohibitionType) continue;
    if (p.usesRemaining !== null && p.usesRemaining <= 0) continue;

    // Check if this prohibition applies to the target
    if (p.appliesTo && p.appliesTo.length > 0) {
      if (p.appliesTo.includes(targetInstanceId)) return true;
    }

    // Scope-based matching
    if (p.scope?.filter) {
      const card = findCardOnField(state, targetInstanceId);
      if (card && matchesFilter(card, p.scope.filter as TargetFilter, cardDb, state)) {
        return true;
      }
    }
  }

  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesController(
  prohibController: 0 | 1,
  actingPlayer: 0 | 1,
  scopeController?: string,
): boolean {
  if (!scopeController) return true;
  if (scopeController === "SELF") return prohibController === actingPlayer;
  if (scopeController === "OPPONENT") return prohibController !== actingPlayer;
  return true; // EITHER
}

function findCardInHand(state: GameState, instanceId: string): CardInstance | null {
  for (const player of state.players) {
    const card = player.hand.find((c) => c.instanceId === instanceId);
    if (card) return card;
  }
  return null;
}

function findCardOnField(state: GameState, instanceId: string): CardInstance | null {
  for (const player of state.players) {
    if (player.leader.instanceId === instanceId) return player.leader;
    const char = player.characters.find((c) => c?.instanceId === instanceId);
    if (char) return char;
    if (player.stage?.instanceId === instanceId) return player.stage;
  }
  return null;
}
