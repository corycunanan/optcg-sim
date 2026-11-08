/**
 * OPT-1024 — condition and cost filter scoping, through the real pipeline
 * with the registered authored schemas.
 *
 * OPT-882: "other than this card" inside a condition. Conditions read the
 * condition-level `exclude_self` (CARD_ON_FIELD only); a filter-level key was
 * silently ignored, so the source card counted itself. Card text (docs/cards/):
 * - EB01-012 Cavendish: "[On Play]/[When Attacking] If your Leader has the
 *   {Supernovas} type and you have no other [Cavendish] Characters, set up to
 *   2 of your DON!! cards as active."
 * - OP07-060 Itomimizu: "[Activate: Main] [Once Per Turn] If your Leader has
 *   the {Foxy Pirates} type and you have no other [Itomimizu], add up to 1
 *   DON!! card from your DON!! deck and rest it."
 * - OP04-005 Kung Fu Jugon: "If you have a [Kung Fu Jugon] other than this
 *   Character, this Character gains [Blocker]."
 * - OP13-009 Curly.Dadan: "If you have a {Mountain Bandits} type Character
 *   other than this card, this Character gains [Double Attack]."
 * - OP04-012 Nefeltari Cobra: "[Your Turn] All of your {Alabasta} type
 *   Characters other than this Character gain +1000 power." (aura target
 *   filter: permanent modifiers now honor filter-level exclude_self.)
 *
 * OPT-866: OP06-102/111/114 "place 1 Stage with a cost of 1 at the bottom of
 * the owner's deck:" may select the opponent's Stage (qa_op06.md: "Can I use
 * this effect to place my opponent's Stage with a cost of 1 at the bottom of
 * their deck? Yes, you can.").
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, DonInstance, GameAction, GameState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getAllAuthoredSchemas, getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { computeEffectAvailability } from "../engine/availability.js";
import { getEffectivePower, hasGrantedKeyword } from "../engine/modifiers.js";
import {
  findConditionExcludeSelfIntentViolations,
  findConditionExcludeSelfViolations,
} from "../engine/schema-exclude-self-lint.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
    p.trash = [];
    p.stage = null;
  });
  let serial = 0;
  function put(
    id: string,
    owner: 0 | 1 = 0,
    zone: CardInstance["zone"] = "CHARACTER",
    data: Partial<CardData> = {},
  ): CardInstance {
    const schema = getEffectSchema(id);
    if (!db.has(id) || Object.keys(data).length > 0 || schema) {
      db.set(id, {
        ...(zone === "LEADER" ? CARDS.LEADER : CARDS.VANILLA),
        id,
        name: schema?.card_name ?? id,
        cost: 3,
        power: 4000,
        effectText: "",
        ...(zone === "STAGE" ? { type: "Stage", power: null, counter: null } : {}),
        ...data,
        ...(schema ? { effectSchema: schema } : {}),
      });
    }
    const c: CardInstance = {
      instanceId: `${id}-${owner}-${zone}-${serial++}`,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 0,
    };
    if (zone === "HAND") state.players[owner].hand.push(c);
    else if (zone === "LEADER") state.players[owner].leader = c;
    else if (zone === "STAGE") state.players[owner].stage = c;
    else
      state.players[owner].characters[
        state.players[owner].characters.findIndex((slot) => !slot)
      ] = c;
    if (zone === "LEADER" || zone === "CHARACTER" || zone === "STAGE") {
      state = registerCardEnteredField(state, c, db.get(id)!);
    }
    return c;
  }
  function leader(traits: string[]) {
    return put(`leader-${traits.join("-")}`, 0, "LEADER", { types: traits });
  }
  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, r.error).toBe(true);
      state = r.state;
    }
  }
  function tryAct(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    return runPipeline(state, action, db, player);
  }
  const promptType = () => state.pendingPrompt?.options.promptType;
  function validTargets(): string[] {
    const options = state.pendingPrompt?.options;
    return options?.promptType === "SELECT_TARGET" ? options.validTargets : [];
  }
  /** Answer an "up to N" value prompt with its largest value. */
  function chooseMaxValue() {
    const options = state.pendingPrompt?.options;
    if (options?.promptType !== "PLAYER_CHOICE") return;
    const ids = options.choices.map((c) => c.id).filter((id) => id.startsWith("choose-value:"));
    if (ids.length > 0) act({ type: "PLAYER_CHOICE", choiceId: ids.at(-1)! });
  }
  function availability(card: CardInstance, effectId: string) {
    return computeEffectAvailability(state, db)[card.instanceId]?.find((e) => e.effectId === effectId);
  }
  return {
    db, put, leader, act, tryAct, promptType, validTargets, availability, chooseMaxValue,
    roundTrip() {
      state = JSON.parse(JSON.stringify(state));
    },
    get state(): GameState {
      return state;
    },
    set state(value: GameState) {
      state = value;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function dons(owner: 0 | 1, count: number, donState: "ACTIVE" | "RESTED", tag: string): DonInstance[] {
  return Array.from({ length: count }, (_, i) => ({
    instanceId: `don-${tag}-${owner}-${i}`,
    state: donState,
    attachedTo: null,
  }));
}

// ─── OPT-882: condition-level exclude_self ───────────────────────────────────

describe("OPT-882 EB01-012 Cavendish — no other [Cavendish] Characters", () => {
  function play(withOtherCopy: boolean) {
    const f = fixture();
    f.leader(["Supernovas"]);
    if (withOtherCopy) f.put("EB01-012", 0, "CHARACTER");
    const cavendish = f.put("EB01-012", 0, "HAND");
    f.state.players[0].donCostArea = [...dons(0, 3, "ACTIVE", "pay"), ...dons(0, 3, "RESTED", "rested")];
    f.act({ type: "PLAY_CARD", cardInstanceId: cavendish.instanceId });
    f.chooseMaxValue();
    expect(f.state.pendingPrompt).toBeNull();
    return { f, cavendish };
  }

  it("sets rested DON!! active when it is the only Cavendish on your field", () => {
    const { f } = play(false);
    // Paying the cost rests the 3 active DON!!; the [On Play] sets 2 of the
    // 6 rested DON!! active again.
    const active = f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE");
    expect(active).toHaveLength(2);
  });

  it("does nothing when another Cavendish Character is on your field", () => {
    const { f } = play(true);
    const active = f.state.players[0].donCostArea.filter((d) => d.state === "ACTIVE");
    expect(active).toHaveLength(0);
  });
});

describe("OPT-882 OP07-060 Itomimizu — no other [Itomimizu]", () => {
  function setup(withOtherCopy: boolean) {
    const f = fixture();
    f.leader(["Foxy Pirates"]);
    if (withOtherCopy) f.put("OP07-060", 0, "CHARACTER");
    const itomimizu = f.put("OP07-060", 0, "CHARACTER");
    f.state.players[0].donCostArea = dons(0, 2, "ACTIVE", "field");
    f.state.players[0].donDeck = dons(0, 8, "ACTIVE", "deck");
    return { f, itomimizu };
  }

  it("adds a rested DON!! when it is the only Itomimizu on your field", () => {
    const { f, itomimizu } = setup(false);
    expect(f.availability(itomimizu, "OP07-060_effect_1")).toMatchObject({ status: "usable" });
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: itomimizu.instanceId, effectId: "OP07-060_effect_1" });
    f.chooseMaxValue();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].donCostArea).toHaveLength(3);
    expect(f.state.players[0].donCostArea.filter((d) => d.state === "RESTED")).toHaveLength(1);
    expect(f.state.players[0].donDeck).toHaveLength(7);
  });

  it("cannot add DON!! while another Itomimizu is on your field", () => {
    const { f, itomimizu } = setup(true);
    const r = f.tryAct({ type: "ACTIVATE_EFFECT", cardInstanceId: itomimizu.instanceId, effectId: "OP07-060_effect_1" });
    if (r.valid) f.state = r.state;
    expect(f.state.players[0].donCostArea).toHaveLength(2);
    expect(f.state.players[0].donDeck).toHaveLength(8);
  });
});

