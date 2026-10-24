import { withoutAssertedCostEvidence } from "./cost-expected-root-support.js";
/** Actual isolated writer captures; synthetic reachability, never production evidence. */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  assertCompletion,
  assertDonOffer,
  command,
  memory,
  runtime,
  save,
  type ProducerScenario,
} from "./native7-producer-support.js";
const directory = fileURLToPath(
  new URL("./fixtures/opt-969-native7-producers/", import.meta.url)
);
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const files = existsSync(directory)
  ? readdirSync(directory).filter(
      (f) => f !== "manifest.json" && f.endsWith(".json")
    )
  : [];
describe.each(files)("native7 future producers %s", (file) => {
  for (const context of [
    "live",
    "undo-first",
    "undo-later",
    "embedded",
  ] as const)
    it(`preserves every future boundary from ${context}`, async () => {
      const rt = await runtime(process.env.OPT969_REPLAY_ROOT);
      const corpus = JSON.parse(
        readFileSync(`${directory}/${file}`, "utf8")
      ) as ProducerScenario;
      const starts = [
        corpus.initial,
        ...corpus.steps.slice(0, -1).map((step) => step.stored),
      ];
      for (let start = 0; start < starts.length; start++) {
        let loaded = (await memory(rt, starts[start]).repo.load())!;
        if (context !== "live") {
          const baseline = (await memory(rt, corpus.initial).repo.load())!;
          const m = memory(rt);
          const undoHistory =
            context === "undo-first"
              ? [loaded.state]
              : [baseline.state, loaded.state];
          await m.repo.save({ ...baseline, undoHistory });
          if (context === "embedded") {
            (m.values.session as { undoHistory?: unknown }).undoHistory =
              m.values["session:undo-history"];
            delete m.values["session:undo-history"];
          }
          loaded = (await m.repo.load())!;
          const restored = new rt.SessionCoordinator().executeAction(
            loaded.state,
            loaded.undoHistory,
            corpus.payer,
            { type: "UNDO" },
            loaded.cardDb
          );
          expect(restored.kind).toBe("undo");
          loaded.state = restored.state;
        }
        for (const step of corpus.steps.slice(start)) {
          assertDonOffer(loaded.state);
          const next = command(rt, loaded.state, loaded.cardDb, step.action);
          const stored = await save(rt, next, loaded.cardDb);
          expect(
            withoutAssertedCostEvidence(stored),
            `${file} ${context} start${start} after ${step.action.type}`
          ).toEqual(step.stored);
          loaded = (await memory(rt, stored).repo.load())!;
        }
        const initial = (await memory(rt, corpus.initial).repo.load())!;
        await assertCompletion(
          rt,
          corpus,
          loaded.state,
          loaded.cardDb,
          initial.state
        );
      }
    });
});

it("preserves the original reported second meaningful choice from its saved first pause", async () => {
  const rt = await runtime(process.env.OPT969_REPLAY_ROOT);
  const corpus = JSON.parse(
    readFileSync(`${directory}/DON_MINUS-DON_MINUS-active.json`, "utf8")
  ) as ProducerScenario;
  const loaded = (await memory(rt, corpus.steps[0].stored).repo.load())!;
  expect(loaded.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  const next = command(rt, loaded.state, loaded.cardDb, corpus.steps[1].action);
  expect(next.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  expect(next.players[0].hand).toHaveLength(0);
  expect(
    withoutAssertedCostEvidence(await save(rt, next, loaded.cardDb))
  ).toEqual(corpus.steps[1].stored);
});

it("verifies immutable corpus, generator and producer patch hashes", () => {
  const manifest = JSON.parse(
    readFileSync(`${directory}/manifest.json`, "utf8")
  ) as {
    scenarios: number;
    startingBoundaries: number;
    payloads: Record<string, string>;
    generators: Record<string, string>;
    producerSource: { productionFromReaderBaseSha256: string };
  };
  expect(Object.keys(manifest.payloads).sort()).toEqual([...files].sort());
  expect(files).toHaveLength(manifest.scenarios);
  for (const [file, digest] of Object.entries(manifest.payloads))
    expect(sha(readFileSync(`${directory}/${file}`, "utf8"))).toBe(digest);
  // This replay assertion source changed for optional expected-root metadata.
  // The original capture source is archived byte-for-byte; reconstruct it by
  // copying the archive back to its original path before replaying the capture.
  for (const [file, digest] of Object.entries(manifest.generators)) {
    const original =
      file === "opt-969-native7-producers.test.ts"
        ? new URL(
            "./fixtures/opt-969-native7-producers/producer/opt-969-native7-producers.historical.test-source",
            import.meta.url
          )
        : new URL(file, import.meta.url);
    expect(sha(readFileSync(fileURLToPath(original), "utf8"))).toBe(digest);
  }
  expect(
    sha(readFileSync(`${directory}/producer/production-from-485.patch`, "utf8"))
  ).toBe(manifest.producerSource.productionFromReaderBaseSha256);
});
