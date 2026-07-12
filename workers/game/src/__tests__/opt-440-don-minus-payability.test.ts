/**
 * OPT-440 — DON_MINUS triggers offered but unpayable: life card trashed with
 * no effect.
 *
 * `isCostPayable("DON_MINUS")` counts cost-area + attached DON!! (the whole
 * field, per Comprehensive Rules 8-3-1-6 / 10-2-10-1), but `payCosts` could
 * only take cost-area DON!! and returned null otherwise. A defender with
 * 0 cost-area DON!! and DON!! attached to their Leader would be OFFERED a
 * DON!!−X trigger (canOfferTrigger → true), reveal it, have the life card
 * trashed — and then the cost payment failed, skipping the effect entirely.
 * Affected cards: EB01-035, EB01-038, OP04-064–069, OP05-073, OP08-068,
 * OP12-075.
 *
 * The fix makes payCosts pay DON_MINUS from the same field-wide pool that
 * isCostPayable predicts: cost area first (array order, matching the
 * historical preference), then attached DON!! — Leader first, then
 * Characters in field order. This is a deterministic auto-pick; per the
 * rules the player may select any field DON!!, but wiring a selection
 * prompt into the synchronous trigger-reveal cost path is deferred (see
 * cost-handler.ts DON_MINUS comment).
 */

import { describe, it, expect } from "vitest";
import type { CardData, DonInstance, GameState, PlayerState } from "../types.js";
import type { Cost, EffectSchema } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS } from "./helpers.js";
import {
  canOfferTrigger,
  continueEffectDamageSequence,
  executeRevealTrigger,
} from "../engine/battle.js";
import { payCosts, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import { getEffectivePower } from "../engine/modifiers.js";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[idx] = { ...newPlayers[idx], ...patch };
  return { ...state, players: newPlayers };
}

function don(instanceId: string, attachedTo: string | null = null): DonInstance {
  return { instanceId, state: "ACTIVE", attachedTo } as DonInstance;
}

/** Attach `count` DON!! to player `idx`'s Leader. */
function withLeaderDon(state: GameState, idx: 0 | 1, count: number): GameState {
  const leader = state.players[idx].leader;
  const attached = Array.from({ length: count }, (_, i) =>
    don(`don-att-leader-${idx}-${i}`, leader.instanceId),
  );
  return withPlayer(state, idx, { leader: { ...leader, attachedDon: attached } });
}

/** Attach `count` DON!! to player `idx`'s character at slot `slot`. */
function withCharacterDon(state: GameState, idx: 0 | 1, slot: number, count: number): GameState {
  const chars = [...state.players[idx].characters] as PlayerState["characters"];
  const char = chars[slot];
  if (!char) throw new Error(`no character in slot ${slot}`);
  const attached = Array.from({ length: count }, (_, i) =>
    don(`don-att-char-${idx}-${slot}-${i}`, char.instanceId),
  );
  chars[slot] = { ...char, attachedDon: attached };
  return withPlayer(state, idx, { characters: chars });
}

