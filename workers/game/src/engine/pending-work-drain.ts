import { continueReadyCostReplacement } from "./effect-resolver/resume/cost.js";
import { finishLifeTriggerStaging, validateLifeTriggerStaging } from "./life-trigger-staging.js";
import { isPendingBattleStepTransition } from "./battle-step-boundary.js";
/** One engine drain owns trigger generations and resumable domain boundaries. */
import type { CardData, GameState } from "../types.js";
import type {
  EffectResolverResult,
  EffectResolverServices,
  HandlerResult,
} from "./effect-resolver/types.js";
import {
  buildTriggerSelectionPrompt,
  scanEventsForTriggers,
} from "./trigger-ordering.js";
import { terminateForEngineContract } from "./engine-limits.js";
import { isGameTerminated, publishBeforeGameOver } from "./terminal.js";
import {
  getEventCardInstanceId,
  replacePendingEventReferences,
  replaceRetainedEventReferences,
  withEventLogEmitted,
  emitPendingEvent,
} from "./events.js";
import {
  publishCommittedEvents,
  retainPropagationBeforePrompt,
} from "./effect-resolver/resume/events.js";
import { reenterBatchResume } from "./effect-resolver/resume/batch.js";
import {
  triggerExecutionOwner,
  reportTriggerWork,
  updateOwner,
  createEffectExecutionScope,
} from "./trigger-executor.js";
import { resumeFromStackWork } from "./effect-resolver/resume.js";
import { advancePhaseBoundary } from "./phases.js";
import {
  continueBattleDamageFrame,
  checkpointBattleStepEnd,
  executeDamageStep,
} from "./battle.js";
import { continueEffectDamageFrame } from "./effect-damage.js";
import { surfaceDamageFramePrompt } from "./damage-frames.js";
import { reportExecutionEvents } from "./trigger-queue.js";
import { frameKindOf } from "./frame-kinds.js";
import { advanceReplacementBatch } from "./replacement-continuation.js";
import { runRuleProcessingAfterMove } from "./defeat.js";

/** The only executor for a loaded v5 scope. Generations finish FIFO; within a
 * generation the turn player chooses first, then the opponent. A child prompt
 * returns immediately, leaving both its parent and queue on the stack. */
