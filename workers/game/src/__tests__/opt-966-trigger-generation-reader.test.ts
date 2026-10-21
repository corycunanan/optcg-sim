import { describe, expect, it } from "vitest";
import type {
  CardData,
  GameAction,
  GameState,
  QueuedTrigger,
} from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { continuationBoundary, pushFrame } from "../engine/effect-stack.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { withStableOrderingIds } from "../engine/trigger-ordering.js";
import {
  SessionRepository,
  type SessionStorage,
  convertPersistedGameState,
} from "../session/persistence.js";
import {
  toPersistedGameState,
  GAME_STATE_SCHEMA_VERSION,
} from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture(prompted = false) {
  const db = new Map(createTestCardDb());
  const a: EffectBlock = {
    id: "a",
    category: "auto",
    trigger: { keyword: "WHEN_ATTACKING" },
    actions: [
      {
        type: "PLAY_CARD",
        target: {
          type: "CHARACTER_CARD",
          source_zone: "HAND",
          controller: "SELF",
          count: prompted ? { up_to: 1 } : { exact: 1 },
          filter: { name: "C" },
        },
        params: { source_zone: "HAND", cost_override: "FREE" },
      },
    ],
  };
  const x: EffectBlock = {
    id: "x",
    category: "auto",
    trigger: { keyword: "ON_OPPONENT_ATTACK" },
    actions: [{ type: "DRAW", params: { amount: 1 } }],
  };
  const c: EffectBlock = {
    id: "c",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    actions: [
      {
        type: "MODIFY_POWER",
        target: { type: "SELF" },
        params: { amount: 1000 },
        duration: { type: "THIS_TURN" },
      },
    ],
  };
  for (const [id, block] of [
    ["A", a],
    ["X", x],
    ["C", c],
  ] as const) {
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: id,
      effectSchema: {
        card_id: id,
        card_name: id,
        card_type: "Character",
        effects: [block],
      },
    });
  }
  let state = createBattleReadyState(db);
  const instance = (
    cardId: string,
    controller: 0 | 1,
    zone: "CHARACTER" | "HAND"
  ) => ({
    instanceId: cardId,
    cardId,
    controller,
    owner: controller,
    zone,
    state: "ACTIVE" as const,
    attachedDon: [],
    turnPlayed: 1,
  });
  const ai = instance("A", 0, "CHARACTER");
  const xi = instance("X", 1, "CHARACTER");
  state = {
    ...state,
    eventLog: [],
    players: [
      {
        ...state.players[0],
        characters: padChars([ai]),
        hand: [instance("C", 0, "HAND")],
      },
      { ...state.players[1], characters: padChars([xi]) },
    ],
  };
  state = registerCardEnteredField(
    registerCardEnteredField(state, ai, db.get("A")!),
    xi,
    db.get("X")!
  );
  const trigger = (
    source: string,
    controller: 0 | 1,
    effectBlock: EffectBlock
  ): QueuedTrigger => ({
    sourceCardInstanceId: source,
    controller,
    effectBlock,
    triggeringEvent: {
      type: "ATTACK_DECLARED",
      playerIndex: 0,
      payload: {
        attackerInstanceId: "A",
        targetInstanceId: state.players[1].leader.instanceId,
        attackerPower: 5000,
      },
    },
    sourceSnapshot: {
      instanceId: source,
      cardId: source,
      controller,
      effectBlockId: effectBlock.id,
    },
  });
  const boundary = continuationBoundary(state, "A", 0);
  state = pushFrame(boundary.state, {
    ...boundary.frame,
    triggerExecution: {
      generations: [
        {
          triggers: withStableOrderingIds([
            trigger("A", 0, a),
            trigger("X", 1, x),
          ]),
        },
      ],
    },
  });
  return { state, db, trigger, a, x, c };
}
function restore(state: GameState) {
  return convertPersistedGameState(
    structuredClone(toPersistedGameState(state)),
    "state"
  );
}
function start(state: GameState, db: Map<string, CardData>): GameState {
  const result = resumeFromStack(state, { type: "PASS" }, db);
  return {
    ...result.state,
    pendingPrompt: result.pendingPrompt
      ? { ...result.pendingPrompt, promptId: "reader-test-prompt" }
      : null,
  };
}
function answer(
  state: GameState,
  db: Map<string, CardData>,
  action: GameAction
) {
  const result = resumePromptLifecycle(state, action, db, {
    drainPregame: (state) => state,
    advanceStartOfTurn: (state) => state,
  });
  expect(result.responseRejected).toBeFalsy();
  return result.state;
}
function sequence(state: GameState) {
  const c = state.players[0].characters.find(
    (card) => card?.cardId === "C"
  )!.instanceId;
  return state.eventLog.map((event) => ({
    type: event.type,
    playerIndex: event.playerIndex,
    payload: JSON.parse(
      JSON.stringify(event.payload).replaceAll(c, "C-instance")
    ),
  }));
}

