/**
 * OPT-1020 (OPT-931, OPT-932) — DON!! give paths.
 *
 * OPT-931: every effect that gives DON!! honors CANNOT_ATTACH_DON, through the
 * manual-attach predicate `isDonAttachProhibited`. Rule 1-3-3: "If a card's
 * effect requires a player to carry out an action while a currently active
 * effect prohibits that action, the prohibiting effect always takes
 * precedence." So DISTRIBUTE_DON, REDISTRIBUTE_DON and
 * GIVE_OPPONENT_DON_TO_OPPONENT (action and cost) are gated, on the offer and
 * on a resumed reply. The DON!! Phase GIVEN_TO_LEADER rule modification
 * (OP13-003 Roger) is subject to the same rule (OPT-1036). A staged cost
 * reply reads prohibitions in a three-way reconciliation of the committed
 * root, the staged payment and the live root (`stagedProhibitionView`).
 *
 * OPT-932: GIVE_OPPONENT_DON_TO_OPPONENT lets the activating player choose
 * which of the opponent's DON!! are given, up to the printed amount
 * (faq_op15-eb04.md: "The player who activated the effect chooses ... DON!!
 * card from their opponent's cost area"), whenever the DON!! differ — in the
 * effects applied to them (rule 3-1-6-1) or, under a permissive source
 * filter, in state. Interchangeable DON!! stay prompt-free.
 *
 * No authored schema grants CANNOT_ATTACH_DON, so the prohibitions here are
 * synthetic state, built exactly like the engine's static `appliesTo` form.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { resolveEffect } from "../engine/effect-resolver/index.js";
import { reconcileProhibitions, stagedProhibitionView } from "../engine/effect-resolver/cost/transaction.js";
import { isDonAttachProhibited } from "../engine/prohibitions.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const P0 = 0 as const;
const P1 = 1 as const;
type Prohibition = GameState["prohibitions"][number];

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;
  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    const value: CardData = {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectSchema: schema ?? null,
      ...overrides,
    };
    db.set(id, value);
    return value;
  }
  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt1020-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "CHARACTER") state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function respond(action: GameAction, rejected = false) {
    const result = resumePromptLifecycle(state, action, db, {
      drainPregame: (s) => s,
      advanceStartOfTurn: (s) => s,
    });
    expect(
      result.responseRejected,
      JSON.stringify({ action, prompt: state.pendingPrompt?.options }),
    ).toBe(rejected);
    if (!rejected) state = result.state;
  }
  /** Resolve `block` from P0's Leader, publishing any prompt it raises. */
  function resolve(block: EffectBlock, controller: 0 | 1 = P0) {
    const result = resolveEffect(state, block, state.players[controller].leader.instanceId, controller, db);
    state = { ...result.state, pendingPrompt: result.pendingPrompt ?? null };
    return result;
  }
  return {
    db,
    data,
    put,
    resolve,
    select: (ids: string[], rejected = false) =>
      respond({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected),
    respond,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}
type Fixture = ReturnType<typeof fixture>;

function setDon(f: Fixture, player: 0 | 1, active: number, rested = 0) {
  const p = f.state.players[player];
  const pool = [...p.donCostArea, ...p.donDeck];
  p.donCostArea = pool.slice(0, active + rested).map((d, i) => ({
    ...d,
    state: i < active ? "ACTIVE" as const : "RESTED" as const,
    attachedTo: null,
  }));
  p.donDeck = pool.slice(active + rested);
}

function prohibition(id: string, controller: 0 | 1, type: Prohibition["prohibitionType"], appliesTo: string[]): Prohibition {
  return {
    id,
    sourceCardInstanceId: "seed",
    sourceEffectBlockId: "",
    prohibitionType: type,
    scope: {},
    duration: { type: "THIS_TURN" },
    controller,
    appliesTo,
    usesRemaining: null,
  } as Prohibition;
}

/** A CANNOT_ATTACH_DON prohibition owned by the card's controller. */
function forbidDon(f: Fixture, card: CardInstance, id = `no-don-${card.instanceId}`) {
  f.state = { ...f.state, prohibitions: [...f.state.prohibitions, prohibition(id, card.controller, "CANNOT_ATTACH_DON", [card.instanceId])] };
  expect(isDonAttachProhibited(f.state, card.instanceId, f.db, P0)).toBe(true);
}

/** An OP07-026/OP15-023-style "will not become active" hold on one DON!!. */
function holdDon(f: Fixture, donId: string, id = "opt1020-hold") {
  f.state = { ...f.state, prohibitions: [...f.state.prohibitions, prohibition(id, P0, "CANNOT_REFRESH", [donId])] };
}

function liveCard(state: GameState, instanceId: string) {
  for (const p of state.players) {
    if (p.leader.instanceId === instanceId) return p.leader;
    const c = p.characters.find((x) => x?.instanceId === instanceId);
    if (c) return c;
  }
  throw new Error(`not on field: ${instanceId}`);
}
const attachedIds = (state: GameState, instanceId: string) =>
  liveCard(state, instanceId).attachedDon.map((d) => d.instanceId);

function selectOptions(state: GameState) {
  const options = state.pendingPrompt?.options;
  if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
  return options;
}

// ─── OPT-931: DISTRIBUTE_DON ─────────────────────────────────────────────────

describe("OPT-931 DISTRIBUTE_DON honors CANNOT_ATTACH_DON (rule 1-3-3)", () => {
  function block(count: { all: true } | { up_to: number }): EffectBlock {
    return {
      id: "opt1020-distribute",
      category: "auto",
      actions: [{
        type: "DISTRIBUTE_DON",
        target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count },
        params: { amount_per_target: 1 },
      }],
    };
  }

  it("gives to each other card but never to a prohibited one", () => {
    const f = fixture();
    const shielded = f.put(CARDS.VANILLA.id, P0);
    const ally = f.put(CARDS.VANILLA.id, P0);
    setDon(f, P0, 5);
    forbidDon(f, shielded);
    const leader = f.state.players[P0].leader.instanceId;
    f.resolve(block({ all: true }));
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, shielded.instanceId)).toEqual([]);
    expect(attachedIds(f.state, ally.instanceId)).toHaveLength(1);
    expect(attachedIds(f.state, leader)).toHaveLength(1);
  });

  it("never offers a prohibited card and skips one that became prohibited before the reply", () => {
    const f = fixture();
    const shielded = f.put(CARDS.VANILLA.id, P0);
    const later = f.put(CARDS.VANILLA.id, P0);
    setDon(f, P0, 5);
    forbidDon(f, shielded);
    f.resolve(block({ up_to: 2 }));
    expect(selectOptions(f.state).validTargets).not.toContain(shielded.instanceId);
    expect(selectOptions(f.state).validTargets).toContain(later.instanceId);
    forbidDon(f, later);
    const cost = structuredClone(f.state.players[P0].donCostArea);
    const leader = f.state.players[P0].leader.instanceId;
    f.select([later.instanceId, leader]);
    expect(attachedIds(f.state, later.instanceId)).toEqual([]);
    expect(attachedIds(f.state, leader)).toHaveLength(1);
    expect(f.state.players[P0].donCostArea).toHaveLength(cost.length - 1);
  });
});

