import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import {
  getEffectSchema,
  getAllAuthoredSchemas,
} from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { validatePersistedGameStateCore } from "../session/persisted-game-state.js";
import { computeAllValidTargets } from "../engine/effect-resolver/target-resolver.js";
import { payCosts } from "../engine/effect-resolver/cost-handler.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import type { RuntimeProhibition } from "../engine/effect-types.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function fixture(id: string) {
  const cardDb = createTestCardDb();
  const schema = getEffectSchema(id)!;
  const kotoriSchema = getEffectSchema("OP05-103")!;
  cardDb.set("OP05-103", {
    ...CARDS.VANILLA,
    id: "OP05-103",
    name: "Kotori",
    cost: 3,
    effectSchema: kotoriSchema,
  });
  const data: CardData = {
    ...CARDS.VANILLA,
    id,
    name: schema.card_name!,
    cost: 3,
    effectSchema: schema,
  };
  cardDb.set(id, data);
  let state = createBattleReadyState(cardDb);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  const source: CardInstance = {
    ...state.players[0].leader,
    cardId: id,
    instanceId: "source",
    zone: "HAND",
    turnPlayed: 0,
    attachedDon: [],
  };
  state.players[0].hand.push(source);
  const act = (
    action: GameAction,
    player: 0 | 1 = state.turn.activePlayerIndex
  ) => {
    if (state.pendingPrompt) {
      expect(state.pendingPrompt.respondingPlayer).toBe(player);
      const result = resumePromptLifecycle(state, action, cardDb, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(result.responseRejected).toBe(false);
      state = result.state;
    } else {
      const result = runPipeline(state, action, cardDb, player);
      expect(result.valid, result.error).toBe(true);
      state = result.state;
    }
    return state;
  };
  return {
    cardDb,
    source,
    act,
    get state() {
      return state;
    },
    set state(value: GameState) {
      state = value;
    },
  };
}

describe("OPT-845 named Character activation payment", () => {
  it("plays registered Kotori before offering Hotori Life targets", () => {
    const f = fixture("OP05-111");
    f.state.players[0].hand.push({
      ...f.source,
      cardId: "OP05-103",
      instanceId: "kotori",
    });
    f.state.players[1].characters[0] = {
      ...f.source,
      cardId: CARDS.VANILLA.id,
      instanceId: "life-target",
      zone: "CHARACTER",
      controller: 1,
      owner: 1,
    };
    f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
    f.act({ type: "PLAYER_CHOICE", choiceId: "activate" });
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(targets(f.state)).toEqual(["kotori"]);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori"] });
    expect(
      f.state.players[0].characters.some((c) => c?.cardId === "OP05-103")
    ).toBe(true);
    expect(f.state.players[0].hand.some((c) => c.cardId === "OP05-103")).toBe(
      false
    );
    expect(targets(f.state)).toEqual(["life-target"]);
  });
});

function targets(state: GameState): string[] {
  const options = state.pendingPrompt?.options;
  return options?.promptType === "SELECT_TARGET" ? options.validTargets : [];
}

function prepared(copies = 1, full = false) {
  const f = fixture("OP05-111");
  f.state.players[0].hand = [
    f.source,
    ...Array.from({ length: copies }, (_, n) => ({
      ...f.source,
      cardId: "OP05-103",
      instanceId: `kotori-${n}`,
    })),
  ];
  f.state.players[1].life = f.state.players[1].life.slice(0, 1);
  f.cardDb.set("ko-target", { ...CARDS.VANILLA, id: "ko-target", cost: 2 });
  f.state.players[1].characters = padChars([
    {
      ...f.source,
      cardId: CARDS.VANILLA.id,
      instanceId: "life-target",
      zone: "CHARACTER",
      controller: 1,
      owner: 1,
    },
    {
      ...f.source,
      cardId: "ko-target",
      instanceId: "ko-target",
      zone: "CHARACTER",
      controller: 1,
      owner: 1,
    },
  ]);
  if (full)
    f.state.players[0].characters = padChars(
      Array.from({ length: 4 }, (_, n) => ({
        ...f.source,
        cardId: CARDS.VANILLA.id,
        instanceId: `own-${n}`,
        zone: "CHARACTER" as const,
      }))
    );
  return f;
}

function activate(f: ReturnType<typeof prepared>) {
  f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
  f.act({ type: "PLAYER_CHOICE", choiceId: "activate" });
}

function prohibit(
  f: ReturnType<typeof prepared>,
  type: RuntimeProhibition["prohibitionType"]
) {
  f.state.prohibitions.push({
    id: "play-lock",
    sourceCardInstanceId: "opponent-leader",
    sourceEffectBlockId: "lock",
    prohibitionType: type,
    controller: 0,
    scope: { controller: "SELF", filter: { name: "Kotori" } },
    appliesTo: type === "CANNOT_BE_PLAYED_BY_EFFECTS" ? ["kotori-0"] : [],
    usesRemaining: null,
    duration: { type: "THIS_TURN" },
  });
}

it.each(["TOP", "BOTTOM"] as const)(
  "registered Hotori resolves %s Life before registered Kotori sees the increased Life count",
  (end) => {
    const f = prepared(2);
    activate(f);
    const donBefore = f.state.players[0].donCostArea.map((d) => ({ ...d }));
    expect(targets(f.state)).toEqual(["kotori-0", "kotori-1"]);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-1"] });
    expect(f.state.players[0].hand.map((c) => c.instanceId)).toEqual([
      "kotori-0",
    ]);
    const played = f.state.players[0].characters.find(
      (c) => c?.cardId === "OP05-103"
    )!;
    expect(played).toMatchObject({
      zone: "CHARACTER",
      state: "ACTIVE",
      turnPlayed: f.state.turn.number,
      attachedDon: [],
    });
    expect(played.instanceId).not.toBe("kotori-1");
    expect(f.state.players[0].donCostArea).toEqual(donBefore);
    expect(targets(f.state)).toEqual(["life-target", "ko-target"]);
    const oldLifeIds = f.state.players[1].life.map((c) => c.instanceId);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["life-target"] });
    expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(
      f.state.players[1].characters.some((c) => c?.instanceId === "ko-target")
    ).toBe(true);
    f.state = JSON.parse(JSON.stringify(f.state));
    expect(validatePersistedGameStateCore(f.state)).toBeNull();
    const opts = f.state.pendingPrompt!.options;
    if (opts.promptType !== "PLAYER_CHOICE")
      throw new Error("Expected Life end");
    const choice = opts.choices.find((c) => c.label.toUpperCase() === end)!;
    f.act({ type: "PLAYER_CHOICE", choiceId: choice.id });
    const life = f.state.players[1].life;
    expect(life).toHaveLength(2);
    const added = end === "TOP" ? life[0] : life.at(-1)!;
    expect(added).toMatchObject({ cardId: CARDS.VANILLA.id, face: "UP" });
    expect(added.instanceId).not.toBe("life-target");
    expect(
      life
        .filter((c) => c.instanceId !== added.instanceId)
        .map((c) => c.instanceId)
    ).toEqual(oldLifeIds);
    expect(targets(f.state)).toEqual(["ko-target"]);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["ko-target"] });
    expect(f.state.players[1].trash.some((c) => c.cardId === "ko-target")).toBe(
      true
    );
    expect(f.state.effectStack).toEqual([]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(
      f.state.eventLog.filter(
        (e) => e.type === "CARD_PLAYED" && e.payload.cardId === "OP05-103"
      )
    ).toHaveLength(1);
  }
);

