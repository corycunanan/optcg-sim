import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { continuationFrame } from "../engine/damage-frames.js";
import { payCostsWithSelection } from "../engine/effect-resolver/cost/orchestrator.js";
import { resolverExecutionServices } from "../engine/effect-resolver/index.js";
import { convertPersistedGameState } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";

it("native7 owner insertion respects terminal stack-depth failure after mandatory child creation", () => {
  const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
  for (let n = 0; n < 3; n++) r.put("OPT997-hand", 0, "HAND");
  const schema = synSchema("OPT997-depth", [
    { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 2 } }], flags: { optional: false } },
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
  ]);
  const source = r.put("OPT997-depth", 0, "CHARACTER", { schema });
  // Public payment boundary: 99 caller continuations leave one slot for the
  // mandatory substitute's child. Inserting its exact COST owner overflows.
  r.state.effectStack = Array.from({ length: 99 }, (_, i) => continuationFrame({ id: `caller-${i}`, kind: "EFFECT", sourceCardInstanceId: source.instanceId, controller: 0, phase: "AWAITING_TARGET_SELECTION" }));
  const block = schema.effects[1];
  const result = payCostsWithSelection(r.state, block.costs!, 0, 0, r.db, source.instanceId, block, resolverExecutionServices);
  expect(result.state.status).toBe("FINISHED");
  expect(result.state.engineOutcome).toMatchObject({ type: "ENGINE_LIMIT", diagnostic: { kind: "EFFECT_STACK_DEPTH", limit: 100, observed: 101 } });
  expect(result.state.effectStack).toHaveLength(0);
  expect(result.state.pendingPrompt).toBeNull();
  expect(convertPersistedGameState(toPersistedGameState(result.state), "state").effectStack).toHaveLength(0);
  expect(result.state.eventLog.filter(e => e.type === "GAME_OVER")).toHaveLength(1);
});
