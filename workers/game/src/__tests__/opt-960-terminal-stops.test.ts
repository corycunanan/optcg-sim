/**
 * OPT-960 review round 1 — terminal stops in paths outside the resolver loop,
 * and the end-of-turn window placement.
 *
 * Rules v1.2.0, `docs/rules/rule_comprehensive.md`: 9-1-2 (line 876) rule
 * processing is immediate; 9-2-1-2 (line 884) 0 cards in deck; 10-1-5-3
 * (line 914) the [Trigger] card is trashed after its effect; 7-1-4-1-1-3
 * (line 672) Double Attack repeats the Life step per damage; 6-6-1-4 (line
 * 624) the turn ends only after all End Phase processing. OP15-022 Brook
 * (`docs/cards/OP-15.md:158`): "You lose at the end of the turn in which your
 * deck becomes 0 cards."
 *
 * | Clause | Condition / evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | 10-1-5 + 9-1-2: a battle [Trigger] "trash 5 from your deck" empties the defender's deck | defender accepts the Trigger | none | defender | game ends inside the Trigger; the battle never continues | FINISHED winner 0, `battle` null, no END_OF_BATTLE, `GAME_OVER` last | "battle Trigger …" |
 * | same with [Double Attack] (7-1-4-1-1-3) | point 1's Trigger ends the game | none | defender | point 2 is never dealt | defender Life stays 1 | "Double Attack …" |
 * | effect-damage Trigger (OPT-259) "trash 5 from your deck" | defender accepts | none | defender | the remaining effect never continues | FINISHED winner 0 | "effect-damage Trigger …" |
 * | scheduled END_OF_THIS_TURN MILL empties the ending player's deck | in the End Phase | none | none | no hand-off | FINISHED winner 1, active player still 0, no TURN_STARTED, sticky flag kept | "scheduled action …" |
 * | SEARCH_DECK picks the last deck card, THEN WIN_GAME (reload before the reply) | at the resumed move | none | p0 | the remaining chain never runs | FINISHED winner 1 "Player 1 decked out" | "resumed search …" |
 * | Brook delayed loss + p0's [End of Your Turn] "opponent trashes 1" emptying p1's 1-card deck | Brook's flag already set; ADVANCE_PHASE | none | none | the end-of-turn window opens only at action end (base placement) | winner 0 (see the test comment) | "end-of-turn window …" |
 */
import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import type { CardData } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { expectTerminal, rig, synSchema, type Rig } from "./opt-960-rig.js";
import { CARDS } from "./helpers.js";
import { battleTriggerLifeCard, effectTriggerWindow, revealTrigger } from "./trigger-window-helpers.js";

const MILL5_TRIGGER = "SYN-TRIGGER-MILL5";

/** A [Trigger] Life card whose Trigger trashes 5 cards from its owner's deck. */
function trashFiveTrigger(): { data: Partial<CardData>; schema: ReturnType<typeof synSchema> } {
  return {
    data: { ...CARDS.TRIGGER, id: MILL5_TRIGGER, name: MILL5_TRIGGER, triggerText: "[Trigger] Trash 5 cards from the top of your deck." },
    schema: synSchema(MILL5_TRIGGER, [
      { id: "mill5", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "MILL", params: { amount: 5 } }] } as never,
    ]),
  };
}

function attackAndReveal(r: Rig, attackerId: string) {
  r.act({ type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: r.state.players[1].leader.instanceId });
  r.act({ type: "PASS" });
  r.act({ type: "PASS" });
  expect(battleTriggerLifeCard(r.state)?.cardId).toBe(MILL5_TRIGGER);
  const result = revealTrigger(r.state, true, r.db);
  expect(result.valid, result.error).toBe(true);
  r.state = result.state;
}

describe("battle [Trigger] that ends the game stops the battle (rules 9-1-2 line 876, 10-1-5-3 line 914)", () => {
  it("battle Trigger: the Trigger empties the defender's deck; the battle never continues after GAME_OVER", () => {
    const r = rig();
    r.life(1, 1);
    r.put(MILL5_TRIGGER, 1, "LIFE", trashFiveTrigger());
    r.deck(1, 2);
    const attacker = r.put("SYN-ATTACKER-9000", 0, "CHARACTER", { data: { power: 9000 } });
    attackAndReveal(r, attacker.instanceId);
    expectTerminal(r.state, { winner: 0, reason: "Player 2 decked out" });
    expect(r.state.turn.battleSubPhase ?? null).toBeNull();
    const log = r.state.eventLog.map((e) => e.type);
    expect(log.at(-1)).toBe("GAME_OVER");
    expect(log).not.toContain("END_OF_BATTLE");
    expect(log).not.toContain("BATTLE_RESOLVED");
  });

  it("Double Attack: the Trigger on point 1 ends the game, so point 2 never takes a Life card", () => {
    const r = rig();
    r.life(1, 1);
    r.put(MILL5_TRIGGER, 1, "LIFE", trashFiveTrigger());
    r.deck(1, 2);
    const hand = r.state.players[1].hand.length;
    const attacker = r.put("SYN-DA-9000", 0, "CHARACTER", {
      data: { ...CARDS.DOUBLE_ATK, id: "SYN-DA-9000", power: 9000 },
    });
    attackAndReveal(r, attacker.instanceId);
    expectTerminal(r.state, { winner: 0, reason: "Player 2 decked out" });
    expect(r.state.players[1].life).toHaveLength(1);
    expect(r.state.players[1].hand).toHaveLength(hand);
    expect(r.state.eventLog.map((e) => e.type).at(-1)).toBe("GAME_OVER");
  });

  it("effect-damage Trigger: the Trigger empties the defender's deck and the damage sequence stops", () => {
    const r = rig();
    r.life(1, 1);
    r.put(MILL5_TRIGGER, 1, "LIFE", trashFiveTrigger());
    r.deck(1, 2);
    const dealer = r.put("SYN-DMG-2", 0, "CHARACTER", {
      schema: synSchema("SYN-DMG-2", [
        {
          id: "dmg",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [{ type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 2 } }],
        } as never,
      ]),
    });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: dealer.instanceId, effectId: "dmg" });
    expect(effectTriggerWindow(r.state)?.lifeCard.cardId).toBe(MILL5_TRIGGER);
    const result = revealTrigger(r.state, true, r.db);
    expect(result.valid, result.error).toBe(true);
    r.state = result.state;
    expectTerminal(r.state, { winner: 0, reason: "Player 2 decked out" });
    expect(r.state.players[1].life).toHaveLength(1);
    expect(r.state.eventLog.map((e) => e.type).at(-1)).toBe("GAME_OVER");
  });
});