describe("OPT-882 permanent gates that need another card", () => {
  it("OP04-005 Kung Fu Jugon gains [Blocker] only with another Kung Fu Jugon", () => {
    const f = fixture();
    const first = f.put("OP04-005", 0, "CHARACTER");
    expect(hasGrantedKeyword(first, "BLOCKER", f.state, f.db)).toBe(false);
    const second = f.put("OP04-005", 0, "CHARACTER");
    expect(hasGrantedKeyword(first, "BLOCKER", f.state, f.db)).toBe(true);
    expect(hasGrantedKeyword(second, "BLOCKER", f.state, f.db)).toBe(true);
  });

  it("OP13-009 Curly.Dadan needs another {Mountain Bandits} Character, not itself or the Leader", () => {
    const f = fixture();
    f.put("leader-bandits", 0, "LEADER", { types: ["Mountain Bandits"] });
    const dadan = f.put("OP13-009", 0, "CHARACTER", { types: ["Mountain Bandits"] });
    expect(hasGrantedKeyword(dadan, "DOUBLE_ATTACK", f.state, f.db)).toBe(false);
    f.put("bandit", 0, "CHARACTER", { types: ["Mountain Bandits"] });
    expect(hasGrantedKeyword(dadan, "DOUBLE_ATTACK", f.state, f.db)).toBe(true);
  });

  it("OP04-012 Nefeltari Cobra's aura buffs other {Alabasta} Characters, never Cobra", () => {
    const f = fixture();
    const cobra = f.put("OP04-012", 0, "CHARACTER", { types: ["Alabasta"], power: 5000 });
    const ally = f.put("alabasta-ally", 0, "CHARACTER", { types: ["Alabasta"], power: 4000 });
    expect(f.state.turn.activePlayerIndex).toBe(0);
    expect(getEffectivePower(ally, f.db.get(ally.cardId)!, f.state, f.db)).toBe(5000);
    expect(getEffectivePower(cobra, f.db.get(cobra.cardId)!, f.state, f.db)).toBe(5000);
  });
});

