import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import {
  getEffectiveBasePower,
  getEffectivePower,
} from "../engine/modifiers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// Canonical OP-13/OP-14 card text; OP14/EB04 FAQ (2026-09-09), Law and Issho rulings.
// All effect behavior comes from the production registry, never a test-authored effect.
function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    const value: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    };
    db.set(id, value);
    return value;
  }
  function put(
    id: string,
    controller: 0 | 1,
    zone: CardInstance["zone"] = "CHARACTER"
  ) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "STAGE") p.stage = card;
    else if (zone === "CHARACTER")
      p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    else if (zone === "TRASH") p.trash.push(card);
    else if (zone === "DECK") p.deck.push(card);
    if (["LEADER", "STAGE", "CHARACTER"].includes(zone))
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function act(action: GameAction, player = state.turn.activePlayerIndex) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function choice(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify({ action, prompt: state.pendingPrompt })
    ).toBe(rejected);
    state = result.state;
  }
  function select(ids: string[], rejected = false) {
    choice({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected);
  }
  function accept() {
    choice({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function targets() {
    const options = state.pendingPrompt?.options;
    expect(options?.promptType).toBe("SELECT_TARGET");
    if (options?.promptType !== "SELECT_TARGET")
      throw new Error(JSON.stringify(options));
    return options;
  }
  return {
    db,
    data,
    put,
    act,
    choice,
    select,
    accept,
    targets,
    get state() {
      return state;
    },
  };
}

describe("OPT-811 Garp leader alternatives", () => {
  it.each(["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy", "Monkey.D.Garp"])(
    "search resolves for %s iff named by the card",
    (name) => {
      const f = fixture();
      f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name });
      f.data("OP13-016", { cost: 1, power: 2000 });
      const garp = f.put("OP13-016", 0, "HAND");
      const top = f.state.players[0].deck.slice(0, 4);
      top.forEach((c, i) => {
        c.cardId = [
          CARDS.VANILLA.id,
          CARDS.DOUBLE_ATK.id,
          CARDS.BLOCKER.id,
          CARDS.UNBLOCKABLE.id,
        ][i];
      });
      const before = f.state.players[0].hand.length;
      f.act({ type: "PLAY_CARD", cardInstanceId: garp.instanceId });
      if (name === "Monkey.D.Garp") {
        expect(f.state.pendingPrompt).toBeNull();
        expect(f.state.players[0].hand).toHaveLength(before - 1);
      } else {
        expect(f.state.pendingPrompt?.options.promptType).toBe(
          "ARRANGE_TOP_CARDS"
        );
        f.choice({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: top[0].instanceId,
          orderedInstanceIds: top
            .slice(1)
            .reverse()
            .map((c) => c.instanceId),
          destination: "bottom",
        });
        expect(f.state.pendingPrompt).toBeNull();
        expect(
          f.state.players[0].hand.some((c) => c.cardId === CARDS.VANILLA.id)
        ).toBe(true);
        expect(f.state.players[0].hand).toHaveLength(before);
        expect(f.state.players[0].deck.slice(-3).map((c) => c.cardId)).toEqual(
          top
            .slice(1)
            .reverse()
            .map((c) => c.cardId)
        );
      }
    }
  );
});

describe("OPT-811 Usopp leader types", () => {
  it.each([["FILM"], ["Straw Hat Crew"], ["FILM", "Straw Hat Crew"], ["Navy"]])(
    "end turn with leader %j",
    (...types) => {
      const f = fixture();
      f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types });
      f.data("OP14-022");
      f.put("OP14-022", 0);
      f.state.players[0].donCostArea.forEach((d) => {
        d.state = "RESTED";
      });
      f.act({ type: "ADVANCE_PHASE" });
      if (types.includes("Navy")) {
        expect(
          f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
        ).toHaveLength(0);
      } else {
        expect(f.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
        f.choice({ type: "PLAYER_CHOICE", choiceId: "choose-value:2" });
        expect(
          f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
        ).toHaveLength(2);
      }
      expect(f.state.pendingPrompt).toBeNull();
    }
  );
});

function isshoFixture(character: boolean, stage: boolean) {
  const f = fixture();
  f.data("OP14-021", { power: 5000 });
  const issho = f.put("OP14-021", 0);
  const legal: CardInstance[] = [];
  if (character) legal.push(f.put(CARDS.VANILLA.id, 1));
  if (stage) legal.push(f.put(CARDS.STAGE.id, 1, "STAGE"));
  legal.forEach((c) => {
    c.state = "RESTED";
  });
  f.state.players[1].leader.state = "RESTED";
  const active = f.put(CARDS.VANILLA.id, 1);
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: issho.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  f.accept();
  return { f, legal, active };
}

