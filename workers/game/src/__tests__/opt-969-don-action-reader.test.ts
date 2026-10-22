/** Isolated proposed identity writer, production remains disabled. New grammar
 * must be readable without changing old don-return bucket continuations. */
import { describe, expect, it, vi } from "vitest";
vi.mock("../engine/effect-resolver/actions/don.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../engine/effect-resolver/actions/don.js")>();
  return { ...actual, executeReturnDonToDeck: ((state, action, source, controller, _db, refs) => {
    // Existing replacement feasibility temporarily strips replacements and
    // cannot understand the proposed prompt yet. Preserve its old handler
    // during that probe; production probe changes belong to writer stage.
    if (source.startsWith("EB04-030") && !state.activeEffects.some(e => e.modifiers.some(m => m.type === "REPLACEMENT_EFFECT"))) {
      return actual.executeReturnDonToDeck(state, action, source, controller, _db, refs);
    }
    const p = state.players[controller];
    const pool = [...p.donCostArea, p.leader.attachedDon, ...p.characters.filter(c => c !== null).map(c => c.attachedDon)].flat();
    const choices = pool.map(d => ({ id: `don-return-ids:${JSON.stringify([d.instanceId])}`, label: d.instanceId }));
    return { state, events: [], succeeded: false, pendingPrompt: {
      options: { promptType: "PLAYER_CHOICE", effectDescription: "Return 1 DON!!", choices },
      respondingPlayer: controller,
      resumeContext: { effectSourceInstanceId: source, controller, pausedAction: action, remainingActions: [], resultRefs: [...refs], validTargets: choices.map(c => c.id) },
    } };
  }) satisfies typeof actual.executeReturnDonToDeck };
});
import { rig, synSchema } from "./opt-960-rig.js";
import { reloadLiveAndUndo } from "./opt-969-reader-fixtures.js";
import type { GameState } from "../types.js";

function held(r: ReturnType<typeof rig>, id: string) {
  r.state.prohibitions.push({ id: "opt969-hold", sourceCardInstanceId: "seed", sourceEffectBlockId: "", prohibitionType: "CANNOT_REFRESH", scope: {}, duration: { type: "SKIP_NEXT_REFRESH" }, controller: 0, appliesTo: [id], usesRemaining: null } as GameState["prohibitions"][number]);
}
for (const replacement of [false, true]) for (const reload of [false, true]) {
  it(`exact identity reader replacement=${replacement} reload=${reload}`, async () => {
    const r = rig(); r.deck(0, 5); r.deck(1, 5);
    const source = r.put(replacement ? "EB04-030" : "OPT969-action", 0, "CHARACTER", replacement ? {} : { schema: synSchema("OPT969-action", [{
      id: "return", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" },
      actions: [{ type: "RETURN_DON_TO_DECK", params: { amount: 1 } }, { type: "DRAW", params: { amount: 1 } }],
    }]) });
    const [free, hold] = r.state.players[0].donCostArea;
    held(r, hold.instanceId);
    const beforeDeck = r.state.players[0].donDeck.length;
    if (replacement) {
      const remover = r.put("OPT969-ko", 1, "CHARACTER", { schema: synSchema("OPT969-ko", [{ id: "ko", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } } }] }]) });
      r.state.turn.activePlayerIndex = 1;
      r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: remover.instanceId, effectId: "ko" }, 1);
      if (r.promptType() === "SELECT_TARGET") r.select([source.instanceId]);
      r.accept();
    } else r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "return" });
    expect(r.promptType()).toBe("PLAYER_CHOICE");
    if (reload) await reloadLiveAndUndo(r);
    const pending = structuredClone(r.state);
    r.respond({ type: "PLAYER_CHOICE", choiceId: 'don-return-ids:["foreign"]' });
    expect(r.state).toEqual(pending);
    r.act({ type: "PLAYER_CHOICE", choiceId: `don-return-ids:${JSON.stringify([hold.instanceId])}` });
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toHaveLength(0);
    expect(r.state.players[0].donDeck).toHaveLength(beforeDeck + 1);
    expect(r.state.players[0].donCostArea.some(d => d.instanceId === free.instanceId)).toBe(true);
    expect(r.state.prohibitions.some(p => p.id === "opt969-hold")).toBe(false);
    expect(r.state.eventLog.filter(e => e.type === "DON_DETACHED")).toHaveLength(1);
    expect(r.state.players[0].characters.some(c => c?.instanceId === source.instanceId)).toBe(true);
    expect(r.state.players[0].deck).toHaveLength(replacement ? 5 : 4);
  });
}

describe("identity grammar rejects malformed ids", () => {
  it("does not accept duplicate, empty, non-string or invalid JSON identities", async () => {
    const { decodeDonReturnIds } = await import("../engine/effect-resolver/actions/don.js");
    for (const ids of ['[]', '["a","a"]', '[1]', '{', 'null']) expect(decodeDonReturnIds(`don-return-ids:${ids}`)).toBeNull();
  });
});
