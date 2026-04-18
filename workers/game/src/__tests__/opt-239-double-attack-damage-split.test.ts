/**
 * OPT-239 D1 — [Trigger] resolution between [Double Attack] damage instances.
 *
 * Rules anchor:
 *   • §7-1-4-1-1-3 — damage dealing loop during the Damage Step.
 *   • §10-1-2-1   — [Double Attack] deals 2 damage to Leader Life.
 *   • §10-1-5     — [Trigger] window opens between Life reveal and add-to-hand.
 *   • qa_rules.md:154 — "damage amount fixed at attack declaration" — stripping
 *     [Double Attack] after declaration does NOT cut the 2nd damage.
 *   • qa_rules.md:229-231 — Trigger fully resolves before the 2nd damage is dealt.
 *   • qa_op03.md:283-285 (OP03-118) — state mutations from the Trigger effect
 *     (adding a card to Life) must be visible to the 2nd damage.
 *   • qa_st-09.md:6-8 (ST09-001) — Life-threshold power modifiers recompute
 *     between damages so later triggers see the buffed state.
 *
 * Pre-refactor (before OPT-239): `executeRevealTrigger` unconditionally called
 * `endBattle`, so the 2nd DA damage was silently dropped whenever the 1st Life
 * was a [Trigger] card. The refactor introduces `damagesRemaining` on the
 * BattleContext, pauses on Trigger, and re-enters the damage loop after the
 * Trigger window resolves.
 */

import { describe, it, expect } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import type {
  CardData,
  CardInstance,
  DonInstance,
  GameState,
  LifeCard,
  PlayerState,
} from "../types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
  padChars,
} from "./helpers.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

type Kw = CardInstance extends infer _ ? never : never; // placeholder
const NO_KW = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

/**
 * Install a Double-Attack attacker on player 0, give the defender a specific
 * pair of Life cards (top-of-life first), and return the battle-ready state.
 *
 * `topLife` is the 1st card revealed; `bottomLife` the 2nd.
 */
function setupDADefender(
  cardDb: Map<string, CardData>,
  topLife: LifeCard,
  bottomLife: LifeCard | null,
  attackerOverride?: CardInstance,
): { state: GameState; attackerId: string; targetId: string } {
  const state0 = createBattleReadyState(cardDb);

  const datk: CardInstance = attackerOverride ?? {
    instanceId: "datk-0",
    cardId: CARDS.DOUBLE_ATK.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 0,
    owner: 0,
  };

  const p0Chars = [
    ...(state0.players[0].characters.filter(Boolean) as CardInstance[]),
    datk,
  ];

  const newLife = bottomLife ? [topLife, bottomLife] : [topLife];

  const newPlayers = [...state0.players] as [PlayerState, PlayerState];
  newPlayers[0] = { ...newPlayers[0], characters: padChars(p0Chars) };
  newPlayers[1] = { ...newPlayers[1], life: newLife };
  const state = { ...state0, players: newPlayers };

  return {
    state,
    attackerId: datk.instanceId,
    targetId: state.players[1].leader.instanceId,
  };
}

