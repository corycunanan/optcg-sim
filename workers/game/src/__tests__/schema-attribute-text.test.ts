/**
 * Behavioral coverage for the attribute encodings restored in the OP-16/ST-30
 * import (PR #225): battle-K.O. protections gated on the attacker's attribute,
 * and runtime-granted attributes (GRANT_ATTRIBUTE) counting toward those
 * filters in both directions.
 *
 * These tests drive isRemovalProhibited / matchesFilter / computeAllValidTargets
 * with the real authored schemas, so a resolver regression (e.g. ignoring
 * source_filter, or reading only printed attributes) fails here even if the
 * schema literals stay intact.
 */

import { describe, it, expect } from "vitest";

import type { CardData, CardInstance, GameState, Zone } from "../types.js";
import type {
  Action,
  EffectSchema,
  ProhibitionScope,
  RuntimeActiveEffect,
  RuntimeProhibition,
} from "../engine/effect-types.js";
import { isRemovalProhibited } from "../engine/prohibitions.js";
import { matchesFilter } from "../engine/conditions.js";
import { hasGrantedAttribute } from "../engine/modifiers.js";
import { computeAllValidTargets } from "../engine/effect-resolver/target-resolver.js";
import { EB03_014_KUINA } from "../engine/schemas/eb03.js";
import { OP08_114_S_HAWK } from "../engine/schemas/op08.js";
import { OP15_093_THE_RISKY_BROTHERS } from "../engine/schemas/op15.js";
import {
  P_025_SMOKER,
  P_052_DRACULE_MIHAWK,
  P_054_MONKEY_D_GARP,
} from "../engine/schemas/p.js";

// ─── Schema accessors — pull the encoded values out of the real schemas ──────

function firstProhibitionScope(schema: EffectSchema): ProhibitionScope {
  const scope = schema.effects[0]?.prohibitions?.[0]?.scope;
  expect(scope).toBeDefined();
  return scope as ProhibitionScope;
}

function actionByType(schema: EffectSchema, type: Action["type"]): Action {
  const action = schema.effects
    .flatMap((block) => block.actions ?? [])
    .find((candidate) => candidate.type === type);
  expect(action).toBeDefined();
  return action as Action;
}

// ─── Minimal state builders (same shape as opt-251-removal-prohibitions) ─────

function noKeywords() {
  return {
    rush: false,
    rushCharacter: false,
    doubleAttack: false,
    banish: false,
    blocker: false,
    trigger: false,
    unblockable: false,
  };
}

function makeCard(id: string, overrides: Partial<CardData> = {}): CardData {
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: null,
    keywords: noKeywords(),
    effectSchema: null,
    imageUrl: null,
    ...overrides,
  };
}

function makeInstance(
  cardId: string,
  instanceId: string,
  controller: 0 | 1,
  zone: Zone = "CHARACTER",
  overrides: Partial<CardInstance> = {},
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
    ...overrides,
  };
}

function padChars(chars: (CardInstance | null)[]): (CardInstance | null)[] {
  const out: (CardInstance | null)[] = [null, null, null, null, null];
  for (let i = 0; i < Math.min(chars.length, 5); i++) out[i] = chars[i];
  return out;
}

interface SceneOpts {
  /** Printed attributes of the attacker (P0 character). */
  attackerAttributes: string[];
  /** Prohibition scope taken from the authored schema under test. */
  scope: ProhibitionScope;
  /** Extra runtime effects (e.g. a GRANT_ATTRIBUTE grant). */
  activeEffects?: RuntimeActiveEffect[];
  /** Printed attributes of P0's leader (for the EB03-014 target test). */
  leaderAttributes?: string[];
}

const TARGET_ID = "tgt-defender";
const ATTACKER_ID = "atk-attacker";

