import { processRemainingTriggers } from "../engine/effect-resolver/resume.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { continuePipelineFromExecution } from "../engine/pipeline.js";
import {
  SessionRepository,
  type SessionStorage,
} from "../session/persistence.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { it, expect } from "vitest";
import {
  createTestCardDb,
  createBattleReadyState,
  CARDS,
  padChars,
} from "./helpers.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { Action } from "../engine/effect-types.js";
import type { CardData, GameState, GameAction } from "../types.js";
const draw: Action = { type: "DRAW", params: { amount: 1 } };
const hooks = {
  drainPregame: (s: GameState) => s,
  advanceStartOfTurn: (s: GameState) => s,
};
function fixture() {
  const db = createTestCardDb();
  const state = createBattleReadyState(db);
  return { state, db };
}
class Memory implements SessionStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined;
  }
  async put(key: string | Record<string, unknown>, value?: unknown) {
    for (const [k, v] of Object.entries(
      typeof key === "string" ? { [key]: value } : key
    ))
      this.data.set(k, structuredClone(v));
  }
  async setAlarm() {}
  async deleteAlarm() {}
}
async function restore(state: GameState, cardDb: Map<string, CardData>) {
  const storage = new Memory();
  const config = { nextJsUrl: "https://example.test", workerSecret: "test" };
  await new SessionRepository(storage, config).save({
    state,
    cardDb,
    undoHistory: [],
    mode: "PVP",
    pregameMode: "PRIORITY_ROLL",
    testPriorityRolls: null,
  });
  const loaded = await new SessionRepository(storage, config).load();
  expect(loaded).not.toBeNull();
  return loaded!.state;
}
it.each([
  [false, false, true],
  [true, false, true],
  [false, true, false],
  [false, true, true],
  [true, true, false],
  [true, true, true],
])(
  "replacement prefix preserves publication and scan obligations (optional=%s, siblings=%s, pay=%s)",
  async (optional, siblings, pay) => {
    const { state, db } = fixture();
    const watcher: CardData = {
      ...CARDS.LEADER,
      id: "DRAW-WATCHER",
      name: "Draw Watcher",
      effectSchema: {
        card_id: "DRAW-WATCHER",
        effects: [
          {
            id: "observe-draw",
            category: "auto",
            trigger: {
              event: "DRAW_OUTSIDE_DRAW_PHASE",
              filter: { controller: "SELF" },
            },
            actions: [
              {
                type: "MODIFY_POWER",
                target: { type: "SELF" },
                params: { amount: 1000 },
                duration: { type: "THIS_TURN" },
              },
            ],
          },
        ],
      },
    };
    db.set(watcher.id, watcher);
    state.players[0].leader = {
      ...state.players[0].leader,
      cardId: watcher.id,
    };
    state.triggerRegistry = registerTriggersForCard(
      state,
      state.players[0].leader,
      watcher
    ).triggerRegistry;
    const target = state.players[1].characters.find(Boolean)!;
    state.players[1].characters = padChars([target]);
    const playedCard: CardData = {
      ...CARDS.VANILLA,
      id: "REVIEW-COST",
      name: "Review Cost",
      effectSchema: {
        card_id: "REVIEW-COST",
        effects: Array.from({ length: siblings ? 2 : 1 }, (_, index) => ({
          id: `on-play-cost-${index}`,
          category: "auto" as const,
          trigger: { keyword: "ON_PLAY" as const },
          flags: { optional: siblings },
          costs: [{ type: "TRASH_FROM_HAND" as const, amount: 1 }],
          actions: [draw],
        })),
      },
    };
    db.set(playedCard.id, playedCard);
    state.players[1].hand = [
      { ...state.players[1].hand[0], cardId: playedCard.id },
      ...state.players[1].hand.slice(1),
    ];
    state.activeEffects = [
      {
        id: "replacement",
        sourceCardInstanceId: target.instanceId,
        sourceEffectBlockId: "replacement",
        category: "replacement",
        modifiers: [
          {
            type: "REPLACEMENT_EFFECT",
            params: {
              trigger: "WOULD_BE_KO",
              cause_filter: { by: "ANY" },
              target_filter: null,
              replacement_actions: [
                {
                  type: "PLAY_CARD",
                  target: {
                    type: "CHARACTER_CARD",
                    source_zone: "HAND",
                    controller: "SELF",
                    count: { exact: 1 },
                    filter: { name: "Review Cost" },
                  },
                },
              ],
              optional,
              once_per_turn: false,
            },
          },
        ],
        duration: { type: "PERMANENT" },
        expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
        controller: 1,
        appliesTo: [target.instanceId],
        timestamp: 1,
      },
    ];
    const result = resolveEffect(
      state,
      {
        id: "outer",
        category: "auto",
        actions: [
          draw,
          {
            type: "KO",
            target: {
              type: "CHARACTER",
              controller: "OPPONENT",
              count: { exact: 1 },
            },
          },
          draw,
        ],
      },
      state.players[0].leader.instanceId,
      0,
      db
    );
    let next: GameState = {
      ...result.state,
      pendingPrompt: result.pendingPrompt!,
    };
    let prompts = 0;
    for (let i = 0; next.pendingPrompt && i < 24; i++) {
      prompts++;
      next = await restore(next, db);
      const p = next.pendingPrompt!.options;
      const action: GameAction =
        p.promptType === "SELECT_TARGET"
          ? {
              type: "SELECT_TARGET",
              selectedInstanceIds: p.validTargets.slice(0, p.countMax),
            }
          : {
              type: "PLAYER_CHOICE",
              choiceId:
                !pay &&
                p.promptType === "OPTIONAL_EFFECT" &&
                next.effectStack
                  .at(-1)
                  ?.effectBlock.id.startsWith("on-play-cost")
                  ? "skip"
                  : p.promptType === "PLAYER_CHOICE"
                    ? p.choices.find((choice) => choice.id !== "decline")!.id
                    : "accept",
            };
      if (p.promptType === "SELECT_TARGET") {
        const before = JSON.stringify(next);
        const rejected = resumePromptLifecycle(
          next,
          { type: "SELECT_TARGET", selectedInstanceIds: ["invalid"] },
          db,
          hooks
        );
        expect(rejected.responseRejected).toBe(true);
        expect(JSON.stringify(rejected.state)).toBe(before);
      }
      action.promptId = next.pendingPrompt!.promptId;
      const coordinator = new SessionCoordinator();
      const before = JSON.stringify(next);
      const owner = next.pendingPrompt!.respondingPlayer;
      expect(
        coordinator.routePromptResponse(next, owner === 0 ? 1 : 0, action).kind
      ).toBe("reject");
      expect(
        coordinator.routePromptResponse(next, owner, {
          ...action,
          promptId: "stale",
        }).kind
      ).toBe("reject");
      expect(JSON.stringify(next)).toBe(before);
      expect(coordinator.routePromptResponse(next, owner, action).kind).toBe(
        "resume"
      );
      const resumed = resumePromptLifecycle(next, action, db, hooks);
      expect(resumed.responseRejected).toBe(false);
      expect(JSON.stringify(next)).toBe(before);
      // Production persists the next prompt (assigning its id) before accepting
      // another response. A raw resolver result has no prompt id yet.
      next = await restore(resumed.state, db);
      expect(coordinator.routePromptResponse(next, owner, action).kind).toBe(
        "reject"
      );
    }
    expect(
      next.eventLog.filter((event) => event.type === "POWER_MODIFIED")
    ).toHaveLength(2);
    expect(getEffectivePower(next.players[0].leader, watcher, next, db)).toBe(
      watcher.power! + 2000
    );
    expect(prompts).toBeGreaterThan(0);
    expect(next.pendingPrompt).toBeNull();
    expect(next.effectStack).toEqual([]);
    expect(
      next.eventLog
        .filter((e) =>
          ["CARD_DRAWN", "CARD_PLAYED", "CARD_TRASHED"].includes(e.type)
        )
        .map((e) => [e.type, e.playerIndex])
    ).toEqual([
      ["CARD_DRAWN", 0],
      ["CARD_PLAYED", 1],
      ...(pay
        ? [
            ["CARD_TRASHED", 1],
            ["CARD_DRAWN", 1],
          ]
        : []),
      ...(siblings && pay
        ? [
            ["CARD_TRASHED", 1],
            ["CARD_DRAWN", 1],
          ]
        : []),
      ["CARD_DRAWN", 0],
    ]);
  }
);

