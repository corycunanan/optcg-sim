/** Ordinary7 first-load promotion from frozen historical6 inputs; explicit generation only. */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rig } from "./opt-960-rig.js";
import { capture, command, memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import { parseStoredSession } from "../session/persistence.js";
import type { GameState } from "../types.js";
async function pending6(position: "TOP" | "BOTTOM") {
  // Preserve the historical producer's exact source bytes. The ordinary7
  // writer may not manufacture a new saved6 pause to prove its own migration.
  const fixture = JSON.parse(readFileSync(new URL(`./fixtures/opt-997-v7-canonical/promotion-${position.toLowerCase()}-decline.json`, import.meta.url), "utf8")) as CostCorpus & { promotionSource: Record<string, unknown> };
  const { repo, values } = memoryRepository(fixture.promotionSource);
  const parsed = parseStoredSession(values.session, values["session:card-db"], values["session:undo-history"]);
  const r = rig(); r.state = parsed.state; r.db = new Map(Object.entries(parsed.cardDb));
  const source = r.state.players[0].characters.find(card => card?.instanceId === fixture.sourceId)!;
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
