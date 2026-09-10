import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
} from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
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
  const data: CardData = {
    ...CARDS.VANILLA,
    id,
    name: schema.card_name!,
    cost: 1,
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
  const act = (action: GameAction, player: 0 | 1 = 0) => {
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
  const fieldSource = () => {
    state.players[0].hand = state.players[0].hand.filter(
      (c) => c.instanceId !== source.instanceId
    );
    source.zone = "CHARACTER";
    state.players[0].characters[0] = source;
    state = registerCardEnteredField(state, source, data);
  };
  return {
    cardDb,
    source,
    act,
    fieldSource,
    get state() {
      return state;
    },
  };
}

describe("OPT-807 authored SEARCH_AND_PLAY", () => {
  for (const id of ["ST12-010", "ST12-013"]) {
    it.each([false, true])(
      `${id}: zero-match=%s preserves top/bottom choice`,
      (noMatch) => {
        for (const destination of ["top", "bottom"] as const) {
          const f = fixture(id);
          f.cardDb.set("revealed", {
            ...CARDS.VANILLA,
            id: "revealed",
            cost: noMatch ? 3 : 2,
          });
          const revealed = {
            ...f.source,
            cardId: "revealed",
            instanceId: "revealed",
            zone: "DECK" as const,
          };
          f.state.players[0].deck.unshift(revealed);
          const originalDeck = f.state.players[0].deck.map((c) => c.instanceId);
          if (id === "ST12-013") f.fieldSource();
          f.act(
            id === "ST12-010"
              ? { type: "PLAY_CARD", cardInstanceId: "source" }
              : {
                  type: "DECLARE_ATTACK",
                  attackerInstanceId: "source",
                  targetInstanceId: f.state.players[1].leader.instanceId,
                }
          );
          expect(f.state.pendingPrompt?.options.promptType).toBe(
            "ARRANGE_TOP_CARDS"
          );
          f.act({
            type: "ARRANGE_TOP_CARDS",
            keptCardInstanceId: "",
            orderedInstanceIds: ["revealed"],
            destination,
          });
          expect(f.state.players[0].deck.map((c) => c.instanceId)).toEqual(
            destination === "top"
              ? originalDeck
              : [...originalDeck.slice(1), "revealed"]
          );
          expect(f.state.pendingPrompt).toBeNull();
        }
      }
    );
    it(`${id}: plays only revealed cost-2 card with printed entry state`, () => {
      const f = fixture(id);
      f.cardDb.set("revealed", { ...CARDS.VANILLA, id: "revealed", cost: 2 });
      f.state.players[0].deck.unshift({
        ...f.source,
        cardId: "revealed",
        instanceId: "revealed",
        zone: "DECK",
      });
      if (id === "ST12-013") f.fieldSource();
      f.act(
        id === "ST12-010"
          ? { type: "PLAY_CARD", cardInstanceId: "source" }
          : {
              type: "DECLARE_ATTACK",
              attackerInstanceId: "source",
              targetInstanceId: f.state.players[1].leader.instanceId,
            }
      );
      f.act({
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "revealed",
        orderedInstanceIds: [],
        destination: "top",
      });
      expect(
        f.state.players[0].characters.find((c) => c?.cardId === "revealed")
      ).toMatchObject({ state: id === "ST12-013" ? "RESTED" : "ACTIVE" });
      expect(f.state.players[0].deck.some((c) => c.cardId === "revealed")).toBe(
        false
      );
      expect(f.state.pendingPrompt).toBeNull();
    });
  }
});

describe("OPT-807 authored field to Life", () => {
  for (const id of ["OP05-096", "OP06-107"]) {
    it.each(["Top", "Bottom", "skip"])(`${id}: %s`, (position) => {
      const f = fixture(id);
      const own = id === "OP06-107";
      const player = own ? 0 : 1;
      f.cardDb.set("life-target", {
        ...CARDS.VANILLA,
        id: "life-target",
        cost: 1,
        types: ["Land of Wano"],
      });
      f.state.players[player].characters[1] = {
        ...f.source,
        cardId: "life-target",
        instanceId: "life-target",
        owner: player,
        controller: player,
        zone: "CHARACTER",
      };
      if (id === "OP05-096")
        f.cardDb.set(id, {
          ...f.cardDb.get(id)!,
          type: "Event",
          effectText: "[Main] Choose one:",
        });
      f.cardDb.set("ineligible", {
        ...CARDS.VANILLA,
        id: "ineligible",
        cost: 2,
        name: own ? "Kouzuki Momonosuke" : "Too expensive",
        types: ["Land of Wano"],
      });
      f.state.players[player].characters[2] = {
        ...f.state.players[player].characters[1]!,
        instanceId: "ineligible",
        cardId: "ineligible",
      };
      const before = structuredClone(f.state.players[player].life);
      f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
      if (id === "OP05-096") f.act({ type: "PLAYER_CHOICE", choiceId: "2" });
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      const targets = f.state.pendingPrompt!.options;
      if (targets.promptType !== "SELECT_TARGET")
        throw new Error("Missing targets");
      expect(targets.validTargets).not.toContain("ineligible");
      f.act({
        type: "SELECT_TARGET",
        selectedInstanceIds: position === "skip" ? [] : ["life-target"],
      });
      if (position !== "skip") {
        const options = f.state.pendingPrompt?.options;
        expect(options?.promptType).toBe("PLAYER_CHOICE");
        if (options?.promptType !== "PLAYER_CHOICE")
          throw new Error("Missing Life destination choice");
        f.act({
          type: "PLAYER_CHOICE",
          choiceId: options.choices.find((c) => c.label === position)!.id,
        });
        expect(
          f.state.players[player].life.at(position === "Top" ? 0 : -1)
        ).toMatchObject({ cardId: "life-target", face: "UP" });
        expect(
          position === "Top"
            ? f.state.players[player].life.slice(1)
            : f.state.players[player].life.slice(0, -1)
        ).toEqual(before);
        expect(f.state.players[player].characters[1]).toBeNull();
      } else {
        expect(f.state.players[player].life).toEqual(before);
        expect(f.state.players[player].characters[1]?.cardId).toBe(
          "life-target"
        );
      }
      expect(f.state.pendingPrompt).toBeNull();
    });
  }
});

describe("OPT-807 non-position semantics", () => {
  it.each([5000, 6000])(
    "Zephyr checks selected Character's %i power, not another weak card",
    (power) => {
      const f = fixture("OP06-074");
      f.cardDb.set("target", { ...CARDS.VANILLA, id: "target", power });
      f.state.players[1].characters[0] = {
        ...f.source,
        cardId: "target",
        instanceId: "target",
        owner: 1,
        controller: 1,
        zone: "CHARACTER",
      };
      f.state.players[1].characters[1] = {
        ...f.source,
        cardId: CARDS.VANILLA.id,
        instanceId: "weak",
        owner: 1,
        controller: 1,
        zone: "CHARACTER",
      };
      f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
      if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
        f.act({ type: "PLAYER_CHOICE", choiceId: "activate" });
      expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["target"] });
      expect(f.state.players[1].characters[0] === null).toBe(power === 5000);
      expect(f.state.players[1].characters[1]?.instanceId).toBe("weak");
    }
  );
  it.each([
    ["ACTIVE", true, 2000],
    ["RESTED", true, 0],
    ["ACTIVE", false, 0],
  ] as const)(
    "Sai leader %s Dressrosa=%s: bonus %i",
    (state, dressrosa, bonus) => {
      const f = fixture("OP06-088");
      const leader = f.state.players[0].leader;
      f.cardDb.set(leader.cardId, {
        ...f.cardDb.get(leader.cardId)!,
        types: dressrosa ? ["Dressrosa"] : [],
      });
      leader.state = state;
      f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
      const sai = f.state.players[0].characters.find(
        (c) => c?.cardId === "OP06-088"
      )!;
      expect(
        getEffectivePower(sai, f.cardDb.get(sai.cardId)!, f.state, f.cardDb)
      ).toBe(CARDS.VANILLA.power! + bonus);
    }
  );
  it.each([0, 2, 3, 4])(
    "Brook opponent chooses/orders up to available %i trash cards, keeps hand",
    (count) => {
      const f = fixture("OP06-092");
      f.state.players[1].trash = Array.from({ length: count }, (_, i) => ({
        ...f.source,
        cardId: `trash-card-${i}`,
        instanceId: `trash-${i}`,
        zone: "TRASH",
        controller: 1,
        owner: 1,
      }));
      for (let i = 0; i < count; i++)
        f.cardDb.set(`trash-card-${i}`, {
          ...CARDS.VANILLA,
          id: `trash-card-${i}`,
        });
      const hand = structuredClone(f.state.players[1].hand);
      const deck = structuredClone(f.state.players[1].deck);
      f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
      if (f.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE")
        f.act({ type: "PLAYER_CHOICE", choiceId: "1" });
      const selected = Array.from(
        { length: Math.min(count, 3) },
        (_, i) => `trash-${i}`
      );
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        expect(f.state.pendingPrompt.options.validTargets).toEqual(
          Array.from({ length: count }, (_, i) => `trash-${i}`)
        );
        f.act({ type: "SELECT_TARGET", selectedInstanceIds: selected }, 1);
      }
      if (f.state.pendingPrompt?.options.promptType === "ARRANGE_TOP_CARDS")
        f.act(
          {
            type: "ARRANGE_TOP_CARDS",
            keptCardInstanceId: "",
            orderedInstanceIds: [...selected].reverse(),
            destination: "bottom",
          },
          1
        );
      expect(f.state.players[1].hand).toEqual(hand);
      expect(f.state.players[1].trash).toHaveLength(Math.max(0, count - 3));
      expect(f.state.players[1].deck.slice(0, deck.length)).toEqual(deck);
      expect(f.state.players[1].deck).toHaveLength(
        deck.length + selected.length
      );
      expect(
        f.state.players[1].deck.slice(deck.length).map((c) => c.cardId)
      ).toEqual(
        [...selected].reverse().map((id) => id.replace("trash-", "trash-card-"))
      );
      expect(f.state.pendingPrompt).toBeNull();
    }
  );
});

