/**
 * OPT-1032 — "If you would take damage ... instead" (WOULD_TAKE_DAMAGE).
 *
 * Card text (docs/cards/EB-05.md):
 * - EB05-052 Gloriosa: "If you would take damage, you may trash this
 *   Character instead."
 * - EB03-055 Nico Robin: "[Opponent's Turn] [On K.O.] You may deal 1 damage
 *   to your opponent."
 * - ST13-003 Monkey.D.Luffy (Leader): "Your face-up Life cards are placed at
 *   the bottom of your deck instead of being added to your hand, according to
 *   the rules."
 *
 * FAQ (docs/FAQs/qa_eb05.md, EB05-052):
 * - At 0 Life, a winning attack on the Leader: Gloriosa can be trashed
 *   instead, so the player does not lose the game.
 * - [Double Attack] (2 damage): one replacement negates both points.
 * - Effect damage, such as EB03-055's [On K.O.]: Gloriosa can negate it.
 *
 * Rules: 8-1-3-4-1 (a declined optional replacement leaves the original event),
 * 9-2-1-1 (damage at 0 Life defeats), 4-6-2 (damage is dealt per point).
 *
 * Effects come from the production schema registry. Actions go through the
 * SessionCoordinator, the real pipeline and resumePromptLifecycle.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, LifeCard } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { SessionCoordinator } from "../session/coordinator.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { parseStoredSession } from "../session/persistence.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { battleContinuation } from "./trigger-window-helpers.js";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  const coordinator = new SessionCoordinator();
  let serial = 0;

  function data(id: string, overrides: Partial<CardData> = {}) {
    const schema = getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: schema?.card_name ?? id,
      effectText: "",
      effectSchema: schema ?? null,
      ...overrides,
    });
  }

  function put(id: string, controller: 0 | 1, zone: CardInstance["zone"] = "CHARACTER") {
    if (!db.has(id)) data(id);
    const card: CardInstance = {
      cardId: id,
      instanceId: `${id}-${controller}-${serial++}`,
      owner: controller,
      controller,
      zone,
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
    };
    const p = state.players[controller];
    if (zone === "LEADER") p.leader = card;
    else p.characters[p.characters.findIndex((c) => !c)] = card;
    state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  function send(player: 0 | 1, action: GameAction): { kind: string; reason?: string } {
    const promptId = state.pendingPrompt?.promptId;
    const withId =
      promptId && (action.type === "PLAYER_CHOICE" || action.type === "SELECT_TARGET")
        ? ({ ...action, promptId } as GameAction)
        : action;
    const result = coordinator.executeAction(state, [], player, withId, db);
    if (result.kind === "resume") {
      const resumed = resumePromptLifecycle(result.state, withId, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => coordinator.advanceStartOfTurn(s, db),
      });
      if (resumed.responseRejected) return { kind: "reject", reason: "responseRejected" };
      state = resumed.state;
      return { kind: "resume" };
    }
    if (result.kind === "applied") state = result.state;
    return { kind: result.kind, reason: "reason" in result ? result.reason : undefined };
  }

  function ok(player: 0 | 1, action: GameAction) {
    const r = send(player, action);
    expect(r.kind, `${action.type}: ${r.reason}`).not.toBe("reject");
  }

  const responder = () => state.pendingPrompt!.respondingPlayer;
  const accept = () => ok(responder(), { type: "PLAYER_CHOICE", choiceId: "accept" });
  const decline = () => ok(responder(), { type: "PLAYER_CHOICE", choiceId: "skip" });

  /** Player 1's `attacker` attacks `target`; both players pass until a prompt or the battle ends. */
  function attack(attacker: CardInstance, target: CardInstance) {
    const player = attacker.controller;
    state.turn.activePlayerIndex = player;
    if (target.zone === "CHARACTER")
      state.players[target.controller].characters.find((c) => c?.instanceId === target.instanceId)!.state =
        "RESTED";
    ok(player, {
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: target.instanceId,
    });
    while (!state.pendingPrompt && state.turn.battle) {
      const passer = state.turn.battleSubPhase === "ATTACK_STEP" ? player : target.controller;
      ok(passer, { type: "PASS" });
    }
  }

  function setLife(player: 0 | 1, faces: LifeCard["face"][]) {
    state.players[player].life = faces.map((face, i) => ({
      instanceId: `life-${player}-${i}`,
      cardId: CARDS.VANILLA.id,
      face,
    }));
  }

  const onField = (card: CardInstance) =>
    state.players[card.controller].characters.some((c) => c?.instanceId === card.instanceId);
  const inTrash = (card: CardInstance) =>
    state.players[card.owner].trash.some((c) => c.cardId === card.cardId);
  const events = (type: string) => state.eventLog.filter((e) => e.type === type);

  return {
    db,
    data,
    put,
    send,
    ok,
    accept,
    decline,
    attack,
    setLife,
    onField,
    inTrash,
    events,
    get state() {
      return state;
    },
    set state(next: GameState) {
      state = next;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function gloriosa(f: Fixture, controller: 0 | 1 = 0) {
  f.data("EB05-052", { cost: 4, power: 5000, counter: 1000 });
  return f.put("EB05-052", controller);
}

/** A 7000-power player 1 Character: wins against a 5000-power Leader. */
function attacker(f: Fixture) {
  if (!f.db.has("P1-ATTACKER")) f.data("P1-ATTACKER", { power: 7000 });
  return f.put("P1-ATTACKER", 1);
}

function doubleAttacker(f: Fixture) {
  return f.put(CARDS.DOUBLE_ATK.id, 1);
}

/** The pending prompt is Gloriosa's offer to player 0. */
function expectDamageOffer(f: Fixture) {
  expect(f.state.pendingPrompt?.options.promptType).toBe("OPTIONAL_EFFECT");
  expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
  const top = f.state.effectStack.at(-1);
  expect(top?.replacement).toMatchObject({
    event: "WOULD_TAKE_DAMAGE",
    targetInstanceId: f.state.players[0].leader.instanceId,
  });
}

function expectBattleClosedOnce(f: Fixture) {
  expect(f.state.pendingPrompt).toBeNull();
  expect(f.state.turn.battle).toBeNull();
  expect(f.state.effectStack).toEqual([]);
  expect(f.events("END_OF_BATTLE")).toHaveLength(1);
}

/** The real writer's object, then the real reader. */
function roundTrip(f: Fixture) {
  f.state = parseStoredSession(
    JSON.parse(JSON.stringify({ state: toPersistedGameState(f.state), cardDb: Object.fromEntries(f.db), mode: "PVP" })),
  ).state;
}

describe("EB05-052 Gloriosa — schema", () => {
  it("is fully encoded: an optional WOULD_TAKE_DAMAGE replacement for its controller's Leader plus the [Trigger]", () => {
    const schema = getEffectSchema("EB05-052")!;
    expect(schema.effects.map((block) => block.id)).toEqual(["would_take_damage_trash_self", "trigger_draw_trash"]);
    expect(schema.effects[0]).toMatchObject({
      category: "replacement",
      replaces: { event: "WOULD_TAKE_DAMAGE", target_filter: { controller: "SELF", card_type: "LEADER" } },
      replacement_actions: [{ type: "TRASH_CARD", target: { type: "SELF" } }],
      flags: { optional: true },
    });
  });
});

describe("EB05-052 Gloriosa — battle damage", () => {
  it("FAQ: one replacement negates both points of a [Double Attack]", () => {
    const f = fixture();
    const glo = gloriosa(f);
    f.setLife(0, ["DOWN", "DOWN", "DOWN"]);
    const life = f.state.players[0].life.map((c) => c.instanceId);

    f.attack(doubleAttacker(f), f.state.players[0].leader);
    expectDamageOffer(f);
    expect(battleContinuation(f.state)).toMatchObject({
      stage: "CHARACTER_KO_REPLACEMENT",
      targetInstanceId: f.state.players[0].leader.instanceId,
    });
    expect(f.state.turn.battle?.damagesRemaining).toBe(2);
    f.accept();

    expect(f.onField(glo)).toBe(false);
    expect(f.inTrash(glo)).toBe(true);
    expect(f.state.players[0].life.map((c) => c.instanceId)).toEqual(life);
    expect(f.state.players[0].hand).toHaveLength(0);
    expect(f.events("DAMAGE_DEALT")).toHaveLength(0);
    expect(f.events("CHARACTER_BATTLES")).toHaveLength(1);
    expectBattleClosedOnce(f);
  });

  it("decline: both points of the [Double Attack] are dealt and Gloriosa stays (8-1-3-4-1)", () => {
    const f = fixture();
    const glo = gloriosa(f);
    f.setLife(0, ["DOWN", "DOWN", "DOWN"]);

    f.attack(doubleAttacker(f), f.state.players[0].leader);
    expectDamageOffer(f);
    f.decline();

    expect(f.onField(glo)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(1);
    expect(f.state.players[0].hand).toHaveLength(2);
    expect(f.events("DAMAGE_DEALT")).toHaveLength(2);
    expectBattleClosedOnce(f);
  });

  it("FAQ: at 0 Life, accepting prevents the loss the attack would cause", () => {
    const f = fixture();
    const glo = gloriosa(f);
    f.setLife(0, []);

    f.attack(attacker(f), f.state.players[0].leader);
    expectDamageOffer(f);
    f.accept();

    expect(f.state.status).toBe("IN_PROGRESS");
    expect(f.inTrash(glo)).toBe(true);
    expectBattleClosedOnce(f);
  });

  it("at 0 Life, declining loses the game (9-2-1-1)", () => {
    const f = fixture();
    gloriosa(f);
    f.setLife(0, []);

    f.attack(attacker(f), f.state.players[0].leader);
    expectDamageOffer(f);
    f.decline();

    expect(f.state.status).not.toBe("IN_PROGRESS");
    expect(f.state.winner).toBe(1);
  });

  it("only protects its controller: the opponent's Gloriosa is not offered", () => {
    const f = fixture();
    gloriosa(f, 1);
    f.setLife(0, ["DOWN", "DOWN"]);

    f.attack(attacker(f), f.state.players[0].leader);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.players[0].life).toHaveLength(1);
    expectBattleClosedOnce(f);
  });

  it("the paused offer survives the persisted-state writer and reader, then resumes once", () => {
    const f = fixture();
    const glo = gloriosa(f);
    f.setLife(0, ["DOWN", "DOWN", "DOWN"]);

    f.attack(doubleAttacker(f), f.state.players[0].leader);
    expectDamageOffer(f);
    roundTrip(f);
    expectDamageOffer(f);
    f.accept();

    expect(f.inTrash(glo)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(3);
    expectBattleClosedOnce(f);
  });
});

describe("EB05-052 Gloriosa — ordering against ST13-003's face-up Life rule", () => {
  function luffyLeader(f: Fixture) {
    f.data("ST13-003", { type: "Leader", cost: null, power: 5000, counter: null, life: 5 });
    return f.put("ST13-003", 0, "LEADER");
  }

  it("the damage replacement is considered first: accepted, no face-up Life card moves", () => {
    const f = fixture();
    luffyLeader(f);
    const glo = gloriosa(f);
    f.setLife(0, ["UP", "UP"]);
    const deck = f.state.players[0].deck.length;

    f.attack(attacker(f), f.state.players[0].leader);
    expectDamageOffer(f);
    f.accept();

    expect(f.inTrash(glo)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(2);
    expect(f.state.players[0].deck).toHaveLength(deck);
    expectBattleClosedOnce(f);
  });

  it("declined: the damage is taken and ST13-003 sends the face-up Life card to the deck bottom", () => {
    const f = fixture();
    luffyLeader(f);
    gloriosa(f);
    f.setLife(0, ["UP", "UP"]);
    const deck = f.state.players[0].deck.length;
    const top = f.state.players[0].life[0].instanceId;

    f.attack(attacker(f), f.state.players[0].leader);
    expectDamageOffer(f);
    f.decline();

    expect(f.state.players[0].life).toHaveLength(1);
    expect(f.state.players[0].life[0].instanceId).not.toBe(top);
    expect(f.state.players[0].hand).toHaveLength(0);
    expect(f.state.players[0].deck).toHaveLength(deck + 1);
    expect(f.state.players[0].deck.at(-1)?.cardId).toBe(CARDS.VANILLA.id);
    expectBattleClosedOnce(f);
  });
});

describe("EB05-052 Gloriosa — effect damage", () => {
  /** Player 0's attacker K.O.s player 1's EB03-055 Robin on player 0's turn; Robin's controller accepts its [On K.O.]. */
  function robinOnKO(f: Fixture) {
    f.data("EB03-055", { cost: 4, power: 5000, counter: 1000 });
    const robin = f.put("EB03-055", 1);
    f.data("P0-ATTACKER", { power: 7000 });
    f.attack(f.put("P0-ATTACKER", 0), robin);
    // Robin's optional [On K.O.] "You may deal 1 damage to your opponent."
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(1);
    f.accept();
  }

  it("FAQ: EB03-055's [On K.O.] damage can be negated by trashing Gloriosa", () => {
    const f = fixture();
    const glo = gloriosa(f);
    f.setLife(0, ["DOWN", "DOWN"]);
    robinOnKO(f);
    expectDamageOffer(f);
    f.accept();

    expect(f.inTrash(glo)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(2);
    expect(f.events("DAMAGE_DEALT")).toHaveLength(0);
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toEqual([]);
  });

  it("decline: the [On K.O.] damage is dealt after the offer (8-1-3-4-1)", () => {
    const f = fixture();
    const glo = gloriosa(f);
    f.setLife(0, ["DOWN", "DOWN"]);
    robinOnKO(f);
    expectDamageOffer(f);
    f.decline();

    expect(f.onField(glo)).toBe(true);
    expect(f.state.players[0].life).toHaveLength(1);
    expect(f.state.players[0].hand).toHaveLength(1);
    const dealt = f.events("DAMAGE_DEALT");
    expect(dealt).toHaveLength(1);
    expect(dealt[0].payload).toMatchObject({ damageSource: "EFFECT", damagedPlayerIndex: 0 });
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.effectStack).toEqual([]);
  });

  /** Player 0's Leader gains an [Activate: Main] that runs `actions`. */
  function activate(f: Fixture, actions: EffectSchema["effects"][number]["actions"]) {
    const leader = f.state.players[0].leader;
    const data = f.db.get(leader.cardId)!;
    f.db.set(leader.cardId, {
      ...data,
      effectSchema: {
        card_id: leader.cardId,
        card_name: data.name,
        card_type: "Leader",
        effects: [{ id: "damage", category: "activate", trigger: { keyword: "ACTIVATE_MAIN" }, actions }],
      },
    });
    f.ok(0, { type: "ACTIVATE_EFFECT", cardInstanceId: leader.instanceId, effectId: "damage" });
  }

  for (const choice of ["accept", "decline"] as const) {
    it(`self-inflicted damage: ${choice}, then the rest of the chain resolves once`, () => {
      const f = fixture();
      const glo = gloriosa(f);
      f.setLife(0, ["DOWN", "DOWN", "DOWN"]);
      const deck = f.state.players[0].deck.length;
      activate(f, [
        { type: "SELF_TAKE_DAMAGE", params: { amount: 2 } },
        { type: "DRAW", params: { amount: 1 } },
      ]);
      expectDamageOffer(f);
      roundTrip(f);
      if (choice === "accept") f.accept();
      else f.decline();

      expect(f.inTrash(glo)).toBe(choice === "accept");
      expect(f.state.players[0].life).toHaveLength(choice === "accept" ? 3 : 1);
      expect(f.state.players[0].deck).toHaveLength(deck - 1);
      // Drawn card plus, on decline, the two Life cards.
      expect(f.state.players[0].hand).toHaveLength(choice === "accept" ? 1 : 3);
      expect(f.events("DAMAGE_DEALT")).toHaveLength(choice === "accept" ? 0 : 2);
      expect(f.state.pendingPrompt).toBeNull();
      expect(f.state.effectStack).toEqual([]);
    });
  }

  it("declined at 0 Life, self-inflicted effect damage defeats (9-2-1-1)", () => {
    const f = fixture();
    gloriosa(f);
    f.setLife(0, []);
    activate(f, [{ type: "SELF_TAKE_DAMAGE", params: { amount: 1 } }]);
    expectDamageOffer(f);
    f.decline();

    expect(f.state.status).not.toBe("IN_PROGRESS");
    expect(f.state.winner).toBe(1);
  });
});
