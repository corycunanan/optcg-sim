/** Saved definitions are the session authority. Future bundled corrections must
 * not rehydrate recorded mode6/7 games with a different authored domain. */
import { expect, it } from "vitest";
import { rig } from "./opt-960-rig.js";
import { runtime, memory, save, command } from "./native7-producer-support.js";
import { getAllAuthoredSchemas, getEffectSchema } from "../engine/schema-registry.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("./fixtures/opt-969-mode8/", import.meta.url));
const historicalDir = fileURLToPath(new URL("./fixtures/opt-969-writer-history/", import.meta.url));
const historicalDefinitions = JSON.parse(readFileSync(`${historicalDir}/historical-authored-definitions.json`, "utf8"));
const oldSchemas = () => {
  const r = rig(); for (const id of ["EB02-061", "OP12-070", "OP15-069"]) r.put(id, 0, "CHARACTER", { data: historicalDefinitions[id], schema: historicalDefinitions[id].effectSchema });
  return r;
};
for (const mode of [6, 7] as const) for (const embedded of [false, true]) it(`retains recorded mode${mode} saved definitions on future writer load/save embedded=${embedded}`, async () => {
  const seed = JSON.parse(readFileSync(`${historicalDir}/synthetic-mode${mode}-raw-seed.json`, "utf8"));
  const oldDb = new Map(Object.entries(seed.cardDb));
  const future = await runtime(process.env.OPT969_MODE8_PRODUCER_ROOT);
  const bytes = JSON.parse(readFileSync(`${historicalDir}/synthetic-recorded-mode${mode}-${embedded ? "embedded" : "separate"}.json`, "utf8"));
  // Default CI uses the writer bundle. Explicitly replace its entries with
  // pinned corrected definitions as a bundle-independent preservation check.
  // The optional env additionally exercises the isolated future build.
  const registry = getAllAuthoredSchemas();
  const ids = ["EB02-061", "OP12-070", "OP15-069"];
  const originals = Object.fromEntries(ids.map(id => [id, registry[id]]));
  for (const id of ids) {
    const family = id === "EB02-061" ? `${id}-authored-active-trigger` : `${id}-saved-field-domain`;
    const futureCapture = JSON.parse(readFileSync(`${dir}/${family}.json`, "utf8"));
    registry[id] = futureCapture.initial["session:card-db"][id].effectSchema;
  }
  try {
    expect(getEffectSchema("EB02-061")!.effects.flatMap(e => e.costs ?? []).find(c => c.type === "DON_MINUS")?.filter?.is_active).toBe(true);
    const m = memory(future, bytes); const loaded = (await m.repo.load())!;
    expect(loaded.state.costSemanticsVersion).toBe(mode);
    for (const id of ["EB02-061", "OP12-070", "OP15-069"]) expect(loaded.cardDb.get(id)?.effectSchema).toEqual((oldDb.get(id) as { effectSchema?: unknown })?.effectSchema);
    const eb = loaded.cardDb.get("EB02-061")!.effectSchema!.effects.flatMap(e => e.costs ?? []).find(c => c.type === "DON_MINUS")!;
    expect(eb.filter?.is_active).toBeUndefined();
    for (const id of ["OP12-070", "OP15-069"]) expect(loaded.cardDb.get(id)!.effectSchema!.effects.flatMap(e => e.replacement_actions ?? [])[0].target?.type).toBe("DON_IN_COST_AREA");
    const before = structuredClone(m.values);
    await m.repo.save({ ...loaded, undoHistory: [] });
    const reopened = (await memory(future, m.values).repo.load())!;
    expect(reopened.state.costSemanticsVersion).toBe(mode);
    for (const id of ["EB02-061", "OP12-070", "OP15-069"]) expect(reopened.cardDb.get(id)?.effectSchema).toEqual((oldDb.get(id) as { effectSchema?: unknown })?.effectSchema);
    if (!embedded) expect(m.values["session:card-db"]).toEqual(before["session:card-db"]);
  } finally {
    for (const id of ids) registry[id] = originals[id];
  }
});

it("mode8 saved corrected definitions survive same-build load (older floor when env supplied)", async () => {
  const rt = await runtime(process.env.OPT969_WRITER_FLOOR_ROOT);
  const families = ["EB02-061-authored-active-trigger", "OP12-070-saved-field-domain", "OP15-069-saved-field-domain"];
  for (const family of families) {
    const corpus = JSON.parse(readFileSync(`${dir}/${family}.json`, "utf8"));
    const loaded = (await memory(rt, corpus.initial).repo.load())!;
    expect(loaded.state.costSemanticsVersion).toBe(8);
    const schema = loaded.cardDb.get(family.split(family.startsWith("EB") ? "-authored" : "-saved")[0])!.effectSchema!;
    if (family.startsWith("EB")) expect(schema.effects.flatMap(e => e.costs ?? []).find(c => c.type === "DON_MINUS")?.filter?.is_active).toBe(true);
    else expect(schema.effects.flatMap(e => e.replacement_actions ?? [])[0].target).toBeUndefined();
  }
});

