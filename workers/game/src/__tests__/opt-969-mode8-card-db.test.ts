/** Saved definitions are the session authority. Future bundled corrections must
 * not rehydrate recorded mode6/7 games with a different authored domain. */
import { expect, it } from "vitest";
import { rig } from "./opt-960-rig.js";
import { runtime, memory, save } from "./native7-producer-support.js";
import { getAllAuthoredSchemas, getEffectSchema } from "../engine/schema-registry.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("./fixtures/opt-969-mode8/", import.meta.url));
const oldSchemas = () => {
  const r = rig(); for (const id of ["EB02-061", "OP12-070", "OP15-069"]) r.put(id, 0, "CHARACTER");
  return r;
};
for (const mode of [6, 7] as const) for (const embedded of [false, true]) it(`retains recorded mode${mode} saved definitions on future writer load/save embedded=${embedded}`, async () => {
  const r = oldSchemas(); r.state.costSemanticsVersion = mode;
  const current = await runtime(); const future = await runtime(process.env.OPT969_MODE8_PRODUCER_ROOT);
  const bytes = await save(current, r.state, r.db);
  if (embedded) { (bytes.session as Record<string, unknown>).cardDb = bytes["session:card-db"]; delete bytes["session:card-db"]; }
  // CI runs with the reader, whose bundle is deliberately replaced with the
  // corrected definitions from immutable future captures. The optional env
  // additionally proves this boundary on the actual isolated future build.
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
    for (const id of ["EB02-061", "OP12-070", "OP15-069"]) expect(loaded.cardDb.get(id)?.effectSchema).toEqual(r.db.get(id)?.effectSchema);
    const eb = loaded.cardDb.get("EB02-061")!.effectSchema!.effects.flatMap(e => e.costs ?? []).find(c => c.type === "DON_MINUS")!;
    expect(eb.filter?.is_active).toBeUndefined();
    for (const id of ["OP12-070", "OP15-069"]) expect(loaded.cardDb.get(id)!.effectSchema!.effects.flatMap(e => e.replacement_actions ?? [])[0].target?.type).toBe("DON_IN_COST_AREA");
    const before = structuredClone(m.values);
    await m.repo.save({ ...loaded, undoHistory: [] });
    const reopened = (await memory(future, m.values).repo.load())!;
    expect(reopened.state.costSemanticsVersion).toBe(mode);
    for (const id of ["EB02-061", "OP12-070", "OP15-069"]) expect(reopened.cardDb.get(id)?.effectSchema).toEqual(r.db.get(id)?.effectSchema);
    if (!embedded) expect(m.values["session:card-db"]).toEqual(before["session:card-db"]);
  } finally {
    for (const id of ids) registry[id] = originals[id];
  }
});

it("future mode8 saved corrected definitions survive on the reader with older bundles", async () => {
  const rt = await runtime();
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
