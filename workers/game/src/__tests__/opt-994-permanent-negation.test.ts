import { describe, expect, it } from "vitest";
import type { CardInstance } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { expireEndOfTurnEffects } from "../engine/duration-tracker.js";
import { executeNegateEffects } from "../engine/effect-resolver/actions/modifiers.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { rig, synSchema } from "./opt-960-rig.js";
import { getEffectivePower, isCardNegated } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function fixture(exempt = false, owner: 0 | 1 = 0) {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  const schema = getEffectSchema("OP13-064");
  expect(schema).toBeDefined();
  db.set("OP13-064", { ...CARDS.VANILLA, id: "OP13-064", name: "Gol.D.Roger", types: ["Roger Pirates"], effectSchema: schema! });
  db.set("ally", { ...CARDS.RUSH, id: "ally", types: exempt ? ["Roger Pirates"] : [], effectSchema: { effects: [{ id: "ally_attack", category: "auto", trigger: { keyword: "WHEN_ATTACKING" }, actions: [{ type: "DRAW", params: { amount: 1 } }] }] } });
  const instance = (cardId: string, instanceId: string): CardInstance => ({ instanceId, cardId, owner: 0, controller: 0, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: state.turn.number });
  const roger = instance("OP13-064", "roger");
  const ally = instance("ally", "ally");
  ally.owner = owner;
  ally.controller = owner;
  state.players[0].characters = padChars(owner === 0 ? [roger, ally] : [roger]);
  if (owner === 1) state.players[1].characters = padChars([ally]);
  state.turn.activePlayerIndex = owner;
  state = registerCardEnteredField(state, roger, db.get(roger.cardId)!);
  state = registerCardEnteredField(state, ally, db.get(ally.cardId)!);
  expect(state.activeEffects.some(e => e.sourceEffectBlockId === "OP13-064_negate_effects")).toBe(true);
  return { state, db, ally };
}

describe("OPT-994 authored OP13-064 permanent negation through pipeline", () => {
  it("suppresses same-turn Rush on a non-Roger-Pirates ally", () => {
    const { state, db, ally } = fixture();
    const result = runPipeline(state, { type: "DECLARE_ATTACK", attackerInstanceId: ally.instanceId, targetInstanceId: state.players[1].leader.instanceId }, db, 0);
    expect(result.valid).toBe(false);
    expect(isCardNegated(ally, state, db)).toBe(true);
  });

  it("suppresses the non-Roger-Pirates ally's When Attacking trigger", () => {
    const { state, db, ally } = fixture();
    ally.turnPlayed = 0;
    const handBefore = state.players[0].hand.length;
    const result = runPipeline(state, { type: "DECLARE_ATTACK", attackerInstanceId: ally.instanceId, targetInstanceId: state.players[1].leader.instanceId }, db, 0);
    expect(result.valid, result.error).toBe(true);
    expect(result.state.players[0].hand).toHaveLength(handBefore);
  });
});


