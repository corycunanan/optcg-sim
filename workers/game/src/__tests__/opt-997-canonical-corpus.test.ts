import { writerEnvelope } from "./opt-1003-writer-expectations.js";
import { withoutAssertedCostEvidence } from "./cost-expected-root-support.js";
/** Frozen actual-writer bytes replay through production activation; cost modes and all gameplay fields remain exact. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { memoryRepository, command, type CostCorpus } from "./opt-997-corpus-support.js";
import { parseStoredSession, convertPersistedGameState } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import type { GameState } from "../types.js";
const dir = fileURLToPath(new URL("./fixtures/opt-997-v7-canonical/", import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith(".json") && f !== "manifest.json" && !f.includes("-diagnostic"));
for (const file of files) {
  const f: CostCorpus & { promotionSource?: Record<string, unknown> } = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
  describe(`canonical actual producer ${f.family}`, () => {
    for (let pause = 0; pause < f.steps.length; pause++) for (const ingress of ["live", "undo-first", "undo-later", "embedded-undo"] as const) it(`${pause}/${ingress}`, async () => {
      const values = structuredClone(pause ? f.steps[pause - 1].stored : f.initial);
      const expected = (values.session as { state: GameState }).state;
      const other = structuredClone(expected); other.schemaVersion = 6;
      // Historical ordinary6 control with no new-format metadata.
      other.effectStack = []; other.pendingPrompt = null;
      const undo = ingress === "undo-first" || ingress === "embedded-undo" ? [expected] : [other, expected];
      if (ingress === "embedded-undo") (values.session as { undoHistory: GameState[] }).undoHistory = undo;
      else values["session:undo-history"] = undo;
      const { repo } = memoryRepository(values); const loaded = (await repo.load())!;
      let state = ingress === "live" ? loaded.state : loaded.undoHistory.at(-1)!;
      expect(state).toEqual(writerEnvelope(expected));
      for (const step of f.steps.slice(pause)) {
        state = command(state, step.action, loaded.cardDb);
        const saved = await repo.save({ ...loaded, state, undoHistory: [state] });
        state = toPersistedGameState(saved.state);
        expect(withoutAssertedCostEvidence(state)).toEqual(writerEnvelope(step.expected));
        expect((await repo.load())!.state).toEqual(state);
      }
      if (f.knownDebt) {
        expect(state.effectStack.some(frame => frame.kind === "COST" && !frame.costReplacementResolution)).toBe(true);
      } else { expect(state.effectStack).toHaveLength(0); expect(state.pendingPrompt).toBeNull(); }
    });
    if (f.promotionSource) it("production activation preserves legacy cost mode and absent outcomes without rewriting original input bytes", async () => {
      const values = structuredClone(f.promotionSource!); const before = structuredClone(values);
      const loaded = (await memoryRepository(values).repo.load())!;
      expect(loaded.state.schemaVersion).toBe(8);
      expect(loaded.state.costSemanticsVersion).toBe(6);
      expect(loaded.state.effectStack.find(frame => frame.kind === "COST")!.costReplacementResolution).toBeUndefined();
      expect(values).toEqual(before); // Runtime activation never rewrites the original storage input.
    });
  });
}

it("pins the complete candidate payload file set and bytes", () => {
  const m = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
  expect(readdirSync(dir).filter(f => f.endsWith(".json") && f !== "manifest.json").sort()).toEqual(m.files.map((f: { file: string }) => f.file).sort());
  for (const f of m.files) expect(createHash("sha256").update(readFileSync(`${dir}/${f.file}`)).digest("hex")).toBe(f.sha256);
  expect(createHash("sha256").update(readFileSync(`${dir}/producer.patch`)).digest("hex")).toBe(m.producerPatchSha256);
});

// Every captured parked grammar, before and after an outcome, rejects malformed
// live and ALL undo entries, including an index beyond the retained undo limit.
for (const file of files) {
  const f: CostCorpus = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
  const snapshots = [f.initial, ...f.steps.map(s => s.stored)];
  for (const [index, values] of snapshots.entries()) {
    const good = (values.session as { state: GameState }).state;
    const ownerIndex = good.effectStack.findIndex(frame => frame.costReplacementAction);
    if (ownerIndex < 0) continue;
    it(`${f.family} parked${index} strict live/allundo before retention`, () => {
      const mutations = ["deleted", "missing", "unchecked", "wrong-stage", "foreign", "duplicate", "destination"];
      for (const mutation of mutations) {
        const raw = structuredClone(good); const owner = raw.effectStack[ownerIndex];
        const action = owner.costReplacementAction!;
        if (mutation === "deleted") delete owner.costReplacementAction;
        if (mutation === "missing") owner.costReplacementAction = { type: action.type } as never;
        if (mutation === "unchecked") owner.costReplacementChecked = false;
        if (mutation === "wrong-stage") owner.phase = "AWAITING_TARGET_SELECTION";
        if (mutation === "foreign") owner.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: ["foreign"] };
        if (mutation === "duplicate") owner.costReplacementAction = { type: "SELECT_TARGET", selectedInstanceIds: [owner.validTargets[0] ?? "x", owner.validTargets[0] ?? "x"] };
        if (mutation === "destination") {
          if (action.type === "ARRANGE_TOP_CARDS") owner.costReplacementAction = { ...action, destination: action.destination === "top" ? "bottom" : "top" };
          else if (action.type === "PLAYER_CHOICE") owner.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "cost-life:[]:TOP" };
          else owner.costReplacementAction = { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: [...owner.validTargets], destination: "bottom" };
        }
        expect(() => convertPersistedGameState(raw, "state"), mutation).toThrow();
        for (const undoIndex of [0, 3]) for (const embedded of [false, true]) {
          const session = structuredClone(values.session) as { undoHistory?: GameState[] };
          const undo = Array.from({ length: 4 }, () => structuredClone(good)); undo[undoIndex] = raw;
          if (embedded) session.undoHistory = undo;
          expect(() => parseStoredSession(session, values["session:card-db"], undo), `${mutation}/${undoIndex}/${embedded}`).toThrow();
        }
      }
    });
  }
}

it("retains unprovable legacy promotion input for reader6 recovery without silently repairing it", async () => {
  const f = JSON.parse(readFileSync(`${dir}/promotion-unprovable-diagnostic.json`, "utf8"));
  for (const diagnostic of f.cases) {
    const original = structuredClone(diagnostic.original);
    const { repo, values } = memoryRepository(original); const loaded = (await repo.load())!;
    expect(loaded.state.schemaVersion).toBe(8);
      expect(loaded.state.costSemanticsVersion).toBe(6); expect(values).toEqual(diagnostic.expectedStorage);
  }
  expect(f.disposition).toBe("atomic-legacy-debt-rejection");
});

for (const family of ["fixed-accept", "selected-accept", "compound-select", "compound-arrange", "opponent-life"]) it(`${family} validates exact caller before optional substitute side effects`, async () => {
  const f: CostCorpus = JSON.parse(readFileSync(`${dir}/${family}.json`, "utf8"));
  const values = [f.initial, ...f.steps.map(s => s.stored)].find(v => (v.session as { state: GameState }).state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")!;
  const loaded = (await memoryRepository(values).repo.load())!;
  const state = structuredClone(loaded.state);
  state.effectStack.find(frame => frame.kind === "COST")!.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "foreign" };
  const before = structuredClone(state);
  expect(() => command(state, { type: "PLAYER_CHOICE", choiceId: "accept" }, loaded.cardDb)).toThrow(/Invalid replacement caller/);
  expect(state).toEqual(before); // Includes usage, RNG, IDs, stack, events and prompt.
});
