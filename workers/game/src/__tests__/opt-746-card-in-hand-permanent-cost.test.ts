/**
 * OPT-746 — registered CARD_IN_HAND permanent cost modifiers apply once.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, PlayerState } from "../types.js";
import { getEffectiveCost } from "../engine/modifiers.js";
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

describe("OPT-746 — CARD_IN_HAND permanent cost modifiers", () => {
  it("applies OP01-067 Crocodile's registered discount exactly once", () => {
    const crocodileSchema = getEffectSchema("OP01-067");
    expect(crocodileSchema).not.toBeNull();

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

    expect(
      getEffectiveCost(blueEventData, state, blueEvent.instanceId, cardDb)
    ).toBe(3);
  });
});
