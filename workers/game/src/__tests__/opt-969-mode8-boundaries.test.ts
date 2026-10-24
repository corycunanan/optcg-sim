/** Mode8 capability boundaries. New setup8; no recorded6/7 migration. */
import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { runtime, memory, save } from "./native7-producer-support.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import { runPipeline } from "../engine/pipeline.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { canOfferTrigger } from "../engine/effect-damage.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { convertPersistedGameState, promoteGameStateForWriter } from "../session/persistence.js";
import type { Cost, EffectBlock } from "../engine/effect-types.js";
import type { GameState } from "../types.js";

const costs: Cost[] = [{ type: "LIFE_TO_HAND", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 1 }];
function fixture(mode: 6 | 7 | 8) {
  const r = rig(); r.state.schemaVersion = 8; r.state.costSemanticsVersion = mode;
  r.deck(0, 5); r.deck(1, 5); r.leader(0, "ST13-003"); r.life(0, 1); r.state.players[0].life[0].face = "UP";
  return r;
}
it("writer ordinary setup uses mode8 and historical schema7 promotion stays7", () => {
  const r = rig(); expect(r.state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 8 });
  r.state.schemaVersion = 7; delete r.state.costSemanticsVersion;
  expect(promoteGameStateForWriter(r.state, "state")).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 7 });
});
for (const mode of [6, 7, 8] as const) it(`mode${mode} governs fresh activation, optional, nonoptional and Life Trigger consistently`, () => {
  const r = fixture(mode);
  const block: EffectBlock = { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { optional: true }, costs, actions: [{ type: "DRAW", params: { amount: 1 } }] };
  const source = r.put("mode-admission", 0, "CHARACTER", { schema: synSchema("mode-admission", [block]) });
  const before = structuredClone(r.state);
  expect(isCostSequencePayable(r.state, costs, 0, r.db, source.instanceId)).toBe(mode === 8);
  expect(r.state).toEqual(before);
  expect(runPipeline(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db, 0).valid).toBe(mode === 8);
  const optional = resolveEffect(r.state, block, source.instanceId, 0, r.db);
  expect(!!optional.pendingPrompt).toBe(mode === 8);
  const fixed = resolveEffect(r.state, { ...block, flags: {} }, source.instanceId, 0, r.db);
  expect(fixed.state.players[0].life).toHaveLength(mode === 8 ? 0 : 1);
  expect(fixed.state.players[0].deck).toHaveLength(mode === 8 ? 6 : 5);
  expect(fixed.state.players[0].hand).toHaveLength(0);
  const trigger: EffectBlock = { ...block, id: "trigger", category: "auto", trigger: { keyword: "TRIGGER" } };
  const card = r.put("mode-trigger", 0, "TRASH", { data: { keywords: { ...r.db.get("CHAR-VANILLA")!.keywords, trigger: true } }, schema: synSchema("mode-trigger", [trigger]) });
  expect(canOfferTrigger(r.state, card.cardId, r.db, 0, card.instanceId)).toBe(mode === 8);
});

for (const mode of [6, 7, 8] as const) for (const embedded of [false, true]) it(`preserves explicit mode${mode} live/all undo load/save embedded=${embedded}`, async () => {
  const rt = await runtime(); const r = fixture(mode); const m = memory(rt);
  const saved = await m.repo.save({ state: r.state, cardDb: r.db, undoHistory: [r.state, r.state], mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
  if (embedded) {
    (m.values.session as Record<string, unknown>).undoHistory = m.values["session:undo-history"];
    (m.values.session as Record<string, unknown>).cardDb = m.values["session:card-db"];
    delete m.values["session:undo-history"]; delete m.values["session:card-db"];
  }
  const loaded = (await memory(rt, m.values).repo.load())!;
  expect(loaded.state).toEqual(toPersistedGameState(saved.state));
  expect(loaded.state.costSemanticsVersion).toBe(mode);
  expect(loaded.undoHistory.map(s => s.costSemanticsVersion)).toEqual(saved.undoHistory.map(() => mode));
});

for (const badMode of [undefined, null, 0, 9, "8"]) for (const location of ["live", "oldest-undo"] as const) it(`rejects ${String(badMode)} in ${location} before bounding/IDs/storage/metrics`, async () => {
  const rt = await runtime(); const r = fixture(8); const m = memory(rt);
  const invalid = structuredClone(r.state) as GameState;
  (invalid as unknown as Record<string, unknown>).costSemanticsVersion = badMode;
  const before = structuredClone(invalid);
  expect(() => convertPersistedGameState(toPersistedGameState(invalid), "invalid")).toThrow(/costSemanticsVersion/);
  const history = location === "oldest-undo" ? [invalid, ...Array.from({ length: 220 }, () => r.state)] : [];
  await expect(m.repo.save({ state: location === "live" ? invalid : r.state, cardDb: r.db, undoHistory: history, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null })).rejects.toThrow(/costSemanticsVersion/);
  expect(m.values).toEqual({}); expect(m.repo.getLastMetrics()).toBeNull(); expect(invalid).toEqual(before);
  const result = new rt.SessionCoordinator().executeAction(location === "live" ? invalid : r.state, history, 0, { type: "PASS" }, r.db);
  expect(result.kind).toBe("reject"); expect(result.state).toEqual(location === "live" ? invalid : r.state);
  expect(result.undoHistory).toEqual(history);
});

for (const embedded of [false, true]) it(`unknown undo mode rejects raw load atomically embedded=${embedded}`, async () => {
  const rt = await runtime(); const r = fixture(8); const bytes = await save(rt, r.state, r.db);
  const bad = structuredClone(toPersistedGameState(r.state)) as unknown as Record<string, unknown>; bad.costSemanticsVersion = 9;
  if (embedded) (bytes.session as Record<string, unknown>).undoHistory = [bad];
  else bytes["session:undo-history"] = [bad];
  const m = memory(rt, bytes); const before = structuredClone(m.values);
  await expect(m.repo.load()).rejects.toThrow(/costSemanticsVersion/);
  expect(m.values).toEqual(before); expect(m.repo.getLastMetrics()).toBeNull();
});

for (const prohibited of [false, true]) it(`mode8 initial full suffix and original movement gates cannot be waived prohibited=${prohibited}`, () => {
  const r = fixture(8);
  const sequence: Cost[] = [{ type: "LIFE_TO_HAND", amount: 1 }, { type: "TRASH_FROM_HAND", amount: prohibited ? 1 : 2 }];
  const source = r.put("gate-source", 0, "CHARACTER", { schema: synSchema("gate-source", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { optional: true }, costs: sequence, actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  if (prohibited) r.state.prohibitions.push({ id: "life-gate", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "gate", controller: 0, prohibitionType: "CANNOT_ADD_LIFE_TO_HAND", scope: { controller: "SELF" }, appliesTo: [], usesRemaining: null, duration: { type: "THIS_TURN" } });
  const before = structuredClone(r.state);
  expect(isCostSequencePayable(r.state, sequence, 0, r.db, source.instanceId)).toBe(false);
  const result = runPipeline(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db, 0);
  expect(result.valid).toBe(false); expect(result.error).toBe("Cost cannot be paid"); expect(r.state).toEqual(before);
});

for (const schemaVersion of [6, 7, 9]) it(`mode8 cannot be inferred or downgraded from declared schema${schemaVersion}`, () => {
  const r = fixture(8); const raw = { ...r.state, schemaVersion };
  expect(() => convertPersistedGameState(raw, "state")).toThrow(schemaVersion === 9 ? /version/i : /requires schemaVersion 8/);
});
