/**
 * OPT-746 — registered CARD_IN_HAND permanent cost modifiers apply once.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  PlayerState,
} from "../types.js";
import {
  getEffectiveCost,
  getEffectiveCostForRead,
} from "../engine/modifiers.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

function card(
  cardId: string,
  instanceId: string,
  zone: CardInstance["zone"]
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: zone === "HAND" ? null : 1,
    controller: 0,
    owner: 0,
  };
}

function crocodileFixture(): {
  state: GameState;
  blueEvent: CardInstance;
  blueEventData: CardData;
  cardDb: Map<string, CardData>;
} {
  const crocodileSchema = getEffectSchema("OP01-067");
  if (!crocodileSchema) throw new Error("Missing OP01-067 schema");

  const crocodileData: CardData = {
    ...CARDS.VANILLA,
    id: "OP01-067",
    name: "Crocodile",
    color: ["Blue"],
    cost: 7,
    power: 5000,
    effectSchema: crocodileSchema,
  };
  const blueEventData: CardData = {
    ...CARDS.EVENT_COUNTER,
    id: "OPT746-BLUE-EVENT",
    name: "OPT746 Blue Event",
    color: ["Blue"],
    cost: 4,
  };
  const cardDb = createTestCardDb();
  cardDb.set(crocodileData.id, crocodileData);
  cardDb.set(blueEventData.id, blueEventData);

  let state = createBattleReadyState(cardDb);
  const crocodile = {
    ...card(crocodileData.id, "opt746-crocodile", "CHARACTER"),
    attachedDon: [
      {
        instanceId: "opt746-crocodile-don",
        state: "ACTIVE" as const,
        attachedTo: "opt746-crocodile",
      },
    ],
  };
  const blueEvent = card(blueEventData.id, "opt746-blue-event", "HAND");
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars([crocodile]),
    hand: [blueEvent],
  };
  state = { ...state, players };
  state = registerPermanentEffectsForCard(state, crocodile, crocodileData);

  return { state, blueEvent, blueEventData, cardDb };
}

describe("OPT-746 — CARD_IN_HAND permanent cost modifiers", () => {
  it("applies OP01-067 Crocodile's registered discount exactly once", () => {
    const { state, blueEvent, blueEventData, cardDb } = crocodileFixture();

    expect(
      getEffectiveCost(blueEventData, state, blueEvent.instanceId, cardDb)
    ).toBe(3);
  });

  it("does not apply CARD_IN_HAND to the same card after it leaves hand", () => {
    const { state, blueEvent, blueEventData, cardDb } = crocodileFixture();
    const trashedEvent: CardInstance = { ...blueEvent, zone: "TRASH" };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      hand: players[0].hand.filter(
        (candidate) => candidate.instanceId !== blueEvent.instanceId
      ),
      trash: [...players[0].trash, trashedEvent],
    };
    const trashedState = { ...state, players };

    expect(
      getEffectiveCost(
        blueEventData,
        trashedState,
        trashedEvent.instanceId,
        cardDb
      )
    ).toBe(4);
    expect(
      getEffectiveCostForRead(trashedEvent, blueEventData, trashedState, cardDb)
    ).toBe(4);
  });

  it("does not apply CHARACTER_CARD after a card leaves its source zone", () => {
    const maryGeoiseSchema = getEffectSchema("OP05-097");
    if (!maryGeoiseSchema) throw new Error("Missing OP05-097 schema");

    const maryGeoiseData: CardData = {
      ...CARDS.STAGE,
      id: "OP05-097",
      name: "Mary Geoise",
      cost: 1,
      effectSchema: maryGeoiseSchema,
    };
    const celestialDragonData: CardData = {
      ...CARDS.VANILLA,
      id: "OPT746-CELESTIAL-DRAGON",
      name: "OPT746 Celestial Dragon",
      cost: 2,
      types: ["Celestial Dragons"],
    };
    const cardDb = createTestCardDb();
    cardDb.set(maryGeoiseData.id, maryGeoiseData);
    cardDb.set(celestialDragonData.id, celestialDragonData);

    let state = createBattleReadyState(cardDb);
    const maryGeoise = card(maryGeoiseData.id, "opt746-mary-geoise", "STAGE");
    const celestialDragon = card(
      celestialDragonData.id,
      "opt746-celestial-dragon",
      "HAND"
    );
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      stage: maryGeoise,
      hand: [celestialDragon],
    };
    state = { ...state, players };
    state = registerPermanentEffectsForCard(state, maryGeoise, maryGeoiseData);
    expect(
      getEffectiveCost(
        celestialDragonData,
        state,
        celestialDragon.instanceId,
        cardDb
      )
    ).toBe(1);

    const trashedDragon: CardInstance = {
      ...celestialDragon,
      zone: "TRASH",
    };
    const trashedPlayers = [...state.players] as [PlayerState, PlayerState];
    trashedPlayers[0] = {
      ...trashedPlayers[0],
      hand: [],
      trash: [...trashedPlayers[0].trash, trashedDragon],
    };
    const trashedState = { ...state, players: trashedPlayers };

    expect(
      getEffectiveCost(
        celestialDragonData,
        trashedState,
        trashedDragon.instanceId,
        cardDb
      )
    ).toBe(2);
    expect(
      getEffectiveCostForRead(
        trashedDragon,
        celestialDragonData,
        trashedState,
        cardDb
      )
    ).toBe(2);
  });
});
