/**
 * OPT-962 (OPT-924): the End Phase in rule order, through the real pipeline
 * and prompt lifecycle. Rules text: docs/rules/rule_comprehensive.md v1.2.0.
 *
 * Clause table (card/rule clause → condition and evaluation time → cost/payer
 * → target/chooser → timing/continuation → observable result → test):
 *
 * | Clause | Condition / when evaluated | Cost / payer | Target / chooser | Timing / continuation | Observable | Test |
 * |---|---|---|---|---|---|---|
 * | OP08-105 Bonney (docs/cards/OP-08.md): "[DON!! x1] [Your Turn] [Once Per Turn] When a card is removed from your opponent's Life cards, draw 2 cards and trash 1 card from your hand." ST13-002 Ace (docs/cards/ST-13.md:14): "[End of Your Turn] Trash all your face-up Life cards." Rule 6-6-1-1 (line 607), 10-2-7-1 (line 962). | Ace's removal happens in p0's End Phase, p0's turn; Bonney (p1) checks [Your Turn] when the removal fulfils it: false. | none | none | Ace resolves in p0's wave before the hand-off. | No p1 draw; the face-up Life card is in p0's trash before TURN_ENDED:p0. | "Bonney" |
 * | OP04-034 (docs/cards/OP-04.md:234): "[End of Your Turn] If you have 3 or more active DON!! cards, K.O. up to 1 of your opponent's rested Characters with a cost of 3 or less." OP03-015 Lim (docs/cards/OP-03.md:95): "[Opponent's Turn] When this Character is K.O.'d, give up to 1 of your opponent's Leader or Character cards −2000 power during this turn." | The K.O. happens on p0's turn, which is Lim's controller's opponent's turn: Lim's [Opponent's Turn] holds. | none | p0 chooses the K.O. target; p1 chooses Lim's target. | Lim's effect resolves inside p0's wave (nested trigger, 8-6-1 line 858). | p1's SELECT_TARGET prompt appears before TURN_ENDED:p0; the −2000 ends at 6-6-1-3. | "OP04-034 / Lim" |
 * | Rule 8-6-1-1 (line 860), Decision 9 (rev4 §10): an [End of Your Turn] effect newly fulfilled during the wave activates in the same step. | A Character played by a wave effect has an [End of Your Turn] draw; it is on the field during the wave. | none | p0 chooses the played card. | Same wave, before TURN_ENDED. | The played Character's draw logs before TURN_ENDED:p0. | "newly fulfilled" |
 * | Rule 6-6-1-2 (line 617), 6-6-1-3 (line 622). | p1's step-2 obligation reads c0 = 4000 base + "during this turn" +1000 (live until 6-6-1-3) − p0's "until the end of the turn" +1000 already gone after step 1. | none | none | Step 1 expiry before step 2's obligation; 6-6-1-3 after. | p1 draws (power exactly 5000). | "during this turn depends" |
 * | Rule 9-1-2 (rules processing immediate), rule 6-6-1-4 (line 624). | A wave draw empties p0's deck. | none | none | The End Phase stops: no wave 2, no hand-off. | GAME_OVER; no TURN_ENDED:p0; no p1 draw. | "terminal in wave" |
 * | OP15-022 Brook (docs/cards/OP-15.md:158): "You lose at the end of the turn in which your deck becomes 0 cards." Rule 6-6-1-4. | Deck hit 0 this turn; the window opens once at the End Phase boundary, after a prompted wave effect finished. | none | p0 answers the wave prompt. | Loss inside the End Phase. | GAME_OVER after the wave's prompt, no TURN_ENDED:p0. | "Brook after a wave prompt" |
 * | OP11-040 FAQ (docs/FAQs/qa_op11.md:114): "Effects that activate at the start of your turn → All given DON!! cards are returned to your cost area → All rested cards become active → Draw Phase". | Start-of-turn effect is offered with given DON!! still attached and rested cards still rested. | none | p1 accepts or declines. | Refresh steps run after the prompt. | DON!! attached and rested at the prompt; returned and active after. | "Refresh order" |
 *
 * Assumed (no ruling): newly fulfilled [End of Your Turn] effects that become
 * fulfilled during wave 2 do not reopen wave 1 (6-6-1-1-2 says wave 2 follows
 * wave 1 completing); none of these fixtures exercises it.
 */

