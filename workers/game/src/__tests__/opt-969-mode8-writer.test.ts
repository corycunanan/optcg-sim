/** Writer enablement after verified e14 reader deployment; historical inputs stay explicit. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { rig, synSchema } from "./opt-960-rig.js";
import { setupGame } from "./helpers.js";
import { runtime, memory, save, command } from "./native7-producer-support.js";
import { getEffectSchema } from "../engine/schema-registry.js";

it("new setup chooses mode8 before first action/save and actual default8 cost prompt crosses a saved boundary (verified floor when env supplied)", async () => {
  expect(setupGame().state).toMatchObject({ schemaVersion: 8, costSemanticsVersion: 8 });
  const r = rig(); expect(r.state.costSemanticsVersion).toBe(8);
  r.deck(0, 5); r.deck(1, 5); r.leader(0, "ST13-003"); r.life(0, 1); r.state.players[0].life[0].face = "UP";
  const source = r.put("writer-live-life", 0, "CHARACTER", { schema: synSchema("writer-live-life", [{
    id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { optional: true },
    costs: [{ type: "LIFE_TO_HAND", amount: 1 }, { type: "TRASH_FROM_HAND", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }],
  }]) });
  const writer = await runtime(); const floor = await runtime(process.env.OPT969_WRITER_FLOOR_ROOT);
  const origin = await save(writer, r.state, r.db);
  const state = command(writer, r.state, r.db, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
  expect(state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const pause = await save(writer, state, r.db);
  const writerLoaded = (await memory(writer, pause).repo.load())!;
  const floorLoaded = (await memory(floor, pause).repo.load())!;
  expect(floorLoaded).toEqual(writerLoaded);
  const accept = { type: "PLAYER_CHOICE", choiceId: "accept" } as const;
  const a = command(writer, writerLoaded.state, writerLoaded.cardDb, accept);
  const b = command(floor, floorLoaded.state, floorLoaded.cardDb, accept);
  expect(await save(floor, b, floorLoaded.cardDb)).toEqual(await save(writer, a, writerLoaded.cardDb));
  expect(a.players[0].life).toHaveLength(0); expect(a.players[0].deck).toHaveLength(6);
  expect(a.players[0].hand).toHaveLength(0); expect(a.pendingPrompt).toBeNull(); expect(a.effectStack).toHaveLength(0);
  expect((origin.session as { state: { costSemanticsVersion: number } }).state.costSemanticsVersion).toBe(8);
});

it("new bundled authored clauses match printed active and field domains and preserve restricted neighbors", () => {
  const costs = (id: string) => getEffectSchema(id)!.effects.flatMap(e => e.costs ?? []);
  expect(costs("EB02-061").find(c => c.type === "DON_MINUS")).toMatchObject({ amount: 2, filter: { is_active: true } });
  for (const id of ["OP12-070", "OP15-069"]) expect(getEffectSchema(id)!.effects.flatMap(e => e.replacement_actions ?? [])[0].target).toBeUndefined();
  expect(costs("OP16-060").find(c => c.type === "DON_MINUS")).toMatchObject({ amount: 8, filter: { is_active: true } });
  const choice = getEffectSchema("OP15-059")!.effects[0].actions![0];
  if (choice.type !== "OPPONENT_CHOICE") throw Error("missing authored opponent choice");
  expect(choice.params!.options[0][0].target).toMatchObject({ type: "DON_IN_COST_AREA", controller: "OPPONENT", filter: { is_active: true } });
});

it("historical reader-floor fixtures retain exact original capture and generator hashes", () => {
  const dir = new URL("./fixtures/opt-969-writer-history/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
  expect(manifest.sourceHead).toBe("e14af35bad3a7189a40294f5d4ab3db5b5602f0e");
  const hash = (name: string) => createHash("sha256").update(readFileSync(new URL(name, dir))).digest("hex");
  expect(hash("capture.test-source")).toBe(manifest.generatorSha256);
  for (const [file, sha] of Object.entries(manifest.files)) expect(hash(file), file).toBe(sha);
});
