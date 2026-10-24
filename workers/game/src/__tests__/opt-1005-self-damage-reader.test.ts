/** Reader-only prerequisite. Synthetic actual OP14-115 candidate writer output
 * dd3b17f5539ffa7449a18f11ed9a8113d7378d80; not a production capture. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CardData, GameState } from "../types.js";
import { SessionRepository, convertPersistedGameState } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
const corpus = JSON.parse(readFileSync(new URL("./fixtures/opt-1005-self-damage-writer.json", import.meta.url), "utf8")) as {
  window: GameState; completed: GameState; cardDb: Record<string, CardData>;
};
const db = () => new Map(Object.entries(corpus.cardDb));
const fresh = () => structuredClone(corpus.window);
function resume(state: GameState, reveal: boolean) {
  const result = resumePromptLifecycle(state, { type: "REVEAL_TRIGGER", reveal }, db(), {
    drainPregame: s => s, advanceStartOfTurn: s => s,
  });
  expect(result.responseRejected).toBe(false);
  return result.state;
}
function damageIndex(state: GameState) { return state.effectStack.findIndex(f => !!f.effectDamage); }
describe("OPT-1005 reader-only self-damage parent compatibility", () => {
  it.each([false, true])("loads candidate live and undo, then completes each (accept %s)", async reveal => {
    const storage = new MemorySessionStorage();
    const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
    await repo.save({ state: fresh(), cardDb: db(), mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [fresh()] });
    const before = structuredClone(storage.data);
    const loaded = await repo.load();
    expect(loaded).not.toBeNull();
    expect(storage.data).toEqual(before);
    for (const state of [loaded!.state, loaded!.undoHistory[0]]) {
      expect(state.effectStack[damageIndex(state)].effectDamage).toMatchObject({ damagedPlayerIndex: 1, controllerIndex: 1, dealt: 1, remainingDamages: 0 });
      const end = resume(state, reveal);
      expect(end.effectStack).toEqual([]);
      expect(end.pendingPrompt).toBeNull();
      expect(end.turn.triggerStagingInstanceIds ?? []).toEqual([]);
      expect(end.players[1].life).toEqual([]);
      expect(end.eventLog.filter(e => e.type === "CARD_REMOVED_FROM_LIFE")).toHaveLength(1);
      expect(end.players[1].trash.filter(c => c.cardId === "OP14-116")).toHaveLength(reveal ? 1 : 0);
      expect(end.players[1].hand).toHaveLength(state.players[1].hand.length + 1);
      expect(corpus.completed.schemaVersion).toBe(6);
      expect(end.schemaVersion).toBe(7);
      if (reveal) expect(toPersistedGameState(end)).toEqual({ ...corpus.completed, schemaVersion: 7 });
    }
  });
  it.each(["DRAW", "KO", "MILL"])("rejects a %s parent", type => {
    const state = fresh();
    state.effectStack[damageIndex(state) - 1].pausedAction = { type, params: { amount: 1 } } as never;
    expect(() => convertPersistedGameState(state, "state")).toThrow(/not an effect chain paused on DEAL_DAMAGE or SELF_TAKE_DAMAGE/);
  });
  it("keeps DEAL_DAMAGE parents readable", () => {
    const state = fresh();
    state.effectStack[damageIndex(state) - 1].pausedAction = { type: "DEAL_DAMAGE", params: { amount: 1 } };
    expect(() => convertPersistedGameState(state, "state")).not.toThrow();
  });
  it("rejects a non-chain parent kind even with the self-damage action", () => {
    const state = fresh();
    state.effectStack[damageIndex(state) - 1].kind = "EFFECT";
    expect(() => convertPersistedGameState(state, "state")).toThrow(/kind|TRIGGER_DRAIN/);
  });
  it("rejects an orphan reference", () => {
    const state = fresh(); state.effectStack[damageIndex(state)].effectDamage!.parentFrameId = "missing-parent";
    expect(() => convertPersistedGameState(state, "state")).toThrow(/not the frame directly below/);
  });
  it("rejects a real parent that is no longer adjacent", () => {
    const state = fresh(); const index = damageIndex(state);
    state.effectStack.splice(index, 0, { ...structuredClone(state.effectStack[index - 1]), id: "intervening-chain" });
    expect(() => convertPersistedGameState(state, "state")).toThrow(/not the frame directly below/);
  });
});

// The same parent reference remains meaningful while the accepted Life Trigger
// owns its own prompt above the damage frame (TRIGGER_EFFECT).
it("loads candidate child-prompt live and undo and finishes the existing damage owner", async () => {
  const child = JSON.parse(readFileSync(new URL("./fixtures/opt-1005-self-damage-child-writer.json", import.meta.url), "utf8")) as {
    childPrompt: GameState; completed: GameState; cardDb: Record<string, CardData>;
  };
  const cards = new Map(Object.entries(child.cardDb));
  const storage = new MemorySessionStorage();
  const repo = new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" });
  await repo.save({ state: structuredClone(child.childPrompt), cardDb: cards, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [structuredClone(child.childPrompt)] });
  const loaded = await repo.load();
  expect(loaded).not.toBeNull();
  for (const state of [loaded!.state, loaded!.undoHistory[0]]) {
    expect(state.effectStack.find(f => !!f.effectDamage)?.effectDamage?.stage).toBe("TRIGGER_EFFECT");
    expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const result = resumePromptLifecycle(state, { type: "PASS" }, cards, { drainPregame: s => s, advanceStartOfTurn: s => s });
    expect(result.responseRejected).toBe(false);
    expect(child.completed.schemaVersion).toBe(6);
    expect(result.state.schemaVersion).toBe(7);
    expect(toPersistedGameState(result.state)).toEqual({ ...child.completed, schemaVersion: 7 });
    expect(result.state.effectStack).toEqual([]);
    expect(result.state.pendingPrompt).toBeNull();
    expect(result.state.turn.triggerStagingInstanceIds ?? []).toEqual([]);
  }
});
