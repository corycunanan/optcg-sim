/**
 * 7-Step Action Pipeline
 *
 * Every game mutation flows through here — no exceptions.
 *
 * 1. Validate
 * 2. Check Prohibitions  (M4: scans active prohibitions)
 * 3. Check Replacements  (M4: substitutes actions)
 * 4. Execute
 * 5. Fire Triggers       (M4: event bus → trigger registry → effect resolver)
 * 6. Recalculate Modifiers (M4: expire effects, recompute layers)
 * 7. Rule Processing     (defeat checks)
 */

import type { CardData, GameAction, GameState, ExecuteResult, PendingPromptState } from "../types.js";
import { validate } from "./validation.js";
import { execute } from "./execute.js";
import { emitEvent } from "./events.js";
import { checkDefeat } from "./defeat.js";
import { checkProhibitions } from "./prohibitions.js";
import { checkReplacements } from "./replacements.js";
import {
  matchTriggersForEvent,
  orderMatchedTriggers,
  registerTriggersForCard,
  registerReplacementsForCard,
  deregisterTriggersForCard,
} from "./triggers.js";
import { resolveEffect } from "./effect-resolver.js";
import {
  expireEndOfTurnEffects,
  expireBattleEffects,
  expireSourceLeftZone,
  expireProhibitions,
  processScheduledActions,
} from "./duration-tracker.js";

export interface PipelineResult {
  state: GameState;
  valid: boolean;
  error?: string;
  gameOver?: { winner: 0 | 1 | null; reason: string };
  pendingPrompt?: PendingPromptState;
}

export function runPipeline(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actingPlayerIndex: 0 | 1,
): PipelineResult {
  // Step 1: Validate
  const validationError = validate(state, action, cardDb);
  if (validationError) {
    return { state, valid: false, error: validationError };
  }

  // Step 2: Check Prohibitions
  const prohibitionVeto = checkProhibitions(state, action, cardDb, actingPlayerIndex);
  if (prohibitionVeto) {
    return { state, valid: false, error: prohibitionVeto };
  }

  // Step 3: Check Replacements
  const replacementResult = checkReplacements(state, action, cardDb, actingPlayerIndex);
  let nextState = replacementResult.state;
  const actionToExecute = replacementResult.replaced && replacementResult.substituteAction
    ? replacementResult.substituteAction
    : action;

  // Emit replacement events
  for (const event of replacementResult.events) {
    nextState = emitEvent(
      nextState,
      event.type,
      event.playerIndex ?? actingPlayerIndex,
      event.payload ?? {},
    );
  }

  // If the action was fully replaced (no substitute), skip execution
  if (replacementResult.replaced && !replacementResult.substituteAction) {
    return finishPipeline(nextState, actingPlayerIndex, cardDb);
  }

  // Step 4: Execute — produce new state snapshot
  const execResult = execute(nextState, actionToExecute, cardDb, actingPlayerIndex);
  nextState = execResult.state;

  if (execResult.pendingPrompt) {
    nextState = { ...nextState, pendingPrompt: execResult.pendingPrompt };
    return { state: nextState, valid: true, pendingPrompt: execResult.pendingPrompt };
  }

  // Step 5: Fire Triggers — emit events, scan triggerRegistry, resolve effects
  nextState = fireEventsAndTriggers(nextState, execResult, actionToExecute, cardDb);

  // If triggers paused for player input, skip steps 6-7 and surface the prompt
  if (nextState.pendingPrompt) {
    return { state: nextState, valid: true, pendingPrompt: nextState.pendingPrompt };
  }

  // Step 6: Recalculate Modifiers — expire effects whose duration ended
  nextState = recalculateModifiers(nextState, actionToExecute, cardDb);

  // Step 7: Rule Processing — defeat conditions, zero-power KOs
  return finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
}

// ─── Step 5: Fire Events & Triggers ───────────────────────────────────────────

