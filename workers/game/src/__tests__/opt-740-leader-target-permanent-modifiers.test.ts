/**
 * OPT-740 — permanent modifier leader targets resolve to their declared field
 * population instead of falling through as wildcards.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import type {
  EffectSchema,
  RuntimeActiveEffect,
  Target,
} from "../engine/effect-types.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { OP03_004_CURIEL } from "../engine/schemas/op03.js";
import {
  OP13_004_SABO,
  OP13_099_THE_EMPTY_THRONE,
} from "../engine/schemas/op13.js";
import { ST28_004_KOUZUKI_MOMONOSUKE } from "../engine/schemas/st28.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function data(
  id: string,
  type: CardData["type"],
  power: number | null,
  effectSchema: EffectSchema | null = null,
  cost: number | null = 4
): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    type,
    cost,
    power,
    life: type === "Leader" ? 5 : null,
    effectSchema,
  };
}

function instance(
  cardId: string,
  controller: 0 | 1,
  instanceId: string,
  zone: CardInstance["zone"]
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

function power(
  card: CardInstance,
  state: GameState,
  cardDb: Map<string, CardData>
): number {
  const cardData = cardDb.get(card.cardId);
  if (!cardData) throw new Error(`Missing card data for ${card.cardId}`);
  return getEffectivePower(card, cardData, state, cardDb);
}

function trash(count: number, controller: 0 | 1): CardInstance[] {
  return Array.from({ length: count }, (_, index) =>
    instance(
      CARDS.VANILLA.id,
      controller,
      `trash-${controller}-${index}`,
      "TRASH"
    )
  );
}

function runtimeEffect(
  source: CardInstance,
  target: Target
): RuntimeActiveEffect {
  return {
    id: `opt740-${target.type}`,
    sourceCardInstanceId: source.instanceId,
    sourceEffectBlockId: `opt740-${target.type}`,
    category: "permanent",
    modifiers: [
      {
        type: "MODIFY_POWER",
        target,
        params: { amount: 1000 },
      },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: source.controller,
    appliesTo: [],
    timestamp: 1,
  };
}

describe("OPT-740 — permanent modifier leader targets", () => {
  it("applies OP13-099 The Empty Throne only to its controller's Leader", () => {
    const throneData = data(
      "OP13-099",
      "Stage",
      null,
      OP13_099_THE_EMPTY_THRONE
    );
    const cardDb = createTestCardDb();
    cardDb.set(throneData.id, throneData);
    let state = createBattleReadyState(cardDb);
    const throne = instance(throneData.id, 0, "opt740-throne", "STAGE");
    const ownCharacter = state.players[0].characters[0]!;
    const opponentCharacter = state.players[1].characters[0]!;
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], stage: throne, trash: trash(19, 0) };
    state = {
      ...state,
      players,
      turn: { ...state.turn, activePlayerIndex: 0 },
    };
    state = registerPermanentEffectsForCard(state, throne, throneData);

    expect(power(state.players[0].leader, state, cardDb)).toBe(6000);
    expect(power(state.players[1].leader, state, cardDb)).toBe(5000);
    expect(power(ownCharacter, state, cardDb)).toBe(4000);
    expect(power(opponentCharacter, state, cardDb)).toBe(4000);
  });

  it("keeps OP13-099 inactive below 19 trash and outside its controller's turn", () => {
    const throneData = data(
      "OP13-099",
      "Stage",
      null,
      OP13_099_THE_EMPTY_THRONE
    );
    const cardDb = createTestCardDb();
    cardDb.set(throneData.id, throneData);
    let state = createBattleReadyState(cardDb);
    const throne = instance(throneData.id, 0, "opt740-throne-gates", "STAGE");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], stage: throne, trash: trash(18, 0) };
    state = { ...state, players };
    state = registerPermanentEffectsForCard(state, throne, throneData);

    expect(power(state.players[0].leader, state, cardDb)).toBe(5000);

    const opponentTurnPlayers = [...state.players] as [
      PlayerState,
      PlayerState,
    ];
    opponentTurnPlayers[0] = {
      ...opponentTurnPlayers[0],
      trash: trash(22, 0),
    };
    const opponentTurnState = {
      ...state,
      players: opponentTurnPlayers,
      turn: { ...state.turn, activePlayerIndex: 1 as const },
    };
    expect(
      power(opponentTurnState.players[0].leader, opponentTurnState, cardDb)
    ).toBe(5000);
  });

  it("applies ST28-004 Kouzuki Momonosuke only to its controller's Leader", () => {
    const momonosukeData = data(
      "ST28-004",
      "Character",
      2000,
      ST28_004_KOUZUKI_MOMONOSUKE
    );
    const cardDb = createTestCardDb();
    cardDb.set(momonosukeData.id, momonosukeData);
    let state = createBattleReadyState(cardDb);
    const momonosuke = instance(
      momonosukeData.id,
      0,
      "opt740-momonosuke",
      "CHARACTER"
    );
    const ownCharacter = state.players[0].characters[0]!;
    const opponentCharacter = state.players[1].characters[0]!;
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      life: players[0].life.slice(0, 2),
      characters: padChars([momonosuke, ownCharacter]),
    };
    state = { ...state, players };
    state = registerPermanentEffectsForCard(state, momonosuke, momonosukeData);

    expect(power(state.players[0].leader, state, cardDb)).toBe(6000);
    expect(power(state.players[1].leader, state, cardDb)).toBe(5000);
    expect(power(ownCharacter, state, cardDb)).toBe(4000);
    expect(power(opponentCharacter, state, cardDb)).toBe(4000);
  });

  it("applies the OP03-004 OPPONENT_LEADER target only to the opposing Leader", () => {
    const curielData = data("OP03-004", "Character", 4000, OP03_004_CURIEL);
    const cardDb = createTestCardDb();
    cardDb.set(curielData.id, curielData);
    let state = createBattleReadyState(cardDb);
    const curiel = instance(curielData.id, 0, "opt740-curiel", "CHARACTER");
    const ownCharacter = state.players[0].characters[0]!;
    const opponentCharacter = state.players[1].characters[0]!;
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([curiel, ownCharacter]),
    };
    state = {
      ...state,
      players,
      activeEffects: [runtimeEffect(curiel, { type: "OPPONENT_LEADER" })],
    };

    expect(power(state.players[0].leader, state, cardDb)).toBe(5000);
    expect(power(state.players[1].leader, state, cardDb)).toBe(6000);
    expect(power(ownCharacter, state, cardDb)).toBe(4000);
    expect(power(opponentCharacter, state, cardDb)).toBe(4000);
  });

  it("applies OP13-004 LEADER_OR_CHARACTER only to its controller's field population", () => {
    const saboData = data("OP13-004", "Leader", 5000, OP13_004_SABO, null);
    const costEight = data("OPT740-COST-EIGHT", "Character", 8000, null, 8);
    const cardDb = createTestCardDb();
    cardDb.set(saboData.id, saboData);
    cardDb.set(costEight.id, costEight);
    let state = createBattleReadyState(cardDb);
    const sabo: CardInstance = {
      ...state.players[0].leader,
      cardId: saboData.id,
      attachedDon: [
        {
          instanceId: "opt740-sabo-don",
          state: "RESTED",
          attachedTo: state.players[0].leader.instanceId,
        },
      ],
    };
    const ownCharacter = instance(
      costEight.id,
      0,
      "opt740-cost-eight",
      "CHARACTER"
    );
    const opponentCharacter = state.players[1].characters[0]!;
    const ownStage = instance(CARDS.STAGE.id, 0, "opt740-stage", "STAGE");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      leader: sabo,
      life: players[0].life.slice(0, 3),
      characters: padChars([ownCharacter]),
      stage: ownStage,
    };
    state = { ...state, players };
    state = registerPermanentEffectsForCard(state, sabo, saboData);

    expect(power(sabo, state, cardDb)).toBe(7000);
    expect(power(ownCharacter, state, cardDb)).toBe(9000);
    expect(power(state.players[1].leader, state, cardDb)).toBe(5000);
    expect(power(opponentCharacter, state, cardDb)).toBe(4000);
    expect(power(ownStage, state, cardDb)).toBe(0);
  });

  it("applies an unknown permanent modifier target to nothing", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const unknownTarget = {
      type: "UNKNOWN_PERMANENT_TARGET",
    } as unknown as Target;
    const withUnknown = {
      ...state,
      activeEffects: [runtimeEffect(state.players[0].leader, unknownTarget)],
    };

    expect(power(withUnknown.players[0].leader, withUnknown, cardDb)).toBe(
      5000
    );
    expect(power(withUnknown.players[1].leader, withUnknown, cardDb)).toBe(
      5000
    );
    expect(
      power(withUnknown.players[0].characters[0]!, withUnknown, cardDb)
    ).toBe(4000);
  });
});
