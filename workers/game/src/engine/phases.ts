/**
 * Phase transition logic
 *
 * Handles REFRESH → DRAW → DON → MAIN → END phase sequence
 * and turn handoff. Extracted from execute.ts for clarity.
 */

import { advanceTriggerExecution, createEffectExecutionScope, createTriggerExecution } from "./trigger-executor.js";
import { resolverExecutionServices } from "./effect-resolver/resolver.js";
import { queuedSourceSnapshot } from "./trigger-ordering.js";
import { isGameTerminated, publishBeforeGameOver } from "./terminal.js";
import { releaseMovedDonEffects } from "./don-area-effects.js";
import type {
  CardData,
  EffectStackFrame,
  EndPhaseStage,
  EndPhaseStep,
  ExecuteResult,
  GameEvent,
  GameState,
  PendingEvent,
  PendingPromptState,
  PhaseBoundaryContinuation,
  QueuedTrigger,
} from "../types.js";
import {
  getActivePlayerIndex,
  returnAttachedDonToCostArea,
  activateAllRested,
  placeDonFromDeck,
} from "./state.js";
import {
  collectEndOfTurnObligations,
  expireDuringThisTurn,
  expireRefreshPhaseEffects,
  expireUntilEndOfTurn,
} from "./duration-tracker.js";
import { resolveEffect } from "./effect-resolver/index.js";
import { emitPendingEvent, withEventLogEmitted, withTriggerScanned } from "./events.js";
import {
  CONTINUATION_EFFECT_BLOCK,
  generateFrameId,
  peekFrame,
  popFrame,
} from "./effect-stack.js";
import { applyRefreshProhibitions } from "./prohibitions.js";
import { transitionCard } from "./zone-transition.js";
import { evaluateCondition } from "./conditions.js";
import { takeEngineTimestamp } from "./execution-context.js";
import { matchTriggersForEvent, orderMatchedTriggers } from "./triggers.js";
import { hasDelayedDeckOutLoss, runRuleProcessing } from "./defeat.js";
import { MAX_EFFECT_STACK_DEPTH, terminateForEngineLimit } from "./engine-limits.js";
// The End Phase resolves its waves and obligations with the pipeline's own
// Step 5 trigger policy (no third policy, OPT-924).
import { fireEndPhaseEvents, processPlayerTriggerGroup } from "./trigger-queue.js";

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
      // Step 1: "until start of your next turn" effects expire (OPT-408)
      nextState = expireRefreshPhaseEffects(nextState);
      // Step 2: "at start of your/opponent's turn" auto effects (M4)
      // Step 3: Return attached DON!! to cost area (rested)
      const beforeDonReturn = nextState;
      nextState = returnAttachedDonToCostArea(nextState, pi);
      // Rule 3-1-6-1: the returned DON!! changed area, so effects applied to
      // them end now — before step 4 decides what stays rested.
      nextState = releaseMovedDonEffects(beforeDonReturn, nextState);
      events.push({ type: "DON_DETACHED", playerIndex: pi });
      // Step 4: Activate all rested cards — except those held rested by a
      // CANNOT_REFRESH prohibition, which is consumed by the refresh it skips
      const refreshProhib = applyRefreshProhibitions(nextState, pi, cardDb);
      nextState = activateAllRested(refreshProhib.nextState, pi, refreshProhib.skipInstanceIds);
      // Advance to DRAW
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "DRAW" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "REFRESH", to: "DRAW" } });
      break;
    }

    case "DRAW": {
      // §6-3-1: first player skips DRAW on turn 1. Anchored to the actual
      // first player set during the pregame priority decision (OPT-366), not
      // hardcoded to player 0. Falls back to 0 for legacy paths that bypass
      // the pregame flow (tests / sandbox scenarios).
      const firstPlayerIndex = state.turn.firstPlayerIndex ?? 0;
      const isFirstPlayerTurnOne = turnNumber === 1 && pi === firstPlayerIndex;
      if (!isFirstPlayerTurnOne) {
        const drawn = nextState.players[pi].deck[0];
        if (drawn) {
          const moved = transitionCard(nextState, drawn.instanceId, "HAND");
          if (moved) {
            nextState = moved.state;
            events.push({ type: "CARD_DRAWN", playerIndex: pi, payload: { cardId: drawn.cardId, cardInstanceId: moved.fact.newInstanceId } });
          }
        }
        // Deck-out is checked in step 7 (defeat.ts)
      }
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "DON" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "DRAW", to: "DON" } });
      break;
    }

    case "DON": {
      // §6-4-1: first player places only 1 DON!! on turn 1, otherwise 2.
      // Anchored to the actual first player set during the pregame priority
      // decision (OPT-366), not hardcoded to player 0.
      const firstPlayerIndex = state.turn.firstPlayerIndex ?? 0;
      const donCount = (turnNumber === 1 && pi === firstPlayerIndex) ? 1 : 2;
      const player = state.players[pi];
      const placedCount = Math.min(donCount, player.donDeck.length);
      // Roger's prerequisite must see the field before these new DON!! arrive
      // (official OP13 FAQ). Only newly placed DON!! may be given to the Leader.
      const rules = cardDb.get(player.leader.cardId)?.effectSchema?.rule_modifications ?? [];
      let givenCount = 0;
      for (const rule of rules) {
        if (rule.rule_type !== "DON_PHASE_BEHAVIOR" || rule.destination !== "GIVEN_TO_LEADER") continue;
        if (rule.condition && !evaluateCondition(state, rule.condition, {
          sourceCardInstanceId: player.leader.instanceId,
          controller: pi,
          cardDb,
        })) continue;
        givenCount = Math.min(placedCount, givenCount + rule.count);
      }
      nextState = placeDonFromDeck(nextState, pi, donCount);
      if (givenCount > 0) {
        const placedPlayer = nextState.players[pi];
        const newDonStart = player.donCostArea.length;
        const givenDon = placedPlayer.donCostArea.slice(newDonStart, newDonStart + givenCount);
        const players: GameState["players"] = [...nextState.players];
        players[pi] = {
          ...placedPlayer,
          donCostArea: [...player.donCostArea, ...placedPlayer.donCostArea.slice(newDonStart + givenCount)],
          leader: {
            ...placedPlayer.leader,
            attachedDon: [...placedPlayer.leader.attachedDon, ...givenDon.map(don => ({ ...don, attachedTo: player.leader.instanceId }))],
          },
        };
        nextState = { ...nextState, players };
      }
      events.push({
        type: "DON_PLACED_ON_FIELD",
        playerIndex: pi,
        payload: { count: placedCount },
      });
      if (givenCount > 0) {
        events.push({
          type: "DON_GIVEN_TO_CARD",
          playerIndex: pi,
          payload: { targetInstanceId: player.leader.instanceId, count: givenCount },
        });
      }
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "MAIN" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "DON", to: "MAIN" } });
      break;
    }

    case "MAIN": {
      // Advance to END
      nextState = { ...nextState, turn: { ...nextState.turn, phase: "END" } };
      events.push({ type: "PHASE_CHANGED", playerIndex: pi, payload: { from: "MAIN", to: "END" } });
      // Run end-phase sequence automatically
      return runEndPhase(nextState, pi, cardDb, events);
    }

    case "END": {
      // Should not be reached via ADVANCE_PHASE (end phase runs automatically)
      break;
    }
  }

  return { state: nextState, events };
}

