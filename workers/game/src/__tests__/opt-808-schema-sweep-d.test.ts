import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  GameState,
} from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { evaluateCondition } from "../engine/conditions.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const printedText: Record<string, string> = {
  "OP07-059":
    "[When Attacking] DON!! \u22123 (You may return the specified number of DON!! cards from your field to your DON!! deck.): If you have 3 or more {Foxy Pirates} type Characters, select your opponent's rested Leader and up to 1 Character card. The selected cards will not become active in your opponent's next Refresh Phase.",
  "OP08-006":
    "[Your Turn] If you have [Kuromarimo] and [Chess] in your trash, this Character gains +2000 power.",
  "OP08-020":
    "[Opponent's Turn] All of your {Drum Kingdom} type Characters gain +1000 power.",
  "OP08-045":
    "If this Character would be removed from the field by your opponent's effect or K.O.'d, trash this Character and draw 1 card instead.",
  "OP08-069":
    "[On Play] DON!! \u22121, You may trash 1 card from your hand: Add up to 1 card from the top of your deck to the top of your Life cards. Then, add up to 1 of your opponent's Characters with a cost of 6 or less to the top or bottom of your opponent's Life cards face-up.",
  "OP08-095":
    "[Main] If you have 10 or more cards in your trash, up to 1 of your Characters gains +2000 power until the end of your opponent's next turn.\n\n**Trigger:** [Trigger] Up to 1 of your Leader or Character cards gains +2000 power during this turn.",
  "OP08-118":
    "[On Play] Select up to 2 of your opponent's Characters, and give 1 Character \u22123000 power and the other \u22122000 power until the end of your opponent's next turn. Then, K.O. up to 1 of your opponent's Characters with 3000 power or less.",
};