describe("OPT-811 Issho single Character-or-Stage pool", () => {
  it.each([
    [true, false],
    [false, true],
    [true, true],
  ] as const)(
    "character %s stage %s: one rested field card",
    (character, stage) => {
      const { f, legal, active } = isshoFixture(character, stage);
      const options = f.targets();
      expect(new Set(options.validTargets)).toEqual(
        new Set(legal.map((c) => c.instanceId))
      );
      expect(options.countMax).toBe(1);
      expect(options.validTargets).not.toContain(active.instanceId);
      if (legal.length === 2)
        f.select(
          legal.map((c) => c.instanceId),
          true
        );
      f.select([legal.at(-1)!.instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      const prohibition = f.state.prohibitions.filter(
        (e) => e.prohibitionType === "CANNOT_REFRESH"
      );
      expect(prohibition.flatMap((e) => e.appliesTo)).toEqual([
        legal.at(-1)!.instanceId,
      ]);
      expect(f.state.players[0].life).toHaveLength(4);
      f.act({ type: "PASS" });
      f.act({ type: "PASS" });
      f.act({ type: "ADVANCE_PHASE" });
      if (f.state.turn.phase === "END") f.act({ type: "ADVANCE_PHASE" });
      expect(f.state.turn.activePlayerIndex).toBe(1);
      if (f.state.turn.phase === "REFRESH") f.act({ type: "ADVANCE_PHASE" });
      const field = [
        f.state.players[1].leader,
        ...f.state.players[1].characters,
        f.state.players[1].stage,
      ].filter((c): c is CardInstance => !!c);
      expect(
        field.find((c) => c.instanceId === legal.at(-1)!.instanceId)?.state
      ).toBe("RESTED");
      expect(
        field
          .filter((c) => c.instanceId !== legal.at(-1)!.instanceId)
          .every((c) => c.state === "ACTIVE")
      ).toBe(true);
    }
  );
  it("allows zero targets after taking life", () => {
    const { f } = isshoFixture(true, true);
    f.select([]);
    expect(
      f.state.prohibitions
        .filter((e) => e.prohibitionType === "CANNOT_REFRESH")
        .flatMap((e) => e.appliesTo)
    ).toHaveLength(0);
    expect(f.state.pendingPrompt).toBeNull();
  });
});

describe("OPT-811 Law Leader plus one friendly Character", () => {
  it("rejects two Characters and swaps Leader and chosen Character after paying two hand cards", () => {
    const f = fixture();
    f.data("OP14-009", { power: 7000 });
    const law = f.put("OP14-009", 1);
    const other = f.put(CARDS.VANILLA.id, 1);
    const leader = f.state.players[1].leader;
    const before = f.state.players[1].hand.length;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: f.state.players[0].leader.instanceId,
      targetInstanceId: leader.instanceId,
    });
    f.accept();
    f.select(f.targets().validTargets.slice(0, 2));
    const options = f.targets();
    expect(options.validTargets).not.toContain(
      f.state.players[0].leader.instanceId
    );
    f.select([law.instanceId, other.instanceId], true);
    f.select([leader.instanceId], true);
    f.select([leader.instanceId, f.state.players[0].leader.instanceId], true);
    f.select([leader.instanceId, law.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].hand).toHaveLength(before - 2);
    expect(
      getEffectiveBasePower(leader, f.db.get(leader.cardId)!, f.state, f.db)
    ).toBe(7000);
    expect(
      getEffectiveBasePower(law, f.db.get(law.cardId)!, f.state, f.db)
    ).toBe(5000);
    expect(
      getEffectiveBasePower(other, f.db.get(other.cardId)!, f.state, f.db)
    ).toBe(4000);
  });
});

function koByCounter(id: string) {
  const f = fixture();
  f.data(id, { power: 4000, types: ["Supernovas"] });
  const victim = f.put(id, 0);
  f.data("EB01-010", {
    type: "Event",
    power: null,
    cost: 1,
    effectText:
      "[Counter] K.O. up to 1 of your opponent's Characters with 6000 base power or less.",
  });
  const event = f.put("EB01-010", 1, "HAND");
  f.act({
    type: "DECLARE_ATTACK",
    attackerInstanceId: f.state.players[0].leader.instanceId,
    targetInstanceId: f.state.players[1].leader.instanceId,
  });
  f.act({ type: "PASS" });
  return { f, victim, event };
}

