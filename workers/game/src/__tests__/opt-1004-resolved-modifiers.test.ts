import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import type { Action, RuntimeActiveEffect } from "../engine/effect-types.js";
import * as actions from "../engine/effect-resolver/actions/modifiers.js";
import { executeSetCost } from "../engine/effect-resolver/actions/effects.js";
import { executeActionChain, resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { getEffectivePower, getEffectiveCost, getEffectiveCostForRead, getEffectiveFieldCost, hasGrantedKeyword, hasGrantedAttribute, isCardNegated, isEffectConditionMet, isModifierConditionMet } from "../engine/modifiers.js";
import { expireEndOfTurnEffects } from "../engine/duration-tracker.js";
import { scanReplacementsForBatch } from "../engine/replacements.js";
import { stripInactiveEffects } from "../session/visibility.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

type Family = "MODIFY_POWER" | "SET_BASE_POWER" | "SET_POWER_TO_ZERO" | "COPY_POWER" | "SWAP_BASE_POWER" | "MODIFY_COST" | "SET_COST" | "GRANT_KEYWORD" | "GRANT_ATTRIBUTE";
const families: Family[] = ["MODIFY_POWER", "SET_BASE_POWER", "SET_POWER_TO_ZERO", "COPY_POWER", "SWAP_BASE_POWER", "MODIFY_COST", "SET_COST", "GRANT_KEYWORD", "GRANT_ATTRIBUTE"];
function fixture(self = false) {
  const r = rig();
  const source = r.put("SYN-resolved-source", 0, "CHARACTER", { data: { name: "Source", power: 4000, cost: 3 } });
  const target = self ? source : r.put("SYN-resolved-target", 0, "CHARACTER", { data: { name: "Target", power: 3000, cost: 3, types: ["Roger Pirates"] } });
  const donor = r.put("SYN-resolved-donor", 0, "CHARACTER", { data: { name: "Donor", power: 7000, types: ["Roger Pirates"] } });
  return { r, source, target, donor };
}
function produce(family: Family, r: Rig, source: CardInstance, target: CardInstance, donor: CardInstance) {
  const priorRows = r.state.activeEffects.length;
  const args = [source.instanceId, 0, r.db, new Map()] as const;
  const picked = { type: "CHARACTER", count: { exact: 1 } } as const;
  let result;
  switch (family) {
    case "MODIFY_POWER": result = actions.executeModifyPower(r.state, { type: family, target: picked, params: { amount: 1000 } }, ...args, [target.instanceId]); break;
    case "SET_BASE_POWER": result = actions.executeSetBasePower(r.state, { type: family, target: picked, params: { value: 6000 } }, ...args, [target.instanceId]); break;
    case "SET_POWER_TO_ZERO": result = actions.executeSetPowerToZero(r.state, { type: family, target: picked }, ...args, [target.instanceId]); break;
    case "COPY_POWER": result = actions.executeCopyPower(r.state, { type: family, target: { ...picked, filter: { name: r.db.get(target.cardId)!.name } }, params: { source_target: picked } }, ...args, [donor.instanceId]); break;
    case "SWAP_BASE_POWER": result = actions.executeSwapBasePower(r.state, { type: family, target: { type: "CHARACTER", count: { exact: 2 } } }, ...args, [target.instanceId, donor.instanceId]); break;
    case "MODIFY_COST": result = actions.executeModifyCost(r.state, { type: family, target: picked, params: { amount: -1 } }, ...args, [target.instanceId]); break;
    case "SET_COST": result = executeSetCost(r.state, { type: family, target: picked, params: { value: 1 } }, ...args, [target.instanceId]); break;
    case "GRANT_KEYWORD": result = actions.executeGrantKeyword(r.state, { type: family, target: picked, params: { keyword: "RUSH" } }, ...args, [target.instanceId]); break;
    case "GRANT_ATTRIBUTE": result = actions.executeGrantAttribute(r.state, { type: family, target: picked, params: { attribute: "SLASH" } }, ...args, [target.instanceId]); break;
  }
  expect(result.succeeded).toBe(true);
  r.state = result.state;
  const rows = r.state.activeEffects.slice(priorRows);
  expect(rows).toHaveLength(family === "SWAP_BASE_POWER" ? 2 : 1);
  rows.forEach(row => expect(row).toMatchObject({ category: "auto", sourceEffectBlockId: "" }));
}
function read(family: Family, r: Rig, target: CardInstance) {
  if (family === "GRANT_KEYWORD") return hasGrantedKeyword(target, "RUSH", r.state, r.db);
  if (family === "GRANT_ATTRIBUTE") return hasGrantedAttribute(target, "SLASH", r.state, r.db);
  if (family === "MODIFY_COST" || family === "SET_COST") return getEffectiveFieldCost(r.db.get(target.cardId)!, r.state, target.instanceId, r.db);
  return getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db);
}
function expected(family: Family, self: boolean) {
  switch (family) {
    case "MODIFY_POWER": return self ? 5000 : 4000;
    case "SET_BASE_POWER": return 6000;
    case "SET_POWER_TO_ZERO": return 0;
    case "COPY_POWER": case "SWAP_BASE_POWER": return 7000;
    case "MODIFY_COST": return 2;
    case "SET_COST": return 1;
    default: return true;
  }
}
function negate(r: Rig, source: CardInstance, kind: "flag" | "Roger") {
  if (kind === "Roger") return r.put("OP13-064", 0, "CHARACTER", { data: { types: ["Roger Pirates"] } });
  r.state = actions.executeNegateEffects(r.state, { type: "NEGATE_EFFECTS", target: { type: "CHARACTER", count: { exact: 1 } } }, r.state.players[1].leader.instanceId, 1, r.db, new Map(), [source.instanceId]).state;
  return source;
}

