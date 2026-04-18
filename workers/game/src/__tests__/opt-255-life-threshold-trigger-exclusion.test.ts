/**
 * OPT-255 F2 — Life-threshold [Trigger] excludes the triggering card from count.
 *
 * Per Bandai rulings for cards like OP09-100 Karasu and OP09-112 Belo Betty:
 * when a Life [Trigger] checks "if you have ≤N Life cards", the revealed Life
 * card itself is NOT counted — at the moment the Trigger resolves it has
 * already been pulled from the Life zone into the resolution path.
 *
 * Engine invariant under test: `dealOneLeaderDamage` pops the Life card via
 * `removeTopLifeCard` BEFORE the Trigger window opens (battle.ts). The trigger
 * block's condition evaluator therefore reads `player.life.length` post-pop,
 * i.e. the correct "during-resolution" count. These tests lock that ordering.
 */

import { describe, it, expect } from "vitest";
import type {
  CardData,
  GameState,
  LifeCard,
  PlayerState,
} from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { runPipeline } from "../engine/pipeline.js";
import {
  CARDS,
  createBattleReadyState,
  createTestCardDb,
} from "./helpers.js";

// ─── Test card factory ──────────────────────────────────────────────────────

function makeLifeTriggerCard(
  id: string,
  conditions: EffectSchema["effects"][number]["conditions"],
): CardData {
  const schema: EffectSchema = {
    card_id: id,
    card_name: id,
    card_type: "Character",
    effects: [
      {
        id: "trigger_threshold_draw",
        category: "auto",
        trigger: { keyword: "TRIGGER" },
        conditions,
        actions: [{ type: "DRAW", params: { amount: 1 } }],
      },
    ],
  };
  return {
    id,
    name: id,
    type: "Character",
    color: ["Red"],
    cost: 3,
    power: 4000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "",
    triggerText: `[Trigger] If threshold met, draw 1.`,
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

// ─── Fixture: single-attack battle pointing at defender's Leader ────────────
//
// Use the active player's Leader (power 5000) as the attacker against the
// defending Leader (power 5000). A tie attack deals damage to the defender
// (§10-1-4-2), triggering exactly one life reveal.

function setupLeaderAttack(
  cardDb: Map<string, CardData>,
  defenderLife: LifeCard[],
  attackerLife?: LifeCard[],
): { state: GameState; attackerId: string; targetId: string } {
  const state0 = createBattleReadyState(cardDb);

  const newPlayers = [...state0.players] as [PlayerState, PlayerState];
  if (attackerLife) newPlayers[0] = { ...newPlayers[0], life: attackerLife };
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("OPT-255 F2 — Life-threshold [Trigger] excludes the triggering card from count", () => {
  it("SELF life=2 with '≤1' threshold: trigger FIRES (post-exclusion count = 1)", () => {
    const cardDb = createTestCardDb();
    const threshCard = makeLifeTriggerCard("TEST-LT-SELF-1", {
      type: "LIFE_COUNT",
      controller: "SELF",
      operator: "<=",
      value: 1,
    });
    cardDb.set(threshCard.id, threshCard);

    const top: LifeCard = { instanceId: "life-top", cardId: threshCard.id, face: "DOWN" as const };
    const bot: LifeCard = { instanceId: "life-bot", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const { state, attackerId, targetId } = setupLeaderAttack(cardDb, [top, bot]);

    const p1HandBefore = state.players[1].hand.length;
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);
    const pendingLife = (paused.turn.battle as { pendingTriggerLifeCard?: LifeCard } | null)
      ?.pendingTriggerLifeCard;
    expect(pendingLife?.instanceId).toBe(top.instanceId);

    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);

    // Trigger condition satisfied → DRAW happened.
    expect(after.state.players[1].hand.length).toBe(p1HandBefore + 1);
    // Triggering card went to trash (activated path).
    expect(after.state.players[1].trash.some((c) => c.instanceId === top.instanceId)).toBe(true);
    // Post-battle life is exactly the untouched bottom card.
    expect(after.state.players[1].life.length).toBe(1);
    expect(after.state.players[1].life[0].instanceId).toBe(bot.instanceId);
  });

  it("SELF life=3 with '≤1' threshold: trigger does NOT fire (post-exclusion count = 2)", () => {
    const cardDb = createTestCardDb();
    const threshCard = makeLifeTriggerCard("TEST-LT-SELF-1-NEG", {
      type: "LIFE_COUNT",
      controller: "SELF",
      operator: "<=",
      value: 1,
    });
    cardDb.set(threshCard.id, threshCard);

    const top: LifeCard = { instanceId: "life-top", cardId: threshCard.id, face: "DOWN" as const };
    const mid: LifeCard = { instanceId: "life-mid", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const bot: LifeCard = { instanceId: "life-bot", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const { state, attackerId, targetId } = setupLeaderAttack(cardDb, [top, mid, bot]);

    const p1HandBefore = state.players[1].hand.length;
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);
    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);

    // Condition unsatisfied (2 life remain > 1) → no DRAW.
    expect(after.state.players[1].hand.length).toBe(p1HandBefore);
  });

  it("SELF life=1 with '=0' threshold: trigger FIRES (post-exclusion count = 0)", () => {
    const cardDb = createTestCardDb();
    const threshCard = makeLifeTriggerCard("TEST-LT-SELF-0", {
      type: "LIFE_COUNT",
      controller: "SELF",
      operator: "==",
      value: 0,
    });
    cardDb.set(threshCard.id, threshCard);

    const top: LifeCard = { instanceId: "life-top", cardId: threshCard.id, face: "DOWN" as const };
    const { state, attackerId, targetId } = setupLeaderAttack(cardDb, [top]);

    const p1HandBefore = state.players[1].hand.length;
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);
    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);

    expect(after.state.players[1].hand.length).toBe(p1HandBefore + 1);
    expect(after.state.players[1].life.length).toBe(0);
  });

  it("OPPONENT-side threshold reads attacker's life unchanged (no exclusion applies to opp)", () => {
    // Condition targets OPPONENT life (= the attacker here). Attacker's life
    // count is NOT decremented by the damage, so the threshold should read
    // the unchanged attacker count.
    const cardDb = createTestCardDb();
    const threshCard = makeLifeTriggerCard("TEST-LT-OPP-2", {
      type: "LIFE_COUNT",
      controller: "OPPONENT",
      operator: "<=",
      value: 2,
    });
    cardDb.set(threshCard.id, threshCard);

    const top: LifeCard = { instanceId: "life-top", cardId: threshCard.id, face: "DOWN" as const };
    const bot: LifeCard = { instanceId: "life-bot", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const attackerLife: LifeCard[] = [
      { instanceId: "p0-life-a", cardId: CARDS.VANILLA.id, face: "DOWN" as const },
      { instanceId: "p0-life-b", cardId: CARDS.VANILLA.id, face: "DOWN" as const },
    ];
    const { state, attackerId, targetId } = setupLeaderAttack(cardDb, [top, bot], attackerLife);

    const p1HandBefore = state.players[1].hand.length;
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);
    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);

    // OPP (p0) has 2 life → threshold satisfied → DRAW.
    expect(after.state.players[1].hand.length).toBe(p1HandBefore + 1);
  });

  it("COMBINED_TOTAL threshold excludes the triggering card from the total", () => {
    // p0 life=4, p1 life=2 (top = threshold card). Post-exclusion: 4+1 = 5.
    // Threshold "≤ 5" must fire. Without exclusion (4+2=6) it would not.
    const cardDb = createTestCardDb();
    const threshCard = makeLifeTriggerCard("TEST-LT-COMBINED-5", {
      type: "COMBINED_TOTAL",
      metric: "LIFE_COUNT",
      operator: "<=",
      value: 5,
    });
    cardDb.set(threshCard.id, threshCard);

    const top: LifeCard = { instanceId: "life-top", cardId: threshCard.id, face: "DOWN" as const };
    const bot: LifeCard = { instanceId: "life-bot", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const attackerLife: LifeCard[] = Array.from({ length: 4 }, (_, i) => ({
      instanceId: `p0-life-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN" as const,
    }));
    const { state, attackerId, targetId } = setupLeaderAttack(cardDb, [top, bot], attackerLife);

    const p1HandBefore = state.players[1].hand.length;
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);
    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);

    expect(after.state.players[1].hand.length).toBe(p1HandBefore + 1);
  });

  it("COMBINED_TOTAL threshold negative: p0=4 life, p1=3 life → post-exclusion 4+2=6 > 5, no fire", () => {
    const cardDb = createTestCardDb();
    const threshCard = makeLifeTriggerCard("TEST-LT-COMBINED-5-NEG", {
      type: "COMBINED_TOTAL",
      metric: "LIFE_COUNT",
      operator: "<=",
      value: 5,
    });
    cardDb.set(threshCard.id, threshCard);

    const top: LifeCard = { instanceId: "life-top", cardId: threshCard.id, face: "DOWN" as const };
    const mid: LifeCard = { instanceId: "life-mid", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const bot: LifeCard = { instanceId: "life-bot", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const attackerLife: LifeCard[] = Array.from({ length: 4 }, (_, i) => ({
      instanceId: `p0-life-${i}`,
      cardId: CARDS.VANILLA.id,
      face: "DOWN" as const,
    }));
    const { state, attackerId, targetId } = setupLeaderAttack(cardDb, [top, mid, bot], attackerLife);

    const p1HandBefore = state.players[1].hand.length;
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);
    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);

    expect(after.state.players[1].hand.length).toBe(p1HandBefore);
  });

  it("effect body query 'for each of your Life' sees post-exclusion count", () => {
    // Use a condition-free trigger whose action draws `LIFE_COUNT` cards.
    // Defender has 3 life → reveal → 2 remain → draw 2 (not 3).
    const schema: EffectSchema = {
      card_id: "TEST-LT-BODY-COUNT",
      card_name: "TEST-LT-BODY-COUNT",
      card_type: "Character",
      effects: [
        {
          id: "trigger_draw_per_life",
          category: "auto",
          trigger: { keyword: "TRIGGER" },
          actions: [
            { type: "DRAW", params: { amount: { type: "GAME_STATE", source: "LIFE_COUNT", controller: "SELF" } } },
          ],
        },
      ],
    };
    const data: CardData = {
      id: "TEST-LT-BODY-COUNT",
      name: "TEST-LT-BODY-COUNT",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 4000,
      counter: null,
      life: null,
      attribute: [],
      types: [],
      effectText: "",
      triggerText: null,
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
    const cardDb = createTestCardDb();
    cardDb.set(data.id, data);

    const top: LifeCard = { instanceId: "life-top", cardId: data.id, face: "DOWN" as const };
    const mid: LifeCard = { instanceId: "life-mid", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const bot: LifeCard = { instanceId: "life-bot", cardId: CARDS.VANILLA.id, face: "DOWN" as const };
    const { state, attackerId, targetId } = setupLeaderAttack(cardDb, [top, mid, bot]);

    const p1HandBefore = state.players[1].hand.length;
    const paused = declareAttackThroughCounter(state, attackerId, targetId, cardDb);
    const after = runPipeline(paused, { type: "REVEAL_TRIGGER", reveal: true }, cardDb, 1);
    expect(after.valid).toBe(true);

    // Remaining life = 2 → draw 2 cards (not 3).
    expect(after.state.players[1].hand.length).toBe(p1HandBefore + 2);
  });
});
