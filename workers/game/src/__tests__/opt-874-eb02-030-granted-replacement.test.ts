/**
 * OPT-874 — EB02-030 [Counter] grants a turn-long battle K.O. replacement
 * through APPLY_REPLACEMENT, and the shared replacement scan finds it.
 *
 * Card text (docs/cards/EB-02.md): "[Counter] If any of your Characters would
 * be K.O.'d in battle during this turn, you may trash 1 card from your hand
 * instead."
 *
 * Rulings and rules:
 * - qa_eb02 EB02-030: a Character played after the [Counter] resolved is not
 *   protected. The protected Characters are the ones on the field then.
 * - Rules §7-1-4-1-2: only the battle-result K.O. is "K.O.'d in battle", so an
 *   effect K.O. that turn is not replaced.
 * - Rules §6-6-3 / OPT-232: a replacement whose substitute cannot resolve
 *   (no card in hand to trash) is not offered.
 *
 * The EB02-030 schema comes from the production registry; the fixture only
 * supplies card stats.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { runPipeline } from "../engine/pipeline.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { parseStoredSession } from "../session/persistence.js";
import { toPersistedGameState } from "../session/game-state-schema.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const EB02_030 = "EB02-030";

function fixture() {
  const db = createTestCardDb();
  let state = createBattleReadyState(db);
  state.players.forEach((p) => {
    p.characters = padChars([]);
    p.hand = [];
  });
  let serial = 0;

  function data(id: string, overrides: Partial<CardData> = {}, schema?: EffectSchema) {
    const authored = schema ?? getEffectSchema(id);
    db.set(id, {
      ...CARDS.VANILLA,
      id,
      name: authored?.card_name ?? id,
      effectText: "",
      counter: null,
      effectSchema: authored ?? null,
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
    else if (zone === "CHARACTER") p.characters[p.characters.findIndex((c) => !c)] = card;
    else if (zone === "HAND") p.hand.push(card);
    if (zone === "LEADER" || zone === "CHARACTER")
      state = registerCardEnteredField(state, card, db.get(id)!);
    return card;
  }

  function act(action: GameAction, player: 0 | 1 = state.turn.activePlayerIndex) {
    if (state.pendingPrompt) {
      const r = resumePromptLifecycle(state, action, db, {
        drainPregame: (s) => s,
        advanceStartOfTurn: (s) => s,
      });
      expect(r.responseRejected, JSON.stringify({ action, prompt: state.pendingPrompt?.options })).toBe(false);
      state = r.state;
      return;
    }
    const r = runPipeline(state, action, db, player);
    expect(r.valid, `${action.type}: ${r.error}`).toBe(true);
    state = r.state;
  }

  function persist() {
    state = parseStoredSession(
      JSON.parse(JSON.stringify({ state: toPersistedGameState(state), cardDb: Object.fromEntries(db), mode: "PVP" })),
    ).state;
  }

  function giveDon(player: 0 | 1, count: number) {
    state.players[player].donCostArea = Array.from({ length: count }, (_, i) => ({
      instanceId: `don-p${player}-x${serial++}-${i}`,
      state: "ACTIVE" as const,
      attachedTo: null,
    }));
  }

  /** Player 1's `attacker` attacks player 0's rested `target`, stopping in the Counter Step. */
  function attackToCounterStep(attacker: CardInstance, target: CardInstance) {
    state.turn.activePlayerIndex = 1;
    const slot = state.players[0].characters.find((c) => c?.instanceId === target.instanceId)!;
    slot.state = "RESTED";
    // Test shortcut: let one attacker attack again in the same turn.
    const attacking = state.players[1].characters.find((c) => c?.instanceId === attacker.instanceId)!;
    attacking.state = "ACTIVE";
    act({ type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId }, 1);
    for (let guard = 0; guard < 6 && state.turn.battleSubPhase !== "COUNTER_STEP"; guard++) {
      act({ type: "PASS" }, state.turn.battleSubPhase === "ATTACK_STEP" ? 1 : 0);
    }
    expect(state.turn.battleSubPhase).toBe("COUNTER_STEP");
  }

  /** Pass the defender's Counter Step and any remaining battle windows. */
  function finishBattle() {
    for (let guard = 0; guard < 6 && state.turn.battle && !state.pendingPrompt; guard++) {
      act({ type: "PASS" }, state.turn.battleSubPhase === "ATTACK_STEP" ? 1 : 0);
    }
  }

  /** Player 0 plays EB02-030 from hand in the Counter Step on `counterTarget`. */
  function playEb02030(counterTarget: CardInstance) {
    data(EB02_030, {
      type: "Event",
      cost: 1,
      power: null,
      counter: null,
      color: ["Blue"],
      effectText:
        "[Counter] If any of your Characters would be K.O.'d in battle during this turn, you may trash 1 card from your hand instead.\n[Trigger] Draw 1 card.",
    });
    giveDon(0, 1);
    const event = put(EB02_030, 0, "HAND");
    act({ type: "USE_COUNTER_EVENT", cardInstanceId: event.instanceId, counterTargetInstanceId: counterTarget.instanceId }, 0);
    expect(state.pendingPrompt, "EB02-030 resolves without a prompt").toBeNull();
    return event;
  }

  const granted = () =>
    // The Event changes instance id as it moves to the trash; the granted
    // replacement is the only resolved-output (category "auto") replacement.
    state.activeEffects.filter(
      (effect) =>
        effect.category === "auto" &&
        effect.modifiers.some((m) => m.type === "REPLACEMENT_EFFECT"),
    );
  const promptType = () => state.pendingPrompt?.options.promptType;
  const onField = (card: CardInstance) =>
    state.players[card.controller].characters.some((c) => c?.instanceId === card.instanceId);
  const trashIds = (player: 0 | 1) => state.players[player].trash.map((c) => c.cardId);
  const handIds = (player: 0 | 1) => state.players[player].hand.map((c) => c.cardId);

  return {
    db,
    data,
    put,
    act,
    persist,
    attackToCounterStep,
    finishBattle,
    playEb02030,
    granted,
    promptType,
    onField,
    trashIds,
    handIds,
    accept: () => act({ type: "PLAYER_CHOICE", choiceId: "accept" }),
    decline: () => act({ type: "PLAYER_CHOICE", choiceId: "skip" }),
    get state() {
      return state;
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

/** Player 0's 2000-power Character and player 1's 7000-power attacker. */
function setup(f: Fixture) {
  f.data("OPT874-MINE", { cost: 2, power: 2000 });
  f.data("OPT874-ATK", { cost: 5, power: 7000 });
  const mine = f.put("OPT874-MINE", 0);
  const attacker = f.put("OPT874-ATK", 1);
  return { mine, attacker };
}

/** Accept the replacement, then pay the TRASH_FROM_HAND substitute with `card` if asked to choose. */
function acceptPaying(f: Fixture, card: CardInstance) {
  f.accept();
  if (f.promptType()) {
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [card.instanceId] }, 0);
  }
}

