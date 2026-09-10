import { describe, expect, it } from "vitest";
import { transitionCard } from "../engine/zone-transition.js";
import { expireEndOfTurnEffects } from "../engine/duration-tracker.js";
import { executeSwapBasePower } from "../engine/effect-resolver/actions/modifiers.js";
import { matchesFilter } from "../engine/conditions.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { registerPermanentEffectsForCard } from "../engine/triggers.js";
import { OP17_112_CHARLOTTE_LINLIN } from "../engine/schemas/op17.js";
import { CARDS, createBattleReadyState, createTestCardDb } from "./helpers.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";

function fixture() {
  const cardDb = createTestCardDb();
  let state = createBattleReadyState(cardDb);
  const card = state.players[0].characters[0]!;
  const data = { ...CARDS.VANILLA, id: "base-target", power: 4000, keywords: { ...CARDS.VANILLA.keywords, trigger: true } };
  card.cardId = data.id;
  cardDb.set(data.id, data);
  const setter = (value: number): RuntimeActiveEffect => ({
    id: `setter-${value}`, sourceCardInstanceId: state.players[0].leader.instanceId,
    sourceEffectBlockId: "setter", category: "auto", controller: 0,
    modifiers: [{ type: "SET_POWER", params: { value } }],
    duration: { type: "THIS_TURN" }, expiresAt: { wave: "END_OF_TURN", turn: state.turn.number }, appliesTo: [card.instanceId], timestamp: 1,
  });
  const addLinlin = () => {
    const source = { ...card, instanceId: "linlin", cardId: "OP17-112", attachedDon: [] };
    const sourceData = { ...CARDS.VANILLA, id: "OP17-112", name: "Charlotte Linlin", cost: 10, power: 12000, counter: null, color: ["Yellow"], types: ["The Four Emperors", "Big Mom Pirates"], attribute: ["Special"], effectText: "[Your Turn] The base power of all of your Characters with a [Trigger] and 4000 base power becomes 8000.\n[On Play] Draw 1 card, then choose one: add up to 1 card from the top of your deck to the top of your Life cards, or add up to 1 card from the top of your opponent’s Life cards to the owner’s hand.", effectSchema: OP17_112_CHARLOTTE_LINLIN };
    cardDb.set(sourceData.id, sourceData);
    state.players[0].characters[1] = source;
    state = registerPermanentEffectsForCard(state, source, sourceData);
    return state;
  };
  return { state, card, data, cardDb, setter, addLinlin };
}

describe("OPT-833 changed field base power", () => {
  it.each([[8000], [2000], [6000, 8000], [8000, 6000]])("uses setting %j in field base filters", (...values: number[]) => {
    const { state, card, cardDb, setter } = fixture();
    state.activeEffects = values.map(setter);
    const expected = values.includes(8000) ? 8000 : 2000;
    expect(matchesFilter(card, { base_power_exact: expected }, cardDb, state)).toBe(true);
    expect(matchesFilter(card, { base_power_exact: 4000 }, cardDb, state)).toBe(false);
    expect(matchesFilter({ ...card, zone: "TRASH" }, { base_power_exact: 4000 }, cardDb, state)).toBe(true);
  });

  it("separates changed base from additive and DON power", () => {
    const { state, card, cardDb, data, setter } = fixture();
    const buff = setter(0);
    buff.modifiers = [{ type: "MODIFY_POWER", params: { amount: 2000 } }];
    card.attachedDon = [{ instanceId: "don", state: "ACTIVE", attachedTo: card.instanceId }];
    state.activeEffects = [setter(8000), buff];
    expect(getEffectivePower(card, data, state, cardDb)).toBe(11000);
    expect(matchesFilter(card, { base_power_exact: 8000, power_exact: 11000 }, cardDb, state)).toBe(true);
    expect(matchesFilter(card, { base_power_exact: 11000 }, cardDb, state)).toBe(false);
  });

  it.each([false, true])("authored Linlin is stable and visible to a downstream aura (reverse %s)", (reverse) => {
    const { card, cardDb, data, setter, addLinlin } = fixture();
    const state = addLinlin();
    const downstream = setter(0);
    downstream.modifiers = [{ type: "MODIFY_POWER", target: { type: "CHARACTER", controller: "SELF", filter: { base_power_exact: 8000 } }, params: { amount: 1000 } }];
    downstream.appliesTo = [];
    state.activeEffects.push(downstream);
    if (reverse) state.activeEffects.reverse();
    for (let i = 0; i < 5; i++) {
      expect(matchesFilter(card, { base_power_exact: 8000 }, cardDb, state)).toBe(true);
      expect(matchesFilter(card, { base_power_exact: 4000 }, cardDb, state)).toBe(false);
      expect(getEffectivePower(card, data, state, cardDb)).toBe(9000);
    }
    const resumed = JSON.parse(JSON.stringify(state));
    expect(getEffectivePower(card, data, resumed, cardDb)).toBe(9000);
    resumed.turn.activePlayerIndex = 1;
    expect(getEffectivePower(card, data, resumed, cardDb)).toBe(4000);
  });
});