describe.each(families)("OPT-1004 resolved %s producer", family => {
  it.each(["flag", "Roger"] as const)("survives later %s, source departure and turn expiry", kind => {
    const { r, source, target, donor } = fixture();
    produce(family, r, source, target, donor);
    expect(read(family, r, target)).toBe(expected(family, false));
    negate(r, source, kind);
    expect(isCardNegated(source, r.state, r.db)).toBe(true);
    expect(isCardNegated(target, r.state, r.db)).toBe(false);
    expect(read(family, r, target)).toBe(expected(family, false));
    const rows = r.state.activeEffects.filter(row => row.sourceCardInstanceId === source.instanceId);
    rows.forEach(row => {
      expect(isEffectConditionMet(row, r.state, r.db)).toBe(true);
      expect(isModifierConditionMet(row, row.modifiers![0], r.state, r.db)).toBe(true);
    });
    const move: Action = { type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true }, filter: { name: "Source" } } };
    const returned = executeActionChain(r.state, [move], r.state.players[1].leader.instanceId, 1, r.db);
    expect(returned.pendingPrompt).toBeUndefined(); r.state = returned.state;
    expect(r.state.players[0].characters.some(card => card?.instanceId === source.instanceId)).toBe(false);
    expect(read(family, r, target)).toBe(expected(family, false));
    r.state = expireEndOfTurnEffects(r.state);
    const baseline = family === "GRANT_KEYWORD" || family === "GRANT_ATTRIBUTE" ? false : family === "MODIFY_COST" || family === "SET_COST" ? 3 : 3000;
    expect(read(family, r, target)).toBe(baseline);
  });
  it.each(["flag", "Roger"] as const)("self-target output remains after %s negates its own source", kind => {
    const { r, source, target, donor } = fixture(true);
    produce(family, r, source, target, donor);
    negate(r, source, kind);
    expect(isCardNegated(source, r.state, r.db)).toBe(true);
    expect(read(family, r, target)).toBe(expected(family, true));
    const returned = executeActionChain(r.state, [{ type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true }, filter: { name: "Source" } } }], r.state.players[1].leader.instanceId, 1, r.db);
    r.state = returned.state;
    const fresh = r.state.players[0].hand.find(card => card.cardId === source.cardId)!;
    expect(fresh).toBeDefined(); expect(fresh.instanceId).not.toBe(source.instanceId);
    const baseline = family === "GRANT_KEYWORD" || family === "GRANT_ATTRIBUTE" ? false : family === "MODIFY_COST" || family === "SET_COST" ? 3 : 4000;
    expect(read(family, r, fresh)).toBe(baseline);
  });
});

