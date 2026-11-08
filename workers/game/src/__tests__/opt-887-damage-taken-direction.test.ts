/**
 * OPT-887 / OPT-892 — damage direction and effect damage.
 *
 * DAMAGE_DEALT is owned by the dealer (`playerIndex`: the attacker's controller
 * or the damaging effect's controller) and names the damaged player
 * (`damagedPlayerIndex`, derived as the other player for pre-OPT-887 battle
 * events). Driven through the real pipeline with the registered authored
 * OP13-002 and OP03-043 schemas.
 *
 * Oracles:
 * - OP13-002 (docs/cards/OP-13.md): "[DON!! x1] [Once Per Turn] When you take
 *   damage or your Character with 6000 base power or more is K.O.'d, draw 1
 *   card." Fires when its controller takes damage, battle or effect (rule
 *   4-6-2), never when its controller deals it.
 * - qa_op13.md OP13-002: the [Trigger] is processed first; Ace's effect
 *   activates after the [Trigger] resolves.
 * - OPT-892 decision (Cory, 2026-11-08): effect damage fulfils OP03-043
 *   Gaimon's "When you deal damage to your opponent's Life" (rule 4-6-2;
 *   qa_op03.md OP03-043 only excludes Life moved by a non-damage effect;
 *   qa_eb03.md EB03-055 treats Robin's effect as damage).
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameEvent, GameState, LifeCard } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { matchTriggersForEvent, registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";
import { battleTriggerLifeCard, revealTrigger } from "./trigger-window-helpers.js";

const SERVICES = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };

const ACE: CardData = {
  ...CARDS.LEADER,
  id: "OP13-002",
  name: "Portgas.D.Ace",
  // Fixture power: below the attacking 5000 Leader so every attack connects.
  power: 4000,
  life: 5,
  effectSchema: getEffectSchema("OP13-002")!,
};
const GAIMON: CardData = { ...CARDS.VANILLA, id: "OP03-043", name: "Gaimon", power: 5000, effectSchema: getEffectSchema("OP03-043")! };

function damageCard(id: string, amount: number, self = false): CardData {
  return {
    ...CARDS.VANILLA,
    id,
    name: id,
    cost: 1,
    effectSchema: {
      card_id: id,
      card_name: id,
      card_type: "Character",
      effects: [{
        id: "on_play_damage",
        category: "auto",
        trigger: { keyword: "ON_PLAY" },
        actions: [self
          ? { type: "SELF_TAKE_DAMAGE", params: { amount } }
          : { type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount } }],
      }],
    } as EffectSchema,
  };
}
const DEAL_1 = damageCard("OPT887-DEAL-1", 1);
const DEAL_2 = damageCard("OPT887-DEAL-2", 2);
const SELF_1 = damageCard("OPT887-SELF-1", 1, true);

const TRIGGER_LIFE: CardData = {
  ...CARDS.VANILLA,
  id: "OPT887-TRIGGER-LIFE",
  name: "Trigger life",
  triggerText: "[Trigger] Draw 1 card.",
  keywords: { ...CARDS.VANILLA.keywords, trigger: true },
  effectSchema: {
    card_id: "OPT887-TRIGGER-LIFE",
    card_name: "Trigger life",
    card_type: "Character",
    effects: [{ id: "trig", category: "auto", trigger: { keyword: "TRIGGER" }, actions: [{ type: "DRAW", params: { amount: 1 } }] }],
  } as EffectSchema,
};

function fixture(opts: { aceController?: 0 | 1; aceDon?: number; aceLife?: string[]; active?: 0 | 1 } = {}) {
  const cardDb = new Map(createTestCardDb());
  for (const card of [ACE, GAIMON, DEAL_1, DEAL_2, SELF_1, TRIGGER_LIFE]) cardDb.set(card.id, card);
  let state = createBattleReadyState(cardDb);
  const active = opts.active ?? 0;
  state = { ...state, turn: { ...state.turn, activePlayerIndex: active } };
  for (const p of state.players) {
    p.characters = padChars([]);
    p.hand = [];
  }
  const life = (owner: 0 | 1, ids: string[]): LifeCard[] =>
    ids.map((cardId, i) => ({ instanceId: `life-${owner}-${i}`, cardId, face: "DOWN" }));
  const vanilla = [CARDS.VANILLA.id, CARDS.VANILLA.id, CARDS.VANILLA.id];
  const aceIdx = opts.aceController ?? 1;
  state.players[0].life = life(0, aceIdx === 0 ? opts.aceLife ?? vanilla : vanilla);
  state.players[1].life = life(1, aceIdx === 1 ? opts.aceLife ?? vanilla : vanilla);
  const ace: CardInstance = {
    ...state.players[aceIdx].leader,
    cardId: ACE.id,
    attachedDon: Array.from({ length: opts.aceDon ?? 1 }, (_, i) => ({ instanceId: `ace-don-${i}`, state: "ACTIVE" as const, attachedTo: state.players[aceIdx].leader.instanceId })),
  };
  state.players[aceIdx].leader = ace;
  state = registerCardEnteredField(state, ace, ACE);
  return {
    cardDb,
    ace,
    get state() { return state; },
    set state(s: GameState) { state = s; },
    putChar(id: string, controller: 0 | 1) {
      const card: CardInstance = { instanceId: `${id}-${controller}`, cardId: id, zone: "CHARACTER", state: "ACTIVE", attachedDon: [], turnPlayed: 0, controller, owner: controller };
      const index = state.players[controller].characters.findIndex((c) => !c);
      state.players[controller].characters[index] = card;
      state = registerCardEnteredField(state, card, cardDb.get(id)!);
      return card;
    },
    putHand(id: string, controller: 0 | 1) {
      const card: CardInstance = { instanceId: `${id}-hand-${controller}`, cardId: id, zone: "HAND", state: "ACTIVE", attachedDon: [], turnPlayed: null, controller, owner: controller };
      state.players[controller].hand.push(card);
      return card;
    },
  };
}
type Fixture = ReturnType<typeof fixture>;

/** Answer every prompt: decline optional effects and Triggers unless told otherwise. */
function drive(state: GameState, cardDb: Map<string, CardData>, opts: { revealTrigger?: boolean; acceptOptional?: boolean } = {}) {
  for (let guard = 0; guard < 20 && state.status === "IN_PROGRESS"; guard++) {
    const prompt = state.pendingPrompt;
    if (prompt?.options.promptType === "REVEAL_TRIGGER" || (!prompt && battleTriggerLifeCard(state))) {
      const revealed = revealTrigger(state, opts.revealTrigger ?? false, cardDb);
      expect(revealed.valid).toBe(true);
      state = revealed.state;
      continue;
    }
    if (prompt?.options.promptType === "OPTIONAL_EFFECT") {
      const resumed = resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId: opts.acceptOptional ? "accept" : "skip" }, cardDb, SERVICES);
      expect(resumed.responseRejected).toBe(false);
      state = resumed.state;
      continue;
    }
    if (prompt) throw new Error(`unexpected prompt ${prompt.options.promptType}`);
    break;
  }
  return state;
}

