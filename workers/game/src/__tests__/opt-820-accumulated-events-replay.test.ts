import { processRemainingTriggers } from "../engine/effect-resolver/resume.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import type { EffectStackFrame, PendingEvent } from "../types.js";
import type { Action } from "../engine/effect-types.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { withEventLogEmitted, emitEvent } from "../engine/events.js";

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import {
  OP13_079_IMU,
  OP13_080_ST_ETHANBARON_V_NUSJURO,
  OP13_082_FIVE_ELDERS,
} from "../engine/schemas/op13.js";
import {
  runPipeline,
  continuePipelineFromExecution,
} from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const imu: CardData = {
  ...CARDS.LEADER,
  id: "OP13-079",
  name: "Imu",
  effectSchema: OP13_079_IMU,
};
const elders: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-082",
  name: "Five Elders",
  power: 12000,
  types: ["Five Elders"],
  effectSchema: OP13_082_FIVE_ELDERS,
};
const nusjuro: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-080",
  name: "St. Ethanbaron V. Nusjuro",
  power: 5000,
  types: ["Five Elders"],
  effectSchema: OP13_080_ST_ETHANBARON_V_NUSJURO,
};
function card(
  cardId: string,
  instanceId: string,
  zone: CardInstance["zone"] = "CHARACTER"
): CardInstance {
  return {
    cardId,
    instanceId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    owner: 0,
    controller: 0,
  };
}
function resume(
  state: GameState,
  action: GameAction,
  db: Map<string, CardData>
) {
  const result = resumePromptLifecycle(state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(result.responseRejected).toBe(false);
  return result.state;
}
function playNusjuro() {
  const db = createTestCardDb();
  for (const data of [imu, elders, nusjuro]) db.set(data.id, data);
  let state = createBattleReadyState(db);
  state.players[0] = {
    ...state.players[0],
    leader: { ...state.players[0].leader, cardId: imu.id },
    characters: padChars([
      card(elders.id, "elders"),
      card(CARDS.VANILLA.id, "ally"),
    ]),
    trash: [
      card(nusjuro.id, "nusjuro-trash", "TRASH"),
      ...Array.from({ length: 9 }, (_, i) =>
        card(CARDS.VANILLA.id, `trash-${i}`, "TRASH")
      ),
    ],
  };
  state.players[1] = {
    ...state.players[1],
    characters: padChars([
      { ...card(CARDS.VANILLA.id, "opponent"), owner: 1, controller: 1 },
    ]),
  };
  state.players[0].hand = [card(CARDS.RUSH.id, "hand-cost", "HAND")];
  const costId = state.players[0].hand[0].instanceId;
  const costCardId = state.players[0].hand[0].cardId;
  const trashBeforeCost = state.players[0].trash.filter(
    (c) => c.cardId === costCardId
  ).length;
  const activation = runPipeline(
    state,
    {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: "elders",
      effectId: "OP13-082_activate_main",
    },
    db,
    0
  );
  expect(activation.valid).toBe(true);
  state = activation.state;
  for (let i = 0; state.pendingPrompt && i < 10; i++) {
    const options = state.pendingPrompt.options;
    if (options.promptType === "OPTIONAL_EFFECT")
      state = resume(state, { type: "PLAYER_CHOICE", choiceId: "accept" }, db);
    else if (options.promptType === "SELECT_TARGET")
      state = resume(
        state,
        {
          type: "SELECT_TARGET",
          selectedInstanceIds: options.validTargets.slice(0, options.countMax),
        },
        db
      );
    else throw new Error(`Unexpected prompt ${options.promptType}`);
  }
  expect(state.pendingPrompt).toBeNull();
  const played = state.players[0].characters.find(
    (c) => c?.cardId === nusjuro.id
  )!;
  expect(played).toBeDefined();
  expect(played.instanceId).not.toBe("nusjuro-trash");
  return { state, db, played, costId, costCardId, trashBeforeCost };
}

// Canonical OP13-082: pay hand trash first, trash all Characters, then play.
describe("OPT-820 accumulated events replay", () => {
  it("publishes the paid hand card, every trashed Character, and played Elder once in order", () => {
    const { state, played, costId, costCardId, trashBeforeCost } =
      playNusjuro();
    expect(state.effectStack).toEqual([]);
    const movements = state.eventLog.filter(
      (e) => e.type === "CARD_TRASHED" || e.type === "CARD_PLAYED"
    );
    expect(
      movements.map((e) => [
        e.type,
        "cardInstanceId" in e.payload ? e.payload.cardInstanceId : null,
      ])
    ).toEqual([
      ["CARD_TRASHED", null],
      ["CARD_TRASHED", "elders"],
      ["CARD_TRASHED", "ally"],
      ["CARD_PLAYED", played.instanceId],
    ]);
    expect(movements[0].payload).toEqual({
      count: 1,
      reason: "cost",
      from: "HAND",
    });
    expect(state.players[0].hand.some((c) => c.instanceId === costId)).toBe(
      false
    );
    // The cost card is a different fixture card from the allied Characters.
    expect(
      state.players[0].trash.filter((c) => c.cardId === costCardId)
    ).toHaveLength(trashBeforeCost + 1);
    expect(state.eventLog.filter((e) => e.type === "CARD_KO")).toEqual([]);
    expect(
      state.triggerRegistry.filter(
        (t) => t.sourceCardInstanceId === played.instanceId
      )
    ).toHaveLength(1);
    expect(
      state.activeEffects.filter(
        (e) => e.sourceCardInstanceId === played.instanceId
      )
    ).toHaveLength(1);
  });
});

const draw: Action = { type: "DRAW", params: { amount: 1 } };
const select: Action = {
  type: "MODIFY_POWER",
  target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } },
  params: { amount: 1000 },
  duration: { type: "THIS_TURN" },
};
function pendingFrame(
  state: GameState,
  events: PendingEvent[],
  actions: Action[] = []
): EffectStackFrame {
  return {
    id: "saved-continuation",
    sourceCardInstanceId: state.players[0].leader.instanceId,
    controller: 0,
    effectBlock: { id: "continuation", category: "activate", actions: [] },
    phase: "INTERRUPTED_BY_TRIGGERS",
    pausedAction: null,
    remainingActions: actions,
    resultRefs: [],
    validTargets: [],
    costs: [],
    currentCostIndex: 0,
    costsPaid: true,
    oncePerTurnMarked: true,
    costResultRefs: [],
    pendingTriggers: [],
    simultaneousTriggers: [],
    accumulatedEvents: events,
  };
}
function savedDraw(): PendingEvent {
  return {
    type: "CARD_DRAWN",
    playerIndex: 0,
    payload: { cardId: CARDS.VANILLA.id },
  };
}
function fixture() {
  const db = createTestCardDb();
  const state = createBattleReadyState(db);
  state.players[0].characters = padChars([
    card(CARDS.VANILLA.id, "target"),
    card(CARDS.VANILLA.id, "other"),
  ]);
  return { db, state };
}
function promptFrameState(
  state: GameState,
  frame: EffectStackFrame
): GameState {
  return {
    ...state,
    effectStack: [frame],
    pendingPrompt: {
      respondingPlayer: 0,
      options: {
        promptType: "PLAYER_CHOICE",
        choices: [{ id: "continue", label: "Continue" }],
        effectDescription: "Resume saved continuation",
      },
      resumeContext: frame.id,
    },
  };
}

