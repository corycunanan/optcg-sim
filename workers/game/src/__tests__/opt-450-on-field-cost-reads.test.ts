/**
 * OPT-450 — on-field cost reads must not include pending play-time discounts.
 *
 * getEffectiveCost applies unconsumed one-time "next time you play X"
 * discounts and hand-zone self-reductions regardless of the card's zone
 * (matchesOneTimeFilter has no zone restriction). Two pre-existing read
 * surfaces consumed it for cards already on the field:
 *
 *   - conditions.ts SELF_COST
 *   - conditions.ts cost_exact/cost_min/cost_max/cost_range target filters
 *     (e.g. OP09-098 Black Hole "cost ≤ N")
 *   - target-resolver.ts aggregate cost constraints
 *
 * A pending −1 "next play" modifier matching an on-field cost-5 character
 * made it satisfy "K.O. a Character with a cost of 4 or less". These reads
 * now route through getEffectiveFieldCost when the card is on the field;
 * off-field reads keep the play-cost semantics (hand-zone continuous
 * self-reductions legitimately shift a hand card's cost).
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeOneTimeModifier } from "../engine/effect-types.js";
import { evaluateCondition, matchesFilter, type ConditionContext } from "../engine/conditions.js";
import { getEffectiveCost, getEffectiveCostForRead } from "../engine/modifiers.js";
import { createTestCardDb, createBattleReadyState, padChars } from "./helpers.js";

function noKeywords() {
  return { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false };
}

const COST5_CHAR: CardData = {
  id: "COST5-TGT",
  name: "Cost Five",
  type: "Character",
  color: ["Red"],
  cost: 5,
  power: 6000,
  counter: null,
  life: null,
  attribute: [],
  types: ["Straw Hat Crew"],
  effectText: "",
  triggerText: null,
  keywords: noKeywords(),
  effectSchema: null,
  imageUrl: null,
};

/** Pending "next time you play a [Cost Five], it costs −1" modifier. */
function pendingDiscount(): RuntimeOneTimeModifier {
  return {
    id: "otm-next-play-discount",
    appliesTo: { action: "PLAY_CARD" as never, filter: { name: "Cost Five" } as never },
    modification: { type: "MODIFY_COST", params: { amount: -1 } } as never,
    expires: { type: "THIS_TURN" } as never,
    consumed: false,
    controller: 0,
  };
}

function buildState(): { state: GameState; cardDb: Map<string, CardData>; onField: CardInstance } {
  const cardDb = createTestCardDb();
  cardDb.set(COST5_CHAR.id, COST5_CHAR);
  let state = createBattleReadyState(cardDb);
  const onField: CardInstance = {
    instanceId: "char-0-cost5",
    cardId: COST5_CHAR.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([onField]) };
  state = {
    ...state,
    players,
    oneTimeModifiers: [pendingDiscount() as never],
  };
  return { state, cardDb, onField };
}

describe("OPT-450 — pending play-time discounts and on-field reads", () => {
  it("sanity: the play-cost read still sees the discount", () => {
    const { state, cardDb } = buildState();
    expect(getEffectiveCost(COST5_CHAR, state, "char-0-cost5", cardDb)).toBe(4);
  });

  it("cost_* target filters read the undiscounted field cost", () => {
    const { state, cardDb, onField } = buildState();
    // Pre-fix: the pending −1 made the cost-5 permanent match "cost ≤ 4".
    expect(matchesFilter(onField, { cost_max: 4 }, cardDb, state)).toBe(false);
    expect(matchesFilter(onField, { cost_max: 5 }, cardDb, state)).toBe(true);
    expect(matchesFilter(onField, { cost_exact: 5 }, cardDb, state)).toBe(true);
    expect(matchesFilter(onField, { cost_exact: 4 }, cardDb, state)).toBe(false);
    expect(matchesFilter(onField, { cost_range: { min: 3, max: 4 } }, cardDb, state)).toBe(false);
  });

  it("SELF_COST reads the undiscounted field cost for an on-field source", () => {
    const { state, cardDb } = buildState();
    const ctx: ConditionContext = {
      sourceCardInstanceId: "char-0-cost5",
      controller: 0,
      cardDb,
    };
    expect(evaluateCondition(state, { type: "SELF_COST", operator: "==", value: 5 } as never, ctx)).toBe(true);
    expect(evaluateCondition(state, { type: "SELF_COST", operator: "<=", value: 4 } as never, ctx)).toBe(false);
  });

  it("an on-field SET_COST/MODIFY_COST aura still applies to field reads", () => {
    const { state, cardDb, onField } = buildState();
    // Continuous aura: −2 cost to the card (appliesTo static).
    const aura = {
      id: "aura-cost-minus-2",
      sourceCardInstanceId: "aura-source",
      sourceEffectBlockId: "",
      category: "permanent",
      modifiers: [{ type: "MODIFY_COST", params: { amount: -2 } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-0-cost5"],
      timestamp: 0,
    };
    const withAura = { ...state, activeEffects: [...state.activeEffects, aura as never] };
    // Field read: 5 − 2 (aura) = 3; the pending play discount still excluded.
    expect(matchesFilter(onField, { cost_exact: 3 }, cardDb, withAura)).toBe(true);
  });

  it("off-field reads keep play-cost semantics (zone-aware split)", () => {
    const { state, cardDb } = buildState();
    const inHand: CardInstance = {
      instanceId: "hand-cost5",
      cardId: COST5_CHAR.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], hand: [inHand, ...players[0].hand] };
    const withHand = { ...state, players };
    // Unchanged behavior, pinned deliberately: hand-zone reads still include
    // play-time adjustments (continuous hand reductions belong there; the
    // trash/deck stat-read question is OPT-455's scope).
    expect(getEffectiveCostForRead(inHand, COST5_CHAR, withHand, cardDb)).toBe(4);
    expect(getEffectiveCostForRead(
      { ...inHand, instanceId: "char-0-cost5", zone: "CHARACTER" }, COST5_CHAR, withHand, cardDb,
    )).toBe(5);
  });
});
