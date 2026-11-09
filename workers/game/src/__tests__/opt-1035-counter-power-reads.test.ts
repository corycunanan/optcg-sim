/**
 * OPT-1035 — Counter Step power is part of the one power read.
 *
 * Rules §7-1-3-1-1: a [Symbol Counter] raises the attacked card's power
 * "during that battle". The engine keeps it on `BattleContext.counterPowerAdded`
 * and `getEffectivePower` adds it to the battle target as value layer 4
 * (docs/game-engine/VALUE-LAYER-CONTRACT.md). Every read during the battle
 * therefore sees it: [Counter] Event target filters and conditions, set-to-0,
 * copy, and the battle result, without counting it twice.
 *
 * Layer order: OP06-009 Shuraiya (docs/FAQs/qa_op06.md:26) — a base power set
 * by [On Block] can still be raised by a Counter, so Counter power sits above
 * base-power settings.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectiveBasePower, getEffectivePower } from "../engine/modifiers.js";
import { evaluateCondition } from "../engine/conditions.js";
import { executeCopyPower, executeSetBasePower, executeSetPowerToZero } from "../engine/effect-resolver/actions/modifiers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;

  function def(id: string, data: Partial<CardData> = {}, schema?: EffectSchema) {
    const authored = schema ?? getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: authored?.card_name ?? id,
      effectText: "",
      counter: null,
      ...data,
      effectSchema: authored ?? null,
    });
  }

  function put(id: string, owner: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    if (!db.has(id)) def(id);
    const instanceId = `${id}-${owner}-${serial++}`;
    const card: CardInstance = {
      instanceId,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: zone === "CHARACTER" ? "RESTED" : "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[owner];
    if (zone === "HAND") p.hand.push(card);
    else p.characters[p.characters.findIndex((c) => !c)] = card;
    if (zone === "CHARACTER") state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  function act(player: 0 | 1, action: GameAction) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected, `${action.type} rejected`).toBe(false);
      state = r.state;
    } else {
      const r = runPipeline(state, action, db, player);
      expect(r.valid, `${action.type}: ${r.error}`).toBe(true);
      state = r.state;
    }
  }

  /** Player 1 attacks player 0's `target`; stops in the Counter Step. */
  function attackIntoCounterStep(attacker: CardInstance, target: CardInstance) {
    state.turn.activePlayerIndex = 1;
    const slot = state.players[1].characters.find((c) => c?.instanceId === attacker.instanceId);
    if (slot) slot.state = "ACTIVE";
    act(1, { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId });
    for (let guard = 0; guard < 5 && state.turn.battleSubPhase !== "COUNTER_STEP"; guard++) {
      act(state.turn.battleSubPhase === "ATTACK_STEP" ? 1 : 0, { type: "PASS" });
    }
    expect(state.turn.battleSubPhase).toBe("COUNTER_STEP");
  }

  function symbolCounter(target: CardInstance) {
    const counter = put(CARDS.COUNTER.id, 0, "HAND");
    act(0, { type: "USE_COUNTER", cardInstanceId: counter.instanceId, counterTargetInstanceId: target.instanceId });
  }

  const live = (card: CardInstance) =>
    state.players[card.controller].characters.find((c) => c?.instanceId === card.instanceId) ??
    state.players[card.controller].leader;
  const power = (card: CardInstance) => getEffectivePower(live(card)!, db.get(card.cardId)!, state, db);

  return {
    db, def, put, act, attackIntoCounterStep, symbolCounter, power, live,
    get state() { return state; },
  };
}

