/**
 * OPT-796 — "When this Leader's/Character's attack deals damage to your
 * opponent's Life" (OP03-040, OP03-041, OP03-047, OP03-051, P-117) and
 * "When you deal damage to your opponent's Life" (OP03-043 Gaimon).
 *
 * Driven through the real action pipeline (DECLARE_ATTACK → PASS → PASS →
 * REVEAL_TRIGGER) with the registered authored schemas; prompts are answered
 * through `resumePromptLifecycle`, the GameSession prompt path.
 *
 * Expected values come from the printed text (docs/cards/OP-03.md,
 * docs/cards/UNKNOWN.md P-117) and docs/FAQs/qa_op03.md:88-140:
 * - Gaimon fires on any attack by its controller (Leader or Character), once
 *   for [Double Attack], never when Life is moved or trashed by an effect.
 *   DEAL_DAMAGE effect damage emits no DAMAGE_DEALT today, so it fires no
 *   watcher; whether Gaimon should see it is an open rules question (OPT-892).
 * - Every watcher activates after the Life check and before the resulting
 *   [Trigger] choice.
 */
import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameState, LifeCard } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import { getEffectSchema } from "../engine/schema-registry.js";
import { registerCardEnteredField } from "../engine/triggers.js";
import { resumePromptLifecycle } from "../session/prompt-lifecycle.js";
import { parseStoredSession, SessionRepository, type SessionStorage } from "../session/persistence.js";
import { readFileSync } from "node:fs";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const printedText: Record<string, string> = {
  "OP03-040": "When your deck is reduced to 0, you win the game instead of losing, according to the rules.\n[DON!! x1] When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck.",
  "OP03-041": "[Rush] (This card can attack on the turn in which it is played.)\n[DON!! x1] When this Character's attack deals damage to your opponent's Life, you may trash 7 cards from the top of your deck.",
  "OP03-043": "When you deal damage to your opponent's Life, you may trash 3 cards from the top of your deck. If you do, trash this Character.",
  "OP03-047": "[DON!! x1] When this Character's attack deals damage to your opponent's Life, you may trash 7 cards from the top of your deck.\n[On Play] Return up to 1 Character with a cost of 3 or less to the owner's hand, and you may trash 2 cards from the top of your deck.",
  "OP03-051": "[DON!! x1] When this Character's attack deals damage to your opponent's Life, you may trash 7 cards from the top of your deck.\n[On K.O.] You may trash 3 cards from the top of your deck.",
  "P-117": "Under the rules of this game, you can only include {East Blue} type cards in your deck and when your deck is reduced to 0, you win the game instead of losing.\n[DON!! x1] When this Leader's attack deals damage to your opponent's Life, you may trash 1 card from the top of your deck.",
};

// Power values are fixture choices (every attacker must reach the 5000-power
// defending Leader); assertions depend only on the printed effects.
const authored: CardData[] = [
  { ...CARDS.LEADER, id: "OP03-040", name: "Nami", color: ["Blue"], types: ["East Blue", "Straw Hat Crew"] },
  { ...CARDS.RUSH, id: "OP03-041", name: "Usopp", power: 5000, color: ["Blue"], types: ["East Blue", "Straw Hat Crew"] },
  { ...CARDS.VANILLA, id: "OP03-043", name: "Gaimon", power: 5000, color: ["Blue"], types: ["East Blue"] },
  { ...CARDS.VANILLA, id: "OP03-047", name: "Zeff", power: 5000, color: ["Blue"], types: ["East Blue"] },
  { ...CARDS.VANILLA, id: "OP03-051", name: "Bell-mère", power: 5000, color: ["Blue"], types: ["East Blue"] },
  { ...CARDS.LEADER, id: "P-117", name: "Nami", color: ["Blue"], types: ["East Blue", "Straw Hat Crew"] },
].map((card) => ({ ...card, effectSchema: getEffectSchema(card.id)!, effectText: printedText[card.id] }));

const EFFECT_DAMAGE: CardData = {
  ...CARDS.VANILLA,
  id: "OPT796-EFFECT-DAMAGE",
  name: "Effect damage",
  cost: 1,
  effectSchema: {
    effects: [{
      id: "on_play_deal_damage",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [{ type: "DEAL_DAMAGE", target: { type: "PLAYER", controller: "OPPONENT" }, params: { amount: 1 } }],
    }],
  } as EffectSchema,
};

