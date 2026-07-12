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
import { isOncePerTurnBlock, type EffectSchema } from "./effect-types.js";
import { transitionCard } from "./zone-transition.js";

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
    // Prompt responses and UNDO — handled by GameSession before reaching the pipeline
    case "SELECT_TARGET":
    case "REDISTRIBUTE_DON":
    case "PLAYER_CHOICE":
    case "ARRANGE_TOP_CARDS":
    case "UNDO":
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
    const charCount = nextState.players[pi].characters.filter(Boolean).length;
    if (charCount >= 5 && position != null) {
      const replaced = nextState.players[pi].characters[position];
      if (replaced) {
        const moved = transitionCard(nextState, replaced.instanceId, "TRASH", {
          position: "TOP",
          preserveSourceTriggers: true,
        });
        if (moved) {
          nextState = moved.state;
          events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardInstanceId: replaced.instanceId, newCardInstanceId: moved.fact.newInstanceId, cardId: replaced.cardId, reason: "overflow" } });
        }
      }
    }

    const moved = transitionCard(nextState, cardInstanceId, "CHARACTER", {
      slotIndex: position,
      turnPlayed: nextState.turn.number,
    });
    if (!moved) return { state: nextState, events };
    nextState = moved.state;
    const charNewInstanceId = moved.fact.newInstanceId;

    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, cardInstanceId: charNewInstanceId, zone: "CHARACTER", source: "FROM_HAND", sourceZone: "HAND" } });

  } else if (cardData.type === "Event") {
    // Trash the event, then resolve its MAIN_EVENT effect block directly
    const moved = transitionCard(nextState, cardInstanceId, "TRASH", { position: "TOP" });
    if (!moved) return { state: nextState, events };
    nextState = moved.state;
    const newEventInstanceId = moved.fact.newInstanceId;
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, cardInstanceId: newEventInstanceId, zone: "TRASH", source: "FROM_HAND", sourceZone: "HAND" } });
    // OPT-236 class 1: distinct event for "Event [Main] activated from hand".
    // Watchers subscribing to EVENT_ACTIVATED_FROM_HAND (Usopp-style) fire here
    // and NOT on class 2 (from trash) or class 3 (from life trigger).
    const printedCost = cardData.cost ?? 0;
    const costReducedAmount = Math.max(0, printedCost - cost);
    events.push({ type: "EVENT_ACTIVATED_FROM_HAND", playerIndex: pi, payload: { cardId: cardData.id, cardInstanceId: newEventInstanceId, costReducedAmount } });

    // Resolve the event's MAIN_EVENT effect block (player-initiated, like ACTIVATE_MAIN)
    const schema = cardData.effectSchema as EffectSchema | null;
    if (schema?.effects) {
      const mainBlock = schema.effects.find(
        (b) => b.trigger && "keyword" in b.trigger && b.trigger.keyword === "MAIN_EVENT",
      );
      if (mainBlock) {
        const result = resolveEffect(nextState, mainBlock, newEventInstanceId, pi, cardDb);
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
      const replaced = transitionCard(nextState, existingStage.instanceId, "TRASH", {
        position: "TOP",
        preserveSourceTriggers: true,
      });
      if (replaced) {
        nextState = replaced.state;
        events.push({ type: "CARD_TRASHED", playerIndex: pi, payload: { cardInstanceId: existingStage.instanceId, newCardInstanceId: replaced.fact.newInstanceId, cardId: existingStage.cardId, reason: "stage_replaced" } });
      }
    }
    const moved = transitionCard(nextState, cardInstanceId, "STAGE", { turnPlayed: nextState.turn.number });
    if (!moved) return { state: nextState, events };
    nextState = moved.state;
    events.push({ type: "CARD_PLAYED", playerIndex: pi, payload: { cardId: cardData.id, cardInstanceId: moved.fact.newInstanceId, zone: "STAGE", source: "FROM_HAND", sourceZone: "HAND" } });
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
  // OPT-366: clear any pendingPrompt — without this the pipeline's
  // post-execute pendingPrompt early-return (pipeline.ts step-5 boundary)
  // would skip finishPipeline and never surface `gameOver`. The game is
  // ending; no UI prompt is meaningful anymore.
  const nextState: GameState = {
    ...state,
    status: "FINISHED",
    winner,
    winReason: `Player ${concedingPlayer + 1} conceded`,
    pendingPrompt: null,
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

  // Check once-per-turn restriction
  if (isOncePerTurnBlock(block)) {
    const usedSet = state.turn.oncePerTurnUsed[block.id];
    if (usedSet?.includes(cardInstanceId)) {
      return { state, events };
    }
  }

  // Resolve the effect through the effect resolver
  const result = resolveEffect(state, block, cardInstanceId, actingPlayerIndex, cardDb);

  return {
    state: result.state,
    events: [...events, ...result.events],
    ...(result.pendingPrompt && { pendingPrompt: result.pendingPrompt }),
  };
}