function buildScene(opts: SceneOpts): { state: GameState; cardDb: Map<string, CardData> } {
  const leader0 = makeCard("LEADER-0", {
    type: "Leader",
    cost: null,
    power: 5000,
    life: 5,
    attribute: opts.leaderAttributes ?? [],
  });
  const leader1 = makeCard("LEADER-1", { type: "Leader", cost: null, power: 5000, life: 5 });
  const attackerCard = makeCard("ATTACKER", { attribute: opts.attackerAttributes });
  const defenderCard = makeCard("DEFENDER");

  const cardDb = new Map<string, CardData>();
  for (const c of [leader0, leader1, attackerCard, defenderCard]) cardDb.set(c.id, c);

  const attacker = makeInstance(attackerCard.id, ATTACKER_ID, 0);
  const defender = makeInstance(defenderCard.id, TARGET_ID, 1);

  const prohibition: RuntimeProhibition = {
    id: "p-cannot-be-ko",
    sourceCardInstanceId: TARGET_ID,
    sourceEffectBlockId: "block",
    prohibitionType: "CANNOT_BE_KO",
    scope: opts.scope,
    duration: { type: "PERMANENT" },
    controller: 1, // the defender's controller protects their own card
    appliesTo: [TARGET_ID],
    usesRemaining: null,
  } as RuntimeProhibition;

  const makePlayer = (idx: 0 | 1, leaderId: string, chars: (CardInstance | null)[]) => ({
    userId: `user-${idx}`,
    leader: makeInstance(leaderId, `leader-${idx}`, idx, "LEADER"),
    characters: padChars(chars),
    stage: null,
    hand: [],
    deck: [],
    trash: [],
    life: [],
    removedFromGame: [],
    donDeck: [],
    donCostArea: [],
  });

  const state = {
    gameId: "test-schema-attribute-behavior",
    status: "IN_PROGRESS",
    winner: null,
    players: [
      makePlayer(0, leader0.id, [attacker]),
      makePlayer(1, leader1.id, [defender]),
    ],
    turn: {
      number: 3,
      activePlayerIndex: 0,
      phase: "MAIN",
      battleSubPhase: null,
      battle: null,
      actionsPerformedThisTurn: [],
      oncePerTurnUsed: {},
      extraTurnsPending: 0,
    },
    activeEffects: opts.activeEffects ?? [],
    prohibitions: [prohibition] as unknown,
    scheduledActions: [],
    oneTimeModifiers: [],
    triggerRegistry: [],
    effectStack: [],
    pendingPrompt: null,
    eventLog: [],
    winReason: null,
  } as unknown as GameState;

  return { state, cardDb };
}

function grantAttributeEffect(
  targetInstanceId: string,
  attribute: string,
  controller: 0 | 1,
): RuntimeActiveEffect {
  return {
    id: "grant-attr-1",
    sourceCardInstanceId: "grant-source",
    sourceEffectBlockId: "",
    category: "auto",
    modifiers: [
      { type: "GRANT_ATTRIBUTE", params: { attribute }, duration: { type: "THIS_TURN" } },
    ],
    duration: { type: "THIS_TURN" },
    expiresAt: null,
    controller,
    appliesTo: [targetInstanceId],
    timestamp: 0,
  } as unknown as RuntimeActiveEffect;
}

const battleKO = {
  action: "KO",
  cause: "BATTLE",
  causingController: 0,
  sourceCardInstanceId: ATTACKER_ID,
} as const;

// ─── Battle-K.O. protections gated on the attacker's printed attribute ───────

