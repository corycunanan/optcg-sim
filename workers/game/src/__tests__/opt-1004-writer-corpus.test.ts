import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";

import type { GameAction, GameState } from "../types.js";
import { convertPersistedGameState } from "../session/persistence.js";


const directory = resolve(__dirname, "fixtures/opt-1004-scheduled-writer");
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
const archive = JSON.parse(readFileSync(resolve(directory, "archive-manifest.json"), "utf8"));
type Stored = Record<string, unknown> & { session: { state: GameState } };
type Scenario = { initial: Stored; steps: { action: GameAction; player: 0 | 1; stored: Stored }[]; expectedDonEvents: number };
const corpus = JSON.parse(gunzipSync(readFileSync(resolve(directory, "cases.json.gz"))).toString()) as { provenance: string; cases: Record<string, Scenario> };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
it("pins actual isolated writer candidate, payload, patch and capture sources", () => {
  expect(manifest.producerCommit).toBe("71bb66df105a763ac2ab2cf1f5f3f4ccc286eabc");
  expect(manifest.readerBase).toBe("66df1d56f4768790c8f8f9eaaab0623c33abd251");
  expect(manifest.caseCount).toBe(Object.keys(corpus.cases).length);
  expect(manifest.snapshots).toBe(Object.values(corpus.cases).reduce((n, c) => n + 1 + c.steps.length, 0));
  expect(corpus.provenance).toContain("synthetic");
  for (const [file, sha] of Object.entries(manifest.fixtures)) expect(hash(readFileSync(resolve(directory, file))), file).toBe(sha);
  for (const [file, sha] of Object.entries(archive.files)) expect(hash(readFileSync(resolve(directory, file))), file).toBe(sha);
  expect(hash(readFileSync(resolve(directory, "sources/opt-1004-writer-producer.test-source")))).toBe(manifest.sourceHashes["workers/game/src/__tests__/opt-1004-writer-producer.test.ts"]);
});

it("obsolete draft9 scheduled metadata is rejected under deployed native9 meaning", () => {
  const scenario = Object.values(corpus.cases)[0];
  const values = scenario.steps.find(step => step.stored.session.state.scheduledActions.some(action => action.sourceCardSnapshot))!.stored;
  expect(() => convertPersistedGameState(values.session.state, "draft9")).toThrow(/sourceCardSnapshot requires schemaVersion 10/);
});
