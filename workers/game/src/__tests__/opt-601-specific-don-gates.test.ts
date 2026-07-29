/**
 * OPT-601 — bracketed [DON!! xN] gates read DON!! attached to the source card,
 * not DON!! elsewhere in the controller's cost area or field.
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
import type { EffectBlock, EffectSchema } from "../engine/effect-types.js";
import {
  getEffectiveFieldCost,
  getEffectivePower,
  hasGrantedKeyword,
  isEffectConditionMet,
} from "../engine/modifiers.js";
import { isProhibitedForCard } from "../engine/prohibitions.js";
import { resolveEffect } from "../engine/effect-resolver/resolver.js";
import { evaluateCondition } from "../engine/conditions.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import {
  OP02_008_JOZU,
  OP02_014_WHITEY_BAY,
} from "../engine/schemas/op02.js";
import {
  OP03_053_YOSAKU_AND_JOHNNY,
  OP03_078_ISSHO,
  OP03_079_VERGO,
  OP03_090_BLUENO,
  OP03_108_CHARLOTTE_CRACKER,
} from "../engine/schemas/op03.js";
import {
  OP04_020_ISSHO,
  OP04_081_CAVENDISH,
  OP04_106_CHARLOTTE_BAVAROIS,
  OP04_108_CHARLOTTE_MOSCATO,
} from "../engine/schemas/op04.js";
import { OP05_070_FRA_NOSUKE } from "../engine/schemas/op05.js";
import {
  OP06_085_KUMACY,
  OP06_110_NEKOMAMUSHI,
} from "../engine/schemas/op06.js";
import { OP07_081_KALIFA } from "../engine/schemas/op07.js";
import {
  OP13_002_PORTGAS_D_ACE,
  OP13_004_SABO,
} from "../engine/schemas/op13.js";
import { OP15_053_REBECCA } from "../engine/schemas/op15.js";
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

const TARGET_ID = "OPT601-TARGET";
const SUPPORT_ID = "OPT601-COST-EIGHT";

function cardData(
  schema: EffectSchema,
  type: "Character" | "Leader",
): CardData {
  return {
    id: schema.card_id ?? "OPT601-SOURCE",
    name: schema.card_name ?? "OPT601 source",
    type,
    color: ["Black"],
    cost: type === "Leader" ? null : 5,
    power: 5000,
    counter: null,
    life: type === "Leader" ? 5 : null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: NO_KEYWORDS,
    effectSchema: schema,
    imageUrl: null,
  };
}

function vanillaData(id: string, cost: number): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    cost,
    power: 5000,
  };
}

function character(
  cardId: string,
  controller: 0 | 1,
  suffix: string,
  attachedDon: DonInstance[] = [],
): CardInstance {
  return {
    instanceId: `opt601-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon,
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

function attachedDon(
  id: string,
  attachedTo: string,
): DonInstance {
  return {
    instanceId: id,
    state: "ACTIVE",
    attachedTo,
  };
}

interface GateFixture {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
  sourceData: CardData;
  target: CardInstance;
}

function buildGateFixture(
  schema: EffectSchema,
  type: "Character" | "Leader",
  sourceDonCount: number,
): GateFixture {
  const cardDb = createTestCardDb();
  const sourceData = cardData(schema, type);
  const targetData = vanillaData(TARGET_ID, 5);
  const supportData = vanillaData(SUPPORT_ID, 8);
  cardDb.set(sourceData.id, sourceData);
  cardDb.set(targetData.id, targetData);
  cardDb.set(supportData.id, supportData);
  cardDb.set(CARDS.LEADER.id, {
    ...CARDS.LEADER,
    types: ["Whitebeard Pirates"],
  });

  let state = createBattleReadyState(cardDb);
  const sourceAttachedDon = Array.from(
    { length: sourceDonCount },
    (_, index) => attachedDon(`don-source-${index}`, "opt601-source"),
  );
  const other = character(
    CARDS.VANILLA.id,
    0,
    "other",
    [attachedDon("don-other", "opt601-other")],
  );
  const support = character(SUPPORT_ID, 0, "support");
  const target = character(TARGET_ID, 1, "target");
  let source: CardInstance;

  const players = [...state.players] as [PlayerState, PlayerState];
  if (type === "Leader") {
    source = {
      ...players[0].leader,
      instanceId: "opt601-source",
      cardId: sourceData.id,
      attachedDon: sourceAttachedDon,
    };
    players[0] = {
      ...players[0],
      leader: source,
      characters: padChars([other, support]),
    };
  } else {
    source = character(
      sourceData.id,
      0,
      "source",
      sourceAttachedDon,
    );
    players[0] = {
      ...players[0],
      characters: padChars([source, other, support]),
    };
  }

  players[0] = {
    ...players[0],
    deck: players[0].deck.slice(0, 20),
    life: players[0].life.slice(0, 1),
    trash: Array.from({ length: 5 }, (_, index) =>
      character(CARDS.VANILLA.id, 0, `trash-${index}`),
    ).map((card) => ({ ...card, zone: "TRASH" as const })),
  };
  players[1] = {
    ...players[1],
    life: players[1].life.slice(0, 2),
    characters: padChars([target]),
  };
  state = { ...state, players };

  return {
    state: registerPermanentEffectsForCard(
      state,
      source,
      sourceData,
    ),
    cardDb,
    source,
    sourceData,
    target,
  };
}

describe("OPT-601 — attached-DON cost auras", () => {
  const cases = [
    ["OP03-078", OP03_078_ISSHO, "Character", 2],
    ["OP04-020", OP04_020_ISSHO, "Leader", 4],
    ["OP07-081", OP07_081_KALIFA, "Character", 4],
  ] as const;

  it.each(cases)(
    "%s stays inactive with DON!! elsewhere and activates with DON!! on its source",
    (_cardId, schema, type, activeCost) => {
      const negative = buildGateFixture(schema, type, 0);
      expect(
        getEffectiveFieldCost(
          negative.cardDb.get(TARGET_ID)!,
          negative.state,
          negative.target.instanceId,
          negative.cardDb,
        ),
      ).toBe(5);

      const positive = buildGateFixture(schema, type, 1);
      expect(
        getEffectiveFieldCost(
          positive.cardDb.get(TARGET_ID)!,
          positive.state,
          positive.target.instanceId,
          positive.cardDb,
        ),
      ).toBe(activeCost);
    },
  );
});

describe("OPT-601 — attached-DON keyword grants", () => {
  const cases = [
    ["OP02-008", "RUSH", OP02_008_JOZU, 1],
    ["OP02-014", "CAN_ATTACK_ACTIVE", OP02_014_WHITEY_BAY, 1],
    ["OP03-090", "BLOCKER", OP03_090_BLUENO, 1],
    ["OP04-081", "CAN_ATTACK_ACTIVE", OP04_081_CAVENDISH, 1],
    ["OP04-108", "BANISH", OP04_108_CHARLOTTE_MOSCATO, 1],
    ["OP05-070", "RUSH", OP05_070_FRA_NOSUKE, 1],
    ["OP06-110", "CAN_ATTACK_ACTIVE", OP06_110_NEKOMAMUSHI, 2],
    ["OP15-053", "BLOCKER", OP15_053_REBECCA, 1],
  ] as const;

  it.each(cases)(
    "%s ignores DON!! elsewhere and grants %s only at its attached-DON threshold",
    (_cardId, keyword, schema, requiredDon) => {
      const negative = buildGateFixture(schema, "Character", 0);
      expect(
        hasGrantedKeyword(
          negative.source,
          keyword,
          negative.state,
          negative.cardDb,
        ),
      ).toBe(false);

      const positive = buildGateFixture(
        schema,
        "Character",
        requiredDon,
      );
      expect(
        hasGrantedKeyword(
          positive.source,
          keyword,
          positive.state,
          positive.cardDb,
        ),
      ).toBe(true);
    },
  );
});

describe("OPT-601 — attached-DON continuous effects", () => {
  const powerCases = [
    ["OP03-053", OP03_053_YOSAKU_AND_JOHNNY, 1, 8000],
    ["OP03-108", OP03_108_CHARLOTTE_CRACKER, 1, 7000],
    ["OP04-106", OP04_106_CHARLOTTE_BAVAROIS, 1, 7000],
  ] as const;

  it.each(powerCases)(
    "%s ignores DON!! elsewhere and applies its power modifier only with source-attached DON!!",
    (_cardId, schema, requiredDon, activePower) => {
      const type =
        schema.card_type === "Leader" ? "Leader" : "Character";
      const negative = buildGateFixture(schema, type, 0);
      expect(
        getEffectivePower(
          negative.source,
          negative.sourceData,
          negative.state,
          negative.cardDb,
        ),
      ).toBe(5000);

      const positive = buildGateFixture(
        schema,
        type,
        requiredDon,
      );
      expect(
        getEffectivePower(
          positive.source,
          positive.sourceData,
          positive.state,
          positive.cardDb,
        ),
      ).toBe(activePower);
    },
  );

  it("OP06-085's runtime modifier gate requires 2 DON!! attached to OP06-085", () => {
    const negative = buildGateFixture(
      OP06_085_KUMACY,
      "Character",
      0,
    );
    const negativeEffect = negative.state.activeEffects.find(
      (effect) => effect.sourceEffectBlockId === "OP06-085_effect_1",
    );
    expect(negativeEffect).toBeDefined();
    expect(
      isEffectConditionMet(
        negativeEffect!,
        negative.state,
        negative.cardDb,
      ),
    ).toBe(false);

    const positive = buildGateFixture(
      OP06_085_KUMACY,
      "Character",
      2,
    );
    const positiveEffect = positive.state.activeEffects.find(
      (effect) => effect.sourceEffectBlockId === "OP06-085_effect_1",
    );
    expect(positiveEffect).toBeDefined();
    expect(
      isEffectConditionMet(
        positiveEffect!,
        positive.state,
        positive.cardDb,
      ),
    ).toBe(true);
  });

  it("OP13-004's authored DON!! guard reads only DON!! attached to OP13-004", () => {
    const block = OP13_004_SABO.effects[1] as EffectBlock;
    if (!block.conditions || !("all_of" in block.conditions)) {
      throw new Error("Expected OP13-004's compound permanent condition");
    }
    const donGuard = block.conditions.all_of[0];

    const negative = buildGateFixture(
      OP13_004_SABO,
      "Leader",
      0,
    );
    expect(
      evaluateCondition(
        negative.state,
        donGuard,
        {
          sourceCardInstanceId: negative.source.instanceId,
          controller: 0,
          cardDb: negative.cardDb,
        },
      ),
    ).toBe(false);

    const positive = buildGateFixture(
      OP13_004_SABO,
      "Leader",
      1,
    );
    expect(
      evaluateCondition(
        positive.state,
        donGuard,
        {
          sourceCardInstanceId: positive.source.instanceId,
          controller: 0,
          cardDb: positive.cardDb,
        },
      ),
    ).toBe(true);
  });

  it("OP03-079 protects itself only when DON!! is attached to OP03-079", () => {
    const negative = buildGateFixture(
      OP03_079_VERGO,
      "Character",
      0,
    );
    expect(
      isProhibitedForCard(
        negative.state,
        negative.source.instanceId,
        "CANNOT_BE_KO",
        negative.cardDb,
      ),
    ).toBe(false);

    const positive = buildGateFixture(
      OP03_079_VERGO,
      "Character",
      1,
    );
    expect(
      isProhibitedForCard(
        positive.state,
        positive.source.instanceId,
        "CANNOT_BE_KO",
        positive.cardDb,
      ),
    ).toBe(true);
  });

  it("OP13-002 resolves its draw trigger only when DON!! is attached to OP13-002", () => {
    const negative = buildGateFixture(
      OP13_002_PORTGAS_D_ACE,
      "Leader",
      0,
    );
    const block = OP13_002_PORTGAS_D_ACE.effects[1] as EffectBlock;
    expect(
      resolveEffect(
        negative.state,
        block,
        negative.source.instanceId,
        0,
        negative.cardDb,
      ).resolved,
    ).toBe(false);

    const positive = buildGateFixture(
      OP13_002_PORTGAS_D_ACE,
      "Leader",
      1,
    );
    expect(
      resolveEffect(
        positive.state,
        block,
        positive.source.instanceId,
        0,
        positive.cardDb,
      ).resolved,
    ).toBe(true);
  });
});
