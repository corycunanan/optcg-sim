/**
 * OPT-925 (OPT-960) — effect damage to a Leader at 0 Life defeats that player.
 *
 * Rules v1.2.0, `docs/rules/rule_comprehensive.md`:
 * - 4-6-2 (line 439): "If any action deals damage to a Leader, the player whose
 *   Leader has taken damage will perform the following procedure"; 4-6-2-1/-2
 *   (lines 441-443): move one Life card to hand per point, repeated X times.
 * - 9-2-1-1 (line 882): a Leader that takes damage while its player has 0 Life
 *   fulfils the defeat condition. 9-1-2 (line 876): immediately.
 * FAQ: qa_eb03.md:131-133 (EB03-055 Nico Robin [On K.O.] damage at 0 Life wins);
 * qa_op14_eb04.md:339-341 (OP14-115 Rindo: you take 1 damage even if you add no
 * Life card).
 *
 * Multi-damage decision (assumed; no ruling found): 4-6-2 says the Leader takes
 * the damage and then the player repeats the Life-to-hand procedure per point.
 * The 9-2-1-1 condition ("takes damage when that player has 0 Life cards") is
 * therefore evaluated once, as the instruction deals its damage. X damage dealt
 * at 1 Life is not lethal; X damage dealt at 0 Life is. No printed card deals
 * more than 1 effect damage today (`grep -n "deal [2-9] damage" docs/cards`
 * finds only [Double Attack] reminder text).
 *
 * | Clause | Condition / evaluation time | Cost/payer | Target/chooser | Timing/continuation | Observable result | Test |
 * |---|---|---|---|---|---|---|
 * | EB03-055 [Opponent's Turn][On K.O.] "You may deal 1 damage to your opponent" + 9-2-1-1 + qa_eb03.md:131-133 | opponent at 0 Life when the damage is dealt | none | p1 accepts the optional prompt | K.O. on p0's turn → p1's optional prompt → accept | FINISHED, winner 1, no prompt | "EB03-055 …" |
 * | same, opponent at 1 Life | 1 Life | none | p1 | accept | Life 0, IN_PROGRESS | "EB03-055 … 1 Life" |
 * | same, prompt persisted and reloaded before the reply | 0 Life | none | p1 | reload, accept | FINISHED, winner 1 | "persisted prompt" |
 * | OP14-115 [Opponent's Turn][On K.O.] add up to 1 then "you take 1 damage" + qa_op14_eb04.md:339-341 | owner at 0 Life, adds nothing | none | owner (p1) | K.O. on p0's turn | FINISHED, winner 0 | "OP14-115 …" |
 * | DEAL_DAMAGE 1 at 0 Life with a THEN prompt in the same action | 0 Life | none | none | the checkpoint after the damage ends play before the prompt | FINISHED, winner 0, no prompt | "prompt in the same action" |
 * | DEAL_DAMAGE 2 at 1 Life (assumed) / at 0 Life | see decision | none | none | | IN_PROGRESS / FINISHED | "multi-damage …" |
 */
import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import { expectTerminal, rig, synSchema, type Rig } from "./opt-960-rig.js";
import { CARDS } from "./helpers.js";

/** p0 Character with [Activate: Main] actions; returns the activation. */
function activate(r: Rig, id: string, actions: Action[]) {
  const card = r.put(id, 0, "CHARACTER", {
    schema: synSchema(id, [
      { id: `${id}-main`, category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions } as never,
    ]),
  });
  return () => r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: card.instanceId, effectId: `${id}-main` });
}

/** p0 K.O.s the p1 Character named `name` on p0's turn (an opponent's turn for p1). */
function koOpponent(r: Rig, name: string) {
  return activate(r, `SYN-KILLER-${name}`, [
    { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 }, filter: { name } } } as Action,
  ]);
}

function dealDamage(amount: number, then: Action[] = []): Action[] {
  return [
    { type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount } } as Action,
    ...then,
  ];
}

describe("OPT-925 EB03-055 Nico Robin [On K.O.] effect damage (qa_eb03.md:131-133; rule 9-2-1-1 line 882)", () => {
  it("EB03-055: the damage at 0 Life defeats the opponent", () => {
    const r = rig();
    r.life(0, 0);
    r.put("EB03-055", 1, "CHARACTER");
    koOpponent(r, "Nico Robin")();
    r.accept();
    expectTerminal(r.state, { winner: 1, reason: "Player 1's life reached 0" });
  });

  it("EB03-055: the damage at 1 Life takes the last Life card and play continues", () => {
    const r = rig();
    r.life(0, 1);
    r.put("EB03-055", 1, "CHARACTER");
    koOpponent(r, "Nico Robin")();
    r.accept();
    expect(r.state.players[0].life).toHaveLength(0);
    expect(r.state.status).toBe("IN_PROGRESS");
    expect(r.gameOvers()).toHaveLength(0);
  });

  it("EB03-055 persisted prompt: the optional prompt survives a reload, then the damage at 0 Life defeats", async () => {
    const r = rig();
    r.life(0, 0);
    r.put("EB03-055", 1, "CHARACTER");
    koOpponent(r, "Nico Robin")();
    expect(r.promptType()).toBe("OPTIONAL_EFFECT");
    await r.reload();
    r.accept();
    expectTerminal(r.state, { winner: 1, reason: "Player 1's life reached 0" });
    await r.reload();
    expectTerminal(r.state, { winner: 1, reason: "Player 1's life reached 0" });
  });
});

