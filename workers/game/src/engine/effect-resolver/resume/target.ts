/**
 * Target-selection resume handlers — REDISTRIBUTE_DON transfers and
 * SELECT_TARGET (including the rule 3-7-6-1 overflow-trash-for-play flow).
 *
 * Handlers share the caller's `events` accumulator (mutated in place) and
 * return one of:
 *   - null           → this branch did not match; caller falls through
 *   - fallthrough    → matched; state updated, caller continues to
 *                      remainingActions tail
 *   - terminal       → matched and resolved (or pending a new prompt); caller
 *                      returns { state, events, resolved, pendingPrompt }
 *                      using the shared events accumulator
 */

import type { EffectBlock, EffectResult } from "../../effect-types.js";
import type {
  CardData,
  GameState,
  GameAction,
  PendingEvent,
  ResumeContext,
} from "../../../types.js";
import { scanEventsForTriggers } from "../../trigger-ordering.js";
import { executeActionChain, executeEffectAction } from "../resolver.js";
import { executePlayCard } from "../actions/play.js";
import { trashCharacter } from "../card-mutations.js";
import { validateTargetConstraints, buildSelectTargetPrompt } from "../target-resolver.js";
import { applyRedistributeDonTransfers } from "../actions/don.js";
import type { EffectResolverResult } from "../types.js";
import { pushBatchResumeFrame } from "./batch.js";
import { processRemainingTriggers } from "./triggers.js";

export interface TargetFallthrough {
  kind: "fallthrough";
  state: GameState;
}

export interface TargetTerminal {
  kind: "terminal";
  result: EffectResolverResult;
}

export type TargetBranchResult = TargetFallthrough | TargetTerminal | null;

/**
 * REDISTRIBUTE_DON resume — validates transfers against re-derived source
 * set and the prompt's validTargets, applies accepted transfers, then falls
 * through to remainingActions.
 */
export function handleRedistributeDon(
  state: GameState,
  action: GameAction,
  resumeCtx: ResumeContext,
  resultRefs: Map<string, EffectResult>,
  events: PendingEvent[],
): TargetBranchResult {
  const { pausedAction, controller, validTargets } = resumeCtx;
  if (action.type !== "REDISTRIBUTE_DON" || !pausedAction || pausedAction.type !== "REDISTRIBUTE_DON") {
    return null;
  }

  const transfers = action.transfers ?? [];
  const amount = ((pausedAction.params?.amount as number) ?? 1);

  // Re-derive valid sources (cards that have DON attached) for this controller.
  const pp = state.players[controller];
  const validSourceSet = new Set<string>();
  if (pp.leader.attachedDon.length > 0) validSourceSet.add(pp.leader.instanceId);
  for (const c of pp.characters) {
    if (c && c.attachedDon.length > 0) validSourceSet.add(c.instanceId);
  }
  const validTargetSet = new Set(validTargets);

  const allValid = transfers.length <= amount && transfers.every((t) =>
    t.fromCardInstanceId !== t.toCardInstanceId &&
    validSourceSet.has(t.fromCardInstanceId) &&
    validTargetSet.has(t.toCardInstanceId),
  );

  if (!allValid) {
    return { kind: "terminal", result: { state, events: [], resolved: false } };
  }

  let nextState = state;
  if (transfers.length > 0) {
    const actionResult = applyRedistributeDonTransfers(nextState, transfers, controller);
    nextState = actionResult.state;
    events.push(...actionResult.events);
    if (actionResult.result && (pausedAction as any).result_ref) {
      resultRefs.set((pausedAction as any).result_ref as string, actionResult.result);
    }
  }

  return { kind: "fallthrough", state: nextState };
}

/**
 * Rule 3-7-6-1 overflow-trash resume. The controller picked one of their own
 * Characters to trash so the original effect-driven play can resolve.
 * Trash-one runs as a rule process (emits CARD_TRASHED, NOT CARD_KO) so no
 * On K.O. triggers fire per 3-7-6-1-1. Then re-enter the PLAY_CARD with the
 * original play target preselected.
 *
 * This branch always returns a terminal result (it handles its own
 * remainingActions continuation).
 */