function attackLeader(f: Fixture, attackerId: string, opts: { revealTrigger?: boolean } = {}) {
  const attacking = f.state.turn.activePlayerIndex;
  const defending = (1 - attacking) as 0 | 1;
  let result = runPipeline(f.state, { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: f.state.players[defending].leader.instanceId }, f.cardDb, attacking);
  expect(result.valid).toBe(true);
  let state = drive(result.state, f.cardDb);
  for (let i = 0; i < 2 && state.status === "IN_PROGRESS" && !state.pendingPrompt && state.turn.battle; i++) {
    result = runPipeline(state, { type: "PASS" }, f.cardDb, defending);
    if (!result.valid) result = runPipeline(state, { type: "PASS" }, f.cardDb, attacking);
    expect(result.valid).toBe(true);
    state = drive(result.state, f.cardDb, opts);
  }
  return drive(state, f.cardDb, opts);
}

function play(f: Fixture, card: CardInstance, opts: { revealTrigger?: boolean; acceptOptional?: boolean } = {}) {
  const result = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: card.instanceId }, f.cardDb, card.controller);
  expect(result.valid).toBe(true);
  return drive(result.state, f.cardDb, opts);
}

const draws = (log: readonly GameEvent[], player: 0 | 1) => log.filter((e) => e.type === "CARD_DRAWN" && e.playerIndex === player);