/** Rindo's "add up to 1": the owner answers the count prompt with 0. */
function addNoLifeCard(r: Rig) {
  const options = r.state.pendingPrompt?.options;
  expect(options?.promptType).toBe("PLAYER_CHOICE");
  expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
  r.act({ type: "PLAYER_CHOICE", choiceId: "choose-value:0" });
}

describe("OPT-925 OP14-115 Rindo [On K.O.] self-damage (qa_op14_eb04.md:339-341; rule 9-2-1-1 line 882)", () => {
  it("OP14-115: adding no Life card, then taking 1 damage at 0 Life, defeats Rindo's owner", () => {
    const r = rig();
    r.life(1, 0);
    r.put("OP14-115", 1, "CHARACTER");
    koOpponent(r, "Rindo")();
    addNoLifeCard(r);
    expect(r.state.players[1].life).toHaveLength(0);
    expectTerminal(r.state, { winner: 0, reason: "Player 2's life reached 0" });
  });

  it("OP14-115 at 1 Life: the 1 damage takes the last Life card and play continues", () => {
    const r = rig();
    r.life(1, 1);
    r.put("OP14-115", 1, "CHARACTER");
    koOpponent(r, "Rindo")();
    addNoLifeCard(r);
    expect(r.state.players[1].life).toHaveLength(0);
    expect(r.state.status).toBe("IN_PROGRESS");
    expect(r.gameOvers()).toHaveLength(0);
  });
});

describe("OPT-925 DEAL_DAMAGE pipeline regressions (rules 9-2-1-1 line 882, 9-1-2 line 876, 4-6-2 line 439)", () => {
  it("1 damage at 0 Life: defeat", () => {
    const r = rig();
    r.life(1, 0);
    activate(r, "SYN-DMG-1", dealDamage(1))();
    expectTerminal(r.state, { winner: 0, reason: "Player 2's life reached 0" });
  });

  it("1 damage at 1 Life: the last Life card goes to hand, no defeat", () => {
    const r = rig();
    r.life(1, 1);
    const hand = r.state.players[1].hand.length;
    activate(r, "SYN-DMG-1B", dealDamage(1))();
    expect(r.state.players[1].life).toHaveLength(0);
    expect(r.state.players[1].hand).toHaveLength(hand + 1);
    expect(r.state.status).toBe("IN_PROGRESS");
  });

  it("prompt in the same action: damage at 0 Life ends play before the THEN prompt surfaces", () => {
    const r = rig();
    r.life(1, 0);
    const victim = r.put(CARDS.VANILLA.id, 1, "CHARACTER");
    activate(r, "SYN-DMG-THEN-KO", dealDamage(1, [
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } }, chain: "THEN" } as Action,
    ]))();
    expectTerminal(r.state, { winner: 0, reason: "Player 2's life reached 0" });
    expect(r.state.players[1].characters.some((c) => c?.instanceId === victim.instanceId)).toBe(true);
  });

  it("persisted prompt before the damage: reload, reply, then the damage at 0 Life defeats", async () => {
    const r = rig();
    r.life(1, 0);
    const victim = r.put(CARDS.VANILLA.id, 1, "CHARACTER");
    activate(r, "SYN-KO-THEN-DMG", [
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } } as Action,
      ...dealDamage(1).map((a) => ({ ...a, chain: "THEN" }) as Action),
    ])();
    expect(r.promptType()).toBe("SELECT_TARGET");
    await r.reload();
    r.select([victim.instanceId]);
    expectTerminal(r.state, { winner: 0, reason: "Player 2's life reached 0" });
  });

  it("multi-damage (assumed): 2 damage at 1 Life is not lethal; 2 damage at 0 Life is", () => {
    const one = rig();
    one.life(1, 1);
    activate(one, "SYN-DMG-2A", dealDamage(2))();
    expect(one.state.players[1].life).toHaveLength(0);
    expect(one.state.status).toBe("IN_PROGRESS");

    const zero = rig();
    zero.life(1, 0);
    activate(zero, "SYN-DMG-2B", dealDamage(2))();
    expectTerminal(zero.state, { winner: 0, reason: "Player 2's life reached 0" });
  });
});

