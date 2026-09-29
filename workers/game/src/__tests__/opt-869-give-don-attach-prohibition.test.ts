/**
 * OPT-869 — GIVE_DON (action and cost) honors CANNOT_ATTACH_DON.
 *
 * A CANNOT_ATTACH_DON prohibition used to veto only the manual rule 6-5-5
 * ATTACH_DON action. The GIVE_DON action (effect-resolver/actions/don.ts) and
 * the GIVE_DON cost (cost/targets.ts, read by feasibility, the prompt, the
 * live/staged resume checks and applyCostSelection) now share the manual
 * attach predicate, `isDonAttachProhibited`.
 *
 * Rules: 6-5-5-1 (giving places DON!! under a Leader or Character), 6-6-2
 * (a prohibition forbids the action), 8-3-1-3 (a cost that cannot be paid in
 * full is not paid, so the effect cannot be activated). Printed cost text for
 * the cards used below is quoted in opt-824-give-don-cost.test.ts.
 *
 * No authored schema grants CANNOT_ATTACH_DON today, so every prohibition
 * here is created by the engine from a synthetic test schema: either an
 * APPLY_PROHIBITION action resolved through resolveEffect (static appliesTo)
 * or a permanent-effect aura registered on entering the field (OPT-451
 * dynamic population target).
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectBlock, EffectSchema, ProhibitionScope, Target } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { resolveEffect, resumeFromStack } from "../engine/effect-resolver/index.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import { applyCostSelection } from "../engine/effect-resolver/cost/resume.js";
import { isCostPayable } from "../engine/effect-resolver/cost/payability.js";
import { isDonAttachProhibited } from "../engine/prohibitions.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const P0 = 0 as const;
const P1 = 1 as const;

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
      instanceId: `opt869-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "LEADER" || zone === "CHARACTER") {
      state = registerCardEnteredField(state, card, db.get(id)!);
    }
    return card;
  }
  function act(action: GameAction, player: 0 | 1 = P0) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
  }
  function tryAct(action: GameAction, player: 0 | 1 = P0) {
    const result = runPipeline(state, action, db, player);
    if (result.valid) state = result.state;
    return result;
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
    state = result.state;
  }
  return {
    db,
    data,
    put,
    act,
    tryAct,
    accept: () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" }),
    select: (ids: string[], rejected = false) =>
      respond({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected),
    persist() {
      state = parseStoredSession(
        JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(db), mode: "PVP" })),
      ).state;
    },
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function setDon(f: Fixture, player: 0 | 1, active: number) {
  const p = f.state.players[player];
  const pool = [...p.donCostArea, ...p.donDeck];
  p.donCostArea = pool.slice(0, active).map((d) => ({ ...d, state: "ACTIVE" as const, attachedTo: null }));
  p.donDeck = pool.slice(active);
}
function activeCostDon(f: Fixture, player: 0 | 1 = P0) {
  return f.state.players[player].donCostArea.filter((d) => d.state === "ACTIVE" && !d.attachedTo).length;
}
function attached(state: GameState, instanceId: string) {
  for (const p of state.players) {
    if (p.leader.instanceId === instanceId) return p.leader.attachedDon.length;
    const c = p.characters.find((x) => x?.instanceId === instanceId);
    if (c) return c.attachedDon.length;
  }
  throw new Error(`not on field: ${instanceId}`);
}
function donGivenEvents(f: Fixture) {
  return f.state.eventLog.filter((e) => e.type === "DON_GIVEN_TO_CARD");
}
function selectPrompt(f: Fixture) {
  return asSelect(f.state.pendingPrompt?.options);
}
function asSelect(options: NonNullable<GameState["pendingPrompt"]>["options"] | undefined) {
  if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
  return options;
}

/**
 * Resolve a real APPLY_PROHIBITION action owned by `owner`, covering every
 * card named `name` on the `side` relative to the owner (static appliesTo).
 */