/**
 * Rule 6-6-1, in order (OPT-924):
 *   6-6-1-1   the ending player's [End of Your Turn] wave, then (6-6-1-1-2)
 *             the non-turn player's [End of Your Opponent's Turn] wave. Each
 *             wave repeats while an effect newly fulfilled inside it remains
 *             (8-6-1-1, Decision 9), bounded by the engine budget.
 *   6-6-1-2   step 1: the turn player's "at the end of this turn" obligations,
 *             then the turn player's "until the end of the turn" expiry;
 *             step 2: the same for the non-turn player.
 *   6-6-1-3   "during this turn" expiry, turn player then non-turn player.
 *   6-6-1-4   the end-of-turn rule checkpoint (OP15-022 Brook), then hand-off.
 * The ending player stays the turn player until the hand-off, so every
 * [Your Turn] / [Opponent's Turn] check inside the End Phase sees them.
 */
function runEndPhase(
  state: GameState,
  pi: 0 | 1,
  cardDb: Map<string, CardData>,
  events: PendingEvent[] = []
): ExecuteResult {
  return continueEndPhase(
    state,
    {
      kind: "END_PHASE",
      endingPlayerIndex: pi,
      stage: "END_OF_YOUR_TURN_WAVE",
      remainingScheduledActions: [],
      activatedWaveEffects: [],
    },
    cardDb,
    events
  );
}

