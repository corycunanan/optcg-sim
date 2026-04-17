/**
 * Phase transition logic
 *
 * Handles REFRESH → DRAW → DON → MAIN → END phase sequence
 * and turn handoff. Extracted from execute.ts for clarity.
 */

import type { CardData, GameState, PendingEvent, ExecuteResult } from "../types.js";
import {
  getActivePlayerIndex,
  returnAttachedDonToCostArea,
  activateAllRested,
  moveCard,
  placeDonFromDeck,
} from "./state.js";
import {
  expireEndOfTurnEffects,
  expireProhibitions,
  processScheduledActions,
} from "./duration-tracker.js";
import { resolveEffect } from "./effect-resolver/index.js";

/**
 * Returns true if the current phase should be auto-advanced without player input.
 *
 * REFRESH, DRAW, and DON require no player decisions in M3.
 * Future (M4+): return false when a "start of turn" card effect needs a player choice,
 * e.g. a trigger that lets you search your deck or rearrange life cards.
 */
export function isStartOfTurnAutoPhase(_state: GameState): boolean {
  const { phase } = _state.turn;
  return phase === "REFRESH" || phase === "DRAW" || phase === "DON";
}

export function executeAdvancePhase(state: GameState, cardDb: Map<string, CardData>): ExecuteResult {
  const events: PendingEvent[] = [];
  const pi = getActivePlayerIndex(state);
  const { phase, number: turnNumber } = state.turn;

  let nextState = state;

  switch (phase) {
    case "REFRESH": {
      // Step 1: "until start of your next turn" effects expire (M4)
      // Step 2: "at start of your/opponent's turn" auto effects (M4)
      // Step 3: Return attached DON!! to cost area (rested)
      nextState = returnAttachedDonToCostArea(nextState, pi);
      events.push({ type: "DON_DETACHED", playerIndex: pi });
      // Step 4: Activate all rested cards
      nextState = activateAllRested(nextState, pi);
      // Advance to DRAW
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "DRAW" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "REFRESH", to: "DRAW" } });
      break;
    }

    case "DRAW": {
      // Draw 1 card (except first player turn 1)
      const isFirstPlayerTurnOne = turnNumber === 1 && pi === 0;
      if (!isFirstPlayerTurnOne) {
        const drawn = nextState.players[pi].deck[0];
        if (drawn) {
          nextState = moveCard(nextState, drawn.instanceId, "HAND");
          // moveCard assigns a new instanceId; find the card that just arrived in hand
          const arrivedCard = nextState.players[pi].hand[nextState.players[pi].hand.length - 1];
          events.push({ type: "CARD_DRAWN", playerIndex: pi, payload: { cardId: drawn.cardId, cardInstanceId: arrivedCard?.instanceId } });
        }
        // Deck-out is checked in step 7 (defeat.ts)
      }
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "DON" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "DRAW", to: "DON" } });
      break;
    }

    case "DON": {
      // Place DON!! cards: 2 normally, 1 on first player's first turn
      const donCount = (turnNumber === 1 && pi === 0) ? 1 : 2;
      nextState = placeDonFromDeck(nextState, pi, donCount);
      events.push({
        type: "DON_PLACED_ON_FIELD",
        playerIndex: pi,
        payload: { count: Math.min(donCount, state.players[pi].donDeck.length) },
      });
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "MAIN" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "DON", to: "MAIN" } });
      break;
    }

    case "MAIN": {
      // Advance to END
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "END" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "MAIN", to: "END" } });
      // Run end-phase sequence automatically
      const endResult = runEndPhase(nextState, pi, cardDb);
      nextState = endResult.state;
      events.push(...endResult.events);
      break;
    }

    case "END": {
      // Should not be reached via ADVANCE_PHASE (end phase runs automatically)
      break;
    }
  }

  return { state: nextState, events };
}

function runEndPhase(state: GameState, pi: 0 | 1, cardDb: Map<string, CardData>): ExecuteResult {
  const events: PendingEvent[] = [];

  // Steps 1 & 2: [End of Your Turn] / [End of Your Opponent's Turn] effects (M4)

  // Steps 3-6: Expire THIS_TURN effects and prohibitions before turn transition
  state = expireEndOfTurnEffects(state);
  state = expireProhibitions(state, "END_OF_TURN", { turn: state.turn.number });

  // Process end-of-turn scheduled actions
  const scheduled = processScheduledActions(state, "END_OF_THIS_TURN");
  state = scheduled.state;
  for (const entry of scheduled.actionsToRun) {
    const fakeBlock = {
      id: "scheduled_" + entry.sourceEffectId,
      category: "auto" as const,
      actions: [entry.action],
    };
    const result = resolveEffect(state, fakeBlock, entry.sourceEffectId, entry.controller, cardDb);
    state = result.state;
  }

  // Turn passes to opponent
  const nextPlayerIndex: 0 | 1 = pi === 0 ? 1 : 0;
  const nextTurnNumber = nextPlayerIndex === 0 ? state.turn.number + 1 : state.turn.number;

  events.push({ type: "TURN_ENDED", playerIndex: pi });

  const nextState: GameState = {
    ...state,
    turn: {
      number: nextTurnNumber,
      activePlayerIndex: nextPlayerIndex,
      phase: "REFRESH",
      battleSubPhase: null,
      battle: null,
      oncePerTurnUsed: {},
      actionsPerformedThisTurn: [],
      deckHitZeroThisTurn: [false, false],
    },
  };

  events.push({ type: "TURN_STARTED", playerIndex: nextPlayerIndex });
  events.push({
    type: "PHASE_CHANGED",
    playerIndex: nextPlayerIndex,
    payload: { from: "END", to: "REFRESH" },
  });

  return { state: nextState, events };
}
