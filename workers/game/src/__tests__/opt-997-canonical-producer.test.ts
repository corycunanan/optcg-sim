/** Actual isolated writer only. Reader CI replays captured bytes, never flips ordinary writers. */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rig, synSchema } from "./opt-960-rig.js";
import { capture, command, memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import type { Cost } from "../engine/effect-types.js";
import type { GameAction, GameState } from "../types.js";
const variants = ["arrange-top", "arrange-bottom", "fixed-stage-trash", "fixed-stage-deck", "self-hand", "named-stage", "life-top", "life-bottom", "life-fixed-top", "life-fixed-bottom"];
describe.runIf(Boolean(process.env.OPT997_REGENERATE))("OPT997 canonical actual producer", () => {
  for (const variant of variants) for (const decline of [false, true]) it(`${variant}-${decline ? "decline" : "accept"}`, async () => {
    const r = rig(); r.deck(0, 5); r.deck(1, 5);
    for (const p of [0, 1] as const) for (let n = 0; n < 3; n++) r.put(`canonical-hand-${n}`, p, "HAND");
    const life = variant.startsWith("life-"); const stage = variant.includes("stage") || variant === "self-hand";
    const cost: Cost = variant.startsWith("arrange-") ? { type: "PLACE_SELF_AND_TRASH_TO_DECK", amount: 1, position: variant.endsWith("top") ? "TOP" : "BOTTOM" } as Cost
      : variant === "fixed-stage-trash" ? { type: "TRASH_OWN_STAGE" }
      : variant === "fixed-stage-deck" ? { type: "PLACE_STAGE_TO_DECK" }
      : variant === "self-hand" ? { type: "PLACE_SELF_AND_HAND_TO_DECK", amount: 1 } as Cost
      : variant === "named-stage" ? { type: "TRASH_NAMED_CARD_FROM_HAND_OR_STAGE", card_name: "canonical-source", amount: 1 } as Cost
      : { type: "ADD_OWN_CHARACTER_TO_LIFE", amount: 1, controller: "OPPONENT", position: variant.includes("fixed") ? variant.endsWith("top") ? "TOP" : "BOTTOM" : "TOP_OR_BOTTOM" } as Cost;
    const owner = life ? 1 : 0;
    const source = r.put("canonical-source", owner, stage ? "STAGE" : "CHARACTER", { ...(stage ? { data: { type: "Stage" } } : {}), schema: synSchema("canonical-source", [
      { id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true, once_per_turn: true }, replacement_actions: [{ type: "DRAW", params: { amount: 1 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 } }] },
      ...(!life && (!stage || variant === "self-hand") ? [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [cost], actions: [{ type: "DRAW", params: { amount: 1 } }] }] as never[] : []),
    ], stage ? "Stage" : "Character") });
    const activator = life || (stage && variant !== "self-hand") ? r.put("canonical-activator", 0, "CHARACTER", { schema: synSchema("canonical-activator", [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [cost], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) }) : source;
    r.put("canonical-trash-a", 0, "TRASH"); r.put("canonical-trash-b", 0, "TRASH");
    await capture(r);
    r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: activator.instanceId, effectId: "activate" }, r.db);
    const initial = await capture(r); const steps: CostCorpus["steps"] = [];
    for (let n = 0; r.state.pendingPrompt && n < 10; n++) {
      const p = r.state.pendingPrompt.options; let action: GameAction;
      if (p.promptType === "OPTIONAL_EFFECT") action = { type: "PLAYER_CHOICE", choiceId: decline ? "skip" : "accept" };
      else if (p.promptType === "SELECT_TARGET") action = { type: "SELECT_TARGET", selectedInstanceIds: p.validTargets.slice(0, p.countMin) };
      else if (p.promptType === "ARRANGE_TOP_CARDS") action = { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: p.cards.map(c => c.instanceId).reverse(), destination: variant.endsWith("top") ? "bottom" : "top" };
      else if (p.promptType === "PLAYER_CHOICE") { const choice = p.choices.find(c => c.id.endsWith(variant.endsWith("bottom") ? ":BOTTOM" : ":TOP")); if (!choice) throw new Error("missing Life endpoint"); action = { type: "PLAYER_CHOICE", choiceId: choice.id }; }
      else throw new Error(`unexpected ${p.promptType}`);
      r.state = command(r.state, action, r.db); const stored = await capture(r);
      steps.push({ action, expected: structuredClone(r.state), stored });
    }
    expect(r.state.effectStack).toHaveLength(0); expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[owner].hand).toHaveLength(decline ? variant === "self-hand" ? 3 : life ? 3 : 4 : 3);
    expect(r.state.activeEffects.some(e => e.sourceCardInstanceId === source.instanceId && e.modifiers.some(m => m.params?.usedOnTurn === r.state.turn.number))).toBe(!decline);
    const family = `canonical-${variant}-${decline ? "decline" : "accept"}`;
    const dir = resolve(process.env.OPT997_REGENERATE!); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${family}.json`), JSON.stringify({ family, initial, steps, sourceId: source.instanceId, activationSourceId: activator.instanceId, owner, decline, terminal: false } satisfies CostCorpus, null, 2) + "\n");
  });
  it("reoffer preserves absent outcome until final answer", async () => {
    const r = rig(); r.deck(0, 5); r.deck(1, 5);
    for (let n = 0; n < 3; n++) r.put(`reoffer-hand-${n}`, 0, "HAND");
    const source = r.put("reoffer-source", 0, "CHARACTER", { schema: synSchema("reoffer-source", [
      ...["first", "second"].map(id => ({ id, category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, flags: { optional: true }, replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }] })) as never[],
      { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
    ]) });
    await capture(r); r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" }, r.db);
    const initial = await capture(r); const steps: CostCorpus["steps"] = []; let declines = 0;
    while (r.state.pendingPrompt) {
      const p = r.state.pendingPrompt.options;
      const owner = r.state.effectStack.find(f => f.kind === "COST")!;
      if (p.promptType === "OPTIONAL_EFFECT" || p.promptType === "PLAYER_CHOICE") expect(owner.costReplacementResolution).toBeUndefined();
      const action: GameAction = p.promptType === "PLAYER_CHOICE" ? { type: "PLAYER_CHOICE", choiceId: p.choices[0].id }
        : p.promptType === "OPTIONAL_EFFECT" ? { type: "PLAYER_CHOICE", choiceId: declines++ === 0 ? "skip" : "accept" }
        : p.promptType === "SELECT_TARGET" ? { type: "SELECT_TARGET", selectedInstanceIds: p.validTargets.slice(0, p.countMin) } : (() => { throw new Error("unexpected reoffer prompt"); })();
      r.state = command(r.state, action, r.db); const stored = await capture(r); steps.push({ action, expected: structuredClone(r.state), stored });
    }
    expect(declines).toBe(2); expect(r.state.effectStack).toHaveLength(0); expect(r.state.players[0].hand).toHaveLength(2);
    expect(r.state.eventLog.map(e => e.type)).toEqual(["CARD_TRASHED"]);
    const family = "canonical-reoffer"; const dir = resolve(process.env.OPT997_REGENERATE!); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${family}.json`), JSON.stringify({ family, initial, steps, sourceId: source.instanceId, owner: 0, decline: false, terminal: false } satisfies CostCorpus, null, 2) + "\n");
  });

});
