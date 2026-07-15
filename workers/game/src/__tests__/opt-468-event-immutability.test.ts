import { describe, expect, it } from "vitest";
import type {
  EffectStackFrame,
  GameState,
  PendingEvent,
  QueuedTrigger,
} from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { scanEventsForTriggers } from "../engine/trigger-ordering.js";
import { processRemainingTriggers } from "../engine/effect-resolver/resume.js";
import { advanceToPhase, setupGame } from "./factories.js";

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return value;
}

const stubBlock: EffectBlock = {
  id: "opt-468-frame",
  category: "auto",
  actions: [],
};

function frameWithEvent(event: PendingEvent): EffectStackFrame {
  return {
    id: "immutable-frame",
    sourceCardInstanceId: "source",
    controller: 0,
    effectBlock: stubBlock,
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: null,
    remainingActions: [],
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: [event],
  };
}

describe("OPT-468 immutable event propagation", () => {
  it("scans a deeply frozen event referenced by a persisted frame without mutation", () => {
    const setup = setupGame();
    const base = advanceToPhase(setup.state, "MAIN", setup.cardDb);
    const event: PendingEvent = {
      type: "CARD_STATE_CHANGED",
      playerIndex: 0,
      payload: {
        targetInstanceId: base.players[0].leader.instanceId,
        newState: "RESTED",
      },
    };
    const frame = frameWithEvent(event);
    const snapshot = deepFreeze({ ...base, effectStack: [frame] } as GameState);

    const result = scanEventsForTriggers(snapshot, [event], 0, setup.cardDb);

    expect(result.events[0]).not.toBe(event);
    expect(result.events[0].propagation).toEqual({ triggerScanned: true });
    expect(event.propagation).toBeUndefined();
    expect(snapshot.effectStack[0]).toBe(frame);
    expect(snapshot.effectStack[0].accumulatedEvents[0]).toBe(event);
    expect(
      snapshot.effectStack[0].accumulatedEvents[0].propagation
    ).toBeUndefined();
  });

  it("publishes resume-trigger events once while preserving the frozen input snapshot", () => {
    const setup = setupGame();
    const base = advanceToPhase(setup.state, "MAIN", setup.cardDb);
    const snapshot = deepFreeze(base);
    const effectBlock = deepFreeze<EffectBlock>({
      id: "opt-468-draw",
      category: "auto",
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    });
    const trigger = deepFreeze<QueuedTrigger>({
      sourceCardInstanceId: snapshot.players[0].leader.instanceId,
      controller: 0,
      effectBlock,
      triggeringEvent: { type: "TURN_STARTED", playerIndex: 0, payload: {} },
    });
    const originalLog = snapshot.eventLog;
    const originalDeck = snapshot.players[0].deck;

    const result = processRemainingTriggers(snapshot, [trigger], setup.cardDb);
    const drawEvents = result.events.filter(
      (event) => event.type === "CARD_DRAWN"
    );
    const loggedDraws = result.state.eventLog.filter(
      (event) => event.type === "CARD_DRAWN"
    );

    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0].propagation).toMatchObject({ eventLogEmitted: true });
    expect(loggedDraws).toHaveLength(1);
    expect(snapshot.eventLog).toBe(originalLog);
    expect(snapshot.players[0].deck).toBe(originalDeck);
    expect(snapshot.eventLog).not.toBe(result.state.eventLog);
    expect(snapshot.players[0].deck).not.toBe(result.state.players[0].deck);
    expect(trigger.triggeringEvent.propagation).toBeUndefined();
  });
});
