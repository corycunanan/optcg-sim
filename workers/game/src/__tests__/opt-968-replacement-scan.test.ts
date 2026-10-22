import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { afterEach, describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import type { CardInstance, GameAction, GameState } from "../types.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { scanReplacementsForBatch } from "../engine/replacements.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

function event(r: Rig, action: Action) {
  const schema = synSchema(
    "OPT968-EVENT",
    [
      {
        id: "main",
        category: "activate",
        trigger: { keyword: "MAIN_EVENT" },
        actions: [action],
      },
    ],
    "Event"
  );
  const source = r.put("OPT968-EVENT", 1, "HAND", {
    schema,
    data: {
      type: "Event",
      cost: 0,
      power: null,
      effectText: "[Main] Resolve the test action.",
    },
  });
  r.state.turn.activePlayerIndex = 1;
  r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId }, 1);
}
const ko: Action = {
  type: "KO",
  target: {
    type: "CHARACTER",
    controller: "OPPONENT",
    count: { all: true },
    filter: { power_max: 6000 },
  },
};
const alive = (r: Rig, card: CardInstance) =>
  r.state.players[card.controller].characters.some(
    (candidate) => candidate?.instanceId === card.instanceId
  );
function don(r: Rig, n: number) {
  r.state.players[0].donCostArea = Array.from({ length: n }, (_, i) => ({
    instanceId: `opt968-don-${i}`,
    state: "ACTIVE",
    attachedTo: null,
  }));
}
const captures: {
  rig: Rig;
  initial: GameState;
  pauses: GameState[];
  replies: GameAction[];
}[] = [];
function setup() {
  const r = rig();
  r.deck(0, 10);
  r.deck(1, 10);
  const capture = {
    rig: r,
    initial: structuredClone(r.state),
    pauses: [] as GameState[],
    replies: [] as GameAction[],
  };
  captures.push(capture);
  const act = r.act;
  r.act = (action, player) => {
    if (r.state.pendingPrompt) {
      capture.pauses.push(structuredClone(r.state));
      capture.replies.push(structuredClone(action));
    }
    act(action, player);
  };
  return r;
}

