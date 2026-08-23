/**
 * M4 Prohibition Registry — Pipeline Step 2
 *
 * Scans active prohibitions to veto game actions before they execute.
 * Implements rules §6-6-2: certain effects forbid specific actions.
 *
 * Examples: "This Character can't attack", "Your opponent can't play
 * Characters with cost 2 or less", "Cannot be K.O.'d by effects"
 */

import type {
  ConditionalOverride,
  Condition,
  RuntimeProhibition,
  ProhibitionType,
  Target,
  TargetFilter,
} from "./effect-types.js";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import {
  evaluateCondition,
  matchesFilter,
  type ConditionContext,
} from "./conditions.js";
import { findCardInState, findCardInstance } from "./state.js";
import { isCardNegated } from "./modifiers.js";
import { isBlockerProhibited } from "../../../../shared/blocker-prohibition.js";

function isConditionOverride(
  override: ConditionalOverride
): override is Condition {
  return !("action" in override && !("type" in override));
}

function evaluateConditionalOverride(
  state: GameState,
  override: ConditionalOverride,
  context: ConditionContext
): boolean {
  // Action-payment overrides require an interactive prompt and are not yet
  // executable from a synchronous prohibition check. Preserve the historical
  // behavior (prohibition remains active) while keeping the authored variant
  // explicit and type-safe.
  return (
    isConditionOverride(override) && evaluateCondition(state, override, context)
  );
}

// ─── Match-time resolution (OPT-451) ─────────────────────────────────────────
//
// Permanent prohibitions with population targets (e.g. P-084's "all Characters
// with a cost of 3 or 4 cannot attack") register with an empty appliesTo and
// carry the authored `target` on the runtime prohibition. Coverage re-resolves
// against the live board at every check — like modifier auras — so cards that
// enter play after registration are covered and cards that change properties
// fall in/out of coverage naturally. Block-level `conditions` (e.g. "If your
// Leader is [Buggy]") are likewise re-evaluated at match time.

/**
 * Re-evaluate a prohibition's carried block/prohibition conditions and any
 * WHILE_CONDITION duration. Prohibitions without either gate are always active.
 *
 * Also honors the OPT-253 negation contract: while the prohibition's source
 * card is effect-negated on the field, its schema-sourced prohibitions pause —
 * mirroring isEffectConditionMet's isEffectSourceNegated gate for modifiers.
 * Sources that already left the field (e.g. a resolved Event in the trash)
 * are never in a NEGATE_EFFECTS_FLAG's appliesTo, so one-shot prohibitions
 * written by resolved effects are unaffected.
 */
export function isProhibitionConditionMet(
  prohibition: RuntimeProhibition,
  state: GameState,
  cardDb: Map<string, CardData>,
): boolean {
  const source = findCardInstance(state, prohibition.sourceCardInstanceId);
  if (source && isCardNegated(source, state, cardDb)) return false;

  const ctx: ConditionContext = {
    sourceCardInstanceId: prohibition.sourceCardInstanceId,
    controller: prohibition.controller,
    cardDb,
  };
  if (
    prohibition.conditions &&
    !evaluateCondition(state, prohibition.conditions, ctx)
  ) {
    return false;
  }

  const duration = prohibition.duration;
  if (
    duration?.type === "WHILE_CONDITION" &&
    duration.condition &&
    !evaluateCondition(state, duration.condition, ctx)
  ) {
    return false;
  }

  return true;
}

/**
 * Does a prohibition's population target match this card? Mirrors the dynamic
 * half of modifiers.ts effectAppliesToCard: controller gate (relative to the
 * prohibition's owner), card-type gate, then the target filter.
 */
