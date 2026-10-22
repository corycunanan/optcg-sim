/** Candidate-generated live+undo compatibility corpus. Exact states, IDs,
 * prompts and event logs are compared; COST debt is labeled, never completion. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import type { GameAction, GameState } from "../types.js";

const families = ["action-identity", "replacement-identity", "don-minus", "variable-three", "historical-bucket", "cost-child-replacement", "opponent-active-cost-area"] as const;
for (const family of families) for (const resumeUndo of [false, true]) {
  describe(`OPT-969 captured ${family}, undo=${resumeUndo}`, () => {
    it(family === "cost-child-replacement" ? "pins known OPT-997 owner leak, not completion" : "resumes exact persisted state through later pauses and completion", async () => {
      const path = fileURLToPath(new URL(`./fixtures/opt-969/${family}.json`, import.meta.url));
      const fixture: { initial: Record<string, unknown>; steps: { action: GameAction; expected: GameState }[] } = JSON.parse(readFileSync(path, "utf8"));
      const values = structuredClone(fixture.initial);
      const storage: SessionStorage = {
        async get<T>(key: string) { return values[key] as T | undefined; },
        async put(keyOrEntries: string | Record<string, unknown>, value?: unknown) {
          Object.assign(values, structuredClone(typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries));
        }, async setAlarm() {}, async deleteAlarm() {},
      };
      const repo = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "secret" });
      const loaded = (await repo.load())!;
      const stored = values.session as { state: GameState };
      expect(loaded.state).toEqual(stored.state);
      expect(loaded.undoHistory).toEqual([stored.state]);
      let state = resumeUndo ? loaded.undoHistory[0] : loaded.state;
      for (const step of fixture.steps) {
        expect(state.pendingPrompt).not.toBeNull();
        const result = resumePromptLifecycle(state, step.action, loaded.cardDb, {
          drainPregame: s => s, advanceStartOfTurn: s => s,
        });
        expect(result.responseRejected).toBe(false);
        const saved = await repo.save({ ...loaded, state: result.state, undoHistory: [] });
        state = toPersistedGameState(saved.state);
        expect(state).toEqual(step.expected);
        // Later pauses are persisted/reloaded too, not only the first one.
        state = (await repo.load())!.state;
        expect(state).toEqual(step.expected);
      }
      if (family === "opponent-active-cost-area") {
        expect(state.players[0].donCostArea).toHaveLength(stored.state.players[0].donCostArea.length);
        expect(state.players[1].donCostArea).toHaveLength(stored.state.players[1].donCostArea.length - 1);
        expect(state.players[1].donDeck).toHaveLength(stored.state.players[1].donDeck.length + 1);
      }
      expect(state.pendingPrompt).toBeNull();
      if (family === "cost-child-replacement") {
        // OPT-997: new DON prompt can reach existing prompting substitute debt.
        // The behavior writer remains blocked until its owner can settle.
        expect(state.effectStack.some(frame => frame.kind === "COST")).toBe(true);
      } else expect(state.effectStack).toHaveLength(0);
    });
  });
}
