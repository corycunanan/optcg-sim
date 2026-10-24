/** Fresh current ordinary7 output on a separately selected deployed reader.
 * Historical inputs supply only synthetic cards/resources and reply recipes;
 * exact resources/history/IDs and legal next action are independent assertions. */
import { afterAll, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  runtime,
  memory,
  command,
  save,
  assertCompletion,
  assertDonOffer,
  type ProducerScenario,
  type Runtime,
} from "./native7-producer-support.js";
import { generateCounter } from "./history-counter-producer.js";
import type { GameState } from "../types.js";
const ids = [
  "fixed-prefix",
  "DON_MINUS-DON_MINUS-active",
  "branch-don",
  "choose-one-don",
  "nested-trigger-parent",
  "selected-prefix-trigger-don",
  "positive-ko-decline",
  "fixed-decline-then-don",
  "fixed-accept-then-don",
  "held-duration-groups",
  "terminal-cost-suppresses-don",
  "accepted-fixed-don-prefix-rollback",
];
const contexts = [
  "live",
  "undo-first",
  "undo-later",
  "embedded-first",
  "embedded-later",
];
const receipts: {
  id: string;
  sha256: string;
  steps: number;
  continuationActions: number;
  storageContextRuns: Record<string, number>;
}[] = [];
const root = resolve(__dirname, "../../../..");
const readerRoot = process.env.OPT969_WRITER_READER_ROOT;
async function generate(id: string) {
  const recipe = JSON.parse(
    readFileSync(
      resolve(__dirname, "fixtures/opt-969-native7-producers", `${id}.json`),
      "utf8"
    )
  ) as ProducerScenario;
  const writer = await runtime();
  let loaded = (await memory(writer, recipe.initial).repo.load())!;
  expect(loaded.state.schemaVersion).toBe(7);
  const result: ProducerScenario = {
    ...recipe,
    initial: await save(writer, loaded.state, loaded.cardDb),
    steps: [],
  };
  for (const step of recipe.steps) {
    const action = { ...step.action };
    if ("promptId" in action) delete action.promptId;
    const next = command(writer, loaded.state, loaded.cardDb, action);
    const stored = await save(writer, next, loaded.cardDb);
    result.steps.push({ action, stored });
    loaded = (await memory(writer, stored).repo.load())!;
  }
  return result;
}
async function restore(
  reader: Runtime,
  bytes: Record<string, unknown>,
  context: string
) {
  const loaded = (await memory(reader, bytes).repo.load())!;
  if (context === "live") return loaded;
  const wrapper: GameState = {
    ...loaded.state,
    pendingPrompt: null,
    effectStack: [],
    turn: { ...loaded.state.turn, battle: null, battleSubPhase: null },
  };
  const m = memory(reader);
  await m.repo.save({
    ...loaded,
    state: wrapper,
    undoHistory: context.endsWith("first")
      ? [loaded.state]
      : [wrapper, loaded.state],
  });
  if (context.startsWith("embedded")) {
    (m.values.session as { undoHistory?: unknown }).undoHistory =
      m.values["session:undo-history"];
    delete m.values["session:undo-history"];
  }
  const restored = (await m.repo.load())!;
  // These are legal synthetic undo wrappers, not claims that every paused
  // activation or terminal position is naturally undoable through the UI.
  const undone = new reader.SessionCoordinator().executeAction(
    restored.state,
    restored.undoHistory,
    restored.state.turn.activePlayerIndex,
    { type: "UNDO" },
    restored.cardDb
  );
  expect(undone.kind).toBe("undo");
  return { ...restored, state: undone.state };
}
for (const id of ids)
  it(`FINAL ordinary7 ${id}: deployed reader successors from all live/undo boundaries`, async () => {
    const corpus = await generate(id);
    const reader = await runtime(readerRoot);
    const initial = (await memory(reader, corpus.initial).repo.load())!;
    let actions = 0;
    const storageContextRuns: Record<string, number> = {};
    for (const context of contexts)
      for (let start = 0; start < corpus.steps.length; start++) {
        storageContextRuns[context] = (storageContextRuns[context] ?? 0) + 1;
        let loaded = await restore(
          reader,
          start ? corpus.steps[start - 1].stored : corpus.initial,
          context
        );
        for (const step of corpus.steps.slice(start)) {
          assertDonOffer(loaded.state);
          const next = command(
            reader,
            loaded.state,
            loaded.cardDb,
            step.action
          );
          loaded = (await memory(
            reader,
            await save(reader, next, loaded.cardDb)
          ).repo.load())!;
          actions++;
        }
        await assertCompletion(
          reader,
          corpus,
          loaded.state,
          loaded.cardDb,
          initial.state
        );
        const history = loaded.state.turn.actionsPerformedThisTurn;
        expect(
          new Set(history.map((record) => JSON.stringify(record))).size
        ).toBe(history.length);
        if (id === "positive-ko-decline") {
          expect(
            history.filter((record) => record.actionType === "CHARACTER_KO")
          ).toHaveLength(1);
          expect(
            loaded.state.eventLog.filter((event) => event.type === "CARD_KO")
          ).toHaveLength(1);
        }
      }
    receipts.push({
      id,
      sha256: createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),
      steps: corpus.steps.length,
      continuationActions: actions,
      storageContextRuns,
    });
  });
afterAll(async () => {
  const output = process.env.OPT969_WRITER_EVIDENCE_OUTPUT;
  if (!output) return;
  const manifest = JSON.parse(
    readFileSync(
      resolve(__dirname, "fixtures/opt-969-history-reader/manifest.json"),
      "utf8"
    )
  ) as { producerSources: Record<string, string> };
  const sourceFiles = [
    ...Object.keys(manifest.producerSources),
    "workers/game/src/session/version7-promotion.ts",
    "workers/game/src/__tests__/opt-969-writer-history-interop.test.ts",
    "workers/game/src/__tests__/history-counter-producer.ts",
    "workers/game/src/__tests__/opt-969-history-reader.test.ts",
  ];
  const hashes = Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(resolve(root, file)))
        .digest("hex"),
    ])
  );
  const head = (path: string) =>
    execFileSync("git", ["-C", path, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  writeFileSync(
    output,
    JSON.stringify(
      {
        producerCommit: head(root),
        readerCommit: head(readerRoot ?? root),
        synthetic: true,
        contexts,
        counterSha256: createHash("sha256")
          .update(JSON.stringify(await generateCounter()))
          .digest("hex"),
        sources: hashes,
        recipes: receipts,
        continuationActions: receipts.reduce(
          (n, r) => n + r.continuationActions,
          0
        ),
      },
      null,
      2
    ) + "\n"
  );
});
