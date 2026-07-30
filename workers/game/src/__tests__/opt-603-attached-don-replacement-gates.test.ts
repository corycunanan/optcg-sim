/**
 * OPT-603 — replacement conditions survive registration and every printed
 * [DON!! xN] gate reads DON!! attached to that specific source card.
 */

import { describe, expect, it } from "vitest";
import type {
  CardData,
  CardInstance,
  DonInstance,
  GameState,
  PlayerState,
} from "../types.js";
import {
  getEffectivePower,
  isEffectConditionMet,
} from "../engine/modifiers.js";
import {
  checkReplacementForKO,
  checkReplacementForRemoval,
} from "../engine/replacements.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { injectSchemasIntoCardDb } from "../engine/schema-registry.js";
import {
  registerPermanentEffectsForCard,
  registerReplacementsForCard,
} from "../engine/triggers.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

const SOURCE_INSTANCE_ID = "opt603-source";
const OTHER_INSTANCE_ID = "opt603-other";
const TARGET_INSTANCE_ID = "opt603-target";

function data(
  id: string,
  type: "Character" | "Leader" = "Character",
  power = 5000
): CardData {
  return {
    ...(type === "Leader" ? CARDS.LEADER : CARDS.VANILLA),
    id,
    name: id,
    type,
    cost: type === "Leader" ? null : 4,
    power,
    life: type === "Leader" ? 5 : null,
    types: [],
    effectSchema: null,
  };
}

function attachedDon(instanceId: string, attachedTo: string): DonInstance {
  return {
    instanceId,
    state: "ACTIVE",
    attachedTo,
  };
}

function character(
  cardId: string,
  instanceId: string,
  attachedDonCount = 0
): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: Array.from({ length: attachedDonCount }, (_, index) =>
      attachedDon(`${instanceId}-don-${index}`, instanceId)
    ),
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
}

interface ReplacementFixture {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
  target: CardInstance;
}

