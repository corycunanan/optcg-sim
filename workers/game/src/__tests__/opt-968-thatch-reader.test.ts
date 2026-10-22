import { describe, expect, it } from "vitest";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";
import { scanReplacementsForBatch, processBatchReplacements, resumeReplacementBatch,
  continueReplacementBatchAfterSubstitute, type ReplacementBatchResumeContext } from "../engine/replacements.js";
import { resolverExecutionServices } from "../engine/effect-resolver/resolver.js";
import { expandReplacementVisits } from "../engine/replacement-ability-identity.js";
import { SessionRepository } from "../session/persistence.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import type { EffectBlock } from "../engine/effect-types.js";

const options = { nextJsUrl: "https://app.example.test", workerSecret: "secret" };
function setup() { const r = rig(); r.state.schemaVersion = 6; r.deck(0, 8); r.deck(1, 8);
  const thatch = r.put("OP08-045", 0, "CHARACTER", { data: { power: 6000 } });
  return { r, thatch }; }
function remove(r: Rig, type: "KO" | "RETURN_TO_HAND" | "RETURN_TO_DECK", controller: 0 | 1) {
  const schema = synSchema("OPT968-THATCH-REMOVAL", [{ id: "main", category: "activate", trigger: { keyword: "MAIN_EVENT" },
    actions: [{ type, target: { type: "CHARACTER", controller: controller === 1 ? "OPPONENT" : "SELF", count: { all: true } } }] }], "Event");
  const source = r.put(schema.card_id!, controller, "HAND", { schema, data: { type: "Event", cost: 0, power: null, effectText: "[Main] Remove Characters." } });
  r.state.turn.activePlayerIndex = controller;
  r.act({ type: "PLAY_CARD", cardInstanceId: source.instanceId }, controller);
}

