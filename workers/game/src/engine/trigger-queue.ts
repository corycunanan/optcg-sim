import { holdBattleStepTransitions } from "./battle-step-boundary.js";
import { replaceRetainedEventReferences } from "./events.js";
/** Event scans publish and report work; they never run the drain. */
import type { CardData, GameAction,
  GameState, ExecuteResult, PendingPromptState, QueuedTrigger } from "../types.js";
import { scanEventsForTriggers } from "./trigger-ordering.js";
import { publishCommittedEvents } from "./effect-resolver/resume/events.js";
import { recalculateBattlePowers } from "./battle.js";
import { registerCardEnteredField } from "./triggers.js";
import {
  createTriggerExecution, reportTriggerWork, triggerExecutionOwner } from "./trigger-executor.js";
import { findCardInstance } from "./state.js";
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
  state = reportExecutionEvents(state, execResult, cardDb,
    deferredTriggers
  ).state;
      if (recordPerformedAction) state = recordAction(state, action, actedCard);
      return recalculateBattlePowers(state, cardDb);
  }

/** Event scans publish and enqueue work; only the pending-work drain advances it. */
export function reportExecutionEvents(
  state: GameState,
  execution: ExecuteResult,
  cardDb: Map<string, CardData>,
  deferredTriggers: readonly QueuedTrigger[] = execution.queuedTriggers ?? []
): { state: GameState; events: ExecuteResult["events"] } {
  const events = [...execution.events];
  state = holdBattleStepTransitions(state, events);
  state = publishCommittedEvents(state, events);
  state = registerNewCardTriggers(state, execution, cardDb);
  const scanned = scanEventsForTriggers(
    state,
    events,
    state.turn.activePlayerIndex,
    cardDb
  );
  state = replaceRetainedEventReferences(
    scanned.state,
    execution.events,
    scanned.events
  );
  const triggers = [...deferredTriggers, ...scanned.triggers];
  if (triggers.length || triggerExecutionOwner(state)) {
    const reported = triggerExecutionOwner(state)
      ? reportTriggerWork(state, triggers)
      : createTriggerExecution(state, triggers);
    state = reported.state;
}
  return { state, events: scanned.events };
}

/**
 * Publish and report End Phase events without activation. The common drain
 * completes the reported children before advancing the next phase stage.
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
 * Report a closed window, or append ordinary work to its existing owner.
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
      return { state: reported.state };
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