it.each([false, true])("actual Jinbe WHEN_ATTACKING survives full battle and Roger PLAY; target exempt=%s", exempt => {
  const r = rig();
  const source = r.put("ST01-005", 0, "CHARACTER"); source.turnPlayed = 0;
  source.attachedDon = [{ instanceId: "jinbe-don", state: "ACTIVE", attachedTo: source.instanceId }];
  const target = r.put("SYN-Jinbe-target", 0, "CHARACTER", { data: { power: 3000, types: exempt ? ["Roger Pirates"] : [] } });
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: source.instanceId, targetInstanceId: r.state.players[1].leader.instanceId });
  expect(r.promptType()).toBe("SELECT_TARGET"); r.select([target.instanceId]);
  expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(4000);
  r.act({ type: "PASS" }, 1); r.act({ type: "PASS" }, 1);
  expect(r.state.turn.battle).toBeNull(); expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.eventLog.filter(event => event.type === "BATTLE_RESOLVED")).toHaveLength(1);
  const roger = r.put("OP13-064", 0, "HAND", { data: { cost: 0, types: ["Roger Pirates"] } });
  r.act({ type: "PLAY_CARD", cardInstanceId: roger.instanceId });
  // Resolve Roger's actual DON_MINUS on-play cost before advancing the turn.
  if (r.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") {
    r.act({ type: "PLAYER_CHOICE", choiceId: r.state.pendingPrompt.options.choices[0].id });
  }
  expect(r.state.pendingPrompt).toBeNull();
  expect(isCardNegated(source, r.state, r.db)).toBe(true);
  expect(isCardNegated(target, r.state, r.db)).toBe(!exempt);
  expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(4000);
  r.act({ type: "ADVANCE_PHASE" });
  expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(3000);
});

it.each(["conditions", "block duration", "modifier duration"])("resolved row still honors %s after source negation", gate => {
  const { r, source, target, donor } = fixture(); produce("MODIFY_POWER", r, source, target, donor);
  const row = r.state.activeEffects[0];
  const condition = { type: "IS_MY_TURN", controller: "SELF" } as const;
  if (gate === "conditions") row.conditions = condition;
  else if (gate === "block duration") row.duration = { type: "WHILE_CONDITION", condition };
  else row.modifiers![0].duration = { type: "WHILE_CONDITION", condition };
  negate(r, source, "flag");
  expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(4000);
  r.state.turn.activePlayerIndex = 1;
  expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(3000);
  if (gate !== "modifier duration") expect(isEffectConditionMet(row, r.state, r.db)).toBe(false);
  expect(isModifierConditionMet(row, row.modifiers![0], r.state, r.db)).toBe(false);
});

it.each(["flag", "Roger"] as const)("registered permanent power/cost/keyword/attribute remain source-gated under %s", kind => {
  const r = rig();
  const target = r.put("SYN-permanent-target", 0, "CHARACTER", { data: { power: 3000, cost: 3, types: ["Roger Pirates"] } });
  const hand = r.put("SYN-permanent-hand", 0, "HAND", { data: { type: "Event", cost: 3 } });
  const source = r.put("SYN-real-aura", 0, "CHARACTER", { schema: synSchema("SYN-real-aura", [{ id: "ongoing", category: "permanent", modifiers: [
    { type: "MODIFY_POWER", target: { type: "ALL_YOUR_CHARACTERS", filter: { exclude_self: true } }, params: { amount: 1000 } },
    { type: "MODIFY_COST", target: { type: "ALL_YOUR_CHARACTERS", filter: { exclude_self: true } }, params: { amount: -1 } },
    { type: "GRANT_KEYWORD", target: { type: "ALL_YOUR_CHARACTERS", filter: { exclude_self: true } }, params: { keyword: "RUSH" } },
    { type: "GRANT_ATTRIBUTE", target: { type: "ALL_YOUR_CHARACTERS", filter: { exclude_self: true } }, params: { attribute: "SLASH" } },
  ] }, { id: "ongoing-hand", category: "permanent", modifiers: [{ type: "MODIFY_COST", target: { type: "CARD_IN_HAND", controller: "SELF" }, params: { amount: -1 } }] }] ) });
  const values = () => [getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db), getEffectiveFieldCost(r.db.get(target.cardId)!, r.state, target.instanceId, r.db), getEffectiveCost(r.db.get(hand.cardId)!, r.state, hand.instanceId, r.db), hasGrantedKeyword(target, "RUSH", r.state, r.db), hasGrantedAttribute(target, "SLASH", r.state, r.db)];
  const row = r.state.activeEffects.find(effect => effect.sourceCardInstanceId === source.instanceId)!;
  expect(row).toMatchObject({ category: "permanent", sourceEffectBlockId: "ongoing" });
  expect(values()).toEqual([4000, 2, 2, true, true]);
  const negator = negate(r, source, kind);
  expect(values()).toEqual([3000, 3, 3, false, false]);
  expect(isEffectConditionMet(row, r.state, r.db)).toBe(false);
  if (kind === "flag") r.state = expireEndOfTurnEffects(r.state);
  else negate(r, negator, "flag");
  expect(values()).toEqual([4000, 2, 2, true, true]);
});