for (const embedded of [false, true]) it(`missing saved entry is not silently replaced from bundle embedded=${embedded}`, async () => {
  const rt = await runtime(); const r = oldSchemas(); const bytes = await save(rt, r.state, r.db);
  const db = bytes["session:card-db"] as Record<string, unknown>; delete db["EB02-061"];
  if (embedded) { (bytes.session as Record<string, unknown>).cardDb = db; delete bytes["session:card-db"]; }
  const loaded = (await memory(rt, bytes).repo.load())!;
  expect(loaded.cardDb.has("EB02-061")).toBe(false);
  const source = loaded.state.players[0].characters.find(c => c?.cardId === "EB02-061")!;
  const before = structuredClone(loaded.state);
  const result = new rt.SessionCoordinator().executeAction(loaded.state, [], 0, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "when_attacking_untap_life" }, loaded.cardDb);
  expect(result.kind).toBe("reject"); expect(loaded.state).toEqual(before);
});

for (const activeCount of [0, 1]) it(`saved corrected EB02-061 refuses its full cost with ${activeCount} active DON despite attached alternatives`, async () => {
  const rt = await runtime();
  const corpus = JSON.parse(readFileSync(`${dir}/EB02-061-authored-active-trigger.json`, "utf8"));
  const loaded = (await memory(rt, corpus.origin).repo.load())!;
  const p = loaded.state.players[0]; const removed = p.donCostArea.splice(activeCount);
  p.leader.attachedDon.push(...removed.map(d => ({ ...d, attachedTo: p.leader.instanceId })));
  const beforeDeck = structuredClone(p.donDeck);
  const result = new rt.SessionCoordinator().executeAction(loaded.state, [], 0, corpus.activation, loaded.cardDb);
  expect(result.kind).toBe("applied");
  expect(result.state.pendingPrompt).toBeNull(); expect(result.state.players[0].donDeck).toEqual(beforeDeck);
  expect(result.state.players[0].life).toHaveLength(1);
  expect(result.state.players[0].characters.find(c => c?.cardId === "EB02-061")!.state).toBe("RESTED");
});

for (const mode of [6, 7] as const) for (const embedded of [false, true]) it(`captured mode${mode} resumes old authored attack and keeps historical permission for later fresh effects embedded=${embedded}`, async () => {
  const rt = await runtime();
  const bytes = JSON.parse(readFileSync(`${historicalDir}/synthetic-recorded-mode${mode}-${embedded ? "embedded" : "separate"}.json`, "utf8"));
  let loaded = (await memory(rt, bytes).repo.load())!;
  const originalSchemas = Object.fromEntries(["EB02-061", "OP12-070", "OP15-069"].map(id => [id, structuredClone(loaded.cardDb.get(id)!.effectSchema)]));
  const source = loaded.state.players[0].characters.find(c => c?.cardId === "EB02-061")!;
  const beforeLife = loaded.state.players[0].life.length;
  const beforeDon = loaded.state.players[0].donDeck.length;
  loaded.state = command(rt, loaded.state, loaded.cardDb, { type: "DECLARE_ATTACK", attackerInstanceId: source.instanceId, targetInstanceId: loaded.state.players[1].leader.instanceId });
  expect(loaded.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  loaded = (await memory(rt, await save(rt, loaded.state, loaded.cardDb)).repo.load())!;
  loaded.state = command(rt, loaded.state, loaded.cardDb, { type: "PLAYER_CHOICE", choiceId: "accept" });
  for (let i = 0; loaded.state.pendingPrompt && i < 4; i++) {
    const prompt = loaded.state.pendingPrompt.options;
    if (prompt.promptType === "PLAYER_CHOICE") loaded.state = command(rt, loaded.state, loaded.cardDb, { type: "PLAYER_CHOICE", choiceId: prompt.choices.find(c => !c.disabled)!.id });
    else if (prompt.promptType === "SELECT_TARGET") loaded.state = command(rt, loaded.state, loaded.cardDb, { type: "SELECT_TARGET", selectedInstanceIds: prompt.validTargets.slice(0, prompt.countMin) });
    else throw Error(`unexpected old attack prompt ${prompt.promptType}`);
    loaded = (await memory(rt, await save(rt, loaded.state, loaded.cardDb)).repo.load())!;
  }
  expect(loaded.state.pendingPrompt).toBeNull(); expect(loaded.state.effectStack).toHaveLength(0);
  expect(loaded.state.players[0].life).toHaveLength(beforeLife - 1);
  expect(loaded.state.players[0].donDeck).toHaveLength(beforeDon + 2);
  expect(loaded.state.players[0].characters.find(c => c?.instanceId === source.instanceId)!.state).toBe("ACTIVE");
  expect(loaded.state.costSemanticsVersion).toBe(mode);
  for (const [id, schema] of Object.entries(originalSchemas)) expect(loaded.cardDb.get(id)!.effectSchema).toEqual(schema);
  // A later fresh offer still uses recorded historical admission, even though
  // exact attached-first payment would make this printed sequence possible in8.
  const payer = loaded.state.players[0];
  const [active, attached, ...rest] = payer.donCostArea;
  payer.donCostArea = [active]; payer.donDeck.push(...rest);
  payer.leader.attachedDon = [{ ...attached, attachedTo: payer.leader.instanceId }];
  const before = structuredClone(loaded.state);
  const later = resolveEffect(loaded.state, { id: "historical-later", category: "auto", flags: { optional: true }, costs: [{ type: "DON_MINUS", amount: 1 }, { type: "REST_DON", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }, source.instanceId, 0, loaded.cardDb);
  expect(later.pendingPrompt).toBeUndefined(); expect(later.state).toEqual(before);
});
