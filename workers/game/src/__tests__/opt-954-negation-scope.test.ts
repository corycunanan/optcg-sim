/**
 * OPT-954: negation scope contract (docs/game-engine/NEGATION-SCOPE.md).
 *
 * One fixture per FAQ ruling, each naming its FAQ file and line. Every
 * negation here comes from the authored card's own schema, driven through the
 * real pipeline: the card itself where its timing is reachable in the rig,
 * otherwise a zero-cost carrier Event that resolves the card's authored
 * NEGATE_EFFECTS action unchanged.
 *
 *   negation removes          the negated card's own printed effects
 *   negation keeps            effects other cards grant it (rule 8-2-4),
 *                             including a keyword the card gained from its own
 *                             already-resolved effect, and lasting results of
 *                             its already-resolved effects (rule 8-2-3)
 *   later K.O.                no [On K.O.] while the negation applies
 *   duration                  the negation's own duration, not the source's
 */
import { describe, expect, it } from "vitest";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { isCardNegated, getEffectivePower } from "../engine/modifiers.js";
import { hasEffectiveKeyword } from "../engine/keywords.js";
import { CARDS } from "./helpers.js";
import { rig, synSchema, type Rig } from "./opt-960-rig.js";

const authoredAction = (cardId: string, effectId: string, index = 0): Action => {
  const effect = getEffectSchema(cardId)!.effects.find((e) => e.id === effectId);
  expect(effect, `${cardId} ${effectId}`).toBeDefined();
  return structuredClone(effect!.actions![index]);
};

/** Resolve one authored action as a zero-cost [Main] Event of player 0. */
function carry(r: Rig, name: string, action: Action, picks: string[][] = []) {
  const event = r.put(name, 0, "HAND", {
    data: { cost: 0, type: "Event", effectText: "[Main] Resolve this effect." },
    schema: synSchema(name, [{ id: "carry", category: "auto", trigger: { keyword: "MAIN_EVENT" }, actions: [action] }], "Event"),
  });
  r.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
  for (const ids of picks) {
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select(ids);
  }
}

const onField = (r: Rig, owner: 0 | 1, cardId: string) => {
  const card = r.state.players[owner].characters.find((c) => c?.cardId === cardId);
  expect(card, cardId).toBeTruthy();
  return card!;
};

const onKoDraw: EffectSchema["effects"][number] = {
  id: "on_ko_draw", category: "auto", trigger: { keyword: "ON_KO" },
  actions: [{ type: "DRAW", params: { amount: 1 } }],
};
const printedBuff: EffectSchema["effects"][number] = {
  id: "printed_buff", category: "permanent",
  modifiers: [{ type: "MODIFY_POWER", target: { type: "SELF" }, params: { amount: 1000 } }],
};

/**
 * Player 1's victim: printed [Blocker], a printed +1000 self buff, and
 * [On K.O.] draw 1. A second player-1 Character grants all its allies
 * [Banish] and +2000 (effects "from another card").
 */
function victimBoard(r: Rig, withGranter = true) {
  r.deck(1, 10);
  const victim = r.put("SYN-victim", 1, "CHARACTER", {
    data: { ...CARDS.BLOCKER, id: "SYN-victim", power: 4000, cost: 3 },
    schema: synSchema("SYN-victim", [
      { id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } },
      printedBuff,
      onKoDraw,
    ]),
  });
  if (withGranter) r.put("SYN-ally-granter", 1, "CHARACTER", {
    schema: synSchema("SYN-ally-granter", [{
      id: "grant", category: "permanent",
      modifiers: [
        { type: "GRANT_KEYWORD", target: { type: "CHARACTER", controller: "SELF", count: { all: true } }, params: { keyword: "BANISH" } },
        { type: "MODIFY_POWER", target: { type: "CHARACTER", controller: "SELF", count: { all: true } }, params: { amount: 2000 } },
      ],
    }]),
  });
  return victim;
}

