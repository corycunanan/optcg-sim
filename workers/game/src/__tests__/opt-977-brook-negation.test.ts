import { describe, expect, it } from "vitest";
import type { Action, RuntimeActiveEffect } from "../engine/effect-types.js";
import { isCardNegated } from "../engine/modifiers.js";
import { expectTerminal, rig, synSchema, type Rig } from "./opt-960-rig.js";

function brookRig() {
  const r = rig();
  r.leader(0, "OP15-022");
  r.deck(0, 1);
  return r;
}

// Same opponent-applied flag fixture as opt-949-win-instead.test.ts; this is
// the runtime representation produced by NEGATE_EFFECTS (e.g. Black Hole).
function negateLeader(r: Rig, expiresThisTurn = true, owner: 0 | 1 = 0) {
  const opponent = owner === 0 ? 1 : 0;
  r.state.activeEffects.push({
    id: "negate-brook",
    sourceCardInstanceId: r.state.players[opponent].leader.instanceId,
    sourceEffectBlockId: "negate",
    category: "auto",
    modifiers: [{ type: "NEGATE_EFFECTS_FLAG", params: {} }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: r.state.turn.number + (expiresThisTurn ? 0 : 1) },
    controller: opponent,
    appliesTo: [r.state.players[owner].leader.instanceId],
    timestamp: 0,
  } as RuntimeActiveEffect);
  expect(isCardNegated(r.state.players[owner].leader, r.state, r.db)).toBe(true);
}

function activate(r: Rig, actions: Action[]) {
  const card = r.put("SYN-BROOK-CHECKPOINT", 0, "CHARACTER", {
    schema: synSchema("SYN-BROOK-CHECKPOINT", [{
      id: "main", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions,
    }]),
  });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "main" });
}

function expectLoss(r: Rig, phase: "MAIN" | "END", turn: number) {
  expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
  expect(r.state.turn).toMatchObject({ phase, number: turn, activePlayerIndex: 0 });
}

// Negation interpretations are assumed from Nami's FAQ (qa_op09.md:204-206).
// Refill does not cancel the obligation: faq_op15-eb04.md:142-144. Retaining
// that obligation under subsequent negation is assumed; no Brook ruling covers it.
describe("OPT-977 Brook delayed deck-out and Leader negation", () => {
  it("negated Brook loses at the checkpoint where its deck reaches zero", () => {
    const r = brookRig();
    const turn = r.state.turn.number;
    negateLeader(r);
    activate(r, [{ type: "MILL", params: { amount: 1 } }]);
    expectLoss(r, "MAIN", turn);
  });

  it("negated player-1 Brook loses immediately when its deck reaches zero during player 0's turn", () => {
    const r = rig();
    r.leader(1, "OP15-022");
    r.deck(1, 1);
    const turn = r.state.turn.number;
    negateLeader(r, true, 1);
    activate(r, [{
      type: "DRAW",
      target: { type: "PLAYER", controller: "OPPONENT" },
      params: { amount: 1 },
    }]);
    expect(r.state.players[1].deck).toHaveLength(0);
    expectTerminal(r.state, { winner: 0, reason: "Player 2 decked out" });
    expect(r.state.turn).toMatchObject({ phase: "MAIN", number: turn, activePlayerIndex: 0 });
  });

  it("unnegated Brook records zero and loses at the end of the same turn", () => {
    const r = brookRig();
    const turn = r.state.turn.number;
    activate(r, [{ type: "MILL", params: { amount: 1 } }]);
    expect(r.state.status).toBe("IN_PROGRESS");
    expect(r.state.turn.deckHitZeroThisTurn[0]).toBe(true);
    r.act({ type: "ADVANCE_PHASE" });
    expectLoss(r, "END", turn);
  });

  it("later negation with the deck still empty loses at the next checkpoint", () => {
    const r = brookRig();
    const turn = r.state.turn.number;
    activate(r, [{ type: "MILL", params: { amount: 1 } }]);
    negateLeader(r);
    activate(r, [{ type: "SET_REST", target: { type: "SELF" } }]);
    expectLoss(r, "MAIN", turn);
  });

  it.each([true, false])("refill preserves the sticky loss when later negation expires this turn: %s", (expiresThisTurn) => {
    const r = brookRig();
    const turn = r.state.turn.number;
    activate(r, [
      { type: "MILL", params: { amount: 1 } },
      { type: "RETURN_TO_DECK", target: { type: "SELF" }, params: { position: "BOTTOM" } },
    ]);
    expect(r.state.players[0].deck).toHaveLength(1);
    expect(r.state.turn.deckHitZeroThisTurn[0]).toBe(true);
    negateLeader(r, expiresThisTurn);
    activate(r, [{ type: "SET_REST", target: { type: "SELF" } }]);
    expect(r.state.status).toBe("IN_PROGRESS");
    r.act({ type: "ADVANCE_PHASE" });
    expectLoss(r, "END", turn);
    expect(isCardNegated(r.state.players[0].leader, r.state, r.db)).toBe(!expiresThisTurn);
  });
});