function prohibitionTargetMatchesCard(
  target: Target,
  card: CardInstance,
  ownerController: 0 | 1,
  state: GameState,
  cardDb: Map<string, CardData>,
  sourceCardInstanceId?: string,
): boolean {
  const targetType = target.type?.toUpperCase();

  if (targetType === "SELF" && card.instanceId !== sourceCardInstanceId) return false;

  const controller = target.controller ??
    (targetType === "ALL_YOUR_CHARACTERS" ? "SELF"
      : targetType === "ALL_OPPONENT_CHARACTERS" ? "OPPONENT"
      : targetType === "YOUR_LEADER" ? "SELF"
      : targetType === "OPPONENT_LEADER" ? "OPPONENT"
      : undefined);
  if (controller === "SELF" && card.controller !== ownerController) return false;
  if (controller === "OPPONENT" && card.controller === ownerController) return false;

  if (
    targetType === "CHARACTER" ||
    targetType === "ALL_YOUR_CHARACTERS" ||
    targetType === "ALL_OPPONENT_CHARACTERS" ||
    targetType === "ALL_CHARACTERS"
  ) {
    const data = cardDb.get(card.cardId);
    if (!data || data.type?.toUpperCase() !== "CHARACTER") return false;
  } else if (
    targetType === "LEADER" ||
    targetType === "YOUR_LEADER" ||
    targetType === "OPPONENT_LEADER"
  ) {
    const data = cardDb.get(card.cardId);
    if (!data || data.type?.toUpperCase() !== "LEADER") return false;
  }

  if (target.filter) {
    return matchesFilter(card, target.filter, cardDb, state);
  }
  return true;
}

/**
 * Instance-level coverage check used by the appliesTo-gated matchers.
 * Static list wins when present; otherwise a carried population target
 * resolves dynamically; otherwise the prohibition is unrestricted (existing
 * scope-gated behavior).
 */
function prohibitionCoversInstance(
  prohibition: RuntimeProhibition,
  instanceId: string,
  state: GameState,
  cardDb: Map<string, CardData>,
): boolean {
  if (prohibition.appliesTo && prohibition.appliesTo.length > 0) {
    return prohibition.appliesTo.includes(instanceId);
  }
  if (prohibition.target) {
    const found = findCardInState(state, instanceId);
    if (!found) return false;
    return prohibitionTargetMatchesCard(
      prohibition.target,
      found.card,
      prohibition.controller,
      state,
      cardDb,
      prohibition.sourceCardInstanceId,
    );
  }
  return true;
}

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
  const prohibitions = state.prohibitions;
  if (prohibitions.length === 0) return null;

  for (const prohibition of prohibitions) {
    // Check uses remaining
    if (prohibition.usesRemaining !== null && prohibition.usesRemaining <= 0) continue;

    // Re-evaluate carried block conditions (OPT-451, e.g. "If your Leader is [Buggy]")
    if (!isProhibitionConditionMet(prohibition, state, cardDb)) continue;

    // Check conditional override
    if (prohibition.conditionalOverride) {
      const ctx: ConditionContext = {
        sourceCardInstanceId: prohibition.sourceCardInstanceId,
        controller: prohibition.controller,
        cardDb,
      };
      if (
        evaluateConditionalOverride(state, prohibition.conditionalOverride, ctx)
      ) {
        continue; // Override active — skip this prohibition
      }
    }

    const veto = matchesProhibition(prohibition, action, state, cardDb, actingPlayerIndex);
    if (veto) return veto;
  }

  return null;
}

/**
 * Refresh Phase step 4 support: collect the refreshing player's cards held
 * rested by a CANNOT_REFRESH prohibition ("will not become active in your
 * opponent's next Refresh Phase") and consume those prohibitions — the effect
 * applies to exactly one Refresh Phase, so the phase that honors (or outlives)
 * it also spends it.
 */
