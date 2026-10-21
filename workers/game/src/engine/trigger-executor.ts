/** Version 5 semantic reader. Normal entry points do not create these frames
 * until the separate writer change lands. An existing frame owns every queue;
 * return values describe progress and never retain executable work. */
import type {
  CardData,
  EffectStackFrame,
  GameAction,
  GameState,
  PendingEvent,
  QueuedTrigger,
  TriggerExecution,
} from "../types.js";
import type {
  EffectResolverResult,
  EffectResolverServices,
} from "./effect-resolver/types.js";
import {
  buildTriggerSelectionPrompt,
  scanEventsForTriggers,
  withStableOrderingIds,
} from "./trigger-ordering.js";
import { isGameTerminated, publishBeforeGameOver } from "./terminal.js";
import {
  getEventCardInstanceId,
  replacePendingEventReferences,
} from "./events.js";
import {
  publishCommittedEvents,
  retainPropagationBeforePrompt,
} from "./effect-resolver/resume/events.js";
import { reenterBatchResume } from "./effect-resolver/resume/batch.js";

export type HandlerProgress =
  | "completed"
  | "waiting"
  | "queued"
  | "continued"
  | "terminal";
export type HandlerResult = EffectResolverResult & { kind: HandlerProgress };

export function triggerExecutionOwner(
  state: GameState
): EffectStackFrame | undefined {
  return [...state.effectStack]
    .reverse()
    .find((frame) => frame.triggerExecution !== undefined);
}

function updateOwner(
  state: GameState,
  id: string,
  work: TriggerExecution
): GameState {
  return {
    ...state,
    effectStack: state.effectStack.map((frame) =>
      frame.id === id ? { ...frame, triggerExecution: work } : frame
    ),
  };
}

/** Called instead of a private trigger drain when a v5 owner already exists. */
export function reportTriggerWork(
  state: GameState,
  triggers: QueuedTrigger[],
  events: PendingEvent[] = [],
  orderingGroup?: EffectStackFrame["triggerOrderingGroup"]
): HandlerResult {
  if (isGameTerminated(state))
    return { kind: "terminal", state, events, resolved: true };
  const owner = triggerExecutionOwner(state);
  if (!owner?.triggerExecution)
    throw new Error("Trigger work has no execution owner");
  if (triggers.length) {
    state = updateOwner(state, owner.id, {
      ...owner.triggerExecution,
      generations: [
        ...owner.triggerExecution.generations,
        {
          triggers: withStableOrderingIds(triggers),
          ...(orderingGroup ? { orderingGroup } : {}),
        },
      ],
    });
  }
  return {
    kind: triggers.length ? "queued" : "continued",
    state,
    events,
    resolved: true,
  };
}

/** Consume only the choice; activation belongs to advanceTriggerExecution. */
export function selectTriggerForExecution(
  state: GameState,
  action: GameAction
): HandlerResult | undefined {
  const owner = triggerExecutionOwner(state);
  const selection = state.effectStack.at(-1);
  if (
    !owner?.triggerExecution ||
    selection?.phase !== "AWAITING_TRIGGER_ORDER_SELECTION"
  )
    return undefined;
  const generation = owner.triggerExecution.generations[0];
  const choices = selection.simultaneousTriggers;
  const chosen =
    action.type === "PLAYER_CHOICE" &&
    choices.some((trigger) => trigger.orderingId === action.choiceId)
      ? generation?.triggers.find(
          (trigger) => trigger.orderingId === action.choiceId
        )
      : undefined;
  const done =
    action.type === "PLAYER_CHOICE" &&
    action.choiceId === "done" &&
    choices.every((trigger) => trigger.effectBlock.flags?.optional);
  if (!generation || (!chosen && !done))
    return {
      kind: "waiting",
      state,
      events: [],
      resolved: false,
      rejected: true,
    };
  const removedIds = new Set(
    done ? choices.map((trigger) => trigger.orderingId) : [chosen!.orderingId]
  );
  const group = selection.triggerOrderingGroup;
  const nextGeneration = {
    ...generation,
    triggers: generation.triggers.filter(
      (trigger) => !removedIds.has(trigger.orderingId)
    ),
    ...(group
      ? {
          orderingGroup: {
            ...group,
            resolvedTriggerIds: [
              ...group.resolvedTriggerIds,
              ...removedIds,
            ].filter((id): id is string => id !== undefined),
          },
        }
      : {}),
  };
  state = { ...state, effectStack: state.effectStack.slice(0, -1) };
  state = updateOwner(state, owner.id, {
    generations: [
      nextGeneration,
      ...owner.triggerExecution.generations.slice(1),
    ],
    ...(chosen ? { selectedTrigger: chosen } : {}),
  });
  return {
    kind: "continued",
    state,
    events: selection.accumulatedEvents,
    resolved: true,
  };
}

/** The only executor for a loaded v5 scope. Generations finish FIFO; within a
 * generation the turn player chooses first, then the opponent. A child prompt
 * returns immediately, leaving both its parent and queue on the stack. */
export function advanceTriggerExecution(
  initial: EffectResolverResult,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): HandlerResult {
  let state = initial.state;
  const events = [...initial.events];
  if (!isGameTerminated(state) && (initial.rejected || initial.pendingPrompt))
    return { ...initial, kind: "waiting" };
  while (true) {
    if (isGameTerminated(state))
      return {
        kind: "terminal",
        state: publishBeforeGameOver(
          state,
          events,
          state.turn.activePlayerIndex
        ),
        events,
        resolved: true,
      };
    let owner = triggerExecutionOwner(state);
    if (!owner?.triggerExecution)
      return {
        kind: "completed",
        state: publishCommittedEvents(state, events),
        events,
        resolved: true,
      };
    if (owner.accumulatedEvents.length) {
      const prefix = owner.accumulatedEvents;
      events.splice(0, events.length, ...new Set([...prefix, ...events]));
      state = {
        ...state,
        effectStack: state.effectStack.map((frame) =>
          frame.id === owner!.id ? { ...frame, accumulatedEvents: [] } : frame
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
    state = publishCommittedEvents(state, events);
    const child = state.effectStack.at(-1);
    if (child?.id !== owner.id) {
      if (child?.phase !== "AWAITING_BATCH_RESUME") {
        // Other continuation families remain owned by their existing drain.
        return { kind: "continued", state, events, resolved: true };
      }
      const resumed = reenterBatchResume(state, cardDb, services, events);
      state = resumed.state;
      events.splice(0, events.length, ...resumed.events);
      if (resumed.pendingPrompt) return { ...resumed, kind: "waiting" };
      continue;
    }
    let work = owner.triggerExecution!;
    // Empty generations can exist while their selected effect is suspended.
    if (!work.selectedTrigger && work.generations[0]?.triggers.length === 0) {
      work = { ...work, generations: work.generations.slice(1) };
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
        return {
          kind: "waiting",
          state,
          events,
          resolved: false,
          pendingPrompt: prompt.pendingPrompt,
        };
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
        return {
          ...result,
          state: retainPropagationBeforePrompt(state, events),
          events,
          kind: "waiting",
        };
      const unpublished = [...result.events];
      state = publishCommittedEvents(state, result.events);
      replacePendingEventReferences(events, unpublished, result.events);
      state = publishCommittedEvents(state, events);
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
    state = publishCommittedEvents(state, events);
    state = { ...state, effectStack: state.effectStack.slice(0, -1) };
  }
}
