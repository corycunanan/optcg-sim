/**
 * OPT-903 — OP05-001 Sabo: the substitute "give that Character −1000 power
 * during this turn" must land on the Character that would have been K.O.'d
 * (REPLACED_CARD), through the real action pipeline and prompt lifecycle with
 * the authored production registry.
 *
 * Card text (docs/cards/OP-05.md:6): "[DON!! x1] [Opponent's Turn] [Once Per
 * Turn] If your Character with 5000 power or more would be K.O.'d, you may give
 * that Character −1000 power during this turn instead of that Character being
 * K.O.'d."
 *
 * Rulings (docs/FAQs/qa_op05.md):
 * - Power that became 5000+ during the Counter Step qualifies (effective power).
 * - Declining does not resolve the effect, so [Once Per Turn] is not consumed.
 * - One opponent effect K.O.'ing two 5000+ Characters (OP01-094 Kaido On Play):
 *   the owner chooses both −1000 or neither.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { runPipeline } from "../engine/pipeline.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { getEffectivePower } from "../engine/modifiers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

interface PutOptions {
  zone?: CardInstance["zone"];
  state?: "ACTIVE" | "RESTED";
  don?: number;
}

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

  function put(id: string, owner: 0 | 1, options: PutOptions = {}) {
    if (!db.has(id)) def(id);
    const zone = options.zone ?? "CHARACTER";
    const instanceId = `${id}-${owner}-${serial++}`;
    const card: CardInstance = {
      instanceId,
      cardId: id,
      controller: owner,
      owner,
      zone,
      state: options.state ?? "ACTIVE",
      attachedDon: Array.from({ length: options.don ?? 0 }, (_, i) => ({
        instanceId: `don-${instanceId}-${i}`,
        state: "ACTIVE" as const,
        attachedTo: instanceId,
      })),
      turnPlayed: 1,
    };
    const p = state.players[owner];
    if (zone === "LEADER") p.leader = card;
    else if (zone === "HAND") p.hand.push(card);
    else p.characters[p.characters.findIndex((c) => !c)] = card;
    if (zone === "LEADER" || zone === "CHARACTER") {
      state = registerCardEnteredField(state, card, db.get(id)!);
    }
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

  function attack(attacker: CardInstance, target: CardInstance, options: { stopAt?: "COUNTER_STEP" } = {}) {
    const player = attacker.controller;
    const defender: 0 | 1 = player === 0 ? 1 : 0;
    state.turn.activePlayerIndex = player;
    const slot = state.players[target.controller].characters.find((c) => c?.instanceId === target.instanceId);
    if (slot) slot.state = "RESTED";
    act(player, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    });
    for (let guard = 0; guard < 10 && state.turn.battle && !state.pendingPrompt; guard++) {
      const sub = state.turn.battleSubPhase;
      if (sub === options.stopAt) return;
      if (sub === "ATTACK_STEP") act(player, { type: "PASS" });
      else act(defender, { type: "PASS" });
    }
  }

  const prompt = () => state.pendingPrompt?.options.promptType;
  const accept = () => act(state.pendingPrompt!.respondingPlayer, { type: "PLAYER_CHOICE", choiceId: "accept" });
  const decline = () => act(state.pendingPrompt!.respondingPlayer, { type: "PLAYER_CHOICE", choiceId: "skip" });
  const onField = (card: CardInstance) =>
    state.players[card.controller].characters.some((c) => c?.instanceId === card.instanceId);
  const trashIds = (player: 0 | 1) => state.players[player].trash.map((c) => c.cardId);
  const power = (card: CardInstance) => {
    const live =
      state.players[card.controller].characters.find((c) => c?.instanceId === card.instanceId) ??
      state.players[card.controller].leader;
    return getEffectivePower(live!, db.get(card.cardId)!, state, db);
  };

  return {
    db,
    def,
    put,
    act,
    attack,
    prompt,
    accept,
    decline,
    onField,
    trashIds,
    power,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

/** Player 0's Sabo Leader (with `don` DON!! given) and the opponent-turn context. */
function sabo(f: Fixture, don = 1) {
  f.def("OP05-001", { type: "Leader", cost: null, power: 5000 });
  const leader = f.put("OP05-001", 0, { zone: "LEADER", don });
  f.state.turn.activePlayerIndex = 1;
  return leader;
}

function protectedChar(f: Fixture, id: string, power: number) {
  f.def(id, { cost: 3, power });
  return f.put(id, 0);
}

/** Test-only "[Activate: Main] K.O. up to 1 Character" (either side). */
function koSource(id: string): EffectSchema {
  return {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: "ko",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: [{ type: "KO", target: { type: "CHARACTER", controller: "EITHER", count: { exact: 1 } } }],
      },
    ],
  };
}

