import { describe, expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { executeSetDonActive } from "../engine/effect-resolver/actions/don.js";
import { executeAdvancePhaseWork } from "../engine/phases.js";
import { getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { type Action } from "../engine/effect-types.js";

const setDon = { type: "SET_DON_ACTIVE", params: { amount: 1 } } as const;
function fixture(id: string) {
  const r = rig();
  const source = r.put(id, 0, "CHARACTER");
  r.state.players[0].donCostArea.forEach(d => d.state = "RESTED");
  const block = getEffectSchema(id)!.effects.find(b => b.category === "activate")!;
  const activate = () => {
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: block.id });
    if (r.state.pendingPrompt) r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
  };
  activate();
  expect(r.state.players[0].donCostArea.filter(d => d.state === "ACTIVE")).toHaveLength(1);
  expect(r.state.prohibitions.some(p => p.prohibitionType === "CANNOT_SET_DON_ACTIVE")).toBe(true);
  return { r, source, activate };
}

describe.each(["EB04-016", "OP10-030"])("OPT-988 authored %s", id => {
  it("first activation succeeds, subsequent Character activation does not emit DON_SET_ACTIVE", () => {
    const { r, activate } = fixture(id);
    const count = r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE").length;
    activate();
    expect(r.state.players[0].donCostArea.filter(d => d.state === "ACTIVE")).toHaveLength(1);
    expect(r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(count);
  });

  it("blocks the real Urouge End of Your Turn effect (FAQ), before expiry", () => {
    const { r } = fixture(id);
    r.put("OP07-021", 0, "CHARACTER");
    const before = r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE").length;
    r.act({ type: "ADVANCE_PHASE" });
    if (r.state.pendingPrompt) r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    expect(r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(before);
    expect(r.state.players[0].donCostArea.filter(d => d.state === "ACTIVE")).toHaveLength(1);
  });

  it("blocks real ST24-005 scheduled activation at End of Turn (FAQ)", () => {
    const { r } = fixture(id);
    const leader = r.state.players[0].leader;
    r.db.set(leader.cardId, { ...r.db.get(leader.cardId)!, types: ["Supernovas"] });
    const drake = r.put("ST24-005", 0, "HAND", { data: { cost: 0 } });
    r.act({ type: "PLAY_CARD", cardInstanceId: drake.instanceId });
    expect(r.state.scheduledActions).toHaveLength(1);
    const before = r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE").length;
    r.act({ type: "ADVANCE_PHASE" });
    if (r.state.pendingPrompt) r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    expect(r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(before);
  });

  it("records the legacy missing-origin limitation after ST24-005 leaves the field", () => {
    const { r } = fixture(id);
    const leader = r.state.players[0].leader;
    r.db.set(leader.cardId, { ...r.db.get(leader.cardId)!, types: ["Supernovas"] });
    const drake = r.put("ST24-005", 0, "HAND", { data: { cost: 0 } });
    r.act({ type: "PLAY_CARD", cardInstanceId: drake.instanceId });
    const fieldDrake = r.state.players[0].characters.find(c => c?.cardId === "ST24-005")!;
    const remover = r.put("SYN-bounce", 0, "CHARACTER", { schema: synSchema("SYN-bounce", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "RETURN_TO_HAND", target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } } }] }]) });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: remover.instanceId, effectId: "main" });
    r.select([fieldDrake.instanceId]);
    expect(r.state.players[0].characters.some(c => c?.instanceId === fieldDrake.instanceId)).toBe(false);
    const before = r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE").length;
    r.act({ type: "ADVANCE_PHASE" });
    if (r.state.pendingPrompt) r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:1" });
    expect(r.state.eventLog.filter(e => e.type === "DON_SET_ACTIVE")).toHaveLength(before + 1);
  });

  it("allows the real OP10-001 Leader effect (FAQ)", () => {
    const { r } = fixture(id);
    r.leader(0, "OP10-001");
    r.put("large", 0, "CHARACTER", { data: { power: 7000 } });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: r.state.players[0].leader.instanceId, effectId: "activate_set_don_active" });
    r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:2" });
    expect(r.state.players[0].donCostArea.filter(d => d.state === "ACTIVE")).toHaveLength(3);
  });

  it.each(["Event", "Stage"] as const)("allows a %s effect", type => {
    const { r } = fixture(id);
    const card = r.put(`SYN-${type}`, 0, type === "Stage" ? "STAGE" : "TRASH", { data: { type } });
    const result = executeSetDonActive(r.state, setDon, card.instanceId, 0, r.db, new Map());
    expect(result.succeeded).toBe(true);
    expect(result.events.map(e => e.type)).toEqual(["DON_SET_ACTIVE"]);
  });

  it("does not affect Refresh procedure even while the restriction remains registered", () => {
    const { r } = fixture(id);
    r.state.turn.phase = "REFRESH";
    const result = executeAdvancePhaseWork(r.state, r.db);
    expect(result.state.players[0].donCostArea.every(d => d.state === "ACTIVE")).toBe(true);
  });

  it("blocks a Character source after TRASH_SELF cost (source snapshot survives)", () => {
    const { r } = fixture(id);
    const card = r.put("SYN-trash-cost", 0, "CHARACTER", { schema: synSchema("SYN-trash-cost", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_SELF" }], actions: [setDon] }]) });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "main" });
    expect(r.state.players[0].characters.some(c => c?.instanceId === card.instanceId)).toBe(false);
    expect(r.state.players[0].donCostArea.filter(d => d.state === "ACTIVE")).toHaveLength(1);
  });

  it("does not stop existing DON-rest costs", () => {
    const { r } = fixture(id);
    const card = r.put("SYN-rest-cost", 0, "CHARACTER", { schema: synSchema("SYN-rest-cost", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "DON_REST", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
    const before = r.state.players[0].hand.length;
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "main" });
    expect(r.state.players[0].hand).toHaveLength(before + 1);
    expect(r.state.players[0].donCostArea.every(d => d.state === "RESTED")).toBe(true);
  });

  it("other player's Character activation remains legal", () => {
    const { r } = fixture(id);
    const other = r.put("other", 1, "CHARACTER");
    r.state.players[1].donCostArea.forEach(d => d.state = "RESTED");
    expect(executeSetDonActive(r.state, setDon, other.instanceId, 1, r.db, new Map()).succeeded).toBe(true);
  });
});

describe("OPT-988 schema cause validation", () => {
  it.each(["EB04-016", "OP10-030"])("accepts authored scope for %s", id => {
    expect(validateEffectSchema(getEffectSchema(id))).toEqual([]);
  });
  it("rejects unsupported causes recursively in scheduled actions", () => {
    const schema = synSchema("SYN", [{ id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "SCHEDULE_ACTION", params: { timing: "END_OF_THIS_TURN", action: { type: "APPLY_PROHIBITION", params: { prohibition_type: "CANNOT_SET_DON_ACTIVE", scope: { cause: "BY_EFFECT" } } } } } as Action] }]);
    expect(validateEffectSchema(schema).some(e => e.includes("unsupported CANNOT_SET_DON_ACTIVE scope.cause"))).toBe(true);
  });
});