function prohibitByName(
  f: Fixture,
  owner: 0 | 1,
  name: string,
  side: "SELF" | "OPPONENT",
  scope: ProhibitionScope = {},
) {
  const block: EffectBlock = {
    id: `opt869-apply-${owner}-${name}`,
    category: "auto",
    actions: [{
      type: "APPLY_PROHIBITION",
      target: { type: "LEADER_OR_CHARACTER", controller: side, count: { all: true }, filter: { name } },
      params: { prohibition_type: "CANNOT_ATTACH_DON", scope },
      duration: { type: "THIS_TURN" },
    }],
  };
  const before = f.state.prohibitions.length;
  const result = resolveEffect(f.state, block, f.state.players[owner].leader.instanceId, owner, f.db);
  expect(result.pendingPrompt).toBeFalsy();
  f.state = result.state;
  expect(f.state.prohibitions.length).toBe(before + 1);
  const created = f.state.prohibitions.at(-1)!;
  expect(created.prohibitionType).toBe("CANNOT_ATTACH_DON");
  expect(created.appliesTo.length).toBeGreaterThan(0);
  return created;
}

/** A permanent CANNOT_ATTACH_DON aura (OPT-451 dynamic population target). */
function wardSchema(target: Target): EffectSchema {
  return {
    card_id: "OPT869-WARD",
    card_name: "Don Ward",
    card_type: "Character",
    effects: [{
      id: "opt869_no_don_aura",
      category: "permanent",
      prohibitions: [{ type: "CANNOT_ATTACH_DON", target }],
    }],
  };
}

const manualAttachValid = (f: Fixture, targetInstanceId: string, player: 0 | 1 = P0) =>
  runPipeline(f.state, { type: "ATTACH_DON", targetInstanceId, count: 1 }, f.db, player).valid;

// ─── GIVE_DON action ─────────────────────────────────────────────────────────

function giveBlock(target: Target): EffectBlock {
  return {
    id: "opt869-give",
    category: "auto",
    actions: [{ type: "GIVE_DON", target, params: { amount: 1 } }],
  };
}

function actionSetup() {
  const f = fixture();
  f.data("OPT869-SHIELDED", { name: "Shielded" });
  const shielded = f.put("OPT869-SHIELDED", P0);
  const ally = f.put(CARDS.VANILLA.id, P0);
  setDon(f, P0, 3);
  return { f, shielded, ally, leader: f.state.players[P0].leader };
}

describe("OPT-869 GIVE_DON action honors CANNOT_ATTACH_DON", () => {
  it("never offers a prohibited recipient", () => {
    const { f, shielded, ally, leader } = actionSetup();
    prohibitByName(f, P0, "Shielded", "SELF");
    expect(manualAttachValid(f, shielded.instanceId)).toBe(false);
    const result = resolveEffect(
      f.state,
      giveBlock({ type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } }),
      leader.instanceId, P0, f.db,
    );
    const offer = asSelect(result.pendingPrompt?.options);
    expect(new Set(offer.validTargets)).toEqual(new Set([leader.instanceId, ally.instanceId]));
  });

  it("gives nothing when the only matching recipient is prohibited", () => {
    const { f, shielded, leader } = actionSetup();
    prohibitByName(f, P0, "Shielded", "SELF");
    const result = resolveEffect(
      f.state,
      giveBlock({ type: "CHARACTER", controller: "SELF", count: { exact: 1 }, filter: { name: "Shielded" } }),
      leader.instanceId, P0, f.db,
    );
    expect(result.pendingPrompt).toBeFalsy();
    expect(attached(result.state, shielded.instanceId)).toBe(0);
    expect(result.state.players[P0].donCostArea).toEqual(f.state.players[P0].donCostArea);
  });

  it("does not attach to a recipient that became prohibited while the reply was pending", () => {
    const { f, shielded, leader } = actionSetup();
    const prompted = resolveEffect(
      f.state,
      giveBlock({ type: "LEADER_OR_CHARACTER", controller: "SELF", count: { up_to: 1 } }),
      leader.instanceId, P0, f.db,
    );
    f.state = prompted.state;
    expect(asSelect(prompted.pendingPrompt?.options).validTargets).toContain(shielded.instanceId);
    prohibitByName(f, P0, "Shielded", "SELF");
    f.persist();
    const cost = structuredClone(f.state.players[P0].donCostArea);
    const resumed = resumeFromStack(f.state, { type: "SELECT_TARGET", selectedInstanceIds: [shielded.instanceId] }, f.db);
    expect(attached(resumed.state, shielded.instanceId)).toBe(0);
    expect(resumed.state.players[P0].donCostArea).toEqual(cost);
  });

  it("honors a dynamic population aura, including a Character that enters later", () => {
    const f = fixture();
    f.data("OPT869-WARD", {
      cost: 4,
      effectSchema: wardSchema({ type: "CHARACTER", controller: "SELF", count: { all: true }, filter: { cost_max: 3 } }),
    });
    f.data("OPT869-COST5", { cost: 5 });
    f.put("OPT869-WARD", P0);
    setDon(f, P0, 3);
    const late = f.put(CARDS.VANILLA.id, P0); // cost 3 — enters after the aura
    const big = f.put("OPT869-COST5", P0);
    expect(manualAttachValid(f, late.instanceId)).toBe(false);
    const result = resolveEffect(
      f.state,
      giveBlock({ type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { cost_max: 5 } }),
      f.state.players[P0].leader.instanceId, P0, f.db,
    );
    const offer = asSelect(result.pendingPrompt?.options);
    expect(offer.validTargets).not.toContain(late.instanceId);
    expect(offer.validTargets).toContain(big.instanceId);
  });

  // The prohibition's scope.controller is read relative to its owner (P1)
  // against the acting player (P0), exactly as for manual attach.
  for (const [scope, blocked] of [
    [{}, true],
    [{ controller: "OPPONENT" }, true],
    [{ controller: "SELF" }, false],
  ] as const) {
    it(`an opponent-owned prohibition with scope ${JSON.stringify(scope)} ${blocked ? "blocks" : "does not block"} the give, matching manual attach`, () => {
      const { f, shielded } = actionSetup();
      prohibitByName(f, P1, "Shielded", "OPPONENT", scope as ProhibitionScope);
      expect(isDonAttachProhibited(f.state, shielded.instanceId, f.db, P0)).toBe(blocked);
      expect(manualAttachValid(f, shielded.instanceId)).toBe(!blocked);
      const result = resolveEffect(
        f.state,
        giveBlock({ type: "CHARACTER", controller: "SELF", count: { exact: 1 }, filter: { name: "Shielded" } }),
        f.state.players[P0].leader.instanceId, P0, f.db,
      );
      expect(attached(result.state, shielded.instanceId)).toBe(blocked ? 0 : 1);
    });
  }
});

