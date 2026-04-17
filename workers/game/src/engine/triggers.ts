/**
 * M4 Trigger System
 *
 * Registers, matches, and orders triggers from card effect schemas.
 * Operates as a four-stage pipeline:
 *   1. Registration (zone entry/exit)
 *   2. Matching (event → trigger)
 *   3. Ordering (turn-player-first, player-chosen)
 *   4. Queue for resolution (via effect resolver)
 */

import type {
  Trigger,
  KeywordTrigger,
  CustomTrigger,
  CompoundTrigger,
  KeywordTriggerType,
  CustomEventType,
  EventFilter,
  EffectBlock,
  EffectSchema,
  EffectZone,
  RuntimeActiveEffect,
  RuntimeRegisteredTrigger,
  RuntimeProhibition,
} from "./effect-types.js";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameEventType,
  GameState,
} from "../types.js";
import { nanoid } from "../util/nanoid.js";
import { findCardInstance } from "./state.js";
import { matchesFilter } from "./conditions.js";

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register all triggers from a card's effectSchema when it enters a valid zone.
 */
export function registerTriggersForCard(
  state: GameState,
  cardInstance: CardInstance,
  cardData: CardData,
): GameState {
  const schema = cardData.effectSchema as EffectSchema | null;
  if (!schema?.effects) return state;

  const newTriggers: RuntimeRegisteredTrigger[] = [];

  for (const block of schema.effects) {
    // Only auto and activate categories have triggers
    if (block.category !== "auto" && block.category !== "activate") continue;
    if (!block.trigger) continue;

    const zone: EffectZone = block.zone ?? "FIELD";

    // Check if the card is in the right zone for this trigger
    if (!isCardInValidZone(cardInstance, zone)) continue;

    newTriggers.push({
      id: nanoid(),
      sourceCardInstanceId: cardInstance.instanceId,
      effectBlockId: block.id,
      trigger: block.trigger,
      effectBlock: block,
      zone,
      controller: cardInstance.controller,
    });
  }

  if (newTriggers.length === 0) return state;

  return {
    ...state,
    triggerRegistry: [...state.triggerRegistry, ...newTriggers] as any,
  };
}

/**
 * Deregister all triggers from a card when it exits a zone.
 */
export function deregisterTriggersForCard(
  state: GameState,
  cardInstanceId: string,
): GameState {
  const filtered = state.triggerRegistry.filter(
    (t) => (t as RuntimeRegisteredTrigger).sourceCardInstanceId !== cardInstanceId,
  );
  if (filtered.length === state.triggerRegistry.length) return state;
  return { ...state, triggerRegistry: filtered };
}

// ─── Permanent Effect Registration ───────────────────────────────────────────

/**
 * Register permanent effect blocks (with modifiers and/or prohibitions) as
 * RuntimeActiveEffects / RuntimeProhibitions when a card enters the field.
 * Modifiers provide continuous power buffs, keyword grants, etc.
 * Prohibitions forbid specific actions (e.g., "this Leader cannot attack").
 */
