import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { command, memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { frameKindOf } from "../engine/frame-kinds.js";
it("diagnoses runtime discriminant normalization separately from persisted ingress", async () => {
  const fixture: CostCorpus = JSON.parse(readFileSync(new URL("./fixtures/opt-997-v7-canonical/nested-replacement.json", import.meta.url), "utf8"));
  const { repo, values: writtenValues } = memoryRepository(fixture.steps[0].stored); const loaded = (await repo.load())!;
  let state = loaded.state; let found = false;
  for (const [index, step] of fixture.steps.slice(1).entries()) {
    state = command(state, step.action, loaded.cardDb);
    const mismatches = state.effectStack.filter(f => f.kind !== undefined && f.kind !== frameKindOf(f));
    if (mismatches.length) {
      found = true; const before = structuredClone(state);
      const saved = await repo.save({ ...loaded, state });
      // Validated native8 retains runtime identity; wire encoding owns canonical kinds.
      // Repository may compact history and allocate prompt IDs after validation.
      expect(saved.state.effectStack.find(f => f.id === mismatches[0].id)!.kind).toBe("EFFECT");
      expect((writtenValues.session as { state: typeof state }).state.effectStack.find(f => f.id === mismatches[0].id)!.kind).toBe("TRIGGER_DRAIN");
      expect((await repo.load())!.state.effectStack.find(f => f.id === mismatches[0].id)!.kind).toBe("TRIGGER_DRAIN");
      const { values } = memoryRepository({ ...fixture.steps[index + 1].stored });
      const storedBad = toPersistedGameState(before);
      storedBad.effectStack.find(f => f.id === mismatches[0].id)!.kind = "EFFECT";
      (values.session as { state: typeof state }).state = storedBad;
      await expect(memoryRepository(values).repo.load()).rejects.toThrow("declares kind EFFECT");
      // Strict stored ingress rejects contradictory kinds in all undo locations too.
      for (const embedded of [false, true]) {
        const malformed = structuredClone(writtenValues);
        if (embedded) (malformed.session as { undoHistory?: typeof state[] }).undoHistory = [storedBad];
        else malformed["session:undo-history"] = [storedBad];
        const untouched = structuredClone(malformed);
        await expect(memoryRepository(malformed).repo.load()).rejects.toThrow("declares kind EFFECT");
        expect(malformed).toEqual(untouched);
      }
      expect(() => convertPersistedGameState(toPersistedGameState(state), "encoded")).not.toThrow();
      expect(state).toEqual(before); break;
    }
    await repo.save({ ...loaded, state });
  }
  expect(found).toBe(true);
});