// ─── OPT-931: REDISTRIBUTE_DON ───────────────────────────────────────────────

describe("OPT-931 REDISTRIBUTE_DON honors CANNOT_ATTACH_DON (rule 1-3-3)", () => {
  const block: EffectBlock = {
    id: "opt1020-redistribute",
    category: "auto",
    actions: [{
      type: "REDISTRIBUTE_DON",
      target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 2 } },
      params: { amount: 2 },
    }],
  };
  function setup() {
    const f = fixture();
    const shielded = f.put(CARDS.VANILLA.id, P0);
    const ally = f.put(CARDS.VANILLA.id, P0);
    const leader = f.state.players[P0].leader;
    leader.attachedDon = [
      { instanceId: "lead-don-1", state: "ACTIVE", attachedTo: leader.instanceId },
      { instanceId: "lead-don-2", state: "ACTIVE", attachedTo: leader.instanceId },
    ];
    return { f, shielded, ally, leader };
  }

  it("never offers a prohibited recipient", () => {
    const { f, shielded, ally } = setup();
    forbidDon(f, shielded);
    f.resolve(block);
    const options = f.state.pendingPrompt?.options;
    if (options?.promptType !== "REDISTRIBUTE_DON") throw new Error(JSON.stringify(options));
    expect(options.validTargetCardIds).not.toContain(shielded.instanceId);
    expect(options.validTargetCardIds).toContain(ally.instanceId);
  });

  it("skips a transfer to a recipient that became prohibited while the prompt was pending (1-3-2)", () => {
    const { f, shielded, ally, leader } = setup();
    f.resolve(block);
    forbidDon(f, shielded);
    f.respond({
      type: "REDISTRIBUTE_DON",
      transfers: [
        { fromCardInstanceId: leader.instanceId, donInstanceId: "lead-don-1", toCardInstanceId: shielded.instanceId },
        { fromCardInstanceId: leader.instanceId, donInstanceId: "lead-don-2", toCardInstanceId: ally.instanceId },
      ],
    });
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, shielded.instanceId)).toEqual([]);
    expect(attachedIds(f.state, ally.instanceId)).toEqual(["lead-don-2"]);
    expect(attachedIds(f.state, leader.instanceId)).toEqual(["lead-don-1"]);
  });
});

