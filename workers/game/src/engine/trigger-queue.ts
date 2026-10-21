/**
 * Pipeline event scanning and explicit rules-window entry points. All queued
 * work is reported to the shared trigger executor; ordinary reports join the
 * existing owner while damage and End Phase windows retain their boundaries.
 */

import { isGameTerminated } from "./terminal.js";
import type { CardData, GameAction, GameEvent, GameState, ExecuteResult, PendingPromptState, QueuedTrigger } from "../types.js";
import { recalculateBattlePowers } from "./battle.js";
import { emitPendingEvent } from "./events.js";
import {
  matchTriggersForEvent,
  orderMatchedTriggers,
  registerCardEnteredField,
  deregisterDepartedSources,
} from "./triggers.js";
import { resolverExecutionServices } from "./effect-resolver/resolver.js";
import { advanceTriggerExecution, createTriggerExecution, reportTriggerWork, triggerExecutionOwner } from "./trigger-executor.js";
import { findCardInstance } from "./state.js";
import {
  queuedSourceSnapshot,
} from "./trigger-ordering.js";
import { takeEngineTimestamp } from "./execution-context.js";

// ─── Step 5: Fire Events & Triggers ───────────────────────────────────────────

export function fireEventsAndTriggers(
  state: GameState,
  execResult: ExecuteResult,
  action: GameAction,
  cardDb: Map<string, CardData>,
  actedCard?: ActedCardSnapshot,
  recordPerformedAction = true,
  deferredTriggers: readonly QueuedTrigger[] = [],
): GameState {
  const pi = state.turn.activePlayerIndex;

  // Emit all events from execution
  for (const event of execResult.events) {
    if (!event.propagation?.eventLogEmitted) state = emitPendingEvent(state, event, pi);
  }

  // Register triggers for newly played cards BEFORE matching
  state = registerNewCardTriggers(state, execResult, cardDb);

  // Collect ALL matched triggers from ALL events, ordered per rule §8-6.
  // OPT-963: triggers a damage frame deferred until its damage processing
  // completed (rule 8-6-2) were matched from earlier events, so they head
  // the queue with the same grouping as if matched here.
  const triggerQueue: QueuedTrigger[] = [...deferredTriggers];

  for (const pendingEvent of execResult.events) {
    // Resolver-side per-frame drains mark events after matching them. They
    // still need event-log publication and zone cleanup above/below, but must
    // not enqueue the same triggers a second time here.
    if (pendingEvent.propagation?.triggerScanned) continue;

    const timed = takeEngineTimestamp(state);
    state = timed.state;
    const gameEvent = {
      type: pendingEvent.type,
      playerIndex: pendingEvent.playerIndex ?? pi,
      payload: pendingEvent.payload ?? {},
      timestamp: timed.timestamp,
    } as GameEvent;

    const matched = matchTriggersForEvent(state, gameEvent, cardDb);
    if (matched.length === 0) continue;

    const ordered = orderMatchedTriggers(matched, state.turn.activePlayerIndex);
    for (const match of ordered) {
      triggerQueue.push({
        sourceCardInstanceId: match.trigger.sourceCardInstanceId,
        sourceSnapshot: queuedSourceSnapshot(
          state,
          match.trigger.sourceCardInstanceId,
          match.trigger.controller,
          match.effectBlock.id
        ),
        controller: match.trigger.controller,
        effectBlock: match.effectBlock,
        triggeringEvent: pendingEvent,
      });
    }
  }

  // Deregister triggers for cards that left the field AFTER matching
  state = deregisterDepartedSources(state, execResult.events);

  // Group triggers by controller — turn player resolves first (§8-6),
  // and within each group the player chooses the order.
  if (triggerQueue.length > 0 || triggerExecutionOwner(state)) {
    const activePI = state.turn.activePlayerIndex;
    const turnPlayerTriggers = triggerQueue.filter(t => t.controller === activePI);
    const nonTurnPlayerTriggers = triggerQueue.filter(t => t.controller !== activePI);

    const result = processPlayerTriggerGroup(state, turnPlayerTriggers, nonTurnPlayerTriggers, cardDb, "ordinary");
    state = result.state;
    if (isGameTerminated(state)) return state;

    if (result.pendingPrompt) {
      state = recalculateBattlePowers(state, cardDb);
      state = { ...state, pendingPrompt: result.pendingPrompt };
      if (recordPerformedAction) state = recordAction(state, action, actedCard);
      return state;
    }

    state = recalculateBattlePowers(state, cardDb);
  }

  // Record the action performed
  if (recordPerformedAction) state = recordAction(state, action, actedCard);
  return state;
}