export function registerPermanentEffectsForCard(
  state: GameState,
  cardInstance: CardInstance,
  cardData: CardData,
): GameState {
  const schema = cardData.effectSchema as EffectSchema | null;
  if (!schema?.effects) return state;

  const newEffects: RuntimeActiveEffect[] = [];
  const newProhibitions: RuntimeProhibition[] = [];

  for (const block of schema.effects) {
    if (block.category !== "permanent") continue;

    const hasModifiers = block.modifiers && block.modifiers.length > 0;
    const hasProhibitions = block.prohibitions && block.prohibitions.length > 0;
    if (!hasModifiers && !hasProhibitions) continue;

    const zone: EffectZone = block.zone ?? "FIELD";
    if (!isCardInValidZone(cardInstance, zone)) continue;

    // Determine expiry from duration
    const duration = block.duration ?? { type: "PERMANENT" as const };
    const expiresAt: import("./effect-types.js").ExpiryTiming =
      duration.type === "WHILE_CONDITION"
        ? { wave: "CONDITION_FALSE" }
        : { wave: "SOURCE_LEAVES_ZONE" };

    // Register modifiers as RuntimeActiveEffects
    if (hasModifiers) {
      // Resolve appliesTo from modifier targets.
      // SELF targets resolve statically to the source card.
      // Non-SELF targets (e.g., CHARACTER with filter) are resolved dynamically
      // at power-calculation time via effectAppliesToCard in modifiers.ts.
      const appliesTo: string[] = [];
      for (const mod of block.modifiers!) {
        if (!mod.target || mod.target.type === "SELF") {
          if (!appliesTo.includes(cardInstance.instanceId)) {
            appliesTo.push(cardInstance.instanceId);
          }
        }
      }

      newEffects.push({
        id: nanoid(),
        sourceCardInstanceId: cardInstance.instanceId,
        sourceEffectBlockId: block.id,
        category: "permanent",
        modifiers: block.modifiers!,
        conditions: block.conditions,
        duration,
        expiresAt,
        controller: cardInstance.controller,
        appliesTo,
        timestamp: Date.now(),
      });
    }

    // Register prohibitions as RuntimeProhibitions
    if (hasProhibitions) {
      for (const prohibition of block.prohibitions!) {
        // Resolve appliesTo from prohibition target
        const appliesTo: string[] = [];
        if (!prohibition.target || prohibition.target.type === "SELF") {
          appliesTo.push(cardInstance.instanceId);
        }
        // Non-SELF targets: store source card for now
        if (prohibition.target && prohibition.target.type !== "SELF") {
          appliesTo.push(cardInstance.instanceId);
        }

        newProhibitions.push({
          id: nanoid(),
          sourceCardInstanceId: cardInstance.instanceId,
          sourceEffectBlockId: block.id,
          prohibitionType: prohibition.type,
          scope: prohibition.scope ?? {},
          duration,
          controller: cardInstance.controller,
          appliesTo,
          usesRemaining: null,
          conditionalOverride: prohibition.conditional_override,
        });
      }
    }
  }

  if (newEffects.length === 0 && newProhibitions.length === 0) return state;

  return {
    ...state,
    activeEffects: newEffects.length > 0
      ? [...state.activeEffects, ...newEffects as any]
      : state.activeEffects,
    prohibitions: newProhibitions.length > 0
      ? [...state.prohibitions, ...newProhibitions as any]
      : state.prohibitions,
  };
}

// ─── Replacement Registration ─────────────────────────────────────────────────

/**
 * Register replacement effect blocks as RuntimeActiveEffects when a card
 * enters the field. These are checked by the replacement interceptor when
 * a KO, removal, or other replaceable event is about to happen.
 */
export function registerReplacementsForCard(
  state: GameState,
  cardInstance: CardInstance,
  cardData: CardData,
): GameState {
  const schema = cardData.effectSchema as EffectSchema | null;
  if (!schema?.effects) return state;

  const newEffects: RuntimeActiveEffect[] = [];

  for (const block of schema.effects) {
    if (block.category !== "replacement") continue;
    if (!block.replaces) continue;

    const zone: EffectZone = block.zone ?? "FIELD";
    if (!isCardInValidZone(cardInstance, zone)) continue;

    // If the schema declares a target_filter, the replacement protects any
    // instance matching that filter — register with empty appliesTo (wildcard)
    // and rely on the filter at check time. Otherwise it's self-protecting.
    const hasTargetFilter = !!block.replaces.target_filter;

    newEffects.push({
      id: nanoid(),
      sourceCardInstanceId: cardInstance.instanceId,
      sourceEffectBlockId: block.id,
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: block.replaces.event,
          cause_filter: block.replaces.cause_filter ?? null,
          target_filter: block.replaces.target_filter ?? null,
          replacement_actions: block.replacement_actions ?? [],
          optional: block.flags?.optional ?? false,
          once_per_turn: block.flags?.once_per_turn ?? false,
        },
      }],
      duration: { type: "PERMANENT" as const },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" as const },
      controller: cardInstance.controller,
      appliesTo: hasTargetFilter ? [] : [cardInstance.instanceId],
      timestamp: Date.now(),
    });
  }

  if (newEffects.length === 0) return state;

  return {
    ...state,
    activeEffects: [...state.activeEffects, ...newEffects as any],
  };
}

// ─── Matching ─────────────────────────────────────────────────────────────────

export interface MatchedTrigger {
  trigger: RuntimeRegisteredTrigger;
  effectBlock: EffectBlock;
}