// ─── OPT-931: GIVE_OPPONENT_DON_TO_OPPONENT action and cost ──────────────────

function giveOpponentBlock(amount: number, sourceFilter?: { is_rested?: boolean; is_active?: boolean }): EffectBlock {
  return {
    id: "opt1020-give-opponent",
    category: "auto",
    actions: [{
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
      params: { amount, ...(sourceFilter ? { source_filter: sourceFilter } : {}) },
    }],
  };
}

describe("OPT-931 GIVE_OPPONENT_DON_TO_OPPONENT honors CANNOT_ATTACH_DON (rule 1-3-3)", () => {
  it("the action gives nothing to a prohibited opponent Character", () => {
    const f = fixture();
    const foe = f.put(CARDS.VANILLA.id, P1);
    setDon(f, P1, 0, 2);
    forbidDon(f, foe);
    const before = structuredClone(f.state.players[P1].donCostArea);
    const result = f.resolve(giveOpponentBlock(1));
    expect(result.pendingPrompt).toBeFalsy();
    expect(attachedIds(f.state, foe.instanceId)).toEqual([]);
    expect(f.state.players[P1].donCostArea).toEqual(before);
  });

  it("the action offers only unprohibited opponent Characters", () => {
    const f = fixture();
    const shielded = f.put(CARDS.VANILLA.id, P1);
    const open = f.put(CARDS.VANILLA.id, P1);
    setDon(f, P1, 0, 2);
    forbidDon(f, shielded);
    f.resolve(giveOpponentBlock(1));
    // One eligible Character for an exact-1 target: chosen without a prompt.
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, shielded.instanceId)).toEqual([]);
    expect(attachedIds(f.state, open.instanceId)).toHaveLength(1);
  });

  it("the OP15-003 cost cannot be paid when its only opponent Character is prohibited (8-3-1-3)", () => {
    const f = fixture();
    f.data("OP15-003", { type: "Leader", cost: null, power: 5000 });
    const foe = f.put(CARDS.VANILLA.id, P1);
    setDon(f, P1, 0, 2);
    setDon(f, P0, 3);
    const leader = f.state.players[P0].leader;
    f.state.players[P0].leader = { ...leader, cardId: "OP15-003" };
    f.state = registerCardEnteredField(f.state, f.state.players[P0].leader, f.db.get("OP15-003")!);
    f.state = { ...f.state, turn: { ...f.state.turn, phase: "MAIN", activePlayerIndex: P0 } };
    const activate = { type: "ACTIVATE_EFFECT", cardInstanceId: leader.instanceId, effectId: "OP15-003_activate_don_move" } as const;
    expect(runPipeline(f.state, activate, f.db, P0).valid).toBe(true);
    forbidDon(f, foe);
    expect(runPipeline(f.state, activate, f.db, P0).valid).toBe(false);
  });
});

