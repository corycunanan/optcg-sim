/** Native v4 contract fixtures exercised through the production session parser. */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseStoredSession,
  convertPersistedGameState,
} from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { CONTINUATION_EFFECT_BLOCK } from "../engine/effect-stack.js";
import { goldenV2Raw } from "./fixtures/opt-963-v3-states.js";
import type { GameState, CardInstance } from "../types.js";
import {
  CARDS,
  createTestCardDb,
  createBattleReadyState,
  padChars,
} from "./helpers.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
// Intentional mutable JSON allows malformed fixtures outside runtime types.
type Json = Record<string, any>;
function native(runtime?: GameState): Json {
  const state =
    runtime ??
    convertPersistedGameState(goldenV2Raw("battle-ready-with-undo"), "state");
  const raw = JSON.parse(JSON.stringify(toPersistedGameState(state)));
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
  const raw = native();
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
  const raw = native();
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
    state: location === "state" ? raw : native(),
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
  it.each(kinds)("preserves native historical %s and writes v6", (_name, build) => {
    const raw = build(),
      loaded = read(raw, location);
    expect(toPersistedGameState(loaded)).toMatchObject({ schemaVersion: 6 });
    expect(loaded.effectStack).toEqual(raw.effectStack);
    expect(toPersistedGameState(loaded).effectStack).toEqual(raw.effectStack);
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
  it("rejects a continuation boundary sharing its ID with a nonprompted frame", () => {
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
    expect(read(raw, location).effectStack[0].eventActivation?.events).toEqual([
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
    const raw = native();
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
  const raw = owner === "overflow.batch" ? overflow() : native();
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
  it.each(queues)("preserves optional identity snapshot in %s", (owner) => {
    const { raw, queued: q } = queued(owner);
    expect(read(raw, location).effectStack).toEqual(raw.effectStack);
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
    const raw = native(
      convertPersistedGameState(goldenV2Raw("battle-trigger-window"), "state")
    );
    expect(read(raw, location).turn.battle).toEqual(raw.turn.battle);
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
// Real Imu session reload, exact shuffle/RNG use, and opening-hand order are
// covered in opt-964-pregame-shuffle.test.ts for live and undo state.

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
  const paused = {
    ...started.state,
    pendingPrompt: started.pendingPrompt ?? null,
  };
  const raw = JSON.parse(JSON.stringify(toPersistedGameState(paused)));
  const owner = raw.effectStack.find((f: Json) => f.playOverflow);
  expect(owner.kind).toBe("PLAY_OVERFLOW");
  expect(owner.playOverflow.batch.playedSoFar).toHaveLength(1);
  const corpusDir = process.env.OPT964_CORPUS_DIR;
  if (corpusDir) {
    mkdirSync(corpusDir, { recursive: true });
    writeFileSync(
      join(corpusDir, "play-overflow-mid-batch.json"),
      JSON.stringify(
        {
          state: toPersistedGameState(paused),
          undoHistory: [toPersistedGameState(paused)],
          cardDb: Object.fromEntries(db),
        },
        null,
        2
      )
    );
  }
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
    const raw = native();
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

// A finished snapshot must not retain runnable v4 continuation owners.
describe.each(locations)("v4 continuation safety at %s", (location) => {
  it.each(kinds)("rejects finished state retaining %s", (_name, make) => {
    const raw = make();
    expect(() => read(raw, location)).not.toThrow();
    raw.status = "FINISHED";
    raw.winner = 0;
    expect(() => read(raw, location)).toThrow(
      "terminal version 4 state retains pending work"
    );
  });

  it("rejects an effect damage parent owned by a non-executable activation boundary", () => {
    const damageState = native(
      convertPersistedGameState(
        goldenV2Raw("effect-damage-trigger-window"),
        "state"
      )
    );
    expect(() => read(damageState, location)).not.toThrow();
    const raw = activation();
    const damage = damageState.effectStack[0];
    damage.effectDamage.parentFrameId = raw.effectStack[0].id;
    raw.effectStack.push(damage);
    raw.pendingPrompt = damageState.pendingPrompt;
    expect(() => read(raw, location)).toThrow();
  });

  it("preserves staged battle bookkeeping without changing the saved transaction", () => {
    const raw = native();
    const battleState = native(
      convertPersistedGameState(goldenV2Raw("battle-trigger-window"), "state")
    );
    const staged = Object.fromEntries(
      [
        "players",
        "turn",
        "activeEffects",
        "prohibitions",
        "scheduledActions",
        "oneTimeModifiers",
        "triggerRegistry",
      ].map((key) => [key, structuredClone(battleState[key])])
    );
    Object.assign(staged.turn.battle, {
      redirectWindow: true,
      targetLocked: true,
      blockerLocked: true,
    });
    raw.effectStack = [{ ...frame(), costTransactionState: staged }];
    const before = structuredClone(raw);
    const loaded = read(raw, location);
    expect(loaded.effectStack[0].costTransactionState).toEqual(staged);
    expect(loaded.turn).toEqual(raw.turn);
    expect(raw).toEqual(before);
  });
});
