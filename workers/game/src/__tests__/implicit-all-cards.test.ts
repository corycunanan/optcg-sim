import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import { getEffectiveCost } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { OP06_117_THE_ARK_MAXIM } from "../engine/schemas/op06.js";
import { OP08_043_EDWARD_NEWGATE } from "../engine/schemas/op08.js";
import { OP14_082_OINKCHUCK } from "../engine/schemas/op14.js";
import { P_100_MARSHALL_D_TEACH } from "../engine/schemas/p.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const NO_KEYWORDS = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

function card(
  id: string,
  name: string,
  overrides: Partial<CardData> = {}
): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name,
    keywords: NO_KEYWORDS,
    ...overrides,
  };
}

function character(
  cardId: string,
  controller: 0 | 1,
  instanceId: string,
  state: CardInstance["state"] = "ACTIVE"
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state,
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

function withPlayer(
  state: GameState,
  index: 0 | 1,
  patch: Partial<PlayerState>
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[index] = { ...players[index], ...patch };
  return { ...state, players };
}

describe("implicit-all production card actions", () => {
  it("KOs every cost-2-or-less opponent Character for OP06-117", () => {
    const cardDb = createTestCardDb();
    const arkMaxim = card("OP06-117", "The Ark Maxim", {
      type: "Stage",
      cost: 0,
      power: null,
      effectSchema: OP06_117_THE_ARK_MAXIM,
    });
    const enel = card("TEST-ENEL", "Enel", { cost: 7 });
    const costOne = card("TEST-COST-ONE", "Cost One", { cost: 1 });
    const costTwo = card("TEST-COST-TWO", "Cost Two", { cost: 2 });
    const costThree = card("TEST-COST-THREE", "Cost Three", { cost: 3 });
    for (const data of [arkMaxim, enel, costOne, costTwo, costThree]) {
      cardDb.set(data.id, data);
    }

    let state = createBattleReadyState(cardDb);
    const stage: CardInstance = {
      instanceId: "ark-maxim",
      cardId: arkMaxim.id,
      zone: "STAGE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const enelInstance = character(enel.id, 0, "enel");
    state = withPlayer(state, 0, {
      stage,
      characters: padChars([enelInstance]),
    });
    state = withPlayer(state, 1, {
      characters: padChars([
        character(costOne.id, 1, "cost-one"),
        character(costTwo.id, 1, "cost-two"),
        character(costThree.id, 1, "cost-three"),
      ]),
    });

    const offered = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: stage.instanceId,
        effectId: "OP06-117_effect_1",
      },
      cardDb,
      0
    );
    expect(offered.valid).toBe(true);
    expect(offered.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

    let result = resumeFromStack(
      { ...offered.state, pendingPrompt: null },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb
    );
    if (result.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      result = resumeFromStack(
        result.state,
        {
          type: "SELECT_TARGET",
          selectedInstanceIds: [enelInstance.instanceId],
        },
        cardDb
      );
    }

    expect(result.pendingPrompt).toBeUndefined();
    expect(
      result.state.players[1].characters
        .filter(Boolean)
        .map((instance) => instance!.instanceId)
    ).toEqual(["cost-three"]);
    expect(
      result.state.players[1].trash.map((instance) => instance.cardId)
    ).toEqual(expect.arrayContaining([costOne.id, costTwo.id]));
  });

  it("gives +4 cost to every Thriller Bark Pirates Character for OP14-082", () => {
    const cardDb = createTestCardDb();
    const oinkchuck = card("OP14-082", "Oinkchuck", {
      cost: 2,
      power: 1000,
      types: ["Thriller Bark Pirates"],
      effectSchema: OP14_082_OINKCHUCK,
    });
    const thriller = card("TEST-THRILLER", "Thriller Character", {
      cost: 3,
      types: ["Thriller Bark Pirates"],
    });
    const other = card("TEST-OTHER", "Other Character", {
      cost: 3,
      types: ["Navy"],
    });
    const attackerData = card("TEST-ATTACKER", "Strong Attacker", {
      power: 6000,
    });
    for (const data of [oinkchuck, thriller, other, attackerData]) {
      cardDb.set(data.id, data);
    }

    let state = createBattleReadyState(cardDb);
    const attacker = character(attackerData.id, 0, "attacker");
    const oinkchuckInstance = character(oinkchuck.id, 1, "oinkchuck", "RESTED");
    const thrillerA = character(thriller.id, 1, "thriller-a");
    const thrillerB = character(thriller.id, 1, "thriller-b");
    const nonThriller = character(other.id, 1, "other");
    state = withPlayer(state, 0, { characters: padChars([attacker]) });
    state = withPlayer(state, 1, {
      characters: padChars([
        oinkchuckInstance,
        thrillerA,
        thrillerB,
        nonThriller,
      ]),
    });
    state = registerTriggersForCard(state, oinkchuckInstance, oinkchuck);

    let result = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: oinkchuckInstance.instanceId,
      },
      cardDb,
      0
    );
    expect(result.valid).toBe(true);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
    result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);

    expect(
      getEffectiveCost(thriller, result.state, thrillerA.instanceId, cardDb)
    ).toBe(7);
    expect(
      getEffectiveCost(thriller, result.state, thrillerB.instanceId, cardDb)
    ).toBe(7);
    expect(
      getEffectiveCost(other, result.state, nonThriller.instanceId, cardDb)
    ).toBe(3);
  });

  it("prohibits every opponent Character from attacking for OP08-043", () => {
    const cardDb = createTestCardDb();
    const newgate = card("OP08-043", "Edward.Newgate", {
      cost: 0,
      effectSchema: OP08_043_EDWARD_NEWGATE,
    });
    const whitebeardLeader = card("TEST-WHITEBEARD-LEADER", "Leader", {
      type: "Leader",
      cost: null,
      life: 5,
      types: ["Whitebeard Pirates"],
    });
    cardDb.set(newgate.id, newgate);
    cardDb.set(whitebeardLeader.id, whitebeardLeader);

    let state = createBattleReadyState(cardDb);
    const newgateInHand: CardInstance = {
      instanceId: "newgate-hand",
      cardId: newgate.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const opponentCharacters = [
      character(CARDS.VANILLA.id, 1, "opponent-a"),
      character(CARDS.BLOCKER.id, 1, "opponent-b"),
      character(CARDS.RUSH.id, 1, "opponent-c"),
    ];
    state = withPlayer(state, 0, {
      leader: { ...state.players[0].leader, cardId: whitebeardLeader.id },
      hand: [...state.players[0].hand, newgateInHand],
      life: state.players[0].life.slice(0, 2),
    });
    state = withPlayer(state, 1, {
      characters: padChars(opponentCharacters),
    });

    const result = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: newgateInHand.instanceId },
      cardDb,
      0
    );

    expect(result.valid).toBe(true);
    const prohibition = result.state.prohibitions.find(
      (entry) => entry.prohibitionType === "CANNOT_ATTACK"
    );
    expect(prohibition?.appliesTo).toEqual(
      opponentCharacters.map((instance) => instance.instanceId)
    );
  });

  it("negates every opponent Character for P-100", () => {
    const cardDb = createTestCardDb();
    const teach = card("P-100", "Marshall.D.Teach", {
      power: 5000,
      effectSchema: P_100_MARSHALL_D_TEACH,
    });
    cardDb.set(teach.id, teach);

    let state = createBattleReadyState(cardDb);
    const teachInstance = character(teach.id, 0, "teach");
    const opponentCharacters = [
      character(CARDS.VANILLA.id, 1, "opponent-a"),
      character(CARDS.BLOCKER.id, 1, "opponent-b"),
      character(CARDS.RUSH.id, 1, "opponent-c"),
    ];
    state = withPlayer(state, 0, { characters: padChars([teachInstance]) });
    state = withPlayer(state, 1, {
      characters: padChars(opponentCharacters),
    });
    state = registerTriggersForCard(state, teachInstance, teach);

    const result = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: teachInstance.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      },
      cardDb,
      0
    );

    expect(result.valid).toBe(true);
    const characterNegation = result.state.activeEffects.find(
      (effect) =>
        effect.modifiers?.some(
          (modifier) => modifier.type === "NEGATE_EFFECTS_FLAG"
        ) && effect.appliesTo?.includes(opponentCharacters[0].instanceId)
    );
    expect(characterNegation?.appliesTo).toEqual(
      opponentCharacters.map((instance) => instance.instanceId)
    );
  });
});
