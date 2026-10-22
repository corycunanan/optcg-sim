import { describe, expect, it } from "vitest";
import type {
  CardData,
  GameAction,
  GameState,
  QueuedTrigger,
} from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { continuationBoundary, pushFrame } from "../engine/effect-stack.js";
import { withBattleTriggerWindow } from "./trigger-window-helpers.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import {
  advanceLifeTriggerExecution,
  reportTriggerWork,
} from "../engine/trigger-executor.js";
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

function collectorFixture(siblings: boolean, prompted: boolean) {
  const f = fixture(prompted);
  const d = { ...structuredClone(f.c), id: "d" };
  f.db.set("D", {
    ...f.db.get("C")!,
    id: "D",
    name: "D",
    effectSchema: {
      card_id: "D",
      card_name: "D",
      card_type: "Character",
      effects: [d],
    },
  });
  f.state.players[0].hand.push({
    ...f.state.players[0].hand[0],
    instanceId: "D",
    cardId: "D",
  });
  const playD = structuredClone(f.a.actions![0]);
  if (playD.target) playD.target.filter = { name: "D" };
  if (siblings) {
    f.x.actions = [playD];
    f.state.effectStack[0].triggerExecution!.generations[0].triggers =
      withStableOrderingIds([f.trigger("A", 0, f.a), f.trigger("A", 0, f.x)]);
  } else f.a.actions!.push(playD);
  return f;
}

