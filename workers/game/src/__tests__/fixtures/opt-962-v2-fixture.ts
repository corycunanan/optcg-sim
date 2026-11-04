/**
 * Access to the OPT-962 version 2 End Phase fixture
 * (`opt-962-v2-states.json`). Every state in it is SYNTHETIC: produced by the
 * real End Phase of the PR 4b prototype (commit in `producedAtCommit`) and
 * labelled `schemaVersion: 2` exactly as the PR 4b writer labels it. Lives
 * outside any *.test.ts file so importers do not re-register suites.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface V2EndPhaseFixture {
  provenance: string;
  producedAtCommit: string;
  cases: Record<string, { shape: string; state: Record<string, unknown> }>;
}

let fixture: V2EndPhaseFixture | undefined;

export function loadV2EndPhaseFixture(): V2EndPhaseFixture {
  fixture ??= JSON.parse(
    readFileSync(resolve(__dirname, "opt-962-v2-states.json"), "utf8")
  ) as V2EndPhaseFixture;
  return fixture;
}

/** A fresh deep copy of one stored v2 state (safe to mutate). */
export function v2State(name: string): Record<string, unknown> & { effectStack: Array<Record<string, unknown>> } {
  const entry = loadV2EndPhaseFixture().cases[name];
  if (!entry) throw new Error(`no v2 End Phase case named ${name}`);
  return structuredClone(entry.state) as Record<string, unknown> & { effectStack: Array<Record<string, unknown>> };
}

/** The End Phase continuation of a stored v2 state, for in-place edits. */
export function continuationOf(state: { effectStack: Array<Record<string, unknown>> }): Record<string, unknown> & {
  remainingScheduledActions: Array<Record<string, unknown>>;
} {
  const frame = state.effectStack.find((f) => f.phaseBoundaryContinuation);
  if (!frame) throw new Error("state has no End Phase frame");
  return frame.phaseBoundaryContinuation as Record<string, unknown> & { remainingScheduledActions: Array<Record<string, unknown>> };
}
