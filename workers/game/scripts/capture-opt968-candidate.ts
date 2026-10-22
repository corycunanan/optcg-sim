/** Separate OPT-968 candidate expectations. Never overwrites historic inputs.
 * Run only after reviewing exact delta report against the scheduling contract.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { SessionRepository } from "../src/session/persistence.js";
import { resumePromptLifecycle } from "../src/session/prompt-lifecycle.js";
import { toPersistedGameState } from "../src/session/game-state-schema.js";
import { MemorySessionStorage } from "../src/__tests__/fixtures/opt-940-synthetic-states.js";
import {
  getSyntheticStates,
  loadV5WriterGolden,
} from "../src/__tests__/fixtures/opt-940-golden.js";
import { buildV2EndPhaseStates } from "../src/__tests__/fixtures/opt-962-v2-states.js";
import type { GameAction, GameState } from "../src/types.js";
const dir = resolve(__dirname, "../src/__tests__/fixtures");
const outputDir = process.env.OPT968_CANDIDATE_OUTPUT_DIR ?? dir;
const config = {
  nextJsUrl: "https://app.example.test",
  workerSecret: "secret",
};
const services = {
  drainPregame: (state: GameState) => state,
  advanceStartOfTurn: (state: GameState) => state,
};
function storageFor(stored: Record<string, unknown>) {
  const storage = new MemorySessionStorage();
  for (const [key, value] of Object.entries(stored))
    storage.data.set(key, structuredClone(value));
  return storage;
}
const read = (name: string) =>
  JSON.parse(readFileSync(resolve(dir, name), "utf8"));
const values: Record<string, unknown> = {};
const deltas: Record<string, unknown> = {};
function diff(a: unknown, b: unknown, path = ""): unknown[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return [{ path, before: a, after: b }];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
    diff(Reflect.get(a, key), Reflect.get(b, key), `${path}/${key}`)
  );
}
function record(key: string, value: unknown, old: unknown) {
  values[key] = structuredClone(value);
  const delta = diff(old, value);
  if (delta.length && !key.startsWith("golden/")) deltas[key] = delta;
}
async function main() {
  for (const entry of getSyntheticStates()) {
    const storage = new MemorySessionStorage();
    await new SessionRepository(storage, config).save(entry.snapshot);
    const actual = {
      sessionJson: JSON.stringify(storage.data.get("session")),
      cardDbJson: JSON.stringify(storage.data.get("session:card-db")),
      undoHistoryJson: JSON.stringify(storage.data.get("session:undo-history")),
    };
    const old = loadV5WriterGolden().cases[entry.name];
    record(`golden/${entry.name}`, actual, {
      sessionJson: old.sessionJson,
      cardDbJson: old.cardDbJson,
      undoHistoryJson: old.undoHistoryJson,
    });
    // Decoded delta provides field-level evidence rather than opaque JSON strings.
    deltas[`golden-decoded/${entry.name}`] = (
      Object.keys(actual) as (keyof typeof actual)[]
    ).flatMap((key) =>
      diff(JSON.parse(old[key]), JSON.parse(actual[key]), key)
    );
  }
  const oldStates = read("opt-966-end-phase-states.synthetic.json");
  for (const item of buildV2EndPhaseStates())
    record(
      `endphase/${item.name}`,
      JSON.parse(JSON.stringify(toPersistedGameState(item.state))),
      oldStates.cases[item.name].state
    );
  type Corpus = {
    cases: {
      index: number;
      stored: Record<string, unknown>;
      replies: GameAction[];
    }[];
    expected: GameState;
  };
  async function replay(
    prefix: string,
    corpus: Corpus,
    promptPrefix?: string,
    absent = false
  ) {
    const oldPauses = await Promise.all(
      corpus.cases.map(
        async (item) =>
          (await new SessionRepository(storageFor(item.stored), config).load())!
            .state
      )
    );
    for (const item of corpus.cases) {
      const loaded = (await new SessionRepository(
        storageFor(item.stored),
        config
      ).load())!;
      let actual = loaded.state;
      for (const [offset, action] of item.replies.entries()) {
        actual.pendingPrompt!.promptId = promptPrefix
          ? `${promptPrefix}-${item.index + offset}`
          : oldPauses[item.index + offset].pendingPrompt!.promptId;
        const storage = new MemorySessionStorage();
        await new SessionRepository(storage, config).save({
          ...loaded,
          state: actual,
          undoHistory: [actual],
        });
        actual = (await new SessionRepository(storage, config).load())!.state;
        record(
          `${prefix}/${item.index}/pause/${offset}`,
          actual,
          oldPauses[item.index + offset]
        );
        if (absent)
          for (const frame of actual.effectStack)
            if (frame.phaseBoundaryContinuation)
              delete frame.phaseBoundaryContinuation.stage;
        const result = resumePromptLifecycle(
          actual,
          action,
          loaded.cardDb,
          services
        );
        if (result.responseRejected)
          throw new Error(`rejected ${prefix}/${item.index}/${offset}`);
        actual = result.state;
      }
      record(`${prefix}/${item.index}/final`, actual, corpus.expected);
    }
  }
  const finals = JSON.parse(
    gunzipSync(
      readFileSync(resolve(dir, "opt-966-final-writer-corpus.json.gz"))
    ).toString()
  ) as Record<string, Corpus>;
  for (const [name, corpus] of Object.entries(finals))
    await replay(`final/${name}`, corpus);
  for (const [name, file, prompt] of [
    ["absent legacy stage", "legacy-absent", "crossbuild"],
    ["explicit legacy stage", "legacy-explicit", "crossbuild"],
    ["turn handoff", "handoff", "crossbuild"],
    ["phase", "endphase", "crossbuild-phase"],
    ["Life", "life", "crossbuild"],
    ["replacement", "replacement", "crossbuild"],
    ["scheduled watcher", "scheduled-watcher", "crossbuild"],
  ])
    await replay(
      `future/${name}`,
      read(`opt-966-${file}-writer.json`),
      prompt,
      name === "absent legacy stage"
    );
  await replay(
    "event-owner",
    read("opt-966-counter-prefix-writer.json"),
    "crossbuild"
  );
  const bytes = gzipSync(JSON.stringify(values));
  writeFileSync(resolve(outputDir, "opt-968-candidate-expectations.json.gz"), bytes);
  writeFileSync(
    resolve(outputDir, "opt-968-candidate-deltas.json"),
    JSON.stringify(deltas, null, 2) + "\n"
  );
  writeFileSync(
    resolve(outputDir, "opt-968-candidate-expectations.manifest.json"),
    JSON.stringify(
      {
        provenance:
          "synthetic, separate candidate expectations; historical inputs frozen",
        base: "4e082e56fa65f2c7c92aca145bc3ba0977ed193f",
        producerRevision: process.env.OPT968_PRODUCER_REVISION ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        inputSha256: Object.fromEntries(["opt-966-final-writer-corpus.json.gz", "opt-966-end-phase-states.synthetic.json", "opt-966-writer-golden.synthetic.json", "opt-966-legacy-absent-writer.json", "opt-966-legacy-explicit-writer.json", "opt-966-handoff-writer.json", "opt-966-endphase-writer.json", "opt-966-life-writer.json", "opt-966-replacement-writer.json", "opt-966-scheduled-watcher-writer.json", "opt-966-counter-prefix-writer.json"].map(name => [name, createHash("sha256").update(readFileSync(resolve(dir, name))).digest("hex")])),
        producerDiffSha256: createHash("sha256")
          .update(execFileSync("git", ["diff", "--binary", "--", "workers/game/src/engine", "workers/game/src/session", "shared"]))
          .digest("hex"),
        expectationSha256: createHash("sha256").update(bytes).digest("hex"),
        expectationCount: Object.keys(values).length,
        changedKeys: Object.keys(deltas).filter(
          (key) => (deltas[key] as unknown[]).length
        ),
      },
      null,
      2
    ) + "\n"
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