import { describe, expect, it } from "vitest";
import type { CardInstance, GameState } from "../types.js";
import type { RuntimeActiveEffect, RuntimeScheduledAction } from "../engine/effect-types.js";
import { endPhaseRig, synSchema } from "./opt-962-rig.js";

const ACE = "ST13-002";
const BONNEY = "OP08-105";
const OP04_034 = "OP04-034";
const LIM = "OP03-015";

function faceUpLife(state: GameState, owner: 0 | 1, count: number): void {
  state.players[owner].life = state.players[owner].life.map((card, index) =>
    index < count ? { ...card, face: "UP" } : card
  );
}

describe("OPT-962 [End of Your Turn] effects resolve while the ending player is the turn player", () => {
  it("ST13-002 Ace with the opponent's OP08-105 Bonney: Ace's trash is on Ace's turn, so Bonney does not draw", () => {
    const r = endPhaseRig();
    r.put(ACE, 0, "LEADER");
    r.put(BONNEY, 1, "CHARACTER", {}, 1);
    faceUpLife(r.state, 0, 1);
    const p1Hand = r.state.players[1].hand.length;
    const p0Trash = r.state.players[0].trash.length;

    r.act({ type: "ADVANCE_PHASE" });

    const log = r.log();
    const endedAt = log.indexOf("TURN_ENDED:p0");
    expect(endedAt).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("CARD_REMOVED_FROM_LIFE:p0")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("CARD_REMOVED_FROM_LIFE:p0")).toBeLessThan(endedAt);
    // Decisive: Bonney never draws (base drew 2 and trashed 1 after the hand-off).
    expect(log).not.toContain("CARD_DRAWN:p1");
    expect(r.state.players[1].hand).toHaveLength(p1Hand);
    expect(r.state.players[0].life).toHaveLength(3);
    expect(r.state.players[0].trash).toHaveLength(p0Trash + 1);
  });

  it("OP04-034 K.O.s the opponent's rested Lim in the End Phase: Lim's [Opponent's Turn] On K.O. fires inside p0's wave", () => {
    const r = endPhaseRig();
    r.put(OP04_034, 0, "CHARACTER");
    const lim = r.put(LIM, 1, "CHARACTER", { cost: 3 });
    r.state.players[1].characters = r.state.players[1].characters.map((c) =>
      c?.instanceId === lim.instanceId ? { ...c, state: "RESTED" } : c
    ) as GameState["players"][1]["characters"];

    r.act({ type: "ADVANCE_PHASE" });

    // OP04-034 asks p0 for the K.O. target (up to 1).
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(r.state.pendingPrompt?.respondingPlayer).toBe(0);
    expect(r.state.turn.activePlayerIndex).toBe(0);
    expect(r.state.turn.phase).toBe("END");
    r.act({ type: "SELECT_TARGET", selectedInstanceIds: [lim.instanceId] });

    // Lim's On K.O. resolves in p0's End Phase: p1 chooses its −2000 target.
    expect(r.state.pendingPrompt?.options.promptType).toBe("SELECT_TARGET");
    expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
    expect(r.state.turn.activePlayerIndex).toBe(0);
    expect(r.log()).not.toContain("TURN_ENDED:p0");
    r.act({ type: "SELECT_TARGET", selectedInstanceIds: [r.state.players[0].leader.instanceId] }, 1);

    const log = r.log();
    const endedAt = log.indexOf("TURN_ENDED:p0");
    expect(endedAt).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("CARD_KO:p1")).toBeLessThan(endedAt);
    expect(log.lastIndexOf("POWER_MODIFIED:p1")).toBeLessThan(endedAt);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toEqual([]);
    // The −2000 lasted "during this turn": gone after 6-6-1-3.
    expect(r.state.activeEffects.some((e) => e.controller === 1 && e.duration.type === "THIS_TURN")).toBe(false);
  });

  it("a Character played during the wave fires its own [End of Your Turn] in the same wave (8-6-1-1, Decision 9)", () => {
    const r = endPhaseRig();
    const PLAYER = "SYN-EOYT-PLAYER";
    const LATE = "SYN-EOYT-LATE";
    r.putSyn(PLAYER, synSchema(PLAYER, "Character", [{
      id: "eoyt-play",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [{
        type: "PLAY_CARD",
        target: { type: "CHARACTER_CARD", source_zone: "HAND", count: { up_to: 1 }, filter: { name: LATE } },
        params: { source_zone: "HAND", cost_override: "FREE" },
      }],
    }]), 0, "CHARACTER");
    const late = r.putSyn(LATE, synSchema(LATE, "Character", [{
      id: "eoyt-late-draw",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    }]), 0, "HAND");

    r.act({ type: "ADVANCE_PHASE" });
    if (r.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
      r.act({ type: "SELECT_TARGET", selectedInstanceIds: [late.instanceId] });
    }

    const log = r.log();
    const endedAt = log.indexOf("TURN_ENDED:p0");
    expect(endedAt).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("CARD_PLAYED:p0")).toBeLessThan(endedAt);
    const draws = log.map((e, i) => (e === "CARD_DRAWN:p0" ? i : -1)).filter((i) => i >= 0);
    expect(draws).toHaveLength(1);
    expect(draws[0]).toBeGreaterThan(log.indexOf("CARD_PLAYED:p0"));
    expect(draws[0]).toBeLessThan(endedAt);
  });

  it("each [End of Your Turn] effect activates once per End Phase (6-6-1-1-1): TURN_ENDED opens no second window", () => {
    const r = endPhaseRig();
    const ID = "SYN-EOYT-ONCE";
    r.putSyn(ID, synSchema(ID, "Character", [{
      id: "eoyt-once",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    }]), 0, "CHARACTER");

    r.act({ type: "ADVANCE_PHASE" });

    expect(r.log().filter((e) => e === "CARD_DRAWN:p0")).toHaveLength(1);
    expect(r.log().indexOf("CARD_DRAWN:p0")).toBeLessThan(r.log().indexOf("TURN_ENDED:p0"));
  });
});