const SERVICES = { drainPregame: (s: GameState) => s, advanceStartOfTurn: (s: GameState) => s };

type Fixture = ReturnType<typeof fixture>;

function fixture(opts: { lifeTop?: string[]; activePlayer?: 0 | 1 } = {}) {
  const cardDb = createTestCardDb();
  authored.forEach((data) => cardDb.set(data.id, data));
  cardDb.set(EFFECT_DAMAGE.id, EFFECT_DAMAGE);
  let state = createBattleReadyState(cardDb);
  const active = opts.activePlayer ?? 0;
  state = { ...state, turn: { ...state.turn, activePlayerIndex: active } };
  state.players[0].characters = padChars([]);
  state.players[1].characters = padChars([]);
  const life = (owner: 0 | 1, ids: string[]): LifeCard[] =>
    ids.map((cardId, i) => ({ instanceId: `life-${owner}-${i}`, cardId, face: "DOWN" }));
  const defaultLife = [CARDS.VANILLA.id, CARDS.VANILLA.id, CARDS.VANILLA.id, CARDS.VANILLA.id];
  state.players[0].life = life(0, defaultLife);
  state.players[1].life = life(1, opts.lifeTop ?? defaultLife);
  let donSeq = 0;
  const put = (id: string, controller: 0 | 1, zone: "CHARACTER" | "LEADER" = "CHARACTER", don = 0, tag = "") => {
    const instanceId = `${id}-${controller}-${zone}${tag}`;
    const card: CardInstance = {
      instanceId,
      cardId: id,
      zone,
      state: "ACTIVE",
      attachedDon: Array.from({ length: don }, () => ({ instanceId: `don-796-${donSeq++}`, state: "ACTIVE" as const, attachedTo: instanceId })),
      turnPlayed: 0,
      controller,
      owner: controller,
    };
    if (zone === "LEADER") state.players[controller].leader = card;
    else {
      const index = state.players[controller].characters.findIndex((c) => !c);
      state.players[controller].characters[index] = card;
    }
    state = registerCardEnteredField(state, card, cardDb.get(id)!);
    return card;
  };
  return { cardDb, put, get state() { return state; }, set state(s: GameState) { state = s; } };
}

interface Step { kind: "OPTIONAL" | "REVEAL"; source?: string; triggerPending?: boolean; defenderHand?: number }

/**
 * Declare an attack on the defending Leader and drive the battle to its end,
 * answering every attacker-side optional prompt with `answer` and declining
 * every defender Life [Trigger]. Records each step in order.
 */
function attack(f: Fixture, attackerId: string, answer: "accept" | "skip" = "accept") {
  const attacking = f.state.turn.activePlayerIndex;
  const defending = (1 - attacking) as 0 | 1;
  let result = runPipeline(
    f.state,
    { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: f.state.players[defending].leader.instanceId },
    f.cardDb,
    attacking,
  );
  expect(result.valid).toBe(true);
  let state = result.state;
  let gameOver = result.gameOver;
  for (let i = 0; i < 2; i++) {
    result = runPipeline(state, { type: "PASS" }, f.cardDb, attacking);
    expect(result.valid).toBe(true);
    state = result.state;
    gameOver = result.gameOver ?? gameOver;
  }
  const steps: Step[] = [];
  for (let guard = 0; guard < 20 && !gameOver && state.status === "IN_PROGRESS"; guard++) {
    const prompt = state.pendingPrompt;
    if (prompt) {
      expect(prompt.options.promptType).toBe("OPTIONAL_EFFECT");
      if (prompt.options.promptType !== "OPTIONAL_EFFECT") break;
      steps.push({
        kind: "OPTIONAL",
        source: state.effectStack.at(-1)?.sourceCardInstanceId,
        triggerPending: !!state.turn.battle?.pendingTriggerLifeCard,
        defenderHand: state.players[defending].hand.length,
      });
      const resumed = resumePromptLifecycle(state, { type: "PLAYER_CHOICE", choiceId: answer }, f.cardDb, SERVICES);
      expect(resumed.responseRejected).toBe(false);
      state = resumed.state;
      gameOver = resumed.gameOver;
      continue;
    }
    if (state.turn.battle?.pendingTriggerLifeCard) {
      steps.push({ kind: "REVEAL" });
      const revealed = runPipeline(state, { type: "REVEAL_TRIGGER", reveal: false }, f.cardDb, defending);
      expect(revealed.valid).toBe(true);
      state = revealed.state;
      gameOver = revealed.gameOver;
      continue;
    }
    break;
  }
  return { state, steps, gameOver, sources: steps.filter((s) => s.kind === "OPTIONAL").map((s) => s.source) };
}