describe("OPT-887 OP13-002 Ace: when you take damage (battle)", () => {
  it("draws exactly once when the opponent's attack damages Ace's controller", () => {
    const f = fixture();
    const start = f.state.eventLog.length;
    const state = attackLeader(f, f.state.players[0].leader.instanceId);
    const log = state.eventLog.slice(start);
    const damage = log.filter((e) => e.type === "DAMAGE_DEALT");
    expect(damage).toHaveLength(1);
    expect(damage[0].playerIndex).toBe(0); // dealer
    expect(state.players[1].life).toHaveLength(2);
    expect(draws(log, 1)).toHaveLength(1);
    expect(draws(log, 0)).toHaveLength(0);
  });

  it("does not draw when Ace's controller deals battle damage (negative own-damage control)", () => {
    const f = fixture({ aceController: 0 });
    const start = f.state.eventLog.length;
    const state = attackLeader(f, f.ace.instanceId);
    const log = state.eventLog.slice(start);
    expect(state.players[1].life).toHaveLength(2);
    expect(draws(log, 0)).toHaveLength(0);
    expect(draws(log, 1)).toHaveLength(0);
  });

  it("without DON!! attached the timing is met but the effect does not resolve", () => {
    const f = fixture({ aceDon: 0 });
    const start = f.state.eventLog.length;
    const state = attackLeader(f, f.state.players[0].leader.instanceId);
    expect(draws(state.eventLog.slice(start), 1)).toHaveLength(0);
  });

  it("FAQ qa_op13.md: the [Trigger] resolves before Ace's draw", () => {
    const f = fixture({ aceLife: [TRIGGER_LIFE.id, CARDS.VANILLA.id] });
    const start = f.state.eventLog.length;
    const state = attackLeader(f, f.state.players[0].leader.instanceId, { revealTrigger: true });
    const log = state.eventLog.slice(start);
    const trigger = log.findIndex((e) => e.type === "TRIGGER_ACTIVATED" && (e.payload as { activated?: boolean }).activated === true);
    expect(trigger).toBeGreaterThanOrEqual(0);
    const p1Draws = log.flatMap((e, i) => (e.type === "CARD_DRAWN" && e.playerIndex === 1 ? [i] : []));
    // One draw from the Trigger, then exactly one from Ace, both after the Trigger activates.
    expect(p1Draws).toHaveLength(2);
    expect(p1Draws.every((i) => i > trigger)).toBe(true);
  });
});