export function handleSelectTargetRuleTrashForPlay(
  state: GameState,
  action: GameAction,
  resumeCtx: ResumeContext,
  resultRefs: Map<string, EffectResult>,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
): TargetBranchResult {
  const { pausedAction, controller, validTargets, remainingActions, ruleTrashForPlay, effectSourceInstanceId } = resumeCtx;
  if (action.type !== "SELECT_TARGET" || !pausedAction || !ruleTrashForPlay) {
    return null;
  }

  let nextState = state;

  const selected = action.selectedInstanceIds ?? [];
  if (selected.length !== 1 || !validTargets.includes(selected[0])) {
    return { kind: "terminal", result: { state, events: [], resolved: false } };
  }
  const victimId = selected[0];
  const trashResult = trashCharacter(nextState, victimId, controller);
  if (!trashResult) {
    return { kind: "terminal", result: { state, events: [], resolved: false } };
  }
  nextState = trashResult.state;
  events.push(...trashResult.events);

  // OPT-114 commit 3: if the overflow happened mid-batch, re-enter
  // executePlayCard with the batch resumeFrame so remaining frames continue
  // after the current card is placed. Otherwise fall back to the legacy
  // single-target re-entry (OPT-171).
  const batch = ruleTrashForPlay.batch;
  const actionResult = batch
    ? executePlayCard(
        nextState,
        pausedAction,
        effectSourceInstanceId,
        controller,
        cardDb,
        resultRefs,
        undefined,
        {
          remainingTargetIds: batch.remainingTargetIds,
          remaining: batch.remaining,
          playedSoFar: batch.playedSoFar,
          forcedFirstState: batch.forcedFirstState,
        },
      )
    : executeEffectAction(
        nextState,
        pausedAction,
        effectSourceInstanceId,
        controller,
        cardDb,
        resultRefs,
        [ruleTrashForPlay.playTargetId],
      );
  nextState = actionResult.state;
  events.push(...actionResult.events);

  if (actionResult.pendingPrompt) {
    return { kind: "terminal", result: { state: nextState, events, resolved: false, pendingPrompt: actionResult.pendingPrompt } };
  }
  if (actionResult.result && (pausedAction as any).result_ref) {
    resultRefs.set((pausedAction as any).result_ref as string, actionResult.result);
  }

  // Scan for triggers produced by the re-entered play (e.g., ON_PLAY)
  if (actionResult.events.length > 0) {
    const scan = scanEventsForTriggers(nextState, actionResult.events, controller, cardDb);
    nextState = scan.state;
    // triggers drain via the outer pipeline — fall through to remainingActions
  }

  // Skip the generic SELECT_TARGET branch below
  if (remainingActions.length > 0) {
    const chainResult = executeActionChain(
      nextState,
      remainingActions,
      effectSourceInstanceId,
      controller,
      cardDb,
      resultRefs,
    );
    nextState = chainResult.state;
    events.push(...chainResult.events);
    if (chainResult.pendingPrompt) {
      return { kind: "terminal", result: { state: nextState, events, resolved: false, pendingPrompt: chainResult.pendingPrompt } };
    }
  }
  return { kind: "terminal", result: { state: nextState, events, resolved: true } };
}

/**
 * Generic SELECT_TARGET resume. Validates selection against validTargets and
 * constraints; on match, re-executes the paused action with the selection.
 * OPT-174: if the re-executed handler returns pendingBatchTriggers, push an
 * AWAITING_BATCH_RESUME frame so trigger drain can re-enter with remaining
 * targets.
 */
export function handleSelectTarget(
  state: GameState,
  action: GameAction,
  resumeCtx: ResumeContext,
  resultRefs: Map<string, EffectResult>,
  cardDb: Map<string, CardData>,
  events: PendingEvent[],
): TargetBranchResult {
  const { pausedAction, controller, validTargets, remainingActions, effectSourceInstanceId } = resumeCtx;
  if (action.type !== "SELECT_TARGET" || !pausedAction) {
    return null;
  }

  let nextState = state;
  const selected = action.selectedInstanceIds ?? [];
  // Validate — all selected ids must be in validTargets
  if (selected.some((id) => !validTargets.includes(id))) {
    const reprompt = buildSelectTargetPrompt(nextState, pausedAction, validTargets, effectSourceInstanceId, controller, cardDb, resultRefs);
    return { kind: "terminal", result: { state: nextState, events, resolved: false, pendingPrompt: reprompt.pendingPrompt } };
  }
  // Validate target constraints (aggregate sum, uniqueness, named distribution, dual_targets)
  if (pausedAction.target && !validateTargetConstraints(selected, pausedAction.target, nextState, cardDb, resultRefs)) {
    const reprompt = buildSelectTargetPrompt(nextState, pausedAction, validTargets, effectSourceInstanceId, controller, cardDb, resultRefs);
    return { kind: "terminal", result: { state: nextState, events, resolved: false, pendingPrompt: reprompt.pendingPrompt } };
  }

  const actionResult = executeEffectAction(
    nextState,
    pausedAction,
    effectSourceInstanceId,
    controller,
    cardDb,
    resultRefs,
    selected,
  );
  nextState = actionResult.state;
  events.push(...actionResult.events);

  if (actionResult.pendingPrompt) {
    return { kind: "terminal", result: { state: nextState, events, resolved: false, pendingPrompt: actionResult.pendingPrompt } };
  }
  // OPT-174: SELECT_TARGET resume into a multi-target handler (e.g. KO with
  // dual_targets) can pause mid-batch when frame N's events queue triggers
  // (rule 6-2). Mirror the resolver-level batch-resume push so the trigger
  // drain can re-enter the handler with the remaining targets — otherwise
  // remaining KO frames are silently dropped.
  if (actionResult.pendingBatchTriggers) {
    const { triggers, marker } = actionResult.pendingBatchTriggers;
    nextState = pushBatchResumeFrame(
      nextState,
      effectSourceInstanceId,
      controller,
      {} as EffectBlock,
      marker,
      triggers,
      remainingActions,
      resultRefs,
    );
    const drain = processRemainingTriggers(nextState, triggers, cardDb, events);
    return { kind: "terminal", result: { state: drain.state, events: drain.events, resolved: drain.resolved, pendingPrompt: drain.pendingPrompt } };
  }
  if (actionResult.result && (pausedAction as any).result_ref) {
    resultRefs.set((pausedAction as any).result_ref as string, actionResult.result);
  }

  return { kind: "fallthrough", state: nextState };
}