/** Resume end-phase work parked below a prompt frame. */
export function resumePhaseBoundary(
  state: GameState,
  cardDb: Map<string, CardData>,
  triggerExecutionMode = false
): ExecuteResult {
  const frame = peekFrame(state);
  if (!frame?.phaseBoundaryContinuation) return { state, events: [] };
  return continueEndPhase(
    popFrame(state),
    frame.phaseBoundaryContinuation,
    cardDb,
    [...frame.accumulatedEvents],
    triggerExecutionMode
  );
}

/** Stage order of a staged End Phase. `LEGACY_SCHEDULED_ACTIONS` is not in it. */
const STAGED_END_PHASE: readonly EndPhaseStage[] = [
  "END_OF_YOUR_TURN_WAVE",
  "END_OF_OPPONENT_TURN_WAVE",
  "TURN_PLAYER_END_OF_TURN",
  "NON_TURN_PLAYER_END_OF_TURN",
];

interface StageOutcome {
  state: GameState;
  continuation: PhaseBoundaryContinuation;
  /** Set when the stage parked below a prompt; the End Phase stops here. */
  pendingPrompt?: PendingPromptState;
}

function continueEndPhase(
  initialState: GameState,
  continuation: PhaseBoundaryContinuation,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
  triggerExecutionMode = false
): ExecuteResult {
  const stage = continuation.stage ?? "LEGACY_SCHEDULED_ACTIONS";
  if (stage === "LEGACY_SCHEDULED_ACTIONS") {
    return continueLegacyScheduledActions(initialState, continuation, cardDb, events, triggerExecutionMode);
  }

  const pi = continuation.endingPlayerIndex;
  // Frames pushed by a stage sit above this depth; a parked End Phase frame
  // goes here, below all of them.
  const parkDepth = initialState.effectStack.length;
  let state = initialState;

  // Events handed in (the MAIN → END phase change, or a parked frame's
  // accumulator) publish and fire before any End Phase work.
  if (events.length > 0) {
    state = fireEndPhaseEvents(state, events, cardDb, triggerExecutionMode);
    events = events.map((event) => withTriggerScanned(withEventLogEmitted(event)));
    if (isGameTerminated(state)) return { state, events };
    if (state.pendingPrompt) {
      return parkStage(state, { ...continuation, stage }, parkDepth, events);
    }
  }

  let current: PhaseBoundaryContinuation = { ...continuation, stage };
  // 6-6-1-2 processes "any remaining effects" of this turn: an obligation
  // created after its owner's step (by the other player's step) sends the
  // End Phase back through step 1 and step 2. Each pass resolves at least one
  // obligation, which consumes the engine budget, so the loop is bounded.
  for (let index = STAGED_END_PHASE.indexOf(stage); ; index = STAGED_END_PHASE.indexOf("TURN_PLAYER_END_OF_TURN")) {
    const outcome = runStagesFrom(state, current, index, cardDb, parkDepth, triggerExecutionMode);
    state = outcome.state;
    current = outcome.continuation;
    if (isGameTerminated(state)) return { state, events };
    if (outcome.pendingPrompt) return { state, events: [], pendingPrompt: outcome.pendingPrompt };
    if (!state.scheduledActions.some((entry) => entry.timing === "END_OF_THIS_TURN")) break;
  }

  // 6-6-1-3: "during this turn" expiry, turn player then non-turn player.
  state = expireDuringThisTurn(state);

  state = closeEndOfTurnWindow(state, pi, cardDb);
  if (isGameTerminated(state)) return { state, events };

  return completeTurnHandoff(state, pi, events, { endOfTurnWindowsRan: true });
}

