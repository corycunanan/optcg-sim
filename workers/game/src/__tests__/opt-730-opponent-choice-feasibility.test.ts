import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  LifeCard,
  PendingPromptState,
  PlayerState,
} from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { OP17_117_MASER_SABER } from "../engine/schemas/op17.js";
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
  patch: Partial<PlayerState>,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = { ...players[playerIndex], ...patch };
  return { ...state, players };
}

function makeMaserSaber(): CardData {
  return {
    ...CARDS.EVENT_COUNTER,
    id: "OP17-117",
    name: "Maser Saber",
    effectSchema: OP17_117_MASER_SABER,
    triggerText: "[Trigger] effect",
    keywords: { ...CARDS.EVENT_COUNTER.keywords, trigger: true },
  };
}

function driveToMaserSaberTrigger(opponentHandSize: number) {
  const cardDb = createTestCardDb();
  const maserSaber = makeMaserSaber();
  cardDb.set(maserSaber.id, maserSaber);
  let state = createBattleReadyState(cardDb);
  const opponentTarget = state.players[0].characters[0]!;
  const lifeCard: LifeCard = {
    instanceId: "life-op17-117",
    cardId: maserSaber.id,
    face: "DOWN",
  };
  state = withPlayer(state, 0, {
    hand: state.players[0].hand.slice(0, opponentHandSize),
    characters: padChars([opponentTarget]),
  });
  state = withPlayer(state, 1, { life: [lifeCard] });

  let result = runPipeline(
    state,
    {
      type: "DECLARE_ATTACK",
      attackerInstanceId: state.players[0].leader.instanceId,
      targetInstanceId: state.players[1].leader.instanceId,
    },
    cardDb,
    0,
  );
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, 0);
  expect(result.state.turn.battle?.pendingTriggerLifeCard?.cardId).toBe(maserSaber.id);

  result = runPipeline(
    result.state,
    { type: "REVEAL_TRIGGER", reveal: true },
    cardDb,
    1,
  );
  expect(result.valid).toBe(true);
  return { result, cardDb, opponentTarget };
}

describe("OPT-730 OPPONENT_CHOICE branch feasibility", () => {
  it("forces Maser Saber's K.O. branch when the opponent cannot trash exactly three cards", () => {
    const { result: trigger, cardDb, opponentTarget } = driveToMaserSaberTrigger(2);
    let result: PromptResult = trigger;

    if (result.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
      result = resumeFromStack(
        result.state,
        { type: "PLAYER_CHOICE", choiceId: "0" },
        cardDb,
      );
    }
    if (result.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      const validTargets = result.pendingPrompt.options.validTargets;
      const selectedInstanceIds = validTargets.includes(opponentTarget.instanceId)
        ? [opponentTarget.instanceId]
        : validTargets;
      result = resumeFromStack(
        result.state,
        { type: "SELECT_TARGET", selectedInstanceIds },
        cardDb,
      );
    }

    expect(result.state.players[0].hand).toHaveLength(2);
    expect(
      result.state.players[0].characters.some(
        (card: CardInstance | null) => card?.instanceId === opponentTarget.instanceId,
      ),
    ).toBe(false);
  });

  it("offers both Maser Saber branches when the opponent can trash exactly three cards", () => {
    const { result } = driveToMaserSaberTrigger(3);

    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    if (result.pendingPrompt?.options.promptType !== "PLAYER_CHOICE") {
      throw new Error("Expected a branch-choice prompt");
    }
    expect(result.pendingPrompt.options.choices.map((choice) => choice.id)).toEqual([
      "0",
      "1",
    ]);
  });
});