describe("OPT-887 OP13-002 Ace: when you take damage (effect)", () => {
  it("draws once when the opponent's DEAL_DAMAGE hits Ace's controller", () => {
    const f = fixture();
    const source = f.putHand(DEAL_1.id, 0);
    const start = f.state.eventLog.length;
    const state = play(f, source);
    const log = state.eventLog.slice(start);
    const damage = log.filter((e) => e.type === "DAMAGE_DEALT");
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({ playerIndex: 0, payload: { damageSource: "EFFECT", damagedPlayerIndex: 1, firstDamageOfEffect: true } });
    expect(state.players[1].life).toHaveLength(2);
    expect(draws(log, 1)).toHaveLength(1);
  });

  it("a 2-damage instruction fulfils the timing once", () => {
    const f = fixture();
    const source = f.putHand(DEAL_2.id, 0);
    const start = f.state.eventLog.length;
    const state = play(f, source);
    const log = state.eventLog.slice(start);
    expect(log.filter((e) => e.type === "DAMAGE_DEALT")).toHaveLength(2);
    expect(state.players[1].life).toHaveLength(1);
    expect(draws(log, 1)).toHaveLength(1);
  });

  it("draws once when Ace's controller damages itself (SELF_TAKE_DAMAGE)", () => {
    const f = fixture({ aceController: 0 });
    const source = f.putHand(SELF_1.id, 0);
    const start = f.state.eventLog.length;
    const state = play(f, source);
    const log = state.eventLog.slice(start);
    expect(log.find((e) => e.type === "DAMAGE_DEALT")).toMatchObject({ playerIndex: 0, payload: { damagedPlayerIndex: 0 } });
    expect(state.players[0].life).toHaveLength(2);
    // The damaged Life card goes to hand; Ace's draw is the only CARD_DRAWN.
    expect(draws(log, 0)).toHaveLength(1);
  });

  it("does not draw when Ace's controller deals effect damage to the opponent", () => {
    const f = fixture({ aceController: 0 });
    const source = f.putHand(DEAL_1.id, 0);
    const start = f.state.eventLog.length;
    const state = play(f, source);
    expect(state.players[1].life).toHaveLength(2);
    expect(draws(state.eventLog.slice(start), 0)).toHaveLength(0);
  });

  it("the [Trigger] revealed by effect damage resolves before Ace's draw", () => {
    const f = fixture({ aceLife: [TRIGGER_LIFE.id, CARDS.VANILLA.id] });
    const source = f.putHand(DEAL_1.id, 0);
    const start = f.state.eventLog.length;
    const state = play(f, source, { revealTrigger: true });
    const log = state.eventLog.slice(start);
    const trigger = log.findIndex((e) => e.type === "TRIGGER_ACTIVATED" && (e.payload as { activated?: boolean }).activated === true);
    expect(trigger).toBeGreaterThanOrEqual(0);
    const p1Draws = log.flatMap((e, i) => (e.type === "CARD_DRAWN" && e.playerIndex === 1 ? [i] : []));
    expect(p1Draws).toHaveLength(2);
    expect(p1Draws.every((i) => i > trigger)).toBe(true);
  });
});

describe("OPT-887 lethal effect damage is logged", () => {
  it("DEAL_DAMAGE at 0 Life records a lethal DAMAGE_DEALT and ends the game", () => {
    const f = fixture({ aceDon: 0, aceLife: [] });
    const source = f.putHand(DEAL_1.id, 0);
    const start = f.state.eventLog.length;
    const result = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: source.instanceId }, f.cardDb, 0);
    expect(result.valid).toBe(true);
    const damage = result.state.eventLog.slice(start).filter((e) => e.type === "DAMAGE_DEALT");
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({
      playerIndex: 0,
      payload: { amount: 1, lethal: true, damageSource: "EFFECT", damagedPlayerIndex: 1, firstDamageOfEffect: true },
    });
    expect(result.state.status).toBe("FINISHED");
    expect(result.state.winner).toBe(0);
  });

  it("a later point of a 2-damage instruction at 0 Life is logged but does not defeat", () => {
    const f = fixture({ aceDon: 0, aceLife: [CARDS.VANILLA.id] });
    const source = f.putHand(DEAL_2.id, 0);
    const start = f.state.eventLog.length;
    const result = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: source.instanceId }, f.cardDb, 0);
    expect(result.valid).toBe(true);
    const damage = result.state.eventLog.slice(start).filter((e) => e.type === "DAMAGE_DEALT");
    expect(damage.map((e) => (e.payload as { lethal?: boolean }).lethal === true)).toEqual([false, true]);
    expect(result.state.status).toBe("IN_PROGRESS");
  });
});