/** Run the staged End Phase from `startIndex` through 6-6-1-2 step 2. */
function runStagesFrom(
  initialState: GameState,
  continuation: PhaseBoundaryContinuation,
  startIndex: number,
  cardDb: Map<string, CardData>,
  parkDepth: number,
  triggerExecutionMode = false
): StageOutcome {
  let state = initialState;
  let current = continuation;
  for (let index = startIndex; index < STAGED_END_PHASE.length; index += 1) {
    current = { ...current, stage: STAGED_END_PHASE[index] };
    const outcome = current.stage === "END_OF_YOUR_TURN_WAVE" || current.stage === "END_OF_OPPONENT_TURN_WAVE"
      ? runWave(state, current, cardDb, parkDepth, triggerExecutionMode)
      : runEndOfTurnStep(state, current, cardDb, parkDepth, triggerExecutionMode);
    state = outcome.state;
    current = outcome.continuation;
    // OPT-960 / OPT-962: nothing after a terminal outcome. No later stage,
    // no expiry, no hand-off.
    if (isGameTerminated(state)) return { state, continuation: current };
    if (outcome.pendingPrompt) return { state, continuation: current, pendingPrompt: outcome.pendingPrompt };
    if (current.stage === "TURN_PLAYER_END_OF_TURN") state = expireUntilEndOfTurn(state, "TURN_PLAYER");
    if (current.stage === "NON_TURN_PLAYER_END_OF_TURN") state = expireUntilEndOfTurn(state, "NON_TURN_PLAYER");
  }
  return { state, continuation: current };
}

/**
 * 6-6-1-4 boundary: the end-of-turn rule checkpoint (PR 2's
 * `runRuleProcessing` with `endOfTurn`), opened once per End Phase, before the
 * hand-off, for the delayed deck-out loss (OP15-022 Brook: "You lose at the
 * end of the turn in which your deck becomes 0 cards"). Every other defeat
 * condition was already processed at the move that met it (9-1-2), so the
 * window opens only when a Leader carries that modification.
 */
function closeEndOfTurnWindow(
  state: GameState,
  pi: 0 | 1,
  cardDb: Map<string, CardData>
): GameState {
  if (!hasDelayedDeckOutLoss(state, 0, cardDb) && !hasDelayedDeckOutLoss(state, 1, cardDb)) {
    return state;
  }
  return runRuleProcessing(state, { endOfTurn: true }, cardDb, pi);
}

/**
 * One 6-6-1-1 wave. Collect the wave owner's [End of Your Turn] (ending
 * player) or [End of Your Opponent's Turn] (non-turn player) effects that
 * have not activated in this End Phase, resolve them as one group through the
 * pipeline's trigger policy (the owner orders 2+, nested triggers resolve
 * before the next), and repeat until no new effect is fulfilled. Each pass
 * activates at least one new effect, and every resolution consumes the
 * engine budget, so the loop ends in an ENGINE_LIMIT outcome rather than
 * running forever.
 */