describe("OPT-807 Lily Carnation trash cost", () => {
  it("trashes a 6000-power On K.O. Character without its K.O. trigger, then plays FILM rested", () => {
    const f = fixture("OP06-015");
    f.fieldSource();
    f.cardDb.set("OP06-089", {
      ...CARDS.VANILLA,
      id: "OP06-089",
      power: 6000,
      effectSchema: getEffectSchema("OP06-089")!,
    });
    const sacrifice = {
      ...f.source,
      cardId: "OP06-089",
      instanceId: "sacrifice",
      zone: "CHARACTER" as const,
    };
    f.state.players[0].characters[1] = sacrifice;
    // Registration through normal field entry, without resolving its On Play.
    Object.assign(
      f.state,
      registerCardEnteredField(f.state, sacrifice, f.cardDb.get("OP06-089")!)
    );
    f.cardDb.set("film", {
      ...CARDS.VANILLA,
      id: "film",
      power: 2000,
      types: ["FILM"],
    });
    f.state.players[0].trash.push({
      ...f.source,
      cardId: "film",
      instanceId: "film",
      zone: "TRASH",
    });
    const deck = structuredClone(f.state.players[0].deck);
    f.act({
      type: "ACTIVATE_EFFECT",
      cardInstanceId: "source",
      effectId: "OP06-015_effect_1",
    });
    if (f.state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")
      f.act({ type: "PLAYER_CHOICE", choiceId: "activate" });
    if (
      f.state.pendingPrompt?.options.promptType === "SELECT_TARGET" &&
      f.state.pendingPrompt.options.validTargets.includes("sacrifice")
    ) {
      const action: GameAction = {
        type: "SELECT_TARGET",
        selectedInstanceIds: ["sacrifice"],
      };
      const cost = resumeFromStack(f.state, action, f.cardDb);
      expect(
        cost.events.some(
          (e) => e.type === "CARD_TRASHED" && e.payload?.from === "CHARACTER"
        )
      ).toBe(true);
      f.act(action);
    }
    expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["film"] });
    expect(f.state.players[0].trash.some((c) => c.cardId === "OP06-089")).toBe(
      true
    );
    expect(
      f.state.players[0].characters.find((c) => c?.cardId === "film")
    ).toMatchObject({ state: "RESTED" });
    expect(f.state.players[0].deck).toEqual(deck);
    expect(f.state.pendingPrompt).toBeNull();
  });
});