function fireEventsAndTriggers(
  state: GameState,
  execResult: ExecuteResult,
  action: GameAction,
  cardDb: Map<string, CardData>,
): GameState {
  const pi = state.turn.activePlayerIndex;

  // Emit all events from execution
  for (const event of execResult.events) {
    state = emitEvent(state, event.type, event.playerIndex ?? pi, event.payload ?? {});
  }

  // Handle trigger registration for zone changes
  state = handleZoneChangeTriggers(state, execResult, cardDb);

  // Scan triggerRegistry for matches against emitted events
  // Process only events emitted by this execution (not historical)
  const eventsToProcess = execResult.events;

  for (const pendingEvent of eventsToProcess) {
    const gameEvent = {
      type: pendingEvent.type,
      playerIndex: pendingEvent.playerIndex ?? pi,
      payload: pendingEvent.payload ?? {},
      timestamp: Date.now(),
    };

    const matched = matchTriggersForEvent(state, gameEvent, cardDb);
    console.log(`[pipeline] event=${pendingEvent.type} registry=${state.triggerRegistry.length} matched=${matched.length}`);
    if (matched.length === 0) continue;

    const ordered = orderMatchedTriggers(matched, state.turn.activePlayerIndex);

    // Resolve each matched trigger's effect block
    for (const match of ordered) {
      console.log(`[pipeline] resolving trigger blockId=${match.effectBlock.id} card=${match.trigger.sourceCardInstanceId}`);
      const result = resolveEffect(
        state,
        match.effectBlock,
        match.trigger.sourceCardInstanceId,
        match.trigger.controller,
        cardDb,
      );
      console.log(`[pipeline] resolveEffect resolved=${result.resolved} hasPendingPrompt=${!!result.pendingPrompt}`);
      state = result.state;

      if (result.pendingPrompt) {
        // Store pause state and stop processing further triggers
        state = { ...state, pendingPrompt: result.pendingPrompt };
        return state;
      }

      // Emit events from effect resolution (which may trigger further effects)
      for (const event of result.events) {
        state = emitEvent(
          state,
          event.type,
          event.playerIndex ?? match.trigger.controller,
          event.payload ?? {},
        );
      }
    }
  }

  // Record the action performed
  state = {
    ...state,
    turn: {
      ...state.turn,
      actionsPerformedThisTurn: [
        ...state.turn.actionsPerformedThisTurn,
        { actionType: action.type, timestamp: Date.now() },
      ],
    },
  };

  return state;
}

/**
 * Handle trigger registration/deregistration for zone changes.
 * When a card enters the field, register its triggers.
 * When a card leaves the field, deregister + expire source-bound effects.
 */
function handleZoneChangeTriggers(
  state: GameState,
  execResult: ExecuteResult,
  cardDb: Map<string, CardData>,
): GameState {
  for (const event of execResult.events) {
    if (event.type === "CARD_PLAYED") {
      // Card entered the field — register triggers
      const cardId = event.payload?.cardId as string | undefined;
      const cardInstanceId = event.payload?.cardInstanceId as string | undefined;
      if (!cardId) continue;

      const cardData = cardDb.get(cardId);
      console.log(`[zone] CARD_PLAYED cardId=${cardId} hasSchema=${!!cardData?.effectSchema} instanceId=${cardInstanceId}`);
      if (!cardData) continue;

      // Use instanceId from event (now correctly set to the post-moveCard instanceId)
      const instance = cardInstanceId
        ? findCardInstanceAnywhere(state, cardInstanceId)
        : findNewlyPlayedCard(state, cardId);
      console.log(`[zone] instance found=${!!instance} zone=${instance?.zone} triggersBefore=${state.triggerRegistry.length}`);
      if (instance) {
        state = registerTriggersForCard(state, instance, cardData);
        state = registerReplacementsForCard(state, instance, cardData);
        console.log(`[zone] triggersAfter=${state.triggerRegistry.length}`);
      }
    }

    if (event.type === "CARD_KO" || event.type === "CARD_RETURNED_TO_HAND") {
      // Card left the field — deregister triggers and expire source-bound effects
      const instanceId = event.payload?.cardInstanceId as string | undefined;
      if (!instanceId) continue;

      state = deregisterTriggersForCard(state, instanceId);
      state = expireSourceLeftZone(state, instanceId);
    }

    if (event.type === "CARD_TRASHED") {
      // If trashed from field (stage replaced, overflow), deregister
      const cardId = event.payload?.cardId as string | undefined;
      if (cardId) {
        // Find by cardId in trash (most recent)
        for (const player of state.players) {
          const trashed = player.trash.find((c) => c.cardId === cardId);
          if (trashed) {
            state = deregisterTriggersForCard(state, trashed.instanceId);
            state = expireSourceLeftZone(state, trashed.instanceId);
            break;
          }
        }
      }
    }
  }

  return state;
}

