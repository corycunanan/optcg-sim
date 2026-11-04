/** Empirical synthetic storage/counter measurements; no production-capture claim. */
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import {
  buildSyntheticSessionStates,
  MemorySessionStorage,
} from "../src/__tests__/fixtures/opt-940-synthetic-states.js";
import { SessionRepository } from "../src/session/persistence.js";
async function measure(
  build: typeof buildSyntheticSessionStates,
  Repository: typeof SessionRepository
) {
  const rows = [];
  for (const entry of build()) {
    const storage = new MemorySessionStorage();
    const repo = new Repository(storage, {
      nextJsUrl: "https://app.example.test",
      workerSecret: "secret",
    });
    const start = performance.now();
    await repo.save(entry.snapshot);
    const saveMs = performance.now() - start;
    const beforeLoad = performance.now();
    const restored = (await repo.load())!;
    const loadMs = performance.now() - beforeLoad;
    rows.push({
      name: entry.name,
      bytes: Object.fromEntries(
        [...storage.data].map(([key, value]) => [
          key,
          Buffer.byteLength(JSON.stringify(value)),
        ])
      ),
      saveMs,
      loadMs,
      stackDepth: restored.state.effectStack.length,
      idCounter: restored.state.executionContext.idCounter,
      clockCounter: restored.state.executionContext.clockCounter,
      actionBudget: restored.state.executionContext.actionBudget,
    });
  }
  return rows;
}
async function main() {
  const current = await measure(buildSyntheticSessionStates, SessionRepository);
  const root = process.env.OPT967_BASELINE_ROOT;
  const baseline = root
    ? await measure(
        (
          await import(
            `${root}/workers/game/src/__tests__/fixtures/opt-940-synthetic-states.ts`
          )
        ).buildSyntheticSessionStates,
        (await import(`${root}/workers/game/src/session/persistence.ts`))
          .SessionRepository
      )
    : undefined;
  writeFileSync(
    process.env.OPT967_METRICS_OUTPUT!,
    JSON.stringify(
      {
        baseline: "a38be3a10cca8138e627fc4b7be23c9717893039",
        synthetic: true,
        current,
        baselineRows: baseline,
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
