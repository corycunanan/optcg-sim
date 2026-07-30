/**
 * OPT-600 — every permanent-modifier application path enforces:
 *
 * block.conditions AND block.duration AND modifier.duration.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  KeywordSet,
  PlayerState,
} from "../types.js";
import type {
  Duration,
  EffectSchema,
  Modifier,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import {
  getEffectiveCost,
  getEffectiveFieldCost,
  getEffectivePower,
  hasGrantedAttribute,
  hasGrantedKeyword,
  hasRemovedKeyword,
} from "../engine/modifiers.js";
import { injectSchemasIntoCardDb } from "../engine/schema-registry.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import {
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

const OWN_TURN: Duration = {
  type: "WHILE_CONDITION",
  condition: { type: "IS_MY_TURN", controller: "SELF" },
};
const OPPONENT_TURN: Duration = {
  type: "WHILE_CONDITION",
  condition: { type: "IS_MY_TURN", controller: "OPPONENT" },
};

function data(
  id: string,
  {
    effectSchema = null,
    types = [],
  }: {
    effectSchema?: EffectSchema | null;
    types?: string[];
  } = {}
): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Black"],
    cost: 4,
    power: 5000,
    counter: null,
    life: null,
    attribute: [],
    types,
    effectText: "",
    triggerText: null,
    keywords: NO_KEYWORDS,
    effectSchema,
    imageUrl: null,
  };
}

function card(
  cardId: string,
  controller: 0 | 1,
  instanceId: string,
  zone: CardInstance["zone"] = "CHARACTER"
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

type RegisteredPath =
  | "SET_POWER"
  | "MODIFY_POWER"
  | "SET_COST"
  | "MODIFY_COST"
  | "GRANT_KEYWORD"
  | "GRANT_ATTRIBUTE"
  | "REMOVE_KEYWORD";

function modifierFor(path: RegisteredPath, duration: Duration): Modifier {
  const common = {
    target: { type: "SELF" as const },
    duration,
  };
  switch (path) {
    case "SET_POWER":
      return { ...common, type: path, params: { value: 7000 } };
    case "MODIFY_POWER":
      return { ...common, type: path, params: { amount: 2000 } };
    case "SET_COST":
      return { ...common, type: path, params: { value: 8 } };
    case "MODIFY_COST":
      return { ...common, type: path, params: { amount: -2 } };
    case "GRANT_KEYWORD":
      return { ...common, type: path, params: { keyword: "RUSH" } };
    case "GRANT_ATTRIBUTE":
      return { ...common, type: path, params: { attribute: "SLASH" } };
    case "REMOVE_KEYWORD":
      return { ...common, type: path, params: { keyword: "BLOCKER" } };
  }
}

function registeredPathFixture(
  path: RegisteredPath,
  blockDuration: Duration,
  modifierDuration: Duration
): {
  state: GameState;
  cardDb: Map<string, CardData>;
  target: CardInstance;
  targetData: CardData;
} {
  const cardDb = createTestCardDb();
  const targetData = data("OPT600-PATH-TARGET");
  cardDb.set(targetData.id, targetData);
  let state = createBattleReadyState(cardDb);
  const target = card(targetData.id, 0, "opt600-path-target");
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([target]) };
  const effect: RuntimeActiveEffect = {
    id: `opt600-${path.toLowerCase()}`,
    sourceCardInstanceId: players[0].leader.instanceId,
    sourceEffectBlockId: `opt600-${path.toLowerCase()}-block`,
    category: "permanent",
    modifiers: [modifierFor(path, modifierDuration)],
    duration: blockDuration,
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller: 0,
    appliesTo: [target.instanceId],
    timestamp: 1,
  };
  state = {
    ...state,
    players,
    turn: { ...state.turn, activePlayerIndex: 0 },
    activeEffects: [effect],
  };
  return { state, cardDb, target, targetData };
}

function evaluateRegisteredPath(
  path: RegisteredPath,
  fixture: ReturnType<typeof registeredPathFixture>
): number | boolean {
  const { state, cardDb, target, targetData } = fixture;
  switch (path) {
    case "SET_POWER":
    case "MODIFY_POWER":
      return getEffectivePower(target, targetData, state, cardDb);
    case "SET_COST":
    case "MODIFY_COST":
      return getEffectiveFieldCost(
        targetData,
        state,
        target.instanceId,
        cardDb
      );
    case "GRANT_KEYWORD":
      return hasGrantedKeyword(target, "RUSH", state, cardDb);
    case "GRANT_ATTRIBUTE":
      return hasGrantedAttribute(target, "SLASH", state, cardDb);
    case "REMOVE_KEYWORD":
      return hasRemovedKeyword(target, "BLOCKER", state, cardDb);
  }
}

describe("OPT-600 — registered application-path gates", () => {
  const cases = [
    ["SET_POWER", 5000],
    ["MODIFY_POWER", 5000],
    ["SET_COST", 4],
    ["MODIFY_COST", 4],
    ["GRANT_KEYWORD", false],
    ["GRANT_ATTRIBUTE", false],
    ["REMOVE_KEYWORD", false],
  ] as const;

  it.each(cases)(
    "%s rejects false-block/true-modifier and true-block/false-modifier",
    (path, inactiveValue) => {
      const falseBlock = registeredPathFixture(path, OPPONENT_TURN, OWN_TURN);
      expect(evaluateRegisteredPath(path, falseBlock)).toBe(inactiveValue);

      const falseModifier = registeredPathFixture(
        path,
        OWN_TURN,
        OPPONENT_TURN
      );
      expect(evaluateRegisteredPath(path, falseModifier)).toBe(inactiveValue);
    }
  );
});

function handSelfFixture(
  blockDuration: Duration,
  modifierDuration: Duration
): {
  state: GameState;
  cardDb: Map<string, CardData>;
  handCard: CardInstance;
  handData: CardData;
} {
  const schema: EffectSchema = {
    card_id: "OPT600-HAND-SELF",
    effects: [
      {
        id: "opt600-hand-self-block",
        category: "permanent",
        zone: "HAND",
        duration: blockDuration,
        modifiers: [
          {
            type: "MODIFY_COST",
            target: { type: "SELF" },
            params: { amount: -2 },
            duration: modifierDuration,
          },
        ],
      },
    ],
  };
  const handData = data("OPT600-HAND-SELF", { effectSchema: schema });
  const cardDb = createTestCardDb();
  cardDb.set(handData.id, handData);
  let state = createBattleReadyState(cardDb);
  const handCard = card(handData.id, 0, "opt600-hand-self", "HAND");
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], hand: [handCard] };
  state = {
    ...state,
    players,
    turn: { ...state.turn, activePlayerIndex: 0 },
  };
  return { state, cardDb, handCard, handData };
}

function fieldToHandFixture(
  blockDuration: Duration,
  modifierDuration: Duration
): {
  state: GameState;
  cardDb: Map<string, CardData>;
  handCard: CardInstance;
  handData: CardData;
} {
  const sourceSchema: EffectSchema = {
    card_id: "OPT600-HAND-AURA",
    effects: [
      {
        id: "opt600-hand-aura-block",
        category: "permanent",
        duration: blockDuration,
        modifiers: [
          {
            type: "MODIFY_COST",
            target: { type: "CARD_IN_HAND", controller: "SELF" },
            params: { amount: -1 },
            duration: modifierDuration,
          },
        ],
      },
    ],
  };
  const sourceData = data("OPT600-HAND-AURA", {
    effectSchema: sourceSchema,
  });
  const handData = data("OPT600-HAND-AURA-TARGET");
  const cardDb = createTestCardDb();
  cardDb.set(sourceData.id, sourceData);
  cardDb.set(handData.id, handData);
  let state = createBattleReadyState(cardDb);
  const source = card(sourceData.id, 0, "opt600-hand-aura-source");
  const handCard = card(handData.id, 0, "opt600-hand-aura-target", "HAND");
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars([source]),
    hand: [handCard],
  };
  state = {
    ...state,
    players,
    turn: { ...state.turn, activePlayerIndex: 0 },
  };
  return { state, cardDb, handCard, handData };
}

describe("OPT-600 — raw-schema cost-path gates", () => {
  it.each([
    ["hand-zone self reduction", handSelfFixture],
    ["field-to-hand aura", fieldToHandFixture],
  ] as const)(
    "%s rejects false-block/true-modifier and true-block/false-modifier",
    (_name, buildFixture) => {
      const falseBlock = buildFixture(OPPONENT_TURN, OWN_TURN);
      expect(
        getEffectiveCost(
          falseBlock.handData,
          falseBlock.state,
          falseBlock.handCard.instanceId,
          falseBlock.cardDb
        )
      ).toBe(4);

      const falseModifier = buildFixture(OWN_TURN, OPPONENT_TURN);
      expect(
        getEffectiveCost(
          falseModifier.handData,
          falseModifier.state,
          falseModifier.handCard.instanceId,
          falseModifier.cardDb
        )
      ).toBe(4);
    }
  );
});

describe("OPT-600 — per-modifier targeting", () => {
  it("does not leak OP14-086's SELF power modifier through its sibling aura target", () => {
    const cardDb = createTestCardDb();
    const sourceSeed = data("OP14-086", { types: ["Baroque Works"] });
    const siblingData = data("OPT600-BAROQUE-SIBLING", {
      types: ["Baroque Works"],
    });
    cardDb.set(sourceSeed.id, sourceSeed);
    cardDb.set(siblingData.id, siblingData);
    injectSchemasIntoCardDb(cardDb);

    const sourceData = cardDb.get(sourceSeed.id)!;
    let state = createBattleReadyState(cardDb);
    const source = card(sourceData.id, 0, "opt600-doublefinger");
    const sibling = card(siblingData.id, 0, "opt600-baroque-sibling");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([source, sibling]),
      trash: Array.from({ length: 7 }, (_, index) => ({
        ...card(siblingData.id, 0, `opt600-trash-${index}`, "TRASH"),
      })),
    };
    state = {
      ...state,
      players,
      activeEffects: [],
    };
    state = registerPermanentEffectsForCard(state, source, sourceData);

    expect(getEffectivePower(source, sourceData, state, cardDb)).toBe(6000);
    expect(getEffectivePower(sibling, siblingData, state, cardDb)).toBe(5000);
    expect(
      getEffectiveFieldCost(siblingData, state, sibling.instanceId, cardDb)
    ).toBe(6);
  });
});
