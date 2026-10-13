/**
 * OPT-940 golden fixture access, shared by the opt-940 test files.
 *
 * This lives outside any *.test.ts file on purpose: importing a value from a
 * test file makes vitest register that file's describe blocks inside the
 * importer too, so the writer-golden suite (18 tests that each serialize the
 * 16 synthetic states) ran once per importing file. Under coverage on the CI
 * runner that pushed one of its tests past the 5 s default timeout.
 *
 * Both accessors are memoized per module instance (vitest isolates modules
 * per test file), so each file parses the 450 KB golden JSON once and builds
 * the 16 synthetic states (three of them through the real engine) once.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSyntheticSessionStates,
  type SyntheticSessionState,
} from "./opt-940-synthetic-states.js";

export const GOLDEN_BASE_COMMIT = "03071b6914c36349d0e81930a6f80bb530c713d9";

export interface GoldenFixture {
  provenance: string;
  capturedAtCommit: string;
  cases: Record<
    string,
    { shape: string; sessionJson: string; cardDbJson: string; undoHistoryJson: string }
  >;
}

let goldenFixture: GoldenFixture | undefined;
let syntheticStates: SyntheticSessionState[] | undefined;

export function loadGoldenFixture(): GoldenFixture {
  goldenFixture ??= JSON.parse(
    readFileSync(resolve(__dirname, "opt-940-writer-golden.synthetic.json"), "utf8")
  ) as GoldenFixture;
  return goldenFixture;
}

let v2WriterGolden: GoldenFixture | undefined;

/**
 * The current writer's golden (OPT-924, schema version 2), captured by
 * scripts/capture-writer-golden.ts from the same synthetic states. The
 * version 1 golden above stays frozen as base-writer reader input.
 */
export function loadWriterGolden(): GoldenFixture {
  v2WriterGolden ??= JSON.parse(
    readFileSync(resolve(__dirname, "opt-962-writer-golden.synthetic.json"), "utf8")
  ) as GoldenFixture;
  return v2WriterGolden;
}

/** The synthetic states, built on first use. Callers must not mutate them. */
export function getSyntheticStates(): SyntheticSessionState[] {
  syntheticStates ??= buildSyntheticSessionStates();
  return syntheticStates;
}