it("declining Hotori leaves Kotori and opponent's cards untouched", () => {
  const f = prepared();
  f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
  f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
  expect(f.state.players[0].hand.map((c) => c.instanceId)).toEqual([
    "kotori-0",
  ]);
  expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(2);
  expect(f.state.pendingPrompt).toBeNull();
});

it.each([
  "absent",
  "non-character",
  "CANNOT_PLAY_CHARACTER",
  "CANNOT_BE_PLAYED_BY_EFFECTS",
] as const)("does not offer unpaid Life effect when Kotori is %s", (reason) => {
  const f = prepared(reason === "absent" ? 0 : 1);
  if (reason === "non-character")
    f.cardDb.set("OP05-103", { ...f.cardDb.get("OP05-103")!, type: "Event" });
  if (
    reason === "CANNOT_PLAY_CHARACTER" ||
    reason === "CANNOT_BE_PLAYED_BY_EFFECTS"
  )
    prohibit(f, reason);
  f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
  // Existing optional trigger UX permits declining an unpayable effect.
  if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
    f.act({ type: "PLAYER_CHOICE", choiceId: "activate" });
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(2);
  expect(f.state.players[1].life).toHaveLength(1);
});

it("pays even when Hotori chooses zero Life targets", () => {
  const f = prepared();
  activate(f);
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] });
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: [] });
  expect(f.state.players[0].hand).toEqual([]);
  expect(
    f.state.players[0].characters.some((c) => c?.cardId === "OP05-103")
  ).toBe(true);
  expect(f.state.players[1].life).toHaveLength(1);
  expect(f.state.pendingPrompt).toBeNull(); // no cost <= 1 Kotori target
});