afterEach(async () => {
  const folder = process.env.OPT968_WRITE_CORPUS_DIR;
  for (const [rigIndex, capture] of captures.splice(0).entries()) {
    if (!folder || !capture.pauses.length || expect.getState().currentTestName!.includes("KNOWN GAP")) continue;
    const cases = [];
    let authoritative = structuredClone(capture.pauses[0]);
    for (const [index, reply] of capture.replies.entries()) {
      const state = authoritative;
      const storage = new MemorySessionStorage();
      await new SessionRepository(storage, {
        nextJsUrl: "https://app.example.test",
        workerSecret: "secret",
      }).save({
        state,
        cardDb: capture.rig.db,
        mode: "PVP",
        pregameMode: "PRIORITY_ROLL",
        testPriorityRolls: null,
        undoHistory: [capture.initial, state],
      });
      cases.push({ index, stored: Object.fromEntries(storage.data), replies: capture.replies.slice(index),
        legacyUndo: { ...toPersistedGameState(capture.initial), schemaVersion: 4 }, });
      const loaded = (await new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).load())!;
      const resumed = resumePromptLifecycle(loaded.state, reply, loaded.cardDb, { drainPregame: (state) => state, advanceStartOfTurn: (state) => state });
      expect(resumed.responseRejected).toBeFalsy();
      authoritative = resumed.state;
    }
    const finalStorage = new MemorySessionStorage();
    await new SessionRepository(finalStorage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).save({ state: authoritative, cardDb: capture.rig.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
    authoritative = (await new SessionRepository(finalStorage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).load())!.state;
    mkdirSync(folder, { recursive: true });
    const name = expect
      .getState()
      .currentTestName!.replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(-140);
    writeFileSync(
      `${folder}/${name}-${rigIndex}.json`,
      JSON.stringify(
        {
          writerBase: "dc08a5ac+OPT-968",
          cases,
          expected: toPersistedGameState(authoritative),
        },
        null,
        2
      ) + "\n"
    );
  }
});

describe("OPT-968 per-action replacement feasibility", () => {
  it("Morley offers only feasible branches and cannot save himself with an empty field payment", async () => {
    const r = setup();
    const morley = r.put("OP16-033", 0, "CHARACTER", {
      state: "RESTED",
      data: { power: 6000 },
    });
    r.state.players[0].leader.state = "RESTED";
    don(r, 2);
    event(r, ko);
    r.accept();
    // Only the DON!! branch is feasible; the real choice handler auto-selects it.
    expect(r.state.pendingPrompt).toBeNull();
    expect(alive(r, morley)).toBe(true);
    expect(
      r.state.players[0].donCostArea.every((card) => card.state === "RESTED")
    ).toBe(true);
    await r.reload();
    expect(alive(r, morley)).toBe(true);
  });

  it("Morley's choice prompt excludes rest-two-field with only one active field card", async () => {
    const r = setup();
    r.put("OP16-033", 0, "CHARACTER", {
      state: "RESTED",
      data: { power: 6000 },
    });
    don(r, 2);
    event(r, ko);
    r.accept();
    const prompt = r.state.pendingPrompt?.options;
    expect(prompt?.promptType).toBe("PLAYER_CHOICE");
    if (prompt?.promptType !== "PLAYER_CHOICE") throw new Error("choice");
    expect(prompt.choices.map((choice) => choice.label)).toEqual([
      "Rest 1 field card and 1 DON!!",
      "Rest 2 DON!! cards",
    ]);
    const donChoice = prompt.choices.find((choice) => choice.label === "Rest 2 DON!! cards")!.id;
    await r.reload();
    r.act({ type: "PLAYER_CHOICE", choiceId: donChoice });
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[0].donCostArea.every((card) => card.state === "RESTED")).toBe(true);
  });

  for (const count of [1, 2])
    it(`OP10-074: ${count} active DON!! ${count === 1 ? "cannot pay" : "are both paid"}`, () => {
      const r = setup();
      const pica = r.put("OP10-074", 0, "CHARACTER", { data: { power: 6000 } });
      don(r, count);
      event(r, ko);
      if (count === 2) r.accept();
      expect(alive(r, pica)).toBe(count === 2);
      expect(
        r.state.players[0].donCostArea.filter((card) => card.state === "RESTED")
      ).toHaveLength(count === 2 ? 2 : 0);
    });

  for (const marcoId of ["OP16-014", "OP17-015"])
    it(`${marcoId}: a K.O.-immune source cannot substitute its own K.O.`, () => {
      const r = setup();
      const marco = r.put(marcoId, 0, "CHARACTER", { data: { power: 9000 } });
      const ally = r.put("OPT968-ALLY", 0, "CHARACTER", {
        data: { power: 5000 },
      });
      // The authored White Out Trigger's prohibition covers already-played Characters.
      const whiteOut = getEffectSchema("ST06-016")!.effects.find(
        (block) => block.id === "trigger_draw_and_protection"
      )!;
      const result = resolverExecutionServices.executeActionChain(
        r.state,
        whiteOut.actions!,
        r.state.players[0].leader.instanceId,
        0,
        r.db
      );
      r.state = result.state;
      event(r, {
        type: "RETURN_TO_HAND",
        target: {
          type: "CHARACTER",
          controller: "OPPONENT",
          count: { all: true },
          filter: { power_max: 6000 },
        },
      });
      expect(r.state.pendingPrompt).toBeNull();
      expect(alive(r, ally)).toBe(false);
      expect(alive(r, marco)).toBe(true);
      expect(
        r.state.players[0].hand.some((card) => card.cardId === ally.cardId)
      ).toBe(true);
    });

  for (const id of ["OP13-109", "ST29-008"])
    it(`${id}: face-up top Life blocks the substitute even when bottom Life is face-down`, () => {
      const r = setup();
      r.put(id, 0, "CHARACTER", { data: { power: 9000 } });
      const ally = r.put("OPT968-EGGHEAD", 0, "CHARACTER", {
        data: { power: 5000, types: ["Egghead"] },
      });
      r.life(0, 2);
      r.state.players[0].life[0].face = "UP";
      event(r, ko);
      expect(r.state.pendingPrompt).toBeNull();
      expect(alive(r, ally)).toBe(false);
      expect(r.state.players[0].life.map((card) => card.face)).toEqual([
        "UP",
        "DOWN",
      ]);
    });

  it("hypothetical execution leaves authoritative state, RNG, IDs, prompts and published history unchanged", () => {
    const r = setup();
    const morley = r.put("OP16-033", 0, "CHARACTER", {
      state: "RESTED",
      data: { power: 6000 },
    });
    don(r, 2);
    const before = structuredClone(r.state);
    const matches = scanReplacementsForBatch(
      r.state,
      [morley.instanceId],
      "WOULD_BE_KO",
      "effect",
      1,
      r.db,
      resolverExecutionServices
    );
    expect(matches).toHaveLength(1);
    expect(r.state).toEqual(before);
  });
});

