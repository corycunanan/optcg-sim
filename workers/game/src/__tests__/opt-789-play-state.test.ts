import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import type { Action } from "../engine/effect-types.js";
import { EB04_018_MEGALO } from "../engine/schemas/eb04.js";
import { OP09_022_LIM, OP09_023_ADIO } from "../engine/schemas/op09.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function card(
  id: string,
  zone: CardInstance["zone"],
  cardId = CARDS.VANILLA.id,
  controller: 0 | 1 = 0
): CardInstance {
  return {
    instanceId: id,
    cardId,
    zone,
    controller,
    owner: controller,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 0,
  };
}
function setup(action?: Action) {
  const db = createTestCardDb();
  db.set("OP09-022", {
    ...CARDS.LEADER,
    id: "OP09-022",
    name: "Lim",
    types: ["ODYSSEY"],
    effectSchema: OP09_022_LIM,
  });
  db.set(CARDS.VANILLA.id, { ...CARDS.VANILLA, types: ["ODYSSEY"] });
  const state = createBattleReadyState(db);
  state.players[0].leader.cardId = "OP09-022";
  state.players[0].hand = [card("candidate", "HAND")];
  state.players[0].characters = padChars([]);
  if (action) {
    const source: CardData = {
      ...CARDS.VANILLA,
      id: "source",
      effectSchema: {
        effects: [
          {
            id: "play",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [action],
          },
        ],
      },
    };
    db.set(source.id, source);
    state.players[0].characters = padChars([
      card("source", "CHARACTER", source.id),
    ]);
  }
  return { state, db };
}
function respond(
  state: GameState,
  db: Map<string, CardData>,
  action: GameAction
) {
  const result = resumePromptLifecycle(state, action, db, {
    drainPregame: (s) => s,
    advanceStartOfTurn: (s) => s,
  });
  expect(result.responseRejected).toBe(false);
  return result.state;
}
function drain(state: GameState, db: Map<string, CardData>) {
  for (let n = 0; state.pendingPrompt && n < 20; n++) {
    const p = state.pendingPrompt.options;
    if (p.promptType === "OPTIONAL_EFFECT")
      state = respond(state, db, { type: "PLAYER_CHOICE", choiceId: "accept" });
    else if (p.promptType === "PLAYER_CHOICE")
      state = respond(state, db, {
        type: "PLAYER_CHOICE",
        choiceId: p.choices.filter((c) => !c.disabled).at(-1)!.id,
      });
    else if (p.promptType === "SELECT_TARGET")
      state = respond(state, db, {
        type: "SELECT_TARGET",
        selectedInstanceIds: p.validTargets.slice(0, p.countMax),
      });
    else if (p.promptType === "ARRANGE_TOP_CARDS")
      state = respond(state, db, {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: p.validTargets![0],
        orderedInstanceIds: p.cards
          .map((c) => c.instanceId)
          .filter((id) => id !== p.validTargets![0]),
        destination: "bottom",
      });
    else throw new Error(`Unexpected prompt ${p.promptType}`);
  }
  expect(state.pendingPrompt).toBeNull();
  return state;
}