function runWave(
  initialState: GameState,
  continuation: PhaseBoundaryContinuation,
  cardDb: Map<string, CardData>,
  parkDepth: number,
  triggerExecutionMode = false
): StageOutcome {
  let state = initialState;
  const pi = continuation.endingPlayerIndex;
  const endingPlayersWave = continuation.stage === "END_OF_YOUR_TURN_WAVE";
  let activated = [...(continuation.activatedWaveEffects ?? [])];

  for (;;) {
    const collected = collectWaveTriggers(state, pi, endingPlayersWave, activated, cardDb);
    state = collected.state;
    if (collected.triggers.length === 0) {
      return { state, continuation: { ...continuation, activatedWaveEffects: activated } };
    }
    activated = [...activated, ...collected.triggers.map(waveEffectKey)];
    const result = triggerExecutionMode
      ? advanceTriggerExecution(createTriggerExecution(state, collected.triggers), cardDb, resolverExecutionServices)
      : processPlayerTriggerGroup(state, collected.triggers, [], cardDb);
    state = result.state;
    const next = { ...continuation, activatedWaveEffects: activated };
    if (isGameTerminated(state)) return { state, continuation: next };
    if (result.pendingPrompt) {
      return parkStage({ ...state, pendingPrompt: result.pendingPrompt }, next, parkDepth);
    }
  }
}

function waveEffectKey(trigger: QueuedTrigger): string {
  return `${trigger.sourceCardInstanceId}:${trigger.effectBlock.id}`;
}

/**
 * The wave's effects, matched exactly as the pipeline matches a TURN_ENDED
 * event for the ending player (keyword mapping, negation, once-per-turn,
 * turn restriction), but without logging that event: TURN_ENDED is logged
 * only at the hand-off, after the End Phase finishes.
 */
function collectWaveTriggers(
  initialState: GameState,
  pi: 0 | 1,
  endingPlayersWave: boolean,
  activated: readonly string[],
  cardDb: Map<string, CardData>
): { state: GameState; triggers: QueuedTrigger[] } {
  const timed = takeEngineTimestamp(initialState);
  const pending: PendingEvent = { type: "TURN_ENDED", playerIndex: pi, payload: {} };
  const event = { ...pending, timestamp: timed.timestamp } as GameEvent;
  const matched = orderMatchedTriggers(matchTriggersForEvent(timed.state, event, cardDb), pi);
  const done = new Set(activated);
  const triggers: QueuedTrigger[] = [];
  for (const match of matched) {
    const controller = match.trigger.controller;
    if ((controller === pi) !== endingPlayersWave) continue;
    const trigger: QueuedTrigger = {
      sourceCardInstanceId: match.trigger.sourceCardInstanceId,
      controller,
      effectBlock: match.effectBlock,
      triggeringEvent: pending,
      sourceSnapshot: queuedSourceSnapshot(
        timed.state,
        match.trigger.sourceCardInstanceId,
        match.trigger.controller,
        match.effectBlock.id
      ),
    };
    const key = waveEffectKey(trigger);
    if (done.has(key)) continue;
    done.add(key);
    triggers.push(trigger);
  }
  return { state: timed.state, triggers };
}

/**
 * One 6-6-1-2 step: the step owner's "at the end of this turn" obligations,
 * each followed by the auto effects it fulfils. Obligations collected here
 * are tagged with the step. The step re-collects until none remain, so one
 * created during the step for the same player still runs in it. The caller
 * runs the step's "until the end of the turn" expiry afterwards.
 */