// Decision 7's affected-card-first interpretation is assumed, no official ruling.
describe("OPT-968 replacement scan and recheck policy (assumed, no official ruling)", () => {
  it("the affected card's own replacement precedes its controller's Leader replacement regardless of registration", async () => {
    const r = setup();
    r.leader(0, "EB03-001");
    r.life(0, 1);
    const franky = r.put("OP10-034", 0, "CHARACTER", {
      state: "RESTED",
      data: { power: 5000, cost: 4 },
    });
    r.put("OPT968-PAYMENT", 0, "HAND");
    const attacker = r.put("OPT968-ATTACKER", 1, "CHARACTER", {
      data: { power: 7000 },
    });
    r.state.turn.activePlayerIndex = 1;
    r.act(
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: franky.instanceId,
      },
      1
    );
    while (!r.state.pendingPrompt && r.state.turn.battle)
      r.act({ type: "PASS" });
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(r.state.effectStack.at(-1)?.sourceCardInstanceId).toBe(
      franky.instanceId
    );
    r.decline();
    await r.reload();
    expect(r.state.effectStack.at(-1)?.sourceCardInstanceId).toBe(
      r.state.players[0].leader.instanceId
    );
    r.decline();
    expect(alive(r, franky)).toBe(false);
    expect(
      r.state.eventLog.filter((entry) => entry.type === "CARD_KO")
    ).toHaveLength(1);
    expect(
      r.state.eventLog.filter((entry) => entry.type === "END_OF_BATTLE")
    ).toHaveLength(1);
  });

  it("the non-turn player chooses among its candidates, then accepts the selected replacement separately", async () => {
    const r = setup();
    r.leader(0, "OP15-098");
    r.life(0, 2);
    const bonney = r.put("OP15-105", 0, "CHARACTER", { data: { power: 9000 } });
    const ally = r.put("OPT968-SKY", 0, "CHARACTER", {
      data: { power: 6000, types: ["Sky Island"] },
    });
    event(r, ko);
    expect(r.promptType()).toBe("PLAYER_CHOICE");
    await r.reload();
    const effect = r.state.activeEffects.find(
      (candidate) => candidate.sourceCardInstanceId === bonney.instanceId
    )!;
    r.act({ type: "PLAYER_CHOICE", choiceId: effect.id });
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    expect(r.state.players[0].life).toHaveLength(2);
    r.accept();
    expect(alive(r, ally)).toBe(true);
    expect(r.state.players[0].life).toHaveLength(1);
    expect(r.state.pendingPrompt).toBeNull();
  });

  it("rescans after a nested hand payment makes a previously ineligible replacement available", async () => {
    const r = setup();
    const first = synSchema("OPT968-FIRST", [
      {
        id: "first",
        category: "replacement",
        replaces: {
          event: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
        },
        replacement_actions: [
          { type: "TRASH_FROM_HAND", params: { amount: 2 } },
        ],
        flags: { optional: true },
      },
    ]);
    const second = synSchema("OPT968-SECOND", [
      {
        id: "second",
        category: "replacement",
        replaces: {
          event: "WOULD_BE_KO",
          cause_filter: { by: "OPPONENT_EFFECT" },
        },
        conditions: {
          type: "HAND_COUNT",
          controller: "SELF",
          operator: "==",
          value: 1,
        },
        replacement_actions: [{ type: "REST_DON", params: { amount: 1 } }],
        flags: { optional: true },
      },
    ]);
    const a = r.put("OPT968-FIRST", 0, "CHARACTER", {
      schema: first,
      data: { power: 5000 },
    });
    const b = r.put("OPT968-SECOND", 0, "CHARACTER", {
      schema: second,
      data: { power: 5000 },
    });
    const hand = [0, 1, 2].map((i) => r.put(`OPT968-HAND-${i}`, 0, "HAND"));
    don(r, 1);
    event(r, ko);
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    r.accept();
    expect(r.promptType()).toBe("SELECT_TARGET");
    await r.reload();
    r.select(hand.slice(0, 2).map((card) => card.instanceId));
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    await r.reload();
    r.accept();
    expect(alive(r, a)).toBe(true);
    expect(alive(r, b)).toBe(true);
    expect(r.state.players[0].hand).toHaveLength(1);
    expect(r.state.players[0].donCostArea[0].state).toBe("RESTED");
    expect(r.state.pendingPrompt).toBeNull();
    expect(
      r.state.eventLog.filter((entry) => entry.type === "CARD_KO")
    ).toHaveLength(0);
  });
});

