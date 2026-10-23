import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import type { GameState } from "../types.js";

const corpus: CostCorpus = JSON.parse(readFileSync(new URL("./fixtures/opt-997-v7-canonical/fixed-accept-prefix.json", import.meta.url), "utf8"));
const saved = [corpus.initial, ...corpus.steps.map(s => s.stored)].find(values => (values.session as { state: GameState }).state.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT")!;
for (const choiceId of ["accept", "skip"]) for (const mutation of ["phase", "kind", "unchecked", "missing-replay", "untyped-phase"] as const) it(`native7 optional ${choiceId} rejects retained COST caller ${mutation} before side effects`, async () => {
  const loaded = (await memoryRepository(saved).repo.load())!;
  const state = structuredClone(loaded.state);
  const owner = state.effectStack.find(f => f.costReplacementAction)!;
  if (mutation === "phase" || mutation === "untyped-phase") owner.phase = "AWAITING_TARGET_SELECTION";
  if (mutation === "untyped-phase") delete owner.kind;
  if (mutation === "kind") owner.kind = "EFFECT";
  if (mutation === "unchecked") owner.costReplacementChecked = false;
  if (mutation === "missing-replay") delete owner.costReplacementAction;
  const before = structuredClone(state);
  expect(() => resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId, promptId: state.pendingPrompt!.promptId }, loaded.cardDb, { drainPregame: s => s, advanceStartOfTurn: s => s })).toThrow("Invalid replacement caller");
  expect(state).toEqual(before);
});

for (const version of [6, 7] as const) for (const choiceId of ["accept", "skip"]) it(`valid caller version${version} optional ${choiceId} keeps existing behavior`, async () => {
  const loaded = (await memoryRepository(saved).repo.load())!;
  const state = structuredClone(loaded.state); state.schemaVersion = version;
  const before = structuredClone(state);
  const result = resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId, promptId: state.pendingPrompt!.promptId }, loaded.cardDb, { drainPregame: s => s, advanceStartOfTurn: s => s });
  expect(result.responseRejected).not.toBe(true);
  expect(result.state.players[0].hand).toHaveLength(before.players[0].hand.length + 1);
  expect(result.state.players[0].deck).toHaveLength(before.players[0].deck.length - 1);
  if (choiceId === "accept") expect(result.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  else { expect(result.state.pendingPrompt).toBeNull(); expect(result.state.effectStack).toHaveLength(0); }
});
