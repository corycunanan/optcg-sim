/** Only the statically mapped writer capability changes; every other byte is exact. */
import { expect } from "vitest";

export function assertStateEnvelope(actual: unknown, expected: unknown, version: 8 | 9) {
  const { schemaVersion: actualVersion, ...actualBody } = actual as Record<string, unknown>;
  const { schemaVersion: historicalVersion, ...historicalBody } = expected as Record<string, unknown>;
  expect(historicalVersion).toBe(8);
  expect(actualVersion).toBe(version);
  expect(actualBody).toEqual(historicalBody);
}

export function assertStoredEnvelope(actual: Record<string, unknown>, expected: Record<string, unknown>, version: 8 | 9) {
  const { session: actualSession, "session:undo-history": actualUndo, ...actualRest } = actual;
  const { session: expectedSession, "session:undo-history": expectedUndo, ...expectedRest } = expected;
  expect(actualRest).toEqual(expectedRest);
  const { state: actualState, ...actualMetadata } = actualSession as Record<string, unknown>;
  const { state: expectedState, ...expectedMetadata } = expectedSession as Record<string, unknown>;
  expect(actualMetadata).toEqual(expectedMetadata);
  assertStateEnvelope(actualState, expectedState, version);
  expect(actualUndo).toHaveLength((expectedUndo as unknown[]).length);
  for (const [index, state] of (actualUndo as unknown[]).entries()) assertStateEnvelope(state, (expectedUndo as unknown[])[index], version);
}

/** Clause-derived producer step, not inferred from actual state/events/version. */
export const ABORT_TRASH_STEP: Readonly<Record<string, number>> = {
  "abort-attack": 1,
  "abort-block": 2,
  "abort-counter": 3,
};

/** Thatch's authored TRASH_CARD SELF in each captured reply suffix. */
export const THATCH_TRASH_REPLY: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  "authored-Rayleigh": { 0: 1, 1: 0 },
  "two-instances": { 0: 0 },
  "group-then-nested-payment": { 0: 0 },
  "declined-prefix-trash-watcher": { 0: 1, 1: 0 },
  "old-offered-ko": { 0: 0 },
  "old-offered-removal": { 0: 0 },
};