describe("field TRASH_CARD route inventory (pre-existing OPT-1001 gap)", () => {
  function navyRemoval(
    actionType: "TRASH_CARD" | "RETURN_TO_HAND",
    navy: boolean
  ) {
    const r = setup();
    r.leader(0, "OP11-001");
    const target = r.put("OPT968-NAVY", 0, "CHARACTER", {
      data: { power: 5000, types: navy ? ["Navy"] : ["Straw Hat Crew"] },
    });
    for (let i = 0; i < 3; i++) r.put(`OPT968-TRASH-${i}`, 0, "TRASH");
    event(r, {
      type: actionType,
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { all: true },
      },
    });
    return { r, target };
  }
  it.fails(
    "KNOWN GAP OPT-1001: Koby's printed opponent-removal replacement must be offered for field trash",
    () => {
      const { r } = navyRemoval("TRASH_CARD", true);
      expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    }
  );
  it("negative applicability control: non-Navy field trash has no Koby offer", () => {
    const { r, target } = navyRemoval("TRASH_CARD", false);
    expect(r.state.pendingPrompt).toBeNull();
    expect(alive(r, target)).toBe(false);
  });
  it("positive route control: Navy hand-return offers the same printed removal replacement", () => {
    const { r } = navyRemoval("RETURN_TO_HAND", true);
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
  });
});

it("Koby required-three substitute existence stays lazy with a large trash pool", () => {
  const r = setup();
  r.leader(0, "OP11-001");
  const ally = r.put("OPT968-LARGE-NAVY", 0, "CHARACTER", {
    data: { power: 5000, types: ["Navy"] },
  });
  for (let i = 0; i < 200; i++) r.put(`OPT968-LARGE-TRASH-${i}`, 0, "TRASH");
  let executions = 0;
  const services = {
    ...resolverExecutionServices,
    executeEffectAction: ((...args) => {
      executions++;
      return resolverExecutionServices.executeEffectAction(...args);
    }) as typeof resolverExecutionServices.executeEffectAction,
  };
  const before = structuredClone(r.state);
  const matches = scanReplacementsForBatch(
    r.state,
    [ally.instanceId],
    "WOULD_BE_REMOVED_FROM_FIELD",
    "effect",
    1,
    r.db,
    services
  );
  expect(matches).toHaveLength(1);
  // One discovery call, one selected call; owner-arrangement uses its real handler.
  expect(executions).toBe(2);
  expect(r.state).toEqual(before);
});

it("a resource-changing prefix enables a later substitute choice at actual choice time", () => {
  const r = setup(); r.state.players[0].hand = []; don(r, 0);
  const schema = synSchema("OPT968-PREFIX", [{ id: "replacement", category: "replacement",
    replaces: { event: "WOULD_BE_KO" }, flags: { optional: true },
    replacement_actions: [{ type: "DRAW", params: { amount: 1 } }, { type: "PLAYER_CHOICE", params: { options: [
      [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }], [{ type: "REST_DON", params: { amount: 1 } }],
    ] } }], }]);
  const target = r.put("OPT968-PREFIX", 0, "CHARACTER", { schema, data: { power: 5000 } });
  event(r, ko); r.accept();
  expect(r.state.pendingPrompt).toBeNull(); expect(alive(r, target)).toBe(true);
  expect(r.state.players[0].hand).toHaveLength(0);
  expect(r.state.players[0].trash.filter((card) => card.cardId === "CHAR-VANILLA")).toHaveLength(1);
});