// ─── OPT-931: DON!! Phase GIVEN_TO_LEADER (OP13-003 Roger) ───────────────────

describe("OPT-931 DON!! Phase GIVEN_TO_LEADER honors CANNOT_ATTACH_DON (rule 1-3-3)", () => {
  function rogerAtDonPhase() {
    const f = fixture();
    f.data("OP13-003", { ...CARDS.LEADER, id: "OP13-003", name: "Gol.D.Roger", effectSchema: getEffectSchema("OP13-003")! });
    const p = f.state.players[P0];
    p.leader = { ...p.leader, cardId: "OP13-003" };
    f.state = registerCardEnteredField(f.state, p.leader, f.db.get("OP13-003")!);
    f.state = { ...f.state, turn: { ...f.state.turn, phase: "DON", number: 3, activePlayerIndex: P0, firstPlayerIndex: P0 } };
    setDon(f, P0, 1);
    return f;
  }

  it("gives a placed DON!! to Roger when nothing forbids it", () => {
    const f = rogerAtDonPhase();
    const result = runPipeline(f.state, { type: "ADVANCE_PHASE" }, f.db, P0);
    expect(result.valid, result.error).toBe(true);
    expect(result.state.players[P0].leader.attachedDon).toHaveLength(1);
  });

  // Rule 1-3-3 applies here too: Roger's rule modification is a card effect
  // (OPT-1036). Latent: no authored schema grants CANNOT_ATTACH_DON.
  it("places both DON!! in the cost area when the Leader cannot be given DON!!", () => {
    const f = rogerAtDonPhase();
    forbidDon(f, f.state.players[P0].leader);
    const result = runPipeline(f.state, { type: "ADVANCE_PHASE" }, f.db, P0);
    expect(result.valid, result.error).toBe(true);
    expect(result.state.players[P0].leader.attachedDon).toEqual([]);
    expect(result.state.players[P0].donCostArea).toHaveLength(3);
    expect(result.state.eventLog.some((e) => e.type === "DON_GIVEN_TO_CARD")).toBe(false);
  });

  it("checks the prohibition after the new DON!! are placed, before they are given", () => {
    const f = rogerAtDonPhase();
    const leader = f.state.players[P0].leader;
    // Active only once this phase's two DON!! join the one already there.
    const gated = {
      ...prohibition("no-don-at-3", P0, "CANNOT_ATTACH_DON", [leader.instanceId]),
      conditions: { type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 3 },
    } as Prohibition;
    f.state = { ...f.state, prohibitions: [...f.state.prohibitions, gated] };
    expect(isDonAttachProhibited(f.state, leader.instanceId, f.db, P0)).toBe(false);
    const result = runPipeline(f.state, { type: "ADVANCE_PHASE" }, f.db, P0);
    expect(result.valid, result.error).toBe(true);
    expect(result.state.players[P0].leader.attachedDon).toEqual([]);
    expect(result.state.players[P0].donCostArea).toHaveLength(3);
  });
});

// ─── OPT-931: GIVE_DON identity resume ───────────────────────────────────────

