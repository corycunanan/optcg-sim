import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { memoryRepository, capture, command, type CostCorpus } from "./opt-997-corpus-support.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { rig, synSchema } from "./opt-960-rig.js";
import type { EffectStackFrame, GameState } from "../types.js";
import type { Cost } from "../engine/effect-types.js";

type Mutation = (frame: EffectStackFrame) => void;
const mutations: Record<string, Record<string, Mutation>> = {
  "canonical-self-hand-decline": {
    "hand arrangement sentinel only": f => { f.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" }; },
  },
  "canonical-self-hand-accept": {
    "accepted hand arrangement sentinel only": f => { f.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" }; },
  },
  "fixed-accept": {
    "fixed arrangement flag": f => { f.costArrangeStage = true; },
    "fixed nonempty domain": f => { f.validTargets = [f.sourceCardInstanceId]; },
    "noncapture family": f => { f.costs[f.currentCostIndex] = { type: "PLACE_FROM_TRASH_TO_DECK", amount: 1 }; },
  },
  "selected-accept": {
    "field arrangement flag": f => { f.costArrangeStage = true; },
    "duplicate domain": f => { f.validTargets.push(f.validTargets[0]); },
    "empty domain identity": f => { f.validTargets.push(""); },
  },
  "compound-select": {
    "compound selection sentinel": f => { f.costs[f.currentCostIndex] = { type: "PLACE_SELF_AND_HAND_TO_DECK", amount: 1 }; f.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" }; },
    "forced shuffle has no capture": f => { if (f.costReplacementAction?.type === "SELECT_TARGET") f.validTargets = [...f.costReplacementAction.selectedInstanceIds]; },
    "compound selection no shuffle": f => { f.effectBlock.actions = []; },
    "compound selection source domain": f => { f.validTargets.push(f.sourceCardInstanceId); },
    "compound selection arrangement flag": f => { f.costArrangeStage = true; },
  },
  "compound-arrange": {
    "compound arrangement sentinel": f => { f.costs[f.currentCostIndex] = { type: "PLACE_SELF_AND_HAND_TO_DECK", amount: 1 }; f.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" }; },
    "compound arrangement shuffles": f => { f.effectBlock.actions = [{ type: "SHUFFLE_DECK" }]; },
    "compound arrangement missing flag": f => { delete f.costArrangeStage; },
    "compound arrangement missing source": f => { f.validTargets = f.validTargets.filter(id => id !== f.sourceCardInstanceId); },
    "compound arrangement kept array": f => { if (f.costReplacementAction?.type === "ARRANGE_TOP_CARDS") f.costReplacementAction.keptCardInstanceIds = []; },
  },
  "opponent-life": {
    "Life arrangement flag": f => { f.costArrangeStage = true; },
    "Life missing endpoint": f => { f.validTargets = [f.costReplacementAction!.type === "PLAYER_CHOICE" ? f.costReplacementAction!.choiceId : ""]; },
    "Life mismatched binding": f => { f.validTargets[0] = 'cost-life:["foreign"]:TOP'; },
  },
};
async function rejectsAtBoundaries(saved: Record<string, unknown>, good: GameState, bad: GameState, ready: boolean) {
  for (const ingress of ["live", "separate-first", "separate-later", "embedded-first", "embedded-later"] as const) {
    const values = structuredClone(saved);
    const session = values.session as { state: GameState; undoHistory?: GameState[] };
    delete session.undoHistory;
    if (ingress === "live") session.state = bad;
    else {
      // Index zero is outside retention (limit 1); every stored entry must validate.
      const undo = Array.from({ length: 4 }, () => structuredClone(good));
      undo[ingress.endsWith("first") ? 0 : 3] = bad;
      if (ingress.startsWith("embedded")) session.undoHistory = undo;
      else values["session:undo-history"] = undo;
    }
    const { repo, values: actual } = memoryRepository(values); const before = structuredClone(actual);
    await expect(repo.load(), ingress).rejects.toThrow(); expect(actual).toEqual(before);
  }
  if (!ready && good.pendingPrompt?.options.promptType === "OPTIONAL_EFFECT") {
    const loaded = (await memoryRepository(saved).repo.load())!;
    for (const choiceId of ["accept", "skip"]) {
      const before = structuredClone(bad);
      expect(() => resumePromptLifecycle(bad, { type: "PLAYER_CHOICE", choiceId, promptId: bad.pendingPrompt!.promptId }, loaded.cardDb, { drainPregame: s => s, advanceStartOfTurn: s => s })).toThrow();
      expect(bad).toEqual(before);
    }
  }
}
for (const [family, cases] of Object.entries(mutations)) {
  const corpus: CostCorpus = JSON.parse(readFileSync(new URL(`./fixtures/${family.startsWith("canonical-") ? "opt-997-v7-canonical" : "opt-997-v7"}/${family}.json`, import.meta.url), "utf8"));
  const snapshots = [corpus.initial, ...corpus.steps.map(step => step.stored)];
  for (const ready of family === "canonical-self-hand-decline" ? [false] : [false, true]) {
    const saved = snapshots.find(values => (values.session as { state: GameState }).state.effectStack.some(f => f.costReplacementAction && Boolean(f.costReplacementResolution) === ready));
    if (!saved) throw new Error(`Missing ${family} ready=${ready}`);
    for (const [name, mutate] of Object.entries(cases)) it(`${family} ${name} ready=${ready}: public repository and optional boundary reject unchanged`, async () => {
      const good = (saved.session as { state: GameState }).state;
      const bad = structuredClone(good); mutate(bad.effectStack.find(f => f.costReplacementAction)!);
      await rejectsAtBoundaries(saved, good, bad, ready);
    });
  }
}

for (const hand of [false, true]) for (const shuffle of [false, true]) for (const accept of [false, true]) it(`actual zero-secondary ${hand ? "hand" : "trash"} shuffle=${shuffle} accept=${accept}`, async () => {
  const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
  r.put("zero-hand", 0, "HAND"); r.put("zero-trash", 0, "TRASH");
  const cost = { type: hand ? "PLACE_SELF_AND_HAND_TO_DECK" : "PLACE_SELF_AND_TRASH_TO_DECK", amount: 0 } as Cost;
  const source = r.put("zero-source", 0, hand ? "STAGE" : "CHARACTER", { ...(hand ? { data: { type: "Stage" } } : {}), schema: synSchema("zero-source", [
    { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true }, replacement_actions: [{ type: "DRAW", params: { amount: 1 } }] },
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [cost], actions: shuffle ? [{ type: "SHUFFLE_DECK" }] : [{ type: "DRAW", params: { amount: 0 } }] },
  ], hand ? "Stage" : "Character") });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
  r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [] }, r.db);
  if (!shuffle) {
    expect(r.state.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    r.state = command(r.state, { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: [source.instanceId], destination: "bottom" }, r.db);
  }
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  const owner = r.state.effectStack.find(f => f.costReplacementAction)!;
  expect(owner.costReplacementAction).toEqual(shuffle ? { type: "SELECT_TARGET", selectedInstanceIds: [] } : { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: [source.instanceId], destination: "bottom" });
  const saved = await capture(r);
  if (hand) {
    const bad = structuredClone(r.state);
    bad.effectStack.find(f => f.costReplacementAction)!.costReplacementAction = { type: "PLAYER_CHOICE", choiceId: "__PAY_FIXED_COST__" };
    await rejectsAtBoundaries(saved, r.state, bad, false);
    if (shuffle) {
      const emptyDomain = structuredClone(r.state);
      emptyDomain.effectStack.find(f => f.costReplacementAction)!.validTargets = [];
      await rejectsAtBoundaries(saved, r.state, emptyDomain, false);
    }
  }
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" }, r.db); await capture(r);
  expect(r.state.effectStack).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull();
  expect(hand ? r.state.players[0].stage?.instanceId === source.instanceId : r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(accept);
  expect(r.state.players[0].hand).toHaveLength(accept ? 2 : 1);
  expect(r.state.players[0].trash).toHaveLength(1);
});

for (const type of ["PLACE_SELF_TO_DECK", "KO_OWN_CHARACTER", "RETURN_OWN_CHARACTER_TO_HAND", "PLACE_OWN_CHARACTER_TO_DECK", "ADD_OWN_CHARACTER_TO_LIFE"] as const) for (const accept of [false, true]) it(`actual remaining field exit ${type} accept=${accept}`, async () => {
  const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
  const source = r.put("field-source", 0, "CHARACTER", { schema: synSchema("field-source", [
    { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true }, replacement_actions: [{ type: "DRAW", params: { amount: 1 } }] },
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type, amount: 1 }], actions: [{ type: "DRAW", params: { amount: 0 } }] },
  ]) });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  if (r.state.pendingPrompt?.options.promptType === "SELECT_TARGET") r.state = command(r.state, { type: "SELECT_TARGET", selectedInstanceIds: [source.instanceId] }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT"); await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" }, r.db); await capture(r);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
  expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(accept);
  if (accept) expect(r.state.players[0].hand).toHaveLength(1);
});