it("battle decline-next followed by a nested hand payment resumes once after load", async () => {
  const r = setup(); r.leader(0, "EB03-001"); r.life(0, 1);
  const franky = r.put("OP10-034", 0, "CHARACTER", { state: "RESTED", data: { power: 5000, cost: 4 } });
  const hand = [0, 1].map((i) => r.put(`OPT968-BATTLE-HAND-${i}`, 0, "HAND"));
  const attacker = r.put("OPT968-BATTLE-ATTACKER", 1, "CHARACTER", { data: { power: 7000 } });
  r.state.turn.activePlayerIndex = 1;
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: franky.instanceId }, 1);
  while (!r.state.pendingPrompt && r.state.turn.battle) r.act({ type: "PASS" });
  r.decline(); r.accept();
  expect(r.promptType()).toBe("SELECT_TARGET"); await r.reload();
  r.select([hand[0].instanceId]);
  expect(alive(r, franky)).toBe(true); expect(r.state.players[0].life).toHaveLength(1);
  expect(r.state.players[0].hand).toHaveLength(1);
  expect(r.state.eventLog.filter((entry) => entry.type === "END_OF_BATTLE")).toHaveLength(1);
  expect(r.state.eventLog.filter((entry) => entry.type === "CARD_KO")).toHaveLength(0);
});

for (const staleAtReply of [false, true]) it(`OPT-922 competing resource recheck ${staleAtReply ? "at accepted reply" : "after earlier substitute"}`, () => {
  const r = setup(); r.leader(0, "OP15-098"); r.life(0, 1);
  r.put("OP15-105", 0, "CHARACTER", { data: { power: 9000 } });
  const a = r.put("OPT968-RESOURCE-A", 0, "CHARACTER", { data: { power: 5000 } });
  const b = r.put("OPT968-RESOURCE-B", 0, "CHARACTER", { data: { power: 6000, types: ["Sky Island"] } });
  event(r, ko);
  const first = r.state.activeEffects.find((effect) => effect.sourceCardInstanceId === r.state.players[0].leader.instanceId)!;
  r.act({ type: "PLAYER_CHOICE", choiceId: first.id });
  if (staleAtReply) {
    r.state.players[0].life = []; // Explicit synthetic external-state change, OPT-922 apply-time fixture.
    // This corpus starts after that fixture intervention, at the stale offer.
    const capture = captures.find((entry) => entry.rig === r)!;
    capture.pauses.length = 0; capture.replies.length = 0;
  }
  r.accept();
  expect(r.state.pendingPrompt).toBeNull(); expect(alive(r, a)).toBe(false); expect(alive(r, b)).toBe(!staleAtReply);
  expect(r.state.eventLog.filter((entry) => entry.type === "CARD_KO")).toHaveLength(staleAtReply ? 2 : 1);
});

it.fails("KNOWN GAP OPT-1001: authored OP09-009 Beckman field trash must offer OP11-001 Koby's Navy removal protection", () => {
  const r = setup(); r.leader(0, "OP11-001");
  const navy = r.put("OPT968-BECKMAN-NAVY", 0, "CHARACTER", { data: { power: 5000, types: ["Navy"] } });
  for (let i = 0; i < 3; i++) r.put(`OPT968-BECKMAN-TRASH-${i}`, 0, "TRASH");
  const beckman = r.put("OP09-009", 1, "HAND", { data: { cost: 7, power: 9000 } });
  r.state.players[1].donCostArea = Array.from({ length: 10 }, (_, i) => ({ instanceId: `beckman-don-${i}`, state: "ACTIVE", attachedTo: null }));
  r.state.turn.activePlayerIndex = 1; r.act({ type: "PLAY_CARD", cardInstanceId: beckman.instanceId }, 1);
  if (r.promptType() === "SELECT_TARGET") r.select([navy.instanceId]);
  expect(r.promptType()).toBe("OPTIONAL_EFFECT");
});

