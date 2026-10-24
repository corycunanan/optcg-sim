import { describe, expect, it } from "vitest";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";
import { computeExpiry } from "../engine/effect-resolver/action-utils.js";
import { MemorySessionStorage } from "./fixtures/opt-940-synthetic-states.js";
import { SessionRepository } from "../session/persistence.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";

describe.each(["memory", "live", "undo"])("Refresh expiry and OP11-040 (%s)", path => {
  it("expires before the condition scan and persisted optional pause, then returns DON and activates", async () => {
    const r = endPhaseRig({ deckSize: 8 });
    const leader = r.put("OP11-040", 1, "LEADER");
    const sourceId = "REFRESH-PERSIST-1003";
    const source = r.putSyn(sourceId, synSchema(sourceId, "Character", [
      { id: "expired-condition", category: "auto", trigger: { keyword: "START_OF_TURN" }, conditions: { type: "SELF_POWER", operator: ">=", value: 6000 }, actions: [{ type: "DRAW", params: { amount: 1 } }] },
    ]), 1, "CHARACTER", { power: 5000 });
    const duration = { type: "UNTIL_START_OF_YOUR_NEXT_TURN" } as const;
    r.state.activeEffects.push({ id: "expiring-power", sourceCardInstanceId: source.instanceId, sourceEffectBlockId: "buff", category: "auto", controller: 1, duration, expiresAt: computeExpiry(duration, r.state, 1), modifiers: [{ type: "MODIFY_POWER", params: { amount: 1000 }, duration }], appliesTo: [source.instanceId], timestamp: 0 });
    const player = r.state.players[1];
    player.leader.attachedDon = player.donCostArea.slice(0, 2).map(d => ({ ...d, attachedTo: leader.instanceId }));
    player.donCostArea = [...player.donCostArea.slice(2), ...Array.from({ length: 2 }, (_, i) => ({ instanceId: `refresh-extra-${i}`, state: "RESTED" as const, attachedTo: null }))];
    player.characters[0]!.state = "RESTED";
    const beforeHand = player.hand.length;
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.turn.phase).toBe("REFRESH");
    // Decision 3 still scans both triggers; condition eligibility is checked
    // when its selected effect activates, after expiry.
    expect(r.state.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
    expect(r.state.activeEffects.some(e => e.id === "expiring-power")).toBe(false);
    expect(r.state.players[1].hand).toHaveLength(beforeHand);
    expect(r.state.players[1].leader.attachedDon).toHaveLength(2);
    expect(r.state.players[1].characters[0]!.state).toBe("RESTED");
    if (path !== "memory") {
      const storage = new MemorySessionStorage();
      const config = { nextJsUrl: "https://example.test", workerSecret: "secret" };
      await new SessionRepository(storage, config).save({ state: r.state, cardDb: r.db, mode: "PVP", pregameMode: "PRIORITY_ROLL", testPriorityRolls: null, undoHistory: [r.state] });
      const loaded = (await new SessionRepository(storage, config).load())!;
      r.state = path === "undo" ? loaded.undoHistory[0] : loaded.state;
    }
    r.orderTriggers();
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    const coordinator = new SessionCoordinator();
    const resumed = resumePromptLifecycle(r.state, { type: "PLAYER_CHOICE", choiceId: "skip", ...(r.state.pendingPrompt?.promptId ? { promptId: r.state.pendingPrompt.promptId } : {}) }, r.db, { drainPregame: s => s, advanceStartOfTurn: s => coordinator.advanceStartOfTurn(s, r.db) });
    expect(resumed.responseRejected).toBe(false);
    expect(resumed.state.pendingPrompt).toBeNull();
    expect(resumed.state.turn.phase).toBe("MAIN");
    expect(resumed.state.players[1].leader.attachedDon).toHaveLength(0);
    expect(resumed.state.players[1].characters[0]!.state).toBe("ACTIVE");
    // Only the ordinary Draw Phase card, never the expired power condition.
    expect(resumed.state.players[1].hand).toHaveLength(beforeHand + 1);
  });
});