function koByMain(id: string, trashCount = 3) {
  const f = fixture();
  f.data(id, { power: 4000, cost: 0, types: ["Supernovas"] });
  const victim = f.put(id, 1);
  f.data("ST06-001", {
    ...CARDS.LEADER,
    id: "ST06-001",
    name: "Sakazuki",
    effectSchema: getEffectSchema("ST06-001")!,
  });
  const leader = f.put("ST06-001", 0, "LEADER");
  const trash = Array.from({ length: trashCount }, (_, i) =>
    f.put(
      [CARDS.VANILLA.id, CARDS.RUSH.id, CARDS.BLOCKER.id, CARDS.COUNTER.id][i],
      1,
      "TRASH"
    )
  );
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: leader.instanceId,
    effectId: "activate_ko_zero",
  });
  f.accept();
  f.select(f.targets().validTargets.slice(0, 1));
  f.select([victim.instanceId]);
  return { f, victim, trash };
}

describe("OPT-811 replacement turn gates", () => {
  it.each(["OP14-016", "OP14-029", "OP14-092"])(
    "%s does not replace opponent counter effect during its controller's turn",
    (id) => {
      const { f, victim, event } = koByCounter(id);
      Array.from({ length: 3 }, () => f.put(CARDS.VANILLA.id, 0, "TRASH"));
      f.act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: event.instanceId,
          counterTargetInstanceId: f.state.players[1].leader.instanceId,
        },
        1
      );
      f.select([victim.instanceId]);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[0].characters.filter(Boolean)).toHaveLength(0);
      expect(f.state.players[0].trash.some((c) => c.cardId === id)).toBe(true);
    }
  );
  it.each(["OP14-016", "OP14-029", "OP14-092"])(
    "%s substitutes during opponent turn",
    (id) => {
      const { f, victim, trash } = koByMain(id);
      expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
      f.accept();
      if (id === "OP14-029") f.select([f.state.players[1].leader.instanceId]);
      if (id === "OP14-092") {
        f.select(
          trash.slice(0, 2).map((c) => c.instanceId),
          true
        );
        f.select(trash.map((c) => c.instanceId));
        f.choice({
          type: "ARRANGE_TOP_CARDS",
          keptCardInstanceId: "",
          orderedInstanceIds: trash.map((c) => c.instanceId).reverse(),
          destination: "bottom",
        });
      }
      expect(f.state.pendingPrompt).toBeNull();
      expect(
        f.state.players[1].characters.some(
          (c) => c?.instanceId === victim.instanceId
        )
      ).toBe(true);
      if (id === "OP14-016")
        expect(
          getEffectivePower(
            f.state.players[1].leader,
            CARDS.LEADER,
            f.state,
            f.db
          )
        ).toBe(3000);
      if (id === "OP14-029")
        expect(f.state.players[1].leader.state).toBe("RESTED");
      if (id === "OP14-092") {
        expect(f.state.players[1].trash).toHaveLength(0);
        expect(f.state.players[1].deck.slice(-3).map((c) => c.cardId)).toEqual(
          trash.map((c) => c.cardId).reverse()
        );
      }
    }
  );
});

