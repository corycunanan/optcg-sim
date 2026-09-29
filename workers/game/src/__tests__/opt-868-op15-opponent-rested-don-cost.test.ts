import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { Cost } from "../engine/effect-types.js";
import { getEffectSchema, validateCost } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { parseStoredSession } from "../session/persistence.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { isCostSequencePayable } from "../engine/effect-resolver/cost/feasibility.js";
import { computeCostTargets } from "../engine/effect-resolver/cost/targets.js";
import { transitionCard } from "../engine/zone-transition.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

// Printed text (canonical docs/cards/OP-15.md):
// - OP15-003 Alvida (:23) / OP15-017 Morgan (:120): "[Activate: Main] [Once
//   Per Turn] You may give 1 of your opponent's rested DON!! cards to 1 of
//   your opponent's Characters: Give up to 1 rested DON!! card to its owner's
//   Leader or 1 of their Characters."
// - OP15-023 Arlong (:167): "... You may give 1 of your opponent's rested
//   DON!! cards to 1 of your opponent's Characters: Give up to 1 DON!! card
//   from its owner's cost area to its owner's Leader or 1 of their
//   Characters."
// FAQ (docs/FAQs/faq_op15-eb04.md OP15-003/017/023): the activating player
// chooses which of the opponent's rested DON!! is given; the effect cannot be
// used when the opponent has 0 Characters or no rested DON!! in their cost
// area; the post-colon give may use either player's DON!! (to its own owner's
// cards only); OP15-023's give may use an active OR rested DON!!.
// Rules (docs/rules/rule_comprehensive.md): 4-4-2 given DON!! are neither
// active nor rested; 6-5-5-2 +1000 only during the owner's turn; 6-5-5-4 a
// card leaving the area returns its given DON!! to the cost area rested;
// 3-1-6-1 a DON!! that moves loses the effects applied to it; 8-3-1-3 an
// unpayable cost is not paid at all.

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
  function put(id: string, controller: 0 | 1) {
    const card: CardInstance = {
      cardId: id,
      instanceId: `opt868-${serial++}`,
      owner: controller,
      controller,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    p.characters[p.characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }
  function tryAct(action: GameAction, player: 0 | 1 = P0) {
    const result = runPipeline(state, action, db, player);
    if (result.valid) state = result.state;
    return result;
  }
  function act(action: GameAction, player: 0 | 1 = P0) {
    const result = tryAct(action, player);
    expect(result.valid, result.error).toBe(true);
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
    respond,
    accept: () => respond({ type: "PLAYER_CHOICE", choiceId: "accept" }),
    decline: () => respond({ type: "PLAYER_CHOICE", choiceId: "skip" }),
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
function costDon(f: Fixture, player: 0 | 1, state: "ACTIVE" | "RESTED") {
  return f.state.players[player].donCostArea.filter((d) => d.state === state && !d.attachedTo);
}
function live(f: Fixture, card: CardInstance) {
  const p = f.state.players[card.controller];
  return p.characters.find((c) => c?.instanceId === card.instanceId)
    ?? (p.leader.instanceId === card.instanceId ? p.leader : undefined);
}
function selectPrompt(f: Fixture) {
  const options = f.state.pendingPrompt?.options;
  if (options?.promptType !== "SELECT_TARGET") throw new Error(JSON.stringify(options));
  return options;
}
function withDonHold(f: Fixture, donId: string, id = "opt868-hold") {
  f.state = {
    ...f.state,
    prohibitions: [
      ...f.state.prohibitions,
      {
        id,
        sourceCardInstanceId: "seed",
        sourceEffectBlockId: "",
        prohibitionType: "CANNOT_REFRESH",
        scope: {},
        duration: { type: "SKIP_NEXT_REFRESH" },
        controller: P0,
        appliesTo: [donId],
        usesRemaining: null,
      } as GameState["prohibitions"][number],
    ],
  };
}

/** Resolve the post-colon "up to 1" give by choosing no recipient. */
function finishEffectGivingNothing(f: Fixture) {
  while (f.state.pendingPrompt) {
    const options = f.state.pendingPrompt.options;
    if (options.promptType === "SELECT_TARGET") f.select([]);
    else if (options.promptType === "PLAYER_CHOICE") f.respond({ type: "PLAYER_CHOICE", choiceId: options.choices[0].id });
    else throw new Error(JSON.stringify(options));
  }
}

const EFFECT_ID: Record<string, string> = {
  "OP15-003": "OP15-003_activate_don_move",
  "OP15-017": "OP15-017_activate_don_move",
  "OP15-023": "OP15-023_activate_don_move",
};

function setup(cardId: string, opts: {
  foes?: number;
  oppActive?: number;
  oppRested?: number;
  ownActive?: number;
  ownRested?: number;
} = {}) {
  const f = fixture();
  f.data(cardId, { cost: 4, power: 5000 });
  const source = f.put(cardId, P0);
  const ally = f.put(CARDS.VANILLA.id, P0);
  const foes = Array.from({ length: opts.foes ?? 2 }, () => f.put(CARDS.VANILLA.id, P1));
  setDon(f, P0, opts.ownActive ?? 2, opts.ownRested ?? 2);
  setDon(f, P1, opts.oppActive ?? 2, opts.oppRested ?? 2);
  return { f, source, ally, foes };
}

function activate(f: Fixture, cardId: string, source: CardInstance) {
  return f.tryAct({ type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: EFFECT_ID[cardId] });
}

function availability(f: Fixture, cardId: string, source: CardInstance) {
  return computeEffectAvailability(f.state, f.db)[source.instanceId]
    ?.find((entry) => entry.effectId === EFFECT_ID[cardId]);
}

describe("OPT-868 GIVE_OPPONENT_DON_TO_OPPONENT cost — authored OP15 schemas", () => {
  it.each(["OP15-003", "OP15-017", "OP15-023"])("%s authors the cost as the opponent-rested-DON!! give", (cardId) => {
    const block = getEffectSchema(cardId)!.effects.find((e) => e.id === EFFECT_ID[cardId])!;
    expect(block.costs).toEqual([{
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      amount: 1,
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    }]);
    expect(block.flags).toMatchObject({ once_per_turn: true, optional: true });
  });

  it("validateCost accepts the authored shape and rejects widened recipients or amounts", () => {
    const base = {
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      amount: 1,
      target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } },
    } as Cost;
    expect(validateCost(base, "c", false)).toEqual([]);
    const bad: Cost[] = [
      { ...base, amount: 2 } as Cost,
      { ...base, filter: { is_rested: true } } as Cost,
      { ...base, target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } } } as Cost,
      { ...base, target: { type: "LEADER_OR_CHARACTER", controller: "OPPONENT", count: { exact: 1 } } } as Cost,
      { ...base, target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } } as Cost,
      { type: "GIVE_OPPONENT_DON_TO_OPPONENT", amount: 1 } as Cost,
    ];
    for (const cost of bad) expect(validateCost(cost, "c", false), JSON.stringify(cost)).not.toEqual([]);
  });
});