it.each([false, true])(
  "full field payment survives persistence; trash Hotori=%s",
  (trashSource) => {
    const f = prepared(1, true);
    activate(f);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] });
    const hotori = f.state.players[0].characters.find(
      (c) => c?.cardId === "OP05-111"
    )!;
    expect(targets(f.state)).toHaveLength(5);
    expect(f.state.players[0].hand.map((c) => c.instanceId)).toEqual([
      "kotori-0",
    ]);
    f.state = JSON.parse(JSON.stringify(f.state));
    expect(validatePersistedGameStateCore(f.state)).toBeNull();
    f.act({
      type: "SELECT_TARGET",
      selectedInstanceIds: [trashSource ? hotori.instanceId : "own-0"],
    });
    expect(f.state.players[0].characters.filter(Boolean)).toHaveLength(5);
    expect(f.state.players[0].hand).toEqual([]);
    expect(f.state.players[0].trash).toHaveLength(1);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["life-target"] });
    const opts = f.state.pendingPrompt!.options;
    if (opts.promptType !== "PLAYER_CHOICE")
      throw new Error("Expected Life end");
    f.act({ type: "PLAYER_CHOICE", choiceId: opts.choices[0].id });
    expect(f.state.players[1].life).toHaveLength(2);
    if (trashSource) expect(f.state.pendingPrompt).toBeNull();
    else {
      expect(targets(f.state)).toEqual(["ko-target"]);
      f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["ko-target"] });
    }
    expect(f.state.effectStack).toEqual([]);
  }
);

it.each([{ ids: [] }, { ids: ["wrong"] }, { ids: ["kotori-0", "kotori-0"] }])(
  "rejects malformed named payment %j without granting Life effect",
  ({ ids }) => {
    const f = prepared();
    activate(f);
    const before = structuredClone(f.state);
    const result = resumePromptLifecycle(
      f.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ids },
      f.cardDb,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(result.responseRejected).toBe(true);
    expect(result.state).toEqual(before);
  }
);

it.each(["moved", "prohibited"])(
  "revalidates %s payment after the offer instead of restoring a stale staged hand",
  (change) => {
    const f = prepared();
    activate(f);
    f.state = JSON.parse(JSON.stringify(f.state));
    if (change === "moved") f.state.players[0].hand = [];
    else prohibit(f, "CANNOT_PLAY_CHARACTER");
    const result = resumePromptLifecycle(
      f.state,
      { type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] },
      f.cardDb,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(result.responseRejected).toBe(true);
    expect(result.state).toEqual(f.state);
  }
);

it("session routing rejects wrong-player and stale prompt packets", () => {
  const f = prepared();
  activate(f);
  f.state.pendingPrompt!.promptId = "named-payment";
  const coordinator = new SessionCoordinator();
  const action: GameAction = {
    type: "SELECT_TARGET",
    selectedInstanceIds: ["kotori-0"],
    promptId: "named-payment",
  };
  expect(coordinator.routePromptResponse(f.state, 1, action).kind).toBe(
    "reject"
  );
  expect(
    coordinator.routePromptResponse(f.state, 0, { ...action, promptId: "old" })
      .kind
  ).toBe("reject");
  f.act(action);
  f.state.pendingPrompt!.promptId = "life-target";
  expect(coordinator.routePromptResponse(f.state, 0, action).kind).toBe(
    "reject"
  );
  expect(f.state.players[1].life).toHaveLength(1);
});