/**
 * Scan all registered triggers and return those that match the given game event.
 */
export function matchTriggersForEvent(
  state: GameState,
  event: GameEvent,
  cardDb: Map<string, CardData>,
): MatchedTrigger[] {
  const matched: MatchedTrigger[] = [];
  const registry = state.triggerRegistry as RuntimeRegisteredTrigger[];

  for (const reg of registry) {
    if (!reg.trigger || !reg.effectBlock) continue;

    // Check if the source card is still in a valid zone
    const sourceCard = findCardInstance(state, reg.sourceCardInstanceId);
    if (!sourceCard) continue;

    // ON_KO exception (Rule 10-2-17): self-referencing ON_KO triggers activate
    // on field but resolve from trash. Skip zone validation when the KO'd card
    // IS the trigger source — the card is expected to be in trash.
    const isOnKOSelfTrigger =
      event.type === "CARD_KO" &&
      event.payload?.cardInstanceId === reg.sourceCardInstanceId &&
      isOnKOTrigger(reg.trigger);

    if (!isOnKOSelfTrigger && !isCardInValidZone(sourceCard, reg.zone)) continue;

    // Check once-per-turn
    if (reg.effectBlock.flags?.once_per_turn) {
      const usedSet = state.turn.oncePerTurnUsed[reg.effectBlockId];
      if (usedSet?.includes(reg.sourceCardInstanceId)) continue;
    }

    // Match the trigger against the event
    if (matchesTrigger(reg.trigger, event, state, sourceCard, cardDb)) {
      matched.push({ trigger: reg, effectBlock: reg.effectBlock });
    }
  }

  return matched;
}

/**
 * Order matched triggers per rules §8-6:
 * 1. Turn player's triggers first
 * 2. Within a player, player chooses order (we return them grouped)
 */
export function orderMatchedTriggers(
  matched: MatchedTrigger[],
  turnPlayerIndex: 0 | 1,
): MatchedTrigger[] {
  const turnPlayer: MatchedTrigger[] = [];
  const nonTurnPlayer: MatchedTrigger[] = [];

  for (const m of matched) {
    if (m.trigger.controller === turnPlayerIndex) {
      turnPlayer.push(m);
    } else {
      nonTurnPlayer.push(m);
    }
  }

  // Turn player first, then non-turn player
  // Within each group, order is player's choice — we preserve array order for now
  return [...turnPlayer, ...nonTurnPlayer];
}

// ─── Trigger Matching Logic ───────────────────────────────────────────────────

function matchesTrigger(
  trigger: Trigger,
  event: GameEvent,
  state: GameState,
  sourceCard: CardInstance,
  cardDb: Map<string, CardData>,
): boolean {
  // Compound trigger
  if ("any_of" in trigger) {
    return (trigger as CompoundTrigger).any_of.some((t) =>
      matchesTrigger(t, event, state, sourceCard, cardDb),
    );
  }

  // Keyword trigger
  if ("keyword" in trigger) {
    return matchesKeywordTrigger(trigger as KeywordTrigger, event, state, sourceCard, cardDb);
  }

  // Custom trigger
  if ("event" in trigger) {
    return matchesCustomTrigger(trigger as CustomTrigger, event, state, sourceCard, cardDb);
  }

  return false;
}

