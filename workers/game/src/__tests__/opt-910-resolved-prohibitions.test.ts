import { expect, it } from "vitest";
import type { Action, Duration, RuntimeProhibition } from "../engine/effect-types.js";
import { getAllAuthoredSchemas, validateEffectSchema } from "../engine/schema-registry.js";
import { getNestedActions } from "../engine/effect-types.js";
import { isCardNegated } from "../engine/modifiers.js";
import { checkProhibitions, isDrawProhibitedByEffect, isProhibitionConditionMet } from "../engine/prohibitions.js";
import { isTriggerTypeNegated } from "../engine/triggers.js";
import { expireEndOfTurnEffects } from "../engine/duration-tracker.js";
import { stripInactiveProhibitions } from "../session/visibility.js";
import { parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

function negate(r: Rig, source: string) {
  const event = r.put("SYN-prohibition-negator", 0, "HAND", { data: { cost: 0, type: "Event", effectText: "[Main] Resolve this effect." }, schema: synSchema("SYN-prohibition-negator", [{ id: "negate", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: "NEGATE_EFFECTS", target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } }, duration: { type: "THIS_TURN" } }] }], "Event") });
  r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId }); r.select([source]);
}
function resolved(action?: Action, duration: Duration = { type: "THIS_TURN" }) {
  const r = rig(); r.deck(0, 20);
  const source = r.put("SYN-prohibition-source", 0, "CHARACTER", { schema: synSchema("SYN-prohibition-source", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [action ?? { type: "APPLY_PROHIBITION", params: { prohibition_type: "CANNOT_DRAW", scope: { cause: "BY_YOUR_EFFECT" } }, duration }] }]) });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "main" });
  const row = r.state.prohibitions[0]; expect(row.sourceEffectBlockId).toBe("");
  return { r, source, row };
}
const blocked = (r: Rig) => isDrawProhibitedByEffect(r.state, 0, 0, r.db);

it.each([false, true])("actual resolved Kalgara survives later Roger=%s and expires normally", withRoger => {
  const r = rig(); r.deck(0, 20); r.life(1, 5);
  const kalgara = r.put("OP12-099", 0, "CHARACTER");
  const attacker = r.put("SYN-attacker", 0, "CHARACTER", { data: { power: 8000 } });
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: r.state.players[1].leader.instanceId });
  r.act({ type: "PASS" }, 1); r.act({ type: "PASS" }, 1);
  const draws = () => r.state.eventLog.filter(e => e.type === "DRAW_OUTSIDE_DRAW_PHASE" && e.playerIndex === 0).length;
  expect(draws()).toBe(1); expect(r.state.prohibitions.filter(p => p.prohibitionType === "CANNOT_DRAW")).toHaveLength(1);
  if (withRoger) {
    const roger = r.put("OP13-064", 0, "HAND", { data: { cost: 0, types: ["Roger Pirates"] } });
    r.act({ type: "PLAY_CARD", cardInstanceId: roger.instanceId });
    if (r.state.pendingPrompt?.options.promptType === "PLAYER_CHOICE") r.act({ type: "PLAYER_CHOICE", choiceId: r.state.pendingPrompt.options.choices[0].id });
    expect(isCardNegated(kalgara, r.state, r.db)).toBe(true);
  }
  const event = r.put("SYN-own-draw-event", 0, "HAND", { data: { cost: 0, type: "Event", effectText: "[Main] Resolve this effect." }, schema: synSchema("SYN-own-draw-event", [{ id: "draw", category: "activate", trigger: { keyword: "MAIN_EVENT" }, actions: [{ type: "DRAW", params: { amount: 1 } }] }], "Event") });
  r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
  expect(r.state.pendingPrompt).toBeNull(); expect(draws()).toBe(1);
  expect(stripInactiveProhibitions(r.state, r.db).prohibitions.some(p => p.prohibitionType === "CANNOT_DRAW")).toBe(true);
  r.act({ type: "ADVANCE_PHASE" });
  expect(r.state.prohibitions.some(p => p.prohibitionType === "CANNOT_DRAW")).toBe(false);
  expect(blocked(r)).toBe(false);
});

it("action-created Blocker restriction survives source negation through the common action gate", () => {
  const { r, source } = resolved({ type: "APPLY_PROHIBITION", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } }, params: { prohibition_type: "CANNOT_ACTIVATE_BLOCKER" }, duration: { type: "THIS_TURN" } });
  // Produce the targeted restriction after its target exists, via a fresh activation.
  const defender = r.put("SYN-blocker", 1, "CHARACTER");
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "main" });
  const action = { type: "DECLARE_BLOCKER" as const, blockerInstanceId: defender.instanceId };
  expect(checkProhibitions(r.state, action, r.db, 1)).not.toBeNull();
  negate(r, source.instanceId);
  expect(checkProhibitions(r.state, action, r.db, 1)).not.toBeNull();
});

it("resolved trigger-type output retains caster ownership, prospective coverage and expiry", () => {
  const { r, source, row } = resolved({ type: "NEGATE_TRIGGER_TYPE", params: { trigger_type: "ON_PLAY", affected_controller: "OPPONENT" }, duration: { type: "THIS_TURN" } });
  expect(row).toMatchObject({ controller: 1, ownerController: 0, sourceEffectBlockId: "" });
  negate(r, source.instanceId);
  const later = r.put("SYN-later-onplay", 1, "CHARACTER");
  expect(isTriggerTypeNegated(r.state, later, "ON_PLAY", r.db)).toBe(true);
  expect(isTriggerTypeNegated(r.state, later, "WHEN_ATTACKING", r.db)).toBe(false);
  r.state = expireEndOfTurnEffects(r.state);
  expect(isTriggerTypeNegated(r.state, later, "ON_PLAY", r.db)).toBe(false);
});

