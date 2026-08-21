import { describe, expect, it } from "vitest";
import { CONTINUATION_EFFECT_BLOCK } from "../engine/effect-stack.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { pushBatchResumeFrame } from "../engine/effect-resolver/resume/batch.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import type {
  EffectBlock,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP04_003_USOPP } from "../engine/schemas/op04.js";
import {
  OP13_079_IMU,
  OP13_082_FIVE_ELDERS,
  OP13_091_ST_MARCUS_MARS,
} from "../engine/schemas/op13.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type {
  CardData,
  CardInstance,
  EffectStackFrame,
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

  it("keeps a distributed play prompt above an outer interrupted continuation", () => {
    const scenario = selectFiveElders(true);
    expect(scenario.result.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );
    expect(
      scenario.result.state.effectStack.map((frame) => frame.phase)
    ).toEqual(["AWAITING_BATCH_RESUME", "AWAITING_OPTIONAL_RESPONSE"]);

    const [batchFrame, optionalFrame] = scenario.result.state.effectStack;
    if (batchFrame.batchResumeMarker?.kind !== "PLAY_CARD") {
      throw new Error("Expected a PLAY_CARD batch resume marker");
    }
    const promptedTarget = scenario.selected[1];
    const distributedAction = {
      ...batchFrame.batchResumeMarker.pausedAction,
      params: {
        ...batchFrame.batchResumeMarker.pausedAction.params,
        entry_state: "PLAYER_CHOICE" as const,
        state_distribution: { ACTIVE: 1, RESTED: 1 },
      },
    };
    const distributedBatchFrame: EffectStackFrame = {
      ...batchFrame,
      batchResumeMarker: {
        kind: "PLAY_CARD",
        pausedAction: distributedAction,
        resumeFrame: {
          remainingTargetIds: [promptedTarget.instanceId],
          remaining: { ACTIVE: 1, RESTED: 1 },
          playedSoFar: batchFrame.batchResumeMarker.resumeFrame.playedSoFar,
        },
      },
    };
    const outerFrame: EffectStackFrame = {
      ...batchFrame,
      id: "outer-interrupted-continuation",
      phase: "INTERRUPTED_BY_TRIGGERS",
      pausedAction: null,
      remainingActions: [
        {
          type: "SET_REST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            count: { all: true },
          },
        },
      ],
      pendingTriggers: [],
      batchResumeMarker: undefined,
    };
    const lifecycleServices = {
      drainPregame: (state: GameState) => state,
      advanceStartOfTurn: (state: GameState) => state,
    };
    const nestedState: GameState = {
      ...scenario.result.state,
      effectStack: [outerFrame, distributedBatchFrame, optionalFrame],
      pendingPrompt: scenario.result.pendingPrompt ?? null,
    };

    const declined = resumePromptLifecycle(
      nestedState,
      { type: "PLAYER_CHOICE", choiceId: "skip" },
      scenario.cardDb,
      lifecycleServices
    );
    expect(declined.state.pendingPrompt?.options.promptType).toBe(
      "PLAYER_CHOICE"
    );
    if (declined.state.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected a play state-choice prompt");
    }
    const activeChoice = declined.state.pendingPrompt.options.choices.find(
      (choice) => choice.id.endsWith(":ACTIVE")
    );
    if (!activeChoice) throw new Error("Expected an active play choice");

    const completed = resumePromptLifecycle(
      declined.state,
      { type: "PLAYER_CHOICE", choiceId: activeChoice.id },
      scenario.cardDb,
      lifecycleServices
    );
    const playedTarget = completed.state.players[0].characters.find(
      (card) => card?.cardId === promptedTarget.cardId
    );

    expect(playedTarget).toBeDefined();
    expect(playedTarget?.state).toBe("RESTED");
    expect(completed.state.effectStack).toHaveLength(0);
  });

  it("preserves a replacement-batch prompt raised during KO batch re-entry", () => {
    const cardDb = createTestCardDb();
    const saverCard: CardData = {
      ...CARDS.VANILLA,
      id: "REPLACEMENT-SAVER",
      name: "Replacement Saver",
    };
    cardDb.set(saverCard.id, saverCard);
    const base = createBattleReadyState(cardDb);
    const saver = cardInstance(
      saverCard.id,
      "replacement-saver",
      0,
      "CHARACTER"
    );
    const victim = cardInstance(
      CARDS.BLOCKER.id,
      "replacement-victim",
      0,
      "CHARACTER"
    );
    const replacement: RuntimeActiveEffect = {
      id: "opt-739-save-replacement",
      sourceCardInstanceId: saver.instanceId,
      sourceEffectBlockId: "opt-739-save-replacement-block",
      category: "replacement",
      modifiers: [
        {
          type: "REPLACEMENT_EFFECT",
          params: {
            trigger: "WOULD_BE_KO",
            cause_filter: { by: "OPPONENT_EFFECT" },
            target_filter: {
              card_type: "CHARACTER",
              exclude_self: true,
            },
            replacement_actions: [
              { type: "TRASH_CARD", target: { type: "SELF" } },
            ],
            optional: true,
            once_per_turn: false,
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 0,
    };
    const koAction = {
      type: "KO" as const,
      target: {
        type: "CHARACTER" as const,
        controller: "OPPONENT" as const,
        count: { exact: 1 },
      },
    };
    const state = withPlayers(base, {
      characters: padChars([saver, victim]),
    });
    const stateWithBatch = pushBatchResumeFrame(
      { ...state, activeEffects: [replacement] },
      "opponent-effect-source",
      1,
      CONTINUATION_EFFECT_BLOCK,
      {
        kind: "KO",
        pausedAction: koAction,
        remainingTargetIds: [victim.instanceId],
        koedSoFar: [],
      },
      [],
      [],
      new Map()
    );

    const prompted = resumeFromStack(stateWithBatch, { type: "PASS" }, cardDb);
    expect(prompted.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const completed = resumePromptLifecycle(
      {
        ...prompted.state,
        pendingPrompt: prompted.pendingPrompt ?? null,
      },
      { type: "PLAYER_CHOICE", choiceId: "accept" },
      cardDb,
      {
        drainPregame: (current: GameState) => current,
        advanceStartOfTurn: (current: GameState) => current,
      }
    );

    expect(
      completed.state.players[0].trash.some(
        (card) => card.cardId === saverCard.id
      )
    ).toBe(true);
    expect(
      completed.state.players[0].characters.some(
        (card) => card?.instanceId === victim.instanceId
      )
    ).toBe(true);
  });

  it("dispatches an AWAITING_BATCH_RESUME frame directly from the stack", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const target = cardInstance(
      CARDS.VANILLA.id,
      "direct-batch-target",
      0,
      "TRASH"
    );
    const action = {
      type: "PLAY_CARD" as const,
      target: {
        type: "CHARACTER_CARD" as const,
        source_zone: "TRASH" as const,
        count: { exact: 1 },
      },
      params: { source_zone: "TRASH" as const, cost_override: "FREE" as const },
    };
    const stateWithBatch = pushBatchResumeFrame(
      withPlayers(base, { characters: padChars([]), trash: [target] }),
      "direct-batch-source",
      0,
      CONTINUATION_EFFECT_BLOCK,
      {
        kind: "PLAY_CARD",
        pausedAction: action,
        resumeFrame: {
          remainingTargetIds: [target.instanceId],
          remaining: { ACTIVE: 0, RESTED: 0 },
          playedSoFar: [],
        },
      },
      [],
      [],
      new Map()
    );
    expect(stateWithBatch.effectStack.at(-1)?.phase).toBe(
      "AWAITING_BATCH_RESUME"
    );

    const result = resumeFromStack(stateWithBatch, { type: "PASS" }, cardDb);

    expect(
      result.state.players[0].characters.some(
        (card) => card?.cardId === target.cardId
      )
    ).toBe(true);
    expect(result.events.some((event) => event.type === "CARD_PLAYED")).toBe(
      true
    );
    expect(result.state.effectStack).toHaveLength(0);
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
    expect(
      result.state.players[1].trash.some(
        (card) => card.cardId === secondVictim.cardId
      )
    ).toBe(true);
    expect(result.state.effectStack).toHaveLength(0);
  });
});