function matchesKeywordTrigger(
  trigger: KeywordTrigger,
  event: GameEvent,
  state: GameState,
  sourceCard: CardInstance,
  _cardDb: Map<string, CardData>,
): boolean {
  // Map keyword trigger types to event types
  const eventType = keywordToEventType(trigger.keyword);
  if (!eventType) return false;

  // Check if the event type matches
  if (!matchesEventType(event.type, eventType, trigger.keyword)) return false;

  // For self-referencing triggers, check that the event involves this card
  if (isSelfReferencingTrigger(trigger.keyword)) {
    const cardInEvent = getCardFromEvent(event);
    if (cardInEvent && cardInEvent !== sourceCard.instanceId) return false;
  }

  // On Play does not fire when the Character entered the field rested.
  // EB04-018 Megalo and similar "play rested" effects skip the On Play window.
  if (trigger.keyword === "ON_PLAY" && event.type === "CARD_PLAYED") {
    if (event.payload.playedRested) return false;
  }

  // ON_OPPONENT_ATTACK: only fires when it is the opponent's turn to attack
  if (trigger.keyword === "ON_OPPONENT_ATTACK") {
    if (state.turn.activePlayerIndex === sourceCard.controller) return false;
  }

  // END_OF_YOUR_TURN: only fires when the card owner's turn ends
  // END_OF_OPPONENT_TURN: only fires when the opponent's turn ends
  if (trigger.keyword === "END_OF_YOUR_TURN") {
    if (event.playerIndex !== sourceCard.controller) return false;
  }
  if (trigger.keyword === "END_OF_OPPONENT_TURN") {
    if (event.playerIndex === sourceCard.controller) return false;
  }

  // Turn restriction
  if (trigger.turn_restriction) {
    const isOwnersTurn = state.turn.activePlayerIndex === sourceCard.controller;
    if (trigger.turn_restriction === "YOUR_TURN" && !isOwnersTurn) return false;
    if (trigger.turn_restriction === "OPPONENT_TURN" && isOwnersTurn) return false;
  }

  // DON!! requirement — for ON_KO, use pre-KO snapshot from event payload
  // (DON is returned to cost area during KO, so sourceCard.attachedDon is empty)
  if (trigger.don_requirement) {
    const donCount =
      trigger.keyword === "ON_KO" && event.type === "CARD_KO"
        ? event.payload.preKO_donCount
        : sourceCard.attachedDon.length;
    if (donCount < trigger.don_requirement) return false;
  }

  // KO cause (ON_KO only)
  if (trigger.cause && trigger.cause !== "ANY") {
    const eventCause = event.type === "CARD_KO" ? event.payload.cause : undefined;
    if (trigger.cause === "BATTLE" && eventCause !== "BATTLE") return false;
    if (trigger.cause === "EFFECT" && eventCause !== "EFFECT" && eventCause !== "OPPONENT_EFFECT") return false;
    if (trigger.cause === "OPPONENT_EFFECT" && eventCause !== "OPPONENT_EFFECT") return false;
  }

  return true;
}

function matchesCustomTrigger(
  trigger: CustomTrigger,
  event: GameEvent,
  state: GameState,
  sourceCard: CardInstance,
  _cardDb: Map<string, CardData>,
): boolean {
  const eventType = customEventToGameEvent(trigger.event);
  if (!eventType) return false;

  if (event.type !== eventType) return false;

  // Turn restriction
  if (trigger.turn_restriction) {
    const isOwnersTurn = state.turn.activePlayerIndex === sourceCard.controller;
    if (trigger.turn_restriction === "YOUR_TURN" && !isOwnersTurn) return false;
    if (trigger.turn_restriction === "OPPONENT_TURN" && isOwnersTurn) return false;
  }

  // DON!! requirement
  if (trigger.don_requirement) {
    if (sourceCard.attachedDon.length < trigger.don_requirement) return false;
  }

  // Event filter
  if (trigger.filter) {
    if (!matchesEventFilter(trigger.filter, event, sourceCard.controller, state, _cardDb)) return false;
  }

  // Quantity threshold
  if (trigger.quantity_threshold) {
    const count = event.type === "DON_PLACED_ON_FIELD" ? event.payload.count : ("count" in event.payload ? (event.payload as { count?: number }).count ?? 1 : 1);
    if (count < trigger.quantity_threshold) return false;
  }

  return true;
}

// ─── Event Type Mapping ───────────────────────────────────────────────────────

function keywordToEventType(keyword: KeywordTriggerType): GameEventType | null {
  const map: Record<KeywordTriggerType, GameEventType> = {
    ON_PLAY: "CARD_PLAYED",
    WHEN_ATTACKING: "ATTACK_DECLARED",
    ON_KO: "CARD_KO",
    ON_BLOCK: "BLOCK_DECLARED",
    ON_OPPONENT_ATTACK: "ATTACK_DECLARED",
    ACTIVATE_MAIN: "CARD_STATE_CHANGED", // handled separately
    MAIN_EVENT: "CARD_STATE_CHANGED",    // handled separately
    COUNTER: "COUNTER_USED",
    COUNTER_EVENT: "COUNTER_USED",
    TRIGGER: "TRIGGER_ACTIVATED",
    END_OF_YOUR_TURN: "TURN_ENDED",
    END_OF_OPPONENT_TURN: "TURN_ENDED",
    START_OF_TURN: "TURN_STARTED",
  };
  return map[keyword] ?? null;
}