function koWith(f: Fixture, player: 0 | 1, target: CardInstance) {
  f.state.turn.activePlayerIndex = player;
  const id = `OPT903-KO-${player}`;
  if (!f.db.has(id)) f.def(id, {}, koSource(id));
  const source = f.put(id, player);
  f.act(player, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "ko" });
  expect(f.prompt()).toBe("SELECT_TARGET");
  f.act(player, { type: "SELECT_TARGET", selectedInstanceIds: [target.instanceId] });
}

/** Test-only Kaido On Play stand-in: "K.O. up to 2 of your opponent's Characters" via ALL_OPPONENT_CHARACTERS. */
function koAllOpponent(f: Fixture) {
  const id = "OPT903-WIPE";
  f.def(id, {}, {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: "wipe",
        category: "activate",
        trigger: { keyword: "ACTIVATE_MAIN" },
        actions: [{ type: "KO", target: { type: "ALL_OPPONENT_CHARACTERS" } }],
      },
    ],
  });
  f.state.turn.activePlayerIndex = 1;
  const source = f.put(id, 1);
  f.act(1, { type: "ACTIVATE_EFFECT", cardInstanceId: source.instanceId, effectId: "wipe" });
}

describe("OP05-001 Sabo — effect K.O.", () => {
  it("accept: the Character stays on the field at −1000 for this turn, not in the trash", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-C5", 5000);

    koWith(f, 1, c);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt!.respondingPlayer).toBe(0);
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(c)).toBe(true);
    expect(f.trashIds(0)).not.toContain("OPT903-C5");
    expect(f.power(c)).toBe(4000);
  });

  it("a 7000 Character ends at 6000 (the modifier subtracts from effective power)", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-C7", 7000);
    koWith(f, 1, c);
    f.accept();
    expect(f.power(c)).toBe(6000);
  });

  it("the −1000 lasts this turn only: back at base power once the turn number advances", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-C7", 7000);
    koWith(f, 1, c);
    f.accept();
    expect(f.power(c)).toBe(6000);

    const startTurn = f.state.turn.number;
    for (let guard = 0; guard < 12 && f.state.turn.number === startTurn; guard++) {
      expect(f.state.pendingPrompt, "unexpected prompt while advancing").toBeNull();
      f.act(f.state.turn.activePlayerIndex, { type: "ADVANCE_PHASE" });
    }

    expect(f.state.turn.number).toBeGreaterThan(startTurn);
    expect(f.onField(c)).toBe(true);
    expect(f.power(c)).toBe(7000);
  });

  it("decline: the Character is K.O.'d and keeps no modifier", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-C5", 5000);

    koWith(f, 1, c);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.decline();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(c)).toBe(false);
    expect(f.trashIds(0)).toContain("OPT903-C5");
  });

  it("[Once Per Turn]: after an accepted use, a second eligible K.O. the same turn is not replaced", () => {
    const f = fixture();
    sabo(f);
    const first = protectedChar(f, "OPT903-FIRST", 6000);
    const second = protectedChar(f, "OPT903-SECOND", 6000);

    koWith(f, 1, first);
    f.accept();
    expect(f.onField(first)).toBe(true);
    expect(f.power(first)).toBe(5000);

    koWith(f, 1, second);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(second)).toBe(false);
    expect(f.trashIds(0)).toContain("OPT903-SECOND");
    expect(f.power(first)).toBe(5000);
  });

  it("qa_op05: declining does not consume [Once Per Turn]; a later eligible K.O. may be replaced", () => {
    const f = fixture();
    sabo(f);
    const first = protectedChar(f, "OPT903-FIRST", 6000);
    const second = protectedChar(f, "OPT903-SECOND", 6000);

    koWith(f, 1, first);
    f.decline();
    expect(f.onField(first)).toBe(false);

    koWith(f, 1, second);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();
    expect(f.onField(second)).toBe(true);
    expect(f.power(second)).toBe(5000);
  });

  describe("ineligible", () => {
    it("power below 5000 is not offered", () => {
      const f = fixture();
      sabo(f);
      const c = protectedChar(f, "OPT903-C4", 4000);
      koWith(f, 1, c);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.trashIds(0)).toContain("OPT903-C4");
    });

    it("4900 is not offered", () => {
      const f = fixture();
      sabo(f);
      const c = protectedChar(f, "OPT903-C4900", 4900);
      koWith(f, 1, c);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.onField(c)).toBe(false);
    });

    it("on your own turn is not offered", () => {
      const f = fixture();
      sabo(f);
      const c = protectedChar(f, "OPT903-C5", 5000);
      koWith(f, 0, c);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.trashIds(0)).toContain("OPT903-C5");
    });

    it("with no DON!! given to the Leader is not offered", () => {
      const f = fixture();
      sabo(f, 0);
      const c = protectedChar(f, "OPT903-C5", 5000);
      koWith(f, 1, c);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.trashIds(0)).toContain("OPT903-C5");
    });

    it("an opponent's Character is not protected", () => {
      const f = fixture();
      sabo(f);
      f.def("OPT903-THEIRS", { cost: 3, power: 6000 });
      const theirs = f.put("OPT903-THEIRS", 1);
      koWith(f, 1, theirs);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.trashIds(1)).toContain("OPT903-THEIRS");
    });
  });

  describe("Kaido On Play: two 5000+ Characters K.O.'d at once (qa_op05.md)", () => {
    it("accept: both stay on the field at −1000", () => {
      const f = fixture();
      sabo(f);
      const a = protectedChar(f, "OPT903-A", 6000);
      const b = protectedChar(f, "OPT903-B", 7000);
      koAllOpponent(f);
      expect(f.prompt()).toBe("OPTIONAL_EFFECT");
      f.accept();

      expect(f.state.pendingPrompt).toBeNull();
      expect(f.onField(a)).toBe(true);
      expect(f.onField(b)).toBe(true);
      expect(f.power(a)).toBe(5000);
      expect(f.power(b)).toBe(6000);
    });

    it("decline: both are K.O.'d", () => {
      const f = fixture();
      sabo(f);
      const a = protectedChar(f, "OPT903-A", 6000);
      const b = protectedChar(f, "OPT903-B", 7000);
      koAllOpponent(f);
      expect(f.prompt()).toBe("OPTIONAL_EFFECT");
      f.decline();

      expect(f.onField(a)).toBe(false);
      expect(f.onField(b)).toBe(false);
    });
  });
});