it("field-to-Life replacement preserves real destination choice and owner arrangement through reload", async () => {
  const r = setup();
  const schema = synSchema("OPT968-LIFE-DESTINATION", [{ id: "replace", category: "replacement", flags: { optional: true },
    replaces: { event: "WOULD_BE_KO", target_filter: { controller: "SELF", card_type: "CHARACTER", exclude_self: true } },
    replacement_actions: [{ type: "ADD_TO_LIFE_FROM_FIELD", target: { type: "REPLACED_CARD" }, params: { face: "DOWN", position: "TOP_OR_BOTTOM" } }],
  }]);
  r.put("OPT968-LIFE-DESTINATION", 0, "CHARACTER", { schema, data: { power: 9000 } });
  const x = r.put("OPT968-LIFE-X", 0, "CHARACTER", { data: { power: 5000 } });
  const y = r.put("OPT968-LIFE-Y", 0, "CHARACTER", { data: { power: 5000 } });
  event(r, ko); r.accept();
  expect(r.promptType()).toBe("PLAYER_CHOICE"); await r.reload();
  const prompt = r.state.pendingPrompt!.options;
  if (prompt.promptType !== "PLAYER_CHOICE") throw new Error("destination");
  r.act({ type: "PLAYER_CHOICE", choiceId: prompt.choices.find((choice) => choice.label === "Bottom")!.id });
  expect(r.promptType()).toBe("ARRANGE_TOP_CARDS"); await r.reload();
  r.act({ type: "ARRANGE_TOP_CARDS", orderedInstanceIds: [y.instanceId, x.instanceId], keptCardInstanceId: "", destination: "bottom" });
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.players[0].life.slice(-2).map((card) => card.cardId)).toEqual([y.cardId, x.cardId]);
});

it("OP15-009 pays a single Leader reduction for both simultaneous removals", () => {
  const r = setup(); r.put("OP15-009", 0, "CHARACTER", { data: { power: 9000 } });
  const a = r.put("OPT968-KOBY-A", 0, "CHARACTER", { data: { power: 5000 } });
  const b = r.put("OPT968-KOBY-B", 0, "CHARACTER", { data: { power: 5000 } });
  event(r, ko); r.accept();
  expect(alive(r, a) && alive(r, b)).toBe(true);
  expect(r.state.eventLog.filter((entry) => entry.type === "POWER_MODIFIED" && entry.payload.amount === -2000)).toHaveLength(1);
});

it("Sabo saves both simultaneous K.O. targets with one replacement application", () => {
  const r = setup(); r.leader(0, "OP05-001");
  r.state.players[0].leader.attachedDon = [{ instanceId: "sabo-attached", state: "ACTIVE", attachedTo: r.state.players[0].leader.instanceId }];
  const a = r.put("OPT968-SABO-A", 0, "CHARACTER", { data: { power: 5000 } });
  const b = r.put("OPT968-SABO-B", 0, "CHARACTER", { data: { power: 5000 } });
  event(r, ko); r.accept();
  expect(alive(r, a) && alive(r, b)).toBe(true);
  expect(r.state.activeEffects.filter((effect) => effect.modifiers.some((mod) => mod.type === "MODIFY_POWER" && mod.params?.amount === -1000))).toHaveLength(1);
});

it("Pica can rest another member of the simultaneous K.O. batch before that member leaves", () => {
  const r = setup();
  const pica = r.put("OP05-032", 0, "CHARACTER", { data: { power: 6000 } });
  const ally = r.put("OPT968-PICA-PAYMENT", 0, "CHARACTER", { data: { cost: 3, power: 5000 } });
  event(r, ko); r.accept();
  if (r.promptType() === "SELECT_TARGET") r.select([ally.instanceId]);
  expect(alive(r, pica)).toBe(true); expect(alive(r, ally)).toBe(false);
  const types = r.state.eventLog.map((entry) => entry.type);
  expect(types.indexOf("CARD_STATE_CHANGED")).toBeLessThan(types.indexOf("CARD_KO"));
});

