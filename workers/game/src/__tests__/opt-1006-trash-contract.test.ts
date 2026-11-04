import { expect, it } from "vitest";
import { executeTrashCard, finalizeTrashCards } from "../engine/effect-resolver/actions/removal.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { rig } from "./opt-960-rig.js";

it("ordinary8 hand-trash retains source identity even without source cardDb data", () => {
  const r = rig(); const source = r.put("OPT1006-UNKNOWN-DATA", 1, "CHARACTER"); const target = r.put("OPT1006-HAND", 0, "HAND");
  r.db.delete(source.cardId);
  const result = executeTrashCard(r.state, { type: "TRASH_CARD", target: { type: "CARD_IN_HAND", controller: "OPPONENT" } }, source.instanceId, 1, r.db, new Map(), [target.instanceId], resolverExecutionServices);
  expect(result.events).toMatchObject([{ type: "CARD_TRASHED", playerIndex: 0, payload: { count: 1, from: "HAND", effectSourceCardId: source.cardId, effectSourceController: 1, causingController: 1 } }]);
});
it("mixed-zone resumed trash finalization keeps one immutable aggregate hand event and exact count", () => {
  const r = rig(); const source = r.put("OPT1006-SOURCE", 1, "CHARACTER"); const field = r.put("OPT1006-FIELD", 0, "CHARACTER"); const hand = [r.put("OPT1006-HAND1", 0, "HAND"), r.put("OPT1006-HAND2", 0, "HAND")];
  const initial = structuredClone(r.state);
  const result = finalizeTrashCards(r.state, [field.instanceId, ...hand.map(card => card.instanceId)], 1, r.db, { instanceId: source.instanceId, cardId: source.cardId, cardType: "Character" });
  expect(result.result?.count).toBe(3); expect(result.result?.targetInstanceIds).toHaveLength(3);
  expect(result.events.filter(event => event.type === "CARD_KO")).toHaveLength(0);
  expect(result.events.filter(event => event.type === "CARD_TRASHED" && event.payload?.from === "HAND")).toMatchObject([{ playerIndex: 0, payload: { count: 2, effectSourceCardId: source.cardId, effectSourceController: 1 } }]);
  expect(r.state).toEqual(initial);
});

for (const zone of ["HAND", "CHARACTER"] as const) it(`native8 ${zone} trash with ${zone === "HAND" ? "a selected hand card" : "zero selected targets"} stays8`, () => {
  const r = rig(); const source = r.put("OPT1006-SOURCE", 1, "CHARACTER"); const target = r.put("OPT1006-TARGET", 0, zone);
  const before = structuredClone(r.state);
  const result = executeTrashCard(r.state, { type: "TRASH_CARD", target: { type: zone === "HAND" ? "CARD_IN_HAND" : "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }, source.instanceId, 1, r.db, new Map(), zone === "HAND" ? [target.instanceId] : [], resolverExecutionServices);
  expect(result.state.schemaVersion).toBe(8); expect(result.state.costSemanticsVersion).toBe(8); expect(r.state).toEqual(before);
});
it("selected prohibited field consequence activates9 before the empty replacement scan without movement", () => {
  const r = rig(); const source = r.put("OPT1006-SOURCE", 1, "CHARACTER"); const target = r.put("OPT1006-TARGET", 0, "CHARACTER");
  r.state.prohibitions.push({ id: "field-gate", sourceCardInstanceId: target.instanceId, sourceEffectBlockId: "gate", controller: 0, prohibitionType: "CANNOT_LEAVE_FIELD", scope: { controller: "SELF" }, appliesTo: [target.instanceId], usesRemaining: null, duration: { type: "THIS_TURN" } });
  const before = structuredClone(r.state);
  const result = executeTrashCard(r.state, { type: "TRASH_CARD", target: { type: "CHARACTER", controller: "OPPONENT", count: { all: true } } }, source.instanceId, 1, r.db, new Map(), [target.instanceId], resolverExecutionServices);
  expect(result.state.schemaVersion).toBe(9); expect(result.state.players).toEqual(before.players);
  expect(result.events).toEqual([]); expect(result.pendingPrompt).toBeUndefined(); expect(r.state).toEqual(before);
});
