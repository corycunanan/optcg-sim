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
  EffectBlock,
  EffectSchema,
  EffectZone,
  RuntimeRegisteredTrigger,
} from "./effect-types.js";
import type {
  CardData,
  CardInstance,
  GameEvent,
  GameEventType,
  GameState,
} from "../types.js";
import { nanoid } from "../util/nanoid.js";

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
    if (!isCardInValidZone(sourceCard, reg.zone)) continue;

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

  // KO cause (ON_KO only)
  if (trigger.cause && trigger.cause !== "ANY") {
    const eventCause = event.payload?.cause as string | undefined;
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
    if (!matchesEventFilter(trigger.filter, event, sourceCard.controller)) return false;
  }

  // Quantity threshold
  if (trigger.quantity_threshold) {
    const count = (event.payload?.count as number) ?? 1;
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

function customEventToGameEvent(event: CustomEventType): GameEventType | null {
  const map: Partial<Record<CustomEventType, GameEventType>> = {
    OPPONENT_CHARACTER_KO: "CARD_KO",
    ANY_CHARACTER_KO: "CARD_KO",
    DON_RETURNED_TO_DON_DECK: "DON_DETACHED",
    DON_GIVEN_TO_CARD: "DON_GIVEN_TO_CARD",
    EVENT_ACTIVATED: "CARD_PLAYED",
    CHARACTER_PLAYED: "CARD_PLAYED",
    CARD_REMOVED_FROM_LIFE: "CARD_ADDED_TO_HAND_FROM_LIFE",
    TRIGGER_ACTIVATED: "TRIGGER_ACTIVATED",
    DAMAGE_TAKEN: "DAMAGE_DEALT",
    BLOCKER_ACTIVATED: "BLOCK_DECLARED",
    LEADER_ATTACK_DEALS_DAMAGE: "DAMAGE_DEALT",
    CARD_ADDED_TO_HAND_FROM_LIFE: "CARD_ADDED_TO_HAND_FROM_LIFE",
    CHARACTER_BECOMES_RESTED: "CARD_STATE_CHANGED",
    CHARACTER_RETURNED_TO_HAND: "CARD_RETURNED_TO_HAND",
  };
  return map[event] ?? null;
}

function matchesEventFilter(
  filter: any,
  event: GameEvent,
  sourceController: 0 | 1,
): boolean {
  if (filter.controller) {
    const eventPlayerIndex = event.playerIndex;
    if (filter.controller === "SELF" && eventPlayerIndex !== sourceController) return false;
    if (filter.controller === "OPPONENT" && eventPlayerIndex === sourceController) return false;
    // EITHER matches both
  }

  if (filter.cause) {
    const eventCause = event.payload?.cause as string | undefined;
    if (filter.cause !== "ANY" && eventCause !== filter.cause) return false;
  }

  return true;
}

function getCardFromEvent(event: GameEvent): string | null {
  return (event.payload?.cardInstanceId as string) ?? null;
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

function findCardInstance(state: GameState, instanceId: string): CardInstance | null {
  for (const player of state.players) {
    if (player.leader.instanceId === instanceId) return player.leader;
    const char = player.characters.find((c) => c.instanceId === instanceId);
    if (char) return char;
    if (player.stage?.instanceId === instanceId) return player.stage;
    const hand = player.hand.find((c) => c.instanceId === instanceId);
    if (hand) return hand;
  }
  return null;
}
