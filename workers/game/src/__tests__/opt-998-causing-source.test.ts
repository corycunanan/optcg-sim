import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { convertPersistedGameState, SESSION_STORAGE_KEY, SESSION_CARD_DB_STORAGE_KEY, SESSION_UNDO_HISTORY_STORAGE_KEY, SessionRepository } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";

const corpus = JSON.parse(readFileSync(new URL("./fixtures/opt-963-5b-written-states.json", import.meta.url), "utf8"));
const source = { instanceId: "beckman", cardId: "OP09-009", cardType: "Character" };
function batchState() {
  const entry = structuredClone(corpus.cases["nested-batch-below-substitute-prompt"]);
  const frame = entry.state.effectStack.find((frame: { replacementBatch?: unknown }) => frame.replacementBatch);
  if (!frame) throw new Error("Missing historical batch fixture");
  return { entry, frame };
}
it("OPT-998 valid EffectSourceIdentity preserves complete writer bytes", () => {
  const { entry, frame } = batchState();
  frame.replacementBatch.causingSource = source;
  const first = JSON.stringify(toPersistedGameState(convertPersistedGameState(entry.state, "state")));
  if (process.env.OPT998_BASELINE_OUT) writeFileSync(process.env.OPT998_BASELINE_OUT, first + "\n");
  const golden = process.env.OPT998_BASELINE_OUT ? first : readFileSync(new URL("./fixtures/opt-998-valid-source.baseline.json", import.meta.url), "utf8").trimEnd();
  expect(first).toBe(golden);
  const second = JSON.stringify(toPersistedGameState(convertPersistedGameState(JSON.parse(first), "state")));
  expect(second).toBe(first);
  expect(JSON.parse(first).effectStack.find((f: { replacementBatch?: unknown }) => f.replacementBatch).replacementBatch.causingSource).toEqual(source);
});
for (const malformed of [null, [], "Character", {}, { ...source, cardType: "CHARACTER" }, { ...source, extra: true }, { ...source, instanceId: 1 }]) {
  for (const location of ["state", "undoHistory[0]"]) it(`OPT-998 rejects ${JSON.stringify(malformed)} in ${location} with frame and field`, async () => {
    const { entry, frame } = batchState();
    frame.replacementBatch.causingSource = malformed;
    const index = entry.state.effectStack.indexOf(frame);
    const storage = new MemorySessionStorage();
    const good = corpus.cases["nested-batch-below-substitute-prompt"];
    storage.data.set(SESSION_STORAGE_KEY, { formatVersion: 2, state: location === "state" ? entry.state : good.state, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null });
    storage.data.set(SESSION_CARD_DB_STORAGE_KEY, good.cardDb);
    storage.data.set(SESSION_UNDO_HISTORY_STORAGE_KEY, location === "state" ? [] : [entry.state]);
    const before = structuredClone(storage.data);
    await expect(new SessionRepository(storage, { nextJsUrl: "https://x.test", workerSecret: "s" }).load()).rejects.toMatchObject({ name: "SessionLoadError", location, reason: expect.stringContaining(`effectStack.${index}.replacementBatch.causingSource`) });
    expect(storage.data).toEqual(before);
  });
}
for (const [name, entry] of Object.entries(corpus.cases) as [string, { state: Record<string, unknown> }][]) it(`OPT-998 historical engine corpus remains readable: ${name}`, () => {
  expect(() => convertPersistedGameState(entry.state, "state")).not.toThrow();
});