// ─── Step 6: Recalculate Modifiers ────────────────────────────────────────────

function recalculateModifiers(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
): GameState {
  // Expire battle-scoped effects when battle ends
  if (action.type === "PASS" && state.turn.battle) {
    state = expireBattleEffects(state, state.turn.battle.battleId);
  }

  // Expire prohibitions at the same boundaries
  if (state.turn.phase === "END") {
    state = expireEndOfTurnEffects(state);
    state = expireProhibitions(state, "END_OF_TURN", { turn: state.turn.number });

    // Process end-of-turn scheduled actions
    const scheduled = processScheduledActions(state, "END_OF_THIS_TURN");
    state = scheduled.state;
    for (const entry of scheduled.actionsToRun) {
      // Resolve each scheduled action through the effect resolver
      // (simplified — in full impl these would go through the pipeline)
      const fakeBlock = {
        id: "scheduled_" + entry.sourceEffectId,
        category: "auto" as const,
        actions: [entry.action],
      };
      const result = resolveEffect(state, fakeBlock, entry.sourceEffectId, entry.controller, cardDb);
      state = result.state;
    }
  }

  return state;
}

// ─── Step 7: Rule Processing ──────────────────────────────────────────────────

function finishPipeline(
  state: GameState,
  actingPlayerIndex: 0 | 1,
  _cardDb: Map<string, CardData>,
  execResult?: ExecuteResult,
): PipelineResult {
  const defeatCtx = execResult?.damagedPlayerIndex !== undefined
    ? { damagedPlayerIndex: execResult.damagedPlayerIndex }
    : {};
  const defeat = checkDefeat(state, defeatCtx);

  if (defeat) {
    state = {
      ...state,
      status: "FINISHED",
      winner: defeat.winner,
      winReason: defeat.reason,
    };
    state = emitEvent(state, "GAME_OVER", actingPlayerIndex, {
      winner: defeat.winner,
      reason: defeat.reason,
    });
    return {
      state,
      valid: true,
      gameOver: { winner: defeat.winner, reason: defeat.reason },
    };
  }

  // CONCEDE (and any action that sets FINISHED without going through defeat checks)
  if (state.status === "FINISHED" || state.status === "ABANDONED") {
    return {
      state,
      valid: true,
      gameOver: {
        winner: state.winner,
        reason: state.winReason ?? "Game over",
      },
    };
  }

  return { state, valid: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findNewlyPlayedCard(
  state: GameState,
  cardId: string,
): import("../types.js").CardInstance | null {
  for (const player of state.players) {
    // Check characters (most common for CARD_PLAYED)
    const char = player.characters.find((c) => c.cardId === cardId);
    if (char) return char;
    // Check stage
    if (player.stage?.cardId === cardId) return player.stage;
  }
  return null;
}

/** Find a card instance by instanceId in all zones (field, hand, trash, etc.) */
function findCardInstanceAnywhere(
  state: GameState,
  instanceId: string,
): import("../types.js").CardInstance | null {
  for (const player of state.players) {
    if (player.leader.instanceId === instanceId) return player.leader;
    const char = player.characters.find((c) => c.instanceId === instanceId);
    if (char) return char;
    if (player.stage?.instanceId === instanceId) return player.stage;
    const hand = player.hand.find((c) => c.instanceId === instanceId);
    if (hand) return hand;
    const trash = player.trash.find((c) => c.instanceId === instanceId);
    if (trash) return trash;
  }
  return null;
}