describe("OPT-966 version 5 semantic reader (normal writer remains v4)", () => {
  it("keeps normal states on v4 and preserves a loaded v5 scope through save/load", () => {
    expect(GAME_STATE_SCHEMA_VERSION).toBe(4);
    const { state } = fixture();
    expect(restore(state).effectStack).toEqual(
      toPersistedGameState(state).effectStack
    );
    expect(
      (toPersistedGameState(state) as unknown as { schemaVersion: number })
        .schemaVersion
    ).toBe(5);
    expect(
      (
        toPersistedGameState({ ...state, effectStack: [] }) as unknown as {
          schemaVersion: number;
        }
      ).schemaVersion
    ).toBe(4);
  });

  it("reads A/X and executes A then X then C exactly once", () => {
    const { state, db } = fixture();
    const final = start(restore(state), db);
    expect(final.pendingPrompt).toBeNull();
    expect(final.effectStack).toEqual([]);
    expect(
      final.eventLog.map((event) => `${event.type}:${event.playerIndex}`)
    ).toEqual([
      "CARD_PLAYED:0",
      "CARD_DRAWN:1",
      "DRAW_OUTSIDE_DRAW_PHASE:1",
      "POWER_MODIFIED:0",
    ]);
  });

  it("preserves the older X generation across A's prompt and repeated reload", () => {
    const continuous = fixture();
    const expected = start(restore(continuous.state), continuous.db);
    const prompted = fixture(true);
    let paused = start(restore(prompted.state), prompted.db);
    expect(paused.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    paused = restore(restore(paused));
    const final = answer(paused, prompted.db, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["C"],
    });
    expect(sequence(final)).toEqual(sequence(expected));
    expect(final.effectStack).toEqual([]);
  });

  it("finishes A's suffix before X and defers C until after X", () => {
    const { state, db, a } = fixture();
    a.actions!.push({ type: "DRAW", params: { amount: 1 } });
    const final = start(restore(state), db);
    expect(
      final.eventLog.map((event) => `${event.type}:${event.playerIndex}`)
    ).toEqual([
      "CARD_PLAYED:0",
      "CARD_DRAWN:0",
      "DRAW_OUTSIDE_DRAW_PHASE:0",
      "CARD_DRAWN:1",
      "DRAW_OUTSIDE_DRAW_PHASE:1",
      "POWER_MODIFIED:0",
    ]);
  });

  it.each([0, 1] as const)(
    "keeps generations separate with active player %s over every reload",
    (activePlayerIndex) => {
      const { state, db, trigger, a, x, c } = fixture();
      state.turn.activePlayerIndex = activePlayerIndex;
      const c2 = { ...c, id: "c2" };
      db.get("C")!.effectSchema!.effects.push(c2);
      state.effectStack[0].triggerExecution!.generations[0].triggers =
        withStableOrderingIds([trigger("A", 0, a), trigger("A", 0, x)]);
      let next = start(restore(state), db);
      expect(next.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
      next = answer(restore(next), db, {
        type: "PLAYER_CHOICE",
        choiceId: "A:a:0",
      });
      expect(next.eventLog.map((event) => event.type)).toEqual([
        "CARD_PLAYED",
        "CARD_DRAWN",
        "DRAW_OUTSIDE_DRAW_PHASE",
      ]);
      const options = next.pendingPrompt!.options;
      if (options.promptType !== "PLAYER_CHOICE")
        throw new Error("Expected trigger order choice");
      const choices = options.choices;
      expect(choices).toHaveLength(2);
      expect(choices.every((choice) => choice.id.includes(":c"))).toBe(true);
      next = answer(restore(restore(next)), db, {
        type: "PLAYER_CHOICE",
        choiceId: choices[0].id,
      });
      expect(next.eventLog.map((event) => event.type)).toEqual([
        "CARD_PLAYED",
        "CARD_DRAWN",
        "DRAW_OUTSIDE_DRAW_PHASE",
        "POWER_MODIFIED",
        "POWER_MODIFIED",
      ]);
      expect(next.effectStack).toEqual([]);
    }
  );

  it("does not activate X or C after A terminates the game", () => {
    const { state, db, a } = fixture();
    state.players[0].deck = [];
    a.actions = [{ type: "DRAW", params: { amount: 1 } }];
    const final = start(restore(state), db);
    expect(final.status).toBe("FINISHED");
    expect(final.effectStack).toEqual([]);
    expect(
      final.eventLog.filter((event) =>
        ["CARD_PLAYED", "POWER_MODIFIED"].includes(event.type)
      )
    ).toEqual([]);
    expect(
      final.eventLog.filter((event) => event.type === "GAME_OVER")
    ).toHaveLength(1);
  });

  it("loads live and undo generation scopes and resumes both without losing the parent", async () => {
    class MemoryStorage implements SessionStorage {
      readonly data = new Map<string, unknown>();
      async get<T>(key: string): Promise<T | undefined> {
        return this.data.get(key) as T | undefined;
      }
      async put(key: string, value: unknown): Promise<void>;
      async put(entries: Record<string, unknown>): Promise<void>;
      async put(key: string | Record<string, unknown>, value?: unknown) {
        for (const [k, v] of Object.entries(
          typeof key === "string" ? { [key]: value } : key
        ))
          this.data.set(k, structuredClone(v));
      }
      async setAlarm() {}
      async deleteAlarm() {}
    }
    const { state, db } = fixture(true);
    const paused = start(restore(state), db);
    const repository = new SessionRepository(new MemoryStorage(), {
      nextJsUrl: "https://example.test",
      workerSecret: "secret",
    });
    await repository.save({
      state: paused,
      cardDb: db,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory: [paused],
    });
    const loaded = (await repository.load())!;
    expect(loaded.state.effectStack[0].triggerExecution).toEqual(
      paused.effectStack[0].triggerExecution
    );
    expect(loaded.undoHistory[0].effectStack[0].triggerExecution).toEqual(
      paused.effectStack[0].triggerExecution
    );
    const liveFinal = answer(loaded.state, db, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["C"],
    });
    const undoFinal = answer(loaded.undoHistory[0], db, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["C"],
    });
    expect(sequence(liveFinal)).toEqual(sequence(undoFinal));
    expect(liveFinal.players).toEqual(undoFinal.players);
  });

  it("clears a selected activation before its child prompt can be saved", () => {
    const { state, db } = fixture(true);
    const work = state.effectStack[0].triggerExecution!;
    work.selectedTrigger = work.generations[0].triggers.shift()!;
    const paused = start(restore(state), db);
    expect(paused.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(
      paused.effectStack[0].triggerExecution!.selectedTrigger
    ).toBeUndefined();
    const final = answer(restore(paused), db, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["C"],
    });
    expect(
      final.eventLog.filter((event) => event.type === "CARD_PLAYED")
    ).toHaveLength(1);
    expect(final.effectStack).toEqual([]);
  });

  it("rejects a selection copied from a different generation or with altered actions", () => {
    const { state, db, trigger, a, x } = fixture();
    state.effectStack[0].triggerExecution!.generations[0].triggers =
      withStableOrderingIds([trigger("A", 0, a), trigger("A", 0, x)]);
    const selection = start(restore(state), db);
    const raw = structuredClone(toPersistedGameState(selection));
    const copied = raw.effectStack.at(-1)!.simultaneousTriggers[0];
    raw.effectStack.at(-1)!.simultaneousTriggers[0] = {
      ...copied,
      effectBlock: { ...copied.effectBlock, actions: [] },
    };
    expect(() => convertPersistedGameState(raw, "undoHistory[0]")).toThrow(
      "selection disagrees with its generation"
    );
    const badHistory = structuredClone(toPersistedGameState(selection));
    badHistory.effectStack
      .at(-1)!
      .triggerOrderingGroup!.resolvedTriggerIds.push("A:a:0");
    expect(() => convertPersistedGameState(badHistory, "state")).toThrow(
      "selection ordering history disagrees"
    );
  });

  it("rejects a selected trigger that is still queued", () => {
    const { state } = fixture();
    const work = state.effectStack[0].triggerExecution!;
    work.selectedTrigger = work.generations[0].triggers[0];
    expect(() => restore(state)).toThrow("selected trigger is still queued");
  });

  it("rejects unknown generation keys and duplicate ordering IDs", () => {
    const { state } = fixture();
    const raw = toPersistedGameState(state);
    const work = raw.effectStack[0].triggerExecution!;
    work.generations[0].triggers.push(work.generations[0].triggers[0]);
    expect(() => restore(raw)).toThrow("unique ordering IDs");
    expect(() =>
      convertPersistedGameState(
        {
          ...raw,
          effectStack: [
            {
              ...raw.effectStack[0],
              triggerExecution: { ...work, surprise: true },
            },
          ],
        },
        "state"
      )
    ).toThrow("surprise");
  });
});
