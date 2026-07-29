/**
 * OPT-600 — permanent modifier durations are additional inline gates.
 *
 * Card regressions load authored schemas through the production registry
 * injection boundary before registering their permanent effects.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  DonInstance,
  GameState,
  KeywordSet,
  PlayerState,
} from "../types.js";
import type {
  EffectSchema,
  RuntimeActiveEffect,
} from "../engine/effect-types.js";
import {
  getEffectivePower,
  hasGrantedKeyword,
  isModifierConditionMet,
} from "../engine/modifiers.js";
import {
  getAllAuthoredSchemas,
  injectSchemasIntoCardDb,
} from "../engine/schema-registry.js";
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

function cardData(
  id: string,
  type: "Character" | "Leader" = "Character",
  types: string[] = []
): CardData {
  return {
    id,
    name: id,
    type,
    color: ["Red"],
    cost: type === "Leader" ? null : 4,
    power: 5000,
    counter: null,
    life: type === "Leader" ? 5 : null,
    attribute: [],
    types,
    effectText: "",
    triggerText: null,
    keywords: NO_KEYWORDS,
    effectSchema: null,
    imageUrl: null,
  };
}

function attachedDon(instanceId: string, attachedTo: string): DonInstance {
  return { instanceId, state: "ACTIVE", attachedTo };
}

function character(
  cardId: string,
  controller: 0 | 1,
  instanceId: string,
  attachedDonCount = 0,
  state: "ACTIVE" | "RESTED" = "ACTIVE"
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state,
    attachedDon: Array.from({ length: attachedDonCount }, (_, index) =>
      attachedDon(`${instanceId}-don-${index}`, instanceId)
    ),
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

interface RegisteredFixture {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
  sourceData: CardData;
  target: CardInstance;
  targetData: CardData;
}

function registeredFixture({
  cardId,
  sourceType = "Character",
  attachedDonCount,
  activePlayerIndex,
  sourceState = "ACTIVE",
  ownSupportTypes = [],
}: {
  cardId: string;
  sourceType?: "Character" | "Leader";
  attachedDonCount: number;
  activePlayerIndex: 0 | 1;
  sourceState?: "ACTIVE" | "RESTED";
  ownSupportTypes?: string[];
}): RegisteredFixture {
  const targetData = cardData("OPT600-TARGET");
  const supportData = cardData("OPT600-SUPPORT", "Character", ownSupportTypes);
  const cardDb = createTestCardDb();
  cardDb.set(cardId, cardData(cardId, sourceType));
  cardDb.set(targetData.id, targetData);
  cardDb.set(supportData.id, supportData);
  injectSchemasIntoCardDb(cardDb);

  const sourceData = cardDb.get(cardId)!;
  let state = createBattleReadyState(cardDb);
  const target = character(targetData.id, 1, "opt600-target");
  const support = character(supportData.id, 0, "opt600-support");
  const players = [...state.players] as [PlayerState, PlayerState];
  let source: CardInstance;

  if (sourceType === "Leader") {
    source = {
      ...players[0].leader,
      instanceId: "opt600-source",
      cardId,
      state: sourceState,
      attachedDon: Array.from({ length: attachedDonCount }, (_, index) =>
        attachedDon(`opt600-source-don-${index}`, "opt600-source")
      ),
    };
    players[0] = {
      ...players[0],
      leader: source,
      characters: padChars([support]),
    };
  } else {
    source = character(
      cardId,
      0,
      "opt600-source",
      attachedDonCount,
      sourceState
    );
    players[0] = {
      ...players[0],
      characters: padChars([source, support]),
    };
  }
  players[1] = { ...players[1], characters: padChars([target]) };
  state = {
    ...state,
    players,
    turn: { ...state.turn, activePlayerIndex },
  };

  return {
    state: registerPermanentEffectsForCard(state, source, sourceData),
    cardDb,
    source,
    sourceData,
    target,
    targetData,
  };
}

function registeredEffect(fixture: RegisteredFixture): RuntimeActiveEffect {
  const effect = fixture.state.activeEffects.find(
    (candidate) => candidate.sourceCardInstanceId === fixture.source.instanceId
  );
  if (!effect) throw new Error("Expected a registered permanent effect");
  return effect;
}

describe("OPT-600 — modifier duration contract", () => {
  it("ANDs block conditions with modifier duration instead of replacing them", () => {
    const cardDb = createTestCardDb();
    const target = character("OPT600-TARGET", 0, "narrowing-target");
    const targetData = cardData("OPT600-TARGET");
    cardDb.set(targetData.id, targetData);
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([target]) };
    const effect: RuntimeActiveEffect = {
      id: "opt600-narrowing",
      sourceCardInstanceId: players[0].leader.instanceId,
      sourceEffectBlockId: "opt600-narrowing-block",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "IS_MY_TURN", controller: "SELF" },
          },
        },
      ],
      conditions: {
        type: "LIFE_COUNT",
        controller: "SELF",
        operator: "<=",
        value: 0,
      },
      duration: { type: "PERMANENT" },
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

    expect(
      isModifierConditionMet(effect, effect.modifiers[0], state, cardDb)
    ).toBe(false);
    expect(getEffectivePower(target, targetData, state, cardDb)).toBe(5000);
  });

  it("evaluates different durations independently inside one effect", () => {
    const cardDb = createTestCardDb();
    const targetData = cardData("OPT600-TARGET");
    cardDb.set(targetData.id, targetData);
    const target = character(targetData.id, 0, "mixed-duration-target");
    let state = createBattleReadyState(cardDb);
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], characters: padChars([target]) };
    const effect: RuntimeActiveEffect = {
      id: "opt600-mixed",
      sourceCardInstanceId: players[0].leader.instanceId,
      sourceEffectBlockId: "opt600-mixed-block",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 1000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "IS_MY_TURN", controller: "SELF" },
          },
        },
        {
          type: "MODIFY_POWER",
          target: { type: "SELF" },
          params: { amount: 2000 },
          duration: {
            type: "WHILE_CONDITION",
            condition: { type: "IS_MY_TURN", controller: "OPPONENT" },
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [target.instanceId],
      timestamp: 1,
    };
    state = { ...state, players, activeEffects: [effect] };

    expect(
      getEffectivePower(
        target,
        targetData,
        {
          ...state,
          turn: { ...state.turn, activePlayerIndex: 0 },
        },
        cardDb
      )
    ).toBe(6000);
    expect(
      getEffectivePower(
        target,
        targetData,
        {
          ...state,
          turn: { ...state.turn, activePlayerIndex: 1 },
        },
        cardDb
      )
    ).toBe(7000);
  });
});

describe("OPT-600 — registry sweep compatibility", () => {
  it("keeps all seven duplicate-duration schemas behaviorally gated", () => {
    const ids = [
      "OP01-068",
      "OP01-091",
      "OP02-024",
      "OP02-031",
      "OP02-050",
      "OP02-095",
      "OP03-045",
    ];
    const schemas = getAllAuthoredSchemas();

    for (const id of ids) {
      const block = schemas[id].effects.find((effect) =>
        effect.modifiers?.some((modifier) => modifier.duration)
      );
      const modifier = block?.modifiers?.find(
        (candidate) => candidate.duration
      );
      expect(JSON.stringify(modifier?.duration), id).toBe(
        JSON.stringify(block?.duration)
      );
    }

    const inactive = registeredFixture({
      cardId: "OP01-091",
      sourceType: "Leader",
      attachedDonCount: 0,
      activePlayerIndex: 1,
    });
    expect(
      getEffectivePower(
        inactive.target,
        inactive.targetData,
        inactive.state,
        inactive.cardDb
      )
    ).toBe(5000);

    const active = registeredFixture({
      cardId: "OP01-091",
      sourceType: "Leader",
      attachedDonCount: 0,
      activePlayerIndex: 0,
    });
    const activePlayers = [...active.state.players] as [
      PlayerState,
      PlayerState,
    ];
    activePlayers[0] = {
      ...activePlayers[0],
      donCostArea: Array.from({ length: 10 }, (_, index) => ({
        instanceId: `op01-091-don-${index}`,
        state: "ACTIVE" as const,
        attachedTo: null,
      })),
    };
    expect(
      getEffectivePower(
        active.target,
        active.targetData,
        { ...active.state, players: activePlayers },
        active.cardDb
      )
    ).toBe(4000);
  });

  it("retains the 15 triaged modifier-duration sites after hoisting OP15-001", () => {
    const sites = Object.entries(getAllAuthoredSchemas()).flatMap(
      ([cardId, schema]) =>
        schema.effects.flatMap((block) =>
          (block.modifiers ?? [])
            .filter((modifier) => modifier.duration)
            .map((modifier) => ({ cardId, block, modifier }))
        )
    );

    expect(sites).toHaveLength(15);
    expect(sites.every(({ block }) => block.category === "permanent")).toBe(
      true
    );
    expect(
      sites.every(
        ({ modifier }) => modifier.duration?.type === "WHILE_CONDITION"
      )
    ).toBe(true);
    expect(sites.some(({ cardId }) => cardId === "OP15-001")).toBe(false);
  });
});

describe("OPT-600 — decision cards", () => {
  it.each([
    ["OP03-004", "RUSH"],
    ["OP03-025", "DOUBLE_ATTACK"],
  ])("%s requires DON!! attached to itself for %s", (cardId, keyword) => {
    const inactive = registeredFixture({
      cardId,
      attachedDonCount: 0,
      activePlayerIndex: 0,
    });
    expect(
      hasGrantedKeyword(
        inactive.source,
        keyword,
        inactive.state,
        inactive.cardDb
      )
    ).toBe(false);

    const active = registeredFixture({
      cardId,
      attachedDonCount: 1,
      activePlayerIndex: 0,
    });
    expect(
      hasGrantedKeyword(active.source, keyword, active.state, active.cardDb)
    ).toBe(true);
  });

  it("OP06-085 requires attached DON!! and its controller's turn, but not ACTIVE state", () => {
    const noDon = registeredFixture({
      cardId: "OP06-085",
      attachedDonCount: 0,
      activePlayerIndex: 0,
    });
    const noDonEffect = registeredEffect(noDon);
    expect(
      isModifierConditionMet(
        noDonEffect,
        noDonEffect.modifiers[0],
        noDon.state,
        noDon.cardDb
      )
    ).toBe(false);

    const restedOwnTurn = registeredFixture({
      cardId: "OP06-085",
      attachedDonCount: 2,
      activePlayerIndex: 0,
      sourceState: "RESTED",
    });
    const ownTurnEffect = registeredEffect(restedOwnTurn);
    expect(
      isModifierConditionMet(
        ownTurnEffect,
        ownTurnEffect.modifiers[0],
        restedOwnTurn.state,
        restedOwnTurn.cardDb
      )
    ).toBe(true);

    const opponentTurn = registeredFixture({
      cardId: "OP06-085",
      attachedDonCount: 2,
      activePlayerIndex: 1,
    });
    const opponentTurnEffect = registeredEffect(opponentTurn);
    expect(
      isModifierConditionMet(
        opponentTurnEffect,
        opponentTurnEffect.modifiers[0],
        opponentTurn.state,
        opponentTurn.cardDb
      )
    ).toBe(false);
  });

  it.each([
    { activePlayerIndex: 0 as const, attachedDonCount: 0, expected: 5000 },
    { activePlayerIndex: 0 as const, attachedDonCount: 1, expected: 5000 },
    { activePlayerIndex: 1 as const, attachedDonCount: 0, expected: 5000 },
    { activePlayerIndex: 1 as const, attachedDonCount: 1, expected: 3000 },
  ])(
    "OP15-001: turn=$activePlayerIndex DON=$attachedDonCount => $expected",
    ({ activePlayerIndex, attachedDonCount, expected }) => {
      const fixture = registeredFixture({
        cardId: "OP15-001",
        sourceType: "Leader",
        attachedDonCount,
        activePlayerIndex,
        ownSupportTypes: ["East Blue"],
      });

      expect(
        getEffectivePower(
          fixture.target,
          fixture.targetData,
          fixture.state,
          fixture.cardDb
        )
      ).toBe(expected);
    }
  );
});