describe("OPT-882 schema lint — exclude_self inside conditions", () => {
  const schema = (conditions: unknown): EffectSchema => ({
    card_id: "LINT-882",
    card_name: "Lint fixture",
    card_type: "Character",
    effects: [{ id: "gate", category: "permanent", conditions, modifiers: [] }],
  } as unknown as EffectSchema);

  it("rejects a filter-level exclude_self inside a condition, at any nesting", () => {
    const violations = findConditionExcludeSelfViolations(schema({
      all_of: [{ not: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "X", exclude_self: true } } }],
    }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("conditions ignore filter.exclude_self");
  });

  it("rejects condition-level exclude_self on a condition that does not read it", () => {
    const violations = findConditionExcludeSelfViolations(schema({
      type: "HAND_COUNT", controller: "SELF", operator: ">=", value: 1, exclude_self: true,
    }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("HAND_COUNT ignores exclude_self");
  });

  it("rejects it inside a prohibition's conditional_override", () => {
    const violations = findConditionExcludeSelfViolations({
      card_id: "LINT-882",
      card_name: "Lint fixture",
      card_type: "Character",
      effects: [{
        id: "shield",
        category: "permanent",
        prohibitions: [{
          type: "CANNOT_BE_KO",
          conditional_override: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "X", exclude_self: true } },
        }],
      }],
    } as unknown as EffectSchema);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("conditional_override");
  });

  it("accepts the condition-level form on CARD_ON_FIELD", () => {
    expect(findConditionExcludeSelfViolations(schema({
      not: { type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "X" }, exclude_self: true },
    }))).toEqual([]);
  });

  it("the authored registry is clean", () => {
    expect(findConditionExcludeSelfIntentViolations(getAllAuthoredSchemas())).toEqual([]);
  });
});

// ─── OPT-866: either player's Stage ──────────────────────────────────────────

