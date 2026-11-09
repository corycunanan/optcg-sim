/**
 * OPT-1037: an action-level `optional` that could do nothing is skipped
 * without a prompt (rule 1-3-2). Card-level regressions for OP08-116 and
 * ST22-015 live in opt-894-counter-event-category.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import { getAllAuthoredSchemas } from "../engine/schema-registry.js";
import { isOptionalActionVacuous } from "../engine/effect-resolver/feasibility.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

const LIFE_TO_HAND: Action = {
  type: "LIFE_TO_HAND",
  params: { amount: 1, position: "TOP_OR_BOTTOM" },
  optional: true,
};

function vacuous(action: Action, ownLife: number, opponentLife = 5) {
  const db = createTestCardDb();
  const state = createBattleReadyState(db);
  state.players[0].life = state.players[0].life.slice(0, ownLife);
  state.players[1].life = state.players[1].life.slice(0, opponentLife);
  return isOptionalActionVacuous(state, action, state.players[0].leader.instanceId, 0, db, new Map());
}

describe("OPT-1037 isOptionalActionVacuous", () => {
  it("LIFE_TO_HAND with 0 Life can do nothing", () => {
    expect(vacuous(LIFE_TO_HAND, 0)).toBe(true);
  });

  it("LIFE_TO_HAND with any Life is a real choice", () => {
    expect(vacuous(LIFE_TO_HAND, 1)).toBe(false);
    expect(vacuous(LIFE_TO_HAND, 5)).toBe(false);
  });

  it("an opponent-Life LIFE_TO_HAND reads the opponent's Life", () => {
    const opponents: Action = { ...LIFE_TO_HAND, target: { type: "OPPONENT_LIFE" } };
    expect(vacuous(opponents, 5, 0)).toBe(true);
    expect(vacuous(opponents, 0, 1)).toBe(false);
  });

  it("other action types are never skipped by this check", () => {
    expect(vacuous({ type: "DRAW", params: { amount: 1 }, optional: true }, 0)).toBe(false);
  });

  it("inventory: every authored action-level optional LIFE_TO_HAND", () => {
    const found: string[] = [];
    const walk = (actions: Action[] | undefined, id: string | undefined) => {
      for (const action of actions ?? []) {
        if (action.type === "LIFE_TO_HAND" && action.optional === true) found.push(String(id));
      }
    };
    for (const schema of Object.values(getAllAuthoredSchemas())) {
      for (const block of schema.effects) walk(block.actions, schema.card_id);
    }
    // EB04-001 asks only with 2 or more Life, so its own condition gates it.
    expect(found.sort()).toEqual(["EB04-001", "OP08-116", "ST22-015"]);
  });
});
