import { drainPendingWork } from "./pending-work-drain.js";
import { resolverExecutionServices } from "./effect-resolver/resolver.js";
/**
 * Phase transition logic
 *
 * Handles REFRESH → DRAW → DON → MAIN → END phase sequence
 * and turn handoff. Extracted from execute.ts for clarity.
 */

import { queuedSourceSnapshot } from "./trigger-ordering.js";
import { isGameTerminated } from "./terminal.js";
import { releaseMovedDonEffects } from "./don-area-effects.js";
import type {
  CardData,
  EffectStackFrame,
  EndPhaseStep,
  ExecuteResult,
  GameAction,
  GameEvent,
  GameState,
  PendingEvent,
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
import { resolveScheduledEffectWork } from "./effect-resolver/resolver.js";
import { withTriggerScanned } from "./events.js";
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
import { describeActionBranch } from "./effect-resolver/action-utils.js";
import { retainPropagationBeforePrompt } from "./effect-resolver/resume/events.js";
import { hasDelayedDeckOutLoss, runRuleProcessing, runRuleProcessingAfterMove } from "./defeat.js";
import { MAX_EFFECT_STACK_DEPTH, terminateForEngineLimit } from "./engine-limits.js";
// The End Phase resolves its waves and obligations with the pipeline's own
// Step 5 trigger policy (no third policy, OPT-924).
import { reportExecutionEvents, processPlayerTriggerGroup } from "./trigger-queue.js";

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

export function executeAdvancePhaseWork(state: GameState, cardDb: Map<string, CardData>): ExecuteResult {
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
      const donCount = turnNumber === 1 && pi === firstPlayerIndex ? 1 : 2;
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
            attachedDon: [...placedPlayer.leader.attachedDon, ...givenDon.map((don) => ({ ...don, attachedTo: player.leader.instanceId }))],
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
  return {
    state: parkEndPhaseAt(
    state,
    {
      kind: "END_PHASE",
      endingPlayerIndex: pi,
      stage: "END_OF_YOUR_TURN_WAVE",
      remainingScheduledActions: [],
      activatedWaveEffects: [],
    },
      state.effectStack.length
    ),
    events,
  };
}

/** Resume end-phase work parked below a prompt frame. */
export function advancePhaseBoundary(
  state: GameState,
  cardDb: Map<string, CardData>
): ExecuteResult {
  const frame = peekFrame(state);
  if (!frame?.phaseBoundaryContinuation) return { state, events: [] };
  return continueEndPhase(
    popFrame(state),
    frame.phaseBoundaryContinuation,
    cardDb,
    [...frame.accumulatedEvents],
    frame
  );
}

/** Consume one phase-owned choice; nested action prompts retain the parent queue. */
export function selectEndOfTurnObligation(
  state: GameState,
  action: GameAction,
  cardDb: Map<string, CardData>,
): import("./effect-resolver/types.js").HandlerResult | undefined {
  const frame = state.effectStack.at(-1);
  const continuation = frame?.phaseBoundaryContinuation;
  if (!frame || !continuation?.awaitingOrder) return undefined;
  const index = action.type === "PLAYER_CHOICE"
    ? continuation.remainingScheduledActions.findIndex((_, i) => action.choiceId === `end-of-turn-obligation:${i}`)
    : -1;
  if (index < 0) return { kind: "waiting", state, events: [], resolved: false, rejected: true };
  const queue = [...continuation.remainingScheduledActions];
  const [chosen] = queue.splice(index, 1);
  const next = { ...continuation };
  delete next.awaitingOrder;
  const result = continueEndPhase(
    { ...popFrame(state), pendingPrompt: null },
    { ...next, remainingScheduledActions: [chosen, ...queue] },
    cardDb, [], frame, true,
  );
  // A choice resumes outside the drain's domain-dispatch branch. Apply the
  // same checkpoint/reporting contract before returning to that common drain,
  // so children observe this End Phase and can terminate before any sibling.
  const checked = runRuleProcessingAfterMove(state, result.state, {}, cardDb);
  if (isGameTerminated(checked)) return {
    ...result, state: checked, kind: "terminal", resolved: true, pendingPrompt: undefined,
  };
  if (result.pendingPrompt) return {
    ...result, state: retainPropagationBeforePrompt(checked, result.events),
    kind: "waiting", resolved: false,
  };
  const reported = reportExecutionEvents(checked, result, cardDb);
  return { ...result, state: reported.state, events: reported.events, kind: "continued", resolved: true };
}

/** Advance one End Phase rules stage; children return to the common drain. */
function continueEndPhase(
  state: GameState,
  continuation: PhaseBoundaryContinuation,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
  priorFrame?: EffectStackFrame,
  selectedObligation = false,
): ExecuteResult {
  const pi = continuation.endingPlayerIndex;
  const depth = state.effectStack.length;
  const stage = continuation.stage ?? "LEGACY_SCHEDULED_ACTIONS";
  const park = (
    next: PhaseBoundaryContinuation,
    emitted: PendingEvent[] = []
  ) => ({
    state: parkEndPhaseAt(state, next, depth, priorFrame),
    events: emitted,
    ...(state.pendingPrompt ? { pendingPrompt: state.pendingPrompt } : {}),
  });
  // A legacy accumulator still has a publication obligation. Report it before
  // the stage runs; the drain owns any effects the scan fulfils.
  if (events.length) return park(continuation, events);
  if (
    stage === "END_OF_YOUR_TURN_WAVE" ||
    stage === "END_OF_OPPONENT_TURN_WAVE"
  ) {
    const collected = collectWaveTriggers(
      state,
      pi,
      stage === "END_OF_YOUR_TURN_WAVE",
      continuation.activatedWaveEffects ?? [],
      cardDb
    );
    state = collected.state;
    if (collected.triggers.length) {
    state = processPlayerTriggerGroup(state,
        collected.triggers,
        [],
        cardDb
      ).state;
      return park({
        ...continuation,
        stage,
        activatedWaveEffects: [
          ...(continuation.activatedWaveEffects ?? []),
          ...collected.triggers.map(waveEffectKey),
        ],
      });
    }
    return park({
      ...continuation,
      stage:
        stage === "END_OF_YOUR_TURN_WAVE"
          ? "END_OF_OPPONENT_TURN_WAVE"
          : "TURN_PLAYER_END_OF_TURN",
    });
  }
  const legacy = stage === "LEGACY_SCHEDULED_ACTIONS";
  const step: EndPhaseStep =
    stage === "TURN_PLAYER_END_OF_TURN" ? "TURN_PLAYER" : "NON_TURN_PLAYER";
  const owner: 0 | 1 = step === "TURN_PLAYER" ? pi : pi === 0 ? 1 : 0;
  let queue = [...continuation.remainingScheduledActions];
  if (!legacy && (!queue.length || state.schemaVersion === 11)) {
    const collected = collectEndOfTurnObligations(state, owner, step);
    state = collected.state;
    // A nested obligation may create more work for this same step. Imported11
    // lets its owner choose among all still-pending entries on the next offer;
    // historical1–10 retain their original collected-cohort behavior.
    queue = [...queue, ...collected.entries];
  }
  // Reader-first: only imported v11 states opt into obligation ordering.
  // Already-resolved obligations must not pass through trigger activation gates.
  if (!legacy && state.schemaVersion === 11 && queue.length > 1 && !selectedObligation) {
    state = parkEndPhaseAt(state, {
      ...continuation, stage, remainingScheduledActions: queue, awaitingOrder: true,
    }, depth, priorFrame);
    if (isGameTerminated(state)) return { state, events: [] };
    const frame = state.effectStack.at(-1)!;
    const pendingPrompt: NonNullable<GameState["pendingPrompt"]> = {
      options: {
        promptType: "PLAYER_CHOICE",
        effectDescription: "Choose which end-of-turn effect to process next",
        choices: queue.map((entry, index) => {
          const source = entry.sourceCardSnapshot ?? state.players.flatMap(player =>
            [player.leader, ...player.characters.filter(card => card !== null), ...(player.stage ? [player.stage] : []), ...player.trash]
          ).find(card => card.instanceId === entry.sourceEffectId);
          const description = entry.action.type === "RETURN_DON_TO_DECK"
            ? "Return DON!! to your DON!! deck" : describeActionBranch([entry.action]);
          const amount = "params" in entry.action && entry.action.params && "amount" in entry.action.params
            && typeof entry.action.params.amount === "number" ? ` (${entry.action.params.amount})` : "";
          return { id: `end-of-turn-obligation:${index}`,
            label: `${source ? cardDb.get(source.cardId)?.name ?? source.cardId : "Resolved effect"}: ${description}${amount}` };
        }),
      },
      respondingPlayer: owner,
      resumeContext: frame.id,
    };
    state = { ...state, pendingPrompt,
      effectStack: state.effectStack.map(candidate => candidate.id === frame.id
        ? { ...candidate, controller: owner, phase: "AWAITING_PLAYER_CHOICE" as const }
        : candidate),
    };
    return { state, events: [], pendingPrompt };
  }
  const entry = queue.shift();
  if (entry) {
    const result = resolveScheduledEffectWork(state, entry, cardDb);
    state = result.pendingPrompt
      ? { ...result.state, pendingPrompt: result.pendingPrompt }
      : result.state;
    if (isGameTerminated(state)) return { state, events: result.events };
    return park(
      { ...continuation, stage, remainingScheduledActions: queue },
      result.events);
    }
  if (!legacy) {
    state = expireUntilEndOfTurn(state, step);
    if (step === "TURN_PLAYER")
      return park({ ...continuation, stage: "NON_TURN_PLAYER_END_OF_TURN" });
    // An obligation created after its owner's step requires another 6-6-1-2 pass.
    if (
      state.scheduledActions.some((entry) => entry.timing === "END_OF_THIS_TURN"))
      return park({ ...continuation, stage: "TURN_PLAYER_END_OF_TURN" });
    state = expireDuringThisTurn(state);
  }
  state = closeEndOfTurnWindow(state, pi, cardDb);
  return isGameTerminated(state)
    ? { state, events: [] }
    : completeTurnHandoff(state, pi, [], { endOfTurnWindowsRan: !legacy });
}

function waveEffectKey(trigger: QueuedTrigger): string {
  return `${trigger.sourceCardInstanceId}:${trigger.effectBlock.id}`;
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
 * Insert the End Phase frame at `depth`, below every frame pushed above it.
 */
function parkEndPhaseAt(
  state: GameState,
  continuation: PhaseBoundaryContinuation,
  depth: number,
  priorFrame?: EffectStackFrame
): GameState {
  const source = state.effectStack[depth]?.sourceCardInstanceId ??
    state.players[continuation.endingPlayerIndex].leader.instanceId;
  if (state.effectStack.length >= MAX_EFFECT_STACK_DEPTH) {
    return terminateForEngineLimit(state, {
      kind: "EFFECT_STACK_DEPTH",
      limit: MAX_EFFECT_STACK_DEPTH,
      observed: state.effectStack.length + 1,
      attemptedFrameId: "end-phase",
    });
  }
  const frameId = priorFrame
    ? { id: priorFrame.id, state }
    : generateFrameId(state);
  const phaseFrame: EffectStackFrame = {
    id: frameId.id,
    sourceCardInstanceId: source,
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

  let nextState: GameState = {
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

  // 6-2-1: expiry is part of entering Refresh, before start-of-turn
  // conditions are scanned. REFRESH also keeps its idempotent load fallback.
  nextState = expireRefreshPhaseEffects(nextState);
  events.push({ type: "TURN_STARTED", playerIndex: nextPlayerIndex });
  events.push({
    type: "PHASE_CHANGED",
    playerIndex: nextPlayerIndex,
    payload: { from: "END", to: "REFRESH" },
  });

  return { state: nextState, events };
}

/** Public phase boundary; the action pipeline calls the work-only handler. */
export function executeAdvancePhase(
  state: GameState,
  cardDb: Map<string, CardData>
): ExecuteResult {
  const result = executeAdvancePhaseWork(state, cardDb);
  const reported = reportExecutionEvents(result.state, result, cardDb);
  return drainPendingWork(
    { ...result, state: reported.state, events: reported.events, resolved: true },
    cardDb,
    resolverExecutionServices
  );
}

/** Public compatibility boundary for a previously parked End Phase. */
export function resumePhaseBoundary(
  state: GameState,
  cardDb: Map<string, CardData>
): ExecuteResult {
  return drainPendingWork(
    { state, events: [], resolved: true },
    cardDb,
    resolverExecutionServices
  );
}