it("inventories named play costs across every nested authored schema", () => {
  const uses: string[] = [];
  function visit(value: unknown, path: string): void {
    if (!value || typeof value !== "object") return;
    if ("type" in value && value.type === "PLAY_NAMED_CARD_FROM_HAND")
      uses.push(path);
    for (const [key, child] of Object.entries(value))
      visit(child, `${path}.${key}`);
  }
  for (const [id, schema] of Object.entries(getAllAuthoredSchemas()))
    visit(schema, id);
  expect(uses).toEqual(["OP05-111.effects.0.costs.0"]);
});

it("Kotori uses opponent Life with the activating player in seat 1", () => {
  const f = prepared();
  f.state.players.reverse();
  function flip(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const key of ["owner", "controller"]) {
      if (record[key] === 0 || record[key] === 1)
        record[key] = record[key] === 0 ? 1 : 0;
    }
    Object.values(record).forEach(flip);
  }
  flip(f.state.players);
  f.state.turn.activePlayerIndex = 1;
  activate(f);
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] });
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: [] });
  expect(f.state.players[0].life).toHaveLength(1);
  expect(f.state.players[0].characters.filter(Boolean)).toHaveLength(2);
  expect(f.state.pendingPrompt).toBeNull();
});

it("rule-trash returns attached DON!! and reveals the chosen hand card before the capacity response", () => {
  const f = prepared(1, true);
  const attached = f.state.players[0].donCostArea.pop()!;
  f.state.players[0].characters[0]!.attachedDon = [
    { ...attached, attachedTo: "own-0" },
  ];
  activate(f);
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] });
  expect(
    f.state.eventLog.filter((e) => e.type === "CARDS_REVEALED").at(-1)?.payload
  ).toMatchObject({
    cards: [{ instanceId: "kotori-0", cardId: "OP05-103" }],
    visibility: "BOTH",
  });
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["own-0"] });
  expect(
    f.state.players[0].donCostArea.find(
      (d) => d.instanceId === attached.instanceId
    )
  ).toMatchObject({ state: "RESTED", attachedTo: null });
  expect(f.state.players[0].trash[0]).toMatchObject({
    attachedDon: [],
    state: "ACTIVE",
    turnPlayed: null,
  });
  expect(f.state.players[0].trash[0].instanceId).not.toBe("own-0");
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: [] });
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.eventLog.filter((e) => e.type === "CARD_KO")).toHaveLength(0);
  expect(
    f.state.eventLog.find(
      (e) => e.type === "CARD_TRASHED" && e.payload.cardInstanceId === "own-0"
    )?.payload
  ).toMatchObject({ reason: "rule" });
  expect(
    f.state.eventLog.filter((e) => e.type === "CARDS_REVEALED")
  ).toHaveLength(1);
});

it.each([false, true])(
  "play observer waits until Hotori finishes and fires once (capacity=%s)",
  (full) => {
    const f = prepared(1, full);
    const observer: CardData = {
      ...CARDS.VANILLA,
      id: "observer",
      effectSchema: {
        effects: [
          {
            id: "watch-kotori",
            category: "auto",
            trigger: {
              event: "CHARACTER_PLAYED",
              filter: { controller: "SELF", target_filter: { name: "Kotori" } },
            },
            actions: [{ type: "DRAW", params: { amount: 1 } }],
          },
        ],
      },
    };
    f.cardDb.set(observer.id, observer);
    const card: CardInstance = {
      ...f.source,
      cardId: observer.id,
      instanceId: "observer",
      zone: "CHARACTER",
    };
    f.state.players[0].characters[0] = card;
    f.state = registerCardEnteredField(f.state, card, observer);
    activate(f);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] });
    if (full) f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["own-1"] });
    expect(f.state.players[0].hand).toHaveLength(0);
    f.state = JSON.parse(JSON.stringify(f.state));
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [] });
    // Both auto effects share one event; choosing their order may prompt.
    while (f.state.pendingPrompt) {
      const opts = f.state.pendingPrompt.options;
      if (opts.promptType === "PLAYER_CHOICE")
        f.act({ type: "PLAYER_CHOICE", choiceId: opts.choices[0].id });
      else throw new Error(`Unexpected observer prompt ${opts.promptType}`);
    }
    expect(f.state.players[0].hand).toHaveLength(1);
    expect(
      f.state.eventLog.filter(
        (e) => e.type === "CARD_PLAYED" && e.payload.cardId === "OP05-103"
      )
    ).toHaveLength(1);
  }
);

