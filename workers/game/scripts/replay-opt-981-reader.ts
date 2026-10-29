/** Replay immutable writer bytes using ONLY the explicitly selected reader's
 * runtime modules. Run from workers/game with node --import tsx. */
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
async function main() {
  const reader = resolve(process.argv[2]);
  const corpus = JSON.parse(gunzipSync(readFileSync(process.argv[3] ?? "src/__tests__/fixtures/opt-981-writer-produced.json.gz")).toString());
  const sha = execFileSync("git", ["-C", reader, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(sha, corpus.deployedReaderSha, "must replay exact deployed reader");
  assert.equal(execFileSync("git", ["-C", reader, "diff", "HEAD", "--name-only"], { encoding: "utf8" }).trim(), "", "reader tracked sources must be clean");
  const load = (path: string) => import(pathToFileURL(resolve(reader, "workers/game/src", path)).href);
  const { SessionRepository } = await load("session/persistence.ts");
  const { SessionCoordinator } = await load("session/coordinator.ts");
  const { resumePromptLifecycle } = await load("session/prompt-lifecycle.ts");
  let replayed = 0;
  for (const record of corpus.records) {
    // pre10→post11 producer receipts are retained as evidence, not replayed on
    // the deliberately disabled reader. All native11 snapshots must load.
    for (const position of ["before", "after"]) {
      const data = new Map<string, unknown>(Object.entries(structuredClone(record[position])));
      const storage = { async get(key: string) { return data.get(key); }, async put(key: string | Record<string, unknown>, value?: unknown) {
        for (const [k, v] of typeof key === "string" ? [[key, value]] : Object.entries(key)) data.set(k as string, structuredClone(v));
      }, async setAlarm() {}, async deleteAlarm() {} };
      const repo = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "synthetic" });
      const loaded = await repo.load(); assert.ok(loaded, record.name);
      if (position === "after" || !record.replay) continue;
      const coordinator = new SessionCoordinator();
      const result = coordinator.executeAction(loaded.state, loaded.undoHistory, record.owner, record.action, loaded.cardDb);
      assert.notEqual(result.kind, "reject", record.name);
      let state = result.state;
      if (result.kind === "resume") {
        const resumed = resumePromptLifecycle(state, record.action, loaded.cardDb, {
          drainPregame: (s: unknown) => s,
          advanceStartOfTurn: (s: unknown) => coordinator.advanceStartOfTurn(s, loaded.cardDb),
        });
        assert.equal(resumed.responseRejected, false, record.name); state = resumed.state;
      }
      await repo.save({ ...loaded, state, undoHistory: result.undoHistory });
      assert.deepEqual(JSON.parse(JSON.stringify(Object.fromEntries(data))), record.after, record.name);
      replayed++;
    }
  }
  console.log(JSON.stringify({ readerSha: sha, producerSourceSha: corpus.producerSourceSha, recordsLoaded: corpus.records.length * 2, actionsReplayed: replayed }));
}
void main();