function expectNegatedScope(r: Rig, victim: ReturnType<typeof victimBoard>) {
  const data = r.db.get(victim.cardId)!;
  expect(isCardNegated(victim, r.state, r.db)).toBe(true);
  // Printed [Blocker] and printed +1000 are gone; the other card's grants stay.
  expect(hasEffectiveKeyword(victim, data, "BLOCKER", r.state, r.db)).toBe(false);
  expect(hasEffectiveKeyword(victim, data, "BANISH", r.state, r.db)).toBe(true);
  expect(getEffectivePower(victim, data, r.state, r.db)).toBe(6000);
}

function koVictimAndExpectNoOnKo(r: Rig, victim: { instanceId: string; cardId: string }) {
  const hand = r.state.players[1].hand.length;
  carry(r, "SYN-ko", { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }, [[victim.instanceId]]);
  expect(r.state.players[1].trash.some((c) => c.cardId === victim.cardId)).toBe(true);
  expect(r.state.pendingPrompt).toBeNull();
  expect(r.state.players[1].hand.length).toBe(hand);
}

describe("OPT-954 negation scope: printed effects only, granted effects stay, no later [On K.O.]", () => {
  it("OP09-093 Teach (qa_op09.md:166, qa_op09.md:170)", () => {
    const r = rig();
    const victim = victimBoard(r);
    const before = getEffectivePower(victim, r.db.get(victim.cardId)!, r.state, r.db);
    expect(before).toBe(7000);
    r.state.players[0].leader = { ...r.state.players[0].leader };
    r.db.set(r.state.players[0].leader.cardId, { ...r.db.get(r.state.players[0].leader.cardId)!, types: ["Blackbeard Pirates"] });
    const teach = r.put("OP09-093", 0, "HAND", { data: { cost: 0 } });
    r.act({ type: "PLAY_CARD", cardInstanceId: teach.instanceId });
    const played = onField(r, 0, "OP09-093");
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: played.instanceId, effectId: "activate_negate_and_lock" });
    // Leader target: decline (up to 1). Character target: the victim.
    while (r.promptType() === "SELECT_TARGET") {
      const options = r.state.pendingPrompt!.options;
      const valid = options.promptType === "SELECT_TARGET" ? options.validTargets : [];
      r.select(valid.includes(victim.instanceId) ? [victim.instanceId] : []);
    }
    expectNegatedScope(r, victim);
    koVictimAndExpectNoOnKo(r, victim);
  });

  it.each([
    ["OP09-097", "trigger_negate", "qa_op09.md:189, qa_op09.md:193"],
    ["OP09-098", "trigger_negate", "qa_op09.md:208, qa_op09.md:212"],
    ["OP10-098", "trigger_negate", "qa_op10.md:211, qa_op10.md:215"],
  ])("%s [Trigger] negation (%s %s)", (cardId, effectId) => {
    const r = rig();
    const victim = victimBoard(r);
    const action = authoredAction(cardId, effectId, cardId === "OP10-098" ? 1 : 0);
    carry(r, `SYN-${cardId}`, action, [[victim.instanceId]]);
    expectNegatedScope(r, victim);
    koVictimAndExpectNoOnKo(r, victim);
  });

  it("OP09-098 Black Hole [Main]: negate then K.O. skips [On K.O.] (qa_op09.md:208)", () => {
    const r = rig();
    const victim = victimBoard(r);
    r.db.set(r.state.players[0].leader.cardId, { ...r.db.get(r.state.players[0].leader.cardId)!, types: ["Blackbeard Pirates"] });
    const hand = r.state.players[1].hand.length;
    const hole = r.put("OP09-098", 0, "HAND", { data: { cost: 0, type: "Event", effectText: "[Main] Negate, then K.O." } });
    r.act({ type: "PLAY_CARD", cardInstanceId: hole.instanceId });
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select([victim.instanceId]);
    expect(r.state.players[1].trash.some((c) => c.cardId === victim.cardId)).toBe(true);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[1].hand.length).toBe(hand);
  });

  it("OP06-074 Zephyr negate-then-K.O. skips [On K.O.] (qa_op06.md:206)", () => {
    const r = rig();
    // Zephyr K.O.s only at 5000 power or less, so leave out the +2000 granter.
    const victim = victimBoard(r, false);
    const hand = r.state.players[1].hand.length;
    const zephyr = r.put("OP06-074", 0, "HAND", { data: { cost: 0 } });
    r.act({ type: "PLAY_CARD", cardInstanceId: zephyr.instanceId });
    if (r.promptType() === "OPTIONAL_EFFECT") r.accept();
    expect(r.promptType()).toBe("SELECT_TARGET");
    r.select([victim.instanceId]);
    expect(r.state.players[1].trash.some((c) => c.cardId === victim.cardId)).toBe(true);
    expect(r.state.pendingPrompt).toBeNull();
    expect(r.state.players[1].hand.length).toBe(hand);
  });
});