// Expected behavior comes from OP-07/OP-08 printed text and qa_op08.md.
// Every effect below is obtained from the production registry and started by a game action.
function card(
  cardId: string,
  instanceId: string,
  controller: 0 | 1,
  zone: CardInstance["zone"] = "CHARACTER"
): CardInstance {
  return {
    cardId,
    instanceId,
    controller,
    owner: controller,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
  };
}
function fixture(id: string, overrides: Partial<CardData> = {}) {
  const db = createTestCardDb();
  const schema = getEffectSchema(id)!;
  const data: CardData = {
    ...CARDS.VANILLA,
    id,
    name: schema.card_name!,
    effectSchema: schema,
    effectText: printedText[id],
    cost: 1,
    ...overrides,
  };
  db.set(id, data);
  const state = createBattleReadyState(db);
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  return { state, db, data };
}
function act(
  state: GameState,
  action: GameAction,
  db: Map<string, CardData>,
  player: 0 | 1 = 0
): GameState {
  if (state.pendingPrompt) {
    expect(state.pendingPrompt.respondingPlayer).toBe(player);
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(result.responseRejected).toBe(false);
    return result.state;
  }
  const result = runPipeline(state, action, db, player);
  expect(result.valid, result.error).toBe(true);
  return result.state;
}
function select(
  state: GameState,
  ids: string[],
  db: Map<string, CardData>,
  player: 0 | 1 = 0
) {
  expect(state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return act(
    state,
    { type: "SELECT_TARGET", selectedInstanceIds: ids },
    db,
    player
  );
}
function choose(
  state: GameState,
  id: string,
  db: Map<string, CardData>,
  player: 0 | 1 = 0
) {
  return act(state, { type: "PLAYER_CHOICE", choiceId: id }, db, player);
}
function power(
  state: GameState,
  instanceId: string,
  db: Map<string, CardData>
) {
  const c = state.players
    .flatMap((p) => p.characters)
    .find((c) => c?.instanceId === instanceId)!;
  return getEffectivePower(c, db.get(c.cardId)!, state, db);
}
function play(
  state: GameState,
  data: CardData,
  db: Map<string, CardData>,
  id = "source"
) {
  state.players[0].hand.push(card(data.id, id, 0, "HAND"));
  return act(state, { type: "PLAY_CARD", cardInstanceId: id }, db);
}

describe("OPT-808 authored pipeline", () => {
  it.each([0, 1, 2])(
    "Rayleigh: %i debuff targets, followed by a distinct K.O. target",
    (count) => {
      const f = fixture("OP08-118", { cost: 8 });
      f.db.set("HIGH", { ...CARDS.VANILLA, id: "HIGH", power: 7000 });
      f.db.set("LOW", { ...CARDS.VANILLA, id: "LOW", power: 3000 });
      f.state.players[1].characters = padChars([
        card("HIGH", "first", 1),
        card("HIGH", "second", 1),
        card("LOW", "third", 1),
      ]);
      let state = play(f.state, f.data, f.db);
      const first = state.pendingPrompt!.options;
      expect(first.promptType).toBe("SELECT_TARGET");
      if (first.promptType !== "SELECT_TARGET")
        throw new Error("debuff prompt missing");
      expect(first.countMax).toBe(1);
      state = select(state, count ? ["first"] : [], f.db);
      const second = state.pendingPrompt!.options;
      expect(second.promptType).toBe("SELECT_TARGET");
      if (second.promptType !== "SELECT_TARGET")
        throw new Error("second debuff prompt missing");
      if (count) expect(second.validTargets).not.toContain("first");
      state = select(state, count === 2 ? ["second"] : [], f.db);
      expect(power(state, "first", f.db)).toBe(count ? 4000 : 7000);
      expect(power(state, "second", f.db)).toBe(count === 2 ? 5000 : 7000);
      state = select(state, ["third"], f.db);
      expect(state.players[1].trash.some((c) => c.cardId === "LOW")).toBe(true);
      expect(state.players[1].characters.filter(Boolean)).toHaveLength(2);
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toHaveLength(0);
    }
  );

  it.each([
    "both",
    "missing",
    "field",
    "staging",
    "lookalike",
    "opponent",
  ] as const)("Chessmarimo checks exact named trash: %s", (mode) => {
    const f = fixture("OP08-006", { power: 4000, cost: 3 });
    for (const name of ["Kuromarimo", "Chess", "Chessmarimo"])
      f.db.set(name, { ...CARDS.VANILLA, id: name, name });
    const ku = card("Kuromarimo", "ku", 0, "TRASH");
    const ch = card(
      mode === "lookalike" ? "Chessmarimo" : "Chess",
      "ch",
      0,
      "TRASH"
    );
    if (mode === "field")
      f.state.players[0].characters = padChars([
        { ...ku, zone: "CHARACTER" },
        { ...ch, zone: "CHARACTER" },
      ]);
    else
      f.state.players[mode === "opponent" ? 1 : 0].trash.push(
        ku,
        ...(mode === "missing" ? [] : [ch])
      );
    if (mode === "staging") f.state.turn.triggerStagingInstanceIds = ["ch"];
    let state = play(f.state, f.data, f.db);
    const sourceId = state.players[0].characters.find(
      (c) => c?.cardId === f.data.id
    )!.instanceId;
    expect(power(state, sourceId, f.db)).toBe(mode === "both" ? 6000 : 4000);
    state = act(state, { type: "ADVANCE_PHASE" }, f.db);
    expect(power(state, sourceId, f.db)).toBe(4000);
    while (state.turn.phase !== "MAIN")
      state = act(state, { type: "ADVANCE_PHASE" }, f.db, 1);
    state = act(state, { type: "ADVANCE_PHASE" }, f.db, 1);
    while (state.turn.phase !== "MAIN")
      state = act(state, { type: "ADVANCE_PHASE" }, f.db);
    state = act(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: sourceId,
        targetInstanceId: state.players[1].leader.instanceId,
      },
      f.db
    );
    expect(power(state, sourceId, f.db)).toBe(
      mode === "both" || mode === "staging" ? 6000 : 4000
    );
  });

  it.each([true, false])(
    "rested Drum Kingdom aura on opponent turn=%s",
    (opponentTurn) => {
      const f = fixture("OP08-020", { type: "Stage", power: null });
      f.db.set("DRUM", {
        ...CARDS.VANILLA,
        id: "DRUM",
        power: 5000,
        types: ["Drum Kingdom"],
      });
      f.state.players[0].characters = padChars([
        card("DRUM", "drum", 0),
        card(CARDS.VANILLA.id, "other", 0),
      ]);
      let state = play(f.state, f.data, f.db);
      state.players[0].stage!.state = "RESTED";
      if (opponentTurn) state = act(state, { type: "ADVANCE_PHASE" }, f.db);
      expect(power(state, "drum", f.db)).toBe(opponentTurn ? 6000 : 5000);
      expect(power(state, "other", f.db)).toBe(CARDS.VANILLA.power);
    }
  );

  it.each([true, false])(
    "Foxy targets a rested Leader only (rested=%s), preserves Character clause",
    (rested) => {
      const f = fixture("OP07-059", { type: "Leader", cost: null, life: 5 });
      const source = card(f.data.id, "foxy", 0, "LEADER");
      f.state.players[0].leader = source;
      f.db.set("PIRATE", {
        ...CARDS.VANILLA,
        id: "PIRATE",
        types: ["Foxy Pirates"],
      });
      f.state.players[0].characters = padChars(
        [0, 1, 2].map((i) => card("PIRATE", `pirate-${i}`, 0))
      );
      f.state.players[1].leader.state = rested ? "RESTED" : "ACTIVE";
      f.state.players[1].characters = padChars([
        { ...card(CARDS.VANILLA.id, "target", 1), state: "RESTED" },
      ]);
      let state = registerCardEnteredField(f.state, source, f.data);
      state = act(
        state,
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: "foxy",
          targetInstanceId: state.players[1].leader.instanceId,
        },
        f.db
      );
      if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
        state = choose(state, "activate", f.db);
      state = select(state, ["target"], f.db);
      expect(
        state.prohibitions
          .filter((p) => p.prohibitionType === "CANNOT_REFRESH")
          .flatMap((p) => p.appliesTo)
      ).toEqual(
        expect.arrayContaining([
          "target",
          ...(rested ? [state.players[1].leader.instanceId] : []),
        ])
      );
      if (!rested)
        expect(state.prohibitions.flatMap((p) => p.appliesTo)).not.toContain(
          state.players[1].leader.instanceId
        );
      expect(state.players[0].donCostArea).toHaveLength(5);
      for (let i = 0; state.turn.battle && i < 5; i++)
        state = act(state, { type: "PASS" }, f.db, 1);
      state = act(state, { type: "ADVANCE_PHASE" }, f.db);
      state = act(state, { type: "ADVANCE_PHASE" }, f.db, 1);
      expect(state.players[1].leader.state).toBe(rested ? "RESTED" : "ACTIVE");
      expect(state.players[1].characters[0]!.state).toBe("RESTED");
    }
  );

  it.each([0, 1] as const)(
    "Thatch: bounce caused by player %i",
    (controller) => {
      const f = fixture("OP08-045", { cost: 4 });
      const thatch = card(f.data.id, "thatch", 0);
      f.state.players[0].characters = padChars([thatch]);
      const crocodileSchema = getEffectSchema("ST03-001")!;
      const crocodileData: CardData = {
        ...CARDS.VANILLA,
        id: "ST03-001",
        name: "Crocodile",
        type: "Leader",
        cost: null,
        effectSchema: crocodileSchema,
      };
      f.db.set(crocodileData.id, crocodileData);
      const leader = card(crocodileData.id, "crocodile", controller, "LEADER");
      f.state.players[controller].leader = leader;
      f.state.turn.activePlayerIndex = controller;
      let state = registerCardEnteredField(f.state, thatch, f.data);
      state = registerCardEnteredField(state, leader, crocodileData);
      const deckBefore = state.players[0].deck.length;
      const handBefore = state.players[0].hand.length;
      state = act(
        state,
        {
          type: "ACTIVATE_EFFECT",
          cardInstanceId: leader.instanceId,
          effectId: "activate_bounce",
        },
        f.db,
        controller
      );
      state = select(state, ["thatch"], f.db, controller);
      expect(state.players[0].characters.filter(Boolean)).toHaveLength(0);
      expect(state.players[0].deck).toHaveLength(deckBefore - controller);
      expect(state.players[0].hand).toHaveLength(handBefore + 1);
      expect(state.players[0].trash.some((c) => c.cardId === f.data.id)).toBe(
        controller === 1
      );
      expect(state.players[0].hand.some((c) => c.cardId === f.data.id)).toBe(
        controller === 0
      );
      expect(state.pendingPrompt).toBeNull();
    }
  );
  it.each(["battle", "self", "opponent"] as const)(
    "Thatch replaces %s K.O. exactly once, without a K.O. event",
    (cause) => {
      const f = fixture("OP08-045", { cost: 4, power: 6000 });
      const thatch = {
        ...card(f.data.id, "thatch", 0),
        state: "RESTED" as const,
      };
      f.state.players[0].characters = padChars([thatch]);
      let state = registerCardEnteredField(f.state, thatch, f.data);
      const handBefore = state.players[0].hand.length;
      const deckBefore = state.players[0].deck.length;
      if (cause === "battle") {
        state.turn.activePlayerIndex = 1;
        f.db.set("ATTACKER", { ...CARDS.VANILLA, id: "ATTACKER", power: 7000 });
        state.players[1].characters = padChars([
          card("ATTACKER", "attacker", 1),
        ]);
        state = act(
          state,
          {
            type: "DECLARE_ATTACK",
            attackerInstanceId: "attacker",
            targetInstanceId: "thatch",
          },
          f.db,
          1
        );
        for (let i = 0; state.turn.battle && i < 5; i++)
          state = act(state, { type: "PASS" }, f.db, 0);
      } else if (cause === "opponent") {
        state.turn.activePlayerIndex = 1;
        const schema = getEffectSchema("OP08-118")!;
        f.db.set("OP08-118", {
          ...CARDS.VANILLA,
          id: "OP08-118",
          cost: 8,
          effectSchema: schema,
        });
        state.players[1].donCostArea.push(
          ...state.players[1].donDeck.splice(0, 2)
        );
        state.players[1].hand.push(card("OP08-118", "rayleigh", 1, "HAND"));
        state = act(
          state,
          { type: "PLAY_CARD", cardInstanceId: "rayleigh" },
          f.db,
          1
        );
        state = select(state, ["thatch"], f.db, 1);
        // No distinct second Character exists, so the -2000 selection is skipped.
        state = select(state, ["thatch"], f.db, 1);
      } else {
        const schema = getEffectSchema("OP08-119")!;
        const data = { ...CARDS.VANILLA, id: "OP08-119", effectSchema: schema };
        f.db.set(data.id, data);
        const kaido = card(data.id, "kaido", 0);
        state.players[0].characters[1] = kaido;
        state.players[0].donCostArea.push(
          ...state.players[0].donDeck.splice(0, 2)
        );
        state = registerCardEnteredField(state, kaido, data);
        state = act(
          state,
          {
            type: "DECLARE_ATTACK",
            attackerInstanceId: "kaido",
            targetInstanceId: state.players[1].leader.instanceId,
          },
          f.db
        );
        if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
          state = choose(state, "activate", f.db);
        state = choose(state, "choose-value:0", f.db);
      }
      expect(
        state.players[0].characters.some((c) => c?.instanceId === "thatch")
      ).toBe(false);
      expect(
        state.players[0].trash.filter((c) => c.cardId === f.data.id)
      ).toHaveLength(1);
      expect(state.players[0].hand).toHaveLength(handBefore + 1);
      expect(state.players[0].deck).toHaveLength(deckBefore - 1);
      expect(
        state.eventLog.filter(
          (e) => e.type === "CARD_KO" && e.payload.cardInstanceId === "thatch"
        )
      ).toHaveLength(0);
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toHaveLength(0);
    }
  );

  it.each(["Top", "Bottom"])(
    "Linlin completes costs and %s choice to the target owner's Life; named trash updates mid-turn",
    (label) => {
      const f = fixture("OP08-069", { cost: 9 });
      f.state.players[0].donCostArea.push(
        ...f.state.players[0].donDeck.splice(0, 2)
      );
      const chessSchema = getEffectSchema("OP08-006")!;
      const chessData = {
        ...CARDS.VANILLA,
        id: "OP08-006",
        power: 4000,
        effectSchema: chessSchema,
      };
      f.db.set(chessData.id, chessData);
      for (const name of ["Kuromarimo", "Chess"])
        f.db.set(name, { ...CARDS.VANILLA, id: name, name });
      const chessmarimo = card(chessData.id, "chessmarimo", 0);
      f.state.players[0].characters = padChars([chessmarimo]);
      f.state.players[0].trash.push(card("Kuromarimo", "ku", 0, "TRASH"));
      f.state.players[0].hand.push(card("Chess", "ch", 0, "HAND"));
      f.state.players[1].characters = padChars([
        card(CARDS.VANILLA.id, "target", 1),
      ]);
      let state = registerCardEnteredField(f.state, chessmarimo, chessData);
      expect(power(state, "chessmarimo", f.db)).toBe(4000);
      const lifeBefore = structuredClone(state.players[1].life);
      const ownLifeBefore = state.players[0].life.length;
      const handBefore = state.players[0].hand.length;
      const donBefore = state.players[0].donDeck.length;
      state = play(state, f.data, f.db);
      if (state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
        state = choose(state, "activate", f.db);
      state = select(state, ["ch"], f.db);
      expect(power(state, "chessmarimo", f.db)).toBe(6000);
      state = choose(state, "choose-value:1", f.db);
      state = select(state, ["target"], f.db);
      const options = state.pendingPrompt!.options;
      expect(options.promptType).toBe("PLAYER_CHOICE");
      if (options.promptType !== "PLAYER_CHOICE")
        throw new Error("Life position choice missing");
      state = choose(
        state,
        options.choices.find((c) => c.label === label)!.id,
        f.db
      );
      const life = state.players[1].life;
      expect(label === "Top" ? life.slice(1) : life.slice(0, -1)).toEqual(
        lifeBefore
      );
      expect(life.at(label === "Top" ? 0 : -1)).toMatchObject({
        cardId: CARDS.VANILLA.id,
        face: "UP",
      });
      expect(life.at(label === "Top" ? 0 : -1)?.instanceId).not.toBe("target");
      expect(state.players[0].life).toHaveLength(ownLifeBefore + 1);
      expect(state.players[0].hand).toHaveLength(handBefore - 1);
      expect(state.players[0].donDeck).toHaveLength(donBefore + 1);
      expect(state.players[1].characters.filter(Boolean)).toHaveLength(0);
      expect(state.pendingPrompt).toBeNull();
      expect(state.effectStack).toHaveLength(0);
    }
  );

  it("unfiltered TRASH_COUNT preserves legacy counts and trigger-staging exclusion", () => {
    const f = fixture("OP08-006");
    f.state.players[0].trash.push(
      card(CARDS.VANILLA.id, "normal", 0, "TRASH"),
      card(CARDS.VANILLA.id, "staged", 0, "TRASH")
    );
    f.state.turn.triggerStagingInstanceIds = ["staged"];
    expect(
      evaluateCondition(
        f.state,
        { type: "TRASH_COUNT", controller: "SELF", operator: "==", value: 1 },
        { sourceCardInstanceId: "source", controller: 0, cardDb: f.db }
      )
    ).toBe(true);
  });

  it.each([8, 9])(
    "legacy authored trash threshold: %i cards before playing Iron Body Fang Flash",
    (trashCount) => {
      const f = fixture("OP08-095", { type: "Event", cost: 1 });
      f.state.players[0].characters = padChars([
        card(CARDS.VANILLA.id, "target", 0),
      ]);
      f.state.players[0].trash = Array.from({ length: trashCount }, (_, i) =>
        card(CARDS.VANILLA.id, `trash-${i}`, 0, "TRASH")
      );
      let state = play(f.state, f.data, f.db);
      // Playing the Event itself adds the tenth trash card before [Main] resolves.
      if (trashCount === 9) state = select(state, ["target"], f.db);
      expect(power(state, "target", f.db)).toBe(
        CARDS.VANILLA.power! + (trashCount === 9 ? 2000 : 0)
      );
      expect(state.pendingPrompt).toBeNull();
    }
  );
});
