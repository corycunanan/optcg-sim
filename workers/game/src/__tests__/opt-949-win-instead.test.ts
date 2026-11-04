/**
 * OPT-949 (OPT-960 review round 1, finding E) — LOSS_CONDITION_MOD
 * `WIN_INSTEAD` at the rule-processing checkpoint.
 *
 * Card text: OP03-040 Nami (`docs/cards/OP-03.md:283`) "When your deck is
 * reduced to 0, you win the game instead of losing, according to the rules."
 * P-117 Nami (`docs/cards/UNKNOWN.md:684`) carries the same clause.
 * Rules v1.2.0: 1-3-1 (line 57) card text over rules; 1-2-5 (line 53) card
 * effects may cause a player to win; 9-2-1 (line 880) every player meeting a
 * defeat condition at one checkpoint loses; 1-2-1 (line 35).
 * FAQ: qa_op09.md:204-206 and qa_op10.md:207 — with the Nami Leader's effect
 * negated for the turn, a deck reduced to 0 loses the game.
 *
 * Joint checkpoints have no official ruling (assumed, literal reading): the
 * clause replaces only the deck-out loss with a win. A Nami player whose deck
 * is 0 wins, which makes the opponent lose at that checkpoint. If the
 * opponent also meets a defeat condition, Nami still wins. If the Nami player
 * also takes lethal damage at the same checkpoint, that loss is not replaced:
 * both players lose at one checkpoint, a draw (9-2-1).
 *
 * | Clause | Condition / evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | OP03-040 / P-117 WIN_INSTEAD | Nami's deck reaches 0 (MILL action) | none | none | checkpoint after the move | FINISHED winner = Nami's player | "Nami deck-out wins" |
 * | same, Leader negated (qa_op09.md:204-206) | negated for the turn | none | none | same | winner = opponent | "negated Nami loses" |
 * | joint: Nami deck-out + opponent deck-out (assumed) | one checkpoint (synthetic) | none | none | one evaluation | winner = Nami | "joint: Nami deck-out and opponent defeat" |
 * | joint: Nami deck-out + Nami lethal damage (assumed) | one checkpoint (synthetic) | none | none | one evaluation | draw | "joint: Nami deck-out and Nami lethal damage" |
 */
import { describe, expect, it } from "vitest";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { runRuleProcessing } from "../engine/defeat.js";
import { expectTerminal, rig, synSchema, type Rig } from "./opt-960-rig.js";

function millSelf(r: Rig, amount: number) {
  const card = r.put("SYN-MILL-SELF", 0, "CHARACTER", {
    schema: synSchema("SYN-MILL-SELF", [
      {
        id: "mill",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: [{ type: "MILL", params: { amount } }],
      } as never,
    ]),
  });
  r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "mill" });
}

function negateLeader(r: Rig, owner: 0 | 1) {
  const negation = {
    id: "negate-leader",
    sourceCardInstanceId: r.state.players[owner === 0 ? 1 : 0].leader.instanceId,
    sourceEffectBlockId: "negate",
    category: "auto",
    modifiers: [{ type: "NEGATE_EFFECTS_FLAG", params: {}, duration: { type: "THIS_TURN" } }],
    duration: { type: "THIS_TURN" },
    expiresAt: { wave: "END_OF_TURN", turn: r.state.turn.number },
    controller: owner === 0 ? 1 : 0,
    appliesTo: [r.state.players[owner].leader.instanceId],
    timestamp: 0,
  } as RuntimeActiveEffect;
  r.state.activeEffects = [...r.state.activeEffects, negation];
}

describe("WIN_INSTEAD: a Nami Leader wins when its deck reaches 0 (OP-03.md:283; rule 1-3-1 line 57)", () => {
  it.each(["OP03-040", "P-117"])("Nami deck-out wins (%s)", (leaderId) => {
    const r = rig();
    r.leader(0, leaderId);
    r.deck(0, 1);
    millSelf(r, 1);
    expect(r.state.players[0].deck).toHaveLength(0);
    expectTerminal(r.state, { winner: 0, reason: "Player 1's deck reached 0 — Player 1 wins instead of losing" });
  });

  it.each(["OP03-040", "P-117"])("negated Nami loses on deck-out (%s; qa_op09.md:204-206)", (leaderId) => {
    const r = rig();
    r.leader(0, leaderId);
    r.deck(0, 1);
    negateLeader(r, 0);
    millSelf(r, 1);
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
  });

  it("joint: Nami deck-out and opponent defeat at one checkpoint (synthetic, assumed): Nami wins", () => {
    const r = rig();
    r.leader(0, "OP03-040");
    r.state.players[0].deck = [];
    r.state.players[1].deck = [];
    expectTerminal(runRuleProcessing(r.state, {}, r.db), {
      winner: 0,
      reason: "Player 1's deck reached 0 — Player 1 wins instead of losing; Player 2 decked out",
    });
    const lethal = rig();
    lethal.leader(0, "OP03-040");
    lethal.state.players[0].deck = [];
    lethal.state.players[1].life = [];
    expect(runRuleProcessing(lethal.state, { lethalDamage: [1] }, lethal.db).winner).toBe(0);
  });

  it("joint: Nami deck-out and Nami lethal damage at one checkpoint (synthetic, assumed): draw", () => {
    const r = rig();
    r.leader(0, "OP03-040");
    r.state.players[0].deck = [];
    r.state.players[0].life = [];
    expectTerminal(runRuleProcessing(r.state, { lethalDamage: [0] }, r.db), {
      winner: null,
      reason: "Player 1's deck reached 0 — Player 1 wins instead of losing; Player 1's life reached 0 — draw",
    });
  });
});