const deckSize = (state: GameState, player: 0 | 1) => state.players[player].deck.length;
const onField = (state: GameState, instanceId: string) =>
  state.players.some((p) => p.characters.some((c) => c?.instanceId === instanceId));

describe("OPT-796 attacker-bound damage watchers (OP03-041 / OP03-047 / OP03-051)", () => {
  it.each(["OP03-041", "OP03-047", "OP03-051"])("%s mills 7 when its own attack deals damage", (id) => {
    const f = fixture();
    const host = f.put(id, 0, "CHARACTER", 1);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, host.instanceId);
    expect(sources).toEqual([host.instanceId]);
    expect(deckSize(state, 0)).toBe(deckBefore - 7);
    expect(state.players[1].life).toHaveLength(3);
  });

  it.each(["OP03-041", "OP03-047", "OP03-051"])("%s does not fire on the Leader's or another Character's attack", (id) => {
    const f = fixture();
    f.put(id, 0, "CHARACTER", 1);
    const other = f.put(CARDS.VANILLA.id, 0, "CHARACTER", 1);
    const deckBefore = deckSize(f.state, 0);

    const byLeader = attack(f, f.state.players[0].leader.instanceId);
    expect(byLeader.state.players[1].life).toHaveLength(3);
    expect(byLeader.sources).toEqual([]);
    expect(deckSize(byLeader.state, 0)).toBe(deckBefore);

    f.state = byLeader.state;
    const byOther = attack(f, other.instanceId);
    expect(byOther.state.players[1].life).toHaveLength(2);
    expect(byOther.sources).toEqual([]);
    expect(deckSize(byOther.state, 0)).toBe(deckBefore);
  });

  it("two Usopps each bind to their own attack", () => {
    const f = fixture();
    const first = f.put("OP03-041", 0, "CHARACTER", 1, "-a");
    const second = f.put("OP03-041", 0, "CHARACTER", 1, "-b");
    const deckBefore = deckSize(f.state, 0);

    const a = attack(f, first.instanceId);
    expect(a.sources).toEqual([first.instanceId]);
    f.state = a.state;
    const b = attack(f, second.instanceId);
    expect(b.sources).toEqual([second.instanceId]);
    expect(deckSize(b.state, 0)).toBe(deckBefore - 14);
  });

  it("[DON!! x1]: Usopp without DON!! attached does not fire", () => {
    const f = fixture();
    const usopp = f.put("OP03-041", 0, "CHARACTER", 0);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, usopp.instanceId);
    expect(state.players[1].life).toHaveLength(3);
    expect(sources).toEqual([]);
    expect(deckSize(state, 0)).toBe(deckBefore);
  });

  it("declining the optional mill leaves the deck untouched", () => {
    const f = fixture();
    const usopp = f.put("OP03-041", 0, "CHARACTER", 1);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, usopp.instanceId, "skip");
    expect(sources).toEqual([usopp.instanceId]);
    expect(deckSize(state, 0)).toBe(deckBefore);
  });

  it("[Double Attack] Usopp resolves once for its 2 damage", () => {
    const f = fixture();
    const usoppData = f.cardDb.get("OP03-041")!;
    f.cardDb.set("OP03-041", { ...usoppData, keywords: { ...usoppData.keywords, doubleAttack: true } });
    const usopp = f.put("OP03-041", 0, "CHARACTER", 1);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, usopp.instanceId);
    expect(state.players[1].life).toHaveLength(2);
    expect(sources).toEqual([usopp.instanceId]);
    expect(deckSize(state, 0)).toBe(deckBefore - 7);
  });

  it("[Banish] damage still fires the watcher (Life card trashed, damage dealt)", () => {
    const f = fixture();
    const usoppData = f.cardDb.get("OP03-041")!;
    f.cardDb.set("OP03-041", { ...usoppData, keywords: { ...usoppData.keywords, banish: true } });
    const usopp = f.put("OP03-041", 0, "CHARACTER", 1);
    const handBefore = f.state.players[1].hand.length;
    const trashBefore = f.state.players[1].trash.length;
    const { state, sources } = attack(f, usopp.instanceId);
    expect(state.players[1].life).toHaveLength(3);
    expect(state.players[1].hand).toHaveLength(handBefore);
    expect(state.players[1].trash).toHaveLength(trashBefore + 1);
    expect(sources).toEqual([usopp.instanceId]);
  });

  it("activates after the Life check and before the defender's [Trigger] choice", () => {
    const f = fixture({ lifeTop: [CARDS.TRIGGER.id, CARDS.VANILLA.id] });
    const usopp = f.put("OP03-041", 0, "CHARACTER", 1);
    const handBefore = f.state.players[1].hand.length;
    const { steps, state } = attack(f, usopp.instanceId);
    expect(steps).toEqual([
      // Life already checked (held in the pending [Trigger] slot), not yet in hand.
      { kind: "OPTIONAL", source: usopp.instanceId, triggerPending: true, defenderHand: handBefore },
      { kind: "REVEAL" },
    ]);
    expect(state.players[1].life).toHaveLength(1);
    expect(state.players[1].hand).toHaveLength(handBefore + 1);
  });
});

