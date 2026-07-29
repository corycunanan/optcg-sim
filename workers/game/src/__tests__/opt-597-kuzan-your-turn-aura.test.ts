/**
 * OPT-597 — OP02-121 Kuzan's cost aura is continuously active only during
 * its controller's turn, including while its On Play effect resolves.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../types.js";
import { getEffectiveFieldCost, getEffectivePower } from "../engine/modifiers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { OP01_091_KING } from "../engine/schemas/op01.js";
import { OP02_121_KUZAN } from "../engine/schemas/op02.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function makeCard(
  id: string,
  cost: number | null,
  effectSchema: CardData["effectSchema"] = null,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Black"],
    cost,
    power: 5000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema,
    imageUrl: null,
    ...overrides,
  };
}

const KING = makeCard("OP01-091", null, OP01_091_KING, {
  type: "Leader",
  color: ["Purple"],
});
const KUZAN = makeCard("OP02-121", 10, OP02_121_KUZAN);
const COST_FIVE = makeCard("TEST-COST-5", 5);
const COST_THREE = makeCard("TEST-COST-3", 3);
const COST_FIVE_LEADER = makeCard("TEST-LEADER-COST-5", 5, null, {
  type: "Leader",
  life: 5,
});
const COST_FIVE_STAGE = makeCard("TEST-STAGE-COST-5", 5, null, {
  type: "Stage",
  power: null,
});

function makeCharacter(cardId: string, controller: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `char-${controller}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

function buildCardDb(): Map<string, CardData> {
  const cardDb = createTestCardDb();
  for (const card of [
    KING,
    KUZAN,
    COST_FIVE,
    COST_THREE,
    COST_FIVE_LEADER,
    COST_FIVE_STAGE,
  ]) {
    cardDb.set(card.id, card);
  }
  return cardDb;
}

function buildFieldState(activePlayerIndex: 0 | 1): {
  state: GameState;
  cardDb: Map<string, CardData>;
  kuzan: CardInstance;
  ownFive: CardInstance;
  opponentFive: CardInstance;
  opponentThree: CardInstance;
  opponentLeader: CardInstance;
  opponentStage: CardInstance;
} {
  const cardDb = buildCardDb();
  let state = createBattleReadyState(cardDb);
  const kuzan = makeCharacter(KUZAN.id, 0, "kuzan");
  const ownFive = makeCharacter(COST_FIVE.id, 0, "own-five");
  const opponentFive = makeCharacter(COST_FIVE.id, 1, "opponent-five");
  const opponentThree = makeCharacter(COST_THREE.id, 1, "opponent-three");
  const opponentLeader: CardInstance = {
    ...makeCharacter(COST_FIVE_LEADER.id, 1, "leader"),
    instanceId: "leader-1-cost-five",
    zone: "LEADER",
  };
  const opponentStage: CardInstance = {
    ...makeCharacter(COST_FIVE_STAGE.id, 1, "stage"),
    instanceId: "stage-1-cost-five",
    zone: "STAGE",
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([kuzan, ownFive]) };
  players[1] = {
    ...players[1],
    leader: opponentLeader,
    characters: padChars([opponentFive, opponentThree]),
    stage: opponentStage,
  };
  state = {
    ...state,
    players,
    turn: {
      ...state.turn,
      activePlayerIndex,
      actionsPerformedThisTurn: [],
    },
  };
  state = registerPermanentEffectsForCard(state, kuzan, KUZAN);
  return {
    state,
    cardDb,
    kuzan,
    ownFive,
    opponentFive,
    opponentThree,
    opponentLeader,
    opponentStage,
  };
}

describe("OPT-597 — OP02-121 Kuzan continuous your-turn cost aura", () => {
  it("applies before Kuzan attacks to every opponent Character, never its controller's Characters, and floors cost at 0", () => {
    const { state, cardDb, ownFive, opponentFive, opponentThree } = buildFieldState(0);

    expect(state.turn.actionsPerformedThisTurn).toEqual([]);
    expect(getEffectiveFieldCost(COST_FIVE, state, opponentFive.instanceId, cardDb)).toBe(0);
    expect(getEffectiveFieldCost(COST_THREE, state, opponentThree.instanceId, cardDb)).toBe(0);
    expect(getEffectiveFieldCost(COST_FIVE, state, ownFive.instanceId, cardDb)).toBe(5);
  });

  it("applies only to opposing Characters, not the opponent's Leader or Stage", () => {
    const { state, cardDb, opponentFive, opponentLeader, opponentStage } =
      buildFieldState(0);

    expect(getEffectiveFieldCost(COST_FIVE, state, opponentFive.instanceId, cardDb)).toBe(0);
    expect(
      getEffectiveFieldCost(COST_FIVE_LEADER, state, opponentLeader.instanceId, cardDb),
    ).toBe(5);
    expect(
      getEffectiveFieldCost(COST_FIVE_STAGE, state, opponentStage.instanceId, cardDb),
    ).toBe(5);
  });

  it("does not apply during the opponent's turn", () => {
    const { state, cardDb, opponentFive, opponentThree } = buildFieldState(1);

    expect(getEffectiveFieldCost(COST_FIVE, state, opponentFive.instanceId, cardDb)).toBe(5);
    expect(getEffectiveFieldCost(COST_THREE, state, opponentThree.instanceId, cardDb)).toBe(3);
  });

  it("is registered before On Play resolves, making an opponent's printed-cost-5 Character a legal K.O. target", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const kuzanInHand: CardInstance = {
      instanceId: "hand-kuzan",
      cardId: KUZAN.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const opponentFive = makeCharacter(COST_FIVE.id, 1, "on-play-target");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      hand: [...players[0].hand, kuzanInHand],
      characters: padChars([]),
      donCostArea: Array.from({ length: 10 }, (_, index) => ({
        instanceId: `don-kuzan-${index}`,
        state: "ACTIVE" as const,
        attachedTo: null,
      })),
    };
    players[1] = { ...players[1], characters: padChars([opponentFive]) };
    state = { ...state, players };

    const played = runPipeline(
      state,
      { type: "PLAY_CARD", cardInstanceId: kuzanInHand.instanceId },
      cardDb,
      0,
    );

    expect(played.valid).toBe(true);
    const prompt = played.pendingPrompt?.options;
    expect(prompt?.promptType).toBe("SELECT_TARGET");
    if (!prompt || prompt.promptType !== "SELECT_TARGET") {
      throw new Error("Expected Kuzan's On Play target prompt");
    }
    expect(prompt.validTargets).toContain(opponentFive.instanceId);
    expect(getEffectiveFieldCost(COST_FIVE, played.state, opponentFive.instanceId, cardDb)).toBe(0);

    const resolved = resumeFromStack(
      played.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [opponentFive.instanceId] } as GameAction,
      cardDb,
    );
    expect(resolved.state.players[1].characters.filter(Boolean)).toHaveLength(0);
    expect(resolved.state.players[1].trash.some((card) => card.cardId === COST_FIVE.id)).toBe(true);
  });
});

describe("OPT-597 — OP01-091 King opponent aura compatibility", () => {
  it("debuffs every opposing Character and never its controller's Characters", () => {
    const cardDb = buildCardDb();
    let state = createBattleReadyState(cardDb);
    const king: CardInstance = {
      ...state.players[0].leader,
      instanceId: "leader-0-king",
      cardId: KING.id,
    };
    const ownFive = makeCharacter(COST_FIVE.id, 0, "king-own-five");
    const opponentFive = makeCharacter(COST_FIVE.id, 1, "king-opponent-five");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: king,
      characters: padChars([ownFive]),
      donCostArea: Array.from({ length: 10 }, (_, index) => ({
        instanceId: `don-king-${index}`,
        state: "ACTIVE" as const,
        attachedTo: null,
      })),
    };
    players[1] = { ...players[1], characters: padChars([opponentFive]) };
    state = { ...state, players };
    state = registerPermanentEffectsForCard(state, king, KING);

    expect(getEffectivePower(ownFive, COST_FIVE, state, cardDb)).toBe(5000);
    expect(getEffectivePower(opponentFive, COST_FIVE, state, cardDb)).toBe(4000);
  });
});
