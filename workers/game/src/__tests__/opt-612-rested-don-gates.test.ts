/**
 * OPT-612 — canonical "rested DON!!" gates count only rested DON!! cards in
 * the addressed controller's cost area.
 */

import { describe, expect, it } from "vitest";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { isProhibitedForCard } from "../engine/prohibitions.js";
import {
  getEffectSchema,
  validateEffectSchema,
} from "../engine/schema-registry.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import type {
  CardData,
  CardInstance,
  GameState,
  KeywordSet,
  PlayerState,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const NO_KEYWORDS: KeywordSet = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

function character(
  cardId: string,
  instanceId: string,
  state: "ACTIVE" | "RESTED" = "ACTIVE"
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state,
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

interface Scene {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
  sourceData: CardData;
}

function scene(
  cardId: "OP07-023" | "OP12-021",
  {
    restedNonDon = false,
    selfRestedDon = 0,
    opponentRestedDon = 0,
  }: {
    restedNonDon?: boolean;
    selfRestedDon?: number;
    opponentRestedDon?: number;
  } = {}
): Scene {
  const schema = getEffectSchema(cardId);
  if (!schema) throw new Error(`Missing authored schema for ${cardId}`);

  const cardDb = createTestCardDb();
  const sourceData: CardData = {
    id: cardId,
    name: cardId,
    type: "Character",
    color: ["Green"],
    cost: 4,
    power: 5000,
    counter: 1000,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: NO_KEYWORDS,
    effectSchema: schema,
    imageUrl: null,
  };
  cardDb.set(cardId, sourceData);
  cardDb.set(CARDS.LEADER.id, {
    ...CARDS.LEADER,
    attribute: ["Slash"],
  });

  const source = character(
    cardId,
    `source-${cardId}`,
    restedNonDon ? "RESTED" : "ACTIVE"
  );
  const characters = restedNonDon
    ? [
        source,
        ...Array.from({ length: 4 }, (_, index) =>
          character(
            CARDS.VANILLA.id,
            `rested-character-${cardId}-${index}`,
            "RESTED"
          )
        ),
      ]
    : [source];

  let state = createBattleReadyState(cardDb);
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    leader: {
      ...players[0].leader,
      state: restedNonDon ? "RESTED" : "ACTIVE",
    },
    characters: padChars(characters),
    donCostArea: players[0].donCostArea.slice(0, 6).map((don, index) => ({
      ...don,
      state: index < selfRestedDon ? "RESTED" : "ACTIVE",
    })),
  };
  players[1] = {
    ...players[1],
    donCostArea: players[1].donCostArea.map((don, index) => ({
      ...don,
      state: index < opponentRestedDon ? "RESTED" : "ACTIVE",
    })),
  };
  state = {
    ...state,
    players,
    activeEffects: [],
    prohibitions: [],
  };
  state = registerPermanentEffectsForCard(state, source, sourceData);

  return { state, cardDb, source, sourceData };
}

function authoredSchema(cardId: string): EffectSchema {
  const schema = getEffectSchema(cardId);
  expect(schema).toBeDefined();
  return schema!;
}

describe("OPT-612 — rested DON!! gate vocabulary", () => {
  it("authors both cards with a RESTED state filter on DON_FIELD_COUNT", () => {
    expect(authoredSchema("OP07-023").effects[0]!.conditions).toEqual({
      type: "DON_FIELD_COUNT",
      controller: "SELF",
      state: "RESTED",
      operator: ">=",
      value: 6,
    });
    expect(authoredSchema("OP12-021").effects[1]!.conditions).toEqual({
      all_of: [
        {
          type: "LEADER_PROPERTY",
          controller: "SELF",
          property: { attribute: "SLASH" },
        },
        {
          type: "DON_FIELD_COUNT",
          controller: "SELF",
          state: "RESTED",
          operator: ">=",
          value: 6,
        },
      ],
    });
  });

  it("rejects invalid DON_FIELD_COUNT state filters at schema registration", () => {
    const invalid = structuredClone(authoredSchema("OP07-023")) as {
      effects: Array<{ conditions?: { state?: string } }>;
    };
    invalid.effects[0]!.conditions!.state = "EXHAUSTED";

    expect(validateEffectSchema(invalid, "TEST-612")).toContain(
      "[TEST-612] effects[0].conditions.state: Invalid DON_FIELD_COUNT state 'EXHAUSTED'; use ACTIVE or RESTED"
    );
  });
});

describe("OPT-612 — OP07-023 Caribou", () => {
  function power(value: Scene): number {
    return getEffectivePower(
      value.source,
      value.sourceData,
      value.state,
      value.cardDb
    );
  }

  it("ignores a rested Leader plus five rested Characters with zero rested DON!!", () => {
    expect(power(scene("OP07-023", { restedNonDon: true }))).toBe(5000);
  });

  it("gains +1000 power with six rested DON!! in its controller's cost area", () => {
    expect(power(scene("OP07-023", { selfRestedDon: 6 }))).toBe(6000);
  });

  it("ignores active DON!! and rested DON!! controlled by the opponent", () => {
    expect(power(scene("OP07-023"))).toBe(5000);
    expect(power(scene("OP07-023", { opponentRestedDon: 6 }))).toBe(5000);
  });
});

describe("OPT-612 — OP12-021 Ipponmatsu", () => {
  function cannotBeRested(value: Scene): boolean {
    return isProhibitedForCard(
      value.state,
      value.source.instanceId,
      "CANNOT_BE_RESTED",
      value.cardDb
    );
  }

  it("is not protected by a rested Leader plus five rested Characters with zero rested DON!!", () => {
    expect(cannotBeRested(scene("OP12-021", { restedNonDon: true }))).toBe(
      false
    );
  });

  it("is protected with a Slash Leader and six rested DON!! in its controller's cost area", () => {
    expect(cannotBeRested(scene("OP12-021", { selfRestedDon: 6 }))).toBe(true);
  });
});
