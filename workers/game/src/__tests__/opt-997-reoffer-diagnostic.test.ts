/** Diagnostic of preexisting ordering-offer transport leakage; not completion evidence. */
import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { convertPersistedGameState } from "../session/persistence.js";
for (const version of [6] as const) it(`diagnoses version${version} ordering-to-offer payload`, () => {
  const r = rig(); r.state.schemaVersion = version; delete r.state.costSemanticsVersion; r.deck(0, 5); r.deck(1, 5);
  for (let n = 0; n < 3; n++) r.put(`reoffer-hand-${n}`, 0, "HAND");
  const source = r.put("reoffer-source", 0, "CHARACTER", { schema: synSchema("reoffer-source", [
    ...["first", "second"].map(id => ({ id, category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true }, replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }] })) as never[],
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ]) });
  r.state = runPipeline(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db, 0).state;
  const p = r.state.pendingPrompt!.options; if (p.promptType !== "PLAYER_CHOICE") throw new Error("missing ordering prompt");
  r.state = resumePromptLifecycle(r.state, { type: "PLAYER_CHOICE", choiceId: p.choices[0].id }, r.db, { drainPregame: state => state, advanceStartOfTurn: state => state }).state;
  const output = toPersistedGameState(r.state);
  expect(output.effectStack.at(-1)!.replacement).toHaveProperty("type", "REPLACEMENT");
  expect(() => convertPersistedGameState(output, "state")).toThrow(/replacement.*Unrecognized key.*type/);
});