describe("OPT-796 OP03-043 Gaimon — any attack by its controller", () => {
  it("fires on the Leader's attack: mills 3 and trashes itself", () => {
    const f = fixture();
    const gaimon = f.put("OP03-043", 0);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, f.state.players[0].leader.instanceId);
    expect(sources).toEqual([gaimon.instanceId]);
    expect(deckSize(state, 0)).toBe(deckBefore - 3);
    expect(onField(state, gaimon.instanceId)).toBe(false);
    expect(state.players[0].trash.some((c) => c.cardId === "OP03-043")).toBe(true);
  });

  it("fires on another Character's attack and on its own attack", () => {
    const f = fixture();
    const gaimon = f.put("OP03-043", 0);
    const other = f.put(CARDS.VANILLA.id, 0, "CHARACTER", 1);
    const byOther = attack(f, other.instanceId, "skip");
    expect(byOther.sources).toEqual([gaimon.instanceId]);
    expect(onField(byOther.state, gaimon.instanceId)).toBe(true);

    f.state = byOther.state;
    const deckBefore = deckSize(f.state, 0);
    const own = attack(f, gaimon.instanceId);
    expect(own.sources).toEqual([gaimon.instanceId]);
    expect(deckSize(own.state, 0)).toBe(deckBefore - 3);
    expect(onField(own.state, gaimon.instanceId)).toBe(false);
  });

  it("has no DON!! gate", () => {
    const f = fixture();
    const gaimon = f.put("OP03-043", 0, "CHARACTER", 0);
    expect(attack(f, f.state.players[0].leader.instanceId).sources).toEqual([gaimon.instanceId]);
  });

  it("does not fire (nor do OP03-040 / OP03-041) on the opponent's attack", () => {
    const f = fixture({ activePlayer: 1 });
    f.put("OP03-043", 0);
    f.put("OP03-041", 0, "CHARACTER", 1);
    f.put("OP03-040", 0, "LEADER", 1);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, f.state.players[1].leader.instanceId);
    expect(state.players[0].life).toHaveLength(3);
    expect(sources).toEqual([]);
    expect(deckSize(state, 0)).toBe(deckBefore);
  });

  it("[Double Attack] dealing 2 damage activates once", () => {
    const f = fixture();
    const gaimon = f.put("OP03-043", 0);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, sources } = attack(f, da.instanceId, "skip");
    expect(state.players[1].life).toHaveLength(2);
    expect(sources).toEqual([gaimon.instanceId]);
  });

  it("[Double Attack] with a [Trigger] on the first Life: once, before that [Trigger] choice", () => {
    const f = fixture({ lifeTop: [CARDS.TRIGGER.id, CARDS.VANILLA.id, CARDS.VANILLA.id] });
    const gaimon = f.put("OP03-043", 0);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const handBefore = f.state.players[1].hand.length;
    const { state, steps } = attack(f, da.instanceId, "skip");
    expect(steps).toEqual([
      { kind: "OPTIONAL", source: gaimon.instanceId, triggerPending: true, defenderHand: handBefore },
      { kind: "REVEAL" },
    ]);
    expect(state.players[1].life).toHaveLength(1);
  });

  it("does not fire on DEAL_DAMAGE effect damage (no DAMAGE_DEALT today; rules question OPT-892)", () => {
    const f = fixture();
    f.put("OP03-043", 0);
    const source: CardInstance = { ...f.state.players[0].leader, instanceId: "effect-damage-hand", cardId: EFFECT_DAMAGE.id, zone: "HAND", attachedDon: [], turnPlayed: null };
    f.state.players[0].hand.push(source);
    const lifeBefore = f.state.players[1].life.length;
    const played = runPipeline(f.state, { type: "PLAY_CARD", cardInstanceId: source.instanceId }, f.cardDb, 0);
    expect(played.valid).toBe(true);
    expect(played.state.players[1].life).toHaveLength(lifeBefore - 1);
    expect(played.pendingPrompt).toBeUndefined();
  });

  it("a lethal DAMAGE_DEALT fires no watcher (no Life to check; the game ends)", () => {
    const f = fixture({ lifeTop: [] });
    f.put("OP03-043", 0);
    const { steps, state } = attack(f, f.state.players[0].leader.instanceId);
    expect(steps).toEqual([]);
    expect(state.status).not.toBe("IN_PROGRESS");
  });
});

