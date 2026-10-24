/** Regenerate only in the pinned isolated writer. Default CI replays captures. */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rig, synSchema } from "./opt-960-rig.js";
import { capture, command, memoryRepository, type CostCorpus } from "./opt-997-corpus-support.js";
import type { Cost, Action } from "../engine/effect-types.js";
import type { GameAction } from "../types.js";

const families = ["fixed-accept", "fixed-decline", "fixed-mandatory", "selected-accept", "selected-mandatory", "compound-select", "compound-arrange", "opponent-life", "two-child-result-ref", "terminal-immediate", "terminal-after-child", "nested-replacement", "upgrade-pending6", "picker-fixed", "picker-variable", "picker-action", "picker-replacement", "later-cost-replacement", "fixed-mandatory-prefix", "selected-mandatory-prefix", "compound-select-prefix", "compound-arrange-prefix", "opponent-life-prefix", "fixed-accept-prefix", "selected-accept-prefix", "terminal-after-child-prefix", "picker-duplicate-hosts", "picker-hold-durations"] as const;
describe.runIf(Boolean(process.env.OPT997_REGENERATE))("OPT-997 actual v7 producer", () => {
  it("legacy-accepted6-unknown", async () => {
    const historical = JSON.parse(readFileSync(new URL("./fixtures/opt-969/cost-child-replacement.json", import.meta.url), "utf8"));
    const loaded = (await memoryRepository(historical.initial).repo.load())!;
    expect(loaded.state.schemaVersion).toBe(6);
    const r = rig(); r.state = loaded.state; r.db = loaded.cardDb;
    const initial = await capture(r);
    expect(r.state.schemaVersion).toBe(7);
    expect(r.state.effectStack.find(f => f.kind === "COST")!.costReplacementResolution).toBeUndefined();
    const action = historical.steps[0].action as GameAction;
    r.state = command(r.state, action, r.db);
    const stored = await capture(r);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack.some(f => f.kind === "COST" && !f.costReplacementResolution)).toBe(true);
    const dir = resolve(process.env.OPT997_REGENERATE!); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "legacy-accepted6-unknown.json"), JSON.stringify({ family: "legacy-accepted6-unknown", initial, steps: [{ action, expected: r.state, stored }], sourceId: "", owner: 0, decline: false, terminal: false, knownDebt: true } satisfies CostCorpus, null, 2) + "\n");
  });
  for (const family of families) it(family, async () => {
    const scenario = family.replace(/-prefix$/, "").replace(/^picker-(duplicate-hosts|hold-durations)$/, "picker-action");
    const prefix = family.endsWith("-prefix");
    const r = rig(); r.deck(0, 5); r.deck(1, 5);
    for (const owner of [0, 1] as const) for (let n = 0; n < 4; n++) r.put(`OPT997-hand-${n}`, owner, "HAND");
    const owner = scenario === "opponent-life" ? 1 : 0;
    const picker = scenario.startsWith("picker-");
    const decline = scenario === "fixed-decline";
    const terminal = scenario.startsWith("terminal-");
    const actions: Action[] = prefix ? [{ type: "DRAW", params: { amount: 1 } }, { type: "TRASH_FROM_HAND", params: { amount: 1 } }, ...(scenario === "terminal-after-child" ? [{ type: "MILL", params: { amount: 4 } }] as Action[] : [])] : scenario === "nested-replacement" ? [{ type: "KO", target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } } }, { type: "TRASH_FROM_HAND", params: { amount: 1 } }] : scenario === "terminal-immediate" ? [{ type: "MILL", params: { amount: 5 } }] : [
      { type: "TRASH_FROM_HAND", params: { amount: scenario === "two-child-result-ref" ? 1 : 2 }, ...(scenario === "two-child-result-ref" ? { result_ref: "first" } : {}) },
      ...(scenario === "two-child-result-ref" ? [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }, { type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: { type: "PER_COUNT", source: "CARDS_TRASHED_THIS_WAY", ref: "first", multiplier: 1000 }, duration: "THIS_TURN" } }] as Action[] : []),
      ...(scenario === "terminal-after-child" ? [{ type: "MILL", params: { amount: 5 } }] as Action[] : []),
    ];
    let costs: Cost[] = [{ type: "REST_DON", amount: 1 }, { type: "TRASH_SELF" }];
    if (scenario === "picker-fixed") costs = [{ type: "DON_MINUS", amount: 2 }, { type: "TRASH_FROM_HAND", amount: 1 }];
    if (scenario === "picker-variable") costs = [{ type: "VARIABLE_DON_RETURN" }, { type: "TRASH_FROM_HAND", amount: 1 }];
    if (scenario.startsWith("selected")) costs = [{ type: "REST_DON", amount: 1 }, { type: "TRASH_OWN_CHARACTER", amount: 1 }];
    if (scenario.startsWith("compound")) costs = [{ type: "REST_DON", amount: 1 }, { type: "PLACE_SELF_AND_TRASH_TO_DECK", amount: 1, position: "BOTTOM" } as Cost];
    if (scenario === "opponent-life") costs = [{ type: "REST_DON", amount: 1 }, { type: "ADD_OWN_CHARACTER_TO_LIFE", amount: 1, controller: "OPPONENT", position: "TOP_OR_BOTTOM" } as Cost];
    const source = r.put("OPT997-source", owner, "CHARACTER", { ...(family === "picker-duplicate-hosts" || family === "picker-hold-durations" ? { data: { name: "Roronoa Zoro" } } : {}), schema: synSchema("OPT997-source", [{ id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, replacement_actions: scenario === "picker-replacement" ? [{ type: "RETURN_DON_TO_DECK", params: { amount: 1 } }] : actions, flags: { optional: !(scenario.endsWith("mandatory") || (prefix && !scenario.endsWith("accept"))), ...(prefix ? { once_per_turn: true } : {}) } }, ...(owner === 0 ? [{ id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: { once_per_turn: true }, costs, actions: scenario === "picker-action" ? [{ type: "RETURN_DON_TO_DECK", params: { amount: 1 } }, { type: "DRAW", params: { amount: 1 } }] : [{ type: "DRAW", params: { amount: 1 } }, ...(scenario === "compound-select" ? [{ type: "SHUFFLE_DECK" }] : [])] }] as never[] : [])]) });
    const activator = owner === 0 ? source : r.put("OPT997-activator", 0, "CHARACTER", { schema: synSchema("OPT997-activator", [{ id: "activate", category: "activate", ...(prefix ? { flags: { once_per_turn: true } } : {}), trigger: { keyword: "ACTIVATE_MAIN" }, costs, actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
    if (picker) {
      const attached = r.state.players[0].donCostArea.pop()!;
      source.attachedDon = [{ ...attached, attachedTo: source.instanceId }];
      r.state.prohibitions.push({ id: "opt997-hold", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "replacement", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: "SKIP_NEXT_REFRESH" }, controller: 0, appliesTo: [r.state.players[0].donCostArea[0].instanceId], usesRemaining: null } as never);
    }
    if (family === "picker-duplicate-hosts") {
      const duplicate = r.put("OPT997-source", 0, "CHARACTER");
      const attached = r.state.players[0].donCostArea.pop()!;
      duplicate.attachedDon = [{ ...attached, attachedTo: duplicate.instanceId }];
    }
    if (family === "picker-hold-durations") r.state.prohibitions.push({ id: "opt997-second-hold", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "replacement", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: "THIS_TURN" }, controller: 0, appliesTo: [r.state.players[0].donCostArea[1].instanceId], usesRemaining: null } as never);
    if (scenario === "picker-action") { const block = r.db.get(source.cardId)!.effectSchema!.effects.find(e => e.id === "activate")!; block.costs = []; }
    if (scenario.startsWith("compound")) r.put("OPT997-trash", 0, "TRASH");
    if (scenario === "compound-select") r.put("OPT997-trash-2", 0, "TRASH");
    if (scenario === "later-cost-replacement") r.put("OPT997-watcher", 0, "CHARACTER", { schema: synSchema("OPT997-watcher", [
      { id: "watcher-replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }], flags: { optional: true, once_per_turn: true } },
      { id: "watcher", category: "auto", trigger: { event: "CARD_TRASHED_FROM_HAND" }, flags: { once_per_turn: true }, costs: [{ type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] },
    ]) });
    if (scenario === "nested-replacement") r.put("OPT997-nested", 0, "CHARACTER", { schema: synSchema("OPT997-nested", [{ id: "nested", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, replacement_actions: [{ type: "TRASH_FROM_HAND", params: { amount: 1 } }], flags: { optional: true } }]) });
    // The candidate's actual writer supplies native7 before any offer is made.
    await capture(r); expect(r.state.schemaVersion).toBe(7);
    if (scenario === "upgrade-pending6") {
      r.state.schemaVersion = 6;
      delete r.state.costSemanticsVersion;
    }
    r.state = command(r.state, { type: "ACTIVATE_EFFECT", cardInstanceId: activator.instanceId, effectId: "activate" }, r.db);
    const initial = await capture(r);
    if (prefix && r.promptType() === "SELECT_TARGET" && r.state.effectStack.some(f => f.costReplacementResolution === "REPLACED")) { expect(r.state.players[owner].deck).toHaveLength(4); expect(r.state.players[owner].hand).toHaveLength(5); expect(r.state.activeEffects.some(e => e.sourceCardInstanceId === source.instanceId && e.modifiers.some(m => m.params?.usedOnTurn === r.state.turn.number))).toBe(true); }
    if (family === "picker-duplicate-hosts" || family === "picker-hold-durations") {
      const prompt = r.state.pendingPrompt!.options;
      if (prompt.promptType !== "PLAYER_CHOICE") throw new Error("missing picker");
      const labels = prompt.donIdentityReturn!.groups.map(g => g.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(new Set(prompt.choices.map(c => c.label)).size).toBe(prompt.choices.length);
      if (family === "picker-duplicate-hosts") { expect(labels.some(l => l.includes("Character slot 1"))).toBe(true); expect(labels.some(l => l.includes("Character slot 2"))).toBe(true); }
      else { expect(labels.some(l => l.includes("next refresh"))).toBe(true); expect(labels.some(l => l.includes("this turn"))).toBe(true); }
    }
    const steps: CostCorpus["steps"] = [];
    for (let n = 0; r.state.pendingPrompt && n < 12; n++) {
      const p = r.state.pendingPrompt.options;
      let action: GameAction;
      if (p.promptType === "OPTIONAL_EFFECT") action = { type: "PLAYER_CHOICE", choiceId: decline ? "skip" : "accept" };
      else if (p.promptType === "SELECT_TARGET") action = { type: "SELECT_TARGET", selectedInstanceIds: p.validTargets.some(id => id.startsWith("OPT997-nested#")) ? p.validTargets.filter(id => id.startsWith("OPT997-nested#")) : p.validTargets.slice(0, p.countMin) };
      else if (p.promptType === "ARRANGE_TOP_CARDS") action = { type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "", orderedInstanceIds: p.cards.map(c => c.instanceId), destination: "bottom" };
      else if (p.promptType === "PLAYER_CHOICE") {
        const wanted = scenario === "picker-fixed" ? r.state.players[0].donCostArea.slice(0, 2).map(d => d.instanceId) : scenario === "picker-variable" ? [r.state.players[0].donCostArea[0].instanceId] : null;
        const choice = wanted ? p.choices.find(c => { const ids: string[] = JSON.parse(c.id.slice("don-return-ids:".length)); return ids.length === wanted.length && wanted.every(id => ids.includes(id)); }) : p.choices.find(c => !c.disabled);
        if (!choice) throw new Error("missing requested offered plan");
        action = { type: "PLAYER_CHOICE", choiceId: choice.id };
      }
      else throw new Error(`Unsupported ${p.promptType}`);
      r.state = command(r.state, action, r.db);
      const stored = await capture(r);
      if (prefix && r.state.pendingPrompt?.options.promptType === "SELECT_TARGET" && r.state.effectStack.some(f => f.costReplacementResolution === "REPLACED")) { expect(r.state.players[owner].deck).toHaveLength(4); expect(r.state.players[owner].hand).toHaveLength(5); expect(r.state.activeEffects.some(e => e.sourceCardInstanceId === source.instanceId && e.modifiers.some(m => m.params?.usedOnTurn === r.state.turn.number))).toBe(true); }
      steps.push({ action, expected: structuredClone(r.state), stored });
    }
    expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
    if (prefix && !terminal) {
      expect(r.state.players[owner].deck).toHaveLength(4);
      expect(r.state.players[owner].hand).toHaveLength(4);
      expect(r.state.activeEffects.some(e => e.sourceCardInstanceId === source.instanceId && e.modifiers.some(m => m.params?.usedOnTurn === r.state.turn.number))).toBe(true);
      expect(r.state.eventLog.map(e => e.type)).toEqual(["CARD_DRAWN", "DRAW_OUTSIDE_DRAW_PHASE", "CARD_TRASHED"]);
    }
    if (picker) { expect(r.state.schemaVersion).toBe(7); }
    else if (terminal) expect(r.state.status).toBe("FINISHED");
    else {
      expect(steps.length).toBeGreaterThan(0);
      expect(r.state.players[owner].characters.some(c => c?.instanceId === source.instanceId)).toBe(!decline);
      expect(r.state.players[0].donCostArea.filter(d => d.state === "RESTED")).toHaveLength(decline ? 1 : 0);
      expect(r.state.turn.oncePerTurnUsed.activate?.includes(activator.instanceId) ?? false).toBe(decline);
      const legal = command(r.state, { type: "ATTACH_DON", targetInstanceId: r.state.players[0].leader.instanceId, count: 1 }, r.db);
      const battle = command(legal, { type: "DECLARE_ATTACK", attackerInstanceId: legal.players[0].leader.instanceId, targetInstanceId: legal.players[1].leader.instanceId }, r.db);
      command(battle, { type: "PASS" }, r.db, 1);
    }
    const dir = resolve(process.env.OPT997_REGENERATE!); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${family}.json`), JSON.stringify({ family, initial, steps, sourceId: source.instanceId, activationSourceId: activator.instanceId, owner, decline, terminal } satisfies CostCorpus, null, 2) + "\n");
  });
});