it.each(["and", "resource"] as const)(
  "initial DRAW prefix survives %s recursive prompt after repository restore",
  async (kind) => {
    const { state, db } = fixture();
    const source = state.players[0].leader.instanceId;
    const character = state.players[0].characters.find(Boolean)!;
    state.players[0].characters = padChars([
      character,
      { ...character, instanceId: "second-target" },
    ]);
    const select: Action = {
      type: "MODIFY_POWER",
      target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } },
      params: { amount: 1000 },
      duration: { type: "THIS_TURN" },
    };
    const actions: Action[] =
      kind === "and"
        ? [draw, select, { ...select, chain: "AND" }, draw]
        : [
            draw,
            { type: "ADD_DON_FROM_DECK", params: { amount: 1, up_to: true } },
            select,
            draw,
          ];
    const first = executeActionChain(state, actions, source, 0, db);
    let next: GameState = {
      ...first.state,
      pendingPrompt: first.pendingPrompt!,
    };
    let prompts = 0;
    while (next.pendingPrompt && prompts++ < 10) {
      next = await restore(next, db);
      const p = next.pendingPrompt!.options;
      const action: GameAction =
        p.promptType === "SELECT_TARGET"
          ? {
              type: "SELECT_TARGET",
              selectedInstanceIds: p.validTargets.slice(0, p.countMax),
            }
          : { type: "PLAYER_CHOICE", choiceId: "choose-value:0" };
      next = resumePromptLifecycle(next, action, db, hooks).state;
    }
    expect(prompts).toBeGreaterThan(0);
    expect(next.pendingPrompt).toBeNull();
    expect(next.effectStack).toEqual([]);
    expect(next.eventLog.filter((e) => e.type === "CARD_DRAWN")).toHaveLength(
      2
    );
  }
);

