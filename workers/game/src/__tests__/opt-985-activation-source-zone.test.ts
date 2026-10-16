import { describe, expect, it } from "vitest";
import { beginEngineResolution } from "../engine/engine-limits.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { validate } from "../engine/validation.js";
import { moveCard } from "../engine/zone-transition.js";
import { SessionCoordinator } from "../session/coordinator.js";
import type { CardInstance, GameAction } from "../types.js";
import { rig, type Rig } from "./opt-960-rig.js";

function activation(source: CardInstance, effectId: string): GameAction {
  return { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId };
}

function expectRejected(r: Rig, action: GameAction, error: string) {
  const before = structuredClone(r.state);
  expect(validate(r.state, action, r.db, 0)).toBe(error);
  expect(r.state).toEqual(before);
  const result = runPipeline(r.state, action, r.db, 0);
  expect(result.valid).toBe(false);
  expect(result.error).toBe(error);
  expect(result.pendingPrompt).toBeUndefined();
  expect(result.state).toEqual(before);
  expect(r.state).toEqual(before);
}

function fixture() {
  const r = rig();
  // Start with initialized, unused resolution bookkeeping.
  r.state = beginEngineResolution(r.state);
  return r;
}

// Rule 2-8-2: source text is valid in its field area. OP01-013's Life
// cost is payable in these fixtures, so it cannot mask an illegal source.
// ST01-007 covers a cost-free block; OP01-013 also covers optional prompts.
describe("OPT-985 activation source zones", () => {
  it.each(["HAND", "TRASH", "LIFE", "DECK"] as const)(
    "rejects optional activation from %s without mutation",
    (zone) => {
      const r = fixture();
      const source = r.put("OP01-013", 0, zone);
      expectRejected(r, activation(source, "activate_life_buff"), "Card must be on the field to activate this effect");
    },
  );

  it("rejects a cost-free activation from hand without mutation", () => {
    const r = fixture();
    const source = r.put("ST01-007", 0, "HAND");
    expectRejected(r, activation(source, "activate_give_don"), "Card must be on the field to activate this effect");
  });

  it("checks the source zone before cost feasibility", () => {
    const r = fixture();
    const source = r.put("OP01-013", 0, "TRASH");
    r.life(0, 0);
    expectRejected(r, activation(source, "activate_life_buff"), "Card must be on the field to activate this effect");
  });

  it.each([
    ["ST01-001", "LEADER", "Leader", "activate_give_don"],
    ["ST01-007", "CHARACTER", "Character", "activate_give_don"],
    ["ST01-017", "STAGE", "Stage", "activate_power_boost"],
  ] as const)("allows %s in its %s area", (id, zone, type, effectId) => {
    const r = fixture();
    const source = r.put(id, 0, zone === "STAGE" ? "HAND" : zone, { data: { type } });
    if (zone === "STAGE") {
      r.state.players[0].hand = [];
      source.zone = "STAGE";
      r.state.players[0].stage = source;
      r.state = registerCardEnteredField(r.state, source, r.db.get(id)!);
    }
    r.state.players[0].donCostArea[0].state = "RESTED";
    const action = activation(source, effectId);
    expect(validate(r.state, action, r.db, 0)).toBeNull();
    const result = runPipeline(r.state, action, r.db, 0);
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt).toBeDefined();
  });

  it("keeps the opponent field ownership error unchanged", () => {
    const r = fixture();
    const source = r.put("OP01-013", 1, "CHARACTER");
    expectRejected(r, activation(source, "activate_life_buff"), "Not your card");
  });

  it("rejects a stale instance after its source left the field", () => {
    const r = fixture();
    const source = r.put("OP01-013", 0, "CHARACTER");
    const action = activation(source, "activate_life_buff");
    // A zone change makes a new card instance (rule 3-1-6).
    r.state = moveCard(r.state, source.instanceId, "TRASH");
    const moved = r.state.players[0].trash[0];
    expect(moved.instanceId).not.toBe(source.instanceId);
    expectRejected(r, action, "Not your card");
    expectRejected(r, activation(moved, "activate_life_buff"), "Card must be on the field to activate this effect");

    const coordinator = new SessionCoordinator();
    r.state.engineActionCount = 7;
    r.state.executionContext.actionBudget.consumed = 7;
    for (const staleAction of [action, activation(moved, "activate_life_buff")]) {
      const before = structuredClone(r.state);
      const result = coordinator.executeAction(r.state, [], 0, staleAction, r.db);
      expect(result.kind).toBe("reject");
      expect(result.state).toEqual(before);
      expect(r.state).toEqual(before);
    }
  });
});
