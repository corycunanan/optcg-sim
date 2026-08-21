/**
 * OPT-725 — field-to-deck batches use the owner's deck-ordering choice.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import { resumeFromStack } from "../engine/effect-resolver/index.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP17_041_WANG_ZHI } from "../engine/schemas/op17.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const WANG_ZHI_DATA: CardData = {
  ...CARDS.VANILLA,
  id: "OP17-041",
  name: "Wang Zhi",
  color: ["Blue"],
  cost: 4,
  power: 6000,
  counter: null,
  types: ["Rocks Pirates"],
  effectSchema: OP17_041_WANG_ZHI,
};

function fieldCharacter(
  instanceId: string,
  cardId: string,
  owner: 0 | 1
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

function setup(targetCount: 1 | 2): {
  state: GameState;
  cardDb: Map<string, CardData>;
  wangZhi: CardInstance;
  targets: CardInstance[];
} {
  const cardDb = createTestCardDb();
  cardDb.set(WANG_ZHI_DATA.id, WANG_ZHI_DATA);
  const targetData = [
    { ...CARDS.RUSH, id: "OPT725-COST-ONE-A", cost: 1, effectSchema: null },
    { ...CARDS.BLOCKER, id: "OPT725-COST-ONE-B", cost: 1, effectSchema: null },
  ];
  for (const data of targetData) cardDb.set(data.id, data);
  const base = createBattleReadyState(cardDb);
  const wangZhi: CardInstance = {
    instanceId: "opt725-wang-zhi-hand",
    cardId: WANG_ZHI_DATA.id,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  };
  const targets = [
    fieldCharacter("opt725-target-a", targetData[0].id, 1),
    fieldCharacter("opt725-target-b", targetData[1].id, 1),
  ].slice(0, targetCount);
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], hand: [wangZhi, ...players[0].hand] };
  players[1] = { ...players[1], characters: padChars(targets) };
  return { state: { ...base, players }, cardDb, wangZhi, targets };
}

function acceptAndPayCost(
  state: GameState,
  cardDb: Map<string, CardData>,
  wangZhi: CardInstance
) {
  const played = runPipeline(
    state,
    { type: "PLAY_CARD", cardInstanceId: wangZhi.instanceId },
    cardDb,
    0
  );
  expect(played.valid).toBe(true);
  expect(played.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const accepted = resumeFromStack(
    played.state,
    { type: "PLAYER_CHOICE", choiceId: "accept" },
    cardDb
  );
  expect(accepted.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  if (accepted.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
    throw new Error("Expected Wang Zhi's hand-trash cost selection");
  }
  return resumeFromStack(
    accepted.state,
    {
      type: "SELECT_TARGET",
      selectedInstanceIds: [accepted.pendingPrompt.options.validTargets[0]],
    },
    cardDb
  );
}

describe("OPT-725 — OP17-041 field-to-deck owner ordering", () => {
  it("prompts the opponent to order multiple base-cost-1 Characters before moving them", () => {
    const { state, cardDb, wangZhi, targets } = setup(2);

    const arrange = acceptAndPayCost(state, cardDb, wangZhi);

    expect(arrange.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(arrange.pendingPrompt?.respondingPlayer).toBe(1);
    if (arrange.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("Expected the opponent's field-to-deck ordering prompt");
    }
    expect(
      arrange.pendingPrompt.options.cards.map((card) => card.instanceId)
    ).toEqual(targets.map((card) => card.instanceId));

    const ordered = [...targets].reverse();
    const resolved = resumeFromStack(
      arrange.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ordered.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb
    );

    expect(resolved.pendingPrompt).toBeUndefined();
    expect(resolved.state.players[1].characters.filter(Boolean)).toHaveLength(
      0
    );
    expect(
      resolved.state.players[1].deck.slice(-2).map((card) => card.cardId)
    ).toEqual(ordered.map((card) => card.cardId));
  });

  it("moves one base-cost-1 Character without opening an ordering prompt", () => {
    const { state, cardDb, wangZhi, targets } = setup(1);
    const deckBefore = state.players[1].deck.length;

    const resolved = acceptAndPayCost(state, cardDb, wangZhi);

    expect(resolved.pendingPrompt).toBeUndefined();
    expect(resolved.state.players[1].characters.filter(Boolean)).toHaveLength(
      0
    );
    expect(resolved.state.players[1].deck).toHaveLength(deckBefore + 1);
    expect(resolved.state.players[1].deck.at(-1)?.cardId).toBe(
      targets[0].cardId
    );
  });
});