it.each([false, true])(
  "terminal replacement draw keeps publication order (optional=%s)",
  (optional) => {
    const { state, db } = fixture();
    const target = state.players[1].characters.find(Boolean)!;
    state.players[1].characters = padChars([target]);
    state.activeEffects = [
      {
        id: "draw-replacement",
        sourceCardInstanceId: target.instanceId,
        sourceEffectBlockId: "draw-replacement",
        category: "replacement",
        modifiers: [
          {
            type: "REPLACEMENT_EFFECT",
            params: {
              trigger: "WOULD_BE_KO",
              cause_filter: { by: "ANY" },
              target_filter: null,
              replacement_actions: [draw],
              optional,
              once_per_turn: false,
            },
          },
        ],
        duration: { type: "PERMANENT" },
        expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
        controller: 1,
        appliesTo: [target.instanceId],
        timestamp: 1,
      },
    ];
    const result = resolveEffect(
      state,
      {
        id: "outer-draw",
        category: "auto",
        actions: [
          draw,
          {
            type: "KO",
            target: {
              type: "CHARACTER",
              controller: "OPPONENT",
              count: { exact: 1 },
            },
          },
          draw,
        ],
      },
      state.players[0].leader.instanceId,
      0,
      db
    );
    let next: GameState = {
      ...result.state,
      pendingPrompt: result.pendingPrompt ?? null,
    };
    if (!optional) {
      // Prefix propagation does not eagerly publish when no nested drain exists.
      expect(next.pendingPrompt).toBeNull();
      expect(next.eventLog).toEqual(state.eventLog);
      next = continuePipelineFromExecution(
        next,
        { state: next, events: result.events },
        db,
        0
      ).state;
    }
    for (let i = 0; next.pendingPrompt && i < 5; i++) {
      const p = next.pendingPrompt.options;
      const action: GameAction =
        p.promptType === "SELECT_TARGET"
          ? { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] }
          : { type: "PLAYER_CHOICE", choiceId: "accept" };
      next = resumePromptLifecycle(next, action, db, hooks).state;
    }
    expect(next.pendingPrompt).toBeNull();
    expect(next.effectStack).toEqual([]);
    expect(
      next.eventLog
        .filter((e) => e.type === "CARD_DRAWN")
        .map((e) => e.playerIndex)
    ).toEqual([0, 1, 0]);
  }
);
it("two-level replacement plays publish outer and both On Play prefixes once", () => {
  const { state, db } = fixture();
  const target = state.players[1].characters.find(Boolean)!;
  state.players[1].characters = padChars([target]);
  const playedCard: CardData = {
    ...CARDS.VANILLA,
    id: "REVIEW-COST",
    name: "Review Cost",
    effectSchema: {
      card_id: "REVIEW-COST",
      effects: [
        {
          id: "on-play-cost",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [
            draw,
            {
              type: "PLAY_CARD",
              target: {
                type: "CHARACTER_CARD",
                source_zone: "HAND",
                controller: "SELF",
                count: { exact: 1 },
                filter: { name: "Second Child" },
              },
            },
          ],
        },
      ],
    },
  };
  db.set(playedCard.id, playedCard);
  state.players[1].hand = [
    { ...state.players[1].hand[0], cardId: playedCard.id },
    ...state.players[1].hand.slice(1),
  ];
  const second: CardData = {
    ...CARDS.VANILLA,
    id: "SECOND-CHILD",
    name: "Second Child",
    effectSchema: {
      card_id: "SECOND-CHILD",
      effects: [
        {
          id: "second-onplay",
          category: "auto",
          trigger: { keyword: "ON_PLAY" },
          actions: [draw],
        },
      ],
    },
  };
  db.set(second.id, second);
  state.players[1].hand[1] = { ...state.players[1].hand[1], cardId: second.id };
  state.activeEffects = [
    {
      id: "replacement",
      sourceCardInstanceId: target.instanceId,
      sourceEffectBlockId: "replacement",
      category: "replacement",
      modifiers: [
        {
          type: "REPLACEMENT_EFFECT",
          params: {
            trigger: "WOULD_BE_KO",
            cause_filter: { by: "ANY" },
            target_filter: null,
            replacement_actions: [
              {
                type: "PLAY_CARD",
                target: {
                  type: "CHARACTER_CARD",
                  source_zone: "HAND",
                  controller: "SELF",
                  count: { exact: 1 },
                  filter: { name: "Review Cost" },
                },
              },
            ],
            optional: false,
            once_per_turn: false,
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 1,
      appliesTo: [target.instanceId],
      timestamp: 1,
    },
  ];
  const result = resolveEffect(
    state,
    {
      id: "outer",
      category: "auto",
      actions: [
        draw,
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 1 },
          },
        },
        draw,
      ],
    },
    state.players[0].leader.instanceId,
    0,
    db
  );
  expect(result.pendingPrompt).toBeUndefined();
  const next = continuePipelineFromExecution(result.state, result, db, 0).state;
  expect(next.pendingPrompt).toBeNull();
  expect(next.effectStack).toEqual([]);
  expect(
    next.eventLog
      .filter((e) =>
        ["CARD_DRAWN", "CARD_PLAYED", "CARD_TRASHED"].includes(e.type)
      )
      .map((e) => [e.type, e.playerIndex])
  ).toEqual([
    ["CARD_DRAWN", 0],
    ["CARD_PLAYED", 1],
    ["CARD_DRAWN", 1],
    ["CARD_PLAYED", 1],
    ["CARD_DRAWN", 1],
    ["CARD_DRAWN", 0],
  ]);
});

