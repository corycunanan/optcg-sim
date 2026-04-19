/**
 * OPT-259 F6 — Life card [Trigger] activates ONLY on damage-driven reveal.
 *
 * Per Bandai rulings, a Life card's `[Trigger]` opens the reveal/activate
 * window ONLY when the opponent deals damage to the player's Life. No other
 * path that touches a Life card — look, reorder, flip, trash, send-to-deck,
 * or non-damage add-to-hand — may open a Trigger window, even if the
 * manipulated Life card has the [Trigger] keyword. Effect-sourced damage
 * (DEAL_DAMAGE) still counts as damage and must open the window.
 *
 * This suite locks:
 *   1. Battle damage opens the window (existing behavior, sanity check).
 *   2. Non-damage Life actions NEVER open the window, regardless of keyword:
 *      LIFE_SCRY, REORDER_ALL_LIFE, TURN_LIFE_FACE_UP, LIFE_TO_HAND,
 *      TRASH_FROM_LIFE, LIFE_CARD_TO_DECK.
 *   3. DEAL_DAMAGE opens the window and the loop pauses mid-sequence until
 *      the damaged player accepts or declines the Trigger, then resumes.
 *      (Regression fix: previously DEAL_DAMAGE moved Life→hand directly with
 *      no Trigger check at all.)
 *   4. SELF_TAKE_DAMAGE does NOT open a Trigger window — the FAQ gates the
 *      window on "opponent deals damage", which self-inflicted damage is not.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  CardInstance,
  GameState,
  LifeCard,
  PlayerState,
} from "../types.js";
import type { Action, EffectSchema } from "../engine/effect-types.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";
import {
  executeLifeScry,
  executeReorderAllLife,
  executeTurnLifeFaceUp,
  executeLifeToHand,
  executeTrashFromLife,
  executeLifeCardToDeck,
} from "../engine/effect-resolver/actions/life.js";
import { executeDealDamage, executeSelfTakeDamage } from "../engine/effect-resolver/actions/battle-actions.js";
import { runPipeline } from "../engine/pipeline.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A [Trigger] Character with a simple DRAW 1 trigger block, so activation
 *  is observable as a hand-size delta. */
function makeTriggerDrawCard(id: string): CardData {
  const schema: EffectSchema = {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: `${id}_trigger_draw`,
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        actions: [{ type: "DRAW", params: { amount: 1 } } as Action],
      },
    ],
  };
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 2000,
    counter: 1000,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: "[Trigger] Draw 1 card.",
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: true,
      unblockable: false,
    },
    effectSchema: schema,
    imageUrl: null,
  };
}

function setupTriggerLifeState(
  cardDb: Map<string, CardData>,
  triggerCardId: string,
  lifePlayer: 0 | 1 = 1,
  extraLife: LifeCard[] = [],
): { state: GameState; triggerLife: LifeCard } {
  const state0 = createBattleReadyState(cardDb);
  const triggerLife: LifeCard = {
    instanceId: `life-trig-${triggerCardId}`,
    cardId: triggerCardId,
    face: "DOWN",
  };
  const newPlayers = [...state0.players] as [PlayerState, PlayerState];
  newPlayers[lifePlayer] = { ...newPlayers[lifePlayer], life: [triggerLife, ...extraLife] };
  return {
    state: { ...state0, players: newPlayers },
    triggerLife,
  };
}

function setupBattleWithDefenderLife(
  cardDb: Map<string, CardData>,
  defenderLife: LifeCard[],
): { state: GameState; attackerId: string; targetId: string } {
  const state0 = createBattleReadyState(cardDb);
  const newPlayers = [...state0.players] as [PlayerState, PlayerState];
  newPlayers[1] = { ...newPlayers[1], life: defenderLife };
  const state = { ...state0, players: newPlayers };
  return {
    state,
    attackerId: state.players[0].leader.instanceId,
    targetId: state.players[1].leader.instanceId,
  };
}