it("Koby cannot fund a sibling replacement from a member removed earlier in the same batch", () => {
  const r = setup(); r.leader(0, "OP11-001");
  const a = r.put("OPT968-NO-FUND-A", 0, "CHARACTER", { data: { power: 5000, types: ["Navy"] } });
  const b = r.put("OPT968-NO-FUND-B", 0, "CHARACTER", { data: { power: 5000, types: ["Navy"] } });
  for (let i = 0; i < 2; i++) r.put(`OPT968-FUND-TRASH-${i}`, 0, "TRASH");
  event(r, ko);
  expect(r.state.pendingPrompt).toBeNull(); expect(alive(r, a) || alive(r, b)).toBe(false);
  expect(r.state.eventLog.filter((entry) => entry.type === "CARD_KO")).toHaveLength(2);
});

it("simultaneous own replacements never let one player order the other player's candidates", () => {
  const r = setup(); don(r, 1);
  r.state.players[1].donCostArea = [{ instanceId: "mixed-p1-don", state: "ACTIVE", attachedTo: null }];
  const make = (id: string, owner: 0 | 1) => r.put(id, owner, "CHARACTER", { data: { power: 5000 }, schema: synSchema(id, [{ id: "own", category: "replacement", replaces: { event: "WOULD_BE_KO" }, flags: { optional: true }, replacement_actions: [{ type: "REST_DON", params: { amount: 1 } }] }]) });
  const a = make("OPT968-MIXED-A", 0), b = make("OPT968-MIXED-B", 0), turn = make("OPT968-MIXED-TURN", 1);
  event(r, { type: "KO", target: { type: "CHARACTER", controller: "EITHER", count: { all: true } } });
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); expect(r.state.pendingPrompt!.respondingPlayer).toBe(1); r.accept();
  const prompt = r.state.pendingPrompt!.options;
  expect(prompt.promptType).toBe("PLAYER_CHOICE"); expect(r.state.pendingPrompt!.respondingPlayer).toBe(0);
  if (prompt.promptType !== "PLAYER_CHOICE") throw new Error("owner order");
  expect(prompt.choices).toHaveLength(2);
  expect(prompt.choices.every((choice) => r.state.activeEffects.find((effect) => effect.id === choice.id)?.controller === 0)).toBe(true);
  const chosen = r.state.activeEffects.find((effect) => effect.sourceCardInstanceId === a.instanceId)!;
  r.act({ type: "PLAYER_CHOICE", choiceId: chosen.id }); r.accept();
  expect(alive(r, turn) && alive(r, a)).toBe(true); expect(alive(r, b)).toBe(false);
});

for (const returnAmount of [1, 2]) it(`sequential DON substitutes use actual returned cost-area state (${returnAmount} returned)`, () => {
  const r = setup(); don(r, 2);
  const schema = synSchema("OPT968-DON-SEQUENCE", [{ id: "replace", category: "replacement", flags: { optional: true }, replaces: { event: "WOULD_BE_KO" }, replacement_actions: [
    { type: "RETURN_DON_TO_DECK", params: { amount: returnAmount } }, { type: "REST_DON", params: { amount: 1 } },
  ] }]);
  const card = r.put("OPT968-DON-SEQUENCE", 0, "CHARACTER", { schema, data: { power: 5000 } });
  event(r, ko);
  if (returnAmount === 1) r.accept();
  expect(alive(r, card)).toBe(returnAmount === 1);
  expect(r.state.players[0].donCostArea.filter((don) => don.state === "RESTED")).toHaveLength(returnAmount === 1 ? 1 : 0);
});

for (const marcoId of ["OP16-014", "OP17-015"]) it(`${marcoId}: non-once substitute raises the same removal event without re-entering its opponent-only replacement`, () => {
  const r = setup();
  const marco = r.put(marcoId, 0, "CHARACTER", { data: { power: 9000 } });
  const ally = r.put("OPT968-MARCO-SAVED", 0, "CHARACTER", { data: { power: 5000 } });
  event(r, { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true }, filter: { power_max: 6000 } } });
  expect(r.promptType()).toBe("OPTIONAL_EFFECT"); r.accept();
  expect(r.state.pendingPrompt).toBeNull(); expect(alive(r, ally)).toBe(true); expect(alive(r, marco)).toBe(false);
  expect(r.state.eventLog.filter((entry) => entry.type === "CARD_KO")).toHaveLength(1);
  expect(r.state.players[0].trash.filter((card) => card.cardId === marcoId)).toHaveLength(1);
});