// OP09-022 card text and official OP09 FAQ: entry rested is not resting by an effect.
describe("OPT-789 controller play-state rule", () => {
  it.each([0, 1] as const)(
    "hand play for player %s only uses that player's Leader",
    (pi) => {
      const { state, db } = setup();
      state.turn.activePlayerIndex = pi;
      state.players[0].hand = [];
      state.players[pi].hand = [
        card("candidate", "HAND", CARDS.VANILLA.id, pi),
      ];
      state.players[pi].characters = padChars([]);
      const result = runPipeline(
        state,
        { type: "PLAY_CARD", cardInstanceId: "candidate" },
        db,
        pi
      );
      expect(result.valid).toBe(true);
      expect(result.state.players[pi].characters[0]?.state).toBe(
        pi === 0 ? "RESTED" : "ACTIVE"
      );
      expect(
        result.state.eventLog.find((e) => e.type === "CARD_PLAYED")?.payload
      ).toMatchObject({ playedRested: pi === 0 });
      expect(
        result.state.eventLog.some((e) => e.type === "CARD_STATE_CHANGED")
      ).toBe(false);
    }
  );
  it("does not rest a Stage", () => {
    const { state, db } = setup();
    state.players[0].hand = [card("stage", "HAND", CARDS.STAGE.id)];
    const result = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: "stage" },
      db,
      0
    );
    expect(result.valid).toBe(true);
    expect(result.state.players[0].stage?.state).toBe("ACTIVE");
  });
  it("resolves authored Lim activation, paying three DON and adding one rested DON", () => {
    const { state, db } = setup();
    const beforeActive = state.players[0].donCostArea.filter(
      (d) => d.state === "ACTIVE"
    ).length;
    const beforeDeck = state.players[0].donDeck.length;
    const result = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: state.players[0].leader.instanceId,
        effectId: "activate_add_don_and_play",
      },
      db,
      0
    );
    expect(result.valid).toBe(true);
    const final = drain(result.state, db);
    expect(final.players[0].characters[0]?.state).toBe("RESTED");
    expect(final.players[0].hand).toHaveLength(0);
    expect(
      final.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
    ).toHaveLength(beforeActive - 3);
    expect(final.players[0].donDeck).toHaveLength(beforeDeck - 1);
  });
  for (const entry_state of [undefined, "ACTIVE", "RESTED"] as const) {
    for (const route of [
      "PLAY_CARD",
      "SEARCH_AND_PLAY",
      "PLAY_FROM_LIFE",
    ] as const) {
      it(`${route} with ${entry_state ?? "default"} entry`, () => {
        const action: Action =
          route === "PLAY_CARD"
            ? {
                type: route,
                target: {
                  type: "CHARACTER_CARD",
                  controller: "SELF",
                  source_zone: "HAND",
                  count: { up_to: 1 },
                },
                params: { entry_state },
              }
            : route === "SEARCH_AND_PLAY"
              ? {
                  type: route,
                  params: {
                    look_at: 1,
                    filter: { card_type: "CHARACTER" },
                    entry_state,
                  },
                }
              : { type: route, params: { entry_state } };
        const { state, db } = setup(action);
        if (route === "SEARCH_AND_PLAY")
          state.players[0].deck.unshift(card("deck-candidate", "DECK"));
        if (route === "PLAY_FROM_LIFE")
          state.players[0].life.unshift({
            ...card("life-candidate", "LIFE"),
            face: "DOWN",
          });
        const result = runPipeline(
          state,
          {
            type: "ACTIVATE_EFFECT",
            cardInstanceId: "source",
            effectId: "play",
          },
          db,
          0
        );
        expect(result.valid).toBe(true);
        const final = drain(result.state, db);
        expect(final.players[0].characters[1]?.state).toBe(
          entry_state ?? "RESTED"
        );
      });
    }
  }
});

it("keeps the Lim default across full-board rule-trash continuation", () => {
  const { state, db } = setup({
    type: "PLAY_CARD",
    target: {
      type: "CHARACTER_CARD",
      controller: "SELF",
      source_zone: "HAND",
      count: { up_to: 1 },
    },
  });
  state.players[0].characters = padChars([
    card("source", "CHARACTER", "source"),
    ...Array.from({ length: 4 }, (_, i) => card(`existing-${i}`, "CHARACTER")),
  ]);
  const result = runPipeline(
    state,
    { type: "ACTIVATE_EFFECT", cardInstanceId: "source", effectId: "play" },
    db,
    0
  );
  expect(result.valid).toBe(true);
  const final = drain(result.state, db);
  const entered = final.players[0].characters.find(
    (c) =>
      c &&
      !c.instanceId.startsWith("existing-") &&
      c.cardId === CARDS.VANILLA.id
  )!;
  expect(entered.state).toBe("RESTED");
  expect(entered.instanceId).not.toBe("candidate");
  expect(final.players[0].trash.some((c) => c.cardId === "source")).toBe(true);
  expect(
    final.eventLog.filter((e) => e.type === "CARD_STATE_CHANGED")
  ).toHaveLength(0);
});