function runEndOfTurnStep(
  initialState: GameState,
  continuation: PhaseBoundaryContinuation,
  cardDb: Map<string, CardData>,
  parkDepth: number,
  triggerExecutionMode = false
): StageOutcome {
  let state = initialState;
  const pi = continuation.endingPlayerIndex;
  const step: EndPhaseStep = continuation.stage === "TURN_PLAYER_END_OF_TURN" ? "TURN_PLAYER" : "NON_TURN_PLAYER";
  const owner: 0 | 1 = step === "TURN_PLAYER" ? pi : pi === 0 ? 1 : 0;
  const queue = [...continuation.remainingScheduledActions];

  for (;;) {
    if (queue.length === 0) {
      const collected = collectEndOfTurnObligations(state, owner, step);
      state = collected.state;
      if (collected.entries.length === 0) {
        return { state, continuation: { ...continuation, remainingScheduledActions: [] } };
      }
      queue.push(...collected.entries);
    }
    const entry = queue.shift()!;
    const result = resolveScheduledEffect(
      triggerExecutionMode,
      state,
      { id: "scheduled_" + entry.sourceEffectId, category: "auto", actions: [entry.action] },
      entry.sourceEffectId,
      entry.controller,
      cardDb
    );
    state = result.state;
    const next = { ...continuation, remainingScheduledActions: [...queue] };
    // OPT-960 invariant: the events that led to the terminal checkpoint are
    // logged before the one GAME_OVER.
    if (isGameTerminated(state)) {
      return { state: publishBeforeGameOver(state, result.events, entry.controller), continuation: next };
    }
    if (result.pendingPrompt) {
      state = publishPhaseBoundaryEvents(state, result.events, pi);
      return parkStage({ ...state, pendingPrompt: result.pendingPrompt }, next, parkDepth);
    }
    state = fireEndPhaseEvents(state, result.events, cardDb, triggerExecutionMode);
    if (isGameTerminated(state)) return { state, continuation: next };
    if (state.pendingPrompt) return parkStage(state, next, parkDepth);
  }
}

/**
 * Park the End Phase below every frame its current stage pushed, and lift
 * the prompt off the state so the caller surfaces it.
 */
function parkStage(
  state: GameState,
  continuation: PhaseBoundaryContinuation,
  parkDepth: number,
  events: PendingEvent[] = []
): StageOutcome & ExecuteResult {
  const pendingPrompt = state.pendingPrompt!;
  const parked = parkEndPhaseAt({ ...state, pendingPrompt: null }, continuation, parkDepth);
  // Parking can hit the stack-depth limit and end the game (ENGINE_LIMIT);
  // a finished game carries no prompt.
  if (isGameTerminated(parked)) return { state: parked, continuation, events };
  return { state: parked, continuation, events, pendingPrompt };
}

/** The version 1 End Phase resume, unchanged: drain the list, then hand off. */
function continueLegacyScheduledActions(
  initialState: GameState,
  continuation: PhaseBoundaryContinuation,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
  triggerExecutionMode = false
): ExecuteResult {
  let state = initialState;
  // Keep the phase below every child created by this scheduled resolution,
  // including an execution owner beneath the visible prompt.
  const parkDepth = initialState.effectStack.length;
  const scheduledActions = continuation.remainingScheduledActions;

  for (let index = 0; index < scheduledActions.length; index += 1) {
    const entry = scheduledActions[index];
    const fakeBlock = {
      id: "scheduled_" + entry.sourceEffectId,
      category: "auto" as const,
      actions: [entry.action],
    };
    const result = resolveScheduledEffect(
      triggerExecutionMode,
      state,
      fakeBlock,
      entry.sourceEffectId,
      entry.controller,
      cardDb
    );
    state = result.state;
    events.push(...result.events);
    // OPT-960: a scheduled action that ended the game (a MILL emptying the
    // deck) is final. No later scheduled action and no hand-off run.
    if (isGameTerminated(state)) return { state, events };
    if (result.pendingPrompt) {
      state = publishPhaseBoundaryEvents(
        state,
        events,
        continuation.endingPlayerIndex
      );
      state = parkEndPhaseAt(
        state,
        {
          ...continuation,
          stage: "LEGACY_SCHEDULED_ACTIONS",
          remainingScheduledActions: scheduledActions.slice(index + 1),
        },
        parkDepth
      );
      return {
        state,
        events: [],
        pendingPrompt: result.pendingPrompt,
      };
    }
  }

  // The version 1 End Phase opened the end-of-turn window only after the
  // hand-off, where the reset deck-zero flag hid it; OPT-962 opens it here.
  state = closeEndOfTurnWindow(state, continuation.endingPlayerIndex, cardDb);
  if (isGameTerminated(state)) return { state, events };
  return completeTurnHandoff(state, continuation.endingPlayerIndex, events, { endOfTurnWindowsRan: false });
}

