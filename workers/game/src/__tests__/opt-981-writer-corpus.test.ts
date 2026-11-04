import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { SessionRepository } from "../session/persistence.js";
import { command } from "./fixtures/opt-981-writer.js";
const bytes = readFileSync(new URL("./fixtures/opt-981-writer-produced.json.gz", import.meta.url));
const corpus = JSON.parse(gunzipSync(bytes).toString());

describe("OPT-981 immutable actual writer corpus", () => {
  it("pins the producing runtime and distinguishes public producer receipts from reader replays", () => {
    expect(corpus.producerSourceSha).toMatch(/^[0-9a-f]{40}$/);
    expect(corpus.producerRuntimeSha256).toBe(createHash("sha256").update(readFileSync(new URL("../engine/phases.ts", import.meta.url))).digest("hex"));
    expect(corpus.deployedReaderSha).toBe("8c8a80bdf93c0d095d10f100feb3e31c60aa3e61");
    const promoted = corpus.records.filter((record: { before: Record<string, { state?: { schemaVersion?: number } }>; after: Record<string, { state?: { schemaVersion?: number } }> }) =>
      record.before["session"].state?.schemaVersion === 10 && record.after["session"].state?.schemaVersion === 11);
    expect(promoted).toHaveLength(10);
    expect(corpus.records.filter((record: { replay: boolean }) => record.replay)).toHaveLength(32);
  });

  it("loads every live/undo envelope and exactly replays each recorded native11 action", async () => {
    for (const record of corpus.records) {
      const storage = new MemorySessionStorage();
      for (const [key, value] of Object.entries(record.before)) storage.data.set(key, value);
      const repository = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "synthetic" });
      const before = (await repository.load())!;
      if (record.replay) {
        const result = command(before.state, before.cardDb, before.undoHistory, record.owner, record.action);
        await repository.save({ ...before, state: result.state, undoHistory: result.history });
        expect(JSON.parse(JSON.stringify(Object.fromEntries(storage.data))), record.name).toEqual(record.after);
      }
      for (const [key, value] of Object.entries(record.after)) storage.data.set(key, value);
      expect(await repository.load(), record.name).not.toBeNull();
    }
  });
});
