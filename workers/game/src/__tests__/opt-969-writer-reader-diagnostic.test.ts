/** Temporary cross-build diagnostic. Do not infer compatibility from current-writer replay. */
import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { rig, synSchema } from "./opt-960-rig.js";
import { capture, command, memoryRepository } from "./opt-997-corpus-support.js";
it("diagnoses a subsequent meaningful DON cost against deployed485 reader", async () => {
  const root = "/private/tmp/opt969-20261023-coordinator-check";
  const reader = await import(`${root}/workers/game/src/session/persistence.ts`) as typeof import("../session/persistence.js");
  const lifecycle = await import(`${root}/workers/game/src/session/prompt-lifecycle.ts`) as typeof import("../session/prompt-lifecycle.js");
  const r = rig(); r.deck(0, 5); r.state.players[0].donCostArea[0].state = "RESTED";
  const source = r.put("writer-two-don-costs", 0, "CHARACTER", { schema: synSchema("writer-two-don-costs", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "DON_MINUS", amount: 1 }, { type: "DON_MINUS", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  const values = await capture(r); const memory = memoryRepository(values);
  const storage = { async get<T>(key: string) { return memory.values[key] as T | undefined; }, async put() {}, async setAlarm() {}, async deleteAlarm() {} };
  const loaded = (await new reader.SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "secret" }).load())!;
  const p = r.state.pendingPrompt!.options; if (p.promptType !== "PLAYER_CHOICE") throw new Error("Missing first DON choice");
  const active = r.state.players[0].donCostArea.find(d => d.state === "ACTIVE")!;
  const action = { type: "PLAYER_CHOICE" as const, choiceId: `don-return-ids:${JSON.stringify([active.instanceId])}`, promptId: r.state.pendingPrompt!.promptId };
  r.state = command(r.state, action, r.db);
  const old = lifecycle.resumePromptLifecycle(loaded.state, action, loaded.cardDb, { drainPregame: s => s, advanceStartOfTurn: s => s });
  writeFileSync("/private/tmp/opt969-20261023-writer-reader-diagnostic.json", JSON.stringify({ reader: "4858458abb4516c3085543f84c5b20e2364c8ec6", action, writerPrompt: r.state.pendingPrompt, readerPrompt: old.state.pendingPrompt, writerHand: r.state.players[0].hand.length, readerHand: old.state.players[0].hand.length, firstPause: (values.session as {state: unknown}).state }, null, 2));
  expect(r.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  expect(old.state.pendingPrompt).toBeNull(); expect(old.state.players[0].hand).toHaveLength(1);
});