it.each([false, true])(
  "an event-only owner survives a child cost prompt (pay=%s)",
  async (pay) => {
    const { state, db } = fixture();
    const watcher: CardData = {
      ...CARDS.LEADER,
      id: "DRAIN-WATCHER",
      name: "Drain Watcher",
      effectSchema: {
        card_id: "DRAIN-WATCHER",
        effects: [
          {
            id: "drain-watch",
            category: "auto",
            trigger: {
              event: "DRAW_OUTSIDE_DRAW_PHASE",
              filter: { controller: "SELF" },
            },
            actions: [
              {
                type: "MODIFY_POWER",
                target: { type: "SELF" },
                params: { amount: 1000 },
                duration: { type: "THIS_TURN" },
              },
            ],
          },
        ],
      },
    };
    db.set(watcher.id, watcher);
    state.players[0].leader = {
      ...state.players[0].leader,
      cardId: watcher.id,
    };
    state.triggerRegistry = registerTriggersForCard(
      state,
      state.players[0].leader,
      watcher
    ).triggerRegistry;
    const prefix = executeActionChain(
      state,
      [draw],
      state.players[0].leader.instanceId,
      0,
      db
    );
    // Enter the real trigger-drain API with an earlier committed event and a
    // child that pauses. No stack frame is fabricated by this fixture.
    const drained = processRemainingTriggers(
      prefix.state,
      [
        {
          sourceCardInstanceId: state.players[1].leader.instanceId,
          triggeringEvent: prefix.events.find(
            (event) => event.type === "DRAW_OUTSIDE_DRAW_PHASE"
          )!,
          controller: 1,
          effectBlock: {
            id: "child-cost",
            category: "auto",
            flags: { optional: true },
            costs: [
              { type: "REST_DON", amount: 1 },
              { type: "TRASH_FROM_HAND", amount: 1 },
            ],
            actions: [draw],
          },
        },
      ],
      db,
      prefix.events
    );
    let next: GameState = {
      ...drained.state,
      pendingPrompt: drained.pendingPrompt!,
    };
    expect(
      next.effectStack.some(
        (frame) =>
          frame.phase === "INTERRUPTED_BY_TRIGGERS" &&
          frame.remainingActions.length === 0
      )
    ).toBe(true);
    let prompts = 0;
    while (next.pendingPrompt && prompts++ < 8) {
      next = await restore(next, db);
      const p = next.pendingPrompt!.options;
      const costFrame = next.effectStack.find(
        (frame) => frame.phase === "AWAITING_COST_SELECTION"
      );
      if (costFrame) {
        expect(
          costFrame.accumulatedEvents.some(
            (event) =>
              event.type === "CARD_DRAWN" ||
              event.type === "DRAW_OUTSIDE_DRAW_PHASE"
          )
        ).toBe(false);
        expect(
          next.eventLog.some(
            (event) =>
              event.type === "DON_RESTED" || event.type === "CARD_TRASHED"
          )
        ).toBe(false);
      }
      const action: GameAction =
        p.promptType === "SELECT_TARGET"
          ? {
              type: "SELECT_TARGET",
              selectedInstanceIds: p.validTargets.slice(0, p.countMax),
            }
          : { type: "PLAYER_CHOICE", choiceId: pay ? "accept" : "skip" };
      const resumed = resumePromptLifecycle(next, action, db, hooks);
      expect(resumed.responseRejected).toBe(false);
      next = resumed.state;
    }
    expect(next.pendingPrompt).toBeNull();
    expect(next.effectStack).toEqual([]);
    expect(
      next.eventLog
        .filter((event) => event.type === "CARD_DRAWN")
        .map((event) => event.playerIndex)
    ).toEqual(pay ? [0, 1] : [0]);
    expect(
      next.eventLog.filter((event) => event.type === "POWER_MODIFIED")
    ).toHaveLength(1);
    expect(getEffectivePower(next.players[0].leader, watcher, next, db)).toBe(
      watcher.power! + 1000
    );
    expect(
      next.eventLog.filter((event) => event.type === "CARD_TRASHED")
    ).toHaveLength(pay ? 1 : 0);
  }
);