describe("EB02-030 — the [Counter] registers a battle K.O. replacement", () => {
  it("registers a turn-long replacement protecting your Characters on the field", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    f.data("OPT874-SECOND", { cost: 2, power: 2000 });
    const second = f.put("OPT874-SECOND", 0);
    f.put("OPT874-SPARE", 0, "HAND");

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);

    const [effect] = f.granted();
    expect(f.granted()).toHaveLength(1);
    expect(effect.controller).toBe(0);
    expect(effect.duration).toEqual({ type: "THIS_TURN" });
    expect(effect.expiresAt).toEqual({ wave: "END_OF_TURN", turn: f.state.turn.number });
    // Only player 0's Characters: the attacker (player 1's) is not covered.
    expect([...effect.appliesTo].sort()).toEqual([mine.instanceId, second.instanceId].sort());
    expect(effect.modifiers[0].params).toMatchObject({
      trigger: "WOULD_BE_KO",
      cause_filter: { by: "BATTLE" },
      target_filter: { controller: "SELF", card_type: "CHARACTER" },
      optional: true,
      once_per_turn: false,
    });
  });

  it("accept: trashing 1 card from hand keeps the Character on the field", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    const spare = f.put("OPT874-SPARE", 0, "HAND");

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    f.finishBattle();

    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    expect(f.state.pendingPrompt?.respondingPlayer).toBe(0);
    acceptPaying(f, spare);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.state.turn.battle).toBeNull();
    expect(f.onField(mine)).toBe(true);
    expect(f.trashIds(0)).toContain("OPT874-SPARE");
    expect(f.trashIds(0)).not.toContain("OPT874-MINE");
    expect(f.handIds(0)).toEqual([]);
  });

  it("decline: the Character is K.O.'d and the hand is untouched", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    f.put("OPT874-SPARE", 0, "HAND");

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    f.finishBattle();

    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    f.decline();

    expect(f.state.turn.battle).toBeNull();
    expect(f.onField(mine)).toBe(false);
    expect(f.trashIds(0)).toContain("OPT874-MINE");
    expect(f.handIds(0)).toEqual(["OPT874-SPARE"]);
  });

  it("is not once per turn: a second battle K.O. the same turn is offered again", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    f.data("OPT874-SECOND", { cost: 2, power: 2000 });
    const second = f.put("OPT874-SECOND", 0);
    const spare1 = f.put("OPT874-SPARE1", 0, "HAND");
    const spare2 = f.put("OPT874-SPARE2", 0, "HAND");
    f.data("OPT874-ATK2", { cost: 5, power: 7000 });
    const attacker2 = f.put("OPT874-ATK2", 1);

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    f.finishBattle();
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    acceptPaying(f, spare1);
    expect(f.onField(mine)).toBe(true);

    f.attackToCounterStep(attacker2, second);
    f.finishBattle();
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    acceptPaying(f, spare2);

    expect(f.onField(second)).toBe(true);
    expect(f.trashIds(0)).toEqual(expect.arrayContaining(["OPT874-SPARE1", "OPT874-SPARE2"]));
  });

  it("persisted resume: a JSON round-trip with the offer pending resolves once", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    const spare = f.put("OPT874-SPARE", 0, "HAND");

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    f.persist();
    f.finishBattle();
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    f.persist();
    acceptPaying(f, spare);

    expect(f.state.turn.battle).toBeNull();
    expect(f.onField(mine)).toBe(true);
    expect(f.trashIds(0).filter((id) => id === "OPT874-SPARE")).toHaveLength(1);
  });
});