function declareAttackThroughCounter(
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

// Convenience: empty resultRefs map expected by action handler signatures.
function emptyRefs() {
  return new Map<string, never>();
}

// ─── 1. Battle damage sanity check ──────────────────────────────────────────

describe("OPT-259 F6 — battle damage correctly opens the Trigger window", () => {
  it("attacking opens pendingTriggerLifeCard when the revealed Life has [Trigger]", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-BATTLE-TRIG");
    cardDb.set(trigger.id, trigger);

    const top: LifeCard = { instanceId: "life-top", cardId: trigger.id, face: "DOWN" };
    const { state, attackerId, targetId } = setupBattleWithDefenderLife(cardDb, [top]);
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);

    const pending = (paused.turn.battle as { pendingTriggerLifeCard?: LifeCard } | null)
      ?.pendingTriggerLifeCard;
    expect(pending?.instanceId).toBe(top.instanceId);
    // Life→hand has NOT yet happened — the card is suspended awaiting decision.
    expect(paused.players[1].hand.some((c) => c.instanceId === top.instanceId)).toBe(false);
    // Effect-damage bookkeeping stays untouched on battle damage.
    expect(paused.turn.pendingTriggerFromEffect ?? null).toBeNull();
  });

  it("attacking does NOT open a window when the revealed Life lacks [Trigger]", () => {
    const cardDb = createTestCardDb();
    const top: LifeCard = { instanceId: "life-vanilla", cardId: CARDS.VANILLA.id, face: "DOWN" };
    const { state, attackerId, targetId } = setupBattleWithDefenderLife(cardDb, [top]);
    const p1HandBefore = state.players[1].hand.length;
    const after = declareAttackThroughCounter(state, attackerId, targetId, cardDb);

    expect((after.turn.battle as { pendingTriggerLifeCard?: LifeCard } | null)
      ?.pendingTriggerLifeCard ?? null).toBeNull();
    // Went straight to hand.
    expect(after.players[1].hand.length).toBe(p1HandBefore + 1);
    expect(after.players[1].hand.some((c) => c.instanceId === top.instanceId)).toBe(true);
  });
});

// ─── 2. Non-damage Life actions — Trigger window must stay closed ───────────