describe("OP05-001 Sabo — battle K.O.", () => {
  function opponentAttacker(f: Fixture, power = 7000) {
    f.def("OPT903-ATK", { cost: 5, power });
    return f.put("OPT903-ATK", 1);
  }

  it("accept: the Character survives at −1000 and the battle ends normally", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-C5", 5000);
    const atk = opponentAttacker(f);

    f.attack(atk, c); // 7000 vs 5000
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.turn.battle).toBeNull();
    expect(f.onField(c)).toBe(true);
    expect(f.trashIds(0)).not.toContain("OPT903-C5");
    expect(f.power(c)).toBe(4000);
    expect(f.onField(atk)).toBe(true);
  });

  it("decline: the Character is K.O.'d and the battle ends", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-C5", 5000);
    const atk = opponentAttacker(f);

    f.attack(atk, c);
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.decline();

    expect(f.state.turn.battle).toBeNull();
    expect(f.onField(c)).toBe(false);
    expect(f.trashIds(0)).toContain("OPT903-C5");
  });

  // Known engine gap (tracked by OPT-909): the WOULD_BE_KO
  // power_min filter reads getEffectivePower, which excludes the Counter Step
  // bonus stored on BattleContext.counterPowerAdded, so the Character reads
  // 4000 and Sabo is never offered. Fails loudly once the filter uses battle
  // power (getBattleDefenderPower) for the defender.
  it.fails("qa_op05: base 4000 raised to 6000 in the Counter Step qualifies (effective power)", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-BASE4", 4000);
    const atk = opponentAttacker(f, 6000);
    const counter = f.put(CARDS.COUNTER.id, 0, { zone: "HAND" });

    f.attack(atk, c, { stopAt: "COUNTER_STEP" });
    expect(f.state.turn.battleSubPhase).toBe("COUNTER_STEP");
    f.act(0, { type: "USE_COUNTER", cardInstanceId: counter.instanceId, counterTargetInstanceId: c.instanceId });
    f.act(0, { type: "PASS" });

    // 4000 + 2000 = 6000 vs 6000: the attacker wins, so the Character would be K.O.'d.
    expect(f.prompt()).toBe("OPTIONAL_EFFECT");
    f.accept();

    expect(f.state.turn.battle).toBeNull();
    expect(f.onField(c)).toBe(true);
  });

  it("base 4000 never raised is not offered", () => {
    const f = fixture();
    sabo(f);
    const c = protectedChar(f, "OPT903-BASE4", 4000);
    const atk = opponentAttacker(f);

    f.attack(atk, c);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(c)).toBe(false);
  });

  it("[Once Per Turn]: a second eligible battle K.O. after an accepted one is not replaced", () => {
    const f = fixture();
    sabo(f);
    const first = protectedChar(f, "OPT903-FIRST", 5000);
    const second = protectedChar(f, "OPT903-SECOND", 5000);
    const atk = opponentAttacker(f, 9000);

    f.attack(atk, first);
    f.accept();
    expect(f.onField(first)).toBe(true);

    f.state.players[1].characters.forEach((c) => {
      if (c) c.state = "ACTIVE";
    });
    f.attack(atk, second);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(second)).toBe(false);
  });
});