// OPT-993: authored Rindo ON_KO through the pipeline and session prompt lifecycle.
describe("OPT-993 OP14-115 self-damage Trigger", () => {
  it.each([false, true])("offers the owner a Trigger and resumes once after reload (accept %s)", async (reveal) => {
    const r = rig();
    r.life(1, 0);
    r.put("OP14-116", 1, "LIFE", { data: { type: "Event", triggerText: "Draw 1 card.", keywords: { ...CARDS.VANILLA.keywords, trigger: true } } });
    r.put("OP14-115", 1, "CHARACTER");
    koOpponent(r, "Rindo")();
    addNoLifeCard(r);
    expect(r.promptType()).toBe("REVEAL_TRIGGER");
    expect(r.state.pendingPrompt?.respondingPlayer).toBe(1);
    expect(r.state.effectStack.find(f => f.effectDamage)?.effectDamage).toMatchObject({ damagedPlayerIndex: 1, controllerIndex: 1, dealt: 1, remainingDamages: 0 });
    const hand = r.state.players[1].hand.length;
    await r.reload();
    r.act({ type: "REVEAL_TRIGGER", reveal }, 1);
    expect(r.state.players[1].hand).toHaveLength(hand + 1);
    expect(r.state.players[1].trash.filter(c => c.cardId === "OP14-116")).toHaveLength(reveal ? 1 : 0);
    expect(r.state.players[1].hand.filter(c => c.cardId === "OP14-116")).toHaveLength(reveal ? 0 : 1);
    expect(r.state.eventLog.filter(e => e.type === "CARD_REMOVED_FROM_LIFE")).toHaveLength(1);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toEqual([]);
    expect(r.state.turn.triggerStagingInstanceIds ?? []).toEqual([]);
    expect(r.state.status).toBe("IN_PROGRESS");
  });

  it("4-6-3-1: face-up Life replacement prevents offering its Trigger", () => {
    const r = rig();
    r.leader(1, "ST13-003");
    r.life(1, 0);
    r.put("OP14-116", 1, "LIFE", { data: { type: "Event", triggerText: "Draw 1 card.", keywords: { ...CARDS.VANILLA.keywords, trigger: true } } });
    r.state.players[1].life[0].face = "UP";
    r.put("OP14-115", 1, "CHARACTER");
    koOpponent(r, "Rindo")();
    addNoLifeCard(r);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[1].life).toEqual([]);
    expect(r.state.players[1].deck.at(-1)?.cardId).toBe("OP14-116");
    expect(r.state.eventLog.filter(e => e.type === "TRIGGER_ACTIVATED")).toEqual([]);
    expect(r.state.effectStack).toEqual([]);
  });
});

// Rules 4-6-2/4-6-3 and 8-6-2: Life-zero is damage work, but Enel's
// ordinary effect waits for the Life Trigger and its parent instruction.
describe("OPT-993 authored Enel observes Rindo self-damage", () => {
  it.each([false, true])("restores Life only after the reloaded damage window completes (accept %s)", async reveal => {
    const r = rig();
    r.leader(1, "OP05-098");
    r.life(1, 0);
    r.put("OP14-116", 1, "LIFE", { data: { type: "Event", triggerText: "Draw 1 card.", keywords: { ...CARDS.VANILLA.keywords, trigger: true } } });
    r.put("OP14-115", 1, "CHARACTER");
    koOpponent(r, "Rindo")();
    addNoLifeCard(r);
    expect(r.promptType()).toBe("REVEAL_TRIGGER");
    expect(r.state.players[1].life).toEqual([]);
    const zero = r.state.effectStack.flatMap(f => f.accumulatedEvents).filter(e => e.type === "LIFE_COUNT_BECOMES_ZERO");
    expect(zero).toHaveLength(1);
    expect(zero[0].propagation).toMatchObject({ eventLogEmitted: true });
    expect(zero[0].propagation?.triggerScanned).not.toBe(true);
    expect(r.state.eventLog.filter(e => e.type === "CARD_TRASHED" && e.payload.from === "HAND")).toEqual([]);
    await r.reload();
    expect(r.state.players[1].life).toEqual([]);
    r.act({ type: "REVEAL_TRIGGER", reveal }, 1);
    // Enel now resolves once: add one Life, then trash the one card received
    // from the declined Life Trigger or drawn by the accepted Trigger.
    expect(r.state.players[1].life).toHaveLength(1);
    expect(r.state.players[1].hand).toEqual([]);
    const events = r.state.eventLog;
    expect(events.filter(e => e.type === "LIFE_COUNT_BECOMES_ZERO")).toHaveLength(1);
    expect(events.filter(e => e.type === "CARD_REMOVED_FROM_LIFE")).toHaveLength(1);
    expect(events.filter(e => e.type === "CARD_TRASHED" && e.payload.from === "HAND")).toHaveLength(1);
    expect(events.findIndex(e => e.type === "CARD_REMOVED_FROM_LIFE")).toBeLessThan(events.findIndex(e => e.type === "CARD_TRASHED" && e.payload.from === "HAND"));
    expect(events.filter(e => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE")).toHaveLength(reveal ? 0 : 1);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.effectStack).toEqual([]);
    expect(r.state.turn.triggerStagingInstanceIds ?? []).toEqual([]);
    expect(r.state.status).toBe("IN_PROGRESS");
  });
});