describe("OPT-259 F6 — non-damage Life actions never open the Trigger window", () => {
  it("LIFE_SCRY (Katakuri look) does not fire [Trigger] even on a Life with the keyword", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-SCRY-TRIG");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 0);

    // Controller 0 scries their own top Life; look_at=1.
    const result = executeLifeScry(
      state,
      { type: "LIFE_SCRY", params: { look_at: 1 } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.events.some((e) => e.type === "LIFE_SCRIED")).toBe(true);
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    // Life stack is unchanged — scry does not pop the card.
    expect(result.state.players[0].life[0].instanceId).toBe(triggerLife.instanceId);
  });

  it("REORDER_ALL_LIFE (Viola) does not fire [Trigger]; the only pending prompt is the arrange prompt", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-REORDER-TRIG");
    cardDb.set(trigger.id, trigger);
    const extra: LifeCard = { instanceId: "life-vanilla-extra", cardId: CARDS.VANILLA.id, face: "DOWN" };
    const { state } = setupTriggerLifeState(cardDb, trigger.id, 0, [extra]);

    const result = executeReorderAllLife(
      state,
      { type: "REORDER_ALL_LIFE" } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    // Reorder emits an ARRANGE_TOP_CARDS pending prompt, NOT a reveal-trigger prompt.
    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
  });

  it("TURN_LIFE_FACE_UP (Pudding) does not fire [Trigger]", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-FLIP-TRIG");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 0);

    const result = executeTurnLifeFaceUp(
      state,
      { type: "TURN_LIFE_FACE_UP", params: { amount: 1, position: "TOP" } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.events.some((e) => e.type === "LIFE_CARD_FACE_CHANGED")).toBe(true);
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    // Card is still in Life, now face-up — not in hand.
    const stillInLife = result.state.players[0].life.find((l) => l.instanceId === triggerLife.instanceId);
    expect(stillInLife?.face).toBe("UP");
    expect(result.state.players[0].hand.some((c) => c.instanceId === triggerLife.instanceId)).toBe(false);
  });

  it("LIFE_TO_HAND (non-damage add-to-hand) does not fire [Trigger]", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-LTOH-TRIG");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 0);

    const result = executeLifeToHand(
      state,
      { type: "LIFE_TO_HAND", params: { amount: 1, position: "TOP" } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.events.some((e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE")).toBe(true);
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    // Card moved to hand directly — no Trigger mediation.
    expect(result.state.players[0].hand.some((c) => c.instanceId === triggerLife.instanceId)).toBe(true);
    expect(result.state.players[0].life).toHaveLength(0);
  });

  it("TRASH_FROM_LIFE does not fire [Trigger]", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-TRASH-TRIG");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 0);

    const result = executeTrashFromLife(
      state,
      { type: "TRASH_FROM_LIFE", params: { amount: 1, position: "TOP" } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.events.some((e) => e.type === "CARD_TRASHED")).toBe(true);
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    expect(result.state.players[0].trash.some((c) => c.instanceId === triggerLife.instanceId)).toBe(true);
  });

  it("LIFE_CARD_TO_DECK does not fire [Trigger]", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-LTOD-TRIG");
    cardDb.set(trigger.id, trigger);
    const { state } = setupTriggerLifeState(cardDb, trigger.id, 0);

    const result = executeLifeCardToDeck(
      state,
      { type: "LIFE_CARD_TO_DECK", params: { amount: 1, position: "BOTTOM" } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.events.some((e) => e.type === "LIFE_CARD_TO_DECK")).toBe(true);
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    expect(result.state.players[0].life).toHaveLength(0);
  });
});

// ─── 3. DEAL_DAMAGE — Trigger window DOES open (bug fix) ────────────────────

describe("OPT-259 F6 — DEAL_DAMAGE opens the Trigger window (regression)", () => {
  it("DEAL_DAMAGE amount=1 on opp Life w/ [Trigger] pauses, fires TRIGGER_ACTIVATED, and does not yet put the card in hand", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-DEAL-TRIG");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 1);

    // Player 0 deals 1 damage to opp (player 1) Life.
    const result = executeDealDamage(
      state,
      { type: "DEAL_DAMAGE", params: { amount: 1 } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    expect(result.succeeded).toBe(true);
    // Pending state parked on turn — NOT on battle (no battle is active).
    const pending = result.state.turn.pendingTriggerFromEffect;
    expect(pending).toBeTruthy();
    expect(pending?.lifeCard.instanceId).toBe(triggerLife.instanceId);
    expect(pending?.damagedPlayerIndex).toBe(1);
    expect(pending?.remainingDamages).toBe(0);
    // TRIGGER_ACTIVATED emitted; CARD_ADDED_TO_HAND_FROM_LIFE NOT yet.
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(true);
    expect(result.events.some((e) => e.type === "CARD_ADDED_TO_HAND_FROM_LIFE")).toBe(false);
    // Life popped, hand still empty.
    expect(result.state.players[1].life).toHaveLength(0);
    expect(result.state.players[1].hand.some((c) => c.instanceId === triggerLife.instanceId)).toBe(false);
  });

  it("Declining the DEAL_DAMAGE Trigger sends the Life card to hand", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-DEAL-DECLINE");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 1);

    const dealt = executeDealDamage(
      state,
      { type: "DEAL_DAMAGE", params: { amount: 1 } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    // Damaged player (1) declines via REVEAL_TRIGGER reveal=false.
    const after = runPipeline(
      dealt.state,
      { type: "REVEAL_TRIGGER", reveal: false },
      cardDb,
      1,
    );
    expect(after.valid).toBe(true);
    expect(after.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    expect(after.state.players[1].hand.some((c) => c.instanceId === triggerLife.instanceId)).toBe(true);
    expect(after.state.players[1].trash.some((c) => c.instanceId === triggerLife.instanceId)).toBe(false);
  });

  it("Accepting the DEAL_DAMAGE Trigger trashes the Life card and resolves the trigger block (DRAW 1)", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-DEAL-ACCEPT");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 1);

    const p1HandBefore = state.players[1].hand.length;
    const dealt = executeDealDamage(
      state,
      { type: "DEAL_DAMAGE", params: { amount: 1 } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    const after = runPipeline(
      dealt.state,
      { type: "REVEAL_TRIGGER", reveal: true },
      cardDb,
      1,
    );
    expect(after.valid).toBe(true);
    expect(after.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    // Trigger's DRAW 1 resolved — hand grew by 1 (the draw), but the Life card
    // itself was trashed (activated path §10-1-5-3).
    expect(after.state.players[1].trash.some((c) => c.instanceId === triggerLife.instanceId)).toBe(true);
    expect(after.state.players[1].hand.some((c) => c.instanceId === triggerLife.instanceId)).toBe(false);
    expect(after.state.players[1].hand.length).toBe(p1HandBefore + 1);
  });

  it("DEAL_DAMAGE amount=2 with trigger on 1st Life: pauses after damage 1; after decline, deals damage 2 normally", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-DEAL-MULTI");
    cardDb.set(trigger.id, trigger);
    const top: LifeCard = { instanceId: "multi-top", cardId: trigger.id, face: "DOWN" };
    const bot: LifeCard = { instanceId: "multi-bot", cardId: CARDS.VANILLA.id, face: "DOWN" };
    const state0 = createBattleReadyState(cardDb);
    const newPlayers = [...state0.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], life: [top, bot] };
    const state = { ...state0, players: newPlayers };

    const dealt = executeDealDamage(
      state,
      { type: "DEAL_DAMAGE", params: { amount: 2 } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    // Paused after 1st damage with 1 remaining damage queued.
    expect(dealt.state.turn.pendingTriggerFromEffect?.lifeCard.instanceId).toBe(top.instanceId);
    expect(dealt.state.turn.pendingTriggerFromEffect?.remainingDamages).toBe(1);
    // 2nd life card still in place.
    expect(dealt.state.players[1].life.map((l) => l.instanceId)).toEqual([bot.instanceId]);

    // Defender declines — 1st card goes to hand. Then the 2nd damage resumes
    // automatically: bot has no [Trigger], so it flows straight to hand.
    const after = runPipeline(
      dealt.state,
      { type: "REVEAL_TRIGGER", reveal: false },
      cardDb,
      1,
    );
    expect(after.valid).toBe(true);
    expect(after.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    // Both Life cards ended up in hand, Life zone empty.
    expect(after.state.players[1].life).toHaveLength(0);
    expect(after.state.players[1].hand.some((c) => c.instanceId === top.instanceId)).toBe(true);
    expect(after.state.players[1].hand.some((c) => c.instanceId === bot.instanceId)).toBe(true);
  });
});

// ─── 4. SELF_TAKE_DAMAGE — Trigger window stays closed ──────────────────────

describe("OPT-259 F6 — SELF_TAKE_DAMAGE does not open the Trigger window", () => {
  it("self-damage on own [Trigger] Life moves the card straight to hand, no prompt", () => {
    const cardDb = createTestCardDb();
    const trigger = makeTriggerDrawCard("OPT259-SELF-TRIG");
    cardDb.set(trigger.id, trigger);
    const { state, triggerLife } = setupTriggerLifeState(cardDb, trigger.id, 0);

    const result = executeSelfTakeDamage(
      state,
      { type: "SELF_TAKE_DAMAGE", params: { amount: 1 } } as Action,
      "src-dummy",
      0,
      cardDb,
      emptyRefs(),
    );

    expect(result.succeeded).toBe(true);
    expect(result.events.some((e) => e.type === "TRIGGER_ACTIVATED")).toBe(false);
    expect(result.state.turn.pendingTriggerFromEffect ?? null).toBeNull();
    // Self damage = not opponent damage → Trigger does not open; Life goes to hand.
    expect(result.state.players[0].hand.some((c) => c.instanceId === triggerLife.instanceId)).toBe(true);
    expect(result.state.players[0].life).toHaveLength(0);
  });
});