/**
 * Publish End Phase events and resolve the auto effects they fulfil with the
 * pipeline's own Step 5 policy (OPT-924): turn player's group first, nested
 * triggers LIFO. The End Phase calls this after each stage action so its
 * triggered work finishes before the next rule step, while the ending player
 * is still the turn player. A prompt is left on `state.pendingPrompt`.
 */
export function fireEndPhaseEvents(
  state: GameState,
  events: ExecuteResult["events"],
  cardDb: Map<string, CardData>,
): GameState {
  if (events.length === 0) return state;
  return fireEventsAndTriggers(state, { state, events }, { type: "ADVANCE_PHASE" }, cardDb, undefined, false);
}

/**
 * Printed-property snapshot of the card a PLAY_CARD / USE_COUNTER_EVENT /
 * DECLARE_BLOCKER action acted on (OPT-443). Captured pre-execute in
 * runPipeline; attached to the recorded PerformedAction entry so
 * ACTION_PERFORMED_THIS_TURN conditions can scope by controller, card
 * category, and base cost.
 */
export interface ActedCardSnapshot {
  /**
   * Who performed the action. GameSession authenticates this actor before
   * entering the pipeline, so this remains correct for both active-player
   * actions and defending-player counter/blocker actions.
   */
  controller: 0 | 1;
  cardId: string;
  cardType: string;
  baseCost: number;
}

export function recordAction(
  state: GameState,
  action: GameAction,
  actedCard?: ActedCardSnapshot,
): GameState {
  const timed = takeEngineTimestamp(state);
  return {
    ...timed.state,
    turn: {
      ...timed.state.turn,
      actionsPerformedThisTurn: [
        ...timed.state.turn.actionsPerformedThisTurn,
        {
          actionType: action.type,
          timestamp: timed.timestamp,
          // OPT-443: card-acting actions carry who acted and a printed-property
          // snapshot so ACTIVATED_EVENT / PLAYED_CHARACTER / USED_BLOCKER
          // conditions can scope by controller, category, and base cost.
          ...(actedCard ?? {}),
        },
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
        state = registerCardEnteredField(state, instance, cardData);
      }
    }
  }
  return state;
}

// ─── Simultaneous Trigger Ordering ───────────────────────────────────────────

/**
 * Process a player's group of simultaneous triggers.
 * If 0–1 triggers, resolve directly. If 2+, prompt the player to pick order.
 * `afterTriggers` are the other player's triggers, stored as pendingTriggers.
 */
export function processPlayerTriggerGroup(
  state: GameState,
  triggers: QueuedTrigger[],
  afterTriggers: QueuedTrigger[],
  cardDb: Map<string, CardData>,
  scope: "ordinary" | "window" = "window",
): { state: GameState; pendingPrompt?: PendingPromptState } {
  const reported = scope === "ordinary" && triggerExecutionOwner(state)
    ? reportTriggerWork(state, [...triggers, ...afterTriggers])
    : createTriggerExecution(state, [...triggers, ...afterTriggers]);
  switch (reported.kind) {
    case "completed":
    case "terminal":
      return { state: reported.state };
    case "queued":
    case "continued":
      return advanceTriggerExecution(reported, cardDb, resolverExecutionServices);
    case "waiting":
      throw new Error("A new trigger scope must be queued, completed, or terminal");
  }
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