describe.each(["OP15-003", "OP15-017", "OP15-023"])("OPT-868 %s cost payment", (cardId) => {
  it("gives 1 of the opponent's rested DON!! to the chosen opponent Character; the payer's DON!! are untouched", () => {
    const { f, source, ally, foes } = setup(cardId);
    const [foe, other] = foes;
    const ownBefore = structuredClone(f.state.players[P0].donCostArea);
    const oppRestedIds = costDon(f, P1, "RESTED").map((d) => d.instanceId);
    const oppActiveIds = costDon(f, P1, "ACTIVE").map((d) => d.instanceId);
    expect(availability(f, cardId, source)?.status).toBe("usable");
    expect(activate(f, cardId, source).valid).toBe(true);
    f.accept();
    const recipients = selectPrompt(f);
    expect(recipients.countMin).toBe(1);
    expect(recipients.countMax).toBe(1);
    // Only the opponent's Characters — never their Leader, never the payer's cards.
    expect(new Set(recipients.validTargets)).toEqual(new Set([foe.instanceId, other.instanceId]));
    expect(recipients.validTargets).not.toContain(f.state.players[P1].leader.instanceId);
    expect(recipients.validTargets).not.toContain(ally.instanceId);
    // Nothing is committed while the recipient prompt is pending.
    expect(costDon(f, P1, "RESTED")).toHaveLength(2);
    f.select([foe.instanceId]);

    const given = live(f, foe)!.attachedDon;
    expect(given).toHaveLength(1);
    expect(oppRestedIds).toContain(given[0].instanceId);
    expect(given[0].attachedTo).toBe(foe.instanceId);
    expect(costDon(f, P1, "RESTED")).toHaveLength(1);
    expect(costDon(f, P1, "ACTIVE").map((d) => d.instanceId)).toEqual(oppActiveIds);
    // The payer's DON!! never move to pay this cost.
    expect(f.state.players[P0].donCostArea).toEqual(ownBefore);
    expect(f.state.players[P0].donCostArea).toHaveLength(4);
    // Once paid, the ability is used for this turn.
    expect(availability(f, cardId, source)?.status).toBe("used");
    finishEffectGivingNothing(f);
    expect(f.state.eventLog.filter((e) => e.type === "DON_GIVEN_TO_CARD")).toEqual([
      expect.objectContaining({ playerIndex: P1, payload: { targetInstanceId: foe.instanceId, count: 1 } }),
    ]);
  });

  it("is unavailable, and not consumed, when the opponent has no rested DON!!", () => {
    const { f, source, foes } = setup(cardId, { oppActive: 4, oppRested: 0, ownRested: 3 });
    // The payer's own rested DON!! do not count.
    expect(availability(f, cardId, source)?.status).toBe("blocked");
    expect(availability(f, cardId, source)).toMatchObject({ reason: "COST" });
    const before = structuredClone(f.state);
    expect(activate(f, cardId, source).valid).toBe(false);
    expect(f.state).toEqual(before);
    // Once-per-turn was not consumed: with an opponent rested DON!! it works.
    setDon(f, P1, 3, 1);
    expect(availability(f, cardId, source)?.status).toBe("usable");
    expect(activate(f, cardId, source).valid).toBe(true);
    f.accept();
    f.select([foes[0].instanceId]);
    expect(live(f, foes[0])!.attachedDon).toHaveLength(1);
  });

  it("is unavailable when the opponent has no Character (their Leader is not a recipient)", () => {
    const { f, source } = setup(cardId, { foes: 0 });
    expect(availability(f, cardId, source)).toMatchObject({ status: "blocked", reason: "COST" });
    const before = structuredClone(f.state);
    expect(activate(f, cardId, source).valid).toBe(false);
    expect(f.state).toEqual(before);
    expect(f.state.players[P1].leader.attachedDon).toHaveLength(0);
  });

  it("a second activation in the same turn is refused (Once Per Turn)", () => {
    const { f, source, foes } = setup(cardId, { oppRested: 3 });
    expect(activate(f, cardId, source).valid).toBe(true);
    f.accept();
    f.select([foes[0].instanceId]);
    finishEffectGivingNothing(f);
    expect(availability(f, cardId, source)?.status).toBe("used");
    // The engine accepts the announcement but resolves nothing: no prompt,
    // no cost, no DON!! moved (the once-per-turn gate in the resolver).
    const before = structuredClone(f.state.players);
    activate(f, cardId, source);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players).toEqual(before);
    expect(costDon(f, P1, "RESTED")).toHaveLength(2);
  });

  it("declining the optional cost moves nothing and keeps the ability available (8-3-1-4)", () => {
    const { f, source } = setup(cardId);
    const before = structuredClone(f.state.players);
    expect(activate(f, cardId, source).valid).toBe(true);
    f.decline();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players).toEqual(before);
    expect(availability(f, cardId, source)?.status).toBe("usable");
  });
});

