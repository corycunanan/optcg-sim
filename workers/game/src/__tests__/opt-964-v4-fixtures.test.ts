/** Synthetic future v4 fixtures exercised through the production session parser. */
import { describe, expect, it } from "vitest";
import {
  parseStoredSession,
  convertPersistedGameState,
} from "../session/persistence.js";
import {
  frameKindOf,
  toPersistedGameState,
} from "../session/game-state-schema.js";
import { CONTINUATION_EFFECT_BLOCK } from "../engine/effect-stack.js";
import { goldenV2Raw } from "./fixtures/opt-963-v3-states.js";
import type { GameState, CardInstance } from "../types.js";
import {
  CARDS,
  createTestPayload,
  createTestCardDb,
  createBattleReadyState,
  padChars,
} from "./helpers.js";
import { prepareDecksAndLeaders } from "../engine/setup.js";
import { advancePregame, startPregame } from "../engine/pregame.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
// Intentional mutable JSON allows malformed fixtures outside runtime v3 types.
type Json = Record<string, any>;
function future(runtime?: GameState): Json {
  const state =
    runtime ??
    convertPersistedGameState(goldenV2Raw("battle-ready-with-undo"), "state");
  const raw = JSON.parse(JSON.stringify(toPersistedGameState(state)));
  raw.schemaVersion = 4;
  raw.effectStack.forEach((f: Json) => {
    f.kind = frameKindOf(f as any);
  });
  if (raw.turn.battle)
    Object.assign(raw.turn.battle, {
      step: raw.turn.battleSubPhase,
      redirectWindow: false,
      blockerLocked: !!raw.turn.battle.blockerActivated,
      targetLocked: false,
    });
  return raw;
}
function frame(id = "v4-owner"): Json {
  return {
    id,
    kind: "TRIGGER_DRAIN",
    sourceCardInstanceId: "v4-source",
    controller: 0,
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
function event(zone = "HAND"): Json {
  return {
    type:
      zone === "HAND"
        ? "EVENT_ACTIVATED_FROM_HAND"
        : "EVENT_MAIN_RESOLVED_FROM_TRASH",
    playerIndex: 0,
    payload: { cardInstanceId: "v4-source" },
  };
}
function activation(publication = "AFTER_STACK", sourceZone = "HAND"): Json {
  const raw = future();
  raw.effectStack = [
    {
      ...frame(),
      kind: "EVENT_ACTIVATION",
      eventActivation: {
        publication,
        sourceZone,
        sourceClass: "EVENT",
        events: [event(sourceZone)],
      },
    },
  ];
  raw.pendingPrompt = null;
  return raw;
}
function overflow(): Json {
  const raw = future();
  raw.effectStack = [
    {
      ...frame(),
      kind: "PLAY_OVERFLOW",
      phase: "AWAITING_TARGET_SELECTION",
      pausedAction: {
        type: "PLAY_CARD",
        target: {
          type: "CHARACTER_CARD",
          source_zone: "HAND",
          count: { exact: 1 },
        },
        params: { source_zone: "HAND", cost_override: "FREE" },
      },
      playOverflow: {
        playTargetId: "v4-target",
        batch: {
          remainingTargetIds: [],
          remaining: { ACTIVE: 1, RESTED: 0 },
          playedSoFar: [],
        },
      },
    },
  ];
  raw.pendingPrompt = {
    resumeContext: "v4-owner",
    respondingPlayer: 0,
    options: {
      promptType: "SELECT_TARGET",
      cards: [],
      validTargets: [],
      countMin: 0,
      countMax: 1,
      effectDescription: "Choose Character",
      ctaLabel: "Confirm",
    },
  };
  return raw;
}
function pregame(): Json {
  const raw = overflow();
  raw.effectStack[0] = {
    ...frame("v4-child"),
    kind: "EFFECT",
    phase: "AWAITING_TARGET_SELECTION",
  };
  raw.pendingPrompt.resumeContext = "v4-child";
  raw.pregame = {
    phase: "START_OF_GAME_FX",
    priorityRolls: null,
    priorityDeciderIndex: null,
    firstPlayerIndex: 0,
    mulliganDecisions: [null, null],
    startOfGameEffectsResolved: [true, false],
  };
  raw.effectStack[0].sourceCardInstanceId = raw.players[0].leader.instanceId;
  raw.effectStack.unshift({
    ...frame(),
    sourceCardInstanceId: raw.players[0].leader.instanceId,
    kind: "PREGAME",
    pregameContinuation: {
      phase: "START_OF_GAME_FX",
      effectFrameId: "v4-child",
      controller: 0,
    },
  });
  return raw;
}
const locations = ["state", "undoHistory[0]"] as const;
function read(raw: Json, location: (typeof locations)[number]) {
  const parsed = parseStoredSession({
    state: location === "state" ? raw : future(),
    undoHistory: location === "state" ? [] : [raw],
    cardDb: {},
  });
  return location === "state" ? parsed.state : parsed.undoHistory[0];
}
const kinds = [
  ["AFTER_STACK", () => activation()],
  ["AFTER_EFFECT HAND", () => activation("AFTER_EFFECT")],
  ["AFTER_EFFECT TRASH", () => activation("AFTER_EFFECT", "TRASH")],
  ["PLAY_OVERFLOW", overflow],
  ["PREGAME", pregame],
] as const;
describe.each(locations)("OPT-964 session fixtures %s", (location) => {
  it.each(kinds)("lowers %s and writes v3", (_name, build) => {
    const raw = build(),
      loaded = read(raw, location);
    expect((toPersistedGameState(loaded) as any).schemaVersion).toBe(3);
    if (raw.effectStack[0].playOverflow)
      expect(loaded.effectStack[0].ruleTrashForPlay).toEqual(
        raw.effectStack[0].playOverflow
      );
    if (raw.effectStack[0].eventActivation?.publication === "AFTER_EFFECT")
      expect(loaded.effectStack[0].eventActivationCompletion).toEqual(
        raw.effectStack[0].eventActivation.events[0]
      );
    if (raw.effectStack[0].eventActivation?.publication === "AFTER_STACK")
      expect(loaded.pendingEventActivationEvents).toEqual(
        raw.effectStack[0].eventActivation.events
      );
    if (raw.effectStack[0].pregameContinuation)
      expect(loaded.effectStack.map((f) => f.id)).toEqual(["v4-child"]);
  });
  it.each(kinds)(
    "rejects missing kind/unknown frame field on %s",
    (_name, build) => {
      for (const mutate of [
        (f: Json) => {
          delete f.kind;
        },
        (f: Json) => {
          f.unknown = true;
        },
      ]) {
        const raw = build();
        mutate(raw.effectStack[0]);
        expect(() => read(raw, location)).toThrow();
      }
    }
  );
  const invalid: [string, () => Json, (r: Json) => void][] = [
    [
      "activation owner extra",
      activation,
      (r) => {
        r.effectStack[0].eventActivation.extra = true;
      },
    ],
    [
      "activation identity",
      activation,
      (r) => {
        r.effectStack[0].eventActivation.events[0].payload.cardInstanceId =
          "wrong";
      },
    ],
    [
      "activation controller",
      activation,
      (r) => {
        r.effectStack[0].eventActivation.events[0].playerIndex = 1;
      },
    ],
    [
      "activation zone",
      activation,
      (r) => {
        r.effectStack[0].eventActivation.sourceZone = "TRASH";
      },
    ],
    [
      "activation empty",
      activation,
      (r) => {
        r.effectStack[0].eventActivation.events = [];
      },
    ],
    [
      "activation duplicate",
      activation,
      (r) => {
        r.effectStack[0].eventActivation.events.push(event());
      },
    ],
    [
      "activation not bottom",
      activation,
      (r) => {
        r.effectStack.unshift(frame("below"));
      },
    ],
    [
      "activation prompt owner",
      activation,
      (r) => {
        r.pendingPrompt = overflow().pendingPrompt;
      },
    ],
    [
      "boundary unpaid",
      activation,
      (r) => {
        r.effectStack[0].costsPaid = false;
      },
    ],
    [
      "boundary unmarked",
      activation,
      (r) => {
        r.effectStack[0].oncePerTurnMarked = false;
      },
    ],
    [
      "boundary executable block",
      activation,
      (r) => {
        r.effectStack[0].effectBlock = {
          id: "real",
          category: "auto",
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        };
      },
    ],
    [
      "overflow owner extra",
      overflow,
      (r) => {
        r.effectStack[0].playOverflow.extra = true;
      },
    ],
    [
      "overflow prompt owner",
      overflow,
      (r) => {
        r.pendingPrompt.resumeContext = "missing";
      },
    ],
    [
      "overflow prompt controller",
      overflow,
      (r) => {
        r.pendingPrompt.respondingPlayer = 1;
      },
    ],
    [
      "overflow absent prompt",
      overflow,
      (r) => {
        r.pendingPrompt = null;
      },
    ],
    [
      "pregame owner extra",
      pregame,
      (r) => {
        r.effectStack[0].pregameContinuation.extra = true;
      },
    ],
    [
      "pregame child",
      pregame,
      (r) => {
        r.effectStack[0].pregameContinuation.effectFrameId = "absent";
      },
    ],
    [
      "pregame controller",
      pregame,
      (r) => {
        r.effectStack[0].pregameContinuation.controller = 1;
      },
    ],
    [
      "pregame ledger",
      pregame,
      (r) => {
        r.pregame.startOfGameEffectsResolved[0] = false;
      },
    ],
    [
      "pregame prompt owner",
      pregame,
      (r) => {
        r.pendingPrompt.resumeContext = "v4-owner";
      },
    ],
  ];
  it.each(invalid)("rejects %s", (_name, build, mutate) => {
    const raw = build();
    mutate(raw);
    expect(() => read(raw, location)).toThrow();
  });
  it("rejects a removed wrapper sharing its ID with a nonprompted frame", () => {
    const raw = activation();
    raw.effectStack.push(frame(raw.effectStack[0].id));
    expect(raw.pendingPrompt).toBeNull();
    expect(() => read(raw, location)).toThrow(/duplicate frame id/);
  });
  it("preserves AFTER_STACK prefixes in order and rejects AFTER_EFFECT prefixes", () => {
    const raw = activation();
    const prefix = {
      type: "CARD_REMOVED_FROM_LIFE",
      playerIndex: 0,
      payload: { cardInstanceId: "prefix" },
    };
    raw.effectStack[0].eventActivation.events.unshift(prefix);
    expect(read(raw, location).pendingEventActivationEvents).toEqual([
      prefix,
      event(),
    ]);
    raw.effectStack[0].eventActivation.publication = "AFTER_EFFECT";
    expect(() => read(raw, location)).toThrow();
  });
  it("rejects continuation owner mixing and unknown nested overflow capacity", () => {
    const raw = overflow();
    raw.effectStack[0].eventActivation =
      activation().effectStack[0].eventActivation;
    expect(() => read(raw, location)).toThrow();
    delete raw.effectStack[0].eventActivation;
    raw.effectStack[0].playOverflow.batch.remaining.UNKNOWN = 1;
    expect(() => read(raw, location)).toThrow();
  });
  it("preserves strict ledgers and scheduled action target bindings", () => {
    const raw = future();
    Object.assign(raw.turn, {
      oncePerTurnUsed: { source: ["effect"] },
      triggerStagingInstanceIds: ["staged"],
      deckHitZeroThisTurn: [true, false],
    });
    raw.scheduledActions = [
      {
        id: "scheduled",
        timing: "END_OF_THIS_TURN",
        action: { type: "KO", target_ref: "chosen" },
        boundToInstanceId: "bound",
        sourceEffectId: "effect",
        controller: 0,
      },
    ];
    const loaded = read(raw, location);
    expect(loaded.scheduledActions).toEqual(raw.scheduledActions);
    for (const key of [
      "oncePerTurnUsed",
      "triggerStagingInstanceIds",
      "deckHitZeroThisTurn",
    ])
      expect((loaded.turn as any)[key]).toEqual(raw.turn[key]);
    for (const [key, value] of [
      ["oncePerTurnUsed", { source: [1] }],
      ["triggerStagingInstanceIds", [1]],
      ["deckHitZeroThisTurn", [false]],
      ["unknownLedger", []],
    ]) {
      const bad = structuredClone(raw);
      bad.turn[key as string] = value;
      expect(() => read(bad, location)).toThrow();
    }
    const bad = structuredClone(raw);
    delete bad.scheduledActions[0].boundToInstanceId;
    expect(() => read(bad, location)).toThrow();
  });
});
function queued(owner: string): { raw: Json; queued: Json } {
  const raw = owner === "overflow.batch" ? overflow() : future();
  if (owner !== "overflow.batch") {
    raw.effectStack = [frame()];
    raw.pendingPrompt = null;
  }
  const queued = {
    orderingId: "ordered-trigger",
    sourceCardInstanceId: "v4-source",
    controller: 0,
    effectBlock: { id: "trigger-effect", category: "auto", actions: [] },
    triggeringEvent: event(),
    sourceSnapshot: {
      instanceId: "v4-source",
      cardId: CARDS.LEADER.id,
      controller: 0,
      effectBlockId: "trigger-effect",
    },
  };
  const f = raw.effectStack[0];
  if (owner === "triggerOrderingGroup")
    f.triggerOrderingGroup = { triggers: [queued], resolvedTriggerIds: [] };
  else if (owner === "overflow.batch")
    f.playOverflow.batch.queuedTriggers = [queued];
  else if (owner === "stateDistributionForPlay")
    f.stateDistributionForPlay = {
      pendingTargetId: "pending",
      remainingTargetIds: [],
      remaining: { ACTIVE: 0, RESTED: 0 },
      playedSoFar: [],
      queuedTriggers: [queued],
    };
  else f[owner] = [queued];
  return { raw, queued };
}
const queues = [
  "pendingTriggers",
  "simultaneousTriggers",
  "triggerOrderingGroup",
  "overflow.batch",
  "stateDistributionForPlay",
];
describe.each(locations)("OPT-964 snapshot matrix %s", (location) => {
  it.each(queues)("lowers optional identity snapshot in %s", (owner) => {
    const { raw, queued: q } = queued(owner);
    expect(JSON.stringify(read(raw, location))).not.toContain("sourceSnapshot");
    delete q.sourceSnapshot;
    expect(() => read(raw, location)).not.toThrow();
  });
  for (const [field, value] of [
    ["instanceId", "wrong"],
    ["controller", 1],
    ["effectBlockId", "wrong"],
    ["extra", true],
    ["cardId", 23],
    ["power", 5000],
    ["attachedDon", []],
  ] as const)
    it.each(queues)(
      `rejects snapshot ${field} mismatch/shape in %s`,
      (owner) => {
        const { raw, queued: q } = queued(owner);
        q.sourceSnapshot[field] = value;
        expect(() => read(raw, location)).toThrow();
      }
    );
  it.each(queues)(
    "rejects unknown queued owner field and missing snapshot identity in %s",
    (owner) => {
      const first = queued(owner);
      first.queued.unknown = true;
      expect(() => read(first.raw, location)).toThrow();
      for (const key of [
        "instanceId",
        "cardId",
        "controller",
        "effectBlockId",
      ]) {
        const next = queued(owner);
        delete next.queued.sourceSnapshot[key];
        expect(() => read(next.raw, location)).toThrow();
      }
    }
  );
  it("requires battle bookkeeping, mirrored step, and activated blocker lock", () => {
    const raw = future(
      convertPersistedGameState(goldenV2Raw("battle-trigger-window"), "state")
    );
    expect(() => read(raw, location)).not.toThrow();
    for (const field of [
      "step",
      "redirectWindow",
      "blockerLocked",
      "targetLocked",
    ]) {
      const bad = structuredClone(raw);
      delete bad.turn.battle[field];
      expect(() => read(bad, location)).toThrow();
    }
    const wrongStep = structuredClone(raw);
    wrongStep.turn.battle.step = "ATTACK_STEP";
    expect(() => read(wrongStep, location)).toThrow();
    const unlocked = structuredClone(raw);
    unlocked.turn.battle.blockerActivated = true;
    unlocked.turn.battle.blockerLocked = false;
    expect(() => read(unlocked, location)).toThrow();
  });
});
it("reloads real Imu pregame live/undo and resumes into opening hands", () => {
  const payload = createTestPayload();
  payload.pregameMode = "HOST_FIRST";
  const imu = {
    ...CARDS.LEADER,
    id: "OP13-079",
    name: "Imu",
    types: ["The Five Elders"],
    effectText:
      "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck and at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck.",
  };
  const mary = {
    ...CARDS.STAGE,
    id: "OP05-097",
    name: "Mary Geoise",
    types: ["Mary Geoise"],
  };
  payload.player1.leader = { cardId: imu.id, quantity: 1, cardData: imu };
  payload.player1.deck = payload.player1.deck.map((entry) =>
    entry.cardId === CARDS.STAGE.id
      ? { cardId: mary.id, quantity: entry.quantity, cardData: mary }
      : entry
  );
  const prepared = prepareDecksAndLeaders(payload),
    prompted = advancePregame(
      startPregame(prepared.state, "HOST_FIRST"),
      prepared.cardDb,
      []
    ).state;
  expect(prompted.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
  const raw = future(prompted);
  raw.effectStack.unshift({
    ...frame(),
    sourceCardInstanceId: prompted.players[0].leader.instanceId,
    kind: "PREGAME",
    pregameContinuation: {
      phase: "START_OF_GAME_FX",
      effectFrameId: raw.effectStack[0].id,
      controller: 0,
    },
  });
  for (const location of locations) {
    const loaded = read(raw, location),
      prompt = loaded.pendingPrompt!;
    if (prompt.options.promptType !== "ARRANGE_TOP_CARDS")
      throw new Error("Expected search");
    const ids = prompt.options.cards.map((card) => card.instanceId),
      resumed = resumeFromStack(
        { ...loaded, pendingPrompt: null },
        {
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: ids[0],
          orderedInstanceIds: ids.slice(1),
          destination: "bottom",
        },
        prepared.cardDb
      );
    expect(resumed.state.players[0].stage?.cardId).toBe(mary.id);
    const dealt = advancePregame(
      { ...resumed.state, pendingPrompt: resumed.pendingPrompt ?? null },
      prepared.cardDb,
      []
    ).state;
    expect(dealt.pregame?.phase).toBe("MULLIGAN_DECISIONS");
    expect(dealt.players[0].hand).toHaveLength(5);
    expect(dealt.players[1].hand).toHaveLength(5);
  }
});

it("reloads real mid-batch overflow live/undo and resumes the rule-trash pipeline", () => {
  const db = createTestCardDb(),
    state = createBattleReadyState(db);
  const card = (id: string, zone: "CHARACTER" | "TRASH"): CardInstance => ({
    instanceId: id,
    cardId: CARDS.VANILLA.id,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  });
  state.players[0].characters = padChars(
    Array.from({ length: 4 }, (_, i) => card(`board-${i}`, "CHARACTER"))
  );
  state.players[0].trash = [
    card("batch-one", "TRASH"),
    card("batch-two", "TRASH"),
  ];
  const started = executeActionChain(
    state,
    [
      {
        type: "PLAY_CARD",
        target_ref: "selected",
        target: {
          type: "CHARACTER_CARD",
          source_zone: "TRASH",
          count: { exact: 2 },
        },
        params: { source_zone: "TRASH", cost_override: "FREE" },
      },
    ],
    state.players[0].leader.instanceId,
    0,
    db,
    new Map([
      ["selected", { targetInstanceIds: ["batch-one", "batch-two"], count: 2 }],
    ])
  );
  expect(started.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  const raw = future({
    ...started.state,
    pendingPrompt: started.pendingPrompt ?? null,
  });
  const owner = raw.effectStack.find((f: Json) => f.ruleTrashForPlay);
  expect(owner.ruleTrashForPlay.batch.playedSoFar).toHaveLength(1);
  owner.kind = "PLAY_OVERFLOW";
  owner.playOverflow = owner.ruleTrashForPlay;
  delete owner.ruleTrashForPlay;
  for (const location of locations) {
    const loaded = read(raw, location);
    const result = resumePromptLifecycle(
      loaded,
      { type: "SELECT_TARGET", selectedInstanceIds: ["board-0"] },
      db,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(result.responseRejected).not.toBe(true);
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.effectStack).toEqual([]);
    expect(result.state.players[0].characters.filter(Boolean)).toHaveLength(5);
    expect(
      result.state.players[0].characters.filter(
        (c) => c && !c.instanceId.startsWith("board-")
      )
    ).toHaveLength(2);
    expect(result.state.players[0].trash).toHaveLength(1);
  }
});

it.each(
  ["overflow.batch", "stateDistributionForPlay"].flatMap((owner) =>
    locations.flatMap((location) =>
      ["effectBlock", "triggeringEvent"].map((key) => ({
        owner,
        location,
        key,
      }))
    )
  )
)("rejects unknown $key in $owner at $location", ({ owner, location, key }) => {
  const { raw, queued: trigger } = queued(owner);
  trigger[key] =
    key === "effectBlock"
      ? {
          id: "trigger-effect",
          category: "auto",
          actions: [{ type: "NOT_AN_ACTION" }],
        }
      : { type: "NOT_AN_EVENT", payload: {} };
  expect(() => read(raw, location)).toThrow();
});

it.each([
  "scheduledActions",
  "activeEffects",
  "prohibitions",
  "oneTimeModifiers",
  "triggerRegistry",
])("rejects unknown executable variants in staged %s", (carrier) => {
  for (const location of locations) {
    const raw = future();
    const staged = Object.fromEntries(
      [
        "players",
        "turn",
        "activeEffects",
        "prohibitions",
        "scheduledActions",
        "oneTimeModifiers",
        "triggerRegistry",
      ].map((key) => [key, structuredClone(raw[key])])
    );
    staged[carrier] =
      carrier === "scheduledActions"
        ? [
            {
              id: "staged-obligation",
              timing: "END_OF_THIS_BATTLE",
              action: { type: "NOT_AN_ACTION" },
              boundToInstanceId: null,
              sourceEffectId: "source",
              controller: 0,
            },
          ]
        : carrier === "triggerRegistry"
          ? [
              {
                effectBlock: {
                  id: "staged-block",
                  category: "auto",
                  actions: [{ type: "NOT_AN_ACTION" }],
                },
              },
            ]
          : carrier === "prohibitions"
            ? [{ conditionalOverride: { action: { type: "NOT_AN_ACTION" } } }]
            : [{ type: "NOT_A_VARIANT" }];
    raw.effectStack = [{ ...frame(), costTransactionState: staged }];
    expect(() => read(raw, location)).toThrow();
  }
});

it.each(
  locations.flatMap((location) => [
    { location, label: "null", pausedAction: null },
    {
      location,
      label: "known DRAW",
      pausedAction: { type: "DRAW", params: { amount: 1 } },
    },
  ])
)(
  "rejects overflow with $label paused action in $location",
  ({ location, pausedAction }) => {
    const raw = overflow();
    raw.effectStack[0].pausedAction = pausedAction;
    expect(() => read(raw, location)).toThrow(
      "overflow requires a paused PLAY_CARD action"
    );
  }
);