describe("attribute-gated battle-K.O. protections (restored encodings)", () => {
  it("P-052 Dracule Mihawk is protected from a Slash attacker, not a Strike attacker", () => {
    const scope = firstProhibitionScope(P_052_DRACULE_MIHAWK);
    const slash = buildScene({ attackerAttributes: ["Slash"], scope });
    expect(isRemovalProhibited(slash.state, TARGET_ID, battleKO, slash.cardDb)).toBe(true);

    const strike = buildScene({ attackerAttributes: ["Strike"], scope });
    expect(isRemovalProhibited(strike.state, TARGET_ID, battleKO, strike.cardDb)).toBe(false);
  });

  it("P-054 Monkey.D.Garp is protected from a Strike attacker only", () => {
    const scope = firstProhibitionScope(P_054_MONKEY_D_GARP);
    const strike = buildScene({ attackerAttributes: ["Strike"], scope });
    expect(isRemovalProhibited(strike.state, TARGET_ID, battleKO, strike.cardDb)).toBe(true);

    const slash = buildScene({ attackerAttributes: ["Slash"], scope });
    expect(isRemovalProhibited(slash.state, TARGET_ID, battleKO, slash.cardDb)).toBe(false);
  });

  it("OP08-114 S-Hawk is protected from a Slash attacker only", () => {
    const scope = firstProhibitionScope(OP08_114_S_HAWK);
    const slash = buildScene({ attackerAttributes: ["Slash"], scope });
    expect(isRemovalProhibited(slash.state, TARGET_ID, battleKO, slash.cardDb)).toBe(true);

    const ranged = buildScene({ attackerAttributes: ["Ranged"], scope });
    expect(isRemovalProhibited(ranged.state, TARGET_ID, battleKO, ranged.cardDb)).toBe(false);
  });

  it("P-025 Smoker is protected from non-Special Characters and K.O.-able by Special ones", () => {
    const scope = firstProhibitionScope(P_025_SMOKER);
    const strike = buildScene({ attackerAttributes: ["Strike"], scope });
    expect(isRemovalProhibited(strike.state, TARGET_ID, battleKO, strike.cardDb)).toBe(true);

    const special = buildScene({ attackerAttributes: ["Special"], scope });
    expect(isRemovalProhibited(special.state, TARGET_ID, battleKO, special.cardDb)).toBe(false);
  });
});

// ─── Runtime-granted attributes count toward the same filters ────────────────

describe("granted attributes (GRANT_ATTRIBUTE) flow into attribute filters", () => {
  it("a Strike attacker granted Slash triggers OP08-114's Slash protection", () => {
    const scope = firstProhibitionScope(OP08_114_S_HAWK);
    const { state, cardDb } = buildScene({
      attackerAttributes: ["Strike"],
      scope,
      activeEffects: [grantAttributeEffect(ATTACKER_ID, "SLASH", 0)],
    });
    expect(isRemovalProhibited(state, TARGET_ID, battleKO, cardDb)).toBe(true);
  });

  it("an attacker granted Special can K.O. P-025 Smoker (attribute_not sees grants)", () => {
    const scope = firstProhibitionScope(P_025_SMOKER);
    const { state, cardDb } = buildScene({
      attackerAttributes: ["Strike"],
      scope,
      activeEffects: [grantAttributeEffect(ATTACKER_ID, "SPECIAL", 0)],
    });
    expect(isRemovalProhibited(state, TARGET_ID, battleKO, cardDb)).toBe(false);
  });

  it("OP15-093's encoded grant makes its target match a Slash attribute filter", () => {
    const grant = actionByType(OP15_093_THE_RISKY_BROTHERS, "GRANT_ATTRIBUTE");
    const grantedAttribute = (grant.params as { attribute: string }).attribute;

    const { state, cardDb } = buildScene({
      attackerAttributes: ["Strike"],
      scope: { cause: "BATTLE" },
      activeEffects: [grantAttributeEffect(ATTACKER_ID, grantedAttribute, 0)],
    });
    const attacker = state.players[0].characters[0] as CardInstance;

    expect(hasGrantedAttribute(attacker, "SLASH", state, cardDb)).toBe(true);
    expect(matchesFilter(attacker, { attribute: "SLASH" }, cardDb, state)).toBe(true);
    expect(matchesFilter(attacker, { attribute_not: "SLASH" }, cardDb, state)).toBe(false);
  });
});

// ─── EB03-014 Kuina — GIVE_DON target narrowed to a Slash leader ──────────────

describe("EB03-014 Kuina targets only a Slash attribute Leader", () => {
  function giveDonTargets(leaderAttributes: string[]): string[] {
    const { state, cardDb } = buildScene({
      attackerAttributes: [],
      scope: { cause: "BATTLE" },
      leaderAttributes,
    });
    const giveDon = actionByType(EB03_014_KUINA, "GIVE_DON");
    return computeAllValidTargets(state, giveDon.target, 0, cardDb, ATTACKER_ID, new Map());
  }

  it("resolves to the leader when the leader has the Slash attribute", () => {
    expect(giveDonTargets(["Slash"])).toEqual(["leader-0"]);
  });

  it("resolves to no targets when the leader lacks the Slash attribute", () => {
    expect(giveDonTargets(["Strike"])).toEqual([]);
  });
});
