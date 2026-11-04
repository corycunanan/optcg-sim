/** Immutable d9a924 forward writer corpus; compare whole saved states/events/
 * contexts, never normalize mode7 payloads into mode8 expectations. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runtime, memory, save, command } from "./native7-producer-support.js";
import { getEffectiveCost, getEffectivePower } from "../engine/modifiers.js";
import type { GameAction } from "../types.js";
const directory = fileURLToPath(new URL("./fixtures/opt-969-mode8/", import.meta.url));
const files = readdirSync(directory).filter(f => f.endsWith(".json") && f !== "manifest.json");
interface Corpus { id: string; producer: string; origin: Record<string, unknown>; activation: GameAction; initial: Record<string, unknown>; steps: { action: GameAction; stored: Record<string, unknown> }[] }
for (const file of files) describe(`mode8 reader ${file}`, () => {
  for (const context of ["live", "undo-first", "undo-later", "embedded"] as const) it(`resumes every starting boundary via ${context}`, async () => {
    const rt = await runtime(process.env.OPT969_MODE8_REPLAY_ROOT);
    const corpus = JSON.parse(readFileSync(`${directory}/${file}`, "utf8")) as Corpus;
    const starts = [corpus.initial, ...corpus.steps.slice(0, -1).map(step => step.stored)];
    for (let start = 0; start < starts.length; start++) {
      let loaded = (await memory(rt, starts[start]).repo.load())!;
      if (context !== "live") {
        // Synthetic undo history placement exercises repository/UNDO restoration;
        // the live wrapper is the actual stable pre-activation origin, not a
        // claim that UI undo can run while a prompt is active.
        const first = (await memory(rt, corpus.origin).repo.load())!;
        const m = memory(rt);
        await m.repo.save({ ...first, undoHistory: context === "undo-first" ? [loaded.state] : [first.state, loaded.state] });
        if (context === "embedded") {
          (m.values.session as { undoHistory?: unknown }).undoHistory = m.values["session:undo-history"];
          delete m.values["session:undo-history"];
        }
        loaded = (await m.repo.load())!;
        const undone = new rt.SessionCoordinator().executeAction(loaded.state, loaded.undoHistory, loaded.state.turn.activePlayerIndex, { type: "UNDO" }, loaded.cardDb);
        expect(undone.kind).toBe("undo"); loaded.state = undone.state;
      }
      for (const [index, step] of corpus.steps.slice(start).entries()) {
        expect(loaded.state.pendingPrompt, `${file} start${start} step${index}`).not.toBeNull();
        loaded.state = command(rt, loaded.state, loaded.cardDb, step.action);
        const stored = await save(rt, loaded.state, loaded.cardDb);
        expect(stored, `${file} ${context} start${start} step${index}`).toEqual(step.stored);
        loaded = (await memory(rt, stored).repo.load())!;
      }
      expect(loaded.state.pendingPrompt).toBeNull(); expect(loaded.state.effectStack).toHaveLength(0);
      const origin = (await memory(rt, corpus.origin).repo.load())!.state;
      const p = loaded.state.players[0];
      if (corpus.id.startsWith("life-") || corpus.id === "fresh-don-life-watcher") {
        const declined = corpus.id.endsWith("decline");
        const ordinary = corpus.id === "life-face-down";
        expect(p.life).toHaveLength(declined ? 1 : 0);
        expect(p.deck).toHaveLength(declined ? 5 : ordinary ? 4 : 6);
        expect(p.hand).toHaveLength(ordinary ? 1 : 0);
        expect(p.trash).toHaveLength(ordinary ? 1 : 0);
      }
      if (["don-optional", "don-later-selection", "don-variable", "don-choice"].includes(corpus.id)) {
        const donor = origin.players[0].leader.attachedDon[0];
        const active = origin.players[0].donCostArea[0];
        expect(p.leader.attachedDon).toHaveLength(0);
        expect(p.donDeck.map(d => d.instanceId)).toContain(donor.instanceId);
        expect(p.donCostArea).toEqual([{ ...active, state: "RESTED" }]);
        expect(p.hand).toHaveLength(1);
      }
      if (corpus.id.includes("saved-field-domain")) {
        const cardId = corpus.id.split("-saved")[0];
        expect(p.characters.some(c => c?.cardId === cardId)).toBe(true);
        expect(p.leader.attachedDon).toHaveLength(0);
        expect(p.donCostArea).toEqual(origin.players[0].donCostArea);
        expect(p.hand).toHaveLength(0);
        expect(loaded.state.eventLog.filter(e => e.type === "DON_DETACHED")).toHaveLength(1);
      }
      if (corpus.id === "EB02-061-authored-active-trigger") {
        const luffy = p.characters.find(c => c?.cardId === "EB02-061")!;
        expect(luffy.state).toBe("ACTIVE"); expect(p.donCostArea).toHaveLength(0);
        expect(p.leader.attachedDon).toEqual(origin.players[0].leader.attachedDon);
        expect(p.life).toHaveLength(0); expect(p.hand).toHaveLength(1);
        expect(loaded.state.turn.oncePerTurnUsed.when_attacking_untap_life).toContain(luffy.instanceId);
      }
      if (corpus.id === "synthetic-replacement-don-cost-owner") {
        expect(p.characters.some(c => c?.cardId === "OP17-043")).toBe(true);
        expect(p.leader.attachedDon).toHaveLength(0); expect(p.hand).toHaveLength(0);
        expect(p.donCostArea).toEqual(origin.players[0].donCostArea);
        expect(p.donDeck).toHaveLength(origin.players[0].donDeck.length + 1);
      }
      expect(loaded.state.costSemanticsVersion).toBe(8);
      if (corpus.id.startsWith("graph-")) {
        expect(p.life).toHaveLength(0); expect(p.deck).toHaveLength(6); expect(p.hand).toHaveLength(0);
      }
      if (corpus.id.startsWith("authored-oden-ganzui-")) {
        const accepted = corpus.id.endsWith("accept"); const oden = p.characters.find(c => c?.cardId === "ST22-005")!;
        expect(oden.state).toBe(accepted ? "RESTED" : "ACTIVE");
        expect(p.characters.some(c => c?.cardId === "OP17-043")).toBe(accepted);
        expect(p.hand).toHaveLength(accepted ? 1 : 4);
        expect(p.donCostArea.filter(d => d.state === "RESTED")).toHaveLength(accepted ? 0 : 3);
        expect(loaded.state.turn.oncePerTurnUsed.activate_set_active?.includes(oden.instanceId) ?? false).toBe(!accepted);
      }
      if (corpus.id === "authored-hakuba-kyros-replaced-ko") {
        expect(p.characters.some(c => c?.cardId === "OP04-082")).toBe(true);
        expect(p.leader.state).toBe("RESTED");
        expect(loaded.state.eventLog.some(e => e.type === "CARD_KO")).toBe(false);
        const target = loaded.state.players[1].characters.find(c => c?.cardId === "hakuba-opponent")!;
        expect(getEffectiveCost(loaded.cardDb.get(target.cardId)!, loaded.state, target.instanceId, loaded.cardDb)).toBe(6);
      }
      if (corpus.id.startsWith("authored-kaido-")) {
        expect(p.characters.some(c => c?.cardId === "EB04-030")).toBe(true);
        expect(p.leader.attachedDon).toHaveLength(0);
        expect(p.donCostArea).toEqual(origin.players[0].donCostArea);
        expect(p.donDeck).toHaveLength(origin.players[0].donDeck.length + 1);
        const ownTurn = { ...loaded.state, turn: { ...loaded.state.turn, activePlayerIndex: 0 as const } };
        const leaderData = loaded.cardDb.get(p.leader.cardId)!;
        expect(getEffectivePower(p.leader, leaderData, ownTurn, loaded.cardDb)).toBe(leaderData.power);
        expect(loaded.state.eventLog.some(e => e.type === "CARD_KO")).toBe(false);
      }
      if (corpus.id === "terminal-before-life") {
        expect(loaded.state.status).toBe("FINISHED"); expect(p.deck).toHaveLength(0);
        expect(p.life).toHaveLength(1); expect(p.hand).toHaveLength(0);
      }
    }
  });
});

it("pins immutable producer payloads and generator", () => {
  const manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, "utf8")) as { producer: string; scenarios: string[]; payloads: Record<string,string>; generatorSha256: string };
  expect(manifest.producer).toBe("d9a92467049c1c36b195f2808d867a7e7398f337");
  expect(files.sort()).toEqual(Object.keys(manifest.payloads).sort());
  for (const [file, sha] of Object.entries(manifest.payloads)) expect(createHash("sha256").update(readFileSync(`${directory}/${file}`)).digest("hex")).toBe(sha);
  expect(createHash("sha256").update(readFileSync(`${directory}/producer/generate.test-source`)).digest("hex")).toBe(manifest.generatorSha256);
  const source = JSON.parse(readFileSync(`${directory}/producer/metadata.json`, "utf8"));
  expect(source.producer).toBe(manifest.producer); expect(source.generatorSha256).toBe(manifest.generatorSha256);
  expect(createHash("sha256").update(readFileSync(`${directory}/producer/production-from-2ca.patch`)).digest("hex")).toBe(source.productionPatchSha256);
  expect(source.onlyRuntimeDifferences.map((row: { path: string }) => row.path).sort()).toEqual([
    "workers/game/src/engine/authored-schemas.generated.ts", "workers/game/src/engine/schemas/eb02.ts", "workers/game/src/engine/schemas/op12.ts", "workers/game/src/engine/schemas/op15.ts", "workers/game/src/engine/setup.ts",
  ]);
});