describe("OPT-807 Rosinante opponent-turn replacement", () => {
  it.each([0, 1] as const)(
    "turn owner %i gates the replacement",
    (turnOwner) => {
      const f = fixture("OP05-030");
      f.fieldSource();
      f.state.turn.activePlayerIndex = turnOwner;
      // Brook's first authored branch trashes (not K.O.); OP05-096 K.O. branch supplies the event.
      const eventId = "OP05-096";
      f.cardDb.set(eventId, {
        ...CARDS.VANILLA,
        id: eventId,
        type: "Event",
        cost: 1,
        effectText: "[Main] Choose one:",
        effectSchema: getEffectSchema(eventId)!,
      });
      // Always K.O. a Character controlled by the opponent of the actor. On own
      // turn Rosinante must not protect the opponent's rested Character either.
      const targetPlayer: 0 | 1 = turnOwner === 0 ? 1 : 0;
      const target = {
        ...f.source,
        cardId: CARDS.VANILLA.id,
        instanceId: "ko-target",
        controller: targetPlayer,
        owner: targetPlayer,
        state: "RESTED" as const,
      };
      f.cardDb.set(CARDS.VANILLA.id, { ...CARDS.VANILLA, cost: 1 });
      f.state.players[targetPlayer].characters[1] = target;
      f.state.players[turnOwner].hand.push({
        ...f.source,
        cardId: eventId,
        instanceId: "ko-event",
        controller: turnOwner,
        owner: turnOwner,
        zone: "HAND",
      });
      f.act({ type: "PLAY_CARD", cardInstanceId: "ko-event" }, turnOwner);
      f.act({ type: "PLAYER_CHOICE", choiceId: "0" }, turnOwner);
      f.act(
        { type: "SELECT_TARGET", selectedInstanceIds: ["ko-target"] },
        turnOwner
      );
      expect(f.state.pendingPrompt !== null).toBe(turnOwner === 1);
      if (turnOwner === 1) {
        const options = f.state.pendingPrompt!.options;
        expect(options.promptType).toBe("OPTIONAL_EFFECT");
        f.act({ type: "PLAYER_CHOICE", choiceId: "activate" }, 0);
        expect(f.state.players[0].characters[1]?.instanceId).toBe("ko-target");
        expect(f.state.players[0].characters[0]).toBeNull();
      } else expect(f.state.players[1].characters[1]).toBeNull();
    }
  );
});

