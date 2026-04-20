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

import type { CardData, GameAction, GameEvent, GameState, ExecuteResult, PendingPromptState } from "../types.js";
import { validate } from "./validation.js";
import { execute } from "./execute.js";
import { recalculateBattlePowers } from "./battle.js";
import { emitEvent, emitPendingEvent } from "./events.js";
import { checkDefeat } from "./defeat.js";
import { checkProhibitions } from "./prohibitions.js";
import { checkReplacements } from "./replacements.js";
import {
  matchTriggersForEvent,
  orderMatchedTriggers,
  registerTriggersForCard,
  registerReplacementsForCard,
  registerPermanentEffectsForCard,
  deregisterTriggersForCard,
} from "./triggers.js";
import { resolveEffect } from "./effect-resolver/index.js";
import { peekFrame as peekStackFrame, updateTopFrame as updateStackTopFrame } from "./effect-stack.js";
import { findCardInstance } from "./state.js";
import type { QueuedTrigger } from "../types.js";
import { scanEventsForTriggers, buildTriggerSelectionPrompt } from "./trigger-ordering.js";
import {
  expireSourceLeftZone,
  expireTargetLeftZone,
  evaluateWhileConditions,
} from "./duration-tracker.js";
import { log } from "../lib/log.js";

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
  const logCtx = {
    gameId: state.id,
    turn: state.turn.number,
    actingPlayer: actingPlayerIndex,
    actionType: action.type,
  };
  log("pipeline.start", logCtx);

  // Step 1: Validate
  log("pipeline.step", { ...logCtx, step: "validate" });
  const validationError = validate(state, action, cardDb);
  if (validationError) {
    log("pipeline.end", { ...logCtx, outcome: "invalid", error: validationError });
    return { state, valid: false, error: validationError };
  }

  // Step 2: Check Prohibitions
  log("pipeline.step", { ...logCtx, step: "prohibitions" });
  const prohibitionVeto = checkProhibitions(state, action, cardDb, actingPlayerIndex);
  if (prohibitionVeto) {
    log("pipeline.end", { ...logCtx, outcome: "prohibited", error: prohibitionVeto });
    return { state, valid: false, error: prohibitionVeto };
  }

  // Step 3: Check Replacements
  log("pipeline.step", { ...logCtx, step: "replacements" });
  const replacementResult = checkReplacements(state, action, cardDb, actingPlayerIndex);
  let nextState = replacementResult.state;
  const actionToExecute = replacementResult.replaced && replacementResult.substituteAction
    ? replacementResult.substituteAction
    : action;

  // Emit replacement events
  for (const event of replacementResult.events) {
    nextState = emitPendingEvent(nextState, event, actingPlayerIndex);
  }

  // If the action was fully replaced (no substitute), skip execution
  if (replacementResult.replaced && !replacementResult.substituteAction) {
    log("pipeline.end", { ...logCtx, outcome: "fully_replaced" });
    return finishPipeline(nextState, actingPlayerIndex, cardDb);
  }

  // Step 4: Execute — produce new state snapshot
  log("pipeline.step", { ...logCtx, step: "execute" });
  const execResult = execute(nextState, actionToExecute, cardDb, actingPlayerIndex);
  nextState = execResult.state;

  if (execResult.pendingPrompt) {
    nextState = { ...nextState, pendingPrompt: execResult.pendingPrompt };
    log("pipeline.end", {
      ...logCtx,
      outcome: "prompt_pending",
      stage: "execute",
      promptType: execResult.pendingPrompt.options.promptType,
    });
    return { state: nextState, valid: true, pendingPrompt: execResult.pendingPrompt };
  }

  // Step 5: Fire Triggers — emit events, scan triggerRegistry, resolve effects
  log("pipeline.step", { ...logCtx, step: "triggers" });
  nextState = fireEventsAndTriggers(nextState, execResult, actionToExecute, cardDb);

  // If triggers paused for player input, skip steps 6-7 and surface the prompt
  if (nextState.pendingPrompt) {
    log("pipeline.end", {
      ...logCtx,
      outcome: "prompt_pending",
      stage: "triggers",
      promptType: nextState.pendingPrompt.options.promptType,
    });
    return { state: nextState, valid: true, pendingPrompt: nextState.pendingPrompt };
  }

  // Step 6: Recalculate Modifiers — expire effects whose duration ended
  log("pipeline.step", { ...logCtx, step: "recalculate_modifiers" });
  nextState = recalculateModifiers(nextState, actionToExecute, cardDb);

  // Step 7: Rule Processing — defeat conditions, zero-power KOs
  log("pipeline.step", { ...logCtx, step: "rule_processing" });
  const result = finishPipeline(nextState, actingPlayerIndex, cardDb, execResult);
  log("pipeline.end", {
    ...logCtx,
    outcome: result.gameOver ? "game_over" : "ok",
    ...(result.gameOver ? { winner: result.gameOver.winner, reason: result.gameOver.reason } : {}),
  });
  return result;
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
    state = emitPendingEvent(state, event, pi);
  }

  // Register triggers for newly played cards BEFORE matching
  state = registerNewCardTriggers(state, execResult, cardDb);

  // Collect ALL matched triggers from ALL events, ordered per rule §8-6
  const triggerQueue: QueuedTrigger[] = [];

  for (const pendingEvent of execResult.events) {
    const gameEvent = {
      type: pendingEvent.type,
      playerIndex: pendingEvent.playerIndex ?? pi,
      payload: pendingEvent.payload ?? {},
      timestamp: Date.now(),
    } as GameEvent;

    // Counter event cards go hand → trash and are never registered in the
    // trigger registry. Inject their COUNTER_EVENT effect blocks directly.
    if (pendingEvent.type === "COUNTER_USED" && pendingEvent.payload?.type === "event") {
      const { cardId, cardInstanceId = "" } = pendingEvent.payload;
      const controller = (pendingEvent.playerIndex ?? pi) as 0 | 1;
      const counterCardData = cardDb.get(cardId);
      if (counterCardData?.effectSchema) {
        const schema = counterCardData.effectSchema as import("./effect-types.js").EffectSchema;
        for (const block of schema.effects) {
          if (block.category === "auto" && block.trigger && "keyword" in block.trigger && block.trigger.keyword === "COUNTER_EVENT") {
            triggerQueue.push({
              sourceCardInstanceId: cardInstanceId,
              controller,
              effectBlock: block,
              triggeringEvent: pendingEvent,
            });
          }
        }
      }
    }

    const matched = matchTriggersForEvent(state, gameEvent, cardDb);
    if (matched.length === 0) continue;

    const ordered = orderMatchedTriggers(matched, state.turn.activePlayerIndex);
    for (const match of ordered) {
      triggerQueue.push({
        sourceCardInstanceId: match.trigger.sourceCardInstanceId,
        controller: match.trigger.controller,
        effectBlock: match.effectBlock,
        triggeringEvent: pendingEvent,
      });
    }
  }

  // Deregister triggers for cards that left the field AFTER matching
  state = deregisterLeftFieldTriggers(state, execResult);

  // Group triggers by controller — turn player resolves first (§8-6),
  // and within each group the player chooses the order.
  if (triggerQueue.length > 0) {
    const activePI = state.turn.activePlayerIndex;
    const turnPlayerTriggers = triggerQueue.filter(t => t.controller === activePI);
    const nonTurnPlayerTriggers = triggerQueue.filter(t => t.controller !== activePI);

    const result = processPlayerTriggerGroup(state, turnPlayerTriggers, nonTurnPlayerTriggers, cardDb);
    state = result.state;

    if (result.pendingPrompt) {
      state = recalculateBattlePowers(state, cardDb);
      state = { ...state, pendingPrompt: result.pendingPrompt };
      state = recordAction(state, action);
      return state;
    }

    state = recalculateBattlePowers(state, cardDb);
  }

  // Record the action performed
  state = recordAction(state, action);
  return state;
}

