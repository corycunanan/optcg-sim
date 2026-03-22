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
import { getEffectiveCost } from "./modifiers.js";
import { executeAdvancePhase } from "./phases.js";
import {
  executeDeclareAttack,
  executeDeclareBlocker,
  executePass,
  executeUseCounter,
  executeUseCounterEvent,
  executeRevealTrigger,
} from "./battle.js";

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
      return { state, events: [] }; // M4
  }
}

// ─── Play Card ────────────────────────────────────────────────────────────────

function executePlayCard(
  state: GameState,
  cardInstanceId: string,
  _position: number | undefined,
  cardDb: Map<string, CardData>,
): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);

  const found = findCardInState(state, cardInstanceId)!;
  const cardData = cardDb.get(found.card.cardId)!;
  const cost = getEffectiveCost(cardData);

  // Pay cost: rest DON!!
  let nextState = restDonForCost(state, pi, cost)!;

  if (cardData.type === "Character") {
    // Handle 5-card overflow: if character area already has 5, discard oldest.
    // Full overflow prompt is handled at the WebSocket layer before the action is sent.
    if (nextState.players[pi].characters.length >= 5) {
      const oldest = nextState.players[pi].characters[0];
      nextState = moveCard(nextState, oldest.instanceId, "TRASH");
      events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardId: oldest.cardId, reason: "overflow" } });
    }

    nextState = moveCard(nextState, cardInstanceId, "CHARACTER");
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

    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, zone: "CHARACTER" } });

  } else if (cardData.type === "Event") {
    // Trash the event, then the effect fires (MANUAL_EFFECT in M3)
    nextState = moveCard(nextState, cardInstanceId, "TRASH");
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, zone: "TRASH" } });

  } else if (cardData.type === "Stage") {
    // Trash existing stage first
    if (nextState.players[pi].stage) {
      const existingStage = nextState.players[pi].stage!;
      nextState = moveCard(nextState, existingStage.instanceId, "TRASH");
      events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardId: existingStage.cardId, reason: "stage_replaced" } });
    }
    nextState = moveCard(nextState, cardInstanceId, "STAGE");
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, zone: "STAGE" } });
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