export function applyRefreshProhibitions(
  state: GameState,
  playerIndex: 0 | 1,
  cardDb: Map<string, CardData>,
): { skipInstanceIds: Set<string>; nextState: GameState } {
  const prohibitions = state.prohibitions;
  const skipInstanceIds = new Set<string>();
  if (prohibitions.length === 0) return { skipInstanceIds, nextState: state };

  const player = state.players[playerIndex];
  const ownedIds = new Set<string>([
    player.leader.instanceId,
    ...player.characters.filter((c): c is CardInstance => c !== null).map((c) => c.instanceId),
    ...(player.stage ? [player.stage.instanceId] : []),
  ]);

  const consumedIds = new Set<string>();
  for (const p of prohibitions) {
    if (p.prohibitionType !== "CANNOT_REFRESH") continue;
    // Permanent auras (OPT-451, e.g. OP05-040 Birdcage) apply to every
    // Refresh Phase while their source stays on the field — they are matched
    // but never consumed. Consumption is for one-shot "next Refresh Phase"
    // prohibitions written by actions.
    const isPermanentAura = p.duration?.type === "PERMANENT";

    let affected: string[];
    if (p.appliesTo.length > 0) {
      affected = p.appliesTo.filter((id) => ownedIds.has(id));
    } else if (p.target) {
      // Dynamic population target — resolve against the refreshing player's
      // live board (OPT-451).
      affected = [...ownedIds].filter((id) => {
        const card = findCardOnField(state, id);
        return !!card && prohibitionTargetMatchesCard(p.target!, card, p.controller, state, cardDb);
      });
    } else {
      // A target-less one-shot CANNOT_REFRESH did nothing (e.g. "up to 1"
      // declined) — spend it at the first refresh so it can't linger forever.
      if (!isPermanentAura) consumedIds.add(p.id);
      continue;
    }

    if (affected.length === 0) continue;
    if (!isPermanentAura) consumedIds.add(p.id);
    if (p.usesRemaining !== null && p.usesRemaining <= 0) continue;
    if (!isProhibitionConditionMet(p, state, cardDb)) continue;
    if (p.conditionalOverride) {
      const ctx: ConditionContext = {
        sourceCardInstanceId: p.sourceCardInstanceId,
        controller: p.controller,
        cardDb,
      };
      if (evaluateConditionalOverride(state, p.conditionalOverride, ctx))
        continue;
    }
    for (const id of affected) skipInstanceIds.add(id);
  }

  if (consumedIds.size === 0) return { skipInstanceIds, nextState: state };
  const remaining = prohibitions.filter((p) => !consumedIds.has(p.id));
  return { skipInstanceIds, nextState: { ...state, prohibitions: remaining } };
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
      // Static appliesTo list or dynamic population target (OPT-451)
      if (!prohibitionCoversInstance(prohibition, action.attackerInstanceId, state, cardDb)) return null;
      // Check controller
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      if (scope.when_attacking) {
        const target = findCardInState(state, action.targetInstanceId);
        if (!target || !prohibitionTargetMatchesCard(
          scope.when_attacking,
          target.card,
          prohibition.controller,
          state,
          cardDb,
          prohibition.sourceCardInstanceId,
        )) return null;
      }
      return "This card cannot attack (prohibited by an effect)";
    }

    case "CANNOT_BE_RESTED": {
      // OPT-250: attacking rests the source card, so a "cannot be rested"
      // prohibition transitively blocks the attack (qa_op13.md:73-87).
      if (action.type === "DECLARE_ATTACK") {
        if (!prohibitionCoversInstance(prohibition, action.attackerInstanceId, state, cardDb)) return null;
        return "This card cannot be rested, so it cannot attack";
      }
      if (action.type !== "DECLARE_BLOCKER") return null;
      break;
    }

    case "CANNOT_BLOCK":
    case "CANNOT_ACTIVATE_BLOCKER":
    case "CANNOT_USE_BLOCKER":
      if (action.type !== "DECLARE_BLOCKER") return null;
      break;

    case "CANNOT_BE_BLOCKED": {
      // This is checked during block step, not at action validation
      // The battle system checks this
      return null;
    }

    case "CANNOT_PLAY_FROM_HAND": {
      // OPT-252 (E6): player-level restriction on normal hand-plays. Block any
      // user-initiated PLAY_CARD by the affected player. Effect-driven plays
      // never hit this matcher (effect resolver path), so they're unaffected
      // by this prohibition — matching Bandai's "from hand" wording where
      // effect-sourced plays from non-hand zones still resolve.
      if (action.type !== "PLAY_CARD") return null;
      if (!matchesController(prohibition.controller, actingPlayerIndex, scope.controller)) return null;
      return "Cannot play cards from hand (prohibited by an effect)";
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
        if (!matchesFilter(card, scope.filter, cardDb, state)) return null;
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
      if (!prohibitionCoversInstance(prohibition, action.targetInstanceId, state, cardDb)) return null;
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

  const blocker = findCardInState(state, action.blockerInstanceId);
  if (!blocker) return null;
  const blockerData = cardDb.get(blocker.card.cardId);
  if (!blockerData) return null;
  const prohibited = isBlockerProhibited(
    [prohibition],
    {
      instanceId: blocker.card.instanceId,
      controller: blocker.card.controller,
      cardType: blockerData.type,
    },
    actingPlayerIndex,
    {
      matchesFilter: (filter) =>
        matchesFilter(blocker.card, filter as TargetFilter, cardDb, state),
    },
  );
  if (!prohibited) return null;
  if (type === "CANNOT_BE_RESTED") {
    return "This card cannot be rested, so it cannot activate [Blocker]";
  }
  if (type === "CANNOT_USE_BLOCKER") {
    return "Cannot use Blocker (prohibited by an effect)";
  }
  return "This card cannot block (prohibited by an effect)";
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
  const prohibitions = state.prohibitions;

  for (const p of prohibitions) {
    if (p.prohibitionType !== prohibitionType) continue;
    if (p.usesRemaining !== null && p.usesRemaining <= 0) continue;
    if (!isProhibitionConditionMet(p, state, cardDb)) continue;

    // Check if this prohibition applies to the target
    if (p.appliesTo && p.appliesTo.length > 0) {
      if (p.appliesTo.includes(targetInstanceId)) return true;
    } else if (p.target) {
      // Dynamic population target (OPT-451)
      const card = findCardOnField(state, targetInstanceId);
      if (card && prohibitionTargetMatchesCard(p.target, card, p.controller, state, cardDb)) {
        return true;
      }
    }

    // Scope-based matching
    if (p.scope?.filter) {
      const card = findCardOnField(state, targetInstanceId);
      if (card && matchesFilter(card, p.scope.filter, cardDb, state)) {
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
// path — effect K.O., battle K.O., return-to-hand, return-to-deck, trash, or
// placement into Life — must
// consult this helper so the protection classes remain distinct.
//
// Mapping per rules §6-6-2 and Bandai FAQ on removal taxonomy:
//   KO             → CANNOT_BE_KO, CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//   RETURN_TO_HAND → CANNOT_BE_RETURNED_TO_HAND, CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//   RETURN_TO_DECK → CANNOT_BE_RETURNED_TO_DECK, CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//   TRASH          → CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//   TO_LIFE        → CANNOT_BE_REMOVED_FROM_FIELD, CANNOT_LEAVE_FIELD
//
// CANNOT_BE_KO alone does NOT block non-K.O. removals (return-to-hand/deck,
// trash) — that's the Luffy/Inuarashi distinction the taxonomy encodes.

export type RemovalAction = "KO" | "RETURN_TO_HAND" | "RETURN_TO_DECK" | "TRASH" | "TO_LIFE";

export interface RemovalContext {
  /** Which removal action is being attempted. */
  action: RemovalAction;
  /** Whether this removal stems from battle damage or an effect. */
  cause: "BATTLE" | "EFFECT";
  /** The player whose action/effect caused the removal. */
  causingController: 0 | 1;
  /**
   * The card instance causing the removal: the effect's source card for
   * effect removals, or the attacker for battle K.O.s (battle.ts passes it).
   * Required to evaluate `scope.source_filter` (e.g., "cannot be K.O.'d in
   * battle by Slash attribute cards") — when omitted, source-filtered
   * prohibitions are skipped (fail-open) and the protection will NOT apply,
   * so always pass it when a causing card exists.
   */
  sourceCardInstanceId?: string | null;
}

const PROHIBITION_TYPES_FOR_ACTION: Record<RemovalAction, ProhibitionType[]> = {
  KO: ["CANNOT_BE_KO", "CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
  RETURN_TO_HAND: ["CANNOT_BE_RETURNED_TO_HAND", "CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
  RETURN_TO_DECK: ["CANNOT_BE_RETURNED_TO_DECK", "CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
  TRASH: ["CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
  TO_LIFE: ["CANNOT_BE_REMOVED_FROM_FIELD", "CANNOT_LEAVE_FIELD"],
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
  const prohibitions = state.prohibitions;
  if (prohibitions.length === 0) return false;

  const applicableTypes = PROHIBITION_TYPES_FOR_ACTION[context.action];
  const target = findCardOnField(state, targetInstanceId);
  if (!target) return false;

  for (const p of prohibitions) {
    if (!applicableTypes.includes(p.prohibitionType)) continue;
    if (p.usesRemaining !== null && p.usesRemaining <= 0) continue;
    if (!isProhibitionConditionMet(p, state, cardDb)) continue;

    // Conditional override — if the override condition is satisfied the
    // prohibition does not apply (e.g., "unless your life has N or less").
    if (p.conditionalOverride) {
      const ctx: ConditionContext = {
        sourceCardInstanceId: p.sourceCardInstanceId,
        controller: p.controller,
        cardDb,
      };
      if (evaluateConditionalOverride(state, p.conditionalOverride, ctx))
        continue;
    }

    // Scope: target must be covered by appliesTo, a dynamic population
    // target (OPT-451), or scope.filter.
    const appliesTo = p.appliesTo ?? [];
    let coversTarget: boolean;
    if (appliesTo.length > 0) {
      coversTarget = appliesTo.includes(targetInstanceId);
    } else if (p.target) {
      coversTarget = prohibitionTargetMatchesCard(p.target, target, p.controller, state, cardDb);
    } else if (p.scope?.filter) {
      coversTarget = matchesFilter(target, p.scope.filter, cardDb, state);
    } else {
      coversTarget = false;
    }
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
      if (!matchesFilter(source, p.scope.source_filter, cardDb, state))
        continue;
    }

    return true;
  }

  return false;
}

// ─── Effect-driven Play Prohibition (OPT-252) ────────────────────────────────
//
// CANNOT_BE_PLAYED_BY_EFFECTS is intrinsic to the card and lives on its own
// permanent block (e.g., OP12-036 Zoro: zone "HAND", category "permanent").
// HAND-zone permanents aren't injected into state.prohibitions — there's no
// hand-card permanent registrar — so we scan the card's schema on demand,
// matching how modifiers.ts evaluates HAND-zone cost reductions.
//
// We also consult state.prohibitions in case another effect granted the flag
// at runtime (the registrar in triggers.ts emits these for FIELD-zone cards).

export function isCardPlayProhibitedByEffect(
  state: GameState,
  cardInstanceId: string,
  cardDb: Map<string, CardData>,
): boolean {
  const found = findCardInState(state, cardInstanceId);
  if (!found) return false;
  const card = found.card;
  const data = cardDb.get(card.cardId);
  if (!data) return false;

  const schema = data.effectSchema;
  if (schema?.effects) {
    const ctx: ConditionContext = {
      sourceCardInstanceId: cardInstanceId,
      controller: card.controller,
      cardDb,
    };
    for (const block of schema.effects) {
      if (block.category !== "permanent") continue;
      const blockZone = block.zone ?? "FIELD";
      if (!zoneMatchesCardZone(blockZone, card.zone)) continue;
      if (block.conditions && !evaluateCondition(state, block.conditions, ctx)) continue;
      if (!block.prohibitions) continue;
      for (const p of block.prohibitions) {
        if (p.type === "CANNOT_BE_PLAYED_BY_EFFECTS") return true;
      }
    }
  }

  for (const p of state.prohibitions) {
    if (p.prohibitionType !== "CANNOT_BE_PLAYED_BY_EFFECTS") continue;
    if (p.usesRemaining !== null && p.usesRemaining <= 0) continue;
    if (!isProhibitionConditionMet(p, state, cardDb)) continue;
    if (p.appliesTo && p.appliesTo.length > 0) {
      if (!p.appliesTo.includes(cardInstanceId)) continue;
    } else if (p.target) {
      // Dynamic population target (OPT-451) — the candidate card is typically
      // off-field (hand/trash), so match against its zone-independent state.
      if (!prohibitionTargetMatchesCard(p.target, card, p.controller, state, cardDb)) continue;
    }
    return true;
  }

  return false;
}

function zoneMatchesCardZone(blockZone: string, cardZone: string): boolean {
  if (blockZone === "FIELD") {
    return cardZone === "CHARACTER" || cardZone === "LEADER" || cardZone === "STAGE";
  }
  return blockZone === cardZone;
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