describe("OPT-931 GIVE_DON identity resume rechecks the bound recipient", () => {
  it("gives nothing when the recipient became prohibited while the DON!! choice was pending", () => {
    const f = fixture();
    const foe = f.put(CARDS.VANILLA.id, P1);
    setDon(f, P1, 2);
    const [held, free] = f.state.players[P1].donCostArea.map((d) => d.instanceId);
    holdDon(f, held);
    f.resolve({
      id: "opt1020-give-don",
      category: "auto",
      actions: [{ type: "GIVE_DON", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } }, params: { amount: 1 } }],
    });
    expect(new Set(selectOptions(f.state).validTargets)).toEqual(new Set([held, free]));
    forbidDon(f, foe);
    const before = structuredClone(f.state.players[P1].donCostArea);
    f.select([free]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, foe.instanceId)).toEqual([]);
    expect(f.state.players[P1].donCostArea).toEqual(before);
  });
});

// ─── OPT-931: staged prohibition reconciliation ──────────────────────────────

describe("OPT-931 stagedProhibitionView reconciles base, staged and live", () => {
  const p = (id: string, usesRemaining: number | null = null) =>
    ({ ...prohibition(id, P0, "CANNOT_ATTACH_DON", ["x"]), usesRemaining });
  const ids = (list: Prohibition[]) => list.map((x) => x.id).sort();

  it("keeps a prohibition the staged costs ended ended, even though its source is still on the field", () => {
    expect(ids(reconcileProhibitions([p("a"), p("b")], [p("b")], [p("a"), p("b")]))).toEqual(["b"]);
  });

  it("carries in a prohibition that appeared on the live root after the offer", () => {
    expect(ids(reconcileProhibitions([p("a")], [p("a")], [p("a"), p("new")]))).toEqual(["a", "new"]);
  });

  it("drops a prohibition that expired on the live root after the offer", () => {
    expect(ids(reconcileProhibitions([p("a"), p("b")], [p("a"), p("b")], [p("a")]))).toEqual(["a"]);
  });

  it("keeps a prohibition a staged cost added", () => {
    expect(ids(reconcileProhibitions([], [p("staged")], []))).toEqual(["staged"]);
  });

  it("takes the side that changed a prohibition's uses, preferring the staged form when both did", () => {
    expect(reconcileProhibitions([p("a", 2)], [p("a", 2)], [p("a", 0)])[0].usesRemaining).toBe(0);
    expect(reconcileProhibitions([p("a", 2)], [p("a", 1)], [p("a", 2)])[0].usesRemaining).toBe(1);
    expect(reconcileProhibitions([p("a", 2)], [p("a", 1)], [p("a", 0)])[0].usesRemaining).toBe(1);
  });

  it("reads only the prohibition list from the reconciliation; the rest is staged", () => {
    const f = fixture();
    const live = { ...f.state, prohibitions: [p("a"), p("new")] };
    const staged = { ...f.state, turn: { ...f.state.turn, number: 99 }, prohibitions: [] };
    const view = stagedProhibitionView(live, staged, { prohibitions: [p("a")] });
    expect(view.turn.number).toBe(99);
    expect(ids(view.prohibitions)).toEqual(["new"]);
  });
});

// ─── OPT-932: player-chosen opponent DON!! ───────────────────────────────────