describe("OPT-811 Hancock friendly play multiplicity", () => {
  it.each([1, 2, 3])(
    "draws %i for friendly Characters played by registered Moria Trigger",
    (count) => {
      const f = fixture();
      f.data("OP14-041", { type: "Leader", cost: null, power: 5000 });
      f.put("OP14-041", 1, "LEADER");
      f.data("OP16-105", {
        triggerText: "[Trigger]",
        keywords: { ...CARDS.VANILLA.keywords, trigger: true },
      });
      const moria = f.put("OP16-105", 1, "HAND");
      f.state.players[1].hand = f.state.players[1].hand.filter(
        (c) => c !== moria
      );
      moria.zone = "LIFE";
      f.state.players[1].life = [
        { instanceId: moria.instanceId, cardId: moria.cardId, face: "DOWN" },
      ];
      for (const name of ["Absalom", "Dr. Hogback", "Perona"].slice(0, count)) {
        f.data(name, { name, cost: 4 });
        f.put(name, 1, "TRASH");
      }
      const before = f.state.players[1].hand.length;
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: f.state.players[0].leader.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
      f.act({ type: "PASS" });
      f.act({ type: "PASS" });
      f.act({ type: "REVEAL_TRIGGER", reveal: true }, 1);
      for (let i = 0; f.state.pendingPrompt && i < 15; i++) {
        const options = f.state.pendingPrompt.options;
        if (options.promptType === "OPTIONAL_EFFECT") f.accept();
        else if (options.promptType === "SELECT_TARGET")
          f.select(options.validTargets.slice(0, options.countMax));
        else if (options.promptType === "PLAYER_CHOICE")
          f.choice({
            type: "PLAYER_CHOICE",
            choiceId: options.choices.find((c) => !c.disabled)!.id,
          });
        else throw new Error(JSON.stringify(options));
      }
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(count);
      expect(f.state.players[1].hand).toHaveLength(before + count);
    }
  );
  it("draws zero for an opponent-controlled play on the opponent's turn", () => {
    const f = fixture();
    f.data("OP14-041", { type: "Leader", cost: null });
    f.put("OP14-041", 1, "LEADER");
    const before = f.state.players[1].hand.length;
    const card = f.put(CARDS.VANILLA.id, 0, "HAND");
    f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
    expect(f.state.players[1].hand).toHaveLength(before);
    expect(f.state.pendingPrompt).toBeNull();
  });
});

describe("OPT-811 Hancock simultaneous authored batch", () => {
  it.each([1, 2, 3])(
    "draws for each of %i Characters in Dadan's single play action",
    (count) => {
      const f = fixture();
      f.data("OP14-041", { type: "Leader", cost: null, power: 5000 });
      f.put("OP14-041", 1, "LEADER");
      f.data("EB03-053", { power: 4000, cost: 0 });
      const nami = f.put("EB03-053", 1);
      f.data("ST13-006", { power: 4000, cost: 5 });
      const dadan = f.put("ST13-006", 1, "HAND");
      const named = ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"]
        .slice(0, count)
        .map((name) => {
          f.data(name, { name, cost: 2 });
          return f.put(name, 1, "HAND");
        });
      f.data("ST06-001", {
        ...CARDS.LEADER,
        id: "ST06-001",
        name: "Sakazuki",
        effectSchema: getEffectSchema("ST06-001")!,
      });
      const attacker = f.put("ST06-001", 0, "LEADER");
      const beforeDeck = f.state.players[1].deck.length;
      f.act({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: attacker.instanceId,
        effectId: "activate_ko_zero",
      });
      f.accept();
      f.select(f.targets().validTargets.slice(0, 1));
      f.select([nami.instanceId]);
      f.accept();
      for (let i = 0; f.state.pendingPrompt && i < 20; i++) {
        const options = f.state.pendingPrompt.options;
        if (options.promptType === "SELECT_TARGET") {
          const namedIds = named
            .map((c) => c.instanceId)
            .filter((id) => options.validTargets.includes(id));
          if (options.validTargets.includes(dadan.instanceId))
            f.select([dadan.instanceId]);
          else if (namedIds.length) f.select(namedIds);
          else f.select(options.validTargets.slice(0, options.countMax));
        } else if (options.promptType === "PLAYER_CHOICE")
          f.choice({
            type: "PLAYER_CHOICE",
            choiceId: options.choices.find((c) => !c.disabled)!.id,
          });
        else if (options.promptType === "OPTIONAL_EFFECT") f.accept();
        else throw new Error(JSON.stringify(options));
      }
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(
        count + 1
      );
      // Dadan itself draws once; its one multi-target PLAY_CARD action draws count more.
      expect(f.state.players[1].deck).toHaveLength(beforeDeck - count - 1);
    }
  );
});