/** EB01-035/OP04-064-like: [Trigger] DON!!−X: Draw 1 card. */
function donMinusTriggerCard(cardDb: Map<string, CardData>, amount: number): CardData {
  const schema: EffectSchema = {
    card_id: "EVENT-DONMINUS",
    card_name: "Don Minus Trigger",
    card_type: "Event",
    effects: [
      {
        id: "trigger_don_minus_draw",
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        costs: [{ type: "DON_MINUS", amount }],
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  } as EffectSchema;
  const card: CardData = {
    ...CARDS.VANILLA,
    id: "EVENT-DONMINUS",
    name: "Don Minus Trigger",
    type: "Event",
    keywords: { ...CARDS.VANILLA.keywords, trigger: true },
    effectSchema: schema as never,
  };
  cardDb.set(card.id, card);
  return card;
}

const DON_MINUS_1: Cost = { type: "DON_MINUS", amount: 1 };

describe("OPT-440 (a): 0 cost-area DON!! + attached DON!! — offered AND payable", () => {
  it("canOfferTrigger is true with only Leader-attached DON!!", () => {
    const cardDb = createTestCardDb();
    const card = donMinusTriggerCard(cardDb, 1);
    let state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [] });
    state = withLeaderDon(state, 0, 1);

    expect(canOfferTrigger(state, card.id, cardDb, 0, "life-donminus")).toBe(true);
  });

  it("payCosts succeeds by detaching the Leader's DON!! back to the DON!! deck", () => {
    const cardDb = createTestCardDb();
    let state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [] });
    state = withLeaderDon(state, 0, 1);
    const donDeckBefore = state.players[0].donDeck.length;

    const result = payCosts(state, [DON_MINUS_1], 0, cardDb, "life-donminus");

    expect(result).not.toBeNull();
    const p0 = result!.state.players[0];
    expect(p0.leader.attachedDon).toHaveLength(0);
    expect(p0.donCostArea).toHaveLength(0);
    expect(p0.donDeck).toHaveLength(donDeckBefore + 1);
    // Returned DON!! goes back active and unattached
    const returned = p0.donDeck[p0.donDeck.length - 1];
    expect(returned.state).toBe("ACTIVE");
    expect(returned.attachedTo).toBeNull();
  });

  it("end-to-end: revealed DON!!−1 trigger detaches, pays, and resolves the effect", () => {
    const cardDb = createTestCardDb();
    const card = donMinusTriggerCard(cardDb, 1);
    // Player 1 is active; player 0 is the defender taking effect damage with
    // 0 cost-area DON!! and 1 DON!! still attached to their Leader from their
    // previous turn — the exact OPT-440 repro.
    let state = createBattleReadyState(cardDb);
    state = { ...state, turn: { ...state.turn, activePlayerIndex: 1 } };
    state = withPlayer(state, 0, {
      donCostArea: [],
      life: [{ instanceId: "life-donminus", cardId: card.id, face: "DOWN" }],
    });
    state = withLeaderDon(state, 0, 1);
    const donDeckBefore = state.players[0].donDeck.length;
    const handBefore = state.players[0].hand.length;

    const damage = continueEffectDamageSequence(state, cardDb, 0, 1, "damage-source", 1);
    expect(damage.state.turn.pendingTriggerFromEffect?.lifeCard.instanceId).toBe("life-donminus");

    const reveal = executeRevealTrigger(damage.state, true, cardDb);
    const p0 = reveal.state.players[0];
    // Life card trashed (trigger activated), NOT lost for nothing:
    expect(p0.trash.some((c) => c.instanceId === "life-donminus")).toBe(false);
    // Cost actually paid — Leader's DON!! returned to the DON!! deck:
    expect(p0.leader.attachedDon).toHaveLength(0);
    expect(p0.donDeck).toHaveLength(donDeckBefore + 1);
    // Effect resolved — the draw happened:
    expect(p0.hand).toHaveLength(handBefore + 1);
  });
});

describe("OPT-440 (b): truly unpayable — trigger not offered", () => {
  it("canOfferTrigger is false when total field DON!! < X", () => {
    const cardDb = createTestCardDb();
    const card = donMinusTriggerCard(cardDb, 1);
    const state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [] });

    expect(canOfferTrigger(state, card.id, cardDb, 0, "life-donminus")).toBe(false);
  });

  it("isCostPayable and payCosts agree on the unpayable case", () => {
    const cardDb = createTestCardDb();
    let state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [don("don-only")] });
    state = withLeaderDon(state, 0, 1);
    const cost: Cost = { type: "DON_MINUS", amount: 3 };

    expect(isCostPayable(state, cost, 0, cardDb, "src")).toBe(false);
    expect(payCosts(state, [cost], 0, cardDb, "src")).toBeNull();
  });
});

