/** ISOLATED writer first-load conversion evidence, deliberately disabled in reader CI. */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { rig, synSchema } from "./opt-960-rig.js";
import { capture, command, memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import type { Cost } from "../engine/effect-types.js";
import type { GameState } from "../types.js";
async function pending6(position: "TOP" | "BOTTOM") {
  const r = rig(); r.state.schemaVersion = 6; delete r.state.costSemanticsVersion; r.deck(0, 5); r.deck(1, 5);
  for (let n = 0; n < 3; n++) r.put(`promotion-hand-${n}`, 0, "HAND");
  const source = r.put("promotion-source", 0, "CHARACTER", { schema: synSchema("promotion-source", [
    { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true, once_per_turn: true }, replacement_actions: [{ type: "DRAW", params: { amount: 1 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 } }] },
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "PLACE_SELF_AND_TRASH_TO_DECK", amount: 1, position } as Cost], actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ]) });
  r.put("promotion-trash-a", 0, "TRASH"); r.put("promotion-trash-b", 0, "TRASH");
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  const p = r.state.pendingPrompt!.options; if (p.promptType !== "SELECT_TARGET") throw new Error("missing selection");
  r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: p.validTargets.slice(0, 1) }, r.db);
  const arrange = r.state.pendingPrompt!.options; if (arrange.promptType !== "ARRANGE_TOP_CARDS") throw new Error("missing arrangement");
  r.state = command(r.state, { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: arrange.cards.map(c => c.instanceId), destination: position === "TOP" ? "bottom" : "top" }, r.db);
  const { repo, values } = memoryRepository();
  const raw = toPersistedGameState(r.state); expect(raw.schemaVersion).toBe(6);
  const valid7 = structuredClone(raw); valid7.schemaVersion = 7;
  const owner7 = valid7.effectStack.find(f => f.kind === "COST")!;
  if (owner7.costReplacementAction!.type !== "ARRANGE_TOP_CARDS") throw new Error("missing parked arrange");
  owner7.costReplacementAction!.destination = position === "TOP" ? "top" : "bottom";
  await repo.save({ state: raw, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [valid7, raw, valid7, raw] });
  // Storage ingress corpus includes entries beyond runtime retention; all must validate before bounding.
  values["session:undo-history"] = structuredClone([valid7, raw, valid7, raw]);
  return { r, source, repo, values };
}
describe.runIf(Boolean(process.env.OPT997_REGENERATE))("OPT997 actual first-load promotion", () => {
  for (const position of ["TOP", "BOTTOM"] as const) for (const decline of [false, true]) it(`${position} ${decline ? "decline" : "accept"}`, async () => {
    const { r, source, repo, values } = await pending6(position);
    const promotionSource = structuredClone(values);
    const loaded = (await repo.load())!;
    // Before the very first answer, every old and native undo entry is canonical7.
    for (const state of [loaded.state, ...loaded.undoHistory]) {
      expect(state.schemaVersion).toBe(7);
      const owner = state.effectStack.find(f => f.kind === "COST")!;
      expect(owner.costReplacementResolution).toBeUndefined();
      expect(owner.costReplacementAction!.type === "ARRANGE_TOP_CARDS" && owner.costReplacementAction!.destination).toBe(position.toLowerCase());
    }
    expect(values).toEqual(promotionSource); // load is not a storage repair.
    r.state = loaded.state;
    const initial = await capture(r); const steps: CostCorpus["steps"] = [];
    while (r.state.pendingPrompt) {
      const p = r.state.pendingPrompt.options;
      const action = p.promptType === "OPTIONAL_EFFECT" ? { type: "PLAYER_CHOICE" as const, choiceId: decline ? "skip" : "accept" }
        : p.promptType === "SELECT_TARGET" ? { type: "SELECT_TARGET" as const, selectedInstanceIds: p.validTargets.slice(0, p.countMin) } : null;
      if (!action) throw new Error("unexpected later prompt");
      r.state = command(r.state, action, r.db); const stored = await capture(r); steps.push({ action, expected: structuredClone(r.state), stored });
    }
    expect(r.state.effectStack).toHaveLength(0);
    expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(!decline);
    expect(r.state.players[0].hand).toHaveLength(decline ? 4 : 3);
    const family = `promotion-${position.toLowerCase()}-${decline ? "decline" : "accept"}`;
    const dir = resolve(process.env.OPT997_REGENERATE!); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${family}.json`), JSON.stringify({ family, promotionSource, initial, steps, sourceId: source.instanceId, owner: 0, decline, terminal: false }, null, 2) + "\n");
  });
  it("unprovable undo rejects atomically without dropping entries or mutating storage", async () => {
    const cases: { defect: string; original: Record<string, unknown>; expectedStorage: Record<string, unknown> }[] = [];
    for (const defect of ["foreign", "absent"]) {
      const { values } = await pending6("BOTTOM");
      const undo = values["session:undo-history"] as GameState[];
      const owner = undo[3].effectStack.find(f => f.kind === "COST")!;
      if (defect === "absent") delete owner.costReplacementAction;
      else owner.costReplacementAction = { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: ["foreign"], destination: "top" };
      const { repo, values: storage } = memoryRepository(values); const before = structuredClone(storage);
      await expect(repo.load()).rejects.toThrow(/legacy-debt.*unprovable/);
      expect(storage).toEqual(before); expect((storage["session:undo-history"] as GameState[])).toHaveLength(4);
      cases.push({ defect, original: before, expectedStorage: storage });
    }
    const dir = resolve(process.env.OPT997_REGENERATE!); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "promotion-unprovable-diagnostic.json"), JSON.stringify({ disposition: "atomic-legacy-debt-rejection", ...cases[0], cases }, null, 2) + "\n");
  });
});
