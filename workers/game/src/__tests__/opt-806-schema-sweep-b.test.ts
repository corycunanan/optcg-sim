import { describe, expect, it } from "vitest";
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import {
  OP04_011_NAMI,
  OP04_094_TRUENO_BASTARDO,
} from "../engine/schemas/op04.js";
import { ST05_017_UNION_ARMADA } from "../engine/schemas/st05.js";
import { ST06_004_SMOKER } from "../engine/schemas/st06.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function withPlayer(
  state: GameState,
  playerIndex: 0 | 1,
  patch: Partial<PlayerState>,
): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[playerIndex] = { ...players[playerIndex], ...patch };
  return { ...state, players };
}

function cardData(
  schema: EffectSchema,
  type: CardData["type"],
  overrides: Partial<CardData> = {},
): CardData {
  return {
    ...CARDS.VANILLA,
    id: schema.card_id!,
    name: schema.card_name!,
    type,
    cost: type === "Leader" ? null : 1,
    power: type === "Event" ? null : 5000,
    effectSchema: schema,
    ...overrides,
  };
}

function character(
  cardId: string,
  instanceId: string,
  controller: 0 | 1,
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

function block(schema: EffectSchema, effectId: string): EffectBlock {
  const found = schema.effects.find((effect) => effect.id === effectId);
  if (!found) throw new Error(`Missing ${schema.card_id} effect ${effectId}`);
  return found;
}

describe("OPT-806 schema sweep B", () => {
  it("OP04-011 gates its power boost on the revealed card", () => {
    const cardDb = createTestCardDb();
    const namiData = cardData(OP04_011_NAMI, "Character");
    const largeCharacterData: CardData = {
      ...CARDS.VANILLA,
      id: "LARGE-CHARACTER",
      power: 7000,
    };
    const revealedEventData: CardData = {
      ...CARDS.EVENT_COUNTER,
      id: "REVEALED-EVENT",
      power: 6000,
    };
    cardDb.set(namiData.id, namiData);
    cardDb.set(largeCharacterData.id, largeCharacterData);
    cardDb.set(revealedEventData.id, revealedEventData);

    let state = createBattleReadyState(cardDb);
    const nami = character(namiData.id, "nami", 0);
    const largeCharacter = character(largeCharacterData.id, "large-character", 0);
    const revealedEvent: CardInstance = {
      ...state.players[0].deck[0],
      instanceId: "revealed-event",
      cardId: revealedEventData.id,
      zone: "DECK",
      controller: 0,
      owner: 0,
    };
    state = withPlayer(state, 0, {
      characters: padChars([nami, largeCharacter]),
      deck: [
        revealedEvent,
        ...state.players[0].deck.filter(
          (entry) => entry.instanceId !== revealedEvent.instanceId,
        ),
      ],
    });

    const result = resolveEffect(
      state,
      block(OP04_011_NAMI, "when_attacking_reveal_boost"),
      nami.instanceId,
      0,
      cardDb,
    );

    expect(getEffectivePower(nami, namiData, result.state, cardDb)).toBe(5000);
    expect(result.state.players[0].deck.at(-1)?.instanceId).toBe(
      revealedEvent.instanceId,
    );
  });

  it("OP04-094 offers a cost-6 target only with at least 15 trash cards", () => {
    const cardDb = createTestCardDb();
    const eventData = cardData(OP04_094_TRUENO_BASTARDO, "Event");
    const costSixData: CardData = {
      ...CARDS.VANILLA,
      id: "COST-SIX-TARGET",
      cost: 6,
    };
    cardDb.set(eventData.id, eventData);
    cardDb.set(costSixData.id, costSixData);

    let state = createBattleReadyState(cardDb);
    const source: CardInstance = {
      instanceId: "trueno-bastardo",
      cardId: eventData.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const costSix = character(costSixData.id, "cost-six", 1);
    const trash = state.players[0].deck.slice(0, 15).map((entry) => ({
      ...entry,
      zone: "TRASH" as const,
    }));
    state = withPlayer(state, 0, {
      hand: [...state.players[0].hand, source],
      trash,
      deck: state.players[0].deck.slice(15),
    });
    state = withPlayer(state, 1, { characters: padChars([costSix]) });

    const offered = resolveEffect(
      state,
      block(OP04_094_TRUENO_BASTARDO, "main_conditional_ko"),
      source.instanceId,
      0,
      cardDb,
    );

    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    if (offered.pendingPrompt?.options.promptType !== "SELECT_TARGET") {
      throw new Error("Expected a target prompt");
    }
    expect(offered.pendingPrompt.options.validTargets).toContain(
      costSix.instanceId,
    );
  });

  it("ST05-017 protects the selected Character, not the Event source", () => {
    const cardDb = createTestCardDb();
    const unionData = cardData(ST05_017_UNION_ARMADA, "Event");
    const filmData: CardData = {
      ...CARDS.VANILLA,
      id: "FILM-CHARACTER",
      types: ["FILM"],
    };
    cardDb.set(unionData.id, unionData);
    cardDb.set(filmData.id, filmData);

    let state = createBattleReadyState(cardDb);
    const source: CardInstance = {
      instanceId: "union-armada",
      cardId: unionData.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const filmCharacter = character(filmData.id, "film-character", 0);
    state = withPlayer(state, 0, {
      hand: [...state.players[0].hand, source],
      characters: padChars([filmCharacter]),
    });

    const offered = resolveEffect(
      state,
      block(ST05_017_UNION_ARMADA, "counter_power_and_protection"),
      source.instanceId,
      0,
      cardDb,
    );
    expect(offered.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    const resolved = resumeFromStack(
      offered.state,
      {
        type: "SELECT_TARGET",
        selectedInstanceIds: [filmCharacter.instanceId],
      },
      cardDb,
    );

    expect(resolved.state.prohibitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prohibitionType: "CANNOT_BE_KO",
          appliesTo: [filmCharacter.instanceId],
        }),
      ]),
    );
  });

  it("ST06-004 prevents K.O. by its controller's effects", () => {
    const cardDb = createTestCardDb();
    const smokerData = cardData(ST06_004_SMOKER, "Character");
    cardDb.set(smokerData.id, smokerData);

    let state = createBattleReadyState(cardDb);
    const smoker = character(smokerData.id, "smoker", 0);
    state = withPlayer(state, 0, { characters: padChars([smoker]) });
    state = registerPermanentEffectsForCard(state, smoker, smokerData);

    const result = executeActionChain(
      state,
      [{ type: "KO", target: { type: "SELF" } }],
      smoker.instanceId,
      0,
      cardDb,
    );

    expect(
      result.state.players[0].characters.some(
        (card) => card?.instanceId === smoker.instanceId,
      ),
    ).toBe(true);
    expect(
      result.state.players[0].trash.some(
        (card) => card.instanceId === smoker.instanceId,
      ),
    ).toBe(false);
  });
});