describe("OPT-440 (c): mixed cost-area + attached payment", () => {
  it("pays DON!!−3 from 1 cost-area + 1 Leader + 1 Character DON!!", () => {
    const cardDb = createTestCardDb();
    let state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [don("don-cost-0")] });
    state = withLeaderDon(state, 0, 1);
    state = withCharacterDon(state, 0, 0, 1);
    const donDeckBefore = state.players[0].donDeck.length;
    const cost: Cost = { type: "DON_MINUS", amount: 3 };

    expect(isCostPayable(state, cost, 0, cardDb, "src")).toBe(true);
    const result = payCosts(state, [cost], 0, cardDb, "src");

    expect(result).not.toBeNull();
    const p0 = result!.state.players[0];
    expect(p0.donCostArea).toHaveLength(0);
    expect(p0.leader.attachedDon).toHaveLength(0);
    expect(p0.characters[0]!.attachedDon).toHaveLength(0);
    expect(p0.donDeck).toHaveLength(donDeckBefore + 3);
  });

  it("deterministic order: cost area first, then Leader, then Characters", () => {
    const cardDb = createTestCardDb();
    // 1 cost-area + 1 Leader + 1 Character, paying DON!!−2: the cost-area
    // DON!! and the Leader's DON!! go back; the Character keeps its buff.
    let state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [don("don-cost-0")] });
    state = withLeaderDon(state, 0, 1);
    state = withCharacterDon(state, 0, 0, 1);

    const result = payCosts(state, [{ type: "DON_MINUS", amount: 2 }], 0, cardDb, "src");

    expect(result).not.toBeNull();
    const p0 = result!.state.players[0];
    expect(p0.donCostArea).toHaveLength(0);
    expect(p0.leader.attachedDon).toHaveLength(0);
    expect(p0.characters[0]!.attachedDon).toHaveLength(1);
  });

  it("cost area is exhausted before any DON!! detaches", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb); // p0 has 8 cost-area DON!!
    state = withLeaderDon(state, 0, 1);

    const result = payCosts(state, [DON_MINUS_1], 0, cardDb, "src");

    expect(result).not.toBeNull();
    const p0 = result!.state.players[0];
    expect(p0.donCostArea).toHaveLength(7);
    expect(p0.leader.attachedDon).toHaveLength(1);
  });
});

describe("OPT-440 (d): detaching for the cost removes the +1000 DON!! buff", () => {
  it("character loses 1000 power when its attached DON!! pays the cost", () => {
    const cardDb = createTestCardDb();
    // Player 0's turn (owner's turn — DON!! bonus applies), 0 cost-area DON!!.
    let state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [] });
    state = withCharacterDon(state, 0, 0, 1);
    const charBefore = state.players[0].characters[0]!;
    const cardData = cardDb.get(charBefore.cardId)!;
    const powerBefore = getEffectivePower(charBefore, cardData, state, cardDb);
    expect(powerBefore).toBe((cardData.power ?? 0) + 1000);

    const result = payCosts(state, [DON_MINUS_1], 0, cardDb, "src");

    expect(result).not.toBeNull();
    const charAfter = result!.state.players[0].characters[0]!;
    const powerAfter = getEffectivePower(charAfter, cardData, result!.state, cardDb);
    expect(powerAfter).toBe(cardData.power ?? 0);
    expect(powerAfter).toBe(powerBefore - 1000);
  });
});

describe("OPT-440: active-only DON_MINUS still restricted to the cost area", () => {
  it("attached DON!! cannot satisfy a filter requiring active cost-area DON!!", () => {
    const cardDb = createTestCardDb();
    let state = withPlayer(createBattleReadyState(cardDb), 0, { donCostArea: [] });
    state = withLeaderDon(state, 0, 2);
    const cost: Cost = { type: "DON_MINUS", amount: 1, filter: { is_active: true } } as Cost;

    expect(isCostPayable(state, cost, 0, cardDb, "src")).toBe(false);
    expect(payCosts(state, [cost], 0, cardDb, "src")).toBeNull();
  });
});

describe("OPT-440: payability invariant — payCosts succeeds iff isCostPayable", () => {
  it.each([
    { name: "0 cost, 0 attached, X=1", cost: 0, leader: 0, char: 0, amount: 1 },
    { name: "0 cost, 1 leader, X=1", cost: 0, leader: 1, char: 0, amount: 1 },
    { name: "0 cost, 2 char, X=2", cost: 0, leader: 0, char: 2, amount: 2 },
    { name: "1 cost, 1 leader, X=2", cost: 1, leader: 1, char: 0, amount: 2 },
    { name: "1 cost, 1 leader, 1 char, X=4", cost: 1, leader: 1, char: 1, amount: 4 },
    { name: "2 cost, 0 attached, X=2", cost: 2, leader: 0, char: 0, amount: 2 },
  ])("$name", ({ cost, leader, char, amount }) => {
    const cardDb = createTestCardDb();
    let state = withPlayer(createBattleReadyState(cardDb), 0, {
      donCostArea: Array.from({ length: cost }, (_, i) => don(`don-cost-${i}`)),
    });
    if (leader > 0) state = withLeaderDon(state, 0, leader);
    if (char > 0) state = withCharacterDon(state, 0, 0, char);
    const c: Cost = { type: "DON_MINUS", amount };

    const payable = isCostPayable(state, c, 0, cardDb, "src");
    const paid = payCosts(state, [c], 0, cardDb, "src");
    expect(paid !== null).toBe(payable);
  });
});