describe("OPT-892 OP03-043 Gaimon on effect damage", () => {
  it("fires once after a 2-damage instruction, after its [Trigger] window (rule 8-6-2)", () => {
    const f = fixture({ aceDon: 0, aceLife: [TRIGGER_LIFE.id, CARDS.VANILLA.id, CARDS.VANILLA.id] });
    const gaimon = f.putChar(GAIMON.id, 0);
    const source = f.putHand(DEAL_2.id, 0);
    const deckBefore = f.state.players[0].deck.length;
    const state = play(f, source, { revealTrigger: true, acceptOptional: true });
    expect(state.players[1].life).toHaveLength(1);
    // Mill 3, then Gaimon trashes itself.
    expect(state.players[0].deck).toHaveLength(deckBefore - 3);
    expect(state.players[0].characters.some((c) => c?.instanceId === gaimon.instanceId)).toBe(false);
    const log = state.eventLog;
    const trigger = log.findIndex((e) => e.type === "TRIGGER_ACTIVATED" && (e.payload as { activated?: boolean }).activated === true);
    const gaimonTrash = log.findIndex((e) => e.type === "CARD_TRASHED" && (e.payload as { cardInstanceId?: string }).cardInstanceId === gaimon.instanceId);
    expect(trigger).toBeGreaterThanOrEqual(0);
    expect(gaimonTrash).toBeGreaterThan(trigger);
  });

  it("does not fire on self-inflicted effect damage", () => {
    const f = fixture({ aceDon: 0 });
    f.putChar(GAIMON.id, 0);
    const source = f.putHand(SELF_1.id, 0);
    const result = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: source.instanceId }, f.cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.players[0].life).toHaveLength(2);
    expect(result.state.pendingPrompt).toBeNull();
  });
});

describe("OPT-887 bare DAMAGE_TAKEN defaults to the host's controller", () => {
  const BARE: CardData = {
    ...CARDS.VANILLA,
    id: "OPT887-BARE-WATCHER",
    name: "Bare watcher",
    effectSchema: {
      card_id: "OPT887-BARE-WATCHER",
      card_name: "Bare watcher",
      card_type: "Character",
      effects: [{ id: "watch", category: "auto", trigger: { event: "DAMAGE_TAKEN" }, actions: [{ type: "DRAW", params: { amount: 1 } }] }],
    } as EffectSchema,
  };

  it.each([[1, 1], [0, 0]] as const)("a watcher controlled by player %i draws %i when player 1 takes effect damage", (owner, drawn) => {
    // Ace sits on player 0 without DON!!, so it never competes with the watcher.
    const f = fixture({ aceController: 0, aceDon: 0 });
    f.cardDb.set(BARE.id, BARE);
    f.putChar(BARE.id, owner);
    const source = f.putHand(DEAL_1.id, 0);
    const start = f.state.eventLog.length;
    const state = play(f, source);
    expect(state.players[1].life).toHaveLength(2);
    expect(draws(state.eventLog.slice(start), owner)).toHaveLength(drawn);
  });
});

describe("OPT-887 DAMAGE_TAKEN controller semantics on legacy events", () => {
  it("a pre-OPT-887 battle event (no damagedPlayerIndex) is attributed to the non-dealer", () => {
    const f = fixture();
    const legacy: GameEvent = {
      type: "DAMAGE_DEALT",
      playerIndex: 0,
      payload: { amount: 1, attackerInstanceId: f.state.players[0].leader.instanceId, attackerType: "LEADER", firstDamageOfAttack: true },
      timestamp: 1,
    };
    expect(matchTriggersForEvent(f.state, legacy, f.cardDb).map((m) => m.effectBlock.id)).toEqual(["OP13-002_on_damage_or_ko"]);
    const own: GameEvent = { ...legacy, playerIndex: 1 };
    expect(matchTriggersForEvent(f.state, own, f.cardDb)).toEqual([]);
  });

  it("a later point of the same attack or instruction never matches", () => {
    const f = fixture();
    const second: GameEvent = {
      type: "DAMAGE_DEALT",
      playerIndex: 0,
      payload: { amount: 1, damageSource: "EFFECT", damagedPlayerIndex: 1, sourceCardInstanceId: "x", firstDamageOfEffect: false },
      timestamp: 1,
    };
    expect(matchTriggersForEvent(f.state, second, f.cardDb)).toEqual([]);
  });
});
