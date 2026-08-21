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
import type { EffectBlock } from "../engine/effect-types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { runPipeline } from "../engine/pipeline.js";
import { OP05_058_WASTE_OF_HUMAN_LIFE } from "../engine/schemas/op05.js";
import { OP06_058_GRAVITY_BLADE_RAGING_TIGER } from "../engine/schemas/op06.js";
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

  it("prompts one owner to order a mixed Character and Stage field batch", () => {
    const cardDb = createTestCardDb();
    const base = createBattleReadyState(cardDb);
    const character = fieldCharacter("opt725-mixed-character", CARDS.VANILLA.id, 0);
    const stage: CardInstance = {
      instanceId: "opt725-mixed-stage",
      cardId: CARDS.STAGE.id,
      zone: "STAGE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([character]),
      stage,
    };
    const state = { ...base, players };
    const block: EffectBlock = {
      id: "return-mixed-field-batch",
      category: "auto",
      actions: [{
        type: "RETURN_TO_DECK",
        target: {
          type: "FIELD_CARD",
          controller: "SELF",
          count: { exact: 2 },
        },
        params: { position: "BOTTOM" },
      }],
    };

    const selection = resolveEffect(
      state,
      block,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(selection.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const arrange = resumeFromStack(
      selection.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [character.instanceId, stage.instanceId],
      },
      cardDb,
    );

    expect(arrange.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(arrange.pendingPrompt?.respondingPlayer).toBe(0);

    const ordered = [stage, character];
    const resolved = resumeFromStack(
      arrange.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ordered.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
    );
    expect(resolved.state.players[0].characters.filter(Boolean)).toHaveLength(0);
    expect(resolved.state.players[0].stage).toBeNull();
    expect(resolved.state.players[0].deck.slice(-2).map((card) => card.cardId)).toEqual(
      ordered.map((card) => card.cardId),
    );
  });

  it("lets the owner apply OP06-058's chosen order to two Characters", () => {
    const cardDb = createTestCardDb();
    const targetData = [
      { ...CARDS.RUSH, id: "OPT725-GRAVITY-A", cost: 5, effectSchema: null },
      { ...CARDS.BLOCKER, id: "OPT725-GRAVITY-B", cost: 6, effectSchema: null },
    ];
    for (const data of targetData) cardDb.set(data.id, data);
    const base = createBattleReadyState(cardDb);
    const targets = targetData.map((data, index) =>
      fieldCharacter(`opt725-gravity-${index}`, data.id, 1)
    );
    const players = [...base.players] as [PlayerState, PlayerState];
    players[1] = { ...players[1], characters: padChars(targets) };
    const state = { ...base, players };
    const deckBefore = state.players[1].deck.length;

    const selection = resolveEffect(
      state,
      OP06_058_GRAVITY_BLADE_RAGING_TIGER.effects[0]!,
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(selection.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");

    const arrange = resumeFromStack(
      selection.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: targets.map((card) => card.instanceId),
      },
      cardDb,
    );
    expect(arrange.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(arrange.pendingPrompt?.respondingPlayer).toBe(1);

    const ordered = [...targets].reverse();
    const resolved = resumeFromStack(
      arrange.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ordered.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
    );

    expect(resolved.state.players[1].characters.filter(Boolean)).toHaveLength(0);
    expect(resolved.state.players[1].deck).toHaveLength(deckBefore + 2);
    expect(resolved.state.players[1].deck.slice(-2).map((card) => card.cardId)).toEqual(
      ordered.map((card) => card.cardId),
    );
  });

  it("prompts each owner sequentially for an OP05-058 owner-mixed batch", () => {
    const cardDb = createTestCardDb();
    const cardsByOwner = ([0, 1] as const).map((owner) =>
      [0, 1].map((index) => {
        const data = {
          ...CARDS.VANILLA,
          id: `OPT725-WASTE-${owner}-${index}`,
          cost: index + 1,
          effectSchema: null,
        };
        cardDb.set(data.id, data);
        return fieldCharacter(`opt725-waste-${owner}-${index}`, data.id, owner);
      })
    );
    const base = createBattleReadyState(cardDb);
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars(cardsByOwner[0]) };
    players[1] = { ...players[1], characters: padChars(cardsByOwner[1]) };
    const state = { ...base, players };
    const deckBefore = state.players.map((player) => player.deck.length);

    const firstArrange = resolveEffect(
      state,
      {
        ...OP05_058_WASTE_OF_HUMAN_LIFE.effects[0]!,
        actions: [OP05_058_WASTE_OF_HUMAN_LIFE.effects[0]!.actions![0]],
      },
      state.players[0].leader.instanceId,
      0,
      cardDb,
    );
    expect(firstArrange.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(firstArrange.pendingPrompt?.respondingPlayer).toBe(0);

    const ownerZeroOrder = [...cardsByOwner[0]].reverse();
    const secondArrange = resumeFromStack(
      firstArrange.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ownerZeroOrder.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
    );
    expect(secondArrange.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(secondArrange.pendingPrompt?.respondingPlayer).toBe(1);

    const ownerOneOrder = [...cardsByOwner[1]].reverse();
    const resolved = resumeFromStack(
      secondArrange.state,
      {
        type: "ARRANGE_TOP_CARDS",
        keptCardInstanceId: "",
        orderedInstanceIds: ownerOneOrder.map((card) => card.instanceId),
        destination: "bottom",
      },
      cardDb,
    );

    expect(resolved.pendingPrompt).toBeUndefined();
    for (const owner of [0, 1] as const) {
      const ordered = owner === 0 ? ownerZeroOrder : ownerOneOrder;
      expect(resolved.state.players[owner].characters.filter(Boolean)).toHaveLength(0);
      expect(resolved.state.players[owner].deck).toHaveLength(deckBefore[owner] + 2);
      expect(resolved.state.players[owner].deck.slice(-2).map((card) => card.cardId)).toEqual(
        ordered.map((card) => card.cardId),
      );
    }
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
