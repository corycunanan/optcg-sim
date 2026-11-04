/** Capture separate OPT-966 current-writer goldens; never overwrite v1–v4 inputs.
 * Run from workers/game: node --import tsx scripts/capture-opt966-compat-goldens.ts
 * Synthetic scenarios only, not production captures or rollback certification.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { buildV2EndPhaseStates } from "../src/__tests__/fixtures/opt-962-v2-states.js";
import { toPersistedGameState } from "../src/session/game-state-schema.js";
import { convertPersistedGameState } from "../src/session/persistence.js";
import { resumePromptLifecycle } from "../src/session/prompt-lifecycle.js";
import type { CardData, GameAction } from "../src/types.js";

execFileSync("git", ["diff", "--exit-code", "HEAD", "--", "src", "scripts"]);
const writerProducer = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const root = "src/__tests__/fixtures/";
const write = (name: string, body: object) => writeFileSync(root + name, JSON.stringify({ provenance: "synthetic", writerProducer, ...body }, null, 2) + "\n");
write("opt-966-end-phase-states.synthetic.json", {
  note: "Actual current writer End Phase pauses. Historical v2 inputs remain frozen.",
  cases: Object.fromEntries(buildV2EndPhaseStates().map(s => [s.name, { shape: s.shape, state: toPersistedGameState(s.state) }])),
});
const fixture = JSON.parse(readFileSync(root + "opt-965-battle-debt.synthetic.json", "utf8"));
const state = convertPersistedGameState(structuredClone(fixture.state), "state");
const result = resumePromptLifecycle(state, fixture.reply as GameAction, new Map(Object.entries(fixture.cardDb)) as Map<string, CardData>, { drainPregame: s => s, advanceStartOfTurn: s => s });
write("opt-966-legacy-battle-result.synthetic.json", {
  inputFixture: "opt-965-battle-debt.synthetic.json",
  note: "Current writer resumes immutable v4 input. Ordinary owner allocation consumes one frame ID before replacement-generated card IDs. No IDs normalized.",
  state: result.state,
});
execFileSync(process.execPath, ["--import", "tsx", "scripts/capture-writer-golden.ts"], {
  env: { ...process.env, GOLDEN_OUTPUT: root + "opt-966-writer-golden.synthetic.json", GOLDEN_WRITER_COMMIT: writerProducer },
  stdio: "inherit",
});
