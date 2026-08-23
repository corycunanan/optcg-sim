/**
 * OPT-698 — OP13-082 Five Elders trashes every allied Character before
 * continuing to play five distinct Five Elders from trash.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameAction,
  PendingEvent,
  PlayerState,
} from "../types.js";
import {
  OP13_079_IMU,
  OP13_082_FIVE_ELDERS,
  OP13_083_ST_JAYGARCIA_SATURN,
  OP13_091_ST_MARCUS_MARS,
} from "../engine/schemas/op13.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const EFFECT_ID = "OP13-082_activate_main";
const FIVE_ELDER_IDS = [
  "OP13-080",
  "OP13-083",
  "OP13-084",
  "OP13-089",
  "OP13-091",
];

const IMU_LEADER: CardData = {
  ...CARDS.LEADER,
  id: "OP13-079",
  name: "Imu",
  color: ["Black"],
  types: ["Celestial Dragons"],
  effectSchema: OP13_079_IMU,
};

const FIVE_ELDERS: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-082",
  name: "Five Elders",
  color: ["Black"],
  cost: 10,
  power: 12000,
  types: ["Five Elders", "Celestial Dragons"],
  effectSchema: OP13_082_FIVE_ELDERS,
};

const ELDER_CARDS: CardData[] = FIVE_ELDER_IDS.map((id, index) => ({
  ...CARDS.VANILLA,
  id,
  name: `Five Elder ${index + 1}`,
  color: ["Black"],
  power: 5000,
  types: ["Five Elders", "Celestial Dragons"],
}));

function character(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

function trashCard(cardId: string): CardInstance {
  return {
    ...character(cardId, `trash-${cardId}`),
    zone: "TRASH",
    turnPlayed: null,
  };
}

function eventInstanceId(
  event: PendingEvent,
  field: "cardInstanceId" | "newCardInstanceId"
) {
  const payload = event.payload;
  if (!payload || !(field in payload)) return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function withPlayer(
  state: ReturnType<typeof createBattleReadyState>,
  patch: Partial<PlayerState>
) {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], ...patch };
  return { ...state, players };
}

function buildScenario(useImu = true) {
  const cardDb = createTestCardDb();
  cardDb.set(IMU_LEADER.id, IMU_LEADER);
  cardDb.set(FIVE_ELDERS.id, FIVE_ELDERS);
  for (const card of ELDER_CARDS) cardDb.set(card.id, card);

  let state = createBattleReadyState(cardDb);
  const vanillaA = character(CARDS.VANILLA.id, "vanilla-a");
  const vanillaB = character(CARDS.VANILLA.id, "vanilla-b");
  const fiveElders = character(FIVE_ELDERS.id, "five-elders-source");
  state = withPlayer(state, {
    leader: useImu
      ? { ...state.players[0].leader, cardId: IMU_LEADER.id }
      : state.players[0].leader,
    characters: padChars([vanillaA, vanillaB, fiveElders]),
    trash: ELDER_CARDS.map((card) => trashCard(card.id)),
  });

  return { state, cardDb, fiveElders, vanillaA, vanillaB };
}

describe("OPT-698: OP13-082 Five Elders", () => {
  it("orders real Elder ON_PLAY effects after both cards reach the board", () => {
    const scenario = buildScenario();
    const saturn = {
      ...ELDER_CARDS.find((card) => card.id === "OP13-083")!,
      name: "St. Jaygarcia Saturn",
      effectSchema: OP13_083_ST_JAYGARCIA_SATURN,
    };
    const mars = {
      ...ELDER_CARDS.find((card) => card.id === "OP13-091")!,
      name: "St. Marcus Mars",
      effectSchema: OP13_091_ST_MARCUS_MARS,
    };
    scenario.cardDb.set(saturn.id, saturn);
    scenario.cardDb.set(mars.id, mars);

    const activation = runPipeline(
      scenario.state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: scenario.fiveElders.instanceId,
        effectId: EFFECT_ID,
      },
      scenario.cardDb,
      0
    );
    let result = resumeFromStack(
      activation.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      scenario.cardDb
    );
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the hand-cost target prompt");
    }
    result = resumeFromStack(
      result.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [result.pendingPrompt.options.validTargets[0]],
      },
      scenario.cardDb
    );
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the Five Elders target prompt");
    }
    const selectedIds = result.pendingPrompt.options.validTargets.filter(
      (id) => {
        const card = result.state.players[0].trash.find(
          (candidate) => candidate.instanceId === id
        );
        return card?.cardId === saturn.id || card?.cardId === mars.id;
      }
    );
    result = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: selectedIds },
      scenario.cardDb
    );

    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(result.state.effectStack.at(-1)?.phase).toBe(
      "AWAITING_TRIGGER_ORDER_SELECTION"
    );
    expect(
      result.state.players[0].characters
        .filter((card): card is CardInstance => card !== null)
        .map((card) => card.cardId)
        .sort()
    ).toEqual([saturn.id, mars.id].sort());
    if (result.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected the trigger-ordering prompt");
    }
    const marsChoice = result.pendingPrompt.options.choices.find((choice) =>
      choice.label.includes(mars.name)
    );
    if (!marsChoice) throw new Error("Expected the Mars trigger choice");

    result = resumeFromStack(
      result.state,
      { type: "PLAYER_CHOICE", choiceId: marsChoice.id },
      scenario.cardDb
    );
    expect(result.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(result.state.effectStack.at(-1)?.effectBlock.id).toBe(
      "OP13-091_on_play"
    );
  });

  it("trashes all allied Characters without K.O. events, then plays five distinct Elders", () => {
    const scenario = buildScenario();
    const handSizeBefore = scenario.state.players[0].hand.length;
    const activeDonBefore = scenario.state.players[0].donCostArea.filter(
      (don) => don.state === "ACTIVE"
    ).length;
    const events: PendingEvent[] = [];

    const activation = runPipeline(
      scenario.state,
      {
        type: "ACTIVATE_EFFECT",
        cardInstanceId: scenario.fiveElders.instanceId,
        effectId: EFFECT_ID,
      },
      scenario.cardDb,
      0
    );
    expect(activation.valid).toBe(true);
    expect(activation.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );

    let result = resumeFromStack(
      activation.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      scenario.cardDb
    );
    events.push(...result.events);

    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the hand-cost target prompt");
    }
    const handCardId = result.pendingPrompt.options.validTargets[0];

    result = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [handCardId] },
      scenario.cardDb
    );
    events.push(...result.events);

    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the Five Elders target prompt");
    }
    expect(result.pendingPrompt.options.validTargets).toHaveLength(5);
    expect(result.pendingPrompt.options.countMax).toBe(5);
    expect(result.pendingPrompt.options.uniquenessConstraint?.field).toBe(
      "name"
    );
    const elderInstanceIds = result.pendingPrompt.options.validTargets;

    result = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: elderInstanceIds },
      scenario.cardDb
    );
    events.push(...result.events);

    const player = result.state.players[0];
    expect(
      player.characters
        .filter(Boolean)
        .map((card) => card!.cardId)
        .sort()
    ).toEqual([...FIVE_ELDER_IDS].sort());

    const trashedBoardInstanceIds = new Set([
      scenario.vanillaA.instanceId,
      scenario.vanillaB.instanceId,
      scenario.fiveElders.instanceId,
    ]);
    const boardRemovalEvents = events.filter((event) => {
      const instanceId = eventInstanceId(event, "cardInstanceId");
      return (
        instanceId !== undefined && trashedBoardInstanceIds.has(instanceId)
      );
    });
    expect(boardRemovalEvents.some((event) => event.type === "CARD_KO")).toBe(
      false
    );
    expect(
      boardRemovalEvents
        .filter((event) => event.type === "CARD_TRASHED")
        .map((event) => eventInstanceId(event, "cardInstanceId"))
        .sort()
    ).toEqual([...trashedBoardInstanceIds].sort());
    const boardTrashInstanceIds = boardRemovalEvents
      .filter((event) => event.type === "CARD_TRASHED")
      .map((event) => eventInstanceId(event, "newCardInstanceId"));
    expect(
      boardTrashInstanceIds.every((instanceId) =>
        player.trash.some((card) => card.instanceId === instanceId)
      )
    ).toBe(true);

    expect(
      player.donCostArea.filter((don) => don.state === "ACTIVE")
    ).toHaveLength(activeDonBefore - 1);
    expect(player.hand).toHaveLength(handSizeBefore - 1);
  });

  it("rejects activation without recording or changing state when the Leader is not Imu", () => {
    const { state, cardDb, fiveElders } = buildScenario(false);
    const playerBefore = state.players[0];
    const action: GameAction = {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: fiveElders.instanceId,
      effectId: EFFECT_ID,
    };

    const result = runPipeline(state, action, cardDb, 0);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Effect conditions are not met");
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.effectStack).toHaveLength(0);
    expect(result.state.turn.actionsPerformedThisTurn).toEqual(
      state.turn.actionsPerformedThisTurn
    );
    expect(result.state.players[0].hand).toEqual(playerBefore.hand);
    expect(result.state.players[0].donCostArea).toEqual(
      playerBefore.donCostArea
    );
    expect(result.state.players[0].characters).toEqual(playerBefore.characters);
  });
});