describe("OPT-968 one printed Thatch OR ability (OP-08 printed clause)", () => {
  for (const type of ["KO", "RETURN_TO_HAND", "RETURN_TO_DECK"] as const) for (const controller of [0, 1] as const) {
    it(`${type} by P${controller}: one substitute iff KO or opponent removal`, () => {
      const { r, thatch } = setup(); const hand = r.state.players[0].hand.length;
      const deck = r.state.players[0].deck.length;
      remove(r, type, controller);
      const replaces = type === "KO" || controller === 1;
      expect(r.state.pendingPrompt).toBeNull(); expect(r.state.effectStack).toEqual([]);
      expect(r.state.players[0].characters.some((c) => c?.instanceId === thatch.instanceId)).toBe(false);
      expect(r.state.players[0].trash.filter((c) => c.cardId === thatch.cardId)).toHaveLength(replaces ? 1 : 0);
      expect(r.state.players[0].hand).toHaveLength(hand + (replaces || type === "RETURN_TO_HAND" ? 1 : 0));
      expect(r.state.players[0].deck).toHaveLength(deck + (replaces ? -1 : type === "RETURN_TO_DECK" ? 1 : 0));
      expect(r.state.eventLog.filter((e) => e.type === "CARD_KO" && e.payload.cardInstanceId === thatch.instanceId)).toHaveLength(0);
    });
  }
  it("empty deck cannot pay the complete trash-and-draw substitute", () => {
    const { r, thatch } = setup(); r.deck(0, 0);
    expect(scanReplacementsForBatch(r.state, [thatch.instanceId], "WOULD_BE_KO", "effect", 1, r.db, resolverExecutionServices)).toEqual([]);
  });
  it("two source instances remain two ordering options, then pay once per instance", () => {
    const { r, thatch } = setup(); const second = r.put("OP08-045", 0, "CHARACTER");
    remove(r, "KO", 1); expect(r.promptType()).toBe("PLAYER_CHOICE");
    const prompt = r.state.pendingPrompt!.options;
    if (prompt.promptType !== "PLAYER_CHOICE") throw new Error("ordering required");
    expect(prompt.choices).toHaveLength(2);
    const firstId = r.state.activeEffects.find((e) => e.sourceCardInstanceId === thatch.instanceId && e.sourceEffectBlockId === "replacement_ko")!.id;
    r.act({ type: "PLAYER_CHOICE", choiceId: firstId });
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[0].trash.filter((c) => c.cardId === thatch.cardId)).toHaveLength(2);
    expect(r.state.players[0].hand).toHaveLength(2); expect(r.state.players[0].deck).toHaveLength(6);
  });

  it.each([false, true])("undeclared same-source identical abilities still order (reload=%s)", async (reload) => {
    const r = rig(); r.state.schemaVersion = 6; r.deck(0, 5); r.deck(1, 5);
    const block: EffectBlock = { id: "a", category: "replacement", replaces: { event: "WOULD_BE_KO" },
      replacement_actions: [{ type: "SET_REST", target: { type: "SELF" } }] };
    r.put("OPT968-INDEPENDENT", 0, "CHARACTER", { schema: synSchema("OPT968-INDEPENDENT", [block, { ...block, id: "b" }]) });
    remove(r, "KO", 1); expect(r.promptType()).toBe("PLAYER_CHOICE");
    if (reload) await r.reload();
    const p = r.state.pendingPrompt!.options; if (p.promptType !== "PLAYER_CHOICE") throw new Error("order");
    expect(p.choices).toHaveLength(2); r.act({ type: "PLAYER_CHOICE", choiceId: p.choices[1].id });
    expect(r.state.pendingPrompt).toBeNull(); expect(r.state.players[0].characters.filter(Boolean)).toHaveLength(1);
  });

  it.each(["replacement_ko", "replacement_removal"])("keeps a previously offered concrete sibling %s eligible", (blockId) => {
    const { r, thatch } = setup();
    const effect = r.state.activeEffects.find((e) => e.sourceEffectBlockId === blockId)!;
    const ctx: ReplacementBatchResumeContext = { type: "REPLACEMENT_BATCH", allTargetIds: [thatch.instanceId],
      event: "WOULD_BE_KO", events: ["WOULD_BE_KO", "WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"],
      actionKind: "KO", causingController: 1, cause: "effect", protectedIds: [], visitedEffectIds: [], currentMatchIndex: 0,
      pendingMatches: [{ effectId: effect.id, matchedTargetIds: [thatch.instanceId], optional: false }] };
    const result = resumeReplacementBatch(r.state, ctx, true, r.db, resolverExecutionServices);
    expect(result.state.pendingPrompt).toBeNull(); expect(result.state.players[0].hand).toHaveLength(1);
    expect(result.state.players[0].trash.filter((c) => c.cardId === thatch.cardId)).toHaveLength(1);
  });

  it("a visited/declined sibling excludes the whole ability while source remains present", () => {
    const { r, thatch } = setup(); const effects = r.state.activeEffects.filter((e) => e.sourceCardInstanceId === thatch.instanceId);
    const result = processBatchReplacements(r.state, [thatch.instanceId], "KO", "WOULD_BE_KO", "effect", 1, r.db, resolverExecutionServices);
    expect(result.pendingPrompt).toBeUndefined();
    // Constructed legacy progress: decline left the source unprotected. Existing
    // concrete IDs retain the meaning, without adding persisted alias fields.
    const ctx: ReplacementBatchResumeContext = { type: "REPLACEMENT_BATCH", allTargetIds: [thatch.instanceId], event: "WOULD_BE_KO",
      events: ["WOULD_BE_KO", "WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"], actionKind: "KO", causingController: 1, cause: "effect",
      protectedIds: [], visitedEffectIds: [effects[1].id], currentMatchIndex: 0,
      pendingMatches: [{ effectId: effects[0].id, matchedTargetIds: [thatch.instanceId], optional: false }] };
    const declined = resumeReplacementBatch(r.state, ctx, false, r.db, resolverExecutionServices);
    expect(declined.state.players[0].hand).toHaveLength(0);
    expect(declined.events.filter((e) => e.type === "CARD_KO" && e.payload?.cardInstanceId === thatch.instanceId)).toHaveLength(1);
  });

  it("concrete visit expansion survives a disappearing representative and nested repark without duplicates", async () => {
    const { r, thatch } = setup(); const effects = r.state.activeEffects.filter((e) => e.sourceCardInstanceId === thatch.instanceId);
    const visitedEffectIds = expandReplacementVisits(r.state, [effects[0].id], r.db);
    r.state.activeEffects = r.state.activeEffects.filter((e) => e.id !== effects[0].id);
    const ctx: ReplacementBatchResumeContext = { type: "REPLACEMENT_BATCH", allTargetIds: [thatch.instanceId], event: "WOULD_BE_KO",
      events: ["WOULD_BE_KO", "WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"], actionKind: "KO", causingController: 1, cause: "effect",
      protectedIds: [], visitedEffectIds, currentMatchIndex: 0,
      pendingMatches: [{ effectId: effects[0].id, matchedTargetIds: [thatch.instanceId], optional: false }] };
    const result = continueReplacementBatchAfterSubstitute(r.state, ctx, r.db, resolverExecutionServices);
    expect(result.pendingPrompt).toBeUndefined(); expect(result.state.players[0].hand).toHaveLength(0);
    const storage = new MemorySessionStorage(); const repo = new SessionRepository(storage, options);
    const source = { state: result.state, cardDb: r.db, mode: "PVP" as const, pregameMode: "PRIORITY_ROLL" as const, testPriorityRolls: null, undoHistory: [result.state] };
    await repo.save(source); const loaded = (await new SessionRepository(storage, options).load())!;
    expect(loaded.undoHistory[0]).toEqual(loaded.state);
  });
});