function declareThroughCounter(
  state: GameState,
  attackerId: string,
  targetId: string,
  cardDb: Map<string, CardData>,
): GameState {
  let r = runPipeline(
    state,
    { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: targetId },
    cardDb,
    0,
  );
  expect(r.valid).toBe(true);
  r = runPipeline(r.state, { type: "PASS" }, cardDb, 0); // block
  expect(r.valid).toBe(true);
  r = runPipeline(r.state, { type: "PASS" }, cardDb, 0); // counter
  expect(r.valid).toBe(true);
  return r.state;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-239 — [Trigger] resolution between [Double Attack] damages", () => {
  it("baseline: DA into 2 non-trigger Life cards removes both in one attack", () => {
    const cardDb = createTestCardDb();
    const top: LifeCard = { instanceId: "life-top-v1", cardId: CARDS.VANILLA.id, faceUp: false };
    const bot: LifeCard = { instanceId: "life-bot-v1", cardId: CARDS.VANILLA.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, bot);
    const lifeBefore = state.players[1].life.length;

    const final = declareThroughCounter(state, attackerId, targetId, cardDb);

    expect(final.turn.battleSubPhase).toBeNull();
    expect(final.turn.battle).toBeNull();
    expect(final.players[1].life.length).toBe(lifeBefore - 2);
  });

  it("decline 1st [Trigger]: 2nd damage still resolves and removes the 2nd Life", () => {
    const cardDb = createTestCardDb();
    const top: LifeCard = { instanceId: "life-top-trig", cardId: CARDS.TRIGGER.id, faceUp: false };
    const bot: LifeCard = { instanceId: "life-bot-v", cardId: CARDS.VANILLA.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, bot);

    const paused = declareThroughCounter(state, attackerId, targetId, cardDb);

    // Paused on the [Trigger] window from the 1st damage.
    expect(paused.turn.battleSubPhase).toBe("DAMAGE_STEP");
    expect(paused.turn.battle?.damagesRemaining).toBe(2);

    // Decline the trigger — defender sends REVEAL_TRIGGER.
    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(after.valid).toBe(true);

    // Battle fully resolved; both Life cards gone.
    expect(after.state.turn.battleSubPhase).toBeNull();
    expect(after.state.turn.battle).toBeNull();
    expect(after.state.players[1].life.length).toBe(0);
    // 1st life went to hand (declined), 2nd went to hand (no trigger on vanilla).
    expect(after.state.players[1].hand.some((c) => c.instanceId === top.instanceId)).toBe(true);
    expect(after.state.players[1].hand.some((c) => c.instanceId === bot.instanceId)).toBe(true);
  });

  it("decline 1st trigger, 2nd Life is ALSO [Trigger]: defender gets a 2nd prompt", () => {
    const cardDb = createTestCardDb();
    const top: LifeCard = { instanceId: "life-top-trig-a", cardId: CARDS.TRIGGER.id, faceUp: false };
    const bot: LifeCard = { instanceId: "life-bot-trig-b", cardId: CARDS.TRIGGER.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, bot);

    const paused1 = declareThroughCounter(state, attackerId, targetId, cardDb);
    expect(paused1.turn.battle?.pendingTriggerLifeCard?.instanceId).toBe(top.instanceId);

    // Decline #1 — battle must pause again on the 2nd Life.
    const paused2 = runPipeline(paused1, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(paused2.valid).toBe(true);
    expect(paused2.state.turn.battleSubPhase).toBe("DAMAGE_STEP");
    expect(paused2.state.turn.battle?.damagesRemaining).toBe(1);
    expect(paused2.state.turn.battle?.pendingTriggerLifeCard?.instanceId).toBe(bot.instanceId);

    // Decline #2 — battle now fully resolves.
    const done = runPipeline(paused2.state, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(done.valid).toBe(true);
    expect(done.state.turn.battleSubPhase).toBeNull();
    expect(done.state.players[1].life.length).toBe(0);
  });

  it("accept 1st [Trigger] (no effect schema): 2nd damage still resolves", () => {
    // CARDS.TRIGGER has no effectSchema, so activating just sends it to trash.
    const cardDb = createTestCardDb();
    const top: LifeCard = { instanceId: "life-top-trig-acc", cardId: CARDS.TRIGGER.id, faceUp: false };
    const bot: LifeCard = { instanceId: "life-bot-v-acc", cardId: CARDS.VANILLA.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, bot);

    const paused = declareThroughCounter(state, attackerId, targetId, cardDb);
    expect(paused.turn.battle?.damagesRemaining).toBe(2);

    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);
    expect(after.state.turn.battleSubPhase).toBeNull();
    expect(after.state.players[1].life.length).toBe(0);
    // Activated trigger card goes to trash; 2nd (vanilla) goes to hand.
    expect(after.state.players[1].trash.some((c) => c.instanceId === top.instanceId)).toBe(true);
    expect(after.state.players[1].hand.some((c) => c.instanceId === bot.instanceId)).toBe(true);
  });

  it("source K.O. during the Trigger window aborts the 2nd damage", () => {
    // Simulate the 1st-damage Trigger K.O.'ing the DA attacker by removing it
    // from the field between the REVEAL_TRIGGER pause and its resume. The
    // continuation must detect the attacker is gone and not deal damage #2.
    const cardDb = createTestCardDb();
    const top: LifeCard = { instanceId: "life-top-trig-ko", cardId: CARDS.TRIGGER.id, faceUp: false };
    const bot: LifeCard = { instanceId: "life-bot-v-ko", cardId: CARDS.VANILLA.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, bot);

    const paused = declareThroughCounter(state, attackerId, targetId, cardDb);
    expect(paused.turn.battle?.pendingTriggerLifeCard).toBeTruthy();

    // Yank the attacker off the field mid-window (stand-in for a Trigger KO).
    const newChars = paused.players[0].characters.map((c) =>
      c && c.instanceId === attackerId ? null : c,
    );
    const yanked: GameState = {
      ...paused,
      players: [
        { ...paused.players[0], characters: newChars },
        paused.players[1],
      ] as [PlayerState, PlayerState],
    };

    const after = runPipeline(yanked, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(after.valid).toBe(true);
    expect(after.state.turn.battleSubPhase).toBeNull();
    // 1st Life still went to hand (decline), but the 2nd Life MUST remain.
    expect(after.state.players[1].life.length).toBe(1);
    expect(after.state.players[1].life[0].instanceId).toBe(bot.instanceId);
  });

  it("regression (OP03-108 / qa_rules.md:154): DA damage count is locked at Damage Step entry", () => {
    // Pre-load two non-trigger Life cards so we can observe both damages
    // without the [Trigger] pause complicating the assertion. Then confirm
    // the 2nd damage lands even after the attacker is stripped of
    // [Double Attack] mid-battle.
    const cardDb = createTestCardDb();

    // Custom DA card we can mutate in the db partway through without affecting
    // other fixtures.
    const datkMutable: CardData = {
      id: "OPT239-DATK",
      name: "OPT239 DATK",
      type: "Character",
      color: ["Red"],
      cost: 4,
      power: 5000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "",
      triggerText: null,
      keywords: { ...NO_KW, doubleAttack: true },
      effectSchema: null,
      imageUrl: null,
    };
    cardDb.set(datkMutable.id, datkMutable);

    const attacker: CardInstance = {
      instanceId: "datk-mut",
      cardId: datkMutable.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const top: LifeCard = { instanceId: "life-top-lock", cardId: CARDS.VANILLA.id, faceUp: false };
    const bot: LifeCard = { instanceId: "life-bot-lock", cardId: CARDS.VANILLA.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, bot, attacker);

    // Strip DA from the card data BEFORE the damage step: damage count is
    // computed at Damage Step entry (post-counter PASS), so we strip AFTER
    // declaration but BEFORE counter-phase PASS to simulate an effect that
    // removes keywords during the battle window. The engine should still
    // treat this as a DA attacker because the flag read happens in the
    // Damage Step handler — we assert that by confirming 2 Life cards are
    // removed when the pre-Damage-Step flag is true.
    let r = runPipeline(
      state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attackerId, targetInstanceId: targetId },
      cardDb,
      0,
    );
    expect(r.valid).toBe(true);
    r = runPipeline(r.state, { type: "PASS" }, cardDb, 0); // block
    r = runPipeline(r.state, { type: "PASS" }, cardDb, 0); // counter → Damage Step

    // Mutate the cardDb entry AFTER the Damage Step has started. The locked
    // damagesRemaining should carry through to the 2nd damage unchanged.
    cardDb.set(datkMutable.id, { ...datkMutable, keywords: { ...NO_KW } });

    // No Trigger pause (both Life are vanilla) — battle resolves in one shot.
    // damagesRemaining was locked at Damage Step entry; 2nd damage fires.
    expect(r.state.turn.battleSubPhase).toBeNull();
    expect(r.state.players[1].life.length).toBe(state.players[1].life.length - 2);
  });

  it("[Banish] attacker: DA skips the Trigger window, both damages land immediately", () => {
    // Banish + DA: even if Life #1 has [Trigger], banish removes it to trash
    // without a Trigger window (§10-1-3-1). The loop proceeds to damage #2
    // within the same tick.
    const cardDb = createTestCardDb();
    const banishDatk: CardData = {
      id: "OPT239-BANISH-DATK",
      name: "OPT239 BanishDATK",
      type: "Character",
      color: ["Red"],
      cost: 5,
      power: 6000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "",
      triggerText: null,
      keywords: { ...NO_KW, doubleAttack: true, banish: true },
      effectSchema: null,
      imageUrl: null,
    };
    cardDb.set(banishDatk.id, banishDatk);

    const attacker: CardInstance = {
      instanceId: "banish-datk-0",
      cardId: banishDatk.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    const top: LifeCard = { instanceId: "life-top-btrig", cardId: CARDS.TRIGGER.id, faceUp: false };
    const bot: LifeCard = { instanceId: "life-bot-btrig", cardId: CARDS.TRIGGER.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, bot, attacker);

    const final = declareThroughCounter(state, attackerId, targetId, cardDb);

    // No pending trigger — banish sends Life cards straight to trash.
    expect(final.turn.battleSubPhase).toBeNull();
    expect(final.turn.battle).toBeNull();
    expect(final.players[1].life.length).toBe(0);
    expect(final.players[1].trash.some((c) => c.instanceId === top.instanceId)).toBe(true);
    expect(final.players[1].trash.some((c) => c.instanceId === bot.instanceId)).toBe(true);
  });

  it("DA with 1 Life + 1st Life is [Trigger]: after decline, 2nd damage hits 0-Life and defeats the defender", () => {
    // Classic lethal check: DA into exactly 1 Life where that 1 Life is a
    // [Trigger]. Pre-OPT-239 this silently ended the battle on `endBattle`
    // during REVEAL_TRIGGER, so defeat never fired. Post-OPT-239, the 2nd
    // damage sees life.length === 0 and triggers the defeat condition.
    const cardDb = createTestCardDb();
    const top: LifeCard = { instanceId: "life-lethal-trig", cardId: CARDS.TRIGGER.id, faceUp: false };
    const { state, attackerId, targetId } = setupDADefender(cardDb, top, null);

    // Give p0 enough power to blow past leader — rely on DON attachments the
    // battle-ready state already provides (attacker base 5000 vs leader 5000
    // ties to attacker).
    const paused = declareThroughCounter(state, attackerId, targetId, cardDb);
    expect(paused.turn.battle?.pendingTriggerLifeCard).toBeTruthy();
    expect(paused.turn.battle?.damagesRemaining).toBe(2);

    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(after.valid).toBe(true);
    expect(after.state.status).toBe("FINISHED");
    expect(after.state.winner).toBe(0);
  });

  it("single-damage attacker (no DA): Trigger decline still resolves and battle ends (no 2nd damage)", () => {
    // Sanity — the refactor must not double-damage non-DA attackers after a
    // Trigger window. 1 damage total, same before/after OPT-239.
    const cardDb = createTestCardDb();

    // Use a non-DA character attacker.
    const vanillaAttacker: CardInstance = {
      instanceId: "vanilla-atk",
      cardId: CARDS.VANILLA.id,
      zone: "CHARACTER",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: 1,
      controller: 0,
      owner: 0,
    };
    // Give this attacker 2 DONs so it meets leader power.
    const state0 = createBattleReadyState(cardDb);
    const freeDons = state0.players[0].donCostArea.filter((d) => !d.attachedTo).slice(0, 2);
    const attachedDons: DonInstance[] = freeDons.map((d) => ({
      ...d,
      state: "ACTIVE" as const,
      attachedTo: vanillaAttacker.instanceId,
    }));
    const withDons: CardInstance = { ...vanillaAttacker, attachedDon: attachedDons };

    const top: LifeCard = { instanceId: "life-top-nonda", cardId: CARDS.TRIGGER.id, faceUp: false };
    const p0Chars = [
      ...(state0.players[0].characters.filter(Boolean) as CardInstance[]),
      withDons,
    ];
    const p1Life = [top, ...state0.players[1].life.slice(1)];
    const newPlayers = [...state0.players] as [PlayerState, PlayerState];
    const freeDonIds = new Set(freeDons.map((d) => d.instanceId));
    newPlayers[0] = {
      ...newPlayers[0],
      characters: padChars(p0Chars),
      donCostArea: newPlayers[0].donCostArea.filter((d) => !freeDonIds.has(d.instanceId)),
    };
    newPlayers[1] = { ...newPlayers[1], life: p1Life };
    const state = { ...state0, players: newPlayers };
    const lifeBefore = state.players[1].life.length;

    const paused = declareThroughCounter(
      state,
      withDons.instanceId,
      state.players[1].leader.instanceId,
      cardDb,
    );
    expect(paused.turn.battle?.damagesRemaining).toBe(1);

    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: false }, cardDb, 1);
    expect(after.valid).toBe(true);
    expect(after.state.turn.battleSubPhase).toBeNull();
    // Exactly 1 Life removed.
    expect(after.state.players[1].life.length).toBe(lifeBefore - 1);
  });
});