describe("OPT-868 cost resolution details (OP15-017 Morgan)", () => {
  it("the post-colon give sees the post-payment cost area (cost-then-effect)", () => {
    // The opponent's only rested DON!! pays the cost, so the effect cannot
    // give the opponent another rested DON!!.
    const { f, source, foes } = setup("OP15-017", { oppActive: 3, oppRested: 1 });
    const [foe, other] = foes;
    activate(f, "OP15-017", source);
    f.accept();
    f.select([foe.instanceId]);
    const effect = selectPrompt(f);
    expect(effect.validTargets).toContain(other.instanceId);
    f.select([other.instanceId]);
    expect(live(f, other)!.attachedDon).toHaveLength(0);
    expect(live(f, foe)!.attachedDon).toHaveLength(1);
    expect(costDon(f, P1, "ACTIVE")).toHaveLength(3);
  });

  it("the post-colon give moves the payer's own rested DON!! to the payer's Leader", () => {
    const { f, source, foes } = setup("OP15-017");
    activate(f, "OP15-017", source);
    f.accept();
    f.select([foes[0].instanceId]);
    f.select([f.state.players[P0].leader.instanceId]);
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(1);
    expect(costDon(f, P0, "RESTED")).toHaveLength(1);
    expect(costDon(f, P0, "ACTIVE")).toHaveLength(2);
  });

  it("the given DON!! adds no power during the payer's turn (6-5-5-2) and returns rested when the Character leaves (6-5-5-4)", () => {
    const { f, source, foes } = setup("OP15-017");
    const foe = foes[0];
    const basePower = getEffectivePower(live(f, foe)!, f.db.get(foe.cardId)!, f.state, f.db);
    activate(f, "OP15-017", source);
    f.accept();
    f.select([foe.instanceId]);
    f.select([]);
    const givenId = live(f, foe)!.attachedDon[0].instanceId;
    expect(getEffectivePower(live(f, foe)!, f.db.get(foe.cardId)!, f.state, f.db)).toBe(basePower);
    const moved = transitionCard(f.state, foe.instanceId, "TRASH", { position: "TOP" });
    expect(moved).toBeTruthy();
    f.state = moved!.state;
    const returned = f.state.players[P1].donCostArea.find((d) => d.instanceId === givenId);
    expect(returned).toMatchObject({ state: "RESTED", attachedTo: null });
    expect(f.state.players[P0].donCostArea.some((d) => d.instanceId === givenId)).toBe(false);
  });

  it("lets the payer choose which rested DON!! when they differ, and releases a moved DON!!'s hold (3-1-6-1)", () => {
    const { f, source, foes } = setup("OP15-017", { oppActive: 1, oppRested: 3 });
    const foe = foes[0];
    const [held, free1, free2] = costDon(f, P1, "RESTED").map((d) => d.instanceId);
    withDonHold(f, held);
    activate(f, "OP15-017", source);
    f.accept();
    f.select([foe.instanceId]);
    const donStep = selectPrompt(f);
    expect(new Set(donStep.validTargets)).toEqual(new Set([held, free1, free2]));
    expect(donStep.countMin).toBe(1);
    expect(donStep.countMax).toBe(1);
    // Still nothing committed until the DON!! is chosen.
    expect(live(f, foe)!.attachedDon).toHaveLength(0);
    f.persist();
    // An active DON!!, the recipient id or a stranger is not a DON!! choice.
    const pending = structuredClone(f.state);
    for (const ids of [[], [costDon(f, P1, "ACTIVE")[0].instanceId], [foe.instanceId], [held, free1], ["foreign"]]) {
      f.select(ids, true);
      expect(f.state).toEqual(pending);
    }
    f.select([free1]);
    expect(live(f, foe)!.attachedDon.map((d) => d.instanceId)).toEqual([free1]);
    expect(f.state.prohibitions.find((p) => p.id === "opt868-hold")?.appliesTo).toEqual([held]);
  });

  it("giving the held DON!! removes that hold (3-1-6-1)", () => {
    const { f, source, foes } = setup("OP15-017", { oppActive: 1, oppRested: 2 });
    const [held] = costDon(f, P1, "RESTED").map((d) => d.instanceId);
    withDonHold(f, held);
    activate(f, "OP15-017", source);
    f.accept();
    f.select([foes[0].instanceId]);
    f.select([held]);
    expect(live(f, foes[0])!.attachedDon.map((d) => d.instanceId)).toEqual([held]);
    expect(f.state.prohibitions.find((p) => p.id === "opt868-hold")).toBeUndefined();
  });

  it("skips the DON!! step when the rested DON!! are interchangeable", () => {
    const { f, source, foes } = setup("OP15-017", { oppRested: 3 });
    activate(f, "OP15-017", source);
    f.accept();
    f.select([foes[0].instanceId]);
    expect(live(f, foes[0])!.attachedDon).toHaveLength(1);
    // The next prompt is the post-colon effect's recipient, not a DON!! pick.
    expect(selectPrompt(f).validTargets).toContain(f.state.players[P0].leader.instanceId);
  });

  it("rejects a recipient reply that is not an opponent Character, and a stale one after the Character left", () => {
    const { f, source, ally, foes } = setup("OP15-017");
    activate(f, "OP15-017", source);
    f.accept();
    f.persist();
    const pending = structuredClone(f.state);
    for (const ids of [[], [ally.instanceId], [f.state.players[P1].leader.instanceId], [foes[0].instanceId, foes[1].instanceId]]) {
      f.select(ids, true);
      expect(f.state).toEqual(pending);
    }
    // The chosen Character leaves the field before the reply arrives.
    const moved = transitionCard(f.state, foes[0].instanceId, "TRASH", { position: "TOP" });
    f.state = moved!.state;
    const stale = structuredClone(f.state);
    f.select([foes[0].instanceId], true);
    expect(f.state).toEqual(stale);
  });

  it("rejects a DON!! reply once the staged DON!! is no longer rested", () => {
    const { f, source, foes } = setup("OP15-017", { oppActive: 1, oppRested: 2 });
    const [held, free] = costDon(f, P1, "RESTED").map((d) => d.instanceId);
    withDonHold(f, held);
    activate(f, "OP15-017", source);
    f.accept();
    f.select([foes[0].instanceId]);
    f.persist();
    const frame = f.state.effectStack.at(-1)!;
    const staged = structuredClone(frame.costTransactionState!);
    const idx = staged.players[P1].donCostArea.findIndex((d) => d.instanceId === free);
    staged.players[P1].donCostArea[idx] = { ...staged.players[P1].donCostArea[idx], state: "ACTIVE" };
    f.state = {
      ...f.state,
      effectStack: [...f.state.effectStack.slice(0, -1), { ...frame, costTransactionState: staged }],
    };
    const before = structuredClone(f.state);
    f.select([free], true);
    expect(f.state).toEqual(before);
  });

  it("never offers a payer's own card as recipient, even from an unvalidated EITHER target", () => {
    const { f, source, ally, foes } = setup("OP15-017");
    const widened = {
      type: "GIVE_OPPONENT_DON_TO_OPPONENT",
      amount: 1,
      target: { type: "CHARACTER", controller: "EITHER", count: { exact: 1 } },
    } as Cost;
    const offered = computeCostTargets(f.state, widened, P0, f.db, source.instanceId);
    expect(new Set(offered)).toEqual(new Set(foes.map((c) => c.instanceId)));
    expect(offered).not.toContain(ally.instanceId);
  });

  it("feasibility stays linear with a full opponent field and cost area", () => {
    const { f, source } = setup("OP15-017", { foes: 5, oppActive: 0, oppRested: 10 });
    const cost = getEffectSchema("OP15-017")!.effects.find((e) => e.id === EFFECT_ID["OP15-017"])!.costs![0];
    // A non-terminal copy forces the branching (selection-payment) search.
    const started = performance.now();
    for (let i = 0; i < 50; i++) {
      expect(isCostSequencePayable(f.state, [cost, cost, cost], P0, f.db, source.instanceId)).toBe(true);
    }
    expect(performance.now() - started).toBeLessThan(5000);
    // With only 2 rested DON!!, three gives cannot all be paid.
    setDon(f, P1, 8, 2);
    expect(isCostSequencePayable(f.state, [cost, cost, cost], P0, f.db, source.instanceId)).toBe(false);
  });
});

