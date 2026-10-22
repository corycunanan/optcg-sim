/** Assemble unchanged actual session outputs; never rewrites identities. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { join } from "node:path";
const [producer, behaviorDir, migrationDir, outputDir] = process.argv.slice(2);
if (!outputDir) throw new Error("Expected producer SHA, behavior dir, migration dir, fixture output dir");
const scenarios = [];
for (const file of readdirSync(behaviorDir).filter((name) => name.endsWith(".json")).sort()) {
  const captured = JSON.parse(readFileSync(join(behaviorDir, file), "utf8"));
  scenarios.push({ name: `behavior/${file}`, writerProducer: producer, cases: captured.cases, expected: captured.expected });
}
for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".json")).sort()) {
  const captured = JSON.parse(readFileSync(join(migrationDir, file), "utf8"));
  scenarios.push({ name: `migration/${file}`, writerProducer: producer,
    cases: captured.pauses.map((stored, index) => ({ index, stored, replies: captured.replies.slice(index) })), expected: captured.expected });
}
const bytes = gzipSync(JSON.stringify({ synthetic: true, writerProducer: producer, scenarios }));
const sha256 = createHash("sha256").update(bytes).digest("hex");
writeFileSync(join(outputDir, "opt-968-final-writer-corpus.json.gz"), bytes);
writeFileSync(join(outputDir, "opt-968-final-writer-corpus.manifest.json"), JSON.stringify({
  synthetic: true, writerProducer: producer, readerRollbackFloor: "4e082e56fa65f2c7c92aca145bc3ba0977ed193f", sha256,
  families: scenarios.length, startPauses: scenarios.reduce((n, scenario) => n + scenario.cases.length, 0),
  suffixReplies: scenarios.reduce((n, scenario) => n + scenario.cases.reduce((m, captured) => m + captured.replies.length, 0), 0),
  provenance: "Actual session writer outputs, authoritative save-returned runtime before migration first reply; no identity rewriting. Synthetic-only exception approved for OPT-968; no production capture.",
  familyCounts: scenarios.map((scenario) => ({ name: scenario.name, pauses: scenario.cases.length, suffixReplies: scenario.cases.reduce((n, captured) => n + captured.replies.length, 0) })),
}, null, 2) + "\n");