/**
 * Process a queue of triggers with LIFO semantics.
 * When a resolved trigger emits events that match new triggers,
 * those new triggers are inserted at the FRONT of the queue (LIFO).
 */
function processTriggerQueuePipeline(
  state: GameState,
  queue: QueuedTrigger[],
  cardDb: Map<string, CardData>,
): { state: GameState; pendingPrompt?: PendingPromptState } {
  let nextState = state;

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;

    const result = resolveEffect(
      nextState,
      next.effectBlock as import("./effect-types.js").EffectBlock,
      next.sourceCardInstanceId,
      next.controller,
      cardDb,
    );
    nextState = result.state;

    if (result.pendingPrompt) {
      // Store remaining triggers in the top stack frame's pendingTriggers
      const topFrame = peekStackFrame(nextState);
      if (topFrame) {
        nextState = updateStackTopFrame(nextState, {
          pendingTriggers: [...topFrame.pendingTriggers ?? [], ...queue],
        });
      }
      return { state: nextState, pendingPrompt: result.pendingPrompt };
    }

    // Emit events from this trigger's resolution
    for (const event of result.events) {
      nextState = emitPendingEvent(nextState, event, next.controller);
    }

    // LIFO: scan result events for new triggers and insert at front
    if (result.events.length > 0) {
      const scanResult = scanEventsForTriggers(nextState, result.events, next.controller, cardDb);
      nextState = scanResult.state;
      if (scanResult.triggers.length > 0) {
        queue.unshift(...scanResult.triggers);
      }
    }
  }

  return { state: nextState };
}