it("registered Katakuri hand-play filter keeps its opponent DON!! perspective", () => {
  const f = prepared();
  const schema = getEffectSchema("OP08-062")!;
  const target = schema.effects[0].actions![0].target!;
  f.state.players[0].donCostArea = f.state.players[0].donCostArea.slice(0, 1);
  f.state.players[1].donCostArea = f.state.players[1].donCostArea.slice(0, 4);
  f.cardDb.set("katakuri-4", {
    ...CARDS.VANILLA,
    id: "katakuri-4",
    name: "Charlotte Katakuri",
    cost: 4,
  });
  f.cardDb.set("katakuri-5", {
    ...CARDS.VANILLA,
    id: "katakuri-5",
    name: "Charlotte Katakuri",
    cost: 5,
  });
  f.state.players[0].hand = [4, 5].map((n) => ({
    ...f.source,
    cardId: `katakuri-${n}`,
    instanceId: `katakuri-${n}`,
  }));
  expect(
    computeAllValidTargets(f.state, target, 0, f.cardDb, "source", new Map())
  ).toEqual(["katakuri-4"]);
});

it("synchronous named costs really move once and cannot spend the same card twice", () => {
  const f = prepared();
  const cost = {
    type: "PLAY_NAMED_CARD_FROM_HAND",
    card_name: "Kotori",
  } as const;
  const original = structuredClone(f.state);
  const paid = payCosts(f.state, [cost], 0, f.cardDb, "source")!;
  expect(
    paid.state.players[0].characters.some((c) => c?.cardId === "OP05-103")
  ).toBe(true);
  expect(paid.events.filter((e) => e.type === "CARD_PLAYED")).toHaveLength(1);
  expect(payCosts(f.state, [cost, cost], 0, f.cardDb, "source")).toBeNull();
  expect(
    isCostSequencePayable(f.state, [cost, cost], 0, f.cardDb, "source")
  ).toBe(false);
  expect(f.state).toEqual(original);
});

it("rule capacity trash does not activate an effect-only removal observer", () => {
  const f = prepared(1, true);
  const observer: CardData = {
    ...CARDS.VANILLA,
    id: "removal-observer",
    effectSchema: {
      effects: [
        {
          id: "effect-only",
          category: "auto",
          trigger: {
            event: "CHARACTER_REMOVED_FROM_FIELD",
            filter: { cause: "BY_EFFECT" },
          },
          actions: [{ type: "DRAW", params: { amount: 1 } }],
        },
      ],
    },
  };
  f.cardDb.set(observer.id, observer);
  const card: CardInstance = {
    ...f.source,
    cardId: observer.id,
    instanceId: "removal-observer",
    zone: "CHARACTER",
  };
  f.state.players[0].characters[0] = card;
  f.state = registerCardEnteredField(f.state, card, observer);
  activate(f);
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] });
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["own-1"] });
  f.act({ type: "SELECT_TARGET", selectedInstanceIds: [] });
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.players[0].hand).toHaveLength(0);
});

it.each(["moved", "prohibited", "duplicate-victim"])(
  "capacity continuation rejects %s payment after restore",
  (change) => {
    const f = prepared(1, true);
    activate(f);
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["kotori-0"] });
    f.state = JSON.parse(JSON.stringify(f.state));
    if (change === "moved") f.state.players[0].hand = [];
    if (change === "prohibited") prohibit(f, "CANNOT_PLAY_CHARACTER");
    const before = structuredClone(f.state);
    const result = resumePromptLifecycle(
      f.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds:
          change === "duplicate-victim" ? ["own-0", "own-0"] : ["own-0"],
      },
      f.cardDb,
      { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
    );
    expect(result.responseRejected).toBe(true);
    expect(result.state).toEqual(before);
  }
);
