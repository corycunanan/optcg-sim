import { describe, expect, it } from "vitest";
import { convertPersistedGameState } from "../session/persistence.js";
import { goldenV2Raw } from "./fixtures/opt-963-v3-states.js";
import { toPersistedGameState } from "../session/game-state-schema.js";

export function version4Base(): Record<string, unknown> {
  const state = convertPersistedGameState(
    goldenV2Raw("battle-ready-with-undo"),
    "state"
  );
  return JSON.parse(
    JSON.stringify({ ...toPersistedGameState(state), schemaVersion: 4 })
  );
}

describe("OPT-964 reader-before-writer", () => {
  it("reads v4 live and undo while retaining the v3 writer", () => {
    for (const location of ["state", "undoHistory[0]"]) {
      const loaded = convertPersistedGameState(version4Base(), location);
      expect(
        (toPersistedGameState(loaded) as unknown as { schemaVersion: number })
          .schemaVersion
      ).toBe(3);
    }
  });
});

import type {
  CardData,
  GameAction,
  GameState,
  EffectStackFrame,
} from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";
import { frameKindOf } from "../engine/frame-kinds.js";
import { CONTINUATION_EFFECT_BLOCK } from "../engine/effect-stack.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  SessionRepository,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
} from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";

function boundary(id: string, sourceCardInstanceId: string, controller: 0 | 1) {
  return {
    id,
    sourceCardInstanceId,
    controller,
    effectBlock: CONTINUATION_EFFECT_BLOCK,
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
    accumulatedEvents: [],
  };
}

/** Structural proposed-writer projection of actual v3 engine states. Synthetic,
 * not a deployed v4 writer capture. Every lowering is compared with the source. */