it("honors an explicit PLAYER_CHOICE distribution under Lim", () => {
  const { state, db } = setup({
    type: "PLAY_CARD",
    target: {
      type: "CHARACTER_CARD",
      controller: "SELF",
      source_zone: "HAND",
      count: { all: true },
    },
    params: {
      entry_state: "PLAYER_CHOICE",
      state_distribution: { ACTIVE: 1, RESTED: 1 },
    },
  });
  state.players[0].hand.push(card("candidate-two", "HAND"));
  const result = runPipeline(
    state,
    { type: "ACTIVATE_EFFECT", cardInstanceId: "source", effectId: "play" },
    db,
    0
  );
  expect(result.valid).toBe(true);
  const final = drain(result.state, db);
  expect(
    final.players[0].characters
      .slice(1, 3)
      .map((c) => c?.state)
      .sort()
  ).toEqual(["ACTIVE", "RESTED"]);
});

it("plays a revealed Life Trigger rested under its controller's Lim", () => {
  const { state, db } = setup();
  state.players[0].leader.cardId = CARDS.LEADER.id;
  state.players[1].leader.cardId = "OP09-022";
  state.players[1].characters = padChars([]);
  db.set("self-trigger", {
    ...CARDS.TRIGGER,
    id: "self-trigger",
    effectSchema: {
      effects: [
        {
          id: "play-self",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          actions: [{ type: "PLAY_SELF" }],
        },
      ],
    },
  });
  state.players[1].life = [
    { instanceId: "life-self", cardId: "self-trigger", face: "DOWN" },
  ];
  let result = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    db,
    0
  );
  expect(result.valid).toBe(true);
  for (let i = 0; i < 2; i++) {
    result = runPipeline(result.state, { type: "PASS" }, db, 0);
    expect(result.valid).toBe(true);
  }
  result = runPipeline(
    result.state,
    { type: "REVEAL_TRIGGER", reveal: true },
    db,
    1
  );
  expect(result.valid).toBe(true);
  expect(result.state.players[1].characters[0]).toMatchObject({
    cardId: "self-trigger",
    state: "RESTED",
    controller: 1,
  });
  expect(
    result.state.players[1].trash.some((c) => c.cardId === "self-trigger")
  ).toBe(false);
  expect(
    result.state.eventLog.find(
      (e) => e.type === "CARD_PLAYED" && e.payload.cardId === "self-trigger"
    )?.payload
  ).toMatchObject({ playedRested: true });
});

it("resolves real 9-cost Adio's On Play after hand play under Lim", () => {
  const { state, db } = setup();
  db.set("OP09-023", {
    ...CARDS.VANILLA,
    id: "OP09-023",
    name: "Adio",
    cost: 9,
    power: 9000,
    counter: null,
    color: ["Green"],
    attribute: ["Special"],
    types: ["ODYSSEY"],
    effectSchema: OP09_023_ADIO,
  });
  state.players[0].hand = [card("adio", "HAND", "OP09-023")];
  state.players[0].donCostArea.push({
    instanceId: "ninth-don",
    state: "ACTIVE",
    attachedTo: null,
  });
  state.players[0].donDeck = state.players[0].donDeck.slice(1);
  const result = runPipeline(
    state,
    { type: "PLAY_CARD", cardInstanceId: "adio" },
    db,
    0
  );
  expect(result.valid).toBe(true);
  const final = drain(result.state, db);
  expect(final.players[0].characters[0]).toMatchObject({
    cardId: "OP09-023",
    state: "RESTED",
  });
  expect(
    final.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
  ).toHaveLength(3);
  expect(
    final.players[0].donCostArea.filter((d) => d.state === "RESTED")
  ).toHaveLength(6);
});

it.each([true, false])(
  "Megalo pays REST_SELF only if it enters active (Lim=%s)",
  (lim) => {
    const { state, db } = setup();
    if (!lim) state.players[0].leader.cardId = CARDS.LEADER.id;
    db.set("EB04-018", {
      ...CARDS.VANILLA,
      id: "EB04-018",
      name: "Megalo",
      cost: 3,
      effectSchema: EB04_018_MEGALO,
    });
    state.players[0].hand = [card("megalo", "HAND", "EB04-018")];
    state.players[1].characters = padChars([
      { ...card("victim", "CHARACTER", CARDS.VANILLA.id, 1), state: "RESTED" },
    ]);
    const result = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: "megalo" },
      db,
      0
    );
    expect(result.valid).toBe(true);
    const final = drain(result.state, db);
    expect(final.players[0].characters[0]?.state).toBe("RESTED");
    expect(final.players[1].characters.filter(Boolean)).toHaveLength(
      lim ? 1 : 0
    );
  }
);