describe("OPT-932 GIVE_OPPONENT_DON_TO_OPPONENT lets the activating player choose the DON!!", () => {
  function setup(rested: number, active = 0) {
    const f = fixture();
    const foe = f.put(CARDS.VANILLA.id, P1);
    setDon(f, P1, active, rested);
    const dons = f.state.players[P1].donCostArea.map((d) => d.instanceId);
    return { f, foe, dons };
  }

  it("interchangeable rested DON!! give without a prompt", () => {
    const { f, foe, dons } = setup(3);
    f.resolve(giveOpponentBlock(2));
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, foe.instanceId)).toEqual(dons.slice(0, 2));
  });

  it("amount 1, held versus free (OP15-015): the activator gives the free DON!!, keeping the hold", () => {
    const { f, foe, dons: [held, free] } = setup(2);
    holdDon(f, held);
    f.resolve(giveOpponentBlock(1, { is_rested: true }));
    const options = selectOptions(f.state);
    expect(new Set(options.validTargets)).toEqual(new Set([held, free]));
    expect([options.countMin, options.countMax]).toEqual([1, 1]);
    expect(f.state.players[P0].hand).toHaveLength(0);
    f.select([held, free], true);
    f.select([free]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, foe.instanceId)).toEqual([free]);
    expect(f.state.prohibitions.find((x) => x.id === "opt1020-hold")?.appliesTo).toEqual([held]);
    expect(f.state.eventLog.filter((e) => e.type === "DON_GIVEN_TO_CARD").at(-1)?.payload).toEqual({ count: 1 });
  });

  it("amount 1: giving the held DON!! releases its hold (3-1-6-1)", () => {
    const { f, foe, dons: [held] } = setup(2);
    holdDon(f, held);
    f.resolve(giveOpponentBlock(1, { is_rested: true }));
    f.select([held]);
    expect(attachedIds(f.state, foe.instanceId)).toEqual([held]);
    expect(f.state.prohibitions.find((x) => x.id === "opt1020-hold")).toBeUndefined();
  });

  it("amount 3 (OP15-008): the activator picks exactly 3 of 4, and a wrong count is rejected", () => {
    const { f, foe, dons } = setup(4);
    holdDon(f, dons[0]);
    f.resolve(giveOpponentBlock(3, { is_rested: true }));
    const options = selectOptions(f.state);
    expect(new Set(options.validTargets)).toEqual(new Set(dons));
    expect([options.countMin, options.countMax]).toEqual([3, 3]);
    f.select([dons[1], dons[2]], true);
    f.select([dons[1], dons[1], dons[2]], true);
    f.select([dons[1], dons[2], dons[3]]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, foe.instanceId)).toEqual([dons[1], dons[2], dons[3]]);
    expect(f.state.players[P1].donCostArea.map((d) => d.instanceId)).toEqual([dons[0]]);
    expect(f.state.prohibitions.find((x) => x.id === "opt1020-hold")?.appliesTo).toEqual([dons[0]]);
  });

  it("gives every eligible DON!! without a prompt when the amount covers the pool", () => {
    const { f, foe, dons } = setup(2);
    holdDon(f, dons[0]);
    f.resolve(giveOpponentBlock(3, { is_rested: true }));
    expect(f.state.pendingPrompt).toBeNull();
    expect(attachedIds(f.state, foe.instanceId)).toEqual(dons);
  });

  it("a permissive source filter (OP15-023/028) makes active versus rested a choice", () => {
    const { f, foe, dons: [active, rested] } = setup(1, 1);
    f.resolve(giveOpponentBlock(1, {}));
    expect(new Set(selectOptions(f.state).validTargets)).toEqual(new Set([active, rested]));
    f.select([active]);
    expect(attachedIds(f.state, foe.instanceId)).toEqual([active]);
    expect(liveCard(f.state, foe.instanceId).attachedDon[0].state).toBe("ACTIVE");
    expect(f.state.players[P1].donCostArea.map((d) => d.instanceId)).toEqual([rested]);
  });

  it("rejects a reply naming a DON!! that left the cost area while the prompt was pending", () => {
    const { f, dons: [held, free] } = setup(2);
    holdDon(f, held);
    f.resolve(giveOpponentBlock(1, { is_rested: true }));
    const p1 = f.state.players[P1];
    f.state.players[P1] = { ...p1, donCostArea: p1.donCostArea.filter((d) => d.instanceId !== free) };
    f.select([free], true);
    expect(f.state.pendingPrompt).not.toBeNull();
  });
});