function recordAction(state: GameState, action: GameAction): GameState {
  return {
    ...state,
    turn: {
      ...state.turn,
      actionsPerformedThisTurn: [
        ...state.turn.actionsPerformedThisTurn,
        { actionType: action.type, timestamp: Date.now() },
      ],
    },
  };
}


/**
 * Handle trigger registration/deregistration for zone changes.
 * When a card enters the field, register its triggers.
 * When a card leaves the field, deregister + expire source-bound effects.
 */
/** Register triggers for newly played cards (CARD_PLAYED events). */
function registerNewCardTriggers(
  state: GameState,
  execResult: ExecuteResult,
  cardDb: Map<string, CardData>,
): GameState {
  for (const event of execResult.events) {
    if (event.type === "CARD_PLAYED") {
      const { cardId, cardInstanceId } = event.payload ?? {};
      if (!cardId) continue;

      const cardData = cardDb.get(cardId);
      if (!cardData) continue;

      const instance = cardInstanceId
        ? findCardInstance(state, cardInstanceId)
        : findNewlyPlayedCard(state, cardId);
      if (instance) {
        state = registerTriggersForCard(state, instance, cardData);
        state = registerReplacementsForCard(state, instance, cardData);
        state = registerPermanentEffectsForCard(state, instance, cardData);
      }
    }
  }
  return state;
}