/**
 * Insert the End Phase frame at `depth`, below every frame pushed above it.
 */
function parkEndPhaseAt(
  state: GameState,
  continuation: PhaseBoundaryContinuation,
  depth: number
): GameState {
  const anchor = state.effectStack[depth];
  if (!anchor) return state;
  if (state.effectStack.length >= MAX_EFFECT_STACK_DEPTH) {
    return terminateForEngineLimit(state, {
      kind: "EFFECT_STACK_DEPTH",
      limit: MAX_EFFECT_STACK_DEPTH,
      observed: state.effectStack.length + 1,
      attemptedFrameId: "end-phase",
    });
  }
  const frameId = generateFrameId(state);
  const phaseFrame: EffectStackFrame = {
    id: frameId.id,
    sourceCardInstanceId: anchor.sourceCardInstanceId,
    controller: continuation.endingPlayerIndex,
    effectBlock: CONTINUATION_EFFECT_BLOCK,
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    phaseBoundaryContinuation: continuation,
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [],
  };
  const stack = frameId.state.effectStack;
  return {
    ...frameId.state,
    effectStack: [...stack.slice(0, depth), phaseFrame, ...stack.slice(depth)],
  };
}

function publishPhaseBoundaryEvents(
  initialState: GameState,
  events: PendingEvent[],
  defaultPlayerIndex: 0 | 1
): GameState {
  let state = initialState;
  for (const event of events) {
    state = emitPendingEvent(state, event, defaultPlayerIndex);
  }
  return state;
}

function completeTurnHandoff(
  state: GameState,
  pi: 0 | 1,
  events: PendingEvent[],
  options: { endOfTurnWindowsRan: boolean }
): ExecuteResult {
  // Turn passes to opponent. Round-counter (state.turn.number) increments only
  // when control returns to the first player (OPT-366 — previously this was
  // hardcoded to player 0, which broke when player 1 went first).
  const nextPlayerIndex: 0 | 1 = pi === 0 ? 1 : 0;
  const firstPlayerIndex = state.turn.firstPlayerIndex ?? 0;
  const nextTurnNumber = nextPlayerIndex === firstPlayerIndex
    ? state.turn.number + 1
    : state.turn.number;

  // The End Phase waves already activated every [End of Your Turn] /
  // [End of Your Opponent's Turn] effect (6-6-1-1), so the logged TURN_ENDED
  // opens no trigger window. A legacy frame's waves never ran; its TURN_ENDED
  // keeps the version 1 behaviour and is scanned after the hand-off.
  const turnEnded: PendingEvent = { type: "TURN_ENDED", playerIndex: pi };
  events.push(options.endOfTurnWindowsRan ? withTriggerScanned(turnEnded) : turnEnded);

  const nextState: GameState = {
    ...state,
    turn: {
      number: nextTurnNumber,
      activePlayerIndex: nextPlayerIndex,
      firstPlayerIndex,
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

/** A loaded v5 scope commits to the same future stage entry semantics even
 * after its current owner drains. The session dispatcher carries that fact
 * only for this invocation; every later paused effect retains its own owner. */
function resolveScheduledEffect(
  triggerExecutionMode: boolean,
  ...args: Parameters<typeof resolveEffect>
): ReturnType<typeof resolveEffect> {
  if (!triggerExecutionMode) return resolveEffect(...args);
  const initial = args[0];
  args[0] = createEffectExecutionScope(initial, args[2], args[3]);
  const result = resolveEffect(...args);
  if (!isGameTerminated(result.state) && !result.pendingPrompt &&
      !result.resolved && result.events.length === 0) return { ...result, state: initial };
  const advanced = advanceTriggerExecution(result, args[4], resolverExecutionServices);
  return { ...advanced, ...(result.effectNotActivated ? { effectNotActivated: true } : {}) };
}