describe("OPT-954 negation keeps lasting results of already-resolved effects (rule 8-2-3)", () => {
  it("OP06-074 Zephyr: Edward.Newgate's resolved +2000 on its Leader stays (qa_op06.md:218)", () => {
    const r = rig();
    // Player 0 plays the real OP02-004 so its [On Play] resolves +2000 on the Leader.
    const edward = r.put("OP02-004", 0, "HAND", { data: { cost: 0 } });
    const leader = r.state.players[0].leader;
    const leaderData = r.db.get(leader.cardId)!;
    const base = getEffectivePower(leader, leaderData, r.state, r.db);
    r.act({ type: "PLAY_CARD", cardInstanceId: edward.instanceId });
    const edwardOnField = onField(r, 0, "OP02-004");
    expect(getEffectivePower(r.state.players[0].leader, leaderData, r.state, r.db)).toBe(base + 2000);
    // Zephyr's authored NEGATE_EFFECTS (aimed at the Edward controller's side).
    const negate = authoredAction("OP06-074", "OP06-074_effect_1");
    if (negate.type !== "NEGATE_EFFECTS") throw Error("unexpected Zephyr shape");
    negate.target = { ...negate.target!, controller: "SELF" };
    carry(r, "SYN-zephyr-negate", negate, [[edwardOnField.instanceId]]);
    expect(isCardNegated(edwardOnField, r.state, r.db)).toBe(true);
    expect(getEffectivePower(r.state.players[0].leader, leaderData, r.state, r.db)).toBe(base + 2000);
  });
});

describe("OPT-954 negation does not remove a keyword the card gained (rule 8-2-4)", () => {
  function selfNegate(r: Rig, target: string) {
    carry(r, "SYN-negator", {
      type: "NEGATE_EFFECTS",
      target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 } },
      duration: { type: "THIS_TURN" },
    }, [[target]]);
  }

  it("OP09-084 Catarina Devon keeps the [Blocker] its [Activate: Main] gave it (qa_op09.md:297)", () => {
    const r = rig();
    r.db.set(r.state.players[0].leader.cardId, { ...r.db.get(r.state.players[0].leader.cardId)!, types: ["Blackbeard Pirates"] });
    const devon = r.put("OP09-084", 0, "CHARACTER");
    const data = r.db.get(devon.cardId)!;
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: devon.instanceId, effectId: "activate_keyword_choice" });
    expect(r.promptType()).toBe("PLAYER_CHOICE");
    const options = r.state.pendingPrompt!.options;
    if (options.promptType !== "PLAYER_CHOICE") throw Error("expected a choice");
    r.act({ type: "PLAYER_CHOICE", choiceId: options.choices[2].id });
    expect(hasEffectiveKeyword(devon, data, "BLOCKER", r.state, r.db)).toBe(true);
    selfNegate(r, devon.instanceId);
    expect(isCardNegated(devon, r.state, r.db)).toBe(true);
    expect(hasEffectiveKeyword(devon, data, "BLOCKER", r.state, r.db)).toBe(true);
  });

  it("OP09-068 Chopper keeps the [Blocker] its [End of Your Turn] gave it (qa_op09.md:290)", () => {
    const r = rig();
    const chopper = r.put("OP09-068", 0, "CHARACTER");
    const data = r.db.get(chopper.cardId)!;
    // Resolve the authored GRANT_KEYWORD output of the End of Your Turn effect
    // with Chopper as its source, as the trigger would.
    const grant = authoredAction("OP09-068", "eot_active_and_blocker", 1);
    const schema = synSchema("OP09-068", [{ id: "eot_probe", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions: [{ ...grant, chain: undefined } as Action] }]);
    r.db.set("OP09-068", { ...data, effectSchema: schema });
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: chopper.instanceId, effectId: "eot_probe" });
    r.db.set("OP09-068", data);
    expect(hasEffectiveKeyword(chopper, data, "BLOCKER", r.state, r.db)).toBe(true);
    selfNegate(r, chopper.instanceId);
    expect(isCardNegated(chopper, r.state, r.db)).toBe(true);
    expect(hasEffectiveKeyword(chopper, data, "BLOCKER", r.state, r.db)).toBe(true);
  });

  it("a printed [Blocker] does not survive negation of its holder", () => {
    const r = rig();
    const blocker = r.put("SYN-printed-blocker", 0, "CHARACTER", {
      data: { ...CARDS.BLOCKER, id: "SYN-printed-blocker" },
      schema: synSchema("SYN-printed-blocker", [{ id: "blocker", category: "permanent", flags: { keywords: ["BLOCKER"] } }]),
    });
    const data = r.db.get(blocker.cardId)!;
    expect(hasEffectiveKeyword(blocker, data, "BLOCKER", r.state, r.db)).toBe(true);
    selfNegate(r, blocker.instanceId);
    expect(hasEffectiveKeyword(blocker, data, "BLOCKER", r.state, r.db)).toBe(false);
  });
});