describe("OPT-796 Leaders OP03-040 / P-117 — this Leader's attack", () => {
  it.each(["OP03-040", "P-117"])("%s mills 1 on its own attack", (id) => {
    const f = fixture();
    const leader = f.put(id, 0, "LEADER", 1);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, leader.instanceId);
    expect(sources).toEqual([leader.instanceId]);
    expect(deckSize(state, 0)).toBe(deckBefore - 1);
  });

  it.each(["OP03-040", "P-117"])("%s does not fire on a Character's attack", (id) => {
    const f = fixture();
    f.put(id, 0, "LEADER", 1);
    const other = f.put(CARDS.VANILLA.id, 0, "CHARACTER", 1);
    const deckBefore = deckSize(f.state, 0);
    const { state, sources } = attack(f, other.instanceId);
    expect(state.players[1].life).toHaveLength(3);
    expect(sources).toEqual([]);
    expect(deckSize(state, 0)).toBe(deckBefore);
  });

  it.each(["OP03-040", "P-117"])("%s needs [DON!! x1]", (id) => {
    const f = fixture();
    const leader = f.put(id, 0, "LEADER", 0);
    const { state, sources } = attack(f, leader.instanceId);
    expect(state.players[1].life).toHaveLength(3);
    expect(sources).toEqual([]);
  });
});

describe("OPT-796 persisted sessions and the #692 damage continuation", () => {
  const roundTrip = (state: GameState, cardDb: Map<string, CardData>) => {
    const stored = parseStoredSession(JSON.parse(JSON.stringify({ state, cardDb: Object.fromEntries(cardDb), mode: "PVP" })));
    return { state: stored.state, cardDb: new Map(Object.entries(stored.cardDb)) };
  };

  it("loads a pre-OPT-796 session whose DAMAGE_DEALT events lack firstDamageOfAttack", () => {
    const f = fixture();
    const other = f.put(CARDS.VANILLA.id, 0, "CHARACTER", 1);
    const { state } = attack(f, other.instanceId);
    const damage = state.eventLog.filter((e) => e.type === "DAMAGE_DEALT");
    expect(damage.map((e) => e.payload)).toEqual([expect.objectContaining({ firstDamageOfAttack: true })]);
    const legacy: GameState = {
      ...state,
      eventLog: state.eventLog.map((e) => {
        if (e.type !== "DAMAGE_DEALT") return e;
        const { firstDamageOfAttack: _dropped, ...payload } = e.payload;
        return { ...e, payload } as typeof e;
      }),
    };
    const restored = roundTrip(legacy, f.cardDb);
    const restoredDamage = restored.state.eventLog.filter((e) => e.type === "DAMAGE_DEALT");
    expect(restoredDamage).toHaveLength(1);
    expect(restoredDamage[0].payload).not.toHaveProperty("firstDamageOfAttack");
  });

  it("a [Double Attack] battle persisted at its first [Trigger] pause resumes without re-firing Gaimon", () => {
    const f = fixture({ lifeTop: [CARDS.TRIGGER.id, CARDS.TRIGGER.id, CARDS.VANILLA.id] });
    const gaimon = f.put("OP03-043", 0);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    let result = runPipeline(f.state, { type: "DECLARE_ATTACK", attackerInstanceId: da.instanceId, targetInstanceId: f.state.players[1].leader.instanceId }, f.cardDb, 0);
    for (let i = 0; i < 2; i++) result = runPipeline(result.state, { type: "PASS" }, f.cardDb, 0);
    expect(result.state.effectStack.at(-1)?.sourceCardInstanceId).toBe(gaimon.instanceId);
    const declined = resumePromptLifecycle(result.state, { type: "PLAYER_CHOICE", choiceId: "skip" }, f.cardDb, SERVICES);
    expect(declined.state.turn.battle?.pendingTriggerLifeCard).toBeTruthy();

    // Persist mid-Damage-Step (first Life held for its [Trigger]), then resume.
    const restored = roundTrip(declined.state, f.cardDb);
    const revealed = runPipeline(restored.state, { type: "REVEAL_TRIGGER", reveal: false }, restored.cardDb, 1);
    expect(revealed.valid).toBe(true);
    // The second damage reveals another [Trigger]; Gaimon stays silent.
    expect(revealed.state.pendingPrompt).toBeFalsy();
    expect(revealed.state.turn.battle?.pendingTriggerLifeCard).toBeTruthy();
    const finished = runPipeline(revealed.state, { type: "REVEAL_TRIGGER", reveal: false }, restored.cardDb, 1);
    expect(finished.state.pendingPrompt).toBeFalsy();
    expect(finished.state.players[1].life).toHaveLength(1);
    expect(finished.state.eventLog.filter((e) => e.type === "DAMAGE_DEALT").map((e) => e.payload.firstDamageOfAttack)).toEqual([true, false]);
  });
});

