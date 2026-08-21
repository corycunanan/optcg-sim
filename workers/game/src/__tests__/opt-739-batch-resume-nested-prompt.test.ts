import { describe, expect, it } from "vitest";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP04_003_USOPP } from "../engine/schemas/op04.js";
import {
  OP13_079_IMU,
  OP13_082_FIVE_ELDERS,
  OP13_091_ST_MARCUS_MARS,
} from "../engine/schemas/op13.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const FIVE_ELDERS_EFFECT_ID = "OP13-082_activate_main";
const VANILLA_ELDERS = [
  ["OP13-080", "St. Ethanbaron V. Nusjuro"],
  ["OP13-083", "St. Jaygarcia Saturn"],
  ["OP13-084", "St. Shepherd Ju Peter"],
  ["OP13-089", "St. Topman Warcury"],
] as const;

const IMU: CardData = {
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

const MARS: CardData = {
  ...CARDS.VANILLA,
  id: "OP13-091",
  name: "St. Marcus Mars",
  color: ["Black"],
  cost: 5,
  power: 5000,
  types: ["Five Elders", "Celestial Dragons"],
  effectSchema: OP13_091_ST_MARCUS_MARS,
};

const OTHER_ELDERS: CardData[] = VANILLA_ELDERS.map(([id, name]) => ({
  ...CARDS.VANILLA,
  id,
  name,
  color: ["Black"],
  power: 5000,
  types: ["Five Elders", "Celestial Dragons"],
}));

const USOPP: CardData = {
  ...CARDS.VANILLA,
  id: "OP04-003",
  name: "Usopp",
  cost: 4,
  power: 5000,
  effectSchema: OP04_003_USOPP,
};

function cardInstance(
  cardId: string,
  instanceId: string,
  owner: 0 | 1,
  zone: CardInstance["zone"]
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: zone === "CHARACTER" ? 1 : null,
    controller: owner,
    owner,
  };
}

function withPlayers(
  state: GameState,
  player0: Partial<PlayerState>,
  player1: Partial<PlayerState> = {}
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], ...player0 };
  players[1] = { ...players[1], ...player1 };
  return { ...state, players };
}

function buildFiveEldersScenario(marsFirst: boolean) {
  const cardDb = createTestCardDb();
  for (const card of [IMU, FIVE_ELDERS, MARS, ...OTHER_ELDERS]) {
    cardDb.set(card.id, card);
  }

  const base = createBattleReadyState(cardDb);
  const source = cardInstance(
    FIVE_ELDERS.id,
    "five-elders-source",
    0,
    "CHARACTER"
  );
  const mars = cardInstance(MARS.id, "trash-mars", 0, "TRASH");
  const otherElders = OTHER_ELDERS.map((card) =>
    cardInstance(card.id, `trash-${card.id}`, 0, "TRASH")
  );
  const selected = marsFirst ? [mars, ...otherElders] : [...otherElders, mars];
  const opponentTarget = cardInstance(
    CARDS.VANILLA.id,
    "opponent-ko-target",
    1,
    "CHARACTER"
  );

  const state = withPlayers(
    base,
    {
      leader: { ...base.players[0].leader, cardId: IMU.id },
      characters: padChars([source]),
      trash: selected,
    },
    { characters: padChars([opponentTarget]) }
  );

  return { state, cardDb, source, selected, opponentTarget };
}

function selectFiveElders(marsFirst: boolean) {
  const scenario = buildFiveEldersScenario(marsFirst);
  const activation = runPipeline(
    scenario.state,
    {
      type: "ACTIVATE_EFFECT",
      cardInstanceId: scenario.source.instanceId,
      effectId: FIVE_ELDERS_EFFECT_ID,
    },
    scenario.cardDb,
    0
  );
  expect(activation.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");

  let result = resumeFromStack(
    activation.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    scenario.cardDb
  );
  expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
    throw new Error("Expected the Five Elders hand-cost prompt");
  }

  result = resumeFromStack(
    result.state,
    {
      type: "SELECT_TARGET",
      selectedInstanceIds: [result.pendingPrompt.options.validTargets[0]],
    },
    scenario.cardDb
  );
  expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

  result = resumeFromStack(
    result.state,
    {
      type: "SELECT_TARGET",
      selectedInstanceIds: scenario.selected.map((card) => card.instanceId),
    },
    scenario.cardDb
  );

  return { ...scenario, result };
}