for (const hand of [false, true]) for (const accept of [false, true]) it(`actual forced-candidate direct arrangement hand=${hand} accept=${accept}`, async () => {
  const r = rig(); r.state.schemaVersion = 7; r.deck(0, 5);
  const secondary = r.put("forced-secondary", 0, hand ? "HAND" : "TRASH");
  const source = r.put("forced-source", 0, hand ? "STAGE" : "CHARACTER", { ...(hand ? { data: { type: "Stage" } } : {}), schema: synSchema("forced-source", [
    { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true }, replacement_actions: [{ type: "DRAW", params: { amount: 1 } }] },
    { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: hand ? "PLACE_SELF_AND_HAND_TO_DECK" : "PLACE_SELF_AND_TRASH_TO_DECK", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 0 } }] },
  ], hand ? "Stage" : "Character") });
  r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
  r.state = command(r.state, { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: [secondary.instanceId, source.instanceId], destination: "bottom" }, r.db);
  expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT"); await capture(r);
  r.state = command(r.state, { type: "PLAYER_CHOICE", choiceId: accept ? "accept" : "skip" }, r.db); await capture(r);
  expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
  expect(hand ? r.state.players[0].stage?.instanceId === source.instanceId : r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(accept);
  expect(r.state.players[0].deck.some(c => c.cardId === secondary.cardId)).toBe(!accept);
});