it.each(["PERMANENT", "THIS_TURN"] as const)("registered continuous %s prohibition pauses while source negated and resumes after flag expiry", duration => {
  const r = rig(); const source = r.put("SYN-continuous-prohibition", 0, "CHARACTER", { schema: synSchema("SYN-continuous-prohibition", [{ id: "aura", category: "permanent", duration: { type: duration }, prohibitions: [{ type: "CANNOT_DRAW", scope: { cause: "BY_YOUR_EFFECT" } }] }]) });
  expect(r.state.prohibitions[0].sourceEffectBlockId).toBe("aura"); expect(blocked(r)).toBe(true);
  negate(r, source.instanceId); expect(blocked(r)).toBe(false);
  expect(stripInactiveProhibitions(r.state, r.db).prohibitions).toHaveLength(0);
  r.state = expireEndOfTurnEffects(r.state); expect(blocked(r)).toBe(true);
});

it("conditions, WHILE_CONDITION, override, use count and drawer/cause gates remain live", () => {
  const { r, source, row } = resolved(); negate(r, source.instanceId);
  const condition = { type: "LIFE_COUNT" as const, controller: "SELF" as const, operator: "<=" as const, value: 2 };
  row.conditions = condition; r.life(0, 3); expect(blocked(r)).toBe(false);
  r.life(0, 2); expect(blocked(r)).toBe(true);
  row.conditions = undefined; row.duration = { type: "WHILE_CONDITION", condition };
  r.life(0, 3); expect(blocked(r)).toBe(false); r.life(0, 2); expect(blocked(r)).toBe(true);
  row.conditionalOverride = condition; expect(blocked(r)).toBe(false);
  row.conditionalOverride = undefined; row.usesRemaining = 0; expect(blocked(r)).toBe(false);
  row.usesRemaining = null; expect(blocked(r)).toBe(true);
  expect(isDrawProhibitedByEffect(r.state, 1, 1, r.db)).toBe(false);
  expect(isDrawProhibitedByEffect(r.state, 0, 1, r.db)).toBe(false);
});

it.each(["THIS_TURN", "PERMANENT"] as const)("resolved signature, not %s duration, controls later source negation", duration => {
  const { r, source } = resolved(undefined, { type: duration }); negate(r, source.instanceId); expect(blocked(r)).toBe(true);
});

it.each([8, 9, 10] as const)("source%s persistence/live and undo retain resolved and conservative unknown provenance", version => {
  const { r, source } = resolved(); r.state.schemaVersion = version; if (version === 10) r.state.fieldTrashSemanticsVersion = 8;
  negate(r, source.instanceId);
  const original = toPersistedGameState(r.state);
  const restored = parseStoredSession({ state: original, undoHistory: [original], cardDb: Object.fromEntries(r.db), mode: "PVP" });
  expect(restored.state.schemaVersion).toBe(version);
  expect(isDrawProhibitedByEffect(restored.state, 0, 0, new Map(Object.entries(restored.cardDb)))).toBe(true);
  expect(isDrawProhibitedByEffect(restored.undoHistory[0], 0, 0, new Map(Object.entries(restored.cardDb)))).toBe(true);
  for (const metadata of [undefined, null, 17, "authored-block"] as unknown[]) {
    const changed = structuredClone(original); (changed.prohibitions[0] as RuntimeProhibition).sourceEffectBlockId = metadata as string;
    const legacy = parseStoredSession({ state: changed, undoHistory: [], cardDb: Object.fromEntries(r.db), mode: "PVP" });
    expect(isProhibitionConditionMet(legacy.state.prohibitions[0], legacy.state, new Map(Object.entries(legacy.cardDb))), String(metadata)).toBe(false);
  }
});

it("mixed8/9/10 undo retains independent modes and resolved prohibition lifetime", () => {
  const { r, source } = resolved(); negate(r, source.instanceId);
  const states = ([8, 9, 10] as const).map((version, index) => {
    const state = structuredClone(r.state); state.schemaVersion = version;
    state.costSemanticsVersion = ([6, 7, 8] as const)[index];
    if (version === 10) state.fieldTrashSemanticsVersion = 9;
    return toPersistedGameState(state);
  });
  const restored = parseStoredSession({ state: states[2], undoHistory: states, cardDb: Object.fromEntries(r.db), mode: "PVP" });
  expect(restored.undoHistory.map(state => [state.schemaVersion, state.costSemanticsVersion])).toEqual([[8, 6], [9, 7], [10, 8]]);
  for (const state of [restored.state, ...restored.undoHistory]) expect(isDrawProhibitedByEffect(state, 0, 0, new Map(Object.entries(restored.cardDb)))).toBe(true);
});

it("registered block IDs are nonempty, including nested authored Character action inventory", () => {
  let characterActions = 0;
  for (const [id, schema] of Object.entries(getAllAuthoredSchemas())) for (const block of schema.effects) {
    if (block.category === "permanent" && block.prohibitions?.length) expect(block.id, id).not.toBe("");
    const visit = (actions: Action[]) => { for (const action of actions) { if (schema.card_type === "Character" && action.type === "APPLY_PROHIBITION") characterActions++; visit(getNestedActions(action)); } };
    visit(block.actions ?? []);
  }
  expect(characterActions).toBeGreaterThan(0);
  expect(validateEffectSchema(synSchema("SYN-empty-permanent", [{ id: "", category: "permanent", prohibitions: [{ type: "CANNOT_DRAW" }] }])).join("\n")).toContain("Missing 'id' field");
});