it("an event-only owner excludes events already owned by its prompted child", async () => {
  const { state, db } = fixture();
  const target = state.players[1].characters.find(Boolean)!;
  state.players[1].characters = padChars([
    target,
    { ...target, instanceId: "second-child-target" },
  ]);
  const prefix = executeActionChain(
    state,
    [draw],
    state.players[0].leader.instanceId,
    0,
    db
  );
  const drained = processRemainingTriggers(
    prefix.state,
    [
      {
        sourceCardInstanceId: state.players[1].leader.instanceId,
        controller: 1,
        triggeringEvent: prefix.events[0],
        effectBlock: {
          id: "child-with-prefix",
          category: "auto",
          actions: [
            draw,
            {
              type: "MODIFY_POWER",
              target: {
                type: "CHARACTER",
                controller: "SELF",
                count: { exact: 1 },
              },
              params: { amount: 1000 },
              duration: { type: "THIS_TURN" },
            },
          ],
        },
      },
    ],
    db,
    prefix.events
  );
  let next = await restore(
    { ...drained.state, pendingPrompt: drained.pendingPrompt! },
    db
  );
  expect(
    next.effectStack
      .flatMap((frame) => frame.accumulatedEvents)
      .filter((event) => event.type === "CARD_DRAWN" && event.playerIndex === 1)
  ).toHaveLength(1);
  next = resumePromptLifecycle(
    next,
    { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] },
    db,
    hooks
  ).state;
  expect(next.pendingPrompt).toBeNull();
  expect(next.effectStack).toEqual([]);
  expect(
    next.eventLog
      .filter((event) => event.type === "CARD_DRAWN")
      .map((event) => event.playerIndex)
  ).toEqual([0, 1]);
});
