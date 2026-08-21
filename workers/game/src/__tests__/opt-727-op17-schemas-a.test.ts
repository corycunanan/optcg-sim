/**
 * OPT-727 — OP17 schema integration coverage for Leaders and Trigger Events.
 *
 * These tests drive the authored blocks through runPipeline and resumeFromStack
 * so costs, choices, reveal conditions, trigger staging, and targets use the
 * same paths as a live game session.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  LifeCard,
  PendingPromptState,
  PlayerState,
} from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import {
  resolveEffect,
  resumeFromStack,
} from "../engine/effect-resolver/index.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  OP17_001_EDWARD_NEWGATE,
  OP17_019_I_DONT_HAVE_TIME_TO_CHAT,
  OP17_020_SHANKS,
  OP17_037_AFRAID_OF_THE_NEW_ERA,
  OP17_038_UGLY_FUTURE,
  OP17_039_ROCKS_D_XEBEC,
  OP17_057_FULLALEAD,
  OP17_058_KAIDO,
  OP17_076_I_THINK_IVE_SOBERED_UP,
  OP17_077_KUNDALI_DRAGON_SWARM,
  OP17_078_DRUNKEN_DRAGON_BAGUA,
  OP17_096_IM_LUFFY,
  OP17_098_GUM_GUM_KONG_GUN,
  OP17_099_CHARLOTTE_LINLIN,
  OP17_117_MASER_SABER,
} from "../engine/schemas/op17.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

type PromptResult = {
  state: GameState;
  pendingPrompt?: PendingPromptState;
};

function withPlayer(
  state: GameState,
  playerIndex: 0 | 1,
  patch: Partial<PlayerState>
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = { ...players[playerIndex], ...patch };
  return { ...state, players };
}

function cardData(
  schema: EffectSchema,
  type: CardData["type"],
  overrides: Partial<CardData> = {}
): CardData {
  return {
    ...CARDS.VANILLA,
    id: schema.card_id!,
    name: schema.card_name!,
    type,
    cost: type === "Leader" ? null : 1,
    power: type === "Event" ? null : 5000,
    life: type === "Leader" ? 5 : null,
    effectSchema: schema,
    triggerText: type === "Event" ? "[Trigger] effect" : null,
    keywords: {
      ...CARDS.VANILLA.keywords,
      trigger: schema.effects.some(
        (block) =>
          block.trigger &&
          "keyword" in block.trigger &&
          block.trigger.keyword === "TRIGGER"
      ),
    },
    ...overrides,
  };
}

function installLeader(
  schema: EffectSchema,
  playerIndex: 0 | 1 = 0
): { state: GameState; cardDb: Map<string, CardData>; leader: CardInstance } {
  const cardDb = createTestCardDb();
  const data = cardData(schema, "Leader");
  cardDb.set(data.id, data);
  let state = createBattleReadyState(cardDb);
  const oldLeader = state.players[playerIndex].leader;
  const leader: CardInstance = { ...oldLeader, cardId: data.id };
  state = withPlayer(state, playerIndex, { leader });
  state = registerTriggersForCard(state, leader, data);
  return { state, cardDb, leader };
}

function acceptOptional(result: PromptResult, cardDb: Map<string, CardData>) {
  expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb
  );
}

function selectFirst(result: PromptResult, cardDb: Map<string, CardData>) {
  expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
    throw new Error("Expected SELECT_TARGET prompt");
  }
  return resumeFromStack(
    result.state,
    {
      type: "SELECT_TARGET",
      selectedInstanceIds: [result.pendingPrompt.options.validTargets[0]],
    },
    cardDb
  );
}

function selectTargets(
  result: PromptResult,
  selectedInstanceIds: string[],
  cardDb: Map<string, CardData>
) {
  expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  return resumeFromStack(
    result.state,
    { type: "SELECT_TARGET", selectedInstanceIds },
    cardDb
  );
}

function choose(
  result: PromptResult,
  choiceId: string,
  cardDb: Map<string, CardData>
) {
  expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  return resumeFromStack(
    result.state,
    { type: "PLAYER_CHOICE", choiceId },
    cardDb
  );
}

function installEvent(
  schema: EffectSchema,
  playerIndex: 0 | 1 = 0
): {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
} {
  const cardDb = createTestCardDb();
  const data = cardData(schema, "Event");
  cardDb.set(data.id, data);
  let state = createBattleReadyState(cardDb);
  const source: CardInstance = {
    instanceId: `source-${data.id}`,
    cardId: data.id,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: playerIndex,
    owner: playerIndex,
  };
  state = withPlayer(state, playerIndex, {
    hand: [...state.players[playerIndex].hand, source],
  });
  return { state, cardDb, source };
}

function resolveBlock(
  state: GameState,
  cardDb: Map<string, CardData>,
  source: CardInstance,
  schema: EffectSchema,
  effectId: string,
  controller: 0 | 1 = source.controller
) {
  const block = schema.effects.find((candidate) => candidate.id === effectId);
  if (!block) throw new Error(`Missing effect ${effectId}`);
  return resolveEffect(
    state,
    block,
    source.instanceId,
    controller,
    cardDb
  );
}

function restedDonCount(state: GameState, playerIndex: 0 | 1): number {
  return state.players[playerIndex].donCostArea.filter(
    (don) => don.state === "RESTED"
  ).length;
}

function attackWithLeader(
  state: GameState,
  leader: CardInstance,
  cardDb: Map<string, CardData>
) {
  return runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    cardDb,
    0
  );
}

function driveToTrigger(
  card: CardData,
  configure?: (state: GameState, cardDb: Map<string, CardData>) => GameState
): { state: GameState; cardDb: Map<string, CardData> } {
  const cardDb = createTestCardDb();
  cardDb.set(card.id, card);
  let state = createBattleReadyState(cardDb);
  const lifeCard: LifeCard = {
    instanceId: `life-${card.id}`,
    cardId: card.id,
    face: "DOWN",
  };
  state = withPlayer(state, 1, { life: [lifeCard] });
  if (configure) state = configure(state, cardDb);

  let result = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    cardDb,
    0
  );
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  expect(result.valid).toBe(true);
  expect(result.state.turn.battle?.pendingTriggerLifeCard?.cardId).toBe(
    card.id
  );
  return { state: result.state, cardDb };
}

describe("OPT-727 OP17 Leaders", () => {
  it("OP17-001 pays its hand cost and selects the defensive power target", () => {
    const {
      state: base,
      cardDb,
      leader,
    } = installLeader(OP17_001_EDWARD_NEWGATE);
    const state: GameState = {
      ...base,
      turn: { ...base.turn, activePlayerIndex: 1 },
    };
    const handBefore = state.players[0].hand.length;
    const attacker = state.players[1].leader;
    const attack = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: leader.instanceId,
      },
      cardDb,
      1
    );
    expect(attack.valid).toBe(true);
    let result = acceptOptional(attack, cardDb);
    result = selectFirst(result, cardDb);
    result = selectTargets(result, [leader.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(handBefore - 1);
    expect(
      getEffectivePower(
        result.state.players[0].leader,
        cardDb.get(result.state.players[0].leader.cardId)!,
        result.state,
        cardDb
      )
    ).toBe(9000);
  });

  it("OP17-020 pays the DON branch and applies skip-refresh", () => {
    const { state: base, cardDb, leader } = installLeader(OP17_020_SHANKS);
    const opponentCharacter = {
      ...base.players[1].characters[0]!,
      state: "RESTED" as const,
    };
    const state = withPlayer(base, 1, {
      characters: padChars([opponentCharacter]),
    });
    const restedBefore = restedDonCount(state, 0);
    const activation = runPipeline(
      state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: leader.instanceId,
        effectId: "activate_skip_refresh",
      },
      cardDb,
      0
    );
    expect(activation.valid).toBe(true);
    let result = acceptOptional(activation, cardDb);
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (result.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected CHOICE cost prompt");
    }
    expect(result.pendingPrompt.options.choices).toHaveLength(2);
    result = choose(result, "1", cardDb);
    result = selectTargets(result, [opponentCharacter.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(restedDonCount(result.state, 0)).toBe(restedBefore + 1);
    expect(result.state.prohibitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prohibitionType: "CANNOT_REFRESH",
          appliesTo: [opponentCharacter.instanceId],
        }),
      ])
    );
  });

  it("OP17-039 resolves its reveal condition and draws two cards", () => {
    const {
      state: base,
      cardDb,
      leader,
    } = installLeader(OP17_039_ROCKS_D_XEBEC);
    const rocksCard = cardData(
      { card_id: "TEST-ROCKS", card_name: "Rocks card", effects: [] },
      "Character",
      { id: "TEST-ROCKS", name: "Rocks card", types: ["Rocks Pirates"] }
    );
    cardDb.set(rocksCard.id, rocksCard);
    const deck = [...base.players[0].deck];
    deck[0] = { ...deck[0], instanceId: "rocks-top", cardId: rocksCard.id };
    const state = withPlayer(base, 0, { deck });
    const handBefore = state.players[0].hand.length;

    const attack = attackWithLeader(state, leader, cardDb);
    expect(attack.valid).toBe(true);
    let result = acceptOptional(attack, cardDb);
    result = selectFirst(result, cardDb);

    expect(result.state.players[0].hand).toHaveLength(handBefore + 1);
  });

  it("OP17-058 pays DON!!−1 and completes the Character debuff", () => {
    const { state, cardDb, leader } = installLeader(OP17_058_KAIDO);
    const opponentCharacter = state.players[1].characters[0]!;
    const costAreaBefore = state.players[0].donCostArea.length;
    const donDeckBefore = state.players[0].donDeck.length;
    const attack = attackWithLeader(state, leader, cardDb);
    expect(attack.valid).toBe(true);
    let result = acceptOptional(attack, cardDb);
    result = selectTargets(result, [opponentCharacter.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].donCostArea).toHaveLength(costAreaBefore - 1);
    expect(result.state.players[0].donDeck).toHaveLength(donDeckBefore + 1);
    expect(
      getEffectivePower(
        result.state.players[1].characters[0]!,
        cardDb.get(opponentCharacter.cardId)!,
        result.state,
        cardDb
      )
    ).toBe(2000);
  });

  it("OP17-099 makes the opponent trash from their own hand", () => {
    const { state, cardDb, leader } = installLeader(OP17_099_CHARLOTTE_LINLIN);
    const ownerHandBefore = state.players[0].hand.length;
    const opponentHandBefore = state.players[1].hand.length;
    const attack = attackWithLeader(state, leader, cardDb);
    expect(attack.valid).toBe(true);
    let result = acceptOptional(attack, cardDb);
    result = selectFirst(result, cardDb);
    result = choose(result, "1", cardDb);
    expect(result.pendingPrompt?.respondingPlayer).toBe(1);
    result = selectFirst(result, cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(ownerHandBefore - 1);
    expect(result.state.players[1].hand).toHaveLength(opponentHandBefore - 1);
  });
});

describe("OPT-727 OP17 Event and Stage resolution", () => {
  it("OP17-037 can rest the Leader as one of your cards and completes its boost", () => {
    const { state, cardDb, source } = installEvent(
      OP17_037_AFRAID_OF_THE_NEW_ERA
    );
    const leader = state.players[0].leader;
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_037_AFRAID_OF_THE_NEW_ERA,
      "counter_rest_card_power"
    );
    result = acceptOptional(result, cardDb);
    result = choose(result, "0", cardDb);
    result = selectTargets(result, [leader.instanceId], cardDb);
    result = selectTargets(result, [leader.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].leader.state).toBe("RESTED");
    expect(
      getEffectivePower(
        result.state.players[0].leader,
        cardDb.get(leader.cardId)!,
        result.state,
        cardDb
      )
    ).toBe(8000);
  });

  it("OP17-038 rests a Leader, Stage, and DON!! before resting an opponent Character", () => {
    const { state: base, cardDb, source } = installEvent(OP17_038_UGLY_FUTURE);
    const stage: CardInstance = {
      instanceId: "op17-038-stage",
      cardId: CARDS.STAGE.id,
      zone: "STAGE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    let state = withPlayer(base, 0, {
      characters: padChars([]),
      stage,
      donCostArea: base.players[0].donCostArea.slice(0, 2),
    });
    const opponentCharacter = state.players[1].characters[0]!;
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_038_UGLY_FUTURE,
      "main_rest_character"
    );
    result = acceptOptional(result, cardDb);
    result = selectTargets(
      result,
      [state.players[0].leader.instanceId, stage.instanceId],
      cardDb
    );
    result = selectTargets(result, [opponentCharacter.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].leader.state).toBe("RESTED");
    expect(result.state.players[0].stage?.state).toBe("RESTED");
    expect(restedDonCount(result.state, 0)).toBe(2);
    expect(result.state.players[1].characters[0]?.state).toBe("RESTED");
  });

  it("OP17-057 pays both costs and applies the Rocks defensive boost", () => {
    const cardDb = createTestCardDb();
    const data = cardData(OP17_057_FULLALEAD, "Stage");
    cardDb.set(data.id, data);
    let state = createBattleReadyState(cardDb);
    const stage: CardInstance = {
      instanceId: "op17-057-stage",
      cardId: data.id,
      zone: "STAGE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    state = withPlayer(state, 0, { stage });
    const leaderData = cardDb.get(state.players[0].leader.cardId)!;
    cardDb.set(leaderData.id, { ...leaderData, types: ["Rocks Pirates"] });
    state = registerTriggersForCard(state, stage, data);
    state = {
      ...state,
      turn: { ...state.turn, activePlayerIndex: 1 },
    };
    const handBefore = state.players[0].hand.length;
    const attack = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: state.players[1].leader.instanceId,
        targetInstanceId: state.players[0].leader.instanceId,
      },
      cardDb,
      1
    );
    expect(attack.valid).toBe(true);
    let result = acceptOptional(attack, cardDb);
    result = selectFirst(result, cardDb);
    result = selectTargets(
      result,
      [state.players[0].leader.instanceId],
      cardDb
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].stage?.state).toBe("RESTED");
    expect(result.state.players[0].hand).toHaveLength(handBefore - 1);
    expect(
      getEffectivePower(
        result.state.players[0].leader,
        cardDb.get(result.state.players[0].leader.cardId)!,
        result.state,
        cardDb
      )
    ).toBe(6000);
  });

  for (const [schema, effectId, donCost] of [
    [OP17_077_KUNDALI_DRAGON_SWARM, "main_add_don", 3],
    [OP17_078_DRUNKEN_DRAGON_BAGUA, "main_add_don", 2],
  ] as const) {
    it(`${schema.card_id} pays its multi-cost, passes the post-cost gate, and adds DON!!`, () => {
      const { state: base, cardDb, source } = installEvent(schema);
      const leaderData = cardDb.get(base.players[0].leader.cardId)!;
      cardDb.set(leaderData.id, {
        ...leaderData,
        types: ["Animal Kingdom Pirates"],
      });
      const state = withPlayer(base, 0, {
        donCostArea: base.players[0].donCostArea.slice(0, -1),
        donDeck: [
          ...base.players[0].donDeck,
          base.players[0].donCostArea.at(-1)!,
        ],
      });
      const handBefore = state.players[0].hand.length;
      const costAreaBefore = state.players[0].donCostArea.length;
      const donDeckBefore = state.players[0].donDeck.length;
      let result = resolveBlock(
        state,
        cardDb,
        source,
        schema,
        effectId
      );
      result = acceptOptional(result, cardDb);
      expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
      if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
        throw new Error("Expected hand-cost selection");
      }
      result = selectTargets(
        result,
        result.pendingPrompt.options.validTargets.slice(0, 2),
        cardDb
      );
      result = choose(result, "choose-value:3", cardDb);

      expect(result.pendingPrompt).toBeUndefined();
      expect(result.state.players[0].hand).toHaveLength(handBefore - 2);
      expect(result.state.players[0].donCostArea).toHaveLength(
        costAreaBefore + 3
      );
      expect(result.state.players[0].donDeck).toHaveLength(donDeckBefore - 3);
      expect(restedDonCount(result.state, 0)).toBe(donCost + 3);
    });
  }

  it("OP17-098 pays DON!! and K.O.s the selected Character after its post-cost gate", () => {
    const { state: base, cardDb, source } = installEvent(
      OP17_098_GUM_GUM_KONG_GUN
    );
    const costTwelve = cardData(
      { card_id: "TEST-COST-12", card_name: "Cost 12", effects: [] },
      "Character",
      { id: "TEST-COST-12", name: "Cost 12", cost: 12 }
    );
    cardDb.set(costTwelve.id, costTwelve);
    const ownCharacter: CardInstance = {
      ...base.players[0].characters[0]!,
      instanceId: "cost-12-character",
      cardId: costTwelve.id,
    };
    const state = withPlayer(base, 0, {
      characters: padChars([ownCharacter]),
    });
    const target = state.players[1].characters[0]!;
    const restedBefore = restedDonCount(state, 0);
    let result = resolveBlock(
      state,
      cardDb,
      source,
      OP17_098_GUM_GUM_KONG_GUN,
      "main_cost_12_ko"
    );
    result = acceptOptional(result, cardDb);
    result = selectTargets(result, [target.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(restedDonCount(result.state, 0)).toBe(restedBefore + 6);
    expect(
      result.state.players[1].trash.some((card) => card.cardId === target.cardId)
    ).toBe(true);
  });
});

describe("OPT-727 OP17 direct Trigger blocks", () => {
  it("OP17-019 activates from Life and grants the Leader +1000 power", () => {
    const card = cardData(OP17_019_I_DONT_HAVE_TIME_TO_CHAT, "Event");
    const { state, cardDb } = driveToTrigger(card);
    const result = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    expect(result.valid).toBe(true);
    const leader = result.state.players[1].leader;
    expect(
      getEffectivePower(
        leader,
        cardDb.get(leader.cardId)!,
        result.state,
        cardDb
      )
    ).toBe(6000);
  });

  it("OP17-076 pays DON!!−1 and draws two cards from its Trigger", () => {
    const card = cardData(OP17_076_I_THINK_IVE_SOBERED_UP, "Event");
    const { state, cardDb } = driveToTrigger(card);
    const handBefore = state.players[1].hand.length;
    const costAreaBefore = state.players[1].donCostArea.length;
    const donDeckBefore = state.players[1].donDeck.length;
    const result = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    expect(result.valid).toBe(true);
    expect(result.state.players[1].hand).toHaveLength(handBefore + 2);
    expect(result.state.players[1].donCostArea).toHaveLength(
      costAreaBefore - 1
    );
    expect(result.state.players[1].donDeck).toHaveLength(donDeckBefore + 1);
  });

  it("OP17-096 moves the selected Elbaph card from trash to hand", () => {
    const card = cardData(OP17_096_IM_LUFFY, "Event");
    const elbaph = cardData(
      { card_id: "TEST-ELBAPH", card_name: "Elbaph card", effects: [] },
      "Character",
      { id: "TEST-ELBAPH", name: "Elbaph card", types: ["Elbaph"] }
    );
    const trashCard: CardInstance = {
      instanceId: "elbaph-trash",
      cardId: elbaph.id,
      zone: "TRASH",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 1,
      owner: 1,
    };
    const { state, cardDb } = driveToTrigger(card, (current, currentCardDb) => {
      currentCardDb.set(elbaph.id, elbaph);
      return withPlayer(current, 1, { trash: [trashCard] });
    });
    const trigger = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    expect(trigger.valid).toBe(true);
    let result: PromptResult = trigger;
    result = selectTargets(result, [trashCard.instanceId], cardDb);

    expect(result.pendingPrompt).toBeUndefined();
    expect(
      result.state.players[1].hand.some((candidate) => candidate.cardId === elbaph.id)
    ).toBe(true);
    expect(
      result.state.players[1].trash.some(
        (candidate) => candidate.cardId === elbaph.id
      )
    ).toBe(false);
  });

  it("OP17-117 makes the opponent trash three cards from their own hand", () => {
    const card = cardData(OP17_117_MASER_SABER, "Event");
    const { state, cardDb } = driveToTrigger(card);
    const opponentHandBefore = state.players[0].hand.length;
    const ownerHandBefore = state.players[1].hand.length;
    const trigger = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    expect(trigger.valid).toBe(true);
    let result: PromptResult = trigger;
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
    result = choose(result, "0", cardDb);
    expect(result.pendingPrompt?.respondingPlayer).toBe(0);
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected opponent hand selection");
    }
    result = selectTargets(
      result,
      result.pendingPrompt.options.validTargets.slice(0, 3),
      cardDb
    );

    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].hand).toHaveLength(opponentHandBefore - 3);
    expect(result.state.players[1].hand).toHaveLength(ownerHandBefore);
  });
});