describe("OPT-994 permanent negation controls and consumers", () => {
  it.each([[true, 0], [false, 1]] as const)("Roger Pirates=%s, owner=%i retains Rush and trigger", (exempt, owner) => {
    const { state, db, ally } = fixture(exempt, owner);
    const before = state.players[owner].hand.length;
    const result = runPipeline(state, { type: "DECLARE_ATTACK", attackerInstanceId: ally.instanceId, targetInstanceId: state.players[owner === 0 ? 1 : 0].leader.instanceId }, db, owner);
    expect(result.valid, result.error).toBe(true);
    expect(result.state.players[owner].hand).toHaveLength(before + 1);
    expect(isCardNegated(ally, state, db)).toBe(false);
  });

  it("a resolved negation on Roger restores the ally, and flag expiry re-applies the aura", () => {
    const { state, db, ally } = fixture();
    const negated = executeNegateEffects(state, { type: "NEGATE_EFFECTS", target: { type: "CHARACTER", count: { exact: 1 } } }, state.players[1].leader.instanceId, 1, db, new Map(), ["roger"]);
    expect(isCardNegated(state.players[0].characters[0]!, negated.state, db)).toBe(true);
    expect(isCardNegated(ally, negated.state, db)).toBe(false);
    const attack = runPipeline(negated.state, { type: "DECLARE_ATTACK", attackerInstanceId: ally.instanceId, targetInstanceId: state.players[1].leader.instanceId }, db, 0);
    expect(attack.valid, attack.error).toBe(true);
    negated.state = expireEndOfTurnEffects(negated.state);
    expect(isCardNegated(ally, negated.state, db)).toBe(true);
  });

  it("source removal through the pipeline immediately restores the ally's keyword", () => {
    const r = rig();
    const roger = r.put("OP13-064", 0, "CHARACTER", { data: { types: ["Roger Pirates"] } });
    const ally = r.put("rush-ally", 0, "CHARACTER", { data: { ...CARDS.RUSH, id: "rush-ally" } });
    ally.turnPlayed = r.state.turn.number;
    const remover = r.put("SYN-remove", 1, "CHARACTER", { schema: synSchema("SYN-remove", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } } }] }]) });
    expect(isCardNegated(ally, r.state, r.db)).toBe(true);
    r.state.turn.activePlayerIndex = 1;
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: remover.instanceId, effectId: "main" });
    r.select([roger.instanceId]);
    expect(isCardNegated(ally, r.state, r.db)).toBe(false);
    r.state.turn.activePlayerIndex = 0;
    r.act({ type: "DECLARE_ATTACK", attackerInstanceId: ally.instanceId, targetInstanceId: r.state.players[1].leader.instanceId });
  });

  it("suppresses own passive modifiers and availability while preserving external buffs", () => {
    const r = rig();
    r.put("OP13-064", 0, "CHARACTER", { data: { types: ["Roger Pirates"] } });
    const schema = synSchema("SYN-aura", [{ id: "aura", category: "permanent", modifiers: [{ type: "MODIFY_POWER", target: { type: "ALL_YOUR_CHARACTERS" }, params: { amount: 1000 } }] }, { id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "DRAW", params: { amount: 1 } }] }]);
    const ally = r.put("SYN-aura", 0, "CHARACTER", { schema });
    const external = r.put("SYN-external", 0, "CHARACTER", { data: { types: ["Roger Pirates"] }, schema: synSchema("SYN-external", [{ id: "external", category: "permanent", modifiers: [{ type: "MODIFY_POWER", target: { type: "ALL_YOUR_CHARACTERS" }, params: { amount: 2000 } }] }]) });
    expect(getEffectivePower(ally, r.db.get(ally.cardId)!, r.state, r.db)).toBe(6000);
    expect(getEffectivePower(external, r.db.get(external.cardId)!, r.state, r.db)).toBe(6000);
    const availability = computeEffectAvailability(r.state, r.db)[ally.instanceId];
    expect(availability.every(a => a.status === "blocked")).toBe(true);
    expect(runPipeline(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: ally.instanceId, effectId: "main" }, r.db, 0).valid).toBe(false);
  });
  it("keeps resolved-flag activation availability and cost rejection aligned", () => {
    const r = rig();
    const ally = r.put("SYN-main", 0, "CHARACTER", { schema: synSchema("SYN-main", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
    r.state = executeNegateEffects(r.state, { type: "NEGATE_EFFECTS", target: { type: "CHARACTER", count: { exact: 1 } } }, r.state.players[1].leader.instanceId, 1, r.db, new Map(), [ally.instanceId]).state;
    expect(computeEffectAvailability(r.state, r.db)[ally.instanceId][0].status).toBe("blocked");
    const result = runPipeline(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: ally.instanceId, effectId: "main" }, r.db, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Card effects are negated");
    expect(result.state.players[0].characters.some(c => c?.instanceId === ally.instanceId)).toBe(true);
    r.state = expireEndOfTurnEffects(r.state);
    expect(computeEffectAvailability(r.state, r.db)[ally.instanceId][0].status).toBe("usable");
  });

  it("honors permanent block conditions and terminates a cyclic source graph", () => {
    const { state, db, ally } = fixture();
    const aura = state.activeEffects.find(e => e.sourceEffectBlockId === "OP13-064_negate_effects")!;
    aura.conditions = { type: "IS_MY_TURN", controller: "OPPONENT" };
    expect(isCardNegated(ally, state, db)).toBe(false);
    aura.conditions = undefined;
    db.set("OP13-064", { ...db.get("OP13-064")!, types: [] });
    expect(() => isCardNegated(ally, state, db)).not.toThrow();
  });

});