describe("EB02-030 — not offered", () => {
  it("with an empty hand: the Character is K.O.'d", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    expect(f.handIds(0)).toEqual([]);
    f.finishBattle();

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(mine)).toBe(false);
    expect(f.trashIds(0)).toContain("OPT874-MINE");
  });

  it("for an effect K.O. the same turn", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    f.data("OPT874-OTHER", { cost: 2, power: 2000 });
    const other = f.put("OPT874-OTHER", 0);
    f.put("OPT874-SPARE", 0, "HAND");
    // Player 1's test-only "[Activate: Main] K.O. up to 1 of your opponent's Characters".
    f.data(
      "OPT874-KO",
      {},
      {
        card_id: "OPT874-KO",
        card_name: "OPT874-KO",
        card_type: "Character",
        effects: [
          {
            id: "ko",
            category: "activate",
            trigger: { keyword: "ACTIVATE_MAIN" },
            actions: [{ type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } }],
          },
        ],
      },
    );
    const koSource = f.put("OPT874-KO", 1);

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    f.finishBattle();
    // The battle K.O. of `mine` is offered; decline it.
    expect(f.promptType()).toBe("OPTIONAL_EFFECT");
    f.decline();
    expect(f.granted()[0].appliesTo).toEqual([other.instanceId]);

    f.act({ type: "ACTIVATE_EFFECT", cardInstanceId: koSource.instanceId, effectId: "ko" }, 1);
    expect(f.promptType()).toBe("SELECT_TARGET");
    f.act({ type: "SELECT_TARGET", selectedInstanceIds: [other.instanceId] }, 1);

    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(other)).toBe(false);
    expect(f.handIds(0)).toEqual(["OPT874-SPARE"]);
  });

  it("after the turn ends", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    f.data("OPT874-OTHER", { cost: 2, power: 2000 });
    const other = f.put("OPT874-OTHER", 0);
    f.put("OPT874-SPARE", 0, "HAND");

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    f.finishBattle();
    f.decline();
    expect(f.granted()).toHaveLength(1);

    const startTurn = f.state.turn.number;
    for (let guard = 0; guard < 12 && f.state.turn.number === startTurn; guard++) {
      expect(f.state.pendingPrompt, "unexpected prompt while advancing").toBeNull();
      f.act({ type: "ADVANCE_PHASE" });
    }
    expect(f.state.turn.number).toBeGreaterThan(startTurn);
    expect(f.granted()).toHaveLength(0);

    // On to player 1's next Main Phase.
    for (
      let guard = 0;
      guard < 24 && !(f.state.turn.activePlayerIndex === 1 && f.state.turn.phase === "MAIN");
      guard++
    ) {
      expect(f.state.pendingPrompt, "unexpected prompt while advancing").toBeNull();
      f.act({ type: "ADVANCE_PHASE" });
    }
    expect(f.state.turn.activePlayerIndex).toBe(1);
    expect(f.state.turn.phase).toBe("MAIN");
    expect(f.state.turn.number).toBeGreaterThan(startTurn);
    // Player 0 still holds a card to trash, so only expiry blocks the offer.
    expect(f.handIds(0).length).toBeGreaterThan(0);

    // A later battle K.O. of a Character that was protected is not replaced.
    f.attackToCounterStep(attacker, other);
    f.finishBattle();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(other)).toBe(false);
  });

  it("for a Character that entered the field after the [Counter] resolved (qa_eb02)", () => {
    const f = fixture();
    const { mine, attacker } = setup(f);
    f.put("OPT874-SPARE", 0, "HAND");

    f.attackToCounterStep(attacker, mine);
    f.playEb02030(mine);
    f.data("OPT874-LATE", { cost: 2, power: 2000 });
    const late = f.put("OPT874-LATE", 0);
    f.finishBattle();
    f.decline();

    expect(f.granted()[0]?.appliesTo ?? []).not.toContain(late.instanceId);
    f.attackToCounterStep(attacker, late);
    f.finishBattle();
    expect(f.state.pendingPrompt).toBeNull();
    expect(f.onField(late)).toBe(false);
  });

  it("with no Character of yours on the field, nothing is registered", () => {
    const f = fixture();
    f.data("OPT874-ATK", { cost: 5, power: 7000 });
    const attacker = f.put("OPT874-ATK", 1);
    f.state.turn.activePlayerIndex = 1;
    f.act({
      type: "DECLARE_ATTACK",
      attackerInstanceId: attacker.instanceId,
      targetInstanceId: f.state.players[0].leader.instanceId,
    }, 1);
    for (let guard = 0; guard < 6 && f.state.turn.battleSubPhase !== "COUNTER_STEP"; guard++) {
      f.act({ type: "PASS" }, f.state.turn.battleSubPhase === "ATTACK_STEP" ? 1 : 0);
    }
    f.playEb02030(f.state.players[0].leader);
    expect(f.granted()).toHaveLength(0);
  });
});