describe("OPT-807 Thunder Bagua Counter continuation", () => {
  it.each(["Top", "Bottom", "skip", "life-three"])(
    "ST09-015 %s",
    (position) => {
      const f = fixture("ST09-015");
      f.cardDb.set("ST09-015", {
        ...f.cardDb.get("ST09-015")!,
        type: "Event",
        effectText: "[Counter]",
        cost: 2,
      });
      f.state.turn.activePlayerIndex = 1;
      f.state.players[0].life = f.state.players[0].life.slice(
        0,
        position === "life-three" ? 3 : 2
      );
      f.cardDb.set("life-target", {
        ...CARDS.VANILLA,
        id: "life-target",
        cost: 3,
      });
      f.state.players[1].characters[0] = {
        ...f.source,
        cardId: "life-target",
        instanceId: "life-target",
        controller: 1,
        owner: 1,
        zone: "CHARACTER",
      };
      const life = structuredClone(f.state.players[1].life);
      f.act(
        {
          type: "DECLARE_ATTACK",
          attackerInstanceId: f.state.players[1].leader.instanceId,
          targetInstanceId: f.state.players[0].leader.instanceId,
        },
        1
      );
      f.act({ type: "PASS" }, 0);
      f.act(
        {
          type: "USE_COUNTER_EVENT",
          cardInstanceId: "source",
          counterTargetInstanceId: f.state.players[0].leader.instanceId,
        },
        0
      );
      if (
        f.state.pendingPrompt?.options.promptType === "SELECT_TARGET" &&
        f.state.pendingPrompt.options.validTargets.includes(
          f.state.players[0].leader.instanceId
        )
      )
        f.act({
          type: "SELECT_TARGET",
          selectedInstanceIds: [f.state.players[0].leader.instanceId],
        });
      if (position !== "life-three") {
        expect(f.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
        f.act({
          type: "SELECT_TARGET",
          selectedInstanceIds: position === "skip" ? [] : ["life-target"],
        });
        if (position !== "skip") {
          const options = f.state.pendingPrompt?.options;
          expect(options?.promptType).toBe("PLAYER_CHOICE");
          if (options?.promptType !== "PLAYER_CHOICE")
            throw new Error("Missing Life position prompt");
          f.act({
            type: "PLAYER_CHOICE",
            choiceId: options.choices.find((c) => c.label === position)!.id,
          });
          expect(
            f.state.players[1].life.at(position === "Top" ? 0 : -1)
          ).toMatchObject({ cardId: "life-target", face: "UP" });
          expect(
            position === "Top"
              ? f.state.players[1].life.slice(1)
              : f.state.players[1].life.slice(0, -1)
          ).toEqual(life);
        }
      }
      if (position === "skip" || position === "life-three")
        expect(f.state.players[1].life).toEqual(life);
      expect(f.state.pendingPrompt).toBeNull();
      const leader = f.state.players[0].leader;
      expect(
        getEffectivePower(
          leader,
          f.cardDb.get(leader.cardId)!,
          f.state,
          f.cardDb
        )
      ).toBe(9000);
    }
  );
});

it("Rosinante does not replace Orlumbus K.O. of your rested Character on your turn", () => {
  const f = fixture("OP05-030");
  f.fieldSource();
  f.cardDb.set("OP04-079", {
    ...CARDS.VANILLA,
    id: "OP04-079",
    effectSchema: getEffectSchema("OP04-079")!,
  });
  const orlumbus = { ...f.source, cardId: "OP04-079", instanceId: "orlumbus" };
  f.state.players[0].characters[1] = orlumbus;
  Object.assign(
    f.state,
    registerCardEnteredField(f.state, orlumbus, f.cardDb.get("OP04-079")!)
  );
  f.cardDb.set("dressrosa", {
    ...CARDS.VANILLA,
    id: "dressrosa",
    types: ["Dressrosa"],
  });
  f.state.players[0].characters[2] = {
    ...f.source,
    cardId: "dressrosa",
    instanceId: "dressrosa",
    state: "RESTED",
  };
  f.act({
    type: "ACTIVATE_EFFECT",
    cardInstanceId: "orlumbus",
    effectId: "activate_cost_reduce_mill_ko",
  });
  if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET")
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ["dressrosa"] });
  expect(f.state.players[0].characters[2]).toBeNull();
  expect(f.state.players[0].characters[0]?.cardId).toBe("OP05-030");
  expect(f.state.pendingPrompt).toBeNull();
});

