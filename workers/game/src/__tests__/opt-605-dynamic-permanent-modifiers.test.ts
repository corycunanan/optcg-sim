/**
 * OPT-605 — permanent modifiers resolve PER_COUNT / GAME_STATE values against
 * live state instead of silently dropping them.
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
import { resolvePermanentDynamicValue } from "../engine/dynamic-values.js";
import {
  getEffectiveCost,
  getEffectivePower,
  type CostEvaluationDiagnostics,
} from "../engine/modifiers.js";
import {
  getAllAuthoredSchemas,
  getEffectSchema,
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

function data(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Black"],
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

function don(instanceId: string, state: DonInstance["state"]): DonInstance {
  return { instanceId, state, attachedTo: null };
}

interface CardFixture {
  state: GameState;
  cardDb: Map<string, CardData>;
  source: CardInstance;
  sourceData: CardData;
}

function authoredFixture(
  cardId: string,
  {
    leaderTraits = [],
    attachedDon = 0,
    activePlayerIndex = 0,
    power = 5000,
    cost = 5,
  }: {
    leaderTraits?: string[];
    attachedDon?: number;
    activePlayerIndex?: 0 | 1;
    power?: number;
    cost?: number;
  } = {}
): CardFixture {
  const schema = getEffectSchema(cardId);
  if (!schema) throw new Error(`Missing authored schema for ${cardId}`);

  const cardDb = createTestCardDb();
  const sourceData = data(cardId, { effectSchema: schema, power, cost });
  const leaderData = data(`LEADER-${cardId}`, {
    type: "Leader",
    cost: null,
    power: 5000,
    life: 5,
    types: leaderTraits,
  });
  const eventData = data(`EVENT-${cardId}`, {
    type: "Event",
    power: null,
  });
  const trashData = data(`TRASH-${cardId}`);
  cardDb.set(sourceData.id, sourceData);
  cardDb.set(leaderData.id, leaderData);
  cardDb.set(eventData.id, eventData);
  cardDb.set(trashData.id, trashData);

  let state = createBattleReadyState(cardDb);
  const source = {
    ...card(sourceData.id, 0, `source-${cardId}`),
    attachedDon: Array.from({ length: attachedDon }, (_, index) =>
      don(`attached-${cardId}-${index}`, "ACTIVE")
    ),
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    leader: {
      ...players[0].leader,
      cardId: leaderData.id,
    },
    characters: padChars([source]),
    hand: [],
    trash: [],
  };
  state = {
    ...state,
    players,
    turn: { ...state.turn, activePlayerIndex },
    activeEffects: [],
  };
  state = registerPermanentEffectsForCard(state, source, sourceData);
  return { state, cardDb, source, sourceData };
}

function withHandCount(
  fixture: CardFixture,
  count: number,
  controller: 0 | 1 = 0
): CardFixture {
  const players = [...fixture.state.players] as [PlayerState, PlayerState];
  players[controller] = {
    ...players[controller],
    hand: Array.from({ length: count }, (_, index) =>
      card(
        fixture.sourceData.id,
        controller,
        `hand-${fixture.sourceData.id}-${controller}-${index}`,
        "HAND"
      )
    ),
  };
  return { ...fixture, state: { ...fixture.state, players } };
}

function withTrashCount(
  fixture: CardFixture,
  count: number,
  type: "Character" | "Event" = "Character"
): CardFixture {
  const trashCardId =
    type === "Event"
      ? `EVENT-${fixture.sourceData.id}`
      : `TRASH-${fixture.sourceData.id}`;
  const players = [...fixture.state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    trash: Array.from({ length: count }, (_, index) =>
      card(trashCardId, 0, `trash-${fixture.sourceData.id}-${index}`, "TRASH")
    ),
  };
  return { ...fixture, state: { ...fixture.state, players } };
}

function withRestedDonCount(fixture: CardFixture, count: number): CardFixture {
  const players = [...fixture.state.players] as [PlayerState, PlayerState];
  players[0] = {
    ...players[0],
    donCostArea: [
      don(`active-${fixture.sourceData.id}`, "ACTIVE"),
      ...Array.from({ length: count }, (_, index) =>
        don(`rested-${fixture.sourceData.id}-${index}`, "RESTED")
      ),
    ],
  };
  return { ...fixture, state: { ...fixture.state, players } };
}

function effectivePower(fixture: CardFixture): number {
  return getEffectivePower(
    fixture.source,
    fixture.sourceData,
    fixture.state,
    fixture.cardDb
  );
}

function effectiveCost(
  fixture: CardFixture,
  diagnostics?: CostEvaluationDiagnostics
): number {
  return getEffectiveCost(
    fixture.sourceData,
    fixture.state,
    fixture.source.instanceId,
    fixture.cardDb,
    false,
    diagnostics
  );
}

describe("OPT-605 — canonical card formulas", () => {
  it("EB01-014 floors +1000 per 3 rested DON!! at 2, 3, and 6", () => {
    const base = authoredFixture("EB01-014", { attachedDon: 1 });
    expect(effectivePower(withRestedDonCount(base, 2))).toBe(6000);
    expect(effectivePower(withRestedDonCount(base, 3))).toBe(7000);
    expect(effectivePower(withRestedDonCount(base, 6))).toBe(8000);
  });

  it("EB01-027 gains +1000 per 2 Events in its controller's trash", () => {
    const base = authoredFixture("EB01-027", {
      leaderTraits: ["Baroque Works"],
    });
    expect(effectivePower(withTrashCount(base, 1, "Event"))).toBe(5000);
    expect(effectivePower(withTrashCount(base, 2, "Event"))).toBe(6000);
    expect(effectivePower(withTrashCount(base, 5, "Event"))).toBe(7000);
  });

  it("EB04-048 gains +1000 power and +2 cost per 5 trash cards", () => {
    const base = authoredFixture("EB04-048", { leaderTraits: ["CP"] });
    const atFour = withTrashCount(base, 4);
    const atFive = withTrashCount(base, 5);
    const atTen = withTrashCount(base, 10);
    expect([effectivePower(atFour), effectiveCost(atFour)]).toEqual([5000, 5]);
    expect([effectivePower(atFive), effectiveCost(atFive)]).toEqual([6000, 7]);
    expect([effectivePower(atTen), effectiveCost(atTen)]).toEqual([7000, 9]);
  });

  it("OP01-072 gains +1000 power for every card in hand", () => {
    const base = authoredFixture("OP01-072", { attachedDon: 1 });
    expect(effectivePower(withHandCount(base, 1))).toBe(7000);
    expect(effectivePower(withHandCount(base, 3))).toBe(9000);
  });

  it("OP01-083 gains +1000 per 2 Events in trash", () => {
    const base = authoredFixture("OP01-083", {
      attachedDon: 1,
      leaderTraits: ["Baroque Works"],
    });
    expect(effectivePower(withTrashCount(base, 1, "Event"))).toBe(6000);
    expect(effectivePower(withTrashCount(base, 2, "Event"))).toBe(7000);
    expect(effectivePower(withTrashCount(base, 4, "Event"))).toBe(8000);
  });

  it("OP06-085 gains +1000 per 5 trash cards during its controller's turn", () => {
    const base = authoredFixture("OP06-085", { attachedDon: 2 });
    expect(effectivePower(withTrashCount(base, 4))).toBe(7000);
    expect(effectivePower(withTrashCount(base, 5))).toBe(8000);
    expect(effectivePower(withTrashCount(base, 10))).toBe(9000);
  });

  it("OP09-086 gains +1000 per 4 trash cards", () => {
    const base = authoredFixture("OP09-086", {
      leaderTraits: ["Blackbeard Pirates"],
    });
    expect(effectivePower(withTrashCount(base, 3))).toBe(5000);
    expect(effectivePower(withTrashCount(base, 4))).toBe(6000);
    expect(effectivePower(withTrashCount(base, 8))).toBe(7000);
  });

  it("OP12-070 gains +1000 per 5 Events in trash", () => {
    const base = authoredFixture("OP12-070");
    expect(effectivePower(withTrashCount(base, 4, "Event"))).toBe(5000);
    expect(effectivePower(withTrashCount(base, 5, "Event"))).toBe(6000);
    expect(effectivePower(withTrashCount(base, 10, "Event"))).toBe(7000);
  });

  it("OP14-053 sets base power to its controller's live Leader base power", () => {
    const base = authoredFixture("OP14-053", {
      activePlayerIndex: 1,
      power: 2000,
    });
    const leaderId = base.state.players[0].leader.cardId;
    base.cardDb.set(leaderId, data(leaderId, { type: "Leader", power: 4000 }));
    expect(effectivePower(base)).toBe(4000);
    base.cardDb.set(leaderId, data(leaderId, { type: "Leader", power: 6000 }));
    expect(effectivePower(base)).toBe(6000);
  });

  it("OP16-034 terminates and gains +1000 per distinct Character name", () => {
    const base = authoredFixture("OP16-034", { attachedDon: 1 });
    const duplicateData = data("OP16-DUPLICATE", { name: "Duplicate" });
    const uniqueData = data("OP16-UNIQUE", { name: "Unique" });
    base.cardDb.set(duplicateData.id, duplicateData);
    base.cardDb.set(uniqueData.id, uniqueData);
    const players = [...base.state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([
        base.source,
        card(duplicateData.id, 0, "duplicate-a"),
        card(duplicateData.id, 0, "duplicate-b"),
        card(uniqueData.id, 0, "unique"),
      ]),
    };
    const withNames = { ...base, state: { ...base.state, players } };
    expect(effectivePower(base)).toBe(7000);
    expect(effectivePower(withNames)).toBe(9000);
  });

  it("ST27-004 gains +1 cost per 4 trash cards", () => {
    const base = authoredFixture("ST27-004", {
      leaderTraits: ["Blackbeard Pirates"],
    });
    expect(effectiveCost(withTrashCount(base, 3))).toBe(5);
    expect(effectiveCost(withTrashCount(base, 4))).toBe(6);
    expect(effectiveCost(withTrashCount(base, 8))).toBe(7);
  });
});

describe("OPT-605 — live resolution and cost fixpoint", () => {
  it.each([
    ["EB04-048", ["CP"]],
    ["ST27-004", ["Blackbeard Pirates"]],
  ] as const)(
    "%s recomputes dynamic cost per query and converges deterministically",
    (cardId, leaderTraits) => {
      const base = authoredFixture(cardId, {
        leaderTraits: [...leaderTraits],
      });
      const divisor = cardId === "EB04-048" ? 5 : 4;
      const firstDiagnostics: CostEvaluationDiagnostics = {
        layer2Iterations: 0,
      };
      const secondDiagnostics: CostEvaluationDiagnostics = {
        layer2Iterations: 0,
      };
      const first = effectiveCost(
        withTrashCount(base, divisor - 1),
        firstDiagnostics
      );
      const second = effectiveCost(
        withTrashCount(base, divisor * 2),
        secondDiagnostics
      );
      expect(second).toBe(first + (cardId === "EB04-048" ? 4 : 2));
      expect(firstDiagnostics.layer2Iterations).toBe(2);
      expect(secondDiagnostics.layer2Iterations).toBe(2);
    }
  );

  it("evaluates a dynamic cost when it first becomes eligible on a later pass", () => {
    const fixture = authoredFixture("ST27-004", {
      leaderTraits: ["Blackbeard Pirates"],
      cost: 4,
    });
    const dynamicEffect: RuntimeActiveEffect = {
      id: "later-pass-dynamic",
      sourceCardInstanceId: fixture.source.instanceId,
      sourceEffectBlockId: "later-pass-dynamic",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: {
            type: "CHARACTER",
            controller: "SELF",
            filter: { cost_min: 6 },
          },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_IN_TRASH",
              multiplier: -1,
              divisor: 2,
            },
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [],
      timestamp: 1,
    };
    const enablingEffect: RuntimeActiveEffect = {
      ...dynamicEffect,
      id: "first-pass-enabler",
      sourceEffectBlockId: "first-pass-enabler",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 2 },
        },
      ],
      appliesTo: [fixture.source.instanceId],
      timestamp: 2,
    };
    const withTrash = withTrashCount(fixture, 6);
    const withEffects = {
      ...withTrash,
      state: {
        ...withTrash.state,
        activeEffects: [dynamicEffect, enablingEffect],
      },
    };
    const diagnostics: CostEvaluationDiagnostics = { layer2Iterations: 0 };
    expect(effectiveCost(withEffects, diagnostics)).toBe(3);
    expect(diagnostics.layer2Iterations).toBe(3);
  });

  it("tracks each dynamic cost modifier by effect id and modifier index", () => {
    const fixture = authoredFixture("ST27-004", { cost: 5 });
    const effect: RuntimeActiveEffect = {
      id: "two-cost-modifiers",
      sourceCardInstanceId: fixture.source.instanceId,
      sourceEffectBlockId: "two_cost_modifiers",
      category: "permanent",
      modifiers: [
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: {
            amount: {
              type: "PER_COUNT",
              source: "CARDS_IN_TRASH",
              multiplier: -1,
              divisor: 2,
            },
          },
        },
        {
          type: "MODIFY_COST",
          target: { type: "SELF" },
          params: { amount: 1 },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [fixture.source.instanceId],
      timestamp: 1,
    };
    const withTrash = withTrashCount(fixture, 4);
    withTrash.state = {
      ...withTrash.state,
      activeEffects: [effect],
    };
    const diagnostics: CostEvaluationDiagnostics = { layer2Iterations: 0 };
    expect(effectiveCost(withTrash, diagnostics)).toBe(4);
    expect(diagnostics.layer2Iterations).toBe(2);
  });

  it("clamps a negative dynamic cost result to zero", () => {
    const fixture = authoredFixture("ST27-004", {
      leaderTraits: ["Blackbeard Pirates"],
      cost: 1,
    });
    const state = withTrashCount(fixture, 8);
    const effect = state.state.activeEffects[0];
    state.state = {
      ...state.state,
      activeEffects: [
        {
          ...effect,
          modifiers: [
            {
              type: "MODIFY_COST",
              target: { type: "SELF" },
              params: {
                amount: {
                  type: "PER_COUNT",
                  source: "CARDS_IN_TRASH",
                  multiplier: -2,
                  divisor: 4,
                },
              },
            },
          ],
        },
      ],
    };
    expect(effectiveCost(state)).toBe(0);
  });

  it("uses the effect controller, including GAME_STATE OPPONENT", () => {
    const fixture = authoredFixture("OP14-053", {
      activePlayerIndex: 1,
      power: 2000,
    });
    const p0LeaderId = fixture.state.players[0].leader.cardId;
    const p1LeaderId = fixture.state.players[1].leader.cardId;
    fixture.cardDb.set(
      p0LeaderId,
      data(p0LeaderId, { type: "Leader", power: 7000 })
    );
    fixture.cardDb.set(
      p1LeaderId,
      data(p1LeaderId, { type: "Leader", power: 3000 })
    );
    const effect = fixture.state.activeEffects[0];
    fixture.state = {
      ...fixture.state,
      activeEffects: [
        {
          ...effect,
          controller: 1,
          conditions: undefined,
          duration: { type: "PERMANENT" },
          modifiers: [
            {
              type: "SET_POWER",
              target: { type: "SELF" },
              params: {
                value: {
                  type: "GAME_STATE",
                  source: "LEADER_BASE_POWER",
                  controller: "OPPONENT",
                },
              },
            },
          ],
        },
      ],
    };
    expect(effectivePower(fixture)).toBe(7000);
  });

  it("throws instead of silently resolving a cardDb-dependent source to zero", () => {
    const fixture = authoredFixture("EB01-027", {
      leaderTraits: ["Baroque Works"],
    });
    expect(() =>
      getEffectivePower(
        fixture.source,
        fixture.sourceData,
        withTrashCount(fixture, 2, "Event").state
      )
    ).toThrow(
      "Unable to resolve permanent modifier permanent_power_per_events.amount: EVENTS_IN_TRASH requires card data"
    );
  });

  it("keeps one-time modifiers on the numeric-only path", () => {
    const fixture = authoredFixture("ST27-004");
    fixture.state = {
      ...fixture.state,
      activeEffects: [],
      oneTimeModifiers: [
        {
          id: "numeric-only-one-time",
          appliesTo: {},
          modification: {
            type: "MODIFY_COST",
            params: {
              amount: {
                type: "PER_COUNT",
                source: "CARDS_IN_TRASH",
                multiplier: -1,
              },
            },
          },
          expires: { type: "THIS_TURN" },
          consumed: false,
          controller: 0,
        },
      ],
    };
    expect(
      getEffectiveCost(
        fixture.sourceData,
        fixture.state,
        fixture.source.instanceId,
        fixture.cardDb
      )
    ).toBe(5);
  });
});

describe("OPT-605 — every permanent numeric application path", () => {
  it("resolves a dynamic SET_COST value from live state", () => {
    const fixture = authoredFixture("ST27-004");
    const setter: RuntimeActiveEffect = {
      id: "dynamic-set-cost",
      sourceCardInstanceId: fixture.source.instanceId,
      sourceEffectBlockId: "dynamic_set_cost",
      category: "permanent",
      modifiers: [
        {
          type: "SET_COST",
          target: { type: "SELF" },
          params: {
            value: {
              type: "GAME_STATE",
              source: "HAND_COUNT",
              controller: "SELF",
            },
          },
        },
      ],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: [fixture.source.instanceId],
      timestamp: 1,
    };
    fixture.state = {
      ...fixture.state,
      activeEffects: [setter],
    };
    expect(effectiveCost(withHandCount(fixture, 2))).toBe(2);
    expect(effectiveCost(withHandCount(fixture, 4))).toBe(4);
  });

  it("resolves a dynamic hand-zone self-cost modifier", () => {
    const schema: EffectSchema = {
      effects: [
        {
          id: "dynamic_hand_self_cost",
          category: "permanent",
          zone: "HAND",
          modifiers: [
            {
              type: "MODIFY_COST",
              target: { type: "SELF" },
              params: {
                amount: {
                  type: "PER_COUNT",
                  source: "CARDS_IN_TRASH",
                  multiplier: -1,
                },
              },
            },
          ],
        },
      ],
    };
    const fixture = authoredFixture("ST27-004");
    const handData = data("DYNAMIC-HAND-SELF", {
      effectSchema: schema,
      cost: 5,
    });
    const handCard = card(handData.id, 0, "dynamic-hand-self", "HAND");
    fixture.cardDb.set(handData.id, handData);
    const players = [...fixture.state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      hand: [handCard],
    };
    fixture.state = {
      ...fixture.state,
      players,
      activeEffects: [],
    };

    const read = (trashCount: number) => {
      const state = withTrashCount(fixture, trashCount).state;
      return getEffectiveCost(
        handData,
        state,
        handCard.instanceId,
        fixture.cardDb
      );
    };
    expect(read(1)).toBe(4);
    expect(read(3)).toBe(2);
  });

  it("resolves a dynamic field-to-hand cost modifier", () => {
    const auraSchema: EffectSchema = {
      effects: [
        {
          id: "dynamic_field_to_hand_cost",
          category: "permanent",
          modifiers: [
            {
              type: "MODIFY_COST",
              target: {
                type: "CARD_IN_HAND",
                controller: "SELF",
              },
              params: {
                amount: {
                  type: "PER_COUNT",
                  source: "CARDS_IN_TRASH",
                  multiplier: -1,
                },
              },
            },
          ],
        },
      ],
    };
    const fixture = authoredFixture("ST27-004");
    const auraData = data("DYNAMIC-HAND-AURA", {
      effectSchema: auraSchema,
    });
    const targetData = data("DYNAMIC-HAND-TARGET", { cost: 5 });
    const aura = card(auraData.id, 0, "dynamic-hand-aura");
    const target = card(targetData.id, 0, "dynamic-hand-target", "HAND");
    fixture.cardDb.set(auraData.id, auraData);
    fixture.cardDb.set(targetData.id, targetData);
    const players = [...fixture.state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: padChars([aura]),
      hand: [target],
    };
    fixture.state = {
      ...fixture.state,
      players,
      activeEffects: [],
    };

    const read = (trashCount: number) => {
      const state = withTrashCount(fixture, trashCount).state;
      return getEffectiveCost(
        targetData,
        state,
        target.instanceId,
        fixture.cardDb
      );
    };
    expect(read(1)).toBe(4);
    expect(read(3)).toBe(2);
  });
});

function assertPermanentRegistryDynamicValuesResolve(
  schemas: Record<string, EffectSchema>
): void {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  const failures: string[] = [];

  for (const [cardId, schema] of Object.entries(schemas)) {
    for (const block of schema.effects ?? []) {
      if (block.category !== "permanent") continue;
      for (const [modifierIndex, modifier] of (
        block.modifiers ?? []
      ).entries()) {
        for (const key of ["amount", "value"] as const) {
          const value = modifier.params?.[key];
          if (!value || typeof value !== "object") continue;
          const resolution = resolvePermanentDynamicValue(value, {
            resultRefs: new Map(),
            state,
            controller: 0,
            cardDb,
            matchesFilter: () => true,
          });
          if (!resolution.resolved) {
            failures.push(
              `${cardId}/${block.id}/modifier[${modifierIndex}].${key}: ${resolution.detail}`
            );
          }
        }
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Permanent dynamic modifier contract failed:\n${failures.join("\n")}`
    );
  }
}

describe("OPT-605 — registry-driven permanent dynamic contract", () => {
  it("resolves every dynamic permanent amount/value in AUTHORED_SCHEMAS", () => {
    expect(() =>
      assertPermanentRegistryDynamicValuesResolve(getAllAuthoredSchemas())
    ).not.toThrow();
  });

  it("rejects an unhandled source and names its card and block", () => {
    const schemas: Record<string, EffectSchema> = {
      "OPT605-UNSUPPORTED-SOURCE": {
        effects: [
          {
            id: "unsupported_source_block",
            category: "permanent",
            modifiers: [
              {
                type: "MODIFY_POWER",
                params: {
                  amount: {
                    type: "PER_COUNT",
                    source: "NO_REAL_RESOLVER",
                    multiplier: 1000,
                  },
                },
              },
            ],
          },
        ],
      } as EffectSchema,
    };
    expect(() => assertPermanentRegistryDynamicValuesResolve(schemas)).toThrow(
      "OPT605-UNSUPPORTED-SOURCE/unsupported_source_block/modifier[0].amount: PER_COUNT source 'NO_REAL_RESOLVER' has no resolver"
    );
  });

  it("rejects a dynamic type that has no permanent resolver", () => {
    const schemas: Record<string, EffectSchema> = {
      "OPT605-UNSUPPORTED-TYPE": {
        effects: [
          {
            id: "unsupported_type_block",
            category: "permanent",
            modifiers: [
              {
                type: "MODIFY_POWER",
                params: {
                  amount: { type: "ACTION_RESULT", ref: "never_available" },
                },
              },
            ],
          },
        ],
      },
    };
    expect(() => assertPermanentRegistryDynamicValuesResolve(schemas)).toThrow(
      "OPT605-UNSUPPORTED-TYPE/unsupported_type_block/modifier[0].amount: dynamic value type 'ACTION_RESULT' cannot resolve for a permanent modifier"
    );
  });
});