describe("OPT-796 [Double Attack] against 1 Life (qa_rules.md:156-158)", () => {
  it("Gaimon fires exactly once and the game does not end", () => {
    const f = fixture({ lifeTop: [CARDS.VANILLA.id] });
    const gaimon = f.put("OP03-043", 0);
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, sources } = attack(f, da.instanceId, "skip");
    expect(sources).toEqual([gaimon.instanceId]);
    expect(state.players[1].life).toHaveLength(0);
    expect(state.status).toBe("IN_PROGRESS");
  });

  // OPT-886: with no watcher prompting, the engine currently ends the game on
  // the second damage. The official FAQ says [Double Attack] against 1 Life
  // cannot win. Flip to `it` when OPT-886 lands.
  it.fails("no-watcher control: the game continues (fails today — OPT-886)", () => {
    const f = fixture({ lifeTop: [CARDS.VANILLA.id] });
    const da = f.put(CARDS.DOUBLE_ATK.id, 0);
    const { state, steps } = attack(f, da.instanceId);
    expect(steps).toEqual([]);
    expect(state.players[1].life).toHaveLength(0);
    expect(state.status).toBe("IN_PROGRESS");
  });
});

/**
 * `fixtures/opt-796-legacy-sessions.json` was written by
 * `SessionRepository.save` on e0aace7 (before OPT-796), so its cardDb schemas
 * and registered triggers still use the removed LEADER_ATTACK_DEALS_DAMAGE.
 * - namiUsopp: OP03-040 Nami Leader (1 DON!!), OP03-041 Usopp (1 DON!!), a
 *   vanilla Character (1 DON!!).
 * - gaimon: OP03-043 Gaimon, a vanilla Character (1 DON!!).
 */