it.each(["insufficient", "decline"])(
  "Lily %s cost never plays a trash card",
  (scenario) => {
    const f = fixture("OP06-015");
    f.fieldSource();
    f.cardDb.set("sacrifice", {
      ...CARDS.VANILLA,
      id: "sacrifice",
      power: scenario === "insufficient" ? 5999 : 6000,
    });
    f.state.players[0].characters[1] = {
      ...f.source,
      cardId: "sacrifice",
      instanceId: "sacrifice",
    };
    f.cardDb.set("film", {
      ...CARDS.VANILLA,
      id: "film",
      power: 5000,
      types: ["FILM"],
    });
    f.state.players[0].trash.push({
      ...f.source,
      cardId: "film",
      instanceId: "film",
      zone: "TRASH",
    });
    if (scenario === "insufficient") {
      const result = runPipeline(
        f.state,
        {
          type: "ACTIVATE_EFFECT",
          cardInstanceId: "source",
          effectId: "OP06-015_effect_1",
        },
        f.cardDb,
        0
      );
      expect(result.valid).toBe(false);
    } else {
      f.act({
        type: "ACTIVATE_EFFECT",
        cardInstanceId: "source",
        effectId: "OP06-015_effect_1",
      });
      f.act({ type: "PLAYER_CHOICE", choiceId: "skip" });
    }
    expect(f.state.players[0].characters[1]?.cardId).toBe("sacrifice");
    expect(f.state.players[0].trash[0]?.cardId).toBe("film");
    expect(f.state.pendingPrompt).toBeNull();
  }
);

it.each(["ST12-010", "ST12-013"])(
  "%s empty deck never opens an empty arrangement",
  (id) => {
    const f = fixture(id);
    f.state.players[0].deck = [];
    if (id === "ST12-013") f.fieldSource();
    f.act(
      id === "ST12-010"
        ? { type: "PLAY_CARD", cardInstanceId: "source" }
        : {
            type: "DECLARE_ATTACK",
            attackerInstanceId: "source",
            targetInstanceId: f.state.players[1].leader.instanceId,
          }
    );
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].deck).toEqual([]);
  }
);

it.each(["top", "bottom"] as const)(
  "OP08-052 shared zero-match remainder can go %s",
  (destination) => {
    const f = fixture("OP08-052");
    f.cardDb.set("nonmatch", {
      ...CARDS.VANILLA,
      id: "nonmatch",
      cost: 5,
      types: [],
    });
    f.state.players[0].deck.unshift({
      ...f.source,
      cardId: "nonmatch",
      instanceId: "nonmatch",
      zone: "DECK",
    });
    const before = f.state.players[0].deck.map((c) => c.instanceId);
    f.act({ type: "PLAY_CARD", cardInstanceId: "source" });
    expect(f.state.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    f.act({
      type: "ARRANGE_TOP_CARDS",
      keptCardInstanceId: "",
      orderedInstanceIds: ["nonmatch"],
      destination,
    });
    expect(f.state.players[0].deck.map((c) => c.instanceId)).toEqual(
      destination === "top" ? before : [...before.slice(1), "nonmatch"]
    );
    expect(f.state.pendingPrompt).toBeNull();
  }
);