export function drainPendingWork(
  initial: EffectResolverResult | HandlerResult,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices,
  stopAtFrameId?: string
): HandlerResult {
  let state = initial.state;
  const events = [...initial.events];
  let stagingScopes = initial.lifeTriggerStaging ?? [];
  // A true wait or stable public return is the end of every active Life
  // staging scope in this invocation. Only exact owned slots are removed.
  function expose(result: HandlerResult): HandlerResult {
    const finished = finishLifeTriggerStaging(result.state, stagingScopes);
    stagingScopes = finished.scopes;
    const { lifeTriggerStaging: _handoff, ...published } = result;
    return { ...published, state: finished.state, ...(isGameTerminated(finished.state) ? { kind: "terminal", resolved: true, pendingPrompt: undefined } : {}) };
  }
  if (
    !isGameTerminated(state) &&
    (("kind" in initial && initial.kind === "waiting") ||
      initial.rejected ||
      initial.pendingPrompt)
  )
    return expose({ ...initial, kind: "waiting" });
  while (true) {
    state = validateLifeTriggerStaging(state, stagingScopes);
    const stagedOwner = state.effectStack.at(-1);
    if (stagedOwner && stagingScopes.some(scope => scope.damageOwnerId === stagedOwner.id)) {
      const finished = finishLifeTriggerStaging(state, stagingScopes, stagedOwner.id);
      state = finished.state;
      stagingScopes = finished.scopes;
    }
    if (isGameTerminated(state))
      return expose({
        kind: "terminal",
        state: publishBeforeGameOver(
          state,
          events,
          state.turn.activePlayerIndex
        ),
        events: events.map(withEventLogEmitted),
        resolved: true,
      });
    if (
      stopAtFrameId &&
      !state.effectStack.some((frame) => frame.id === stopAtFrameId)
    ) {
      state = terminateForEngineContract(state, {
        kind: "ENGINE_CONTRACT",
        contract: "ACTION_HANDLER",
        message: `Life Trigger lost its damage boundary ${stopAtFrameId}`,
      });
      continue;
    }
    // A Life Trigger temporarily interrupts damage. Finish only its children;
    // reaching its exact damage boundary must not select an outer sibling.
    if (stopAtFrameId && state.effectStack.at(-1)?.id === stopAtFrameId)
      return expose({
        kind: "continued",
        state: publishDrainEvents(state, events),
        events,
        resolved: true,
      });
    const battleDebt = state.effectStack.find(
      (frame) =>
        frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT" &&
        frame.battleDamage.battleId === state.turn.battle?.battleId
    );
    if (battleDebt && events.length) {
      state = {
        ...state,
        effectStack: state.effectStack.map((frame) =>
          frame.id === battleDebt.id
            ? {
                ...frame,
                accumulatedEvents: [
                  ...new Set([...frame.accumulatedEvents, ...events]),
                ],
              }
            : frame
        ),
      };
      events.length = 0;
    }
    let owner = triggerExecutionOwner(state);
    const ownerIndex = owner
      ? state.effectStack.findIndex((frame) => frame.id === owner!.id)
      : -1;
    const damageAboveOwner = state.effectStack.some(
      (frame, index) =>
        index > ownerIndex &&
        frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT" &&
        frame.battleDamage.battleId === state.turn.battle?.battleId
    );
    if (
      !stopAtFrameId &&
      !damageAboveOwner &&
      owner?.accumulatedEvents.length
    ) {
      const prefix = owner.accumulatedEvents.filter(
        (event) => !isPendingBattleStepTransition(event)
      );
      events.splice(0, events.length, ...new Set([...prefix, ...events]));
      state = {
        ...state,
        effectStack: state.effectStack.map((frame) =>
          frame.id === owner!.id
            ? {
                ...frame,
                accumulatedEvents: frame.accumulatedEvents.filter(
                  isPendingBattleStepTransition
                ),
              }
            : frame
        ),
      };
      const scanned = scanEventsForTriggers(
        state,
        prefix,
        owner.controller,
        cardDb
      );
      state = scanned.state;
      replacePendingEventReferences(events, prefix, scanned.events);
      if (scanned.triggers.length)
        state = reportTriggerWork(state, scanned.triggers).state;
      owner = triggerExecutionOwner(state)!;
    }
    const enteringDamage =
      !state.effectStack.length && state.turn.battleSubPhase === "DAMAGE_STEP";
    if (!enteringDamage) state = publishDrainEvents(state, events);
    const top = state.effectStack.at(-1);
    const ownerBefore = triggerExecutionOwner(state);
    // A domain frame is one unit of work, never a private scheduler. Its
    // children are inspected again at the top of this same loop.
    if (!top || (!top.triggerExecution && top.id !== ownerBefore?.id)) {
      let result:
        | import("../types.js").ExecuteResult
        | HandlerResult
        | undefined;
      const kind = top && frameKindOf(top);
      if (!top) {
        const checked = checkpointBattleStepEnd(state);
        if (checked.state !== state) {
          // Counter Step has not entered Damage when its checkpoint aborts.
          events.splice(
            0,
            events.length,
            ...events.filter(
              (event) =>
                !(
                  event.type === "PHASE_CHANGED" &&
                  event.payload?.from === "COUNTER_STEP" &&
                  event.payload.to === "DAMAGE_STEP"
                )
            )
          );
          result = checked;
        } else if (state.turn.battleSubPhase === "DAMAGE_STEP")
          result = executeDamageStep(state, cardDb, events);
        else
          return expose({
            kind: "completed",
            state: publishDrainEvents(state, events),
            events,
            resolved: true,
          });
      } else if (kind === "COST" && state.schemaVersion === 7 && top.costReplacementResolution && !state.pendingPrompt)
        result = continueReadyCostReplacement(state, top, cardDb, services);
      else if (kind === "PHASE_BOUNDARY")
        result = advancePhaseBoundary(state, cardDb);
      else if (kind === "BATTLE_DAMAGE" || kind === "EFFECT_DAMAGE") {
        if (top.phase === "AWAITING_TRIGGER_REVEAL") {
          state = surfaceDamageFramePrompt(state, cardDb);
          return expose({
            kind: state.pendingPrompt ? "waiting" : "continued",
            state,
            events,
            resolved: false,
            ...(state.pendingPrompt
              ? { pendingPrompt: state.pendingPrompt }
              : {}),
          });
        }
        result =
          kind === "BATTLE_DAMAGE"
            ? continueBattleDamageFrame(state, cardDb)
            : continueEffectDamageFrame(state, cardDb);
      } else if (
        kind === "REPLACEMENT_BATCH" &&
        top.phase === "INTERRUPTED_BY_TRIGGERS"
      )
        result = advanceReplacementBatch(state, cardDb, services);
      else if (top.phase === "AWAITING_BATCH_RESUME")
        result = reenterBatchResume(state, cardDb, services, events);
      else if (top.phase === "INTERRUPTED_BY_TRIGGERS")
        result = resumeFromStackWork(state, { type: "PASS" }, cardDb);
      else
        return expose({
          kind: "continued",
          state: publishDrainEvents(state, events),
          events,
          resolved: true,
        });
      const before = state;
      const terminalPrefix = before.effectStack.flatMap((frame) =>
        frame.effectDamage || frame.battleDamage ? frame.accumulatedEvents : []
      );
      state = runRuleProcessingAfterMove(
        before,
        result.state,
        "lethalDamagePlayerIndex" in result &&
          result.lethalDamagePlayerIndex !== undefined
          ? { lethalDamage: [result.lethalDamagePlayerIndex] }
          : {},
        cardDb
      );
      events.splice(
        0,
        events.length,
        ...new Set([...events, ...result.events])
      );
      if (isGameTerminated(state)) {
        events.unshift(
          ...terminalPrefix.filter((event) => !events.includes(event))
        );
        continue;
      }
      if (
        result.pendingPrompt &&
        state.effectStack.some(
          (frame) => frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT"
        ) &&
        !triggerExecutionOwner(state)
      ) {
        const debt = state.effectStack.find(
          (frame) => frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT"
        )!;
        state = createEffectExecutionScope(
          state,
          debt.sourceCardInstanceId,
          debt.controller
        );
      }
      if (
        enteringDamage &&
        result.pendingPrompt &&
        state.effectStack.some(
          (frame) => frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT"
        )
      )
        events.length = 0;
      if (result.pendingPrompt)
        return expose({
          kind: "waiting",
          state: {
            ...retainPropagationBeforePrompt(state, events),
            pendingPrompt: result.pendingPrompt,
          },
          events,
          pendingPrompt: result.pendingPrompt,
          resolved: false,
        });
      const retainedBattle = state.effectStack.find(
        (frame) =>
          frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT" &&
          frame.battleDamage.battleId === state.turn.battle?.battleId
      );
      if (retainedBattle) continue;
      const reported = reportExecutionEvents(
        state,
        result,
        cardDb,
        "queuedTriggers" in result ? result.queuedTriggers : []
      );
      state = reported.state;
      replacePendingEventReferences(events, result.events, reported.events);
      if (state === before)
        return expose({ kind: "continued", state, events, resolved: true });
      continue;
    }
    owner = triggerExecutionOwner(state)!;
    let work = owner.triggerExecution!;
    // Empty generations can exist while their selected effect is suspended.
    if (!work.selectedTrigger && work.generations[0]?.triggers.length === 0) {
      // User-approved resolution-gate policy: reports raised by any older
      // sibling join one cohort. Seal only after that whole generation and
      // every active child have finished. Existing closed cohorts stay separate.
      const { collectingGenerationIndex: _collector, ...sealed } = work;
      work = { ...sealed, generations: work.generations.slice(1) };
      state = updateOwner(state, owner.id, work);
      continue;
    }
    let trigger = work.selectedTrigger;
    if (!trigger && work.generations.length) {
      const generation = work.generations[0];
      const active = state.turn.activePlayerIndex;
      const player = generation.triggers.some(
        (entry) => entry.controller === active
      )
        ? active
        : active === 0
          ? 1
          : 0;
      const group = generation.triggers.filter(
        (entry) => entry.controller === player
      );
      if (group.length > 1) {
        const history =
          generation.orderingGroup?.triggers[0]?.controller === player
            ? generation.orderingGroup
            : undefined;
        const prompt = buildTriggerSelectionPrompt(
          state,
          group,
          [],
          cardDb,
          history
        );
        state = retainPropagationBeforePrompt(prompt.state, events);
        return expose({
          kind: "waiting",
          state,
          events,
          resolved: false,
          pendingPrompt: prompt.pendingPrompt,
        });
      }
      trigger = group[0];
      work = {
        ...work,
        generations: [
          {
            ...generation,
            triggers: generation.triggers.filter((entry) => entry !== trigger),
            ...(generation.orderingGroup?.triggers.some(
              (entry) => entry.orderingId === trigger!.orderingId
            )
              ? {
                  orderingGroup: {
                    ...generation.orderingGroup,
                    resolvedTriggerIds: [
                      ...generation.orderingGroup.resolvedTriggerIds,
                      trigger.orderingId!,
                    ],
                  },
                }
              : {}),
          },
          ...work.generations.slice(1),
        ],
      };
    }
    if (trigger) {
      // Clear selected work BEFORE activation. A resumed child cannot replay it.
      const { selectedTrigger: _selected, ...unselected } = work;
      state = updateOwner(state, owner.id, unselected);
      const result = services
        .withCommittedEvents(events)
        .resolveEffect(
          state,
          trigger.effectBlock,
          trigger.sourceCardInstanceId,
          trigger.controller,
          cardDb,
          getEventCardInstanceId(trigger.triggeringEvent) ?? null,
          trigger.triggeringEvent,
          trigger.sourceSnapshot
        );
      state = result.state;
      events.push(...result.events);
      if (isGameTerminated(state)) continue;
      if (result.pendingPrompt)
        return expose({
          ...result,
          state: retainPropagationBeforePrompt(state, events),
          events,
          kind: "waiting",
        });
      const unpublished = [...result.events];
      state = publishCommittedEvents(state, result.events);
      replacePendingEventReferences(events, unpublished, result.events);
      state = publishDrainEvents(state, events);
      const scan = scanEventsForTriggers(
        state,
        result.events,
        trigger.controller,
        cardDb
      );
      state = scan.state;
      replacePendingEventReferences(events, result.events, scan.events);
      if (scan.triggers.length)
        state = reportTriggerWork(state, scan.triggers).state;
      continue;
    }
    const held = owner.accumulatedEvents.filter(isPendingBattleStepTransition);
    if (held.length) {
      // Detach before committing/cancelling. Children raised by the released
      // notification cannot rediscover this window, including after reload.
      state = {
        ...state,
        effectStack: state.effectStack.map((frame) =>
          frame.id === owner!.id
            ? {
                ...frame,
                accumulatedEvents: frame.accumulatedEvents.filter(
                  (event) => !held.includes(event)
                ),
              }
            : frame
        ),
      };
      events.splice(
        0,
        events.length,
        ...events.filter((event) => !held.includes(event))
      );
      const battle = state.turn.battle;
      const live =
        battle &&
        owner.sourceCardInstanceId === battle.attackerInstanceId &&
        held.every(
          (event) =>
            event.type === "PHASE_CHANGED" &&
            event.payload?.to === state.turn.battleSubPhase
        );
      const checkpoint = live
        ? checkpointBattleStepEnd(state)
        : { state, events: [] };
      const released =
        live && checkpoint.state === state ? [...held] : checkpoint.events;
      state = checkpoint.state;
      for (let index = 0; index < released.length; index++) {
        const event = released[index];
        state = emitPendingEvent(state, event, state.turn.activePlayerIndex);
        released[index] = withEventLogEmitted(event);
      }
      const reported = reportExecutionEvents(
        state,
        { state, events: released },
        cardDb
      );
      state = reported.state;
      events.push(...reported.events);
      continue;
    }
    state = publishDrainEvents(state, events);
    state = { ...state, effectStack: state.effectStack.slice(0, -1) };
  }
}

/** Mark the same committed occurrence on both the result and any retained
 * frame references. Immutable publication must not turn one occurrence into
 * a second unmarked debt when a batch re-enters later in this drain. */
function publishDrainEvents(
  state: GameState,
  events: import("../types.js").PendingEvent[]
): GameState {
  const before = [...events];
  state = publishCommittedEvents(state, events);
  if (before.every((event, index) => event === events[index])) return state;
  return replaceRetainedEventReferences(state, before, events);
}
