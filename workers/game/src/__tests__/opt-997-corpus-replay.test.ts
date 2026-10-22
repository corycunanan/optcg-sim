/** Actual candidate-produced bytes, resumed from every pause on live/undo ingress. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { command, memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { SessionCoordinator } from "../session/coordinator.js";
import type { GameState } from "../types.js";
const dir = fileURLToPath(new URL("./fixtures/opt-997-v7/", import.meta.url));
const historical = JSON.parse(readFileSync(new URL("./fixtures/opt-969/action-identity.json", import.meta.url), "utf8")).initial;
for (const file of readdirSync(dir).filter(f => f.endsWith(".json") && f !== "manifest.json")) {
  const fixture: CostCorpus = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
  describe(`OPT-997 actual producer ${fixture.family}`, () => {
    for (let pause = 0; pause < fixture.steps.length; pause++) for (const ingress of ["live", "undo", "mixed-live", "mixed-undo"] as const) it(`pause ${pause}, ${ingress}`, async () => {
      const values = structuredClone(pause ? fixture.steps[pause - 1].stored : fixture.initial);
      const current = (values.session as { state: GameState }).state;
      if (ingress === "mixed-live") values["session:undo-history"] = [(historical.session as { state: GameState }).state];
      if (ingress === "mixed-undo") (values.session as { state: GameState }).state = (historical.session as { state: GameState }).state;
      const { repo } = memoryRepository(values);
      const loaded = (await repo.load())!;
      let state = ingress.endsWith("undo") ? loaded.undoHistory[0] : loaded.state;
      expect(state).toEqual(current); expect(state.schemaVersion).toBe(7);
      for (const step of fixture.steps.slice(pause)) {
        const before = structuredClone(state);
        const invalid = new SessionCoordinator().executeAction(state, [], state.pendingPrompt!.respondingPlayer === 0 ? 1 : 0, step.action, loaded.cardDb);
        expect(invalid.kind).toBe("reject"); expect(state).toEqual(before);
        state = command(state, step.action, loaded.cardDb);
        const saved = await repo.save({ ...loaded, state, undoHistory: [] });
        await repo.save({ ...saved, undoHistory: [saved.state] });
        state = toPersistedGameState(saved.state);
        expect(state).toEqual(step.expected);
        const reloaded = (await repo.load())!;
        expect(reloaded.state).toEqual(state); expect(reloaded.undoHistory).toEqual([state]);
        expect(state.schemaVersion).toBe(7);
      }
      if (fixture.knownDebt) {
        expect(state.pendingPrompt).toBeNull();
        expect(state.effectStack.some(f => f.kind === "COST" && f.costReplacementResolution === undefined)).toBe(true);
        return; // Diagnostic parity only: deliberately not semantic completion.
      }
      expect(state.effectStack).toHaveLength(0); expect(state.pendingPrompt).toBeNull();
      // Independent publication contract: one aggregate event per hand/deck
      // trash action, in action order; no staged REST_DON publication on abort.
      const eventTypes = fixture.family === "terminal-immediate" ? ["CARD_TRASHED", "GAME_OVER"]
        : fixture.family === "terminal-after-child" ? ["CARD_TRASHED", "CARD_TRASHED", "GAME_OVER"]
        : fixture.family === "two-child-result-ref" ? ["CARD_TRASHED", "CARD_TRASHED", "POWER_MODIFIED"]
        : fixture.family === "nested-replacement" ? ["CARD_TRASHED", "CARD_TRASHED"]
        : fixture.family === "later-cost-replacement" ? ["CARD_TRASHED", "CARD_TRASHED", "CARD_TRASHED", "CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE"]
        : fixture.decline ? ["CARD_TRASHED", "CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE"]
        : fixture.family === "picker-action" ? ["DON_DETACHED", "CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE"]
        : fixture.family === "picker-replacement" ? ["DON_DETACHED"]
        : fixture.family.startsWith("picker-") ? ["DON_DETACHED", "CARD_TRASHED", "CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE"]
        : ["CARD_TRASHED"];
      expect(state.eventLog.map(event => event.type)).toEqual(eventTypes);
      if (fixture.terminal) {
        expect(state.status).toBe("FINISHED");
        expect(state.eventLog.filter(e => e.type === "GAME_OVER")).toHaveLength(1);
      } else if (fixture.family.startsWith("picker-")) {
        const returned = fixture.family === "picker-fixed" ? 2 : 1;
        expect(state.players[0].donDeck).toHaveLength((fixture.initial.session as { state: GameState }).state.players[0].donDeck.length + returned);
        expect(state.players[0].hand).toHaveLength(fixture.family === "picker-action" ? 5 : 4);
      } else {
        expect(state.players[fixture.owner].characters.some(c => c?.instanceId === fixture.sourceId)).toBe(!fixture.decline);
        expect(state.players[0].donCostArea.filter(d => d.state === "RESTED")).toHaveLength(fixture.decline ? 1 : 0);
        expect(state.turn.oncePerTurnUsed.activate?.includes(fixture.sourceId) ?? false).toBe(fixture.decline);
        const expectedHand = fixture.family === "two-child-result-ref" || fixture.family === "nested-replacement" ? 2 : fixture.decline ? 5 : 2;
        expect(state.players[fixture.owner].hand).toHaveLength(expectedHand);
        if (fixture.family === "two-child-result-ref") expect(state.activeEffects.some(e => e.sourceCardInstanceId === fixture.sourceId && e.modifiers.some(m => m.type === "MODIFY_POWER" && m.params?.amount === 1000))).toBe(true);
        const legal = command(state, { type: "ATTACH_DON", targetInstanceId: state.players[0].leader.instanceId, count: 1 }, loaded.cardDb);
        const battle = command(legal, { type: "DECLARE_ATTACK", attackerInstanceId: legal.players[0].leader.instanceId, targetInstanceId: legal.players[1].leader.instanceId }, loaded.cardDb);
        command(battle, { type: "PASS" }, loaded.cardDb, 1);
      }
    });
  });
}

it("pins every full candidate payload and the reproducible producer source patch", () => {
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8")) as { files: { file: string; sha256: string; pauses: number; replayStarts: number; disposition: string }[]; producerPatchSha256: string; supportedFamilies: number; diagnosticFamilies: number; pauseCount: number; replayStarts: number };
  for (const entry of manifest.files) {
    const bytes = readFileSync(`${dir}/${entry.file}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    expect((JSON.parse(bytes.toString()) as CostCorpus).steps).toHaveLength(entry.pauses);
    expect(entry.replayStarts).toBe(entry.pauses * 4);
  }
  expect(createHash("sha256").update(readFileSync(`${dir}/producer-from-b4ed425.patch`)).digest("hex")).toBe(manifest.producerPatchSha256);
  expect(manifest.files.filter(f => f.disposition === "supported-completion")).toHaveLength(18);
  expect(manifest.files.filter(f => f.disposition === "legacy-unknown-diagnostic")).toHaveLength(1);
  expect(manifest.pauseCount).toBe(44); expect(manifest.replayStarts).toBe(176);
});
