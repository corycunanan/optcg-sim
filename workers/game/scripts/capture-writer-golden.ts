/**
 * Capture the persistence writer's exact output for the OPT-940 synthetic
 * states into src/__tests__/fixtures/opt-962-writer-golden.synthetic.json
 * (the current, version 2 writer; OPT-924). Set GOLDEN_OUTPUT to write
 * elsewhere. opt-940-writer-golden.synthetic.json is frozen: it holds the
 * version 1 bytes the base writer (03071b69) wrote and is the version 1
 * reader input; never re-capture it with a version 2 writer.
 *
 * Run from workers/game:  node --import tsx scripts/capture-writer-golden.ts
 *
 * Re-run this ONLY in a PR that deliberately changes what the writer emits
 * (a game-state schema version bump). opt-940-writer-golden.test.ts fails
 * whenever the current writer's bytes differ from this file, which is the
 * "writers are unchanged" proof for reader-only PRs. The fixture header
 * records the commit whose writer produced the bytes.
 *
 * To add a case in a reader-only PR without moving that commit: materialize
 * the writer files of the recorded commit over the working tree (`git show
 * <commit>:workers/game/src/session/persistence.ts > src/session/persistence.ts`,
 * same for persisted-game-state.ts and types.ts), run with
 * `GOLDEN_WRITER_COMMIT=<commit>`, then restore HEAD's files.
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SESSION_CARD_DB_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  SESSION_UNDO_HISTORY_STORAGE_KEY,
  SessionRepository,
} from "../src/session/persistence.js";
import {
  MemorySessionStorage,
  buildSyntheticSessionStates,
} from "../src/__tests__/fixtures/opt-940-synthetic-states.js";

const outputPath = resolve(
  process.cwd(),
  process.env.GOLDEN_OUTPUT ?? "src/__tests__/fixtures/opt-962-writer-golden.synthetic.json"
);

async function main(): Promise<void> {
  const capturedAt =
    process.env.GOLDEN_WRITER_COMMIT ??
    execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const cases: Record<
    string,
    { shape: string; sessionJson: string; cardDbJson: string; undoHistoryJson: string }
  > = {};
  for (const { name, shape, snapshot } of buildSyntheticSessionStates()) {
    const storage = new MemorySessionStorage();
    const repository = new SessionRepository(storage, {
      nextJsUrl: "https://app.example.test",
      workerSecret: "secret",
    });
    await repository.save(snapshot);
    cases[name] = {
      shape,
      sessionJson: JSON.stringify(storage.data.get(SESSION_STORAGE_KEY)),
      cardDbJson: JSON.stringify(storage.data.get(SESSION_CARD_DB_STORAGE_KEY)),
      undoHistoryJson: JSON.stringify(storage.data.get(SESSION_UNDO_HISTORY_STORAGE_KEY)),
    };
  }
  const fixture = {
    provenance: "synthetic",
    note: "Real engine states and constructed shapes serialized through the persistence writer. Not a captured Durable Object session.",
    capturedAtCommit: capturedAt,
    cases,
  };
  writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote ${Object.keys(cases).length} cases to ${outputPath} at ${capturedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