describe("OPT-966 version 5 semantic reader (normal writer remains v4)", () => {
  it.each([false, true])(
    "coalesces same-effect reports; prompted=%s",
    (prompted) => {
      const run = (reload: boolean) => {
        const { state, db } = collectorFixture(false, prompted);
        let current = start(restore(state), db);
        while (current.pendingPrompt?.options.promptType === "SELECT_TARGET") {
          if (reload) current = restore(current);
          const options = current.pendingPrompt!.options;
          if (options.promptType !== "SELECT_TARGET") throw new Error("target");
          current = answer(current, db, {
            type: "SELECT_TARGET",
            selectedInstanceIds: options.validTargets.slice(0, 1),
          });
        }
        expect(current.effectStack.at(-1)?.phase).toBe(
          "AWAITING_TRIGGER_ORDER_SELECTION"
        );
        const choices = current.effectStack.at(-1)!.simultaneousTriggers;
        expect(choices.map((t) => t.effectBlock.id)).toEqual(["c", "d"]);
        expect(current.eventLog.map((e) => e.type)).toEqual([
          "CARD_PLAYED",
          "CARD_PLAYED",
          "CARD_DRAWN",
          "DRAW_OUTSIDE_DRAW_PHASE",
        ]);
        if (reload) current = restore(current);
        return answer(current, db, {
          type: "PLAYER_CHOICE",
          choiceId: choices[1].orderingId!,
        });
      };
      const continuous = run(false),
        reloaded = run(true);
      expect(reloaded.eventLog).toEqual(continuous.eventLog);
      expect(reloaded.players).toEqual(continuous.players);
      expect(continuous.eventLog.slice(-2).map((e) => e.payload)).toEqual([
        {
          targetInstanceId: continuous.players[0].characters.find(
            (c) => c?.cardId === "D"
          )!.instanceId,
          amount: 1000,
        },
        {
          targetInstanceId: continuous.players[0].characters.find(
            (c) => c?.cardId === "C"
          )!.instanceId,
          amount: 1000,
        },
      ]);
      expect(continuous.effectStack).toEqual([]);
    }
  );

  it("matches complete final traces and next-choice options across continuous, prompted and reloaded paths", () => {
    const traces = [false, true].flatMap((prompted) =>
      [false, true].map((reload) => {
        const { state, db } = collectorFixture(false, prompted);
        let current = start(restore(state), db);
        while (current.pendingPrompt?.options.promptType === "SELECT_TARGET") {
          if (reload) current = restore(current);
          const options = current.pendingPrompt!.options;
          if (options.promptType !== "SELECT_TARGET") throw new Error("target");
          current = answer(current, db, {
            type: "SELECT_TARGET",
            selectedInstanceIds: options.validTargets.slice(0, 1),
          });
        }
        const prompt = current.pendingPrompt!;
        const choice = current.effectStack.at(-1)!.simultaneousTriggers[1];
        if (reload) current = restore(current);
        const final = answer(current, db, {
          type: "PLAYER_CHOICE",
          choiceId: choice.orderingId!,
        });
        let trace = JSON.stringify({
          events: final.eventLog,
          players: final.players,
          promptOptions: prompt.options,
          respondingPlayer: prompt.respondingPlayer,
          stack: final.effectStack,
        });
        // Prompt frames allocate IDs. Normalize only the two played and one drawn identities,
        // including their ordering IDs; every event field and gameplay value remains.
        for (const cardId of ["C", "D"]) {
          const id = final.players[0].characters.find(
            (c) => c?.cardId === cardId
          )!.instanceId;
          trace = trace.replaceAll(id, `${cardId}-played`);
        }
        trace = trace.replaceAll(
          final.players[1].hand.at(-1)!.instanceId,
          "X-drawn"
        );
        return JSON.parse(trace);
      })
    );
    for (const trace of traces) expect(trace).toEqual(traces[0]);
  });

  it("collects C from A and D from older sibling B into one later choice across reload", () => {
    const { state, db } = collectorFixture(true, true);
    let current = start(restore(state), db);
    current = answer(restore(current), db, {
      type: "PLAYER_CHOICE",
      choiceId: "A:a:0",
    });
    while (current.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      const raw = structuredClone(toPersistedGameState(current));
      const undo = convertPersistedGameState(
        structuredClone(raw),
        "undoHistory[0]"
      );
      current = convertPersistedGameState(raw, "state");
      expect(undo).toEqual(current);
      const options = current.pendingPrompt!.options;
      if (options.promptType !== "SELECT_TARGET") throw new Error("target");
      current = answer(current, db, {
        type: "SELECT_TARGET",
        selectedInstanceIds: options.validTargets.slice(0, 1),
      });
    }
    expect(
      current.effectStack
        .at(-1)
        ?.simultaneousTriggers.map((t) => t.effectBlock.id)
    ).toEqual(["c", "d"]);
    expect(current.eventLog.map((e) => e.type)).toEqual([
      "CARD_PLAYED",
      "CARD_PLAYED",
    ]);
    const final = answer(restore(current), db, {
      type: "PLAYER_CHOICE",
      choiceId: current.effectStack.at(-1)!.simultaneousTriggers[0].orderingId!,
    });
    expect(final.eventLog.map((e) => e.type)).toEqual([
      "CARD_PLAYED",
      "CARD_PLAYED",
      "POWER_MODIFIED",
      "POWER_MODIFIED",
    ]);
    expect(final.effectStack).toEqual([]);
  });

  it.each([false, true])(
    "combines repeated source/effect reports with distinct stable identities; assigned=%s",
    (assigned) => {
      const { state, trigger, c } = fixture();
      const incoming = [trigger("C", 0, c)];
      if (assigned) incoming[0].orderingId = "C:c:0";
      const first = reportTriggerWork(state, incoming).state;
      const second = reportTriggerWork(first, incoming).state;
      expect(
        second.effectStack[0].triggerExecution!.generations[1].triggers[0]
      ).toEqual(
        first.effectStack[0].triggerExecution!.generations[1].triggers[0]
      );
      const work = second.effectStack[0].triggerExecution!;
      expect(work.generations).toHaveLength(2);
      expect(
        new Set(work.generations[1].triggers.map((t) => t.orderingId)).size
      ).toBe(2);
      expect(() => restore(second)).not.toThrow();
    }
  );

  it.each([0, -1, 1.5, 9])(
    "rejects invalid collector index %s in live and undo",
    (index) => {
      const { state, trigger, c } = fixture();
      const next = reportTriggerWork(state, [trigger("C", 0, c)]).state;
      next.effectStack[0].triggerExecution!.collectingGenerationIndex = index;
      const raw = toPersistedGameState(next);
      for (const location of ["state", "undoHistory[0]"])
        expect(() =>
          convertPersistedGameState(structuredClone(raw), location)
        ).toThrow();
    }
  );

  it.each(["empty", "history"])("rejects %s collector work", (invalid) => {
    const { state, trigger, c } = fixture();
    const next = reportTriggerWork(state, [trigger("C", 0, c)]).state;
    const collector = next.effectStack[0].triggerExecution!.generations[1];
    if (invalid === "empty") collector.triggers = [];
    else
      collector.orderingGroup = {
        triggers: collector.triggers,
        resolvedTriggerIds: [],
      };
    expect(() => restore(next)).toThrow("invalid open trigger collector");
  });

  it("preserves the collector through an older ordering choice and automatic sibling prompt", () => {
    const { state, db, trigger, a, x, c } = fixture(true);
    state.effectStack[0].triggerExecution!.generations = [
      {
        triggers: withStableOrderingIds([
          trigger("A", 0, a),
          trigger("A", 0, x),
        ]),
      },
    ];
    const reported = reportTriggerWork(state, [trigger("C", 0, c)]).state;
    let current = start(restore(reported), db);
    expect(
      current.effectStack[0].triggerExecution!.collectingGenerationIndex
    ).toBe(1);
    current = answer(restore(current), db, {
      type: "PLAYER_CHOICE",
      choiceId: "A:x:0",
    });
    expect(current.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(
      restore(current).effectStack[0].triggerExecution!
        .collectingGenerationIndex
    ).toBe(1);
  });

  it("does not infer an open collector from old closed generations or supplied history", () => {
    const { state, trigger, x, c } = fixture();
    const work = state.effectStack[0].triggerExecution!;
    const closed = withStableOrderingIds([trigger("X", 1, x)]);
    work.generations.push(
      { triggers: closed },
      { triggers: structuredClone(closed) }
    );
    const first = reportTriggerWork(state, [trigger("C", 0, c)]).state;
    const group = { triggers: closed, resolvedTriggerIds: [] };
    const second = reportTriggerWork(first, closed, [], group).state;
    const secondWork = second.effectStack[0].triggerExecution!;
    expect(secondWork.collectingGenerationIndex).toBe(3);
    expect(secondWork.generations.slice(0, 3)).toEqual(work.generations);
    expect(secondWork.generations[4]).toEqual({
      triggers: closed,
      orderingGroup: group,
    });
    expect(() => restore(second)).not.toThrow();
  });

  it("routes reports to the inner scope without merging its parent's collector", () => {
    const { state, trigger, x, c } = fixture();
    const outer = reportTriggerWork(state, [trigger("C", 0, c)]).state;
    const boundary = continuationBoundary(outer, "X", 1);
    const nested = pushFrame(boundary.state, {
      ...boundary.frame,
      triggerExecution: {
        generations: [
          { triggers: withStableOrderingIds([trigger("X", 1, x)]) },
        ],
      },
    });
    const reported = reportTriggerWork(nested, [trigger("X", 1, x)]).state;
    expect(reported.effectStack[0]).toEqual(outer.effectStack[0]);
    expect(
      reported.effectStack[1].triggerExecution!.collectingGenerationIndex
    ).toBe(1);
    expect(() => restore(reported)).not.toThrow();
  });

  it("retains the authored Moria active/rested On Play choice across live and undo reload", () => {
    const { state, db, trigger } = collectorFixture(false, false);
    const block = getEffectSchema("OP06-086")!.effects.find(
      (b) =>
        b.trigger && "keyword" in b.trigger && b.trigger.keyword === "ON_PLAY"
    )!;
    for (const id of ["C", "D"]) db.set(id, { ...db.get(id)!, cost: 2 });
    state.players[0].trash = state.players[0].hand.map((card) => ({
      ...card,
      zone: "TRASH",
    }));
    state.players[0].hand = [];
    db.set("A", { ...db.get("A")!, effectSchema: getEffectSchema("OP06-086") });
    state.effectStack[0].triggerExecution!.generations = [
      { triggers: withStableOrderingIds([trigger("A", 0, block)]) },
    ];
    let current = start(restore(state), db);
    current = answer(restore(current), db, {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["C", "D"],
    });
    const prompt = current.pendingPrompt!;
    expect(prompt.options.promptType).toBe("PLAYER_CHOICE");
    if (prompt.options.promptType !== "PLAYER_CHOICE")
      throw new Error("state choice");
    current = answer(restore(current), db, {
      type: "PLAYER_CHOICE",
      choiceId: prompt.options.choices[0].id,
    });
    const raw = toPersistedGameState(current);
    expect(
      convertPersistedGameState(structuredClone(raw), "undoHistory[0]")
    ).toEqual(restore(current));
    expect(
      current.effectStack
        .at(-1)!
        .simultaneousTriggers.map((t) => t.effectBlock.id)
    ).toEqual(["c", "d"]);
    expect(
      current.players[0].characters
        .filter((c) => c?.cardId === "C" || c?.cardId === "D")
        .map((c) => c!.state)
    ).toEqual(["ACTIVE", "RESTED"]);
    expect(current.eventLog.map((e) => e.type)).toEqual([
      "CARD_PLAYED",
      "CARD_PLAYED",
    ]);
  });

  it("promotes normal and trigger-owner states to v6 while preserving their scope", () => {
    expect(GAME_STATE_SCHEMA_VERSION).toBe(6);
    const { state } = fixture();
    expect(restore(state).effectStack).toEqual(
      toPersistedGameState(state).effectStack
    );
    expect(
      (toPersistedGameState(state) as unknown as { schemaVersion: number })
        .schemaVersion
    ).toBe(6);
    expect(
      (
        toPersistedGameState({ ...state, effectStack: [] }) as unknown as {
          schemaVersion: number;
        }
      ).schemaVersion
    ).toBe(6);
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

  it.each([false, true])(
    "loads live and undo generation scopes and resumes both without losing the parent; collector=%s",
    async (collector) => {
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
      const { state, db } = collector
        ? collectorFixture(false, true)
        : fixture(true);
      let paused = start(restore(state), db);
      if (collector) {
        paused = answer(paused, db, {
          type: "SELECT_TARGET",
          selectedInstanceIds: ["C"],
        });
        expect(
          paused.effectStack[0].triggerExecution!.collectingGenerationIndex
        ).toBe(1);
      }
      // Fix the same prompt identity in live and undo snapshots; save assigns
      // missing live IDs only, which would otherwise consume an extra engine ID.
      paused = {
        ...paused,
        pendingPrompt: {
          ...paused.pendingPrompt!,
          promptId: "collector-save-prompt",
        },
      };
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
        selectedInstanceIds: [collector ? "D" : "C"],
      });
      const undoFinal = answer(loaded.undoHistory[0], db, {
        type: "SELECT_TARGET",
        selectedInstanceIds: [collector ? "D" : "C"],
      });
      expect(sequence(liveFinal)).toEqual(sequence(undoFinal));
      expect(liveFinal.players).toEqual(undoFinal.players);
    }
  );

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

  it.each(["state", "undoHistory[0]"])(
    "rejects an ordering selection separated from its owner in %s",
    (location) => {
      const { state, db, trigger, a, x } = fixture();
      state.effectStack[0].triggerExecution!.generations[0].triggers =
        withStableOrderingIds([trigger("A", 0, a), trigger("A", 0, x)]);
      const choice = start(restore(state), db);
      const boundary = continuationBoundary(choice, "A", 0);
      const raw = structuredClone(toPersistedGameState(choice));
      raw.effectStack.splice(1, 0, { ...boundary.frame, kind: "TRIGGER_DRAIN" });
      expect(() => convertPersistedGameState(raw, location)).toThrow(
        "selection must be directly above its trigger execution owner"
      );
    }
  );

  it.each([
    ["state", "absent"], ["undoHistory[0]", "absent"],
    ["state", "structural"], ["undoHistory[0]", "structural"],
    ["state", "frame"], ["undoHistory[0]", "frame"],
  ])(
    "rejects a buried owned ordering selection in %s with %s prompt context",
    (location, promptContext) => {
      const { state, db, trigger, a, x } = fixture();
      state.effectStack[0].triggerExecution!.generations[0].triggers =
        withStableOrderingIds([trigger("A", 0, a), trigger("A", 0, x)]);
      const choice = start(restore(state), db);
      const boundary = continuationBoundary(choice, "A", 0);
      const raw = structuredClone(toPersistedGameState(choice));
      raw.effectStack.push({ ...boundary.frame, kind: "TRIGGER_DRAIN" });
      if (promptContext === "absent") raw.pendingPrompt = null;
      else raw.pendingPrompt!.resumeContext = promptContext === "frame"
        ? boundary.frame.id
        : { type: "PREGAME_PRIORITY_CHOICE" };
      expect(() => convertPersistedGameState(raw, location)).toThrow(
        "owned ordering selection must be the top frame"
      );
    }
  );

  it.each(["state", "undoHistory[0]"])(
    "maps an adjacent nested ordering selection to the nearest owner in %s",
    (location) => {
      const { state, db, trigger, a, x } = fixture();
      const outer = structuredClone(state.effectStack[0]);
      const parent = continuationBoundary(state, "A", 0);
      const withParent = pushFrame(parent.state, parent.frame);
      const boundary = continuationBoundary(withParent, "A", 0);
      const nested = pushFrame(boundary.state, {
        ...boundary.frame,
        triggerExecution: { generations: [{ triggers: withStableOrderingIds([
          trigger("A", 0, a), trigger("A", 0, x),
        ]) }] },
      });
      const choice = start(restore(nested), db);
      const loaded = convertPersistedGameState(
        structuredClone(toPersistedGameState(choice)), location
      );
      expect(loaded.effectStack[0]).toEqual({ ...outer, kind: "TRIGGER_EXECUTION" });
      expect(loaded.effectStack.at(-2)!.id).toBe(boundary.frame.id);
      const paused = answer(loaded, db, { type: "PLAYER_CHOICE", choiceId: "A:x:0" });
      expect(() => restore(paused)).not.toThrow();
    }
  );

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

  it.each([0, 1] as const)(
    "reloads a prompt inside the automatically activated final sibling for player %s",
    (activePlayerIndex) => {
      const { state, db, trigger, a, x } = fixture(true);
      state.turn.activePlayerIndex = activePlayerIndex;
      state.effectStack[0].triggerExecution!.generations[0].triggers =
        withStableOrderingIds([trigger("A", 0, a), trigger("A", 0, x)]);
      const choice = start(restore(state), db);
      const paused = answer(choice, db, {
        type: "PLAYER_CHOICE",
        choiceId: "A:x:0",
      });
      expect(paused.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      const final = answer(restore(paused), db, {
        type: "SELECT_TARGET",
        selectedInstanceIds: ["C"],
      });
      expect(final.eventLog.map((event) => event.type)).toEqual([
        "CARD_DRAWN",
        "DRAW_OUTSIDE_DRAW_PHASE",
        "CARD_PLAYED",
        "POWER_MODIFIED",
      ]);
      expect(final.effectStack).toEqual([]);
    }
  );

  it("publishes a loaded owner's pending event debt before activating its generation", () => {
    const { state, db } = fixture();
    state.effectStack[0].accumulatedEvents = [
      {
        type: "POWER_MODIFIED",
        playerIndex: 0,
        payload: { targetInstanceId: "A", amount: 1000 },
      },
    ];
    const final = start(restore(state), db);
    expect(final.eventLog.map((event) => event.type)).toEqual([
      "POWER_MODIFIED",
      "CARD_PLAYED",
      "CARD_DRAWN",
      "DRAW_OUTSIDE_DRAW_PHASE",
      "POWER_MODIFIED",
    ]);
    expect(final.effectStack).toEqual([]);
  });

  it.each(["effect", "controller", "event", "source", "snapshot", "identity"])(
    "rejects selected work with altered %s despite a matching history ID",
    (field) => {
      const { state, trigger, a, x } = fixture();
      const original = withStableOrderingIds([
        trigger("A", 0, a),
        trigger("A", 0, x),
      ]);
      const selected = structuredClone(original[0]);
      const work = state.effectStack[0].triggerExecution!;
      work.generations = [
        {
          triggers: [original[1]],
          orderingGroup: {
            triggers: original,
            resolvedTriggerIds: [original[0].orderingId!],
          },
        },
      ];
      work.selectedTrigger = selected;
      expect(() => restore(state)).not.toThrow();
      if (field === "effect") selected.effectBlock.actions = [];
      if (field === "controller") selected.controller = 1;
      if (
        field === "event" &&
        selected.triggeringEvent.type === "ATTACK_DECLARED"
      )
        selected.triggeringEvent.payload = {
          attackerInstanceId: "A",
          targetInstanceId: state.players[1].leader.instanceId,
          attackerPower: 9000,
        };
      if (field === "source") selected.sourceCardInstanceId = "X";
      if (field === "snapshot") selected.sourceSnapshot!.cardId = "X";
      if (field === "identity") selected.orderingId = "foreign";
      expect(() => restore(state)).toThrow(
        "selected trigger disagrees with its ordering history"
      );
    }
  );

  it.each([
    ["simultaneousGroup", {}],
    [
      "stateDistributionForPlay",
      {
        pendingTargetId: "A",
        remainingTargetIds: [],
        remaining: { ACTIVE: 0, RESTED: 0 },
        playedSoFar: [],
      },
    ],
    ["costTransactionState", {}],
    ["resultRefs", [["foreign", { targetInstanceIds: [], count: 0 }]]],
    ["validTargets", ["A"]],
    ["costReplacementAction", { type: "PASS" }],
    ["costReplacementChecked", false],
    ["costArrangeStage", false],
    ["namedPlayCostTargetId", "A"],
    ["remainingActionsController", 1],
    ["priorActionSucceeded", false],
    ["currentCostIndex", 1],
    ["costsPaid", false],
    ["oncePerTurnMarked", false],
    ["costResultRefs", [["foreign", { targetInstanceIds: [], count: 0 }]]],
    ["eventActivation", {}],
    ["playOverflow", {}],
    ["pregameContinuation", {}],
    ["eventActivationCompletion", {}],
    ["returnToDeckArrangement", {}],
    ["fieldToLifeTargetIds", []],
    ["giveDonIdentity", { owner: 0, recipient: "A" }],
    ["phaseBoundaryContinuation", {}],
    ["replacement", {}],
    ["replacementBatch", {}],
    ["battleDamage", {}],
    ["effectDamage", {}],
    ["triggerOrderingGroup", { triggers: [], resolvedTriggerIds: [] }],
    ["ruleTrashForPlay", { playTargetId: "A" }],
    ["batchResumeMarker", {}],
    ["remainingActions", [{ type: "DRAW", count: 1 }]],
    ["pausedAction", { type: "DRAW", count: 1 }],
    ["costs", [{ type: "REST_SELF" }]],
    ["pendingTriggers", [{}]],
    ["simultaneousTriggers", [{}]],
    ["phase", "AWAITING_TARGET_SELECTION"],
    ["effectBlock", { id: "foreign", category: "auto" }],
  ])(
    "rejects foreign continuation field %s on an execution owner",
    (field, value) => {
      const { state } = fixture();
      const raw = toPersistedGameState(state);
      Object.assign(raw.effectStack[0], { [String(field)]: value });
      expect(() => convertPersistedGameState(raw, "state")).toThrow(
        "unrelated continuation work"
      );
      expect(() => convertPersistedGameState(raw, "undoHistory[0]")).toThrow(
        "unrelated continuation work"
      );
    }
  );

  it("rejects repeated selection choices even when every payload matches a current trigger", () => {
    const { state, db, trigger, a, x } = fixture();
    state.effectStack[0].triggerExecution!.generations[0].triggers =
      withStableOrderingIds([trigger("A", 0, a), trigger("A", 0, x)]);
    const raw = toPersistedGameState(start(restore(state), db));
    const selection = raw.effectStack.at(-1)!;
    selection.simultaneousTriggers[1] = structuredClone(
      selection.simultaneousTriggers[0]
    );
    expect(() => convertPersistedGameState(raw, "state")).toThrow(
      "selection disagrees with its generation"
    );
  });

  it("requires a generation anchor for selected work", () => {
    const { state } = fixture();
    const work = state.effectStack[0].triggerExecution!;
    work.selectedTrigger = work.generations[0].triggers[0];
    work.generations = [];
    expect(() => restore(state)).toThrow(
      "selected trigger has no current generation"
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

it("fails closed instead of advancing outer triggers when a Life boundary is missing", () => {
  const { state, db } = fixture();
  const result = advanceLifeTriggerExecution(
    { state, events: [], resolved: true },
    "missing-damage",
    db,
    resolverExecutionServices
  );
  expect(result.state.engineOutcome?.type).toBe("ENGINE_ERROR_DRAW");
  expect(result.state.effectStack).toEqual([]);
  expect(result.state.eventLog.map((e) => e.type)).toEqual(["GAME_OVER"]);
});

describe("Life Trigger advancement within loaded trigger owners", () => {
  const run = (
    battle: boolean,
    prompted: boolean,
    reload: boolean,
    terminal = false
  ) => {
    const { state, db, a } = fixture(prompted);
    const lifeBlock: EffectBlock = {
      id: "life-play",
      category: "auto",
      trigger: { keyword: "TRIGGER" },
      actions: [
        structuredClone(a.actions![0]),
        terminal
          ? { type: "WIN_GAME" }
          : { type: "DRAW", params: { amount: 1 } },
      ],
    };
    db.set("LIFE-PLAY", {
      ...CARDS.TRIGGER,
      id: "LIFE-PLAY",
      name: "Life play",
      effectSchema: {
        card_id: "LIFE-PLAY",
        card_name: "Life play",
        card_type: "Character",
        effects: [lifeBlock],
      },
    });
    state.players[1].hand = [
      { ...state.players[0].hand[0], controller: 1, owner: 1 },
    ];
    state.players[0].hand = [];
    state.players[1].life = [
      { instanceId: "life-play", cardId: "LIFE-PLAY", face: "DOWN" },
      { instanceId: "life-second", cardId: CARDS.VANILLA.id, face: "DOWN" },
    ];
    let current: GameState;
    if (battle) {
      state.effectStack[0].triggerExecution!.generations[0].triggers.shift();
      state.turn.battleSubPhase = "DAMAGE_STEP";
      state.turn.battle = {
        battleId: "reader-battle",
        attackerInstanceId: "A",
        targetInstanceId: state.players[1].leader.instanceId,
        attackerPower: 5000,
        defenderPower: 5000,
        counterPowerAdded: 0,
        blockerActivated: false,
        damagesRemaining: 2,
        step: "DAMAGE_STEP",
        redirectWindow: false,
        blockerLocked: true,
        targetLocked: true,
      };
      const first = state.players[1].life.shift()!;
      current = withBattleTriggerWindow(state, first, db);
    } else {
      a.actions = [
        {
          type: "DEAL_DAMAGE",
          target: { type: "PLAYER", controller: "OPPONENT" },
          params: { amount: 2 },
        },
        { type: "DRAW", params: { amount: 1 } },
      ];
      current = start(restore(state), db);
    }
    expect(current.pendingPrompt?.options.promptType).toBe("REVEAL_TRIGGER");
    current = answer(reload ? restore(current) : current, db, {
      type: "REVEAL_TRIGGER",
      reveal: true,
    });
    if (prompted) {
      expect(current.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      expect(current.players[1].life.map((card) => card.instanceId)).toEqual([
        "life-second",
      ]);
      expect(current.pendingPrompt?.respondingPlayer).toBe(1);
      if (reload) {
        const raw = structuredClone(toPersistedGameState(current));
        expect(
          convertPersistedGameState(structuredClone(raw), "undoHistory[0]")
        ).toEqual(convertPersistedGameState(raw, "state"));
        current = restore(current);
      }
      current = answer(current, db, {
        type: "SELECT_TARGET",
        selectedInstanceIds: ["C"],
      });
    }
    if (terminal) {
      expect(current.status).toBe("FINISHED");
      expect(current.winner).toBe(1);
      expect(current.players[1].life.map((card) => card.instanceId)).toEqual([
        "life-second",
      ]);
      expect(current.eventLog.at(-1)?.type).toBe("GAME_OVER");
      expect(
        current.eventLog.filter((e) => e.type === "CARD_PLAYED")
      ).toHaveLength(1);
      expect(
        current.eventLog.some(
          (e) => e.type === "POWER_MODIFIED" || e.type === "CARD_DRAWN"
        )
      ).toBe(false);
      expect(current.effectStack).toEqual([]);
      return current;
    }
    const nextLife = current.eventLog.findIndex(
      (e) =>
        e.type === "CARD_REMOVED_FROM_LIFE" &&
        e.payload.cardInstanceId === "life-second"
    );
    const drawPositions = current.eventLog.flatMap((e, i) =>
      e.type === "CARD_DRAWN" && e.playerIndex === 1 ? [i] : []
    );
    const onPlay = current.eventLog.findIndex(
      (e) => e.type === "POWER_MODIFIED"
    );
    expect(drawPositions).toHaveLength(2); // Life suffix then older outer X.
    expect(drawPositions[0]).toBeLessThan(nextLife);
    expect(drawPositions[1]).toBeGreaterThan(nextLife);
    expect(onPlay).toBeGreaterThan(drawPositions[1]);
    expect(
      current.eventLog.filter((e) => e.type === "CARD_PLAYED")
    ).toHaveLength(1);
    expect(
      current.eventLog.filter((e) => e.type === "CARD_REMOVED_FROM_LIFE")
    ).toHaveLength(2);
    expect(current.effectStack).toEqual([]);
    expect(current.pendingPrompt).toBeNull();
    expect(() => restore(current)).not.toThrow();
    return current;
  };

  it.each(
    [false, true].flatMap((battle) =>
      [false, true].map((prompted) => ({ battle, prompted }))
    )
  )(
    "finishes own suffix before next point and defers ordinary work: %j",
    ({ battle, prompted }) => {
      const continuous = run(battle, prompted, false),
        reloaded = run(battle, prompted, true);
      expect(reloaded.eventLog).toEqual(continuous.eventLog);
      expect(reloaded.players).toEqual(continuous.players);
      expect(reloaded.turn).toEqual(continuous.turn);
    }
  );
  it.each([false, true])(
    "stops all damage and ordinary work when Life suffix terminates; battle=%s",
    (battle) => {
      const continuous = run(battle, false, false, true),
        reloaded = run(battle, false, true, true);
      expect(reloaded.eventLog).toEqual(continuous.eventLog);
      expect(reloaded.players).toEqual(continuous.players);
    }
  );
});

it.each([false, true])(
  "lifts lower legacy siblings ahead of fresh reports with existing owner=%s",
  (existingOwner) => {
    const { state, db } = fixture(true);
    const paused = start(restore(state), db);
    const owner = paused.effectStack[0];
    const oldSiblings = owner.triggerExecution!.generations[0].triggers;
    const { triggerExecution: _work, ...legacy } = owner;
    const legacyFrame = {
      ...legacy, id: "legacy-older-siblings", kind: "TRIGGER_DRAIN" as const,
      pendingTriggers: oldSiblings,
    };
    paused.effectStack = [
      legacyFrame,
      ...(existingOwner ? [{ ...owner, triggerExecution: {
        generations: [{ triggers: [] }],
      } }] : []),
      ...paused.effectStack.slice(1),
    ];
    const loaded = restore(paused);
    const final = answer(loaded, db, {
      type: "SELECT_TARGET", selectedInstanceIds: ["C"],
    });
    expect(final.eventLog.map((event) => event.type)).toEqual([
      "CARD_PLAYED", "CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE", "POWER_MODIFIED",
    ]);
    expect(final.effectStack).toEqual([]);
    expect(final.pendingPrompt).toBeNull();
  }
);
