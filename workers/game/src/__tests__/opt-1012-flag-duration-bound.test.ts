/**
 * OPT-1012: a resolved negation's WHILE_CONDITION duration is read with that
 * same negation set aside (docs/game-engine/NEGATION-SCOPE.md §5).
 *
 * Before this fix, a condition that read the negated card's own effective
 * keyword, power, or cost re-entered the flag query and overflowed the stack.
 * No authored card produces a WHILE_CONDITION NEGATE_EFFECTS today (20 authored
 * producers use THIS_TURN; OP13-064 is a permanent aura), so these are
 * synthetic controls driven through the production NEGATE_EFFECTS handler.
 */
import { describe, expect, it, vi } from "vitest";
import type { Condition, TargetFilter } from "../engine/effect-types.js";
import { getEffectivePower, getEffectiveCostForRead, isCardNegated, isEffectConditionMet } from "../engine/modifiers.js";
import { canAttackThisTurn, hasEffectiveKeyword } from "../engine/keywords.js";
import { evaluateWhileConditions } from "../engine/duration-tracker.js";
import { stripInactiveEffects } from "../session/visibility.js";
import { CARDS } from "./helpers.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const onOpponentField = (filter: TargetFilter): Condition => ({ type: "CARD_ON_FIELD", controller: "OPPONENT", filter });

/** Player 0 resolves a NEGATE_EFFECTS lasting while `condition` holds. */
function negateWhile(r: Rig, targetId: string, condition: Condition, controller: "SELF" | "OPPONENT" = "OPPONENT") {
  const name = `SYN-while-negator-${r.state.activeEffects.length}`;
  const event = r.put(name, 0, "HAND", {
    data: { cost: 0, type: "Event", effectText: "[Main] Resolve this effect." },
    schema: synSchema(name, [{ id: "negate", category: "auto", trigger: { keyword: "MAIN_EVENT" }, actions: [{
      type: "NEGATE_EFFECTS",
      target: { type: "CHARACTER", controller, count: { up_to: 1 } },
      duration: { type: "WHILE_CONDITION", condition },
    }] }], "Event"),
  });
  r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
  expect(r.promptType()).toBe("SELECT_TARGET");
  r.select([targetId]);
  const flag = r.state.activeEffects.at(-1)!;
  expect(flag.modifiers[0].type).toBe("NEGATE_EFFECTS_FLAG");
  return flag;
}

function rushTarget(r: Rig, owner: 0 | 1 = 1) {
  const card = r.put(`SYN-rush-${owner}`, owner, "CHARACTER", {
    data: { ...CARDS.RUSH, id: `SYN-rush-${owner}`, power: 4000, cost: 3 },
    schema: synSchema(`SYN-rush-${owner}`, [
      { id: "rush", category: "permanent", flags: { keywords: ["RUSH"] } },
      { id: "printed", category: "permanent", modifiers: [
        { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } },
        { type: "MODIFY_COST", target: { type: "SELF" }, params: { amount: 2 } },
      ] },
    ]),
  });
  card.turnPlayed = r.state.turn.number;
  return card;
}

function everyPublicQuery(r: Rig, card: ReturnType<typeof rushTarget>) {
  const data = r.db.get(card.cardId)!;
  return {
    negated: isCardNegated(card, r.state, r.db),
    rush: hasEffectiveKeyword(card, data, "RUSH", r.state, r.db),
    canAttack: canAttackThisTurn(card, data, r.state, r.db),
    power: getEffectivePower(card, data, r.state, r.db),
    cost: getEffectiveCostForRead(card, data, r.state, r.db),
  };
}

const NEGATED = { negated: true, rush: false, canAttack: false, power: 4000, cost: 3 };
const LIVE = { negated: false, rush: true, canAttack: true, power: 5000, cost: 5 };