function lift(state: GameState): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(toPersistedGameState(state)));
  raw.schemaVersion = 4;
  if (raw.turn.battle)
    Object.assign(raw.turn.battle, {
      step: raw.turn.battleSubPhase,
      redirectWindow: false,
      blockerLocked: raw.turn.battle.blockerActivated,
      targetLocked: true,
    });
  raw.effectStack = raw.effectStack.map((frame: EffectStackFrame) => {
    const next: Record<string, unknown> = {
      ...frame,
      kind: frameKindOf(frame),
    };
    if (frame.eventActivationCompletion) {
      next.kind = "EVENT_ACTIVATION";
      next.eventActivation = {
        publication: "AFTER_EFFECT",
        sourceZone:
          frame.eventActivationCompletion.type === "EVENT_ACTIVATED_FROM_HAND"
            ? "HAND"
            : "TRASH",
        sourceClass: "EVENT",
        events: [frame.eventActivationCompletion],
      };
      delete next.eventActivationCompletion;
    }
    return next;
  });
  if (raw.pendingEventActivationEvents?.length) {
    const event = raw.pendingEventActivationEvents.find(
      (e: { type: string }) => e.type === "EVENT_ACTIVATED_FROM_HAND"
    );
    raw.effectStack.unshift({
      ...boundary(
        "reader-fixture:activation",
        event.payload.cardInstanceId,
        event.playerIndex
      ),
      kind: "EVENT_ACTIVATION",
      eventActivation: {
        publication: "AFTER_STACK",
        sourceZone: "HAND",
        sourceClass: "EVENT",
        events: raw.pendingEventActivationEvents,
      },
    });
  }
  delete raw.pendingEventActivationEvents;
  return raw;
}
function eventFixture(nested: boolean, trash = false) {
  const db = createTestCardDb();
  const event: CardData = {
    ...CARDS.EVENT_COUNTER,
    id: "READER-EVENT",
    effectText: "[Main] Rest 1 Character. Draw 1 card.",
    effectSchema: {
      effects: [
        {
          id: "reader-main",
          category: "auto",
          trigger: { keyword: "MAIN_EVENT" },
          actions: [
            {
              type: "SET_REST",
              target: {
                type: "CHARACTER",
                controller: "OPPONENT",
                count: { exact: 1 },
              },
            },
            { type: "DRAW", params: { amount: 1 } },
          ],
        },
      ],
    },
  };
  db.set(event.id, event);
  let state = createBattleReadyState(db);
  const eventCard = {
    ...state.players[0].leader,
    instanceId: "reader-event-hand",
    cardId: event.id,
    zone: trash ? ("TRASH" as const) : ("HAND" as const),
    attachedDon: [],
  };
  state.players[0][trash ? "trash" : "hand"].push(eventCard);
  if (nested) {
    const leader: CardData = {
      ...CARDS.LEADER,
      effectSchema: {
        effects: [
          {
            id: "reader-activate",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [
              {
                type: trash
                  ? "ACTIVATE_EVENT_FROM_TRASH"
                  : "ACTIVATE_EVENT_FROM_HAND",
                target: {
                  type: "EVENT_CARD",
                  controller: "SELF",
                  source_zone: trash ? "TRASH" : "HAND",
                  count: { exact: 1 },
                },
              },
              { type: "DRAW", params: { amount: 1 } },
            ],
          },
        ],
      },
    };
    db.set(leader.id, leader);
    const start = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "reader-activate",
      },
      db,
      0
    );
    expect(start.valid, start.error).toBe(true);
    state = start.state;
    if (
      state.pendingPrompt?.options.promptType === "SELECT_TARGET" &&
      state.pendingPrompt.options.validTargets.includes(eventCard.instanceId)
    )
      state = reply(state, db, {
        type: "SELECT_TARGET",
        selectedInstanceIds: [eventCard.instanceId],
      });
  } else {
    const start = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: eventCard.instanceId },
      db,
      0
    );
    expect(start.valid, start.error).toBe(true);
    state = start.state;
  }
  expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return { state, db };
}
function reply(
  state: GameState,
  db: Map<string, CardData>,
  action: GameAction
) {
  const response = {
    ...action,
    promptId: state.pendingPrompt?.promptId,
  } as GameAction;
  const route = new SessionCoordinator().routePromptResponse(
    state,
    state.pendingPrompt!.respondingPlayer,
    response
  );
  expect(route.kind).toBe("resume");
  const result = resumePromptLifecycle(state, response, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(result.responseRejected).toBe(false);
  return result.state;
}
async function loadWithUndo(
  state: GameState,
  db: Map<string, CardData>,
  raw: Record<string, unknown>
) {
  const storage = new MemorySessionStorage();
  const config = { nextJsUrl: "https://test.example", workerSecret: "test" };
  await new SessionRepository(storage, config).save({
    state,
    cardDb: db,
    undoHistory: [state],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  const envelope = storage.data.get(SESSION_STORAGE_KEY) as Record<
    string,
    unknown
  >;
  storage.data.set(SESSION_STORAGE_KEY, {
    ...envelope,
    state: structuredClone(raw),
  });
  storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, [structuredClone(raw)]);
  const bytes = structuredClone([...storage.data]);
  storage.writes.length = 0;
  const loaded = (await new SessionRepository(storage, config).load())!;
  expect([...storage.data]).toEqual(bytes);
  expect(storage.writes).toEqual([]);
  return loaded;
}

describe("OPT-964 actual pipeline debt survives reader rollback", () => {
  it.each([
    [false, false],
    [true, false],
    [true, true],
  ])(
    "nested=%s trash=%s resumes live and undo exactly once",
    async (nested, trash) => {
      const { state, db } = eventFixture(nested, trash);
      if (!nested) {
        expect(state.pendingEventActivationEvents!.length).toBeGreaterThan(1);
        expect(
          state.pendingEventActivationEvents!.some(
            (e) => e.propagation?.eventLogEmitted
          )
        ).toBe(true);
      } else
        expect(state.effectStack.some((f) => f.eventActivationCompletion)).toBe(
          true
        );
      const raw = lift(state);
      const loaded = await loadWithUndo(state, db, raw);
      const action: GameAction = {
        type: "SELECT_TARGET",
        selectedInstanceIds: [
          state.players[1].characters.find((c) => c?.state === "ACTIVE")!
            .instanceId,
        ],
      };
      const expected = reply(state, db, action);
      for (const restored of [loaded.state, loaded.undoHistory[0]]) {
        expect(JSON.parse(JSON.stringify(restored))).toEqual(
          JSON.parse(
            JSON.stringify({
              ...state,
              effectStack: state.effectStack.map((f) => ({
                ...f,
                kind: frameKindOf(f),
              })),
            })
          )
        );
        const reloaded = convertPersistedGameState(
          toPersistedGameState(restored),
          "state"
        );
        const resolved = reply(reloaded, db, action);
        expect(resolved).toEqual(expected);
        expect(resolved.effectStack).toHaveLength(0);
        expect(resolved.pendingEventActivationEvents ?? []).toHaveLength(0);
        expect(
          resolved.eventLog.filter(
            (e) =>
              e.type ===
              (trash
                ? "EVENT_MAIN_RESOLVED_FROM_TRASH"
                : "EVENT_ACTIVATED_FROM_HAND")
          )
        ).toHaveLength(1);
      }
    }
  );
});

import { vi } from "vitest";
import * as logger from "../lib/log.js";

it("preserves structured-clone event aliases without mutating stored bytes", () => {
  const { state } = eventFixture(false);
  const raw = lift(state) as ReturnType<typeof lift> & {
    effectStack: Array<Record<string, unknown>>;
  };
  const owner = raw.effectStack[0].eventActivation as { events: unknown[] };
  const shared = owner.events[0];
  (raw.effectStack[1].accumulatedEvents as unknown[]).push(shared);
  const stored = structuredClone(raw);
  const before = JSON.stringify(stored);
  const loaded = convertPersistedGameState(stored, "state");
  expect(loaded.pendingEventActivationEvents![0]).toBe(
    loaded.effectStack[0].accumulatedEvents.at(-1)
  );
  expect(JSON.stringify(stored)).toBe(before);
});

it("reports snapshot lowering only after a valid load and keeps v3 queue semantics unchanged", () => {
  const { state } = eventFixture(false);
  const raw = lift(state) as ReturnType<typeof lift> & {
    effectStack: Array<Record<string, unknown>>;
  };
  const queued = {
    sourceCardInstanceId: "moved-source",
    controller: 0,
    effectBlock: { id: "queued-effect", category: "auto", actions: [] },
    triggeringEvent: { type: "TURN_STARTED", playerIndex: 0, payload: {} },
    sourceSnapshot: {
      instanceId: "moved-source",
      cardId: CARDS.VANILLA.id,
      controller: 0,
      effectBlockId: "queued-effect",
    },
  };
  raw.effectStack[1].pendingTriggers = [queued];
  const spy = vi.spyOn(logger, "log");
  try {
    const loaded = convertPersistedGameState(raw, "undoHistory[0]");
    expect(spy).toHaveBeenCalledWith("session.legacy_shape", {
      gameId: state.id,
      location: "undoHistory[0]",
      shape: "lowered.v4_source_snapshot",
    });
    expect(loaded.effectStack[0].pendingTriggers[0].sourceCardInstanceId).toBe(
      "moved-source"
    );
    spy.mockClear();
    const bad = structuredClone(raw);
    bad.effectStack[1].remainingActions = [{ type: "NOT_AN_ACTION" }];
    expect(() => convertPersistedGameState(bad, "state")).toThrow();
    expect(spy).not.toHaveBeenCalled();
    // Older bytes do not acquire new strict snapshot validation or activation semantics.
    const legacy = JSON.parse(JSON.stringify(toPersistedGameState(state)));
    legacy.effectStack[0].pendingTriggers = [
      { ...queued, sourceSnapshot: { historicalUnknownField: true } },
    ];
    expect(() => convertPersistedGameState(legacy, "state")).not.toThrow();
    expect(spy).not.toHaveBeenCalledWith(
      "session.legacy_shape",
      expect.objectContaining({ shape: "lowered.v4_source_snapshot" })
    );
  } finally {
    spy.mockRestore();
  }
});

import { processScheduledActions } from "../engine/duration-tracker.js";
import { transitionCard } from "../engine/zone-transition.js";

it.each(["state", "undoHistory[0]"])(
  "preserves a battle-end obligation's stale instance binding through %s",
  (location) => {
    const db = createTestCardDb();
    const initial = createBattleReadyState(db);
    const source = initial.players[0].characters.find((c) => c !== null)!;
    const trashed = transitionCard(initial, source.instanceId, "TRASH")!;
    const returned = transitionCard(
      trashed.state,
      trashed.fact.newInstanceId,
      "CHARACTER",
      { slotIndex: 0, entryState: "ACTIVE", turnPlayed: initial.turn.number }
    )!;
    const state = {
      ...returned.state,
      scheduledActions: [
        {
          id: "bound-obligation",
          timing: "END_OF_THIS_BATTLE" as const,
          action: {
            type: "DRAW" as const,
            params: { amount: 1 },
            target_ref: source.instanceId,
          },
          boundToInstanceId: source.instanceId,
          sourceEffectId: "bound-effect",
          controller: 0 as const,
        },
      ],
    };
    const loaded = convertPersistedGameState(lift(state), location);
    expect(loaded.scheduledActions).toEqual(state.scheduledActions);
    expect(loaded.players[0].characters[0]!.instanceId).not.toBe(
      source.instanceId
    );
    const result = processScheduledActions(loaded, "END_OF_THIS_BATTLE");
    expect(result.actionsToRun).toEqual([]);
    expect(result.state.scheduledActions).toEqual([]);
    expect(result.state.executionContext).toEqual(loaded.executionContext);
  }
);
