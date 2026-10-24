/** Fresh f19 production output; historical corpus is read only as synthetic
 * initial card/resource definitions and reply recipes, never as an oracle. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  assertCompletion,
  assertDonOffer,
  command,
  memory,
  runtime,
  save,
  type ProducerScenario,
} from "./native7-producer-support.js";

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
const directory = resolve(
  __dirname,
  "fixtures/opt-969-history-reader/producers"
);

it("pins the new fixture bytes and capture sources to actual frozen f19 provenance", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(directory, "../manifest.json"), "utf8")
  ) as {
    producerCommit: string;
    fixtures: Record<string, string>;
    generators: Record<string, string>;
    seedRecipes: Record<string, string>;
    producerSources: Record<string, string>;
  };
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  expect(manifest.producerCommit).toBe(
    "f19da7bb59aa4ef30185ed1d0f029a87c7fe3a3c"
  );
  for (const [file, sha] of Object.entries(manifest.fixtures))
    expect(hash(readFileSync(resolve(directory, "..", file))), file).toBe(sha);
  for (const [file, sha] of Object.entries(manifest.generators))
    expect(hash(readFileSync(resolve(__dirname, file))), file).toBe(sha);
  for (const [file, sha] of Object.entries(manifest.seedRecipes))
    expect(
      hash(
        readFileSync(
          resolve(__dirname, "fixtures/opt-969-native7-producers", file)
        )
      ),
      file
    ).toBe(sha);
  const root = process.env.OPT969_HISTORY_PRODUCER_ROOT;
  if (root)
    for (const [file, sha] of Object.entries(manifest.producerSources))
      expect(hash(readFileSync(resolve(root, file))), file).toBe(sha);
});

async function fresh(id: string): Promise<ProducerScenario> {
  const root = process.env.OPT969_HISTORY_PRODUCER_ROOT;
  if (!root)
    return JSON.parse(readFileSync(resolve(directory, `${id}.json`), "utf8"));
  expect(
    execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim()
  ).toBe("f19da7bb59aa4ef30185ed1d0f029a87c7fe3a3c");
  const recipe = JSON.parse(
    readFileSync(
      resolve(__dirname, "fixtures/opt-969-native7-producers", `${id}.json`),
      "utf8"
    )
  ) as ProducerScenario;
  const producer = await runtime(root);
  let loaded = (await memory(producer, recipe.initial).repo.load())!;
  const result: ProducerScenario = {
    ...recipe,
    initial: await save(producer, loaded.state, loaded.cardDb),
    steps: [],
  };
  for (const step of recipe.steps) {
    const raw = { ...step.action } as typeof step.action & {
      promptId?: string;
    };
    delete raw.promptId;
    const action = {
      ...raw,
      ...(loaded.state.pendingPrompt?.promptId
        ? { promptId: loaded.state.pendingPrompt.promptId }
        : {}),
    };
    const next = command(producer, loaded.state, loaded.cardDb, action);
    const stored = await save(producer, next, loaded.cardDb);
    result.steps.push({ action, stored });
    loaded = (await memory(producer, stored).repo.load())!;
  }
  expect(loaded.state.pendingPrompt, id).toBeNull();
  if (process.env.OPT969_HISTORY_CAPTURE === "1") {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, `${id}.json`),
      JSON.stringify(result, null, 2) + "\n"
    );
  }
  return result;
}

for (const id of ids) {
  it(`actual f19 ${id}: every first/subsequent pause and reader successor completes independently`, async () => {
    const corpus = await fresh(id);
    const reader = await runtime();
    const initial = (await memory(reader, corpus.initial).repo.load())!;
    // Start at each actual producer boundary; remaining pauses are freshly
    // produced by this reader and reloaded before their own next reply.
    for (let start = 0; start < corpus.steps.length; start++) {
      let loaded = (await memory(
        reader,
        start ? corpus.steps[start - 1].stored : corpus.initial
      ).repo.load())!;
      for (const step of corpus.steps.slice(start)) {
        assertDonOffer(loaded.state);
        const next = command(reader, loaded.state, loaded.cardDb, step.action);
        loaded = (await memory(
          reader,
          await save(reader, next, loaded.cardDb)
        ).repo.load())!;
      }
      await assertCompletion(
        reader,
        corpus,
        loaded.state,
        loaded.cardDb,
        initial.state
      );
      const history = loaded.state.turn.actionsPerformedThisTurn;
      expect(new Set(history.map((a) => JSON.stringify(a))).size).toBe(
        history.length
      );
      if (id === "positive-ko-decline") {
        expect(
          history.filter((a) => a.actionType === "CHARACTER_KO")
        ).toHaveLength(1);
        expect(
          loaded.state.eventLog.filter((e) => e.type === "CARD_KO")
        ).toHaveLength(1);
      }
    }
  });
}

it("synthetic staged-only history stays private through actual replacement-child reload and COST abandon", async () => {
  const corpus = await fresh("fixed-accept-then-don");
  const reader = await runtime();
  let loaded = (await memory(reader, corpus.steps[0].stored).repo.load())!;
  const owner = loaded.state.effectStack.find(
    (f) => f.costTransactionState && f.costExpectedRoot
  )!;
  const transactionOnly = { actionType: "PASS" as const, timestamp: 777 };
  owner.costTransactionState!.turn = {
    ...owner.costTransactionState!.turn,
    actionsPerformedThisTurn: [
      ...loaded.state.turn.actionsPerformedThisTurn,
      transactionOnly,
    ],
  };
  const history = structuredClone(loaded.state.turn.actionsPerformedThisTurn);
  for (const step of corpus.steps.slice(1)) {
    const next = command(reader, loaded.state, loaded.cardDb, step.action);
    loaded = (await memory(
      reader,
      await save(reader, next, loaded.cardDb)
    ).repo.load())!;
    expect(loaded.state.turn.actionsPerformedThisTurn).toEqual(history);
  }
  expect(loaded.state.pendingPrompt).toBeNull();
  expect(loaded.state.effectStack).toEqual([]);
  const initial = (await memory(reader, corpus.initial).repo.load())!;
  await assertCompletion(
    reader,
    corpus,
    loaded.state,
    loaded.cardDb,
    initial.state
  );
  expect(
    loaded.state.activeEffects.filter(
      (effect) =>
        effect.sourceCardInstanceId === corpus.sourceId &&
        effect.modifiers.some(
          (modifier) => modifier.params?.usedOnTurn === loaded.state.turn.number
        )
    )
  ).toHaveLength(1);
});