// ─── GIVE_DON cost ───────────────────────────────────────────────────────────

const EB04_009_TEXT =
  "[Main] You may give 1 active DON!! card to 1 of your [Silvers Rayleigh]: Give up to 1 of your opponent's Characters −2000 power during this turn.";

function rayleighSetup(eventId = "EB04-009", active = 3) {
  const f = fixture();
  f.data("OP12-001", { type: "Leader", name: "Silvers Rayleigh", cost: 0, power: 5000, color: ["Red"] });
  f.data("OP09-005", { name: "Silvers Rayleigh", cost: 5, power: 6000, effectSchema: null });
  f.data(eventId, { type: "Event", cost: 0, power: null, counter: null, effectText: EB04_009_TEXT });
  const rayleigh = f.put("OP09-005", P0);
  const foe = f.put(CARDS.VANILLA.id, P1);
  const event = f.put(eventId, P0, "HAND");
  setDon(f, P0, active);
  return { f, rayleigh, foe, event };
}

describe("OPT-869 GIVE_DON cost honors CANNOT_ATTACH_DON", () => {
  it("excludes a prohibited recipient from the offer", () => {
    const { f, rayleigh, event } = rayleighSetup();
    const leader = f.put("OP12-001", P0, "LEADER");
    // Cover only the Rayleigh Character: a static appliesTo on its instance.
    prohibitByName(f, P0, "Silvers Rayleigh", "SELF");
    f.state = {
      ...f.state,
      prohibitions: f.state.prohibitions.map((p) => ({ ...p, appliesTo: [rayleigh.instanceId] })),
    };
    expect(manualAttachValid(f, rayleigh.instanceId)).toBe(false);
    expect(manualAttachValid(f, leader.instanceId)).toBe(true);
    f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
    f.accept();
    expect(selectPrompt(f).validTargets).toEqual([leader.instanceId]);
    f.select([leader.instanceId]);
    expect(attached(f.state, leader.instanceId)).toBe(1);
    expect(attached(f.state, rayleigh.instanceId)).toBe(0);
  });

  it("is unpayable when the only recipient is prohibited, so the effect cannot be activated (8-3-1-3)", () => {
    const f = fixture();
    f.data("OP13-007", { cost: 5, power: 6000 });
    f.data("OPT869-WARD", {
      cost: 4,
      effectSchema: wardSchema({ type: "LEADER_OR_CHARACTER", controller: "SELF", count: { all: true } }),
    });
    f.put("OPT869-WARD", P0);
    const asl = f.put("OP13-007", P0);
    setDon(f, P0, 3);
    const give = getEffectSchema("OP13-007")!.effects[0].costs!;
    expect(give[0].type).toBe("GIVE_DON");
    for (const card of [f.state.players[P0].leader, asl]) {
      expect(manualAttachValid(f, card.instanceId)).toBe(false);
    }
    expect(isCostPayable(f.state, give[0], P0, f.db, asl.instanceId)).toBe(false);
    expect(isCostSequencePayable(f.state, give, P0, f.db, asl.instanceId)).toBe(false);
    const before = structuredClone(f.state);
    const result = f.tryAct({ type: "ACTIVATE_EFFECT", cardInstanceId: asl.instanceId, effectId: "OP13-007_activate_main" });
    expect(result.valid).toBe(false);
    expect(f.state).toEqual(before);
  });

  it("an opponent-owned prohibition follows the scope.controller frame of manual attach", () => {
    for (const [scope, blocked] of [
      [{ controller: "OPPONENT" }, true],
      [{ controller: "SELF" }, false],
    ] as const) {
      const { f, rayleigh, event } = rayleighSetup();
      prohibitByName(f, P1, "Silvers Rayleigh", "OPPONENT", scope as ProhibitionScope);
      expect(manualAttachValid(f, rayleigh.instanceId)).toBe(!blocked);
      f.act({ type: "PLAY_CARD", cardInstanceId: event.instanceId });
      f.accept();
      if (blocked) {
        // Nothing payable: no recipient prompt and no DON!! moved.
        expect(f.state.pendingPrompt).toBeNull();
        expect(activeCostDon(f)).toBe(3);
      } else {
        expect(selectPrompt(f).validTargets).toEqual([rayleigh.instanceId]);
      }
    }
  });

  describe("a persisted reply naming a now-prohibited recipient", () => {
    function pending() {
      const setup = rayleighSetup();
      setup.f.act({ type: "PLAY_CARD", cardInstanceId: setup.event.instanceId });
      setup.f.accept();
      expect(selectPrompt(setup.f).validTargets).toEqual([setup.rayleigh.instanceId]);
      setup.f.persist();
      return setup;
    }

    it("is rejected when the prohibition exists in the live state", () => {
      const { f, rayleigh } = pending();
      prohibitByName(f, P0, "Silvers Rayleigh", "SELF");
      f.persist();
      const before = structuredClone(f.state);
      f.select([rayleigh.instanceId], true);
      expect(f.state).toEqual(before);
      expect(attached(f.state, rayleigh.instanceId)).toBe(0);
      expect(donGivenEvents(f)).toHaveLength(0);
    });

    it("is rejected when the prohibition exists only in the staged payment state", () => {
      const { f, rayleigh } = pending();
      const frame = f.state.effectStack.at(-1)!;
      expect(frame.costTransactionState).toBeTruthy();
      // Build the prohibition with the engine, then place it only in the
      // staged snapshot the resume validates against.
      const live = f.state;
      prohibitByName(f, P0, "Silvers Rayleigh", "SELF");
      const staged = { ...frame.costTransactionState!, prohibitions: f.state.prohibitions };
      f.state = {
        ...live,
        effectStack: [...live.effectStack.slice(0, -1), { ...frame, costTransactionState: staged }],
      };
      expect(f.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_ATTACH_DON")).toBe(false);
      f.persist();
      const before = structuredClone(f.state);
      f.select([rayleigh.instanceId], true);
      expect(f.state).toEqual(before);
      expect(attached(f.state, rayleigh.instanceId)).toBe(0);
    });
  });

  describe("an earlier staged cost that removes the prohibition's source (rule 8-3-1-1)", () => {
    // Synthetic: a permanent aura forbidding DON!! on your Leader, and an
    // effect of the same Character whose costs are "trash this Character,
    // then give 1 active DON!! to your Leader". Paying the first cost ends the
    // aura (its source left the field), so the Leader is a legal recipient of
    // the second cost even though the live (pre-cost) state still has the aura.
    const TRASH_THEN_GIVE: EffectBlock = {
      id: "opt869_trash_then_give",
      category: "activate",
      trigger: { keyword: "ACTIVATE_MAIN" },
      costs: [{ type: "TRASH_SELF" }, { type: "GIVE_DON", amount: 1, target: { type: "YOUR_LEADER" } }],
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    };
    function auraSetup() {
      const f = fixture();
      const schema = wardSchema({ type: "YOUR_LEADER" });
      schema.effects.push(TRASH_THEN_GIVE);
      f.data("OPT869-WARD", { cost: 4, effectSchema: schema });
      const ward = f.put("OPT869-WARD", P0);
      const leader = f.state.players[P0].leader;
      setDon(f, P0, 3);
      expect(manualAttachValid(f, leader.instanceId)).toBe(false);
      expect(isCostSequencePayable(f.state, TRASH_THEN_GIVE.costs!, P0, f.db, ward.instanceId)).toBe(true);
      return { f, ward, leader };
    }
    function auraThenGiveSetup() {
      const { f, ward, leader } = auraSetup();
      // Resolve the block directly (the ACTIVATE_EFFECT step-2 gate is the
      // separate follow-up ratchet below).
      const prompted = resolveEffect(f.state, TRASH_THEN_GIVE, ward.instanceId, P0, f.db);
      f.state = { ...prompted.state, pendingPrompt: prompted.pendingPrompt ?? null };
      expect(selectPrompt(f).validTargets).toEqual([leader.instanceId]);
      // The live state is still pre-cost: the aura is in force there.
      expect(isDonAttachProhibited(f.state, leader.instanceId, f.db, P0)).toBe(true);
      f.persist();
      return { f, ward, leader };
    }

    it("accepts the persisted reply and gives the DON!! to the Leader", () => {
      const { f, ward, leader } = auraThenGiveSetup();
      f.select([leader.instanceId]);
      expect(attached(f.state, leader.instanceId)).toBe(1);
      expect(activeCostDon(f)).toBe(2);
      // Rule 3-1-6: the trashed card is a new instance, so match by card id.
      expect(f.state.players[P0].characters.some((c) => c?.instanceId === ward.instanceId)).toBe(false);
      expect(f.state.players[P0].trash.some((c) => c.cardId === ward.cardId)).toBe(true);
      expect(f.state.prohibitions.some((p) => p.prohibitionType === "CANNOT_ATTACH_DON")).toBe(false);
    });

    it("still rejects the reply when an unrelated prohibition appeared in the live state", () => {
      const { f, leader } = auraThenGiveSetup();
      // A second, Leader-sourced prohibition the staged costs do not end.
      f.data(leader.cardId, { ...f.db.get(leader.cardId)!, name: "Warded Leader" });
      prohibitByName(f, P0, "Warded Leader", "SELF");
      f.persist();
      const before = structuredClone(f.state);
      f.select([leader.instanceId], true);
      expect(f.state).toEqual(before);
      expect(attached(f.state, leader.instanceId)).toBe(0);
    });

    // Known gap, follow-up to PR #725 (no ticket yet): pipeline step 2
    // (validation.ts areEffectCostsPayable) checks each cost independently
    // against the pre-cost state, so it refuses an [Activate: Main] whose
    // GIVE_DON is only payable after an earlier cost. No authored card has
    // this shape today (no schema grants CANNOT_ATTACH_DON).
    it.fails("allows ACTIVATE_EFFECT when an earlier cost ends the prohibition", () => {
      const { f, ward } = auraSetup();
      f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: ward.instanceId, effectId: TRASH_THEN_GIVE.id });
    });
  });

  it("applyCostSelection refuses a prohibited recipient for direct callers", () => {
    const { f, rayleigh } = rayleighSetup();
    prohibitByName(f, P0, "Silvers Rayleigh", "SELF");
    const give = getEffectSchema("EB04-009")!.effects[0].costs![0];
    const applied = applyCostSelection(f.state, give, [rayleigh.instanceId], P0, f.db);
    expect(applied.events).toEqual([]);
    expect(applied.state).toBe(f.state);
  });
});
