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
 * made it satisfy "K.O. a Character with a cost of 4 or less" — and a
 * printed-cost-4 deck card matched "play a cost-3 from your deck". Reads now
 * use layers 0–2 in every zone (one-time discounts modify what you PAY,
 * never the card's cost property); cards actually in hand additionally keep
 * their continuous while-in-hand self-reductions.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeOneTimeModifier } from "../engine/effect-types.js";
import { evaluateCondition, matchesFilter, type ConditionContext } from "../engine/conditions.js";
import { validateTargetConstraints } from "../engine/effect-resolver/target-resolver.js";
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

  it("one-time discounts never shift reads in ANY zone (hand/deck/trash)", () => {
    const { state, cardDb } = buildState();
    const mkInstance = (instanceId: string, zone: CardInstance["zone"]): CardInstance => ({
      instanceId,
      cardId: COST5_CHAR.id,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    });
    const inHand = mkInstance("hand-cost5", "HAND");
    const inDeck = mkInstance("deck-cost5", "DECK");
    const inTrash = mkInstance("trash-cost5", "TRASH");
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      hand: [inHand, ...players[0].hand],
      deck: [inDeck, ...players[0].deck],
      trash: [inTrash, ...players[0].trash],
    };
    const s = { ...state, players };
    // The pending −1 "next play from hand" discount modifies what you PAY,
    // not the card's cost property — a printed-cost-4 deck card must not
    // match Oden-style "play a cost-3 from your deck" (review finding).
    expect(getEffectiveCostForRead(inHand, COST5_CHAR, s, cardDb)).toBe(5);
    expect(getEffectiveCostForRead(inDeck, COST5_CHAR, s, cardDb)).toBe(5);
    expect(getEffectiveCostForRead(inTrash, COST5_CHAR, s, cardDb)).toBe(5);
    expect(matchesFilter(inDeck, { cost_exact: 4 }, cardDb, s)).toBe(false);
    // The play-cost path still sees the discount (what you'd actually pay).
    expect(getEffectiveCost(COST5_CHAR, s, inHand.instanceId, cardDb)).toBe(4);
  });

  it("continuous while-in-hand self-reductions still shift hand reads", () => {
    const cardDb = createTestCardDb();
    const handReducer: CardData = {
      ...COST5_CHAR,
      id: "HAND-REDUCER",
      name: "Hand Reducer",
      effectSchema: {
        effects: [{
          id: "hand_cost_reduction",
          category: "permanent",
          zone: "HAND",
          modifiers: [{ type: "MODIFY_COST", params: { amount: -2 } }],
        }],
      } as never,
    };
    cardDb.set(handReducer.id, handReducer);
    let state = createBattleReadyState(cardDb);
    const inHand: CardInstance = {
      instanceId: "hand-reducer-1",
      cardId: handReducer.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], hand: [inHand, ...players[0].hand] };
    state = { ...state, players };
    // Continuous hand-zone reductions ARE the card's cost while in hand.
    expect(getEffectiveCostForRead(inHand, handReducer, state, cardDb)).toBe(3);
  });

  it("STAGE and SET_COST field reads exclude pending discounts too", () => {
    const cardDb = createTestCardDb();
    const stageCard: CardData = { ...COST5_CHAR, id: "STAGE5", name: "Cost Five", type: "Stage", power: null };
    cardDb.set(stageCard.id, stageCard);
    let state = createBattleReadyState(cardDb);
    const stage: CardInstance = {
      instanceId: "stage-0-c5",
      cardId: stageCard.id,
      zone: "STAGE",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], stage };
    state = { ...state, players, oneTimeModifiers: [pendingDiscount() as never] };
    expect(getEffectiveCostForRead(stage, stageCard, state, cardDb)).toBe(5);

    // SET_COST aura on a field character: layer 1 applies, discount doesn't.
    const { state: charState, cardDb: db2, onField } = buildState();
    const setter = {
      id: "aura-set-cost-2",
      sourceCardInstanceId: "aura-source",
      sourceEffectBlockId: "",
      category: "permanent",
      modifiers: [{ type: "SET_COST", params: { value: 2 } }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: 0,
      appliesTo: ["char-0-cost5"],
      timestamp: 0,
    };
    const withSetter = { ...charState, activeEffects: [...charState.activeEffects, setter as never] };
    expect(matchesFilter(onField, { cost_exact: 2 }, db2, withSetter)).toBe(true);
  });

  it("aggregate cost constraints read the undiscounted field cost", () => {
    const { state, cardDb, onField } = buildState();
    // "total cost of selected Characters ≤ 4": the pending −1 must not let
    // the cost-5 character squeeze under the threshold (review finding —
    // pins the target-resolver hunk).
    const target = {
      type: "CHARACTER",
      controller: "SELF",
      count: { up_to: 2 },
      aggregate_constraint: { property: "cost", operator: "<=", value: 4 },
    } as never;
    expect(validateTargetConstraints([onField.instanceId], target, state, cardDb)).toBe(false);
    const bigger = {
      type: "CHARACTER",
      controller: "SELF",
      count: { up_to: 2 },
      aggregate_constraint: { property: "cost", operator: "<=", value: 5 },
    } as never;
    expect(validateTargetConstraints([onField.instanceId], bigger, state, cardDb)).toBe(true);
  });
});
