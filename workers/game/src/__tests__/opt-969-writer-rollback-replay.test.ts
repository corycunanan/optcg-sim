/** Ordinary writer output is replayed on an explicitly selected rollback build.
 * Default CI covers the same contract locally; rollout validation sets the root
 * to the deployed history-reader checkout, including its subsequent prompt producers. */
import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { runtime, memory, command, save } from "./native7-producer-support.js";
it("writer-produced first and subsequent DON pauses finish once through repository and coordinator", async () => {
  const writer = await runtime();
  const reader = await runtime(process.env.OPT969_WRITER_READER_ROOT);
  const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
  r.state.players[0].donCostArea[0].state = "RESTED";
  const source = r.put("writer-two-don-costs", 0, "CHARACTER", { schema: synSchema("writer-two-don-costs", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "DON_MINUS", amount: 1 }, { type: "DON_MINUS", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
  r.state = command(writer, r.state, r.db, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  let output = await save(writer, r.state, r.db);
  const originalIds = r.state.players[0].donCostArea.map(d => d.instanceId);
  const selected: string[] = [];
  for (let index = 0; index < 2; index++) {
    const loaded = (await memory(reader, output).repo.load())!;
    const p = loaded.state.pendingPrompt!.options;
    if (p.promptType !== "PLAYER_CHOICE" || !p.donIdentityReturn) throw Error("missing exact DON offer");
    const id = originalIds.find(id => !selected.includes(id) && loaded.state.players[0].donCostArea.find(d => d.instanceId === id)?.state === "ACTIVE")!;
    selected.push(id);
    const action = { type: "PLAYER_CHOICE" as const, choiceId: `don-return-ids:${JSON.stringify([id])}`, promptId: loaded.state.pendingPrompt!.promptId };
    const readerNext = command(reader, loaded.state, loaded.cardDb, action);
    const writerLoaded = (await memory(writer, output).repo.load())!;
    r.state = command(writer, writerLoaded.state, writerLoaded.cardDb, action);
    expect(readerNext).toEqual(r.state);
    output = await save(reader, readerNext, loaded.cardDb);
  }
  const done = (await memory(reader, output).repo.load())!.state;
  expect(done.pendingPrompt).toBeNull(); expect(done.effectStack).toEqual([]);
  expect(done.players[0].donCostArea.map(d => d.instanceId)).toEqual(originalIds.filter(id => !selected.includes(id)));
  expect(done.players[0].donDeck.slice(-2).map(d => d.instanceId).sort()).toEqual([...selected].sort());
  expect(done.players[0].hand).toHaveLength(1);
  expect(done.eventLog.filter(event => event.type === "CARD_DRAWN")).toHaveLength(1);
});