describe("OPT-833 aura lifecycle", () => {
  it.each([2, 3, 4])("%i copies of Linlin cannot cancel the same setting, including after storage", (copies) => {
    const { card, cardDb, data, addLinlin } = fixture();
    let state = addLinlin();
    for (let i = 1; i < copies; i++) {
      const source = { ...state.players[0].characters[1]!, instanceId: `linlin-${i}` };
      state.players[0].characters[i + 1] = source;
      state = registerPermanentEffectsForCard(state, source, cardDb.get(source.cardId)!);
    }
    state = JSON.parse(JSON.stringify(state));
    expect(getEffectivePower(card, data, state, cardDb)).toBe(8000);
    for (let i = 1; i <= copies; i++) {
      state = transitionCard(state, state.players[0].characters[i]!.instanceId, "TRASH")!.state;
      expect(getEffectivePower(card, data, state, cardDb)).toBe(i < copies ? 8000 : 4000);
    }
  });

  it("recomputes for invalidated sources, controller and Trigger eligibility", () => {
    const { card, cardDb, data, setter, addLinlin } = fixture();
    const state = addLinlin();
    const negation = setter(0);
    negation.modifiers = [{ type: "NEGATE_EFFECTS_FLAG" }];
    negation.appliesTo = ["linlin"];
    state.activeEffects.push(negation);
    expect(getEffectivePower(card, data, state, cardDb)).toBe(4000);
    state.activeEffects.pop();
    expect(getEffectivePower(card, data, state, cardDb)).toBe(8000);
    const other = { ...card, controller: 1 as const, owner: 1 as const };
    expect(getEffectivePower(other, data, state, cardDb)).toBe(4000);
    cardDb.set(data.id, { ...data, keywords: { ...data.keywords, trigger: false } });
    expect(getEffectivePower(card, cardDb.get(data.id)!, state, cardDb)).toBe(4000);
  });

  it("swap captures both changed bases first, retains higher old setting and expires normally", () => {
    const { state, card, cardDb, data, setter } = fixture();
    const other = { ...card, instanceId: "other" };
    state.players[0].characters[1] = other;
    state.activeEffects = [setter(8000)];
    card.attachedDon = [{ instanceId: "attached", state: "ACTIVE", attachedTo: card.instanceId }];
    const swapped = executeSwapBasePower(state, {
      type: "SWAP_BASE_POWER", target: { type: "CHARACTER", controller: "SELF", count: { exact: 2 } },
      duration: { type: "THIS_TURN" },
    }, state.players[0].leader.instanceId, 0, cardDb, new Map(), [card.instanceId, other.instanceId]);
    expect(swapped.succeeded).toBe(true);
    expect(getEffectivePower(card, data, swapped.state, cardDb)).toBe(9000);
    expect(getEffectivePower(other, data, swapped.state, cardDb)).toBe(8000);
    const departed = transitionCard(swapped.state, card.instanceId, "TRASH")!.state;
    expect(getEffectivePower(other, data, departed, cardDb)).toBe(8000);
    expect(getEffectivePower(other, data, expireEndOfTurnEffects(departed), cardDb)).toBe(4000);
  });
});
