/** Durable trigger queue ownership and selection. Advancement belongs to pending-work-drain. */
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
  HandlerResult,
} from "./effect-resolver/types.js";
import {
  buildTriggerSelectionPrompt,
  withStableOrderingIds,
} from "./trigger-ordering.js";
import { isGameTerminated } from "./terminal.js";
import { continuationBoundary, pushFrame } from "./effect-stack.js";
import { drainPendingWork } from "./pending-work-drain.js";

export type { HandlerProgress,
  HandlerResult } from "./effect-resolver/types.js";

export function triggerExecutionOwner(
  state: GameState
): EffectStackFrame | undefined {
  return [...state.effectStack]
    .reverse()
    .find((frame) => frame.triggerExecution !== undefined);
}

/** Own reports raised by a directly executed effect until its suffix finishes. */
export function createEffectExecutionScope(
  state: GameState,
  sourceCardInstanceId: string,
  controller: 0 | 1
): GameState {
  if (triggerExecutionOwner(state) || isGameTerminated(state)) return state;
  const boundary = continuationBoundary(state, sourceCardInstanceId, controller);
  const scoped = pushFrame(boundary.state, {
    ...boundary.frame,
    triggerExecution: { generations: [{ triggers: [] }] },
  });
  const damageIndex = state.effectStack.findIndex(
    (frame) =>
    frame.battleDamage?.stage === "CHARACTER_KO_REPLACEMENT" &&
    frame.battleDamage.battleId === state.turn.battle?.battleId
  );
  if (damageIndex < 0 || isGameTerminated(scoped)) return scoped;
  // Ordinary work raised by a battle substitute belongs after damage. Keep
  // its owner below the damage boundary, never above the substitute's suffix.
  const owner = scoped.effectStack.at(-1)!;
  return { ...scoped, effectStack: [
    ...state.effectStack.slice(0, damageIndex), owner,
    ...state.effectStack.slice(damageIndex),
  ] };
}

/** Start a persisted scope at a cross-effect boundary. Domain handlers only
 * report work once this owner exists; advancement remains at the dispatcher. */
export function createTriggerExecution(
  state: GameState,
  triggers: QueuedTrigger[],
  orderingGroup?: EffectStackFrame["triggerOrderingGroup"]
): HandlerResult {
  if (isGameTerminated(state))
    return { kind: "terminal", state, events: [], resolved: true };
  if (!triggers.length)
    return { kind: "completed", state, events: [], resolved: true };
  const first = triggers[0];
  const boundary = continuationBoundary(state, first.sourceCardInstanceId, first.controller);
  state = pushFrame(boundary.state, {
    ...boundary.frame,
    triggerExecution: { generations: [{
      triggers: withStableOrderingIds(triggers),
      ...(orderingGroup ? { orderingGroup } : {}),
    }] },
  });
  return { kind: "queued", state, events: [], resolved: true };
}

export function updateOwner(
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
    const work = owner.triggerExecution;
    // An explicit historical group is closed work, not a newly fulfilled report.
    if (orderingGroup || work.generations.length === 0) {
      state = updateOwner(state, owner.id, {
        ...work,
        generations: [
          ...work.generations,
          {
            triggers: withStableOrderingIds(triggers),
            ...(orderingGroup ? { orderingGroup } : {}),
          },
        ],
      });
    } else {
      const index = work.collectingGenerationIndex ?? work.generations.length;
      const existing = work.generations[index]?.triggers ?? [];
      const used = new Set(existing.map((trigger) => trigger.orderingId));
      // A later report may contain the same source/effect again. Allocate only
      // new occurrence IDs; identities already saved in the collector stay fixed.
      const appended = triggers.map((trigger) => {
        const pair = `${trigger.sourceCardInstanceId}:${trigger.effectBlock.id}`;
        let occurrence = 0;
        let orderingId = trigger.orderingId ?? `${pair}:0`;
        while (used.has(orderingId)) orderingId = `${pair}:${++occurrence}`;
        used.add(orderingId);
        return { ...trigger, orderingId };
      });
      const generations = [...work.generations];
      generations[index] = { triggers: [...existing, ...appended] };
      state = updateOwner(state, owner.id, {
        ...work,
        generations,
        collectingGenerationIndex: index,
      });
    }
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
  action: GameAction,
  cardDb: Map<string, CardData>
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
  if (!generation || (!chosen && !done)) {
    const offered = buildTriggerSelectionPrompt(
      { ...state, effectStack: state.effectStack.slice(0, -1) },
      choices, [], cardDb, selection.triggerOrderingGroup
    );
    return {
      kind: "waiting", state, events: [], resolved: false, rejected: true,
      ...(offered.pendingPrompt ? { pendingPrompt: {
        ...offered.pendingPrompt, resumeContext: selection.id,
      } } : {}),
    };
  }
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
    ...owner.triggerExecution,
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

export { drainPendingWork as advanceTriggerExecution } from "./pending-work-drain.js";

/** Compatibility entry for the supported bounded Life-reader fixtures. */
export function advanceLifeTriggerExecution(
  initial: EffectResolverResult,
  damageFrameId: string,
  cardDb: Map<string, CardData>,
  services: EffectResolverServices
): EffectResolverResult {
  return drainPendingWork(initial, cardDb, services, damageFrameId);
}