describe("OPT-1035 Counter power is value layer 4", () => {
  it("the battle reads the Counter once: defender power is effective power, not effective + Counter again", () => {
    const f = fixture();
    f.def("C1035-DEF", { power: 4000 });
    f.def("C1035-ATK", { power: 7000 });
    const defender = f.put("C1035-DEF", 0);
    const attacker = f.put("C1035-ATK", 1);
    f.attackIntoCounterStep(attacker, defender);
    f.symbolCounter(defender);

    expect(f.state.turn.battle?.counterPowerAdded).toBe(CARDS.COUNTER.counter);
    expect(f.power(defender)).toBe(4000 + CARDS.COUNTER.counter!);
    expect(f.state.turn.battle?.defenderPower).toBe(4000 + CARDS.COUNTER.counter!);
  });

  it("real pipeline: OP14-018 [Counter] condition 'a Character with 8000 power or more' sees Symbol Counter power", () => {
    // OP14-018: "[Counter] If there is a Character with 8000 power or more, up
    // to 1 of your Leader or Character cards gains +4000 power during this battle."
    const run = (useSymbolCounter: boolean) => {
      const f = fixture();
      f.def("OP14-018", {
        type: "Event", cost: 0, power: null, counter: null,
        effectText: "[Counter] If there is a Character with 8000 power or more, up to 1 of your Leader or Character cards gains +4000 power during this battle.",
      });
      f.def("C1035-DEF6", { power: 8000 - CARDS.COUNTER.counter! });
      f.def("C1035-ATK", { power: 4000 });
      const defender = f.put("C1035-DEF6", 0);
      const attacker = f.put("C1035-ATK", 1);
      const event = f.put("OP14-018", 0, "HAND");
      f.attackIntoCounterStep(attacker, defender);
      if (useSymbolCounter) f.symbolCounter(defender);
      const before = f.power(defender);
      f.act(0, { type: "USE_COUNTER_EVENT", cardInstanceId: event.instanceId, counterTargetInstanceId: defender.instanceId });
      if (f.state.pendingPrompt?.options.promptType === "SELECT_TARGET") {
        f.act(0, { type: "SELECT_TARGET", selectedInstanceIds: [defender.instanceId] });
      }
      return f.power(defender) - before;
    };
    expect(run(true)).toBe(4000);
    expect(run(false)).toBe(0);
  });

  it("real pipeline: a [Counter] Event 'your Character with 5000 power or less' rejects a Character raised above 5000 by a Symbol Counter", () => {
    const counterEvent: EffectSchema = {
      card_id: "C1035-EVT",
      card_name: "Filtered Counter",
      card_type: "Event",
      effects: [{
        id: "C1035-EVT_counter",
        category: "auto",
        trigger: { keyword: "COUNTER_EVENT" },
        actions: [{
          type: "MODIFY_POWER",
          target: { type: "CHARACTER", controller: "SELF", count: { up_to: 1 }, filter: { power_max: 5000 } },
          params: { amount: 3000 },
          duration: { type: "THIS_BATTLE" },
        }],
      }],
    };
    const run = (useSymbolCounter: boolean) => {
      const f = fixture();
      f.def("C1035-EVT", {
        type: "Event", cost: 0, power: null, counter: null,
        effectText: "[Counter] Up to 1 of your Characters with 5000 power or less gains +3000 power during this battle.",
      }, counterEvent);
      f.def("C1035-DEF4", { power: 4000 });
      f.def("C1035-ATK", { power: 9000 });
      const defender = f.put("C1035-DEF4", 0);
      const attacker = f.put("C1035-ATK", 1);
      const event = f.put("C1035-EVT", 0, "HAND");
      f.attackIntoCounterStep(attacker, defender);
      if (useSymbolCounter) f.symbolCounter(defender);
      const before = f.power(defender);
      f.act(0, { type: "USE_COUNTER_EVENT", cardInstanceId: event.instanceId, counterTargetInstanceId: defender.instanceId });
      const prompt = f.state.pendingPrompt?.options;
      if (prompt?.promptType === "SELECT_TARGET") {
        expect(prompt.validTargets).toContain(defender.instanceId);
        f.act(0, { type: "SELECT_TARGET", selectedInstanceIds: [defender.instanceId] });
      }
      return f.power(defender) - before;
    };
    // 4000 + 2000 Counter = 6000: above 5000, not a legal target.
    expect(run(true)).toBe(0);
    // Without the Counter, 4000 qualifies and gains +3000.
    expect(run(false)).toBe(3000);
  });

  it("a mid-battle Leader power condition sees Counter power on the attacked Leader", () => {
    const f = fixture();
    f.def("C1035-ATK", { power: 9000 });
    const attacker = f.put("C1035-ATK", 1);
    const leader = f.state.players[0].leader;
    f.attackIntoCounterStep(attacker, leader);
    const condition = { type: "LEADER_PROPERTY", controller: "SELF", property: { power: { operator: ">=", value: 7000 } } } as const;
    const ctx = { sourceCardInstanceId: leader.instanceId, controller: 0 as const, cardDb: f.db };
    expect(evaluateCondition(f.state, condition, ctx)).toBe(false);
    f.symbolCounter(leader);
    expect(f.power(leader)).toBe(5000 + CARDS.COUNTER.counter!);
    expect(evaluateCondition(f.state, condition, ctx)).toBe(true);
  });

  it("§4-12-1 set power to 0 reduces by current power, Counter included", () => {
    const f = fixture();
    f.def("C1035-DEF", { power: 4000 });
    f.def("C1035-ATK", { power: 9000 });
    const defender = f.put("C1035-DEF", 0);
    const attacker = f.put("C1035-ATK", 1);
    f.attackIntoCounterStep(attacker, defender);
    f.symbolCounter(defender);
    const result = executeSetPowerToZero(
      f.state, { type: "SET_POWER_TO_ZERO", target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } } },
      attacker.instanceId, 1, f.db, new Map(), [defender.instanceId],
    );
    expect(getEffectivePower(f.live(defender)!, f.db.get(defender.cardId)!, result.state, f.db)).toBe(0);
  });

  it("COPY_POWER of the battle target copies its Counter-raised power", () => {
    const f = fixture();
    f.def("C1035-DEF", { power: 4000 });
    f.def("C1035-ATK", { power: 9000 });
    f.def("C1035-COPY", { power: 1000 });
    const defender = f.put("C1035-DEF", 0);
    const copier = f.put("C1035-COPY", 1);
    const attacker = f.put("C1035-ATK", 1);
    f.attackIntoCounterStep(attacker, defender);
    f.symbolCounter(defender);
    const result = executeCopyPower(
      f.state,
      { type: "COPY_POWER", target: { type: "SELF" }, params: { source_target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 1 } } } },
      copier.instanceId, 1, f.db, new Map(), [defender.instanceId],
    );
    expect(getEffectivePower(f.live(copier)!, f.db.get(copier.cardId)!, result.state, f.db)).toBe(4000 + CARDS.COUNTER.counter!);
  });

  it("OP06-009 layer order: Counter power stays on top of a base-power setting made in the battle", () => {
    // qa_op06.md:26: Shuraiya's [On Block] makes its base power 8000, and a
    // Counter can then raise it further.
    const f = fixture();
    f.def("C1035-DEF", { power: 5000 });
    f.def("C1035-ATK", { power: 8000 });
    const defender = f.put("C1035-DEF", 0);
    const attacker = f.put("C1035-ATK", 1);
    f.attackIntoCounterStep(attacker, defender);
    const set = executeSetBasePower(
      f.state, { type: "SET_BASE_POWER", target: { type: "SELF" }, params: { value: 8000 } },
      defender.instanceId, 0, f.db, new Map(), [defender.instanceId],
    );
    const state = set.state;
    const counted: GameState = { ...state, turn: { ...state.turn, battle: { ...state.turn.battle!, counterPowerAdded: 2000 } } };
    const card = f.live(defender)!;
    expect(getEffectiveBasePower(card, f.db.get(card.cardId)!, counted, f.db)).toBe(8000);
    expect(getEffectivePower(card, f.db.get(card.cardId)!, counted, f.db)).toBe(10000);
  });
});