describe("OPT-811 continuation and unavailable replacements", () => {
  it.each(["OP14-016", "OP14-029", "OP14-092"])(
    "declining %s allows the pending K.O.",
    (id) => {
      const { f } = koByMain(id);
      f.choice({ type: "PLAYER_CHOICE", choiceId: "skip" });
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(0);
      expect(f.state.players[1].trash.some((c) => c.cardId === id)).toBe(true);
    }
  );
  it.each([0, 1, 2])(
    "Mr3 cannot replace with only %i trash cards",
    (trashCount) => {
      const { f } = koByMain("OP14-092", trashCount);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.players[1].characters.filter(Boolean)).toHaveLength(0);
      expect(
        f.state.players[1].trash.some((c) => c.cardId === "OP14-092")
      ).toBe(true);
    }
  );
  it("Hancock does not draw for friendly play during its own turn", () => {
    const f = fixture();
    f.data("OP14-041", { type: "Leader", cost: null });
    f.put("OP14-041", 0, "LEADER");
    const card = f.put(CARDS.VANILLA.id, 0, "HAND");
    const deckSize = f.state.players[0].deck.length;
    f.act({ type: "PLAY_CARD", cardInstanceId: card.instanceId });
    expect(f.state.players[0].deck).toHaveLength(deckSize);
  });
  it.each([0, 1, 2])(
    "Usopp allows choosing %i DON with FILM leader",
    (count) => {
      const f = fixture();
      f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, types: ["FILM"] });
      f.data("OP14-022");
      f.put("OP14-022", 0);
      f.state.players[0].donCostArea.forEach((d) => {
        d.state = "RESTED";
      });
      f.act({ type: "ADVANCE_PHASE" });
      f.choice({ type: "PLAYER_CHOICE", choiceId: `choose-value:${count}` });
      expect(f.state.pendingPrompt).toBeNull();
      expect(
        f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE")
      ).toHaveLength(count);
    }
  );
});

describe("OPT-811 Garp search boundary", () => {
  it("excludes cost two, accepts cost three and orders all other revealed cards", () => {
    const f = fixture();
    f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name: "Portgas.D.Ace" });
    f.data("OP13-016", { cost: 1 });
    const garp = f.put("OP13-016", 0, "HAND");
    const top = f.state.players[0].deck.slice(0, 4);
    top.forEach((c, i) => {
      c.cardId = [
        CARDS.RUSH.id,
        CARDS.VANILLA.id,
        CARDS.COUNTER.id,
        CARDS.STAGE.id,
      ][i];
    });
    f.act({ type: "PLAY_CARD", cardInstanceId: garp.instanceId });
    const options = f.state.pendingPrompt?.options;
    expect(options?.promptType).toBe("ARRANGE_TOP_CARDS");
    if (options?.promptType !== "ARRANGE_TOP_CARDS")
      throw new Error("Missing search prompt");
    expect(options.validTargets).toEqual([top[1].instanceId]);
    f.choice({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: top[1].instanceId,
      orderedInstanceIds: [top[3], top[2], top[0]].map((c) => c.instanceId),
      destination: "bottom",
    });
    expect(f.state.players[0].hand.at(-1)?.cardId).toBe(CARDS.VANILLA.id);
    expect(f.state.players[0].deck.slice(-3).map((c) => c.cardId)).toEqual([
      CARDS.STAGE.id,
      CARDS.COUNTER.id,
      CARDS.RUSH.id,
    ]);
  });
  it("can keep zero even with eligible cards", () => {
    const f = fixture();
    f.db.set(CARDS.LEADER.id, { ...CARDS.LEADER, name: "Monkey.D.Luffy" });
    f.data("OP13-016", { cost: 1 });
    const garp = f.put("OP13-016", 0, "HAND");
    const top = f.state.players[0].deck.slice(0, 4);
    const beforeHand = f.state.players[0].hand.length;
    const beforeDeck = f.state.players[0].deck.length;
    f.act({ type: "PLAY_CARD", cardInstanceId: garp.instanceId });
    f.choice({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: top.map((c) => c.instanceId).reverse(),
      destination: "bottom",
    });
    expect(f.state.players[0].hand).toHaveLength(beforeHand - 1);
    expect(f.state.players[0].deck).toHaveLength(beforeDeck);
    expect(f.state.pendingPrompt).toBeNull();
  });
});

describe("OPT-811 Issho life and decline boundaries", () => {
  it.each(["empty", "decline"])(
    "does not freeze a card when life payment is %s",
    (mode) => {
      const f = fixture();
      f.data("OP14-021");
      const issho = f.put("OP14-021", 0);
      f.put(CARDS.STAGE.id, 1, "STAGE").state = "RESTED";
      if (mode === "empty") f.state.players[0].life = [];
      f.act({
        type: "DECLARE_ATTACK",
        attackerInstanceId: issho.instanceId,
        targetInstanceId: f.state.players[1].leader.instanceId,
      });
      f.choice({
        type: "PLAYER_CHOICE",
        choiceId: mode === "decline" ? "skip" : "accept",
      });
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.prohibitions).toHaveLength(0);
    }
  );
});
