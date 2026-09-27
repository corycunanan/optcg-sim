import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { Cost, RuntimeActiveEffect } from "../engine/effect-types.js";
import { getEffectSchema, validateCost } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { applyCostSelection } from "../engine/effect-resolver/cost/resume.js";
import { computeCostTargets } from "../engine/effect-resolver/cost/targets.js";
import { payCosts } from "../engine/effect-resolver/cost/payment.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import { getEffectiveCost } from "../engine/modifiers.js";
import { transitionCard } from "../engine/zone-transition.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Printed text (docs/cards/OP-09.md:692) — OP09-101 Kuzan:
//   "[On Play] Place 1 of your opponent's Characters with a cost of 3 or less
//    at the top or bottom of your opponent's Life cards face-up: Your opponent
//    trashes 1 card from their hand."
// FAQ (docs/FAQs/qa_op09.md:228-230): the [On Play] cannot be activated when
// no opponent Character with cost 3 or less can be placed in their Life.
// Rules: 8-1-2 (no "may" → the effect must be activated when possible),
// 8-3-1 (text before the colon is the activation cost), 8-3-1-3 (an
// unpayable cost is not paid at all and the effect does not resolve),
// 8-3-1-7 (a replaced cost is not paid → nothing after the colon),
// 3-10-2-1 (face-up Life cards), 6-5-5-4 (a card leaving the area returns
// its given DON!! to its owner's cost area rested).

