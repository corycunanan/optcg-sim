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

    case "CANNOT_BE_RESTED": {
      // OPT-250: attacking and declaring [Blocker] both rest the source card,
      // so a "cannot be rested" prohibition transitively blocks both
      // (qa_op13.md:73-87).
      if (action.type === "DECLARE_ATTACK") {
        if (prohibition.appliesTo && prohibition.appliesTo.length > 0) {
          if (!prohibition.appliesTo.includes(action.attackerInstanceId)) return null;
        }
        return "This card cannot be rested, so it cannot attack";
      }
      if (action.type === "DECLARE_BLOCKER") {
        if (prohibition.appliesTo && prohibition.appliesTo.length > 0) {
          if (!prohibition.appliesTo.includes(action.blockerInstanceId)) return null;
        }
        return "This card cannot be rested, so it cannot activate [Blocker]";
      }
      return null;
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

      // Check cost_filter on scope
      if (scope.cost_filter) {
        const cardCost = data.cost ?? 0;
        if (!compareScopeNum(cardCost, scope.cost_filter.operator, scope.cost_filter.value)) return null;
      }

      // Check card_type_filter on scope
      if (scope.card_type_filter) {
        if (data.type.toUpperCase() !== scope.card_type_filter.toUpperCase()) return null;
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

// ─── Removal Prohibition (OPT-251) ───────────────────────────────────────────
//
// Separates narrow "cannot be K.O.'d" (OP01-024 Luffy) from broad "cannot be
// removed from the field by opp's effects" (OP02-027 Inuarashi). Every removal
// path — effect K.O., battle K.O., return-to-hand, return-to-deck, trash — must
// consult this helper so the protection classes remain distinct.
//
// Mapping per rules §6-6-2 and Bandai FAQ on removal taxonomy:
//   KO             → CANNOT_BE_KO, CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//   RETURN_TO_HAND → CANNOT_BE_RETURNED_TO_HAND, CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//   RETURN_TO_DECK → CANNOT_BE_RETURNED_TO_DECK, CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//   TRASH          → CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//
// CANNOT_BE_KO alone does NOT block non-K.O. removals (return-to-hand/deck,
// trash) — that's the Luffy/Inuarashi distinction the taxonomy encodes.

export type RemovalAction = "KO" | "RETURN_TO_HAND" | "RETURN_TO_DECK" | "TRASH";

export interface RemovalContext {
  /** Which removal action is being attempted. */
  action: RemovalAction;
  /** Whether this removal stems from battle damage or an effect. */
  cause: "BATTLE" | "EFFECT";
  /** The player whose action/effect caused the removal. */
  causingController: 0 | 1;
  /**
   * The card instance whose effect is causing the removal, if any. Used to
   * evaluate `scope.source_filter` (e.g., Luffy's "by Strike attribute"
   * protection). Omit for battle-K.O. — battle uses the attacker filter
   * pathway instead, which is not yet wired in.
   */
  sourceCardInstanceId?: string | null;
}

const PROHIBITION_TYPES_FOR_ACTION: Record<RemovalAction, ProhibitionType[]> = {
  KO: ["CANNOT_BE_KO", "CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
  RETURN_TO_HAND: ["CANNOT_BE_RETURNED_TO_HAND", "CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
  RETURN_TO_DECK: ["CANNOT_BE_RETURNED_TO_DECK", "CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
  TRASH: ["CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
};

/**
 * Return true if any active prohibition blocks `action` against
 * `targetInstanceId` under the given `context`. Evaluated per-target at the
 * point of removal, after replacement effects have resolved.
 */
export function isRemovalProhibited(
  state: GameState,
  targetInstanceId: string,
  context: RemovalContext,
  cardDb: Map<string, CardData>,
): boolean {
  const prohibitions = state.prohibitions as RuntimeProhibition[];
  if (prohibitions.length === 0) return false;

  const applicableTypes = PROHIBITION_TYPES_FOR_ACTION[context.action];
  const target = findCardOnField(state, targetInstanceId);
  if (!target) return false;

  for (const p of prohibitions) {
    if (!applicableTypes.includes(p.prohibitionType)) continue;
    if (p.usesRemaining !== null && p.usesRemaining <= 0) continue;

    // Conditional override — if the override condition is satisfied the
    // prohibition does not apply (e.g., "unless your life has N or less").
    if (p.conditionalOverride) {
      const ctx: ConditionContext = {
        sourceCardInstanceId: p.sourceCardInstanceId,
        controller: p.controller,
        cardDb,
      };
      if (evaluateCondition(state, p.conditionalOverride, ctx)) continue;
    }

    // Scope: target must be covered by appliesTo or scope.filter.
    const appliesTo = p.appliesTo ?? [];
    const coversTarget =
      (appliesTo.length > 0 && appliesTo.includes(targetInstanceId)) ||
      (appliesTo.length === 0 && p.scope?.filter
        ? matchesFilter(target, p.scope.filter as TargetFilter, cardDb, state)
        : false);
    if (!coversTarget) continue;

    // Scope: controller gate (SELF/OPPONENT/EITHER) — whose cards this
    // prohibition protects, relative to the prohibition source's controller.
    if (!scopeControllerMatches(p.controller, target.controller, p.scope?.controller)) {
      continue;
    }

    // Scope: cause gate — map context (BATTLE/EFFECT + opponent-ness) against
    // the prohibition's declared cause. See defaultCauseForType() for why the
    // default differs between CANNOT_BE_KO (ANY) and the "removed" family
    // (BY_OPPONENT_EFFECT) — it mirrors the canonical card text.
    const declaredCause = p.scope?.cause ?? defaultCauseForType(p.prohibitionType);
    if (!causeMatches(declaredCause, context, target.controller)) continue;

    // Scope: source filter — "by Strike attribute Characters", etc. Skip if
    // the causing source doesn't match.
    if (p.scope?.source_filter) {
      if (!context.sourceCardInstanceId) continue;
      const source = findCardOnField(state, context.sourceCardInstanceId);
      if (!source) continue;
      if (!matchesFilter(source, p.scope.source_filter as TargetFilter, cardDb, state)) continue;
    }

    return true;
  }

  return false;
}

function defaultCauseForType(type: ProhibitionType): string {
  // Card-text conventions when `scope.cause` is unspecified:
  //  - CANNOT_BE_KO without qualifier means every K.O. (battle or effect).
  //  - The three "removed/returned" types are almost always qualified
  //    "by your opponent's effects" in the printed text; default to that so
  //    schemas don't need to spell it out.
  //  - CANNOT_LEAVE_FIELD is absolute — no cause gate.
  switch (type) {
    case "CANNOT_BE_KO":
      return "ANY";
    case "CANNOT_BE_REMOVED_FROM_FIELD":
    case "CANNOT_BE_RETURNED_TO_HAND":
    case "CANNOT_BE_RETURNED_TO_DECK":
      return "BY_OPPONENT_EFFECT";
    case "CANNOT_LEAVE_FIELD":
      return "ANY";
    default:
      return "ANY";
  }
}

function causeMatches(
  declaredCause: string,
  context: RemovalContext,
  targetController: 0 | 1,
): boolean {
  switch (declaredCause) {
    case "ANY":
      return true;
    case "BATTLE":
      return context.cause === "BATTLE";
    case "EFFECT":
      return context.cause === "EFFECT";
    case "OPPONENT_EFFECT":
    case "BY_OPPONENT_EFFECT":
      return context.cause === "EFFECT" && context.causingController !== targetController;
    default:
      return true;
  }
}

function scopeControllerMatches(
  prohibitionOwner: 0 | 1,
  targetController: 0 | 1,
  scopeController: string | undefined,
): boolean {
  if (!scopeController) return true;
  if (scopeController === "SELF") return targetController === prohibitionOwner;
  if (scopeController === "OPPONENT") return targetController !== prohibitionOwner;
  return true;
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

function compareScopeNum(a: number, op: string, b: number): boolean {
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

function findCardOnField(state: GameState, instanceId: string): CardInstance | null {
  for (const player of state.players) {
    if (player.leader.instanceId === instanceId) return player.leader;
    const char = player.characters.find((c) => c?.instanceId === instanceId);
    if (char) return char;
    if (player.stage?.instanceId === instanceId) return player.stage;
  }
  return null;
}
