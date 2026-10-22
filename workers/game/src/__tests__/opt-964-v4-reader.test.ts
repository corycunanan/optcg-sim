import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

describe("OPT-964 historical v4 input and current writer", () => {
  it("reads v4 and promotes live and undo output to v6", () => {
    for (const location of ["state", "undoHistory[0]"]) {
      const loaded = convertPersistedGameState(version4Base(), location);
      expect(
        (toPersistedGameState(loaded) as unknown as { schemaVersion: number })
          .schemaVersion
      ).toBe(6);
    }
  });
});

import type {
  CardData,
  GameAction,
  GameState,
} from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";
import { frameKindOf } from "../engine/frame-kinds.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { SessionCoordinator } from "../session/coordinator.js";
import {
  SessionRepository,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
} from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";

/** Actual current writer output from engine-produced runtime states. */
function lift(state: GameState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(toPersistedGameState(state)));
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

describe("OPT-964 actual pipeline debt survives native persistence", () => {
  it.each([
    [false, false],
    [true, false],
    [true, true],
  ])(
    "nested=%s trash=%s resumes live and undo exactly once",
    async (nested, trash) => {
      const { state, db } = eventFixture(nested, trash);
      if (!nested) {
        expect(state.effectStack[0].eventActivation!.events.length).toBeGreaterThan(1);
        expect(
          state.effectStack[0].eventActivation!.events.some(
            (e) => e.propagation?.eventLogEmitted
          )
        ).toBe(true);
      } else
        expect(state.effectStack.some((f) => f.eventActivation)).toBe(
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
      if (process.env.OPT964_CORPUS_DIR) {
        mkdirSync(process.env.OPT964_CORPUS_DIR, { recursive: true });
        writeFileSync(join(process.env.OPT964_CORPUS_DIR, `event-${nested ? "nested" : "root"}-${trash ? "trash" : "hand"}.json`), JSON.stringify({
          state: raw, undoHistory: [raw], cardDb: Object.fromEntries(db),
          replay: { actions: [action], expected: { players: expected.players, eventLog: expected.eventLog, pendingPrompt: expected.pendingPrompt, effectStackLength: expected.effectStack.length, executionContext: expected.executionContext }, parity: "lossless event ownership" },
        }, null, 2));
      }

      for (const restored of [loaded.state, loaded.undoHistory[0]]) {
        expect(JSON.parse(JSON.stringify(restored))).toEqual(
          JSON.parse(
            JSON.stringify({
              ...state,
              schemaVersion: 6,
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
        expect(resolved).toEqual({ ...expected, schemaVersion: 6 });
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
  expect(loaded.effectStack[0].eventActivation!.events[0]).toBe(
    loaded.effectStack[1].accumulatedEvents.at(-1)
  );
  expect(JSON.stringify(stored)).toBe(before);
});

it("retains native identity without logging rollback degradation", () => {
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
  const continuationIndex = raw.effectStack.findIndex(frame => frame.phase === "AWAITING_TARGET_SELECTION");
  expect(continuationIndex).toBeGreaterThanOrEqual(0);
  raw.effectStack[continuationIndex].pendingTriggers = [queued];
  const spy = vi.spyOn(logger, "log");
  try {
    const loaded = convertPersistedGameState(raw, "undoHistory[0]");
    expect(spy).not.toHaveBeenCalledWith("session.legacy_shape", expect.objectContaining({ shape: "lowered.v4_source_snapshot" }));
    expect(loaded.effectStack[continuationIndex].pendingTriggers[0].sourceSnapshot).toEqual(queued.sourceSnapshot);
    spy.mockClear();
    const bad = structuredClone(raw);
    bad.effectStack[continuationIndex].remainingActions = [{ type: "NOT_AN_ACTION" }];
    expect(() => convertPersistedGameState(bad, "state")).toThrow();
    expect(spy).not.toHaveBeenCalled();
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