describe("OPT-954 negation keeps its own duration (OP09-081)", () => {
  const draw1 = (keyword: "ON_PLAY" | "WHEN_ATTACKING"): EffectSchema["effects"][number] => ({
    id: keyword.toLowerCase(), category: "auto", trigger: { keyword }, actions: [{ type: "DRAW", params: { amount: 1 } }],
  });

  it("[On Play] stays negated for a Character played next turn; [When Attacking] still works (qa_op09.md:125, qa_op09.md:129)", () => {
    const r = rig();
    r.deck(0, 10); r.deck(1, 10); r.life(0, 5); r.life(1, 5);
    r.leader(0, "OP09-081");
    r.put("SYN-discard", 0, "HAND");
    // The attacker is on the field before Teach resolves, so only its timing matters.
    const attacker = r.put("SYN-dual", 1, "CHARACTER", { schema: synSchema("SYN-dual", [draw1("ON_PLAY"), draw1("WHEN_ATTACKING")]) });
    attacker.turnPlayed = 0;
    r.act({ type: "ACTIVATE_EFFECT", cardInstanceId: r.state.players[0].leader.instanceId, effectId: "activate_negate_opponent_on_play" });
    if (r.promptType() === "OPTIONAL_EFFECT") r.accept();
    if (r.promptType() === "SELECT_TARGET") r.select([r.state.players[0].hand[0].instanceId]);
    expect(r.state.pendingPrompt).toBeNull();

    // Pass to the opponent's next turn.
    while (r.state.turn.activePlayerIndex !== 1 || r.state.turn.phase !== "MAIN") {
      r.act({ type: "ADVANCE_PHASE" });
    }
    const played = r.put("SYN-dual", 1, "HAND", { data: { cost: 0 } });
    const hand = () => r.state.players[1].hand.length;
    const beforePlay = hand();
    r.act({ type: "PLAY_CARD", cardInstanceId: played.instanceId }, 1);
    expect(r.state.pendingPrompt).toBeNull();
    expect(hand()).toBe(beforePlay - 1); // played, no [On Play] draw

    const beforeAttack = hand();
    const live = onField(r, 1, "SYN-dual");
    r.act({ type: "DECLARE_ATTACK", attackerInstanceId: live.instanceId, targetInstanceId: r.state.players[0].leader.instanceId }, 1);
    expect(hand()).toBe(beforeAttack + 1); // [When Attacking] drew
  });
});