describe("OPT-962 expiry steps (6-6-1-2, 6-6-1-3)", () => {
  it("a 'during this turn' modifier outlives step 2 while the 'until the end of the turn' one is gone after step 1", () => {
    const r = endPhaseRig();
    const c0 = r.putSyn("SYN-C0", null, 0, "CHARACTER", { power: 4000 });
    const turn = r.state.turn.number;
    const base = (id: string, duration: RuntimeActiveEffect["duration"]): RuntimeActiveEffect => ({
      id,
      sourceCardInstanceId: c0.instanceId,
      sourceEffectBlockId: "syn",
      category: "auto",
      modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
      duration,
      expiresAt: { wave: "END_OF_TURN", turn, player: 0 },
      controller: 0,
      appliesTo: [c0.instanceId],
      timestamp: 1,
    });
    // Assumed mapping (duration-tracker.ts endPhaseExpiryClause): UNTIL_END_OF_YOUR_NEXT_TURN
    // due this turn is "until the end of the turn" (6-6-1-2 step 1); THIS_TURN is
    // "during this turn" (6-6-1-3).
    const untilEnd = base("syn-until-end", { type: "UNTIL_END_OF_YOUR_NEXT_TURN" });
    const during = base("syn-during", { type: "THIS_TURN" });
    const p1Obligation: RuntimeScheduledAction = {
      id: "syn-p1-step2",
      timing: "END_OF_THIS_TURN",
      action: {
        type: "DRAW",
        params: { amount: 1 },
        conditions: { all_of: [
          { type: "SELF_POWER", operator: ">=", value: 5000 },
          { type: "SELF_POWER", operator: "<=", value: 5000 },
        ] },
      },
      boundToInstanceId: null,
      sourceEffectId: c0.instanceId,
      controller: 1,
    };
    r.state = { ...r.state, activeEffects: [untilEnd, during], scheduledActions: [p1Obligation] };

    r.act({ type: "ADVANCE_PHASE" });

    const log = r.log();
    expect(log).toContain("CARD_DRAWN:p1");
    expect(log.indexOf("CARD_DRAWN:p1")).toBeLessThan(log.indexOf("TURN_ENDED:p0"));
    expect(r.state.activeEffects.some((e) => e.id === untilEnd.id || e.id === during.id)).toBe(false);
  });
});