function replacementFixture({
  cardId,
  sourceType = "Character",
  sourceDonCount = 0,
  leaderTypes = [],
  includeLuffy = false,
}: {
  cardId: string;
  sourceType?: "Character" | "Leader";
  sourceDonCount?: number;
  leaderTypes?: string[];
  includeLuffy?: boolean;
}): ReplacementFixture {
  const cardDb = createTestCardDb();
  const sourceSeed = data(cardId, sourceType);
  const otherData = data("OPT603-OTHER");
  const targetData = data("OPT603-TARGET", "Character", 6000);
  const luffyData = data("OPT603-LUFFY");
  cardDb.set(sourceSeed.id, sourceSeed);
  cardDb.set(otherData.id, otherData);
  cardDb.set(targetData.id, targetData);
  cardDb.set(luffyData.id, {
    ...luffyData,
    name: "Monkey.D.Luffy",
  });
  cardDb.set(CARDS.LEADER.id, {
    ...CARDS.LEADER,
    types: leaderTypes,
  });
  injectSchemasIntoCardDb(cardDb);

  const sourceData = cardDb.get(cardId)!;
  let state = createBattleReadyState(cardDb);
  const other = character(otherData.id, OTHER_INSTANCE_ID, 1);
  const target = character(targetData.id, TARGET_INSTANCE_ID);
  const luffy = character(luffyData.id, "opt603-luffy");
  const handCard: CardInstance = {
    ...character(otherData.id, "opt603-hand"),
    zone: "HAND",
    turnPlayed: null,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  let source: CardInstance;

  if (sourceType === "Leader") {
    source = {
      ...players[0].leader,
      instanceId: SOURCE_INSTANCE_ID,
      cardId,
      attachedDon: Array.from({ length: sourceDonCount }, (_, index) =>
        attachedDon(`opt603-source-don-${index}`, SOURCE_INSTANCE_ID)
      ),
    };
    players[0] = {
      ...players[0],
      leader: source,
      characters: padChars([other, target, ...(includeLuffy ? [luffy] : [])]),
      hand: [handCard],
    };
  } else {
    source = character(cardId, SOURCE_INSTANCE_ID, sourceDonCount);
    players[0] = {
      ...players[0],
      characters: padChars([
        source,
        other,
        target,
        ...(includeLuffy ? [luffy] : []),
      ]),
      hand: [handCard],
    };
  }
  state = {
    ...state,
    players,
    turn: {
      ...state.turn,
      activePlayerIndex: 1,
    },
  };

  return {
    state: registerReplacementsForCard(state, source, sourceData),
    cardDb,
    source,
    target,
  };
}

function expectRemovalReplacement(
  fixture: ReplacementFixture,
  active: boolean
): void {
  const result = checkReplacementForRemoval(
    fixture.state,
    fixture.source.instanceId,
    1,
    fixture.cardDb,
    resolverExecutionServices
  );
  expect(result.replaced).toBe(false);
  expect(result.pendingPrompt !== undefined).toBe(active);
}

describe("OPT-603 — authored replacement conditions", () => {
  it("OP05-001 ignores DON!! in the cost area or on another card and activates with DON!! on Sabo", () => {
    const negative = replacementFixture({
      cardId: "OP05-001",
      sourceType: "Leader",
      sourceDonCount: 0,
    });
    const negativeResult = checkReplacementForKO(
      negative.state,
      negative.target.instanceId,
      "effect",
      1,
      negative.cardDb,
      resolverExecutionServices
    );
    expect(negative.state.players[0].donCostArea.length).toBeGreaterThan(0);
    expect(
      negative.state.players[0].characters
        .filter((card): card is CardInstance => card !== null)
        .find((card) => card.instanceId === OTHER_INSTANCE_ID)?.attachedDon
    ).toHaveLength(1);
    expect(negativeResult.pendingPrompt).toBeUndefined();

    const positive = replacementFixture({
      cardId: "OP05-001",
      sourceType: "Leader",
      sourceDonCount: 1,
    });
    const positiveResult = checkReplacementForKO(
      positive.state,
      positive.target.instanceId,
      "effect",
      1,
      positive.cardDb,
      resolverExecutionServices
    );
    expect(positiveResult.pendingPrompt?.options.promptType).toBe(
      "OPTIONAL_EFFECT"
    );
  });

  it("EB04-044 requires a Navy Leader before offering its removal replacement", () => {
    expectRemovalReplacement(
      replacementFixture({
        cardId: "EB04-044",
        leaderTypes: ["Straw Hat Crew"],
      }),
      false
    );
    expectRemovalReplacement(
      replacementFixture({
        cardId: "EB04-044",
        leaderTypes: ["Navy"],
      }),
      true
    );
  });

  it("OP05-100 is negated while a Monkey.D.Luffy Character is on either field", () => {
    expectRemovalReplacement(
      replacementFixture({
        cardId: "OP05-100",
        includeLuffy: true,
      }),
      false
    );
    expectRemovalReplacement(
      replacementFixture({
        cardId: "OP05-100",
        includeLuffy: false,
      }),
      true
    );
  });

  it("OP07-042 requires a Seven Warlords Leader before offering its removal replacement", () => {
    expectRemovalReplacement(
      replacementFixture({
        cardId: "OP07-042",
        leaderTypes: ["Navy"],
      }),
      false
    );
    expectRemovalReplacement(
      replacementFixture({
        cardId: "OP07-042",
        leaderTypes: ["The Seven Warlords of the Sea"],
      }),
      true
    );
  });
});

interface PermanentFixture {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
  sourceData: CardData;
}

function permanentFixture({
  cardId,
  sourceDonCount,
  lifeCount,
  activeDonCount,
  restedDonCount,
}: {
  cardId: "EB01-014" | "EB01-058";
  sourceDonCount: number;
  lifeCount: number;
  activeDonCount: number;
  restedDonCount: number;
}): PermanentFixture {
  const cardDb = createTestCardDb();
  const sourceSeed = data(cardId);
  const otherData = data("OPT603-PERMANENT-OTHER");
  cardDb.set(sourceSeed.id, sourceSeed);
  cardDb.set(otherData.id, otherData);
  injectSchemasIntoCardDb(cardDb);

  const sourceData = cardDb.get(cardId)!;
  let state = createBattleReadyState(cardDb);
  const source = character(cardId, SOURCE_INSTANCE_ID, sourceDonCount);
  const other = character(otherData.id, OTHER_INSTANCE_ID, 1);
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    characters: padChars([source, other]),
    life: players[0].life.slice(0, lifeCount),
    donCostArea: [
      ...Array.from({ length: activeDonCount }, (_, index) => ({
        instanceId: `opt603-active-don-${index}`,
        state: "ACTIVE" as const,
        attachedTo: null,
      })),
      ...Array.from({ length: restedDonCount }, (_, index) => ({
        instanceId: `opt603-rested-don-${index}`,
        state: "RESTED" as const,
        attachedTo: null,
      })),
    ],
  };
  state = {
    ...state,
    players,
    turn: {
      ...state.turn,
      activePlayerIndex: 0,
    },
  };

  return {
    state: registerPermanentEffectsForCard(state, source, sourceData),
    cardDb,
    source,
    sourceData,
  };
}