it.each(["flag", "Roger"] as const)("registered replacement remains source-dependent under %s and resumes", kind => {
  const r = rig(); const source = r.put("OP08-045", 0, "CHARACTER");
  const scan = () => scanReplacementsForBatch(r.state, [source.instanceId], "WOULD_BE_KO", "effect", 1, r.db, resolverExecutionServices);
  expect(r.state.activeEffects.find(row => row.sourceCardInstanceId === source.instanceId)).toMatchObject({ category: "replacement" });
  expect(scan()).toHaveLength(1); const negator = negate(r, source, kind); expect(scan()).toHaveLength(0);
  if (kind === "flag") r.state = expireEndOfTurnEffects(r.state); else negate(r, negator, "flag");
  expect(scan()).toHaveLength(1);
});

it.each([undefined, "activate", "permanent", "replacement"])("unknown/contradictory category %s with empty block ID retains legacy source gate", category => {
  const { r, source, target, donor } = fixture(); produce("MODIFY_POWER", r, source, target, donor);
  const row = r.state.activeEffects[0];
  if (category === undefined) delete (row as Partial<RuntimeActiveEffect>).category;
  else row.category = category as RuntimeActiveEffect["category"];
  negate(r, source, "flag");
  expect(isEffectConditionMet(row, r.state, r.db)).toBe(false);
  expect(isModifierConditionMet(row, row.modifiers![0], r.state, r.db)).toBe(false);
  expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(3000);
});

it("resolved producer rows retain exact provenance, effective values and display visibility through10 save/reload and mixed undo", async () => {
  const { r, source, target, donor } = fixture(); r.state.schemaVersion = 10; r.state.fieldTrashSemanticsVersion = 8;
  produce("MODIFY_POWER", r, source, target, donor); produce("GRANT_KEYWORD", r, source, target, donor);
  const original = structuredClone(r.state.activeEffects);
  negate(r, source, "flag");
  const current = toPersistedGameState(r.state);
  const prior = toPersistedGameState(rig().state);
  const parsed = parseStoredSession({ state: current, undoHistory: [prior, current], cardDb: Object.fromEntries(r.db), mode: "PVP" });
  expect(parsed.undoHistory.map(state => state.schemaVersion)).toEqual([8, 10]);
  expect(parsed.state.activeEffects.slice(0, 2)).toEqual(original);
  await r.reload();
  expect(stripInactiveEffects(r.state, r.db).activeEffects.slice(0, 2)).toEqual(original);
  expect(getEffectivePower(target, r.db.get(target.cardId)!, r.state, r.db)).toBe(4000);
  expect(hasGrantedKeyword(target, "RUSH", r.state, r.db)).toBe(true);
  const fallback = r.state.activeEffects[0]; fallback.sourceEffectBlockId = "historical-unproven";
  const saved = toPersistedGameState(r.state);
  const reread = parseStoredSession({ state: saved, undoHistory: [saved], cardDb: Object.fromEntries(r.db), mode: "PVP" });
  expect(reread.state.activeEffects[0]).toEqual(fallback);
  expect(isEffectConditionMet(reread.state.activeEffects[0], reread.state, r.db)).toBe(false);
  expect(stripInactiveEffects(reread.state, r.db).activeEffects.some(row => row.id === fallback.id)).toBe(false);
});

it.each(["MODIFY_COST", "SET_COST"] as const)("resolved %s on a hand card survives flag and Roger across play/read cost consumers", family => {
  const r = rig(); const source = r.put("SYN-hand-cost-source", 0, "CHARACTER");
  const target = r.put("SYN-hand-cost-target", 0, "HAND", { data: { type: "Event", cost: 3 } });
  const action: Action = family === "MODIFY_COST"
    ? { type: family, target: { type: "CARD_IN_HAND", controller: "SELF", count: { all: true } }, params: { amount: -1 } }
    : { type: family, target: { type: "CARD_IN_HAND", controller: "SELF", count: { all: true } }, params: { value: 1 } };
  const result = executeActionChain(r.state, [action], source.instanceId, 0, r.db); r.state = result.state;
  expect(result.pendingPrompt).toBeUndefined();
  const value = family === "MODIFY_COST" ? 2 : 1;
  const costs = () => [getEffectiveCost(r.db.get(target.cardId)!, r.state, target.instanceId, r.db), getEffectiveCostForRead(target, r.db.get(target.cardId)!, r.state, r.db)];
  expect(costs()).toEqual([value, value]);
  negate(r, source, "flag"); expect(costs()).toEqual([value, value]);
  negate(r, source, "Roger"); expect(costs()).toEqual([value, value]);
  r.state = expireEndOfTurnEffects(r.state); expect(costs()).toEqual([3, 3]);
});
