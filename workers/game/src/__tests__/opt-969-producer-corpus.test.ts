/** Run only in the isolated actual writer candidate; default reader CI replays
 * checked-in payloads instead. No mocks, ID rewrites or state repair in harness. */
import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";
import { SessionRepository, type SessionStorage } from "../session/persistence.js";
import type { GameAction, GameState } from "../types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { toPersistedGameState } from "../session/game-state-schema.js";

async function persist(r: Rig) {
  const values: Record<string, unknown> = {};
  const storage: SessionStorage = {
    async get<T>(key: string) { return values[key] as T | undefined; },
    async put(keyOrEntries: string | Record<string, unknown>, value?: unknown) {
      Object.assign(values, structuredClone(typeof keyOrEntries === "string" ? { [keyOrEntries]: value } : keyOrEntries));
    }, async setAlarm() {}, async deleteAlarm() {},
  };
  const repo = new SessionRepository(storage, { nextJsUrl: "https://example.test", workerSecret: "secret" });
  // Save first gives the live pause its authoritative prompt identity.
  const saved = await repo.save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [] });
  r.state = saved.state;
  await repo.save({ ...saved, undoHistory: [saved.state] });
  const loaded = (await repo.load())!;
  expect(loaded.state).toEqual(toPersistedGameState(saved.state));
  expect(loaded.undoHistory).toEqual([toPersistedGameState(saved.state)]);
  r.state = loaded.state;
  return values;
}
function addHold(r: Rig, id: string) {
  r.state.prohibitions.push({ id: "opt969-hold", sourceCardInstanceId: "seed", sourceEffectBlockId: "", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: "SKIP_NEXT_REFRESH" }, controller: 0, appliesTo: [id], usesRemaining: null } as GameState["prohibitions"][number]);
}
function choose(r: Rig, id: string): GameAction {
  return { type: "PLAYER_CHOICE", choiceId: `don-return-ids:${JSON.stringify([id])}` };
}