describe("OPT-866 OP06-111 Braham — place 1 cost-1 Stage (either player's) at the owner's deck bottom", () => {
  const EFFECT = "OP06-111_effect_1";
  function setup() {
    const f = fixture();
    const braham = f.put("OP06-111", 0, "CHARACTER");
    const victim = f.put("opp-cost-4", 1, "CHARACTER", { cost: 4 });
    return { f, braham, victim };
  }
  function activate(f: Fixture, braham: CardInstance) {
    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: braham.instanceId, effectId: EFFECT });
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    f.act({ type: "PLAYER_CHOICE", choiceId: "accept" });
  }
  function select(f: Fixture, ids: string[]) {
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: ids });
  }

  it("pays with your own cost-1 Stage into your deck", () => {
    const { f, braham, victim } = setup();
    const own = f.put("own-stage-1", 0, "STAGE", { cost: 1 });
    const ownDeck = f.state.players[0].deck.length;
    activate(f, braham);
    expect(f.validTargets()).toEqual([own.instanceId]);
    select(f, [own.instanceId]);
    expect(f.state.players[0].stage).toBeNull();
    expect(f.state.players[0].deck).toHaveLength(ownDeck + 1);
    expect(f.state.players[0].deck.at(-1)).toMatchObject({ cardId: "own-stage-1", owner: 0, zone: "DECK" });
    // The action then rests the opponent's cost-4 Character.
    if (f.promptType() === "SELECT_TARGET") select(f, [victim.instanceId]);
    expect(f.state.players[1].characters.find((c) => c?.instanceId === victim.instanceId)?.state).toBe("RESTED");
  });

  it("pays with the opponent's cost-1 Stage into the OPPONENT's deck", () => {
    const { f, braham, victim } = setup();
    const opp = f.put("opp-stage-1", 1, "STAGE", { cost: 1 });
    const oppDeck = f.state.players[1].deck.length;
    const ownDeck = f.state.players[0].deck.length;
    activate(f, braham);
    expect(f.validTargets()).toEqual([opp.instanceId]);
    f.roundTrip();
    select(f, [opp.instanceId]);
    if (f.promptType() === "SELECT_TARGET") select(f, [victim.instanceId]);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[1].stage).toBeNull();
    expect(f.state.players[1].deck).toHaveLength(oppDeck + 1);
    expect(f.state.players[1].deck.at(-1)).toMatchObject({ cardId: "opp-stage-1", owner: 1, zone: "DECK" });
    expect(f.state.players[0].deck).toHaveLength(ownDeck);
    const returned = f.state.eventLog.filter((e) => e.type === "CARD_RETURNED_TO_DECK");
    expect(returned).toHaveLength(1);
    expect(returned[0]).toMatchObject({
      playerIndex: 1,
      payload: { cardInstanceId: opp.instanceId, sourceZone: "STAGE", sourceController: 1, causingController: 0, movementCause: "COST" },
    });
  });

  it("offers both players' cost-1 Stages and excludes a cost-2 Stage", () => {
    const { f, braham } = setup();
    const own = f.put("own-stage-1", 0, "STAGE", { cost: 1 });
    const opp = f.put("opp-stage-2", 1, "STAGE", { cost: 2 });
    activate(f, braham);
    expect(f.validTargets()).toEqual([own.instanceId]);
    expect(f.validTargets()).not.toContain(opp.instanceId);

    const g = setup();
    const ownB = g.f.put("own-stage-1", 0, "STAGE", { cost: 1 });
    const oppB = g.f.put("opp-stage-1", 1, "STAGE", { cost: 1 });
    activate(g.f, g.braham);
    expect(g.f.validTargets()).toEqual([ownB.instanceId, oppB.instanceId]);
  });

  it("is unavailable with no cost-1 Stage on either field", () => {
    const { f, braham } = setup();
    f.put("own-stage-2", 0, "STAGE", { cost: 2 });
    f.put("opp-stage-2", 1, "STAGE", { cost: 2 });
    expect(f.availability(braham, EFFECT)).toMatchObject({ status: "blocked", reason: "COST" });
    const r = f.tryAct({ type: "ACTIVATE_EFFECT", cardInstanceId: braham.instanceId, effectId: EFFECT });
    expect(r.valid).toBe(false);
  });

  it("an opponent's cost-1 Stage alone makes the effect available", () => {
    const { f, braham } = setup();
    f.put("opp-stage-1", 1, "STAGE", { cost: 1 });
    expect(f.availability(braham, EFFECT)).toMatchObject({ status: "usable" });
  });

  it("skips an opponent Stage protected from removal by its opponent's effects", () => {
    const { f, braham } = setup();
    const shielded = f.put("opp-stage-1", 1, "STAGE", { cost: 1 });
    f.state.prohibitions = [{
      id: "shield",
      sourceCardInstanceId: shielded.instanceId,
      sourceEffectBlockId: "shield-block",
      prohibitionType: "CANNOT_BE_REMOVED_FROM_FIELD",
      controller: 1,
      appliesTo: [shielded.instanceId],
      scope: {},
      duration: { type: "PERMANENT" },
      expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
      usesRemaining: null,
      conditionalOverride: null,
      timestamp: 0,
    } as unknown as GameState["prohibitions"][number]];
    expect(f.availability(braham, EFFECT)).toMatchObject({ status: "blocked", reason: "COST" });
  });
});

describe.each([
  ["OP06-102", "OP06-102_effect_1"],
  ["OP06-114", "OP06-114_effect_1"],
])("OPT-866 %s authors the EITHER Stage cost", (id, effectId) => {
  it("its Stage cost selects either player's cost-1 Stage", () => {
    const schema = getEffectSchema(id)!;
    const block = schema.effects.find((e) => e.id === effectId) ?? schema.effects.find((e) =>
      e.costs?.some((c) => c.type === "PLACE_STAGE_TO_DECK"));
    expect(block?.costs?.find((c) => c.type === "PLACE_STAGE_TO_DECK")).toMatchObject({
      controller: "EITHER",
      filter: { cost_exact: 1 },
      position: "BOTTOM",
    });
  });
});