function matchesEventType(
  gameEvent: GameEventType,
  expectedEvent: GameEventType,
  keyword: KeywordTriggerType,
): boolean {
  // ACTIVATE_MAIN and MAIN_EVENT are player-initiated, not event-driven
  if (keyword === "ACTIVATE_MAIN" || keyword === "MAIN_EVENT") return false;

  return gameEvent === expectedEvent;
}

function isSelfReferencingTrigger(keyword: KeywordTriggerType): boolean {
  return [
    "ON_PLAY",
    "WHEN_ATTACKING",
    "ON_KO",
    "ON_BLOCK",
  ].includes(keyword);
}

/** Check if a trigger contains ON_KO (direct keyword or inside compound any_of). */
function isOnKOTrigger(trigger: Trigger): boolean {
  if ("keyword" in trigger && (trigger as KeywordTrigger).keyword === "ON_KO") return true;
  if ("any_of" in trigger) {
    return (trigger as CompoundTrigger).any_of.some(
      (t) => "keyword" in t && (t as KeywordTrigger).keyword === "ON_KO",
    );
  }
  return false;
}

function customEventToGameEvent(event: CustomEventType): GameEventType | null {
  const map: Partial<Record<CustomEventType, GameEventType>> = {
    OPPONENT_CHARACTER_KO: "CARD_KO",
    ANY_CHARACTER_KO: "CARD_KO",
    // OPT-235: "when a Character is trashed" watchers (Basil-style) match the
    // CARD_TRASHED event emitted by trashCharacter — distinct from CARD_KO per
    // rule 10-2-1-3. ON_KO keyword triggers intentionally do NOT listen for
    // CARD_TRASHED, so a KO replaced by trash suppresses Rob Lucci-style
    // ON_KO watchers while still firing these CHARACTER_TRASHED watchers.
    ANY_CHARACTER_TRASHED: "CARD_TRASHED",
    OPPONENT_CHARACTER_TRASHED: "CARD_TRASHED",
    DON_RETURNED_TO_DON_DECK: "DON_DETACHED",
    DON_GIVEN_TO_CARD: "DON_GIVEN_TO_CARD",
    // OPT-236: three distinct Event-activation event classes. Each maps to its
    // own GameEventType rather than all collapsing to CARD_PLAYED, so Usopp-style
    // watchers on FROM_HAND don't spuriously fire on Character plays (which emit
    // CARD_PLAYED) or on Event [Trigger] resolutions from life.
    EVENT_ACTIVATED_FROM_HAND: "EVENT_ACTIVATED_FROM_HAND",
    EVENT_MAIN_RESOLVED_FROM_TRASH: "EVENT_MAIN_RESOLVED_FROM_TRASH",
    EVENT_TRIGGER_RESOLVED: "EVENT_TRIGGER_RESOLVED",
    CHARACTER_PLAYED: "CARD_PLAYED",
    CARD_REMOVED_FROM_LIFE: "CARD_ADDED_TO_HAND_FROM_LIFE",
    TRIGGER_ACTIVATED: "TRIGGER_ACTIVATED",
    DAMAGE_TAKEN: "DAMAGE_DEALT",
    BLOCKER_ACTIVATED: "BLOCK_DECLARED",
    LEADER_ATTACK_DEALS_DAMAGE: "DAMAGE_DEALT",
    CARD_ADDED_TO_HAND_FROM_LIFE: "CARD_ADDED_TO_HAND_FROM_LIFE",
    CHARACTER_BECOMES_RESTED: "CARD_STATE_CHANGED",
    CHARACTER_RETURNED_TO_HAND: "CARD_RETURNED_TO_HAND",
    COMBAT_VICTORY: "COMBAT_VICTORY",
    CHARACTER_BATTLES: "CHARACTER_BATTLES",
    LIFE_COUNT_BECOMES_ZERO: "LIFE_COUNT_BECOMES_ZERO",
    DRAW_OUTSIDE_DRAW_PHASE: "DRAW_OUTSIDE_DRAW_PHASE",
  };
  return map[event] ?? null;
}