describe("OPT-1012 self-referential resolved-negation duration", () => {
  it.each<[string, TargetFilter]>([
    ["keyword", { card_type: "CHARACTER", keywords: ["RUSH"] }],
    ["power", { card_type: "CHARACTER", power_min: 5000 }],
    ["cost", { card_type: "CHARACTER", cost_min: 5 }],
  ])("reads its own %s condition with itself set aside, at every public query", (_, filter) => {
    const r = rig();
    const target = rushTarget(r);
    expect(everyPublicQuery(r, target)).toEqual(LIVE);
    const flag = negateWhile(r, target.instanceId, onOpponentField(filter));
    expect(everyPublicQuery(r, target)).toEqual(NEGATED);
    // Step-6 expiry and the visible view agree with the query answer.
    expect(evaluateWhileConditions(r.state, r.db).activeEffects).toContainEqual(flag);
    expect(stripInactiveEffects(r.state, r.db).activeEffects).toContainEqual(flag);
    expect(isEffectConditionMet(flag, r.state, r.db)).toBe(true);
    expect(everyPublicQuery(r, target)).toEqual(NEGATED);
  });

  it("sets aside only the flag being decided, not every negation of that card", () => {
    const r = rig();
    const target = rushTarget(r);
    const selfRef = negateWhile(r, target.instanceId, onOpponentField({ card_type: "CHARACTER", keywords: ["RUSH"] }));
    // A second, unconditional negation of the same card stays in view while
    // the first flag's condition is read, so that condition is false.
    const event = r.put("SYN-this-turn-negator", 0, "HAND", {
      data: { cost: 0, type: "Event", effectText: "[Main] Resolve this effect." },
      schema: synSchema("SYN-this-turn-negator", [{ id: "negate", category: "auto", trigger: { keyword: "MAIN_EVENT" }, actions: [{
        type: "NEGATE_EFFECTS", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } }, duration: { type: "THIS_TURN" },
      }] }], "Event"),
    });
    r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    r.select([target.instanceId]);
    expect(isEffectConditionMet(selfRef, r.state, r.db)).toBe(false);
    expect(everyPublicQuery(r, target)).toEqual(NEGATED);
    // Step 6 retires the self-referential flag; the THIS_TURN one keeps the card negated.
    r.state = evaluateWhileConditions(r.state, r.db);
    expect(r.state.activeEffects.some((e) => e.id === selfRef.id)).toBe(false);
    expect(everyPublicQuery(r, target)).toEqual(NEGATED);
  });

  it("terminates for two flags whose conditions read each other's targets", () => {
    const r = rig();
    const a = rushTarget(r, 1);
    const b = r.put("SYN-rush-b", 1, "CHARACTER", { data: { ...CARDS.RUSH, id: "SYN-rush-b" } });
    // Each flag lasts while some opposing Character still has Rush.
    const rush = onOpponentField({ card_type: "CHARACTER", keywords: ["RUSH"] });
    negateWhile(r, a.instanceId, rush);
    negateWhile(r, b.instanceId, rush);
    const bData = r.db.get(b.cardId)!;
    expect(() => isCardNegated(a, r.state, r.db)).not.toThrow();
    expect(() => hasEffectiveKeyword(b, bData, "RUSH", r.state, r.db)).not.toThrow();
    expect(() => evaluateWhileConditions(r.state, r.db)).not.toThrow();
  });

  it("keeps ordinary resolved behavior: source-independent, ends when its condition ends", () => {
    const r = rig();
    const target = rushTarget(r);
    const anchor = r.put("SYN-anchor", 0, "CHARACTER", { data: { cost: 6 } });
    const flag = negateWhile(r, target.instanceId, { type: "CARD_ON_FIELD", controller: "SELF", filter: { card_type: "CHARACTER", cost_min: 6 } });
    // The flag's source Event is already in the trash: source removal does
    // not end an already-resolved negation.
    expect(r.state.players[0].trash.some((c) => c.cardId.startsWith("SYN-while-negator"))).toBe(true);
    expect(everyPublicQuery(r, target)).toEqual(NEGATED);
    // Negating the condition's anchor does not end it either (its cost stays 6).
    negateWhile(r, anchor.instanceId, { type: "IS_MY_TURN", controller: "SELF" }, "SELF");
    expect(isCardNegated(anchor, r.state, r.db)).toBe(true);
    expect(everyPublicQuery(r, target)).toEqual(NEGATED);
    // Removing the anchor ends the condition: step 6 removes the flag.
    r.state.players[0].characters = r.state.players[0].characters.map((c) => c?.instanceId === anchor.instanceId ? null : c);
    expect(everyPublicQuery(r, target)).toEqual(LIVE);
    r.state = evaluateWhileConditions(r.state, r.db);
    expect(r.state.activeEffects.some((e) => e.id === flag.id)).toBe(false);
  });

  it("cleans up its guard after a query throws mid-condition", () => {
    const r = rig();
    const target = rushTarget(r);
    negateWhile(r, target.instanceId, onOpponentField({ card_type: "CHARACTER", keywords: ["RUSH"] }));
    const originalGet = r.db.get.bind(r.db);
    // The flag loop reads no card data before its condition, so the first read
    // of the target's data happens with the flag set aside.
    const get = vi.spyOn(r.db, "get").mockImplementation((id) => {
      if (id === target.cardId) throw Error("synthetic query failure");
      return originalGet(id);
    });
    expect(() => isCardNegated(target, r.state, r.db)).toThrow("synthetic query failure");
    get.mockRestore();
    // A leaked exclusion would leave the flag set aside and report "not negated".
    expect(everyPublicQuery(r, target)).toEqual(NEGATED);
  });
});