describe("durable continuation event ownership", () => {
  it("carries events across a newly pushed second target prompt, persistence, and rejected responses", async () => {
    const { db, state } = fixture();
    const chain = executeActionChain(
      state,
      [draw, select, draw, select],
      state.players[0].leader.instanceId,
      0,
      db
    );
    let pending: GameState = {
      ...chain.state,
      pendingPrompt: chain.pendingPrompt!,
    };
    pending = resume(
      pending,
      { type: "SELECT_TARGET", selectedInstanceIds: ["target"] },
      db
    );
    expect(pending.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const storage = new MemoryStorage();
    const repository = new SessionRepository(storage, {
      nextJsUrl: "https://app.example.test",
      workerSecret: "test",
    });
    await repository.save({
      state: pending,
      cardDb: db,
      mode: "PVP",
      pregameMode: "PRIORITY_ROLL",
      testPriorityRolls: null,
      undoHistory: [],
    });
    const restored = await repository.load();
    expect(restored).not.toBeNull();
    pending = restored!.state;
    const snapshot = JSON.stringify(pending);
    const coordinator = new SessionCoordinator();
    const response: GameAction = {
      type: "SELECT_TARGET",
      selectedInstanceIds: ["target"],
      promptId: pending.pendingPrompt!.promptId,
    };
    expect(
      coordinator.routePromptResponse(pending, 0, {
        ...response,
        promptId: "stale-prompt",
      }).kind
    ).toBe("reject");
    expect(coordinator.routePromptResponse(pending, 0, response).kind).toBe(
      "resume"
    );
    expect(
      coordinator.routePromptResponse(pending, 1, {
        type: "SELECT_TARGET",
        selectedInstanceIds: ["target"],
      }).kind
    ).toBe("reject");
    const invalid = resumePromptLifecycle(
      pending,
      { type: "SELECT_TARGET", selectedInstanceIds: ["invalid"] },
      db,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(invalid.responseRejected).toBe(true);
    expect(invalid.state.eventLog).toEqual(pending.eventLog);
    expect(JSON.stringify(pending)).toBe(snapshot);
    const final = resume(pending, response, db);
    expect(coordinator.routePromptResponse(final, 0, response).kind).toBe(
      "reject"
    );
    expect(final.effectStack).toEqual([]);
    expect(final.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
      2
    );
  });
  it.each([false, true])(
    "replays interrupted events before a suffix with another prompt=%s",
    (anotherPrompt) => {
      const { db, state } = fixture();
      const event = Object.freeze(savedDraw());
      const frame = pendingFrame(state, [event], anotherPrompt ? [select] : []);
      let final = resume(
        promptFrameState(state, frame),
        { type: "PLAYER_CHOICE", choiceId: "continue" },
        db
      );
      if (anotherPrompt)
        final = resume(
          final,
          { type: "SELECT_TARGET", selectedInstanceIds: ["target"] },
          db
        );
      expect(
        final.eventLog.filter((e) => e.type === "CARD_DRAWN")
      ).toHaveLength(1);
      expect(event.propagation).toBeUndefined();
    }
  );
  it("does not replay an event whose persisted propagation already records publication", () => {
    const { db, state } = fixture();
    const event = Object.freeze(withEventLogEmitted(savedDraw()));
    const published = emitEvent(state, "CARD_DRAWN", 0, {
      cardId: CARDS.VANILLA.id,
    });
    const final = resume(
      promptFrameState(published, pendingFrame(published, [event])),
      { type: "PLAYER_CHOICE", choiceId: "continue" },
      db
    );
    expect(final.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
      1
    );
  });
  it.each([false, true])(
    "replays stored batch events, including a suffix prompt=%s",
    (anotherPrompt) => {
      const { db, state } = fixture();
      const frame = pendingFrame(
        state,
        [savedDraw()],
        anotherPrompt ? [select] : []
      );
      frame.phase = "AWAITING_BATCH_RESUME";
      frame.batchResumeMarker = {
        kind: "SET_REST",
        pausedAction: { type: "SET_REST" },
        remainingTargetIds: [],
        restedSoFar: [],
      };
      let final = resume(
        promptFrameState(state, frame),
        { type: "PLAYER_CHOICE", choiceId: "continue" },
        db
      );
      if (anotherPrompt)
        final = resume(
          final,
          { type: "SELECT_TARGET", selectedInstanceIds: ["target"] },
          db
        );
      expect(final.effectStack).toEqual([]);
      expect(
        final.eventLog.filter((e) => e.type === "CARD_DRAWN")
      ).toHaveLength(1);
    }
  );
});

describe("simultaneous target-plan continuation", () => {
  it("retains the interrupted prefix across every AND planning prompt", () => {
    const { db, state } = fixture();
    const frame = pendingFrame(
      state,
      [savedDraw()],
      [select, { ...select, chain: "AND" }]
    );
    let next = resume(
      promptFrameState(state, frame),
      { type: "PLAYER_CHOICE", choiceId: "continue" },
      db
    );
    let prompts = 0;
    while (next.pendingPrompt && prompts++ < 4) {
      next = resume(
        next,
        { type: "SELECT_TARGET", selectedInstanceIds: ["target"] },
        db
      );
    }
    expect(prompts).toBe(2);
    expect(next.effectStack).toEqual([]);
    expect(next.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
      1
    );
  });
});

class MemoryStorage implements SessionStorage {
  private values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void>;
  async put(entries: Record<string, unknown>): Promise<void>;
  async put(
    keyOrEntries: string | Record<string, unknown>,
    value?: unknown
  ): Promise<void> {
    const entries =
      typeof keyOrEntries === "string"
        ? { [keyOrEntries]: value }
        : keyOrEntries;
    for (const [key, entry] of Object.entries(entries))
      this.values.set(key, JSON.parse(JSON.stringify(entry)));
  }
  async setAlarm(): Promise<void> {}
  async deleteAlarm(): Promise<void> {}
}

it("does not publish a batch prefix again after its trigger drain already published it", () => {
  const { db, state } = fixture();
  const event = savedDraw();
  const frame = pendingFrame(state, [event]);
  frame.phase = "AWAITING_BATCH_RESUME";
  frame.batchResumeMarker = {
    kind: "SET_REST",
    pausedAction: { type: "SET_REST" },
    remainingTargetIds: [],
    restedSoFar: [],
  };
  const result = processRemainingTriggers(
    { ...state, effectStack: [frame] },
    [],
    db,
    [event]
  );
  const continued = continuePipelineFromExecution(result.state, result, db, 0);
  expect(
    continued.state.eventLog.filter((e) => e.type === "CARD_DRAWN")
  ).toHaveLength(1);
  expect(frame.accumulatedEvents[0]).toBe(event);
  expect(event.propagation).toBeUndefined();
});

it("does not consume a lower committed prefix when the child rejects a target", () => {
  const { db, state } = fixture();
  const chain = executeActionChain(
    state,
    [select],
    state.players[0].leader.instanceId,
    0,
    db
  );
  const pending: GameState = {
    ...chain.state,
    pendingPrompt: chain.pendingPrompt!,
    effectStack: [
      pendingFrame(state, [savedDraw()]),
      ...chain.state.effectStack,
    ],
  };
  const rejected = resumePromptLifecycle(
    pending,
    { type: "SELECT_TARGET", selectedInstanceIds: ["invalid"] },
    db,
    { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
  );
  expect(rejected.responseRejected).toBe(true);
  expect(rejected.state.effectStack).toEqual(pending.effectStack);
  expect(rejected.state.eventLog).toEqual(pending.eventLog);
  expect(rejected.state.players).toEqual(pending.players);
  const final = resume(
    rejected.state,
    { type: "SELECT_TARGET", selectedInstanceIds: ["target"] },
    db
  );
  expect(final.effectStack).toEqual([]);
  expect(final.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(1);
});