function effectiveSourcePower(fixture: PermanentFixture): number {
  return getEffectivePower(
    fixture.source,
    fixture.sourceData,
    fixture.state,
    fixture.cardDb
  );
}

describe("OPT-603 — attached-DON permanent gates", () => {
  it("EB01-014 adds its source-attached DON!! gate without replacing its active-DON condition", () => {
    const gateIsMet = (fixture: PermanentFixture): boolean => {
      const effect = fixture.state.activeEffects.find(
        (candidate) =>
          candidate.sourceCardInstanceId === fixture.source.instanceId
      );
      if (!effect) {
        throw new Error("Expected EB01-014's permanent effect to register");
      }
      return isEffectConditionMet(effect, fixture.state, fixture.cardDb);
    };

    // OPT-605 tracks dynamic permanent modifier amounts. Assert only this
    // ticket's gate so that fixing the currently inert PER_COUNT power value
    // does not turn this regression into a false failure.
    expect(
      gateIsMet(
        permanentFixture({
          cardId: "EB01-014",
          sourceDonCount: 0,
          lifeCount: 5,
          activeDonCount: 1,
          restedDonCount: 3,
        })
      )
    ).toBe(false);
    expect(
      gateIsMet(
        permanentFixture({
          cardId: "EB01-014",
          sourceDonCount: 1,
          lifeCount: 5,
          activeDonCount: 1,
          restedDonCount: 3,
        })
      )
    ).toBe(true);
    expect(
      gateIsMet(
        permanentFixture({
          cardId: "EB01-014",
          sourceDonCount: 1,
          lifeCount: 5,
          activeDonCount: 0,
          restedDonCount: 3,
        })
      )
    ).toBe(false);
  });

  it("EB01-058 adds its source-attached DON!! gate without replacing its active-DON and Life conditions", () => {
    expect(
      effectiveSourcePower(
        permanentFixture({
          cardId: "EB01-058",
          sourceDonCount: 0,
          lifeCount: 2,
          activeDonCount: 1,
          restedDonCount: 0,
        })
      )
    ).toBe(5000);
    expect(
      effectiveSourcePower(
        permanentFixture({
          cardId: "EB01-058",
          sourceDonCount: 1,
          lifeCount: 2,
          activeDonCount: 1,
          restedDonCount: 0,
        })
      )
    ).toBe(8000);
    expect(
      effectiveSourcePower(
        permanentFixture({
          cardId: "EB01-058",
          sourceDonCount: 1,
          lifeCount: 5,
          activeDonCount: 1,
          restedDonCount: 0,
        })
      )
    ).toBe(6000);
  });
});