describe("OPT-796 legacy persisted sessions (pre-change schemas and registry)", () => {
  class MemoryStorage implements SessionStorage {
    readonly data = new Map<string, unknown>();
    async get<T>(key: string): Promise<T | undefined> { return this.data.get(key) as T | undefined; }
    async put(k: string | Record<string, unknown>, v?: unknown): Promise<void> {
      const entries = typeof k === "string" ? { [k]: v } : k;
      for (const [key, value] of Object.entries(entries)) this.data.set(key, structuredClone(value));
    }
    async setAlarm(): Promise<void> {}
    async deleteAlarm(): Promise<void> {}
  }

  const legacy = JSON.parse(
    readFileSync(new URL("./fixtures/opt-796-legacy-sessions.json", import.meta.url), "utf8"),
  ) as Record<"namiUsopp" | "gaimon", Record<string, unknown>>;

  async function load(name: "namiUsopp" | "gaimon") {
    const raw = JSON.stringify(legacy[name]);
    expect(raw).toContain("LEADER_ATTACK_DEALS_DAMAGE");
    const storage = new MemoryStorage();
    for (const [key, value] of Object.entries(JSON.parse(raw))) storage.data.set(key, value);
    const restored = await new SessionRepository(storage, { nextJsUrl: "https://app.example.test", workerSecret: "secret" }).load();
    if (!restored) throw new Error("legacy session did not load");
    let state = restored.state;
    const cardDb = restored.cardDb;
    const f = {
      cardDb,
      get state() { return state; },
      set state(s: GameState) { state = s; },
      put: (id: string, don: number, tag: string) => {
        const instanceId = `${id}-reentered${tag}`;
        const card: CardInstance = {
          instanceId, cardId: id, zone: "CHARACTER", state: "ACTIVE", turnPlayed: 0, controller: 0, owner: 0,
          attachedDon: Array.from({ length: don }, (_, i) => ({ instanceId: `${instanceId}-don-${i}`, state: "ACTIVE" as const, attachedTo: instanceId })),
        };
        state.players[0].characters[state.players[0].characters.findIndex((c) => !c)] = card;
        state = registerCardEnteredField(state, card, cardDb.get(id)!);
        return card;
      },
    };
    return { f, restored };
  }

  it("migrates every stored schema and registration to ATTACK_DEALS_DAMAGE", async () => {
    const { restored } = await load("namiUsopp");
    const stored = JSON.stringify([restored.state.triggerRegistry, restored.undoHistory, [...restored.cardDb.values()]]);
    expect(stored).not.toContain("LEADER_ATTACK_DEALS_DAMAGE");
    const triggers = (s: GameState) => Object.fromEntries(s.triggerRegistry.map((r) => [r.sourceCardInstanceId, r.trigger]));
    const expected = {
      "legacy-OP03-040": { event: "ATTACK_DEALS_DAMAGE", filter: { attacker: "SELF" }, don_requirement: 1 },
      "legacy-OP03-041": { event: "ATTACK_DEALS_DAMAGE", filter: { attacker: "SELF" }, don_requirement: 1 },
    };
    expect(triggers(restored.state)).toMatchObject(expected);
    expect(triggers(restored.undoHistory[0])).toMatchObject(expected);
    expect(restored.cardDb.get("OP03-043")?.effectSchema?.effects[0]?.trigger).toEqual({ event: "ATTACK_DEALS_DAMAGE" });
  });

  it("Nami fires on her own attack only, Usopp on his own attack only", async () => {
    const { f } = await load("namiUsopp");
    const deckBefore = deckSize(f.state, 0);
    const nami = attack(f, "legacy-OP03-040");
    expect(nami.sources).toEqual(["legacy-OP03-040"]);
    expect(deckSize(nami.state, 0)).toBe(deckBefore - 1);

    f.state = nami.state;
    const usopp = attack(f, "legacy-OP03-041");
    expect(usopp.sources).toEqual(["legacy-OP03-041"]);
    expect(deckSize(usopp.state, 0)).toBe(deckBefore - 8);

    f.state = usopp.state;
    const vanilla = f.state.players[0].characters.find((c) => c?.cardId === CARDS.VANILLA.id)!;
    const other = attack(f, vanilla.instanceId);
    expect(other.state.players[1].life).toHaveLength(1);
    expect(other.sources).toEqual([]);
  });

  it("an Usopp entering the field after load binds to its own attack (migrated cardDb)", async () => {
    const { f } = await load("namiUsopp");
    const fresh = f.put("OP03-041", 1, "-a");
    const result = attack(f, fresh.instanceId);
    expect(result.sources).toEqual([fresh.instanceId]);
  });

  it("Gaimon fires on another Character's attack after load, once", async () => {
    const { f } = await load("gaimon");
    const vanilla = f.state.players[0].characters.find((c) => c?.cardId === CARDS.VANILLA.id)!;
    const deckBefore = deckSize(f.state, 0);
    const result = attack(f, vanilla.instanceId);
    expect(result.sources).toEqual(["legacy-OP03-043"]);
    expect(deckSize(result.state, 0)).toBe(deckBefore - 3);
    expect(onField(result.state, "legacy-OP03-043")).toBe(false);
  });
});
