/** Captures separate v6 output. Historical OPT-940..967 inputs stay immutable. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { SessionRepository } from "../src/session/persistence.js";
import { MemorySessionStorage } from "../src/__tests__/fixtures/opt-940-synthetic-states.js";
import { getSyntheticStates } from "../src/__tests__/fixtures/opt-940-golden.js";
async function main() {
const cases: Record<string, unknown> = {};
for (const entry of getSyntheticStates()) {
  const storage = new MemorySessionStorage();
  await new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).save(entry.snapshot);
  cases[entry.name] = {
    sessionJson: JSON.stringify(storage.data.get("session")),
    cardDbJson: JSON.stringify(storage.data.get("session:card-db")),
    undoHistoryJson: JSON.stringify(storage.data.get("session:undo-history")),
  };
}
writeFileSync(resolve(__dirname, "../src/__tests__/fixtures/opt-968-writer-golden.synthetic.json"), JSON.stringify({
  synthetic: true, producer: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), cases,
}) + "\n");

}
void main();