describe("OPT-962 termination inside the End Phase", () => {
  it("a wave draw that empties the deck ends the game: no wave 2, no hand-off", () => {
    const r = endPhaseRig({ deckSize: 1 });
    const DRAWER = "SYN-EOYT-DRAW2";
    const EOOT = "SYN-EOOT-DRAW";
    r.putSyn(DRAWER, synSchema(DRAWER, "Character", [{
      id: "eoyt-draw2",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      actions: [{ type: "DRAW", params: { amount: 2 } }],
    }]), 0, "CHARACTER");
    r.putSyn(EOOT, synSchema(EOOT, "Character", [{
      id: "eoot-draw",
      category: "auto",
      trigger: { keyword: "END_OF_OPPONENT_TURN" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    }]), 1, "CHARACTER");

    r.act({ type: "ADVANCE_PHASE" });

    expect(r.state.status).toBe("FINISHED");
    expect(r.state.winner).toBe(1);
    const log = r.log();
    expect(log.filter((e) => e.startsWith("GAME_OVER"))).toHaveLength(1);
    expect(log).not.toContain("CARD_DRAWN:p1");
    expect(log).not.toContain("TURN_ENDED:p0");
    expect(log).not.toContain("TURN_STARTED:p1");
    expect(r.state.turn.activePlayerIndex).toBe(0);
  });

  it("Brook after a wave prompt: the delayed loss lands at the End Phase boundary, once, after the prompted effect finishes", () => {
    const r = endPhaseRig();
    r.put("OP15-022", 0, "LEADER");
    r.state.players[0].deck = [];
    const ASK = "SYN-EOYT-OPTIONAL";
    r.putSyn(ASK, synSchema(ASK, "Character", [{
      id: "eoyt-optional",
      category: "auto",
      trigger: { keyword: "END_OF_YOUR_TURN" },
      flags: { optional: true },
      actions: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 }, duration: { type: "THIS_TURN" } }],
    }]), 0, "CHARACTER");
    // The deck emptied earlier this turn; Brook's rule kept p0 alive until now.
    r.state = { ...r.state, turn: { ...r.state.turn, deckHitZeroThisTurn: [true, false] } };

    r.act({ type: "ADVANCE_PHASE" });
    expect(r.state.status).toBe("IN_PROGRESS");
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    r.act({ type: "PLAYER_CHOICE", choiceId: "accept" });

    expect(r.state.status).toBe("FINISHED");
    expect(r.state.winner).toBe(1);
    const log = r.log();
    expect(log.filter((e) => e.startsWith("GAME_OVER"))).toHaveLength(1);
    expect(log.indexOf("POWER_MODIFIED:p0")).toBeLessThan(log.findIndex((e) => e.startsWith("GAME_OVER")));
    expect(log).not.toContain("TURN_ENDED:p0");
    expect(log).not.toContain("TURN_STARTED:p1");
  });
});

describe("OPT-962 Refresh Phase order (OP11-040 FAQ, qa_op11.md:114)", () => {
  it("the start-of-turn effect is offered with given DON!! still attached and rested cards rested; DON!! return and set-active follow", () => {
    const r = endPhaseRig({ deckSize: 8 });
    const luffy = r.put("OP11-040", 1, "LEADER");
    const rested = r.putSyn("SYN-P1-RESTED", null, 1, "CHARACTER");
    const players = [...r.state.players] as GameState["players"];
    const don = players[1].donCostArea;
    players[1] = {
      ...players[1],
      leader: { ...players[1].leader, attachedDon: don.slice(0, 2).map((d) => ({ ...d, attachedTo: luffy.instanceId })) },
      donCostArea: [...don.slice(2), { instanceId: "don-p1-extra-0", state: "RESTED", attachedTo: null }, { instanceId: "don-p1-extra-1", state: "ACTIVE", attachedTo: null }],
      characters: players[1].characters.map((c) => (c?.instanceId === rested.instanceId ? { ...c, state: "RESTED" } : c)) as CardInstance[] as GameState["players"][1]["characters"],
    };
    r.state = { ...r.state, players };

    r.act({ type: "ADVANCE_PHASE" });

    // p1's turn has started; OP11-040 is offered before any Refresh step.
    expect(r.state.turn.activePlayerIndex).toBe(1);
    expect(r.state.turn.phase).toBe("REFRESH");
    expect(r.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
    expect(r.state.players[1].leader.attachedDon).toHaveLength(2);
    expect(r.state.players[1].characters.find((c) => c?.instanceId === rested.instanceId)?.state).toBe("RESTED");

    r.act({ type: "PLAYER_CHOICE", choiceId: "skip" }, 1);
    // The rig does not auto-advance; the Refresh Phase runs on the next advance.
    r.act({ type: "ADVANCE_PHASE" }, 1);
    expect(r.state.players[1].leader.attachedDon).toHaveLength(0);
    expect(r.state.players[1].characters.find((c) => c?.instanceId === rested.instanceId)?.state).toBe("ACTIVE");
    expect(r.state.players[1].donCostArea.every((d) => d.state === "ACTIVE")).toBe(true);
  });
});