describe("End Phase stops after a scheduled action ends the game (rules 9-1-2 line 876, 6-6-1-4 line 624)", () => {
  it("scheduled action: an END_OF_THIS_TURN MILL empties the ending player's deck; no hand-off follows", () => {
    const r = rig();
    r.deck(0, 1);
    r.state.scheduledActions = [
      {
        id: "sched-mill",
        sourceEffectId: r.state.players[0].leader.instanceId,
        controller: 0,
        timing: "END_OF_THIS_TURN",
        boundToInstanceId: null,
        action: { type: "MILL", params: { amount: 1 } },
      } as never,
    ];
    r.act({ type: "ADVANCE_PHASE" });
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
    expect(r.state.turn.activePlayerIndex).toBe(0);
    expect(r.state.turn.deckHitZeroThisTurn?.[0]).toBe(true);
    const log = r.state.eventLog.map((e) => e.type);
    expect(log).not.toContain("TURN_STARTED");
    expect(log).not.toContain("TURN_ENDED");
    expect(log.at(-1)).toBe("GAME_OVER");
  });
});

describe("a resumed deck move runs rule processing before the remaining chain (rules 9-1-2 line 876, 9-2-1-2 line 884)", () => {
  it("resumed search: picking the last deck card after a reload ends the game before THEN WIN_GAME", async () => {
    const r = rig();
    r.deck(0, 1);
    const card = r.put("SYN-SEARCH-WIN", 0, "CHARACTER", {
      schema: synSchema("SYN-SEARCH-WIN", [
        {
          id: "search",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [
            { type: "SEARCH_DECK", params: { look_at: 1, filter: {}, pick_count: 1 } },
            { type: "WIN_GAME", chain: "THEN" },
          ],
        } as never,
      ]),
    });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: "search" });
    expect(r.promptType()).toBe("ARRANGE_TOP_CARDS");
    await r.reload();
    const last = r.state.players[0].deck[0].instanceId;
    r.act({ type: "ARRANGE_TOP_CARDS", keptCardInstanceIds: [last], orderedInstanceIds: [] } as never);
    expect(r.state.players[0].deck).toHaveLength(0);
    expectTerminal(r.state, { winner: 1, reason: "Player 1 decked out" });
  });
});

describe("end-of-turn window opens only at action end (base placement; OPT-962 may move it)", () => {
  // Base (1b3f6a50) gave a joint draw here: the [End of Your Turn] MILL ran,
  // nothing checked p1's empty deck until action end, and Brook's window
  // opened at the same checkpoint. Head checks the MILL when it happens
  // (9-1-2), so p1 decks out first and p0 wins; Brook's own loss is "at the
  // end of the turn" (OP-15.md:158), which comes after End Phase processing
  // (6-6-1-4). Head must NOT open Brook's window before the [End of Your
  // Turn] effect resolves (that would make p1 the winner, which no reading
  // supports). This pins the head result as a guard; OPT-962 owns where the
  // window sits inside the End Phase.
  it("end-of-turn window: p0's [End of Your Turn] empties p1's deck before Brook's delayed loss is collected", () => {
    const r = rig();
    r.leader(0, "OP15-022");
    r.deck(0, 0);
    r.deck(1, 1);
    r.state.turn.deckHitZeroThisTurn = [true, false];
    r.put("SYN-EOYT-OPP-MILL", 0, "CHARACTER", {
      schema: synSchema("SYN-EOYT-OPP-MILL", [
        {
          id: "eoyt",
          category: "auto",
          trigger: { keyword: "END_OF_YOUR_TURN" },
          actions: [{ type: "OPPONENT_ACTION", params: { action: { type: "MILL", params: { amount: 1 } } } } as Action],
        } as never,
      ]),
    });
    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.players[1].deck).toHaveLength(0);
    expectTerminal(r.state, { winner: 0, reason: "Player 2 decked out" });
  });
});