const P0 = 0 as const;
const P1 = 1 as const;
const KUZAN = "OP09-101";

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
  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER", overrides?: Partial<CardData>) {
    if (overrides || !db.has(id)) data(id, overrides);
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt828-${serial++}`,
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
  function act(action: GameAction, player: 0 | 1 = P0) {
    const result = runPipeline(state, action, db, player);
    expect(result.valid, result.error).toBe(true);
    state = result.state;
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
    put,
    act,
    respond,
    select: (ids: string[], rejected = false) =>
      respond({ type: "SELECT_TARGET", selectedInstanceIds: ids }, rejected),
    choose: (choiceId: string, rejected = false) =>
      respond({ type: "PLAYER_CHOICE", choiceId }, rejected),
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

function setup(opts: { oppHand?: number } = {}) {
  const f = fixture();
  const kuzan = f.put(KUZAN, P0, "HAND", { cost: 5, power: 6000 });
  const own3 = f.put("own-cost-3", P0, "CHARACTER", { cost: 3 });
  const opp3 = f.put("opp-cost-3", P1, "CHARACTER", { cost: 3 });
  const opp4 = f.put("opp-cost-4", P1, "CHARACTER", { cost: 4 });
  const oppHand = Array.from({ length: opts.oppHand ?? 2 }, (_, i) => f.put(`opp-hand-${i}`, P1, "HAND"));
  return { f, kuzan, own3, opp3, opp4, oppHand };
}

function play(f: Fixture, kuzan: CardInstance) {
  f.act({ type: "PLAY_CARD", cardInstanceId: kuzan.instanceId });
}

function prompt(f: Fixture) {
  return f.state.pendingPrompt?.options;
}

function selectPrompt(f: Fixture) {
  const options = prompt(f);
  if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
  return options;
}

function choicePrompt(f: Fixture) {
  const options = prompt(f);
  if (options?.promptType !== "PLAYER_CHOICE") throw new Error(JSON.stringify(options));
  return options;
}

/** The bound choice id for the given Life end on the pending destination prompt. */
function endChoice(f: Fixture, end: "Top" | "Bottom") {
  return choicePrompt(f).choices.find((choice) => choice.label === end)!.id;
}

function onField(f: Fixture, card: CardInstance) {
  return f.state.players.some((p) => p.characters.some((c) => c?.instanceId === card.instanceId));
}

function lifeAddedEvents(f: Fixture) {
  return f.state.eventLog.filter((e) => e.type === "CARD_ADDED_TO_LIFE");
}

function kuzanCost(): Extract<Cost, { type: "ADD_OWN_CHARACTER_TO_LIFE" }> {
  const cost = getEffectSchema(KUZAN)!.effects[0].costs![0];
  if (cost.type !== "ADD_OWN_CHARACTER_TO_LIFE") throw new Error(JSON.stringify(cost));
  return cost;
}

function protectFromRemoval(f: Fixture, card: CardInstance) {
  f.state.prohibitions = [...f.state.prohibitions, {
    id: `shield-${card.instanceId}`,
    sourceCardInstanceId: card.instanceId,
    sourceEffectBlockId: "shield-block",
    prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
    controller: P1,
    appliesTo: [card.instanceId],
    scope: {},
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    usesRemaining: null,
    conditionalOverride: null,
    timestamp: 0,
  } as unknown as GameState["prohibitions"][number]];
}

describe("OPT-828 OP09-101 schema", () => {
  it("authors the placement as a mandatory opponent Character-to-Life cost, not a first action", () => {
    const block = getEffectSchema(KUZAN)!.effects[0];
    expect(block.flags?.optional).toBeFalsy();
    expect(block.costs).toEqual([{
      type: "ADD_OWN_CHARACTER_TO_LIFE",
      controller: "OPPONENT",
      amount: 1,
      filter: { cost_max: 3 },
      position: "TOP_OR_BOTTOM",
      face: "UP",
    }]);
    expect(block.actions?.map((a) => a.type)).toEqual(["OPPONENT_ACTION"]);
    expect(block.actions?.[0].chain).toBeUndefined();
    expect(validateCost(block.costs![0], "OP09-101", false)).toEqual([]);
  });

  it("validates the cost-level controller and the opponent placement shape", () => {
    expect(validateCost({ type: "ADD_OWN_CHARACTER_TO_LIFE", controller: "EITHER" } as unknown as Cost, "c", false))
      .toEqual(["c: ADD_OWN_CHARACTER_TO_LIFE controller must be one of SELF, OPPONENT"]);
    expect(validateCost({ type: "TRASH_FROM_HAND", controller: "OPPONENT" } as unknown as Cost, "c", false))
      .toEqual(["c: cost type 'TRASH_FROM_HAND' does not accept a 'controller'"]);
    expect(validateCost({ type: "ADD_OWN_CHARACTER_TO_LIFE", controller: "OPPONENT", amount: 1 } as Cost, "c", false))
      .toEqual(["c: opponent ADD_OWN_CHARACTER_TO_LIFE requires 'position' TOP, BOTTOM or TOP_OR_BOTTOM"]);
    expect(validateCost({ type: "ADD_OWN_CHARACTER_TO_LIFE", controller: "OPPONENT", amount: 2, position: "TOP" } as Cost, "c", false))
      .toEqual(["c: opponent ADD_OWN_CHARACTER_TO_LIFE places exactly 1 Character ('amount' must be 1)"]);
    // The own-Character ST13-001 form and OPT-798's EITHER deck cost stay valid.
    expect(validateCost(getEffectSchema("ST13-001")!.effects.flatMap((b) => b.costs ?? [])[0], "st13", false)).toEqual([]);
    expect(validateCost({ type: "PLACE_OWN_CHARACTER_TO_DECK", controller: "EITHER", position: "BOTTOM" } as Cost, "c", false))
      .toEqual([]);
  });
});

describe("OPT-828 OP09-101 candidates", () => {
  it("offers only opponent Characters with cost 3 or less — own cost-3 and opponent cost-4 excluded", () => {
    const { f, kuzan, opp3 } = setup();
    play(f, kuzan);
    const options = selectPrompt(f);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(P0);
    expect(options.validTargets).toEqual([opp3.instanceId]);
    expect(options.countMin).toBe(1);
    expect(options.countMax).toBe(1);
    expect(options.cards?.map((c) => c.instanceId)).toEqual([opp3.instanceId]);
  });

  it("reads the effective cost: an opponent cost-4 Character under −1 cost is eligible", () => {
    const { f, kuzan, opp3, opp4 } = setup();
    // OP07-081 Kalifa (DON!!×1, your turn): opponent's Characters −1 cost.
    const kalifa = f.put("OP07-081", P0, "CHARACTER", { cost: 2 });
    f.state.players[P0].characters = f.state.players[P0].characters.map((c) =>
      c?.instanceId === kalifa.instanceId
        ? { ...c, attachedDon: [{ instanceId: "kalifa-don", state: "ACTIVE", attachedTo: kalifa.instanceId }] }
        : c,
    );
    expect(getEffectiveCost(f.db.get("opp-cost-4")!, f.state, opp4.instanceId, f.db)).toBe(3);
    play(f, kuzan);
    expect(selectPrompt(f).validTargets.sort()).toEqual([opp3.instanceId, opp4.instanceId].sort());
  });

  it("skips an opponent Character that cannot be removed from the field by its opponent's effects", () => {
    const { f, kuzan, opp3 } = setup();
    const opp2 = f.put("opp-cost-2", P1, "CHARACTER", { cost: 2 });
    protectFromRemoval(f, opp3);
    play(f, kuzan);
    expect(selectPrompt(f).validTargets).toEqual([opp2.instanceId]);
  });

  it("offers no skip: the cost is mandatory when payable (rule 8-1-2)", () => {
    const { f, kuzan, opp3 } = setup();
    play(f, kuzan);
    // No OPTIONAL_EFFECT gate precedes the cost prompt, and a skip is rejected.
    expect(selectPrompt(f).validTargets).toEqual([opp3.instanceId]);
    const pending = structuredClone(f.state);
    f.choose("skip", true);
    f.select([], true);
    expect(f.state).toEqual(pending);
  });
});

describe("OPT-828 OP09-101 payment", () => {
  it("places the chosen Character face-up at the TOP of the opponent's Life, then the opponent trashes 1", () => {
    const { f, kuzan, opp3, opp4, oppHand } = setup();
    const ownLife = f.state.players[P0].life.length;
    const oppLife = f.state.players[P1].life.map((l) => l.instanceId);
    const oppTrash = f.state.players[P1].trash.length;
    play(f, kuzan);
    f.select([opp3.instanceId]);
    const choices = choicePrompt(f).choices;
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(P0);
    expect(choices.map((c) => c.label)).toEqual(["Top", "Bottom"]);
    // Nothing moves until the end is chosen.
    expect(onField(f, opp3)).toBe(true);
    expect(f.state.players[P1].life).toHaveLength(oppLife.length);
    f.choose(endChoice(f, "Top"));

    const life = f.state.players[P1].life;
    expect(life).toHaveLength(oppLife.length + 1);
    expect(life[0]).toMatchObject({ cardId: "opp-cost-3", face: "UP" });
    expect(life.slice(1).map((l) => l.instanceId)).toEqual(oppLife);
    expect(f.state.players[P0].life).toHaveLength(ownLife);
    expect(onField(f, opp3)).toBe(false);
    expect(onField(f, opp4)).toBe(true);

    // After payment the opponent chooses the hand card to trash.
    const trashPrompt = selectPrompt(f);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(P1);
    expect(trashPrompt.validTargets.sort()).toEqual(oppHand.map((c) => c.instanceId).sort());
    f.select([oppHand[1].instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[P1].hand.map((c) => c.instanceId)).toEqual([oppHand[0].instanceId]);
    expect(f.state.players[P1].trash).toHaveLength(oppTrash + 1);
    expect(f.state.players[P1].trash[0].cardId).toBe("opp-hand-1");
    // The cost publishes one owner-indexed CARD_ADDED_TO_LIFE once the effect resolves.
    expect(lifeAddedEvents(f)).toHaveLength(1);
    expect(lifeAddedEvents(f)[0]).toMatchObject({
      playerIndex: P1,
      payload: { cardInstanceId: opp3.instanceId, sourceController: P1, causingController: P0, movementCause: "COST" },
    });
  });

  it("places the chosen Character face-up at the BOTTOM of the opponent's Life", () => {
    const { f, kuzan, opp3, oppHand } = setup();
    const oppLife = f.state.players[P1].life.map((l) => l.instanceId);
    play(f, kuzan);
    f.select([opp3.instanceId]);
    f.choose(endChoice(f, "Bottom"));
    const life = f.state.players[P1].life;
    expect(life).toHaveLength(oppLife.length + 1);
    expect(life.at(-1)).toMatchObject({ cardId: "opp-cost-3", face: "UP" });
    expect(life.slice(0, -1).map((l) => l.instanceId)).toEqual(oppLife);
    f.select([oppHand[0].instanceId]);
    expect(f.state.players[P1].hand).toHaveLength(1);
  });

  it("returns the placed Character's given DON!! to its owner's cost area rested", () => {
    const { f, kuzan, opp3 } = setup();
    const p1 = f.state.players[P1];
    const don = p1.donCostArea[0];
    p1.donCostArea = p1.donCostArea.slice(1);
    p1.characters = p1.characters.map((c) =>
      c?.instanceId === opp3.instanceId ? { ...c, attachedDon: [{ ...don, attachedTo: opp3.instanceId }] } : c,
    );
    const p0Don = f.state.players[P0].donCostArea.length;
    play(f, kuzan);
    f.select([opp3.instanceId]);
    f.choose(endChoice(f, "Top"));
    const returned = f.state.players[P1].donCostArea.find((d) => d.instanceId === don.instanceId);
    expect(returned).toMatchObject({ state: "RESTED", attachedTo: null });
    expect(f.state.players[P0].donCostArea).toHaveLength(p0Don);
  });

  it("with an empty opponent hand the cost is still paid and nothing is trashed", () => {
    const { f, kuzan, opp3 } = setup({ oppHand: 0 });
    const oppTrash = f.state.players[P1].trash.length;
    play(f, kuzan);
    f.select([opp3.instanceId]);
    f.choose(endChoice(f, "Top"));
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[P1].life[0]).toMatchObject({ cardId: "opp-cost-3", face: "UP" });
    expect(f.state.players[P1].trash).toHaveLength(oppTrash);
    expect(f.state.effectStack).toHaveLength(0);
  });
});

describe("OPT-828 OP09-101 unavailable cost (qa_op09.md:228-230)", () => {
  function expectNoActivation(f: Fixture, kuzan: CardInstance) {
    const oppLife = structuredClone(f.state.players[P1].life);
    const oppHand = f.state.players[P1].hand.map((c) => c.instanceId);
    const oppTrash = f.state.players[P1].trash.length;
    play(f, kuzan);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toHaveLength(0);
    expect(f.state.players[P1].life).toEqual(oppLife);
    expect(f.state.players[P1].hand.map((c) => c.instanceId)).toEqual(oppHand);
    expect(f.state.players[P1].trash).toHaveLength(oppTrash);
    expect(lifeAddedEvents(f)).toHaveLength(0);
    // Kuzan itself was still played.
    expect(f.state.players[P0].characters.some((c) => c?.cardId === KUZAN)).toBe(true);
  }

  it("does not activate when the only cost ≤3 Character is your own (no hand trash)", () => {
    const f = fixture();
    const kuzan = f.put(KUZAN, P0, "HAND", { cost: 5, power: 6000 });
    f.put("own-cost-3", P0, "CHARACTER", { cost: 3 });
    f.put("opp-cost-4", P1, "CHARACTER", { cost: 4 });
    f.put("opp-hand-0", P1, "HAND");
    expectNoActivation(f, kuzan);
  });

  it("does not activate when every opponent cost ≤3 Character is protected from removal", () => {
    const { f, kuzan, opp3 } = setup();
    protectFromRemoval(f, opp3);
    expectNoActivation(f, kuzan);
  });

  it("does not activate when the opponent has no Characters", () => {
    const f = fixture();
    const kuzan = f.put(KUZAN, P0, "HAND", { cost: 5, power: 6000 });
    f.put("opp-hand-0", P1, "HAND");
    expectNoActivation(f, kuzan);
  });
});

describe("OPT-828 OP09-101 persistence and stale replies", () => {
  it("round-trips both prompts through persistence and pays exactly once", () => {
    const { f, kuzan, opp3, opp4, oppHand } = setup();
    const oppLife = f.state.players[P1].life.length;
    play(f, kuzan);
    f.persist();
    const targetStage = structuredClone(f.state);
    // Malformed target replies leave the prompt and continuation untouched.
    for (const ids of [[], [opp4.instanceId], [opp3.instanceId, opp4.instanceId], ["foreign"]]) {
      f.select(ids, true);
      expect(f.state).toEqual(targetStage);
    }
    // A destination reply before a target is chosen is rejected.
    f.choose(`cost-life:${JSON.stringify([opp3.instanceId])}:TOP`, true);
    expect(f.state).toEqual(targetStage);

    f.select([opp3.instanceId]);
    f.persist();
    const destinationStage = structuredClone(f.state);
    expect(choicePrompt(f).choices).toHaveLength(2);
    // A duplicate target reply, a bare position id, or a forged binding is rejected.
    f.select([opp3.instanceId], true);
    f.choose("0", true);
    f.choose("TOP", true);
    f.choose(`cost-life:${JSON.stringify([opp4.instanceId])}:TOP`, true);
    expect(f.state).toEqual(destinationStage);

    const top = endChoice(f, "Top");
    f.choose(top);
    expect(f.state.players[P1].life).toHaveLength(oppLife + 1);
    // The cost frame is consumed: the pending prompt is now the opponent's
    // hand trash (a PLAYER_CHOICE replay of the destination is refused by the
    // session coordinator's prompt-type check), and no cost continuation
    // remains that could pay a second time.
    f.persist();
    expect(selectPrompt(f).validTargets).not.toContain(top);
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(P1);
    expect(f.state.effectStack.some((frame) => frame.phase === "AWAITING_COST_SELECTION")).toBe(false);
    f.select([oppHand[0].instanceId]);
    expect(f.state.players[P1].life).toHaveLength(oppLife + 1);
    expect(lifeAddedEvents(f)).toHaveLength(1);
    expect(f.state.players[P1].hand).toHaveLength(1);
  });

  it("rejects the target reply when the offered Character left the field in the live state", () => {
    const { f, kuzan, opp3 } = setup();
    play(f, kuzan);
    f.persist();
    const moved = transitionCard(f.state, opp3.instanceId, "TRASH", { position: "TOP" })!;
    f.state = moved.state;
    f.persist();
    const before = structuredClone(f.state);
    f.select([opp3.instanceId], true);
    expect(f.state).toEqual(before);
    expect(lifeAddedEvents(f)).toHaveLength(0);
  });

  it("rejects the destination reply when the Character left the field in the live state", () => {
    const { f, kuzan, opp3 } = setup();
    const oppLife = f.state.players[P1].life.length;
    play(f, kuzan);
    f.select([opp3.instanceId]);
    const top = endChoice(f, "Top");
    const moved = transitionCard(f.state, opp3.instanceId, "TRASH", { position: "TOP" })!;
    f.state = moved.state;
    f.persist();
    const before = structuredClone(f.state);
    f.choose(top, true);
    expect(f.state).toEqual(before);
    expect(f.state.players[P1].life).toHaveLength(oppLife);
    expect(f.state.players[P1].trash[0].instanceId).toBe(moved.fact.newInstanceId);
  });

  it("rejects the destination reply when the Character became protected in the live state", () => {
    const { f, kuzan, opp3 } = setup();
    play(f, kuzan);
    f.select([opp3.instanceId]);
    const top = endChoice(f, "Top");
    protectFromRemoval(f, opp3);
    f.persist();
    const before = structuredClone(f.state);
    f.choose(top, true);
    expect(f.state).toEqual(before);
    expect(onField(f, opp3)).toBe(true);
  });

  it("rejects the target reply when the staged payment snapshot lost the Character", () => {
    const { f, kuzan, opp3 } = setup();
    play(f, kuzan);
    f.persist();
    const frame = f.state.effectStack.at(-1)!;
    const staged = structuredClone(frame.costTransactionState!);
    staged.players[P1].characters = staged.players[P1].characters.map((c) =>
      c?.instanceId === opp3.instanceId ? null : c,
    );
    f.state = {
      ...f.state,
      effectStack: [...f.state.effectStack.slice(0, -1), { ...frame, costTransactionState: staged }],
    };
    const before = structuredClone(f.state);
    f.select([opp3.instanceId], true);
    expect(f.state).toEqual(before);
  });

  it("rejects a forged destination binding naming another eligible Character", () => {
    const { f, kuzan, opp3 } = setup();
    const opp2 = f.put("opp-cost-2", P1, "CHARACTER", { cost: 2 });
    play(f, kuzan);
    expect(selectPrompt(f).validTargets.sort()).toEqual([opp3.instanceId, opp2.instanceId].sort());
    f.select([opp3.instanceId]);
    f.persist();
    const before = structuredClone(f.state);
    f.choose(`cost-life:${JSON.stringify([opp2.instanceId])}:TOP`, true);
    f.choose(`cost-life:${JSON.stringify([opp3.instanceId])}:MIDDLE`, true);
    expect(f.state).toEqual(before);
    expect(onField(f, opp2)).toBe(true);
    expect(onField(f, opp3)).toBe(true);
  });

  it("rejects the destination reply when the staged payment snapshot lost the Character", () => {
    const { f, kuzan, opp3 } = setup();
    play(f, kuzan);
    f.select([opp3.instanceId]);
    const top = endChoice(f, "Top");
    f.persist();
    const frame = f.state.effectStack.at(-1)!;
    const staged = structuredClone(frame.costTransactionState!);
    staged.players[P1].characters = staged.players[P1].characters.map((c) =>
      c?.instanceId === opp3.instanceId ? null : c,
    );
    f.state = {
      ...f.state,
      effectStack: [...f.state.effectStack.slice(0, -1), { ...frame, costTransactionState: staged }],
    };
    const before = structuredClone(f.state);
    f.choose(top, true);
    expect(f.state).toEqual(before);
    expect(onField(f, opp3)).toBe(true);
    expect(lifeAddedEvents(f)).toHaveLength(0);
  });
});

describe("OPT-828 OP09-101 removal replacement (rule 8-3-1-7)", () => {
  function withLeaveFieldReplacement(f: Fixture, card: CardInstance) {
    const replacement = {
      id: "opt828-leave-replacement",
      sourceCardInstanceId: card.instanceId,
      sourceEffectBlockId: "leave-field",
      category: "replacement",
      modifiers: [{
        type: "REPLACEMENT_EFFECT",
        params: {
          trigger: "WOULD_LEAVE_FIELD",
          target_filter: null,
          replacement_actions: [{ type: "TRASH_FROM_LIFE", params: { amount: 1, position: "TOP" } }],
          optional: true,
          once_per_turn: true,
        },
      }],
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      controller: P1,
      appliesTo: [card.instanceId],
      timestamp: 1,
    } as unknown as RuntimeActiveEffect;
    f.state = { ...f.state, activeEffects: [...f.state.activeEffects, replacement as never] };
  }

  it("an accepted replacement means the cost was not paid: no placement, no hand trash", () => {
    const { f, kuzan, opp3 } = setup();
    withLeaveFieldReplacement(f, opp3);
    const oppHand = f.state.players[P1].hand.length;
    const oppLife = f.state.players[P1].life.length;
    play(f, kuzan);
    f.select([opp3.instanceId]);
    f.choose(endChoice(f, "Bottom"));
    expect(prompt(f)?.promptType).toBe("OPTIONAL_EFFECT");
    f.persist();
    f.choose("accept");
    expect(onField(f, opp3)).toBe(true);
    // The replacement trashed the top Life card instead of placing opp3.
    expect(f.state.players[P1].life).toHaveLength(oppLife - 1);
    expect(f.state.players[P1].life.some((l) => l.cardId === "opp-cost-3")).toBe(false);
    expect(f.state.players[P1].hand).toHaveLength(oppHand);
    expect(f.state.pendingPrompt).toBeNull();
    expect(lifeAddedEvents(f)).toHaveLength(0);
  });

  it("a declined replacement pays the chosen end exactly once, then the opponent trashes", () => {
    const { f, kuzan, opp3, oppHand } = setup();
    withLeaveFieldReplacement(f, opp3);
    const oppLife = f.state.players[P1].life.length;
    play(f, kuzan);
    f.select([opp3.instanceId]);
    f.choose(endChoice(f, "Bottom"));
    f.persist();
    f.choose("skip");
    expect(f.state.players[P1].life).toHaveLength(oppLife + 1);
    expect(f.state.players[P1].life.at(-1)).toMatchObject({ cardId: "opp-cost-3", face: "UP" });
    f.select([oppHand[0].instanceId]);
    expect(f.state.players[P1].hand).toHaveLength(1);
    expect(lifeAddedEvents(f)).toHaveLength(1);
  });
});

describe("OPT-828 direct callers and shared blast radius", () => {
  it("applyCostSelection refuses non-candidates and payCosts fails closed", () => {
    const { f, own3, opp3, opp4 } = setup();
    const cost = kuzanCost();
    for (const ids of [[own3.instanceId], [opp4.instanceId], [], [opp3.instanceId, opp4.instanceId]]) {
      const applied = applyCostSelection(f.state, { ...cost, position: "TOP" }, ids, P0, f.db, "src");
      expect(applied.events).toEqual([]);
      expect(applied.state).toBe(f.state);
    }
    expect(payCosts(f.state, [cost], P0, f.db, "src")).toBeNull();
    expect(isCostSequencePayable(f.state, [cost], P0, f.db, "src")).toBe(true);
    expect(isCostSequencePayable(f.state, [cost], P1, f.db, "src")).toBe(true);
  });

  it("keeps the own-Character ST13-001 cost on the payer's field", () => {
    const { f, own3, opp3 } = setup();
    const st13 = getEffectSchema("ST13-001")!.effects.flatMap((b) => b.costs ?? [])[0];
    const big = f.put("own-big", P0, "CHARACTER", { cost: 3, power: 7000 });
    f.put("opp-big", P1, "CHARACTER", { cost: 3, power: 7000 });
    expect(computeCostTargets(f.state, st13, P0, f.db)).toEqual([big.instanceId]);
    expect(computeCostTargets(f.state, st13, P0, f.db)).not.toContain(own3.instanceId);
    expect(computeCostTargets(f.state, st13, P0, f.db)).not.toContain(opp3.instanceId);
  });
});
