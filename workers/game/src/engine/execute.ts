/**
 * Step 4: Execute
 *
 * Thin dispatcher — delegates to phases.ts, battle.ts, or handles
 * Main Phase actions (play card, attach DON!!) directly.
 */

import type { CardData, GameAction, GameState, PendingEvent, ExecuteResult } from "../types.js";
import {
  getActivePlayerIndex,
  findCardInState,
  moveCard,
  restDonForCost,
  attachDon,
} from "./state.js";
import { getEffectiveCost, consumeOneTimeModifiers } from "./modifiers.js";
import { executeAdvancePhase } from "./phases.js";
import {
  executeDeclareAttack,
  executeDeclareBlocker,
  executePass,
  executeUseCounter,
  executeUseCounterEvent,
  executeRevealTrigger,
} from "./battle.js";
import { resolveEffect } from "./effect-resolver/index.js";
import type { EffectSchema } from "./effect-types.js";

export function execute(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): ExecuteResult {
  switch (action.type) {
    case "ADVANCE_PHASE":
      return executeAdvancePhase(state, cardDb);
    case "PLAY_CARD":
      return executePlayCard(state, action.cardInstanceId, action.position, cardDb);
    case "ATTACH_DON":
      return executeAttachDon(state, action.targetInstanceId, action.count);
    case "DECLARE_ATTACK":
      return executeDeclareAttack(state, action.attackerInstanceId, action.targetInstanceId, cardDb);
    case "DECLARE_BLOCKER":
      return executeDeclareBlocker(state, action.blockerInstanceId, cardDb);
    case "USE_COUNTER":
      return executeUseCounter(state, action.cardInstanceId, action.counterTargetInstanceId, cardDb);
    case "USE_COUNTER_EVENT":
      return executeUseCounterEvent(state, action.cardInstanceId, cardDb);
    case "REVEAL_TRIGGER":
      return executeRevealTrigger(state, action.reveal, cardDb);
    case "PASS":
      return executePass(state, cardDb);
    case "CONCEDE":
      return executeConcede(state, actingPlayerIndex);
    case "MANUAL_EFFECT":
      return executeManualEffect(state, action.description);
    case "ACTIVATE_EFFECT":
      return executeActivateEffect(state, action.cardInstanceId, action.effectId, cardDb, actingPlayerIndex);
    // Prompt responses — handled by GameSession before reaching the pipeline
    case "SELECT_TARGET":
    case "PLAYER_CHOICE":
    case "ARRANGE_TOP_CARDS":
      return { state, events: [] };
  }
}

// ─── Play Card ────────────────────────────────────────────────────────────────

function executePlayCard(
  state: GameState,
  cardInstanceId: string,
  position: number | undefined,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const cost = getEffectiveCost(cardData, state, cardInstanceId, cardDb);

  // Pay cost: rest DON!!
  let nextState = restDonForCost(state, pi, cost)!;

  // Consume any one-time cost modifiers that applied
  nextState = consumeOneTimeModifiers(nextState, cardData, pi);

  if (cardData.type === "Character") {
    // Handle 5-card overflow: trash the character at the specified position
    if (nextState.players[pi].characters.length >= 5 && position != null) {
      const replaced = nextState.players[pi].characters[position];
      nextState = moveCard(nextState, replaced.instanceId, "TRASH");
      events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardId: replaced.cardId, reason: "overflow" } });
    }

    nextState = moveCard(nextState, cardInstanceId, "CHARACTER");
    // moveCard assigns a new instanceId — capture it for trigger matching
    const newCharInstance = nextState.players[pi].characters[nextState.players[pi].characters.length - 1];
    const charNewInstanceId = newCharInstance.instanceId;
    // Record turn played for Rush/summoning sickness
    const charIdx = nextState.players[pi].characters.findIndex(
      (c) => c.cardId === found.card.cardId && c.turnPlayed === null,
    );
    if (charIdx !== -1) {
      const chars = [...nextState.players[pi].characters];
      chars[charIdx] = { ...chars[charIdx], turnPlayed: nextState.turn.number };
      const newPlayers = [...nextState.players] as [typeof nextState.players[0], typeof nextState.players[1]];
      newPlayers[pi] = { ...newPlayers[pi], characters: chars };
      nextState = { ...nextState, players: newPlayers };
    }

    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, cardInstanceId: charNewInstanceId, zone: "CHARACTER", source: "FROM_HAND" } });

  } else if (cardData.type === "Event") {
    // Trash the event, then resolve its MAIN_EVENT effect block directly
    nextState = moveCard(nextState, cardInstanceId, "TRASH");
    const newEventInstance = nextState.players[pi].trash[0]; // trash is LIFO, newest at [0]
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, cardInstanceId: newEventInstance.instanceId, zone: "TRASH", source: "FROM_HAND" } });

    // Resolve the event's MAIN_EVENT effect block (player-initiated, like ACTIVATE_MAIN)
    const schema = cardData.effectSchema as EffectSchema | null;
    if (schema?.effects) {
      const mainBlock = schema.effects.find(
        (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "MAIN_EVENT",
      );
      if (mainBlock) {
        const result = resolveEffect(nextState, mainBlock, newEventInstance.instanceId, pi, cardDb);
        nextState = result.state;
        events.push(...result.events);
        if (result.pendingPrompt) {
          return { state: nextState, events, pendingPrompt: result.pendingPrompt };
        }
      }
    }

  } else if (cardData.type === "Stage") {
    // Trash existing stage first
    if (nextState.players[pi].stage) {
      const existingStage = nextState.players[pi].stage!;
      nextState = moveCard(nextState, existingStage.instanceId, "TRASH");
      events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardId: existingStage.cardId, reason: "stage_replaced" } });
    }
    nextState = moveCard(nextState, cardInstanceId, "STAGE");
    const newStageInstance = nextState.players[pi].stage!;
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, cardInstanceId: newStageInstance.instanceId, zone: "STAGE", source: "FROM_HAND" } });
  }

  return { state: nextState, events };
}

