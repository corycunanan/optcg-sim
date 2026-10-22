import { describe, expect, it } from "vitest";
import { rig } from "./opt-960-rig.js";
import { getEffectSchema, validateEffectSchema } from "../engine/schema-registry.js";
import { expandReplacementVisits, replacementAbilitySiblings, replacementStructureEqual,
  validateReplacementAbilityGroups } from "../engine/replacement-ability-identity.js";
import type { EffectSchema } from "../engine/effect-types.js";

function fixture() {
  const r = rig(); r.state.schemaVersion = 6;
  const card = r.put("OP08-045", 0, "CHARACTER");
  const effects = r.state.activeEffects.filter((e) => e.sourceCardInstanceId === card.instanceId);
  return { r, card, effects };
}

describe("OPT-968 declared replacement ability identity", () => {
  it("views historical saved schema without mutation, grouping only the declared source instance", () => {
    const { r, effects } = fixture();
    const before = JSON.stringify([...r.db]);
    const second = r.put("OP08-045", 0, "CHARACTER");
    const afterRegistration = JSON.stringify([...r.db]);
    expect(afterRegistration).toBe(before);
    expect(replacementAbilitySiblings(r.state, effects[1].id, r.db)).toEqual(effects.map((e) => e.id));
    expect(expandReplacementVisits(r.state, [effects[1].id, effects[0].id], r.db)).toEqual([effects[0].id, effects[1].id]);
    expect(replacementAbilitySiblings(r.state, effects[0].id, r.db))
      .not.toContain(r.state.activeEffects.find((e) => e.sourceCardInstanceId === second.instanceId)!.id);
    expect(JSON.stringify([...r.db])).toBe(before);
  });

  it.each(["missing", "body", "flags", "target", "runtime", "conditions", "modifier", "duration"])("refuses %s incompatible/custom schema or effect", (kind) => {
    const { r, effects } = fixture();
    const data = structuredClone(r.db.get("OP08-045")!);
    const schema = data.effectSchema!;
    if (kind === "missing") schema.effects.pop();
    if (kind === "body") for (const block of schema.effects) block.replacement_actions = [];
    if (kind === "flags") schema.effects[0].flags = { optional: true };
    if (kind === "target") schema.effects[0].replaces!.target_filter = { exclude_self: true };
    if (kind === "runtime") effects[0].modifiers[0].params = { ...effects[0].modifiers[0].params, optional: true };
    if (kind === "conditions") effects[0].conditions = { type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 1 };
    if (kind === "modifier") effects[0].modifiers.push(effects[0].modifiers[0]);
    if (kind === "duration") effects[0].duration = { type: "THIS_TURN" };
    r.db.set(data.id, data);
    expect(replacementAbilitySiblings(r.state, effects[0].id, r.db)).toEqual([effects[0].id]);
  });

  it("does not infer grouping for undeclared identical blocks", () => {
    const { r, effects } = fixture();
    effects[1].sourceEffectBlockId = "independent_ability";
    expect(replacementAbilitySiblings(r.state, effects[0].id, r.db)).toEqual([effects[0].id]);
    expect(replacementAbilitySiblings(r.state, effects[1].id, r.db)).toEqual([effects[1].id]);
  });

  it("validates disjoint existing members and identical body semantics, independent of key order", () => {
    const schema = getEffectSchema("OP08-045")!;
    expect(validateReplacementAbilityGroups(schema)).toEqual([]);
    expect(validateReplacementAbilityGroups(schema, [["replacement_ko"]])).not.toEqual([]);
    expect(validateReplacementAbilityGroups(schema, [["replacement_ko", "replacement_ko"]])).not.toEqual([]);
    expect(validateReplacementAbilityGroups(schema, [["replacement_ko", "absent"]])).not.toEqual([]);
    const changed = structuredClone(schema); changed.effects[1].flags = { once_per_turn: true };
    expect(validateReplacementAbilityGroups(changed)).not.toEqual([]);
    expect(replacementStructureEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
  });

  it.each([null, 1, "bad", {}, { id: "replacement_ko", category: "replacement" }])("malformed catalog-card schema reports validation errors (%j)", (block) => {
    const schema = { ...getEffectSchema("OP08-045"), effects: [block] };
    expect(() => validateEffectSchema(schema)).not.toThrow();
    expect(validateEffectSchema(schema)).not.toEqual([]);
    expect(validateReplacementAbilityGroups(schema as EffectSchema)).not.toEqual([]);
  });
});