describe.runIf(Boolean(process.env.OPT969_REGENERATE))("OPT-969 actual isolated writer corpus", () => {
  for (const family of ["action-identity", "replacement-identity", "don-minus", "variable-three", "historical-bucket", "cost-child-replacement", "opponent-active-cost-area"] as const) {
    it(family, async () => {
      const r = rig(); r.deck(0, 5); r.deck(1, 5);
      let answer: GameAction;
      if (family === "don-minus" || family === "variable-three") {
        const source = r.put(`OPT969-${family}`, 0, "CHARACTER", { schema: synSchema(`OPT969-${family}`, [{ id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [family === "don-minus" ? { type: "DON_MINUS", amount: 2 } : { type: "VARIABLE_DON_RETURN" }, { type: "TRASH_FROM_HAND", amount: 1 }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
        r.put("OPT969-hand", 0, "HAND");
        const attached = r.state.players[0].donCostArea.pop()!;
        source.attachedDon = [{ ...attached, attachedTo: source.instanceId }];
        r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
        answer = { type: "SELECT_TARGET", selectedInstanceIds: [attached.instanceId, ...r.state.players[0].donCostArea.slice(0, family === "don-minus" ? 1 : 2).map(d => d.instanceId)] };
      } else if (family === "opponent-active-cost-area") {
        const authored = getEffectSchema("OP15-059")!;
        const block = authored.effects.find(e => e.id === "OP15-059_on_opponent_attack")!;
        const source = r.put("OP15-059", 0, "CHARACTER", { schema: synSchema("OP15-059", [...authored.effects, { ...block, id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, flags: {} }]) });
        const hold = r.state.players[1].donCostArea[0];
        r.state.prohibitions.push({ id: "opt969-opponent-hold", sourceCardInstanceId: "seed", sourceEffectBlockId: "", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: "SKIP_NEXT_REFRESH" }, controller: 0, appliesTo: [hold.instanceId], usesRemaining: null } as GameState["prohibitions"][number]);
        r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
        expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
        r.act({ type: "PLAYER_CHOICE", choiceId: "0" });
        expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
        answer = choose(r, hold.instanceId);
      } else if (family === "replacement-identity") {
        const kaido = r.put("EB04-030", 0, "CHARACTER");
        const held = r.state.players[0].donCostArea[0]; addHold(r, held.instanceId);
        const remover = r.put("OPT969-remover", 1, "CHARACTER", { schema: synSchema("OPT969-remover", [{ id: "ko", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } } }] }]) });
        r.state.turn.activePlayerIndex = 1;
        r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: remover.instanceId, effectId: "ko" }, 1);
        if (r.promptType() === "SELECT_TARGET") r.select([kaido.instanceId]);
        r.accept(); answer = choose(r, held.instanceId);
      } else if (family === "cost-child-replacement") {
        const source = r.put("OPT969-cost-child", 0, "CHARACTER", { schema: synSchema("OPT969-cost-child", [{ id: "replacement", category: "replacement", replaces: { event: "WOULD_BE_REMOVED_FROM_FIELD" }, replacement_actions: [{ type: "RETURN_DON_TO_DECK", params: { amount: 1 } }], flags: { optional: true } }, { id: "activate", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, costs: [{ type: "REST_DON", amount: 1 }, { type: "TRASH_SELF" }], actions: [{ type: "DRAW", params: { amount: 1 } }] }]) });
        const held = r.state.players[0].donCostArea[0]; addHold(r, held.instanceId);
        r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "activate" });
        r.accept(); answer = choose(r, held.instanceId);
      } else {
        const held = r.state.players[0].donCostArea[0];
        if (family === "action-identity") addHold(r, held.instanceId);
        else r.state.players[0].donCostArea[0].state = "RESTED";
        const source = r.put(`OPT969-${family}`, 0, "CHARACTER", { schema: synSchema(`OPT969-${family}`, [{ id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "RETURN_DON_TO_DECK", params: family === "historical-bucket" ? { until_count: 7 } : { amount: 1 } }, { type: "DRAW", params: { amount: 1 } }] }]) });
        r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
        answer = family === "historical-bucket" ? { type: "PLAYER_CHOICE", choiceId: "don-return:0:1" } : choose(r, held.instanceId);
      }
      if ((family === "don-minus" || family === "variable-three") && answer.type === "SELECT_TARGET") {
        const wanted = new Set(answer.selectedInstanceIds);
        const prompt = r.state.pendingPrompt!.options;
        if (prompt.promptType !== "PLAYER_CHOICE") throw new Error("DON producer did not emit a choice");
        const offered = prompt.choices.find(c => {
          const ids: string[] = JSON.parse(c.id.slice("don-return-ids:".length));
          return ids.length === wanted.size && ids.every(id => wanted.has(id));
        });
        expect(offered).toBeDefined();
        answer = { type: "PLAYER_CHOICE", choiceId: offered!.id };
      }
      expect(r.state.pendingPrompt).not.toBeNull();
      const initial = await persist(r);
      const steps: { action: GameAction; expected: GameState }[] = [];
      const ownCount = r.state.players[0].donCostArea.length;
      const opponentCount = r.state.players[1].donCostArea.length;
      r.act(answer);
      if (family === "opponent-active-cost-area") {
        expect(r.state.players[0].donCostArea).toHaveLength(ownCount);
        expect(r.state.players[1].donCostArea).toHaveLength(opponentCount - 1);
      }
      await persist(r);
      steps.push({ action: answer, expected: structuredClone(r.state) });
      if (family === "don-minus" || family === "variable-three") {
        expect(r.promptType()).toBe("SELECT_TARGET");
        const next: GameAction = { type: "SELECT_TARGET", selectedInstanceIds: [r.state.players[0].hand[0].instanceId] };
        r.act(next); await persist(r); steps.push({ action: next, expected: structuredClone(r.state) });
      }
      if (family !== "cost-child-replacement") {
        expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toHaveLength(0);
      }
      const dir = resolve(process.env.OPT969_REGENERATE!); mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, `${family}.json`), JSON.stringify({ family, initial, steps }, null, 2) + "\n");
    });
  }
});