function matchesEventFilter(
  filter: EventFilter,
  event: GameEvent,
  sourceController: 0 | 1,
  state: GameState,
  cardDb: Map<string, CardData>,
): boolean {
  if (filter.controller) {
    const eventPlayerIndex = event.playerIndex;
    if (filter.controller === "SELF" && eventPlayerIndex !== sourceController) return false;
    if (filter.controller === "OPPONENT" && eventPlayerIndex === sourceController) return false;
  }

  if (filter.cause) {
    const eventCause = event.type === "CARD_KO" ? event.payload.cause : undefined;
    if (filter.cause !== "ANY" && eventCause !== filter.cause) return false;
  }

  if (filter.target_filter) {
    const targetId = (
      "cardInstanceId" in event.payload ? (event.payload as { cardInstanceId?: string }).cardInstanceId : undefined
    ) ?? (
      "targetInstanceId" in event.payload ? (event.payload as { targetInstanceId?: string }).targetInstanceId : undefined
    );
    if (targetId) {
      const card = findCardInstance(state, targetId);
      if (card && !matchesFilter(card, filter.target_filter, cardDb, state)) return false;
    }
  }

  if (filter.source_zone) {
    const cardId = "cardInstanceId" in event.payload ? (event.payload as { cardInstanceId?: string }).cardInstanceId : undefined;
    if (cardId) {
      const card = findCardInstance(state, cardId);
      if (card && card.zone !== filter.source_zone) return false;
    }
  }

  if (filter.includes_trigger_keyword !== undefined) {
    const cardId = "cardInstanceId" in event.payload ? (event.payload as { cardInstanceId?: string }).cardInstanceId : undefined;
    if (cardId) {
      const card = findCardInstance(state, cardId);
      if (card) {
        const data = cardDb.get(card.cardId);
        const hasTrigger = data?.keywords?.trigger ?? false;
        if (filter.includes_trigger_keyword !== hasTrigger) return false;
      }
    }
  }

  if (filter.includes_blocker_keyword !== undefined) {
    const cardId = "cardInstanceId" in event.payload ? (event.payload as { cardInstanceId?: string }).cardInstanceId : undefined;
    if (cardId) {
      const card = findCardInstance(state, cardId);
      if (card) {
        const data = cardDb.get(card.cardId);
        const hasBlocker = data?.keywords?.blocker ?? false;
        if (filter.includes_blocker_keyword !== hasBlocker) return false;
      }
    }
  }

  if (filter.attribute) {
    const cardId = "cardInstanceId" in event.payload ? (event.payload as { cardInstanceId?: string }).cardInstanceId : undefined;
    if (cardId) {
      const card = findCardInstance(state, cardId);
      if (card) {
        const data = cardDb.get(card.cardId);
        const want = filter.attribute.toUpperCase();
        if (!data?.attribute?.some((a) => a.toUpperCase() === want)) return false;
      }
    }
  }

  if (filter.battle_target_type) {
    const battle = state.turn.battle;
    if (battle) {
      const target = findCardInstance(state, battle.targetInstanceId);
      if (target && target.zone !== filter.battle_target_type) return false;
    }
  }

  if (filter.no_base_effect !== undefined) {
    const cardId = "cardInstanceId" in event.payload ? (event.payload as { cardInstanceId?: string }).cardInstanceId : undefined;
    if (cardId) {
      const card = findCardInstance(state, cardId);
      if (card) {
        const data = cardDb.get(card.cardId);
        const hasNoEffect = !data?.effectText || data.effectText.trim() === "";
        if (filter.no_base_effect !== hasNoEffect) return false;
      }
    }
  }

  return true;
}

function getCardFromEvent(event: GameEvent): string | null {
  const p = event.payload as Record<string, unknown> | undefined;
  if (!p) return null;
  return (
    (p.cardInstanceId as string) ??
    (p.attackerInstanceId as string) ??
    (p.blockerInstanceId as string) ??
    null
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function isCardInValidZone(card: CardInstance, zone: EffectZone): boolean {
  if (zone === "ANY") return true;
  if (zone === "FIELD") {
    return ["LEADER", "CHARACTER", "STAGE"].includes(card.zone);
  }
  if (zone === "HAND") {
    return card.zone === "HAND";
  }
  return false;
}

