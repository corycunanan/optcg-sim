/** Package the separately captured final writer; historical payloads are read-only. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { resolve } from "node:path";
const [captureDirectory, producer] = process.argv.slice(2);
if (!captureDirectory || !/^[a-f0-9]{40}$/.test(producer ?? "")) throw new Error("usage: tsx scripts/package-opt1006-final-corpus.ts CAPTURE_DIRECTORY PRODUCER_SHA");
const fixtureDirectory = new URL("../src/__tests__/fixtures/", import.meta.url);
const historical = JSON.parse(gunzipSync(readFileSync(new URL("opt-1006-writer-corpus.json.gz", fixtureDirectory))).toString());
const corpus = Object.fromEntries(Object.keys(historical).map(name => {
  const captured = JSON.parse(readFileSync(resolve(captureDirectory, name), "utf8"));
  if (captured.producer !== producer) throw new Error(`producer mismatch: ${name}`);
  return [name, captured];
}));
const payload = gzipSync(JSON.stringify(corpus) + "\n");
writeFileSync(new URL("opt-1006-final-writer-corpus.json.gz", fixtureDirectory), payload);
const manifest = {
  synthetic: true,
  producer,
  rollbackFloor: "d8309e70fef64a133ce19d8a2bd327bb625e56fb",
  sha256: createHash("sha256").update(payload).digest("hex"),
  generatorSha256: createHash("sha256").update(readFileSync(new URL("../src/__tests__/opt-1001-field-trash.test.ts", import.meta.url))).digest("hex"),
  provenance: "Separate final writer source8 setup; canonical authoritative Repository/Coordinator/save/load/reply chain. Historical corpus unchanged. Minimal synthetic sessions under user-approved exception; not production captures.",
  reproduction: [
    `OPT1001_WRITE_CORPUS=CAPTURE_DIRECTORY OPT1001_PRODUCER_SHA=${producer} pnpm --filter optcg-game exec vitest run src/__tests__/opt-1001-field-trash.test.ts`,
    `pnpm --filter optcg-game exec node --import tsx scripts/package-opt1006-final-corpus.ts CAPTURE_DIRECTORY ${producer}`,
  ],
  families: Object.fromEntries(Object.entries(corpus).map(([name, capture]) => {
    const typed = capture as { producer: string; cases: { stored: { session: { state: { schemaVersion: number } } } }[] };
    return [name, { producer: typed.producer, starts: typed.cases.length, native9Starts: typed.cases.filter(entry => entry.stored.session.state.schemaVersion === 9).length }];
  })),
};
writeFileSync(new URL("opt-1006-final-writer-corpus.manifest.json", fixtureDirectory), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ sha256: manifest.sha256, families: Object.keys(corpus).length, starts: Object.values(manifest.families).reduce((sum, entry) => sum + entry.starts, 0) }));
