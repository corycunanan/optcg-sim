/** Synthetic production-writer traces from frozen historical battle inputs.
 * Run only at a committed producer head. No prompt/identity normalization.
 * node --import tsx scripts/capture-opt1003-promoted-battles.ts
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { SessionRepository } from "../src/session/persistence.js";
import { SessionCoordinator } from "../src/session/coordinator.js";
import { resumePromptLifecycle } from "../src/session/prompt-lifecycle.js";
import { MemorySessionStorage } from "../src/__tests__/fixtures/opt-940-synthetic-states.js";
import type { GameAction, GameState } from "../src/types.js";
const inputPath = "src/__tests__/fixtures/opt-966-final-writer-corpus.json.gz";
const outputPath =
  "src/__tests__/fixtures/opt-1003-promoted-battles.synthetic.json.gz";
const manifestPath =
  "src/__tests__/fixtures/opt-1003-promoted-battles.manifest.json";
const config = {
  nextJsUrl: "https://app.example.test",
  workerSecret: "secret",
};
const producerCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const inputBytes = readFileSync(inputPath);
const input = JSON.parse(gunzipSync(inputBytes).toString()) as Record<
  string,
  {
    cases: {
      index: number;
      stored: Record<string, unknown>;
      replies: GameAction[];
    }[];
  }
>;
async function main(): Promise<void> {
  const traces: {
    name: string;
    index: number;
    initialStored: Record<string, unknown>;
    steps: { action: GameAction; stored: Record<string, unknown> }[];
    final: GameState;
    promptAllocations: number;
  }[] = [];
  for (const [name, family] of Object.entries(input)) {
    if (!name.startsWith("opt966-battle-")) continue;
    for (const start of family.cases) {
      const storage = new MemorySessionStorage();
      await storage.put(structuredClone(start.stored));
      const repository = new SessionRepository(storage, config);
      let loaded = (await repository.load())!;
      let promptAllocations = 0;
      // Every saved return, including any real prompt-ID allocation, feeds the
      // next action. Existing historical prompt IDs remain exact; no fake IDs.
      if (loaded.state.pendingPrompt && !loaded.state.pendingPrompt.promptId)
        promptAllocations++;
      loaded = await repository.save({
        ...loaded,
        undoHistory: [loaded.state],
      });
      // Establish the symmetric undo boundary from the actual saved return,
      // after its prompt-ID allocation. The first save's earlier undo is a
      // distinct supported snapshot, not an equivalent-ID comparison target.
      loaded = await repository.save({
        ...loaded,
        undoHistory: [loaded.state],
      });
      const initialStored = structuredClone(Object.fromEntries(storage.data));
      const steps: { action: GameAction; stored: Record<string, unknown> }[] =
        [];
      for (const original of start.replies) {
        const action = {
          ...original,
          ...(loaded.state.pendingPrompt?.promptId
            ? { promptId: loaded.state.pendingPrompt.promptId }
            : {}),
        } as GameAction;
        const coordinated = new SessionCoordinator().executeAction(
          loaded.state,
          [],
          loaded.state.pendingPrompt!.respondingPlayer,
          action,
          loaded.cardDb
        );
        if (coordinated.kind !== "resume")
          throw new Error(
            `Expected prompt resume: ${name}/${start.index}: ${JSON.stringify(coordinated)}`
          );
        const resumed = resumePromptLifecycle(
          coordinated.state,
          action,
          loaded.cardDb,
          { drainPregame: (s) => s, advanceStartOfTurn: (s) => s }
        );
        if (resumed.responseRejected)
          throw new Error(`Rejected ${name}/${start.index}`);
        if (
          resumed.state.pendingPrompt &&
          !resumed.state.pendingPrompt.promptId
        )
          promptAllocations++;
        loaded = await repository.save({
          ...loaded,
          state: resumed.state,
          undoHistory: [resumed.state],
        });
        loaded = await repository.save({
          ...loaded,
          undoHistory: [loaded.state],
        });
        steps.push({
          action,
          stored: structuredClone(Object.fromEntries(storage.data)),
        });
        loaded = (await repository.load())!;
      }
      traces.push({
        name,
        index: start.index,
        initialStored,
        steps,
        final: loaded.state,
        promptAllocations,
      });
    }
  }
  const sourcePaths = execFileSync(
    "git",
    [
      "ls-files",
      "src/engine",
      "src/session",
      "src/types.ts",
      "../../shared/game-types.ts",
      "scripts/capture-opt1003-promoted-battles.ts",
      "src/__tests__/fixtures/opt-940-synthetic-states.ts",
      "src/__tests__/helpers.ts",
    ],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n");
  const sourceHashes = Object.fromEntries(
    sourcePaths.map((path) => [path, sha(readFileSync(path))])
  );
  const bytes = gzipSync(
    Buffer.from(
      JSON.stringify({ provenance: "synthetic", producerCommit, traces })
    ),
    { mtime: 0 } as never
  );
  writeFileSync(outputPath, bytes);
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        provenance: "synthetic",
        note: "Frozen historical inputs replayed through current production repository/coordinator/lifecycle. Not production captures.",
        producerCommit,
        sourceHashes,
        input: { path: inputPath, sha256: sha(inputBytes) },
        output: { path: outputPath, sha256: sha(bytes) },
        families: new Set(traces.map((t) => t.name)).size,
        traces: traces.length,
        transitions: traces.reduce((n, t) => n + t.steps.length, 0),
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    JSON.stringify({ producerCommit, traces: traces.length, outputPath })
  );
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
