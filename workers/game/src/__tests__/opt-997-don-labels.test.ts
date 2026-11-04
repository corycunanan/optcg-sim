import { expect, it } from "vitest";
import { rig } from "./opt-960-rig.js";
import { buildDonIdentityPlans } from "../engine/effect-resolver/don-identity-plans.js";
it("distinguishes duplicate-name Character slots in picker and old-client generic choices", () => {
  const r = rig(); const first = r.put("OPT997-Zoro", 0, "CHARACTER", { data: { name: "Roronoa Zoro" } });
  const second = r.put("OPT997-Zoro", 0, "CHARACTER");
  const [a, b] = r.state.players[0].donCostArea.splice(0, 2);
  first.attachedDon = [{ ...a, attachedTo: first.instanceId }]; second.attachedDon = [{ ...b, attachedTo: second.instanceId }];
  const plan = buildDonIdentityPlans(r.state, 0, [a.instanceId, b.instanceId], 1, 1, r.db);
  expect(plan.donIdentityReturn.groups.map(g => g.label)).toEqual(["Attached to Roronoa Zoro (Character slot 1)", "Attached to Roronoa Zoro (Character slot 2)"]);
  expect(new Set(plan.choices.map(c => c.label)).size).toBe(2);
  expect(plan.choices.some(c => c.label.includes("slot 1"))).toBe(true);
  expect(plan.choices.some(c => c.label.includes("slot 2"))).toBe(true);
});
it("names meaningful hold source and duration without leaking effect or donor IDs", () => {
  const r = rig(); const source = r.put("OP07-026", 0, "CHARACTER");
  const [a, b] = r.state.players[0].donCostArea;
  for (const [index, don] of [a, b].entries()) r.state.prohibitions.push({ id: `SECRET-effect-${index}`, sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "SECRET-block", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: index ? "THIS_TURN" : "SKIP_NEXT_REFRESH" }, controller: 0, appliesTo: [don.instanceId], usesRemaining: null } as never);
  const plan = buildDonIdentityPlans(r.state, 0, [a.instanceId, b.instanceId], 1, 1, r.db);
  const labels = plan.donIdentityReturn.groups.map(g => g.label);
  expect(labels[0]).toContain("Cannot become active"); expect(labels[0]).toContain("Jewelry Bonney");
  expect(labels[0]).toContain("next refresh"); expect(labels[1]).toContain("this turn");
  for (const label of [...labels, ...plan.choices.map(c => c.label)]) { expect(label).not.toContain("SECRET"); expect(label).not.toContain(a.instanceId); expect(label).not.toContain(source.instanceId); }
  expect(new Set(plan.choices.map(c => c.label)).size).toBe(2);
});

it("does not expose a hold source name from either player's hidden zones", () => {
  for (const owner of [0, 1] as const) for (const zone of ["HAND", "DECK"] as const) {
    const r = rig(); const secret = r.put("OPT997-secret-source", owner, zone, { data: { name: "SECRET HIDDEN NAME" } });
    const don = r.state.players[0].donCostArea[0];
    r.state.prohibitions.push({ id: "hidden-hold", sourceCardInstanceId: secret.instanceId, sourceEffectBlockId: "hidden-block", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: "THIS_TURN" }, controller: 0, appliesTo: [don.instanceId], usesRemaining: null } as never);
    const plan = buildDonIdentityPlans(r.state, 0, [don.instanceId], 1, 1, r.db);
    const label = plan.donIdentityReturn.groups[0].label;
    expect(label).toContain("prior card effect"); expect(label).not.toContain("SECRET");
  }
});
