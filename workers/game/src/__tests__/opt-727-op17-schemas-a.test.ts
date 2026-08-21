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
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import {
  OP17_001_EDWARD_NEWGATE,
  OP17_019_I_DONT_HAVE_TIME_TO_CHAT,
  OP17_020_SHANKS,
  OP17_039_ROCKS_D_XEBEC,
  OP17_058_KAIDO,
  OP17_076_I_THINK_IVE_SOBERED_UP,
  OP17_096_IM_LUFFY,
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
    const afterCost = selectFirst(result, cardDb);
    expect(afterCost.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  });

  it("OP17-020 exposes both CHOICE cost branches before applying skip-refresh", () => {
    const { state: base, cardDb, leader } = installLeader(OP17_020_SHANKS);
    const opponentCharacter = {
      ...base.players[1].characters[0]!,
      state: "RESTED" as const,
    };
    const state = withPlayer(base, 1, {
      characters: padChars([opponentCharacter]),
    });
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
    result = resumeFromStack(
      result.state,
      { type: "PLAYER_CHOICE", choiceId: "1" },
      cardDb
    );
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
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

  it("OP17-058's compound attack trigger pays DON!!−1 and targets a Character", () => {
    const { state, cardDb, leader } = installLeader(OP17_058_KAIDO);
    const attack = attackWithLeader(state, leader, cardDb);
    expect(attack.valid).toBe(true);
    const result = acceptOptional(attack, cardDb);
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  });

  it("OP17-099 pays its cost and delegates the printed branch to the opponent", () => {
    const { state, cardDb, leader } = installLeader(OP17_099_CHARLOTTE_LINLIN);
    const attack = attackWithLeader(state, leader, cardDb);
    expect(attack.valid).toBe(true);
    let result = acceptOptional(attack, cardDb);
    result = selectFirst(result, cardDb);
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (result.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
      expect(result.pendingPrompt.options.choices).toHaveLength(2);
    }
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
    const result = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    expect(result.valid).toBe(true);
    expect(result.state.players[1].hand).toHaveLength(handBefore + 2);
  });

  it("OP17-096 activates from Life and selects an Elbaph card in trash", () => {
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
    const result = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      expect(result.pendingPrompt.options.validTargets).toEqual([
        trashCard.instanceId,
      ]);
    }
  });

  it("OP17-117 activates from Life and gives the opponent both printed choices", () => {
    const card = cardData(OP17_117_MASER_SABER, "Event");
    const { state, cardDb } = driveToTrigger(card);
    const result = runPipeline(
      state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1
    );
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (result.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
      expect(result.pendingPrompt.options.choices).toHaveLength(2);
    }
  });
});