/** Deregister triggers for cards that left the field (KO, bounce, trash, to-deck). */
function deregisterLeftFieldTriggers(
  state: GameState,
  execResult: ExecuteResult,
): GameState {
  const cleanupInstance = (s: GameState, id: string): GameState => {
    s = deregisterTriggersForCard(s, id);
    s = expireSourceLeftZone(s, id);
    // OPT-256: also strip the leaving instanceId from every effect/prohibition
    // target list so fresh-instance invariants hold on re-summon.
    s = expireTargetLeftZone(s, id);
    return s;
  };

  for (const event of execResult.events) {
    if (
      event.type === "CARD_KO" ||
      event.type === "CARD_RETURNED_TO_HAND" ||
      event.type === "CARD_RETURNED_TO_DECK"
    ) {
      const instanceId = event.payload?.cardInstanceId;
      if (!instanceId) continue;
      state = cleanupInstance(state, instanceId);
    }

    if (event.type === "CARD_TRASHED") {
      const cardId = event.payload?.cardId;
      if (cardId) {
        for (const player of state.players) {
          const trashed = player.trash.find((c) => c.cardId === cardId);
          if (trashed) {
            state = cleanupInstance(state, trashed.instanceId);
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
  // Re-evaluate WHILE_CONDITION effects every step
  state = evaluateWhileConditions(state, cardDb);

  // End-of-turn expiry (THIS_TURN effects, prohibitions, scheduled actions) is now
  // handled inside runEndPhase() before the turn transition, so it runs while
  // state.turn.number still matches the expiring effects' turn.

  return state;
}

// ─── Step 7: Rule Processing ──────────────────────────────────────────────────

function updateDeckHitZeroFlag(state: GameState): GameState {
  const [p0, p1] = state.players;
  const flag: [boolean, boolean] = state.turn.deckHitZeroThisTurn ?? [false, false];
  const next0 = flag[0] || p0.deck.length === 0;
  const next1 = flag[1] || p1.deck.length === 0;
  if (next0 === flag[0] && next1 === flag[1] && state.turn.deckHitZeroThisTurn) {
    return state;
  }
  return {
    ...state,
    turn: { ...state.turn, deckHitZeroThisTurn: [next0, next1] },
  };
}

function finishPipeline(
  state: GameState,
  actingPlayerIndex: 0 | 1,
  cardDb: Map<string, CardData>,
  execResult?: ExecuteResult,
): PipelineResult {
  // Mark the sticky "deck hit zero this turn" flag the first time either
  // player's deck transitions to 0. Reset on turn change by phases.ts.
  // Must fire before checkDefeat so end-of-turn evaluation sees the flag.
  state = updateDeckHitZeroFlag(state);

  // An ADVANCE_PHASE that crosses MAIN → END emits TURN_ENDED as part of the
  // same action. Treat that boundary as the end-of-turn defeat window so
  // delayed-loss leaders (Brook) collect their deferred loss.
  const isEndOfTurn = !!execResult?.events.some((e) => e.type === "TURN_ENDED");

  const defeatCtx: { damagedPlayerIndex?: 0 | 1; endOfTurn?: boolean } = {};
  if (execResult?.damagedPlayerIndex !== undefined) {
    defeatCtx.damagedPlayerIndex = execResult.damagedPlayerIndex;
  }
  if (isEndOfTurn) defeatCtx.endOfTurn = true;

  const defeat = checkDefeat(state, defeatCtx, cardDb);

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

// ─── Simultaneous Trigger Ordering ───────────────────────────────────────────

/**
 * Process a player's group of simultaneous triggers.
 * If 0–1 triggers, resolve directly. If 2+, prompt the player to pick order.
 * `afterTriggers` are the other player's triggers, stored as pendingTriggers.
 */
function processPlayerTriggerGroup(
  state: GameState,
  triggers: QueuedTrigger[],
  afterTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
): { state: GameState; pendingPrompt?: PendingPromptState } {
  if (triggers.length === 0) {
    // No triggers for this player — process the other player's group
    if (afterTriggers.length === 0) return { state };
    return processPlayerTriggerGroup(state, afterTriggers, [], cardDb);
  }

  if (triggers.length === 1) {
    // Single trigger — auto-resolve, no prompt needed
    const result = processTriggerQueuePipeline(state, [...triggers], cardDb);
    if (result.pendingPrompt) {
      // Store afterTriggers on the stack frame so they resume later
      const topFrame = peekStackFrame(result.state);
      if (topFrame && afterTriggers.length > 0) {
        result.state = updateStackTopFrame(result.state, {
          pendingTriggers: [...topFrame.pendingTriggers ?? [], ...afterTriggers],
        });
      }
      return result;
    }
    // Single trigger done — process the other player's group
    if (afterTriggers.length === 0) return { state: result.state };
    return processPlayerTriggerGroup(result.state, afterTriggers, [], cardDb);
  }

  // 2+ triggers — prompt the player to choose the order
  return buildTriggerSelectionPrompt(state, triggers, afterTriggers, cardDb);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findNewlyPlayedCard(
  state: GameState,
  cardId: string,
): import("../types.js").CardInstance | null {
  for (const player of state.players) {
    // Check characters (most common for CARD_PLAYED)
    const char = player.characters.find((c) => c?.cardId === cardId);
    if (char) return char;
    // Check stage
    if (player.stage?.cardId === cardId) return player.stage;
  }
  return null;
}