// ─── Attach DON!! ─────────────────────────────────────────────────────────────

function executeAttachDon(
  state: GameState,
  targetInstanceId: string,
  count: number,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  let nextState = state;

  for (let i = 0; i < count; i++) {
    const result = attachDon(nextState, pi, targetInstanceId);
    if (!result) break;
    nextState = result;
  }

  events.push({ type: "DON_GIVEN_TO_CARD", playerIndex: pi, payload: { targetInstanceId, count } });
  return { state: nextState, events };
}

// ─── Concede ──────────────────────────────────────────────────────────────────

function executeConcede(state: GameState, concedingPlayer: 0 | 1): ExecuteResult {
  const winner: 0 | 1 = concedingPlayer === 0 ? 1 : 0;
  const nextState: GameState = {
    ...state,
    status: "FINISHED",
    winner,
    winReason: `Player ${concedingPlayer + 1} conceded`,
  };
  return {
    state: nextState,
    events: [{
      type: "GAME_OVER",
      playerIndex: concedingPlayer,
      payload: { winner, reason: "concede" },
    }],
  };
}

// ─── Manual Effect ────────────────────────────────────────────────────────────

function executeManualEffect(state: GameState, _description: string): ExecuteResult {
  return { state, events: [] };
}

// ─── Activate Effect (M4) ─────────────────────────────────────────────────────

function executeActivateEffect(
  state: GameState,
  cardInstanceId: string,
  effectId: string,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): ExecuteResult {
  const events: PendingEvent[] = [];

  // Find the card
  const found = findCardInState(state, cardInstanceId);
  if (!found) return { state, events: [{ type: "CARD_STATE_CHANGED", payload: { error: "Card not found" } }] };

  const cardData = cardDb.get(found.card.cardId);
  if (!cardData) return { state, events };

  // Get the effect schema
  const schema = cardData.effectSchema as EffectSchema | null;
  if (!schema) return { state, events };

  // Find the specific effect block
  const block = schema.effects.find((b) => b.id === effectId);
  if (!block) return { state, events };

  // Verify it's an activate effect
  if (block.category !== "activate") return { state, events };

  // Verify it has ACTIVATE_MAIN trigger
  if (!block.trigger || !("keyword" in block.trigger) ||
      (block.trigger.keyword !== "ACTIVATE_MAIN")) {
    return { state, events };
  }

  // Resolve the effect through the effect resolver
  const result = resolveEffect(state, block, cardInstanceId, actingPlayerIndex, cardDb);

  return {
    state: result.state,
    events: [...events, ...result.events],
    ...(result.pendingPrompt && { pendingPrompt: result.pendingPrompt }),
  };
}