function expectAllEldersPlayed(state: GameState) {
  expect(
    state.players[0].characters
      .filter((card): card is CardInstance => card !== null)
      .map((card) => card.cardId)
      .sort()
  ).toEqual([MARS.id, ...OTHER_ELDERS.map((card) => card.id)].sort());
  expect(state.effectStack).toHaveLength(0);
}

describe("OPT-739: nested prompts re-enter batch resume", () => {
  it("resumes the remaining Five Elders after accepting Mars and completing its prompts", () => {
    const scenario = selectFiveElders(true);
    expect(scenario.result.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );

    let result = resumeFromStack(
      scenario.result.state,
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      scenario.cardDb
    );
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (result.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected the Mars hand-cost prompt");
    }
    result = resumeFromStack(
      result.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [result.pendingPrompt.options.validTargets[0]],
      },
      scenario.cardDb
    );
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    result = resumeFromStack(
      result.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [scenario.opponentTarget.instanceId],
      },
      scenario.cardDb
    );

    expectAllEldersPlayed(result.state);
    expect(result.state.players[0].trash).toHaveLength(3);
    expect(result.state.players[1].characters.filter(Boolean)).toHaveLength(0);
  });

  it("resumes the remaining Five Elders after declining Mars", () => {
    const scenario = selectFiveElders(true);
    expect(scenario.result.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );

    const result = resumeFromStack(
      scenario.result.state,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      scenario.cardDb
    );

    expectAllEldersPlayed(result.state);
    expect(result.state.players[0].trash).toHaveLength(2);
  });

  it("finishes without a batch frame when Mars is the last selected target", () => {
    const scenario = selectFiveElders(false);
    expect(scenario.result.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );
    expect(
      scenario.result.state.effectStack.some(
        (frame) => frame.phase === "AWAITING_BATCH_RESUME"
      )
    ).toBe(false);

    const result = resumeFromStack(
      scenario.result.state,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      scenario.cardDb
    );

    expectAllEldersPlayed(result.state);
  });

  it("resumes a multi-KO after the first target's real ON_KO prompt", () => {
    const cardDb = createTestCardDb();
    cardDb.set(USOPP.id, USOPP);
    const base = createBattleReadyState(cardDb);
    const ownTarget = cardInstance(
      CARDS.VANILLA.id,
      "usopp-ko-target",
      0,
      "CHARACTER"
    );
    const usopp = cardInstance(USOPP.id, "opponent-usopp", 1, "CHARACTER");
    const secondVictim = cardInstance(
      CARDS.BLOCKER.id,
      "opponent-second-victim",
      1,
      "CHARACTER"
    );
    let state = withPlayers(
      base,
      { characters: padChars([ownTarget]) },
      { characters: padChars([usopp, secondVictim]) }
    );
    state = registerTriggersForCard(state, usopp, USOPP);

    const block: EffectBlock = {
      id: "opt-739-ko-two",
      category: "activate",
      actions: [
        {
          type: "KO",
          target: {
            type: "CHARACTER",
            controller: "OPPONENT",
            count: { exact: 2 },
          },
        },
      ],
    };
    let result = resolveEffect(state, block, "effect-source", 0, cardDb);
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    result = resumeFromStack(
      result.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [usopp.instanceId, secondVictim.instanceId],
      },
      cardDb
    );
    expect(result.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    result = resumeFromStack(
      result.state,
      { type: "SELECT_TARGET", selectedInstanceIds: [ownTarget.instanceId] },
      cardDb
    );

    expect(result.state.players[1].characters.filter(Boolean)).toHaveLength(0);
    expect(result.state.effectStack).toHaveLength(0);
  });
});
