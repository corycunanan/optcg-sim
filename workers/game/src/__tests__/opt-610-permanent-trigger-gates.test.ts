/**
 * OPT-610 — permanent blocks must express live gates through conditions and
 * duration, never through ignored trigger metadata.
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
import { getEffectivePower } from "../engine/modifiers.js";
import { expireSourceLeftZone } from "../engine/duration-tracker.js";
import { isRemovalProhibited } from "../engine/prohibitions.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import { validate } from "../engine/validation.js";
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

function data(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 5,
    power: 5000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: NO_KEYWORDS,
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function don(
  instanceId: string,
  attachedTo: string | null = null
): DonInstance {
  return { instanceId, state: "ACTIVE", attachedTo };
}

function instance(
  cardId: string,
  controller: 0 | 1,
  instanceId: string,
  {
    attachedDon = 0,
    state = "ACTIVE",
    zone = "CHARACTER",
  }: {
    attachedDon?: number;
    state?: "ACTIVE" | "RESTED";
    zone?: CardInstance["zone"];
  } = {}
): CardInstance {
  return {
    instanceId,
    cardId,
    zone,
    state,
    attachedDon: Array.from({ length: attachedDon }, (_, index) =>
      don(`${instanceId}-don-${index}`, instanceId)
    ),
    turnPlayed: 1,
    controller,
    owner: controller,
  };
}

interface Fixture {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
  sourceData: CardData;
  allies: CardInstance[];
  opponents: CardInstance[];
}

function fixture(
  cardId: string,
  {
    activePlayerIndex = 0,
    attachedDon = 0,
    sourceType = "Character",
    allies = [],
    opponents = [],
  }: {
    activePlayerIndex?: 0 | 1;
    attachedDon?: number;
    sourceType?: "Character" | "Leader";
    allies?: Array<{ data: CardData; card: CardInstance }>;
    opponents?: Array<{ data: CardData; card: CardInstance }>;
  } = {}
): Fixture {
  const schema = getEffectSchema(cardId);
  if (!schema) throw new Error(`Missing authored schema for ${cardId}`);

  const cardDb = createTestCardDb();
  const sourceData = data(cardId, {
    type: sourceType,
    cost: sourceType === "Leader" ? null : 5,
    life: sourceType === "Leader" ? 5 : null,
    effectSchema: schema,
  });
  cardDb.set(cardId, sourceData);
  for (const entry of [...allies, ...opponents]) {
    cardDb.set(entry.data.id, entry.data);
  }

  const source = instance(cardId, 0, `source-${cardId}`, {
    attachedDon,
    zone: sourceType === "Leader" ? "LEADER" : "CHARACTER",
  });
  let state = createBattleReadyState(cardDb);
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    leader: sourceType === "Leader" ? source : players[0].leader,
    characters: padChars([
      ...(sourceType === "Character" ? [source] : []),
      ...allies.map((entry) => entry.card),
    ]),
  };
  players[1] = {
    ...players[1],
    characters: padChars(opponents.map((entry) => entry.card)),
  };
  state = {
    ...state,
    players,
    turn: { ...state.turn, activePlayerIndex },
    activeEffects: [],
    prohibitions: [],
  };
  state = registerPermanentEffectsForCard(state, source, sourceData);

  return {
    state,
    cardDb,
    source,
    sourceData,
    allies: allies.map((entry) => entry.card),
    opponents: opponents.map((entry) => entry.card),
  };
}

function power(
  card: CardInstance,
  cardData: CardData,
  scene: Pick<Fixture, "state" | "cardDb">
): number {
  return getEffectivePower(card, cardData, scene.state, scene.cardDb);
}

describe("OPT-610 — permanent modifier gates", () => {
  it.each([
    ["opponent's turn", 1 as const, 1],
    ["own turn without attached DON!!", 0 as const, 0],
  ])("OP01-001 contributes zero on %s", (_name, turn, attachedDon) => {
    const allyData = data("ALLY-OP01-001");
    const ally = instance(allyData.id, 0, "ally-op01-001");
    const scene = fixture("OP01-001", {
      activePlayerIndex: turn,
      attachedDon,
      sourceType: "Leader",
      allies: [{ data: allyData, card: ally }],
    });
    expect(power(ally, allyData, scene)).toBe(5000);
  });

  it("OP01-001 grants its aura with attached DON!! on its controller's turn", () => {
    const allyData = data("ALLY-OP01-001");
    const ally = instance(allyData.id, 0, "ally-op01-001");
    const scene = fixture("OP01-001", {
      attachedDon: 1,
      sourceType: "Leader",
      allies: [{ data: allyData, card: ally }],
    });
    expect(power(ally, allyData, scene)).toBe(6000);
  });

  it.each([
    ["own turn", 0 as const, 2, 7000],
    ["opponent's turn without 2 attached DON!!", 1 as const, 1, 5000],
  ])(
    "OP01-019 contributes zero on %s",
    (_name, turn, attachedDon, expected) => {
      const scene = fixture("OP01-019", {
        activePlayerIndex: turn,
        attachedDon,
      });
      expect(power(scene.source, scene.sourceData, scene)).toBe(expected);
    }
  );

  it("OP01-019 gains +3000 with 2 attached DON!! on the opponent's turn", () => {
    const scene = fixture("OP01-019", {
      activePlayerIndex: 1,
      attachedDon: 2,
    });
    expect(power(scene.source, scene.sourceData, scene)).toBe(8000);
  });

  it("OP02-019 gates its Whitebeard Pirates aura by turn and attached DON!!", () => {
    const allyData = data("ALLY-OP02-019", { types: ["Whitebeard Pirates"] });
    const ally = instance(allyData.id, 0, "ally-op02-019");
    const makeScene = (activePlayerIndex: 0 | 1, attachedDon: number) =>
      fixture("OP02-019", {
        activePlayerIndex,
        attachedDon,
        allies: [{ data: allyData, card: ally }],
      });

    expect(power(ally, allyData, makeScene(0, 1))).toBe(6000);
    expect(power(ally, allyData, makeScene(1, 1))).toBe(5000);
    expect(power(ally, allyData, makeScene(0, 0))).toBe(5000);
  });

  it("OP01-032 requires attached DON!! in addition to 2 rested opposing cards", () => {
    const opponents = [0, 1].map((index) => {
      const opponentData = data(`OPPONENT-OP01-032-${index}`);
      return {
        data: opponentData,
        card: instance(opponentData.id, 1, `opponent-op01-032-${index}`, {
          state: "RESTED",
        }),
      };
    });
    const valid = fixture("OP01-032", { attachedDon: 1, opponents });
    const invalid = fixture("OP01-032", { attachedDon: 0, opponents });

    expect(power(valid.source, valid.sourceData, valid)).toBe(8000);
    expect(power(invalid.source, invalid.sourceData, invalid)).toBe(5000);
  });

  it("OP01-109 gates its 8-DON field buff by turn and attached DON!!", () => {
    const valid = fixture("OP01-109", { attachedDon: 1 });
    const wrongTurn = fixture("OP01-109", {
      activePlayerIndex: 1,
      attachedDon: 1,
    });
    const noAttachedDon = fixture("OP01-109");

    expect(power(valid.source, valid.sourceData, valid)).toBe(7000);
    expect(power(wrongTurn.source, wrongTurn.sourceData, wrongTurn)).toBe(5000);
    expect(
      power(noAttachedDon.source, noAttachedDon.sourceData, noAttachedDon)
    ).toBe(5000);
  });
});

describe("OPT-610 — non-power permanent gates", () => {
  it("OP01-021 grants active-Character attacks only with attached DON!!", () => {
    const targetData = data("ACTIVE-TARGET-OP01-021");
    const target = instance(targetData.id, 1, "active-target-op01-021");
    const action = {
      type: "DECLARE_ATTACK" as const,
      attackerInstanceId: "source-OP01-021",
      targetInstanceId: target.instanceId,
    };
    const valid = fixture("OP01-021", {
      attachedDon: 1,
      opponents: [{ data: targetData, card: target }],
    });
    const invalid = fixture("OP01-021", {
      opponents: [{ data: targetData, card: target }],
    });

    expect(validate(valid.state, action, valid.cardDb, 0)).toBeNull();
    expect(validate(invalid.state, action, invalid.cardDb, 0)).toBe(
      "Can only attack rested Characters"
    );
  });

  it("OP01-024 blocks Strike battle K.O. only with 2 attached DON!!", () => {
    const attackerData = data("STRIKE-ATTACKER", { attribute: ["Strike"] });
    const attacker = instance(attackerData.id, 1, "strike-attacker");
    const check = (attachedDon: number) => {
      const scene = fixture("OP01-024", {
        attachedDon,
        opponents: [{ data: attackerData, card: attacker }],
      });
      return isRemovalProhibited(
        scene.state,
        scene.source.instanceId,
        {
          action: "KO",
          cause: "BATTLE",
          causingController: 1,
          sourceCardInstanceId: attacker.instanceId,
        },
        scene.cardDb
      );
    };

    expect(check(2)).toBe(true);
    expect(check(1)).toBe(false);
  });

  it("OP02-114's power and effect-K.O. protection toggle with opponent's turn", () => {
    const effectSourceData = data("EFFECT-SOURCE-OP02-114");
    const effectSource = instance(
      effectSourceData.id,
      1,
      "effect-source-op02-114"
    );
    const makeScene = (activePlayerIndex: 0 | 1) =>
      fixture("OP02-114", {
        activePlayerIndex,
        opponents: [{ data: effectSourceData, card: effectSource }],
      });
    const protectedOn = makeScene(1);
    const protectedOff = makeScene(0);
    const removalContext = {
      action: "KO" as const,
      cause: "EFFECT" as const,
      causingController: 1 as const,
      sourceCardInstanceId: effectSource.instanceId,
    };

    expect(power(protectedOn.source, protectedOn.sourceData, protectedOn)).toBe(
      6000
    );
    expect(
      isRemovalProhibited(
        protectedOn.state,
        protectedOn.source.instanceId,
        removalContext,
        protectedOn.cardDb
      )
    ).toBe(true);
    expect(
      power(protectedOff.source, protectedOff.sourceData, protectedOff)
    ).toBe(5000);
    expect(
      isRemovalProhibited(
        protectedOff.state,
        protectedOff.source.instanceId,
        removalContext,
        protectedOff.cardDb
      )
    ).toBe(false);
    expect(
      expireSourceLeftZone(protectedOn.state, protectedOn.source.instanceId)
        .prohibitions
    ).toEqual([]);
  });
});