describe("OPT-868 OP15-023 post-colon give (active or rested DON!!)", () => {
  function payArlong(opts: Parameters<typeof setup>[1] = {}) {
    const ctx = setup("OP15-023", opts);
    activate(ctx.f, "OP15-023", ctx.source);
    ctx.f.accept();
    ctx.f.select([ctx.foes[0].instanceId]);
    const options = ctx.f.state.pendingPrompt?.options;
    if (options?.promptType !== "PLAYER_CHOICE") throw new Error(JSON.stringify(options));
    return { ...ctx, choices: options.choices };
  }

  it("may give an ACTIVE DON!! from its owner's cost area (FAQ: regardless of active or rested)", () => {
    const { f, choices } = payArlong();
    expect(choices).toHaveLength(2);
    f.respond({ type: "PLAYER_CHOICE", choiceId: choices[0].id });
    f.select([f.state.players[P0].leader.instanceId]);
    expect(f.state.players[P0].leader.attachedDon).toHaveLength(1);
    expect(costDon(f, P0, "ACTIVE")).toHaveLength(1);
    expect(costDon(f, P0, "RESTED")).toHaveLength(2);
  });

  it("may give a RESTED DON!! from the opponent's cost area to an opponent Character", () => {
    const { f, foes, choices } = payArlong({ oppRested: 3 });
    f.respond({ type: "PLAYER_CHOICE", choiceId: choices[1].id });
    f.select([foes[1].instanceId]);
    expect(live(f, foes[1])!.attachedDon).toHaveLength(1);
    expect(costDon(f, P1, "RESTED")).toHaveLength(1);
    expect(costDon(f, P1, "ACTIVE")).toHaveLength(2);
  });
});
