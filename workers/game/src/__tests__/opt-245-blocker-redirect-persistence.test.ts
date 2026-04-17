/**
 * OPT-245 — Blocker redirect persistence (D7).
 *
 * Per Bandai rulings: once an attack has been redirected (by a [Blocker]
 * activating, or by an effect like OP14-060 Oh Come My Way), the new target
 * is fixed for the remainder of the battle. Subsequent condition changes
 * (hand size shrinking/growing, power dropping below a gate, etc.) do NOT
 * retroactively un-redirect the attack.
 *
 * The rules don't state this explicitly — it emerges from:
 *   - the Block Step window closing after one [Blocker] activates (§7-1-2-1)
 *   - permanent conditional grants being checked on-demand, not cached
 *   - recalculateBattlePowers recomputing power only, never re-validating the target
 *
 * Prerequisite fixes in this PR:
 *   - validation.ts now checks hasGrantedKeyword for [Blocker] / [Unblockable],
 *     so cards like OP06-054 Borsalino / OP11-057 Pedro / P-004 (conditional
 *     [Blocker] via permanent GRANT_KEYWORD) and ST29-016 (granted
 *     [Unblockable]) can be evaluated correctly at Block Step.
 */

import { describe, it, expect } from "vitest";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import type { RuntimeActiveEffect } from "../engine/effect-types.js";
import { createTestCardDb, createBattleReadyState, CARDS, padChars } from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";
import { executeRedirectAttack } from "../engine/effect-resolver/actions/battle-actions.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a permanent GRANT_KEYWORD effect with a HAND_COUNT condition. */
function makeConditionalBlockerGrant(
  sourceInstanceId: string,
  controller: 0 | 1,
  handLimit: number,
): RuntimeActiveEffect {
  return {
    id: `grant-blocker-${sourceInstanceId}`,
    sourceCardInstanceId: sourceInstanceId,
    sourceEffectBlockId: "block-1",
    category: "permanent",
    conditions: { type: "HAND_COUNT", controller: "SELF", operator: "<=", value: handLimit },
    modifiers: [
      { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "BLOCKER" } },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller,
    appliesTo: [sourceInstanceId],
    timestamp: 1,
  };
}

/** Build a permanent GRANT_KEYWORD Unblockable effect (no condition). */
function makeUnblockableGrant(
  sourceInstanceId: string,
  controller: 0 | 1,
): RuntimeActiveEffect {
  return {
    id: `grant-unblk-${sourceInstanceId}`,
    sourceCardInstanceId: sourceInstanceId,
    sourceEffectBlockId: "block-1",
    category: "permanent",
    modifiers: [
      { type: "GRANT_KEYWORD", target: { type: "SELF" }, params: { keyword: "UNBLOCKABLE" } },
    ],
    duration: { type: "PERMANENT" },
    expiresAt: { wave: "SOURCE_LEAVES_ZONE" },
    controller,
    appliesTo: [sourceInstanceId],
    timestamp: 1,
  };
}

/** Add N filler cards to a player's hand; returns new state. */
function setHandSize(state: GameState, playerIndex: 0 | 1, size: number): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  const filler: CardInstance[] = [];
  for (let i = 0; i < size; i++) {
    filler.push({
      instanceId: `hand-${playerIndex}-${i}`,
      cardId: CARDS.VANILLA.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: playerIndex,
      owner: playerIndex,
    });
  }
  players[playerIndex] = { ...players[playerIndex], hand: filler };
  return { ...state, players };
}

/** Build a battle-ready state with a "vanilla" character owned by player 1
 *  at slot 0 that we can treat as our Borsalino-like conditional blocker. */
function buildConditionalBlockerState(handLimit: number, currentHand: number): {
  state: GameState;
  cardDb: Map<string, CardData>;
  blocker: CardInstance;
  attacker: CardInstance;
  leader: CardInstance;
} {
  const cardDb = createTestCardDb();
  let state = createBattleReadyState(cardDb);

  // Replace player 1's slot-0 character with a plain VANILLA-typed instance
  // (no printed [Blocker]) so we can layer on a conditional grant.
  const conditionalBlocker: CardInstance = {
    instanceId: "p1-conditional-blocker",
    cardId: CARDS.VANILLA.id,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: 1,
    owner: 1,
  };
  const p1Chars = [...state.players[1].characters];
  p1Chars[0] = conditionalBlocker;
  const players = [...state.players] as [PlayerState, PlayerState];
  players[1] = { ...players[1], characters: padChars(p1Chars.filter((c): c is CardInstance => c !== null)) };
  state = { ...state, players };

  // Attach the conditional grant as an active effect
  const grant = makeConditionalBlockerGrant(conditionalBlocker.instanceId, 1, handLimit);
  state = { ...state, activeEffects: [grant] as GameState["activeEffects"] };

  // Seed defender's hand to the desired size
  state = setHandSize(state, 1, currentHand);

  return {
    state,
    cardDb,
    blocker: conditionalBlocker,
    attacker: state.players[0].characters[0]!,
    leader: state.players[1].leader,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("OPT-245 D7: Blocker redirect persistence", () => {
  it("allows a conditional [Blocker] grant to declare block (validation layer)", () => {
    // Borsalino-style: gains [Blocker] when hand ≤ 5.
    const { state, cardDb, blocker, attacker, leader } = buildConditionalBlockerState(5, 5);

    let r = runPipeline(state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: leader.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);

    r = runPipeline(r.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);
    expect(r.state.turn.battle!.targetInstanceId).toBe(blocker.instanceId);
    expect(r.state.turn.battle!.blockerActivated).toBe(true);
  });

  it("rejects a conditional [Blocker] when the condition is not met", () => {
    // Hand = 6, condition requires ≤ 5 — block should be rejected.
    const { state, cardDb, blocker, attacker, leader } = buildConditionalBlockerState(5, 6);

    let r = runPipeline(state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: leader.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);

    r = runPipeline(r.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("[Blocker]");
  });

  it("keeps the target fixed when the blocker's condition lapses mid-battle", () => {
    // Hand = 5 at block time (condition met).
    const { state, cardDb, blocker, attacker, leader } = buildConditionalBlockerState(5, 5);

    let r = runPipeline(state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: leader.instanceId },
      cardDb, 0);
    r = runPipeline(r.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);
    expect(r.state.turn.battle!.targetInstanceId).toBe(blocker.instanceId);
    expect(r.state.turn.battleSubPhase).toBe("COUNTER_STEP");

    // Mid-battle: hand grows to 6, condition no longer satisfied.
    const postBlockHandSize6 = setHandSize(r.state, 1, 6);

    // Advance through Counter Step and Damage Step.
    const afterCounter = runPipeline(postBlockHandSize6, { type: "PASS" }, cardDb, 0);
    expect(afterCounter.valid).toBe(true);

    // Target must still be the blocker at Damage Step entry.
    const charBattles = afterCounter.state.eventLog.filter((e) => e.type === "CHARACTER_BATTLES");
    expect(charBattles.length).toBe(1);
    expect((charBattles[0] as { payload: { targetInstanceId: string } }).payload.targetInstanceId)
      .toBe(blocker.instanceId);

    // Battle ended cleanly (not aborted).
    const endOfBattle = afterCounter.state.eventLog.filter((e) => e.type === "END_OF_BATTLE");
    expect(endOfBattle.length).toBe(1);
    expect((endOfBattle[0] as { payload: { aborted: boolean } }).payload.aborted).toBe(false);
  });

  it("still enforces one [Blocker] per battle even with mid-battle granted [Blocker]", () => {
    // Pedro-style gate (≤4) — defender blocks with Pedro, then a later effect
    // would grant [Blocker] to a sibling character. §7-1-2-1 says only one
    // blocker per battle, and the engine enforces this via blockerActivated.
    const { state, cardDb, blocker, attacker, leader } = buildConditionalBlockerState(4, 4);

    let r = runPipeline(state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: leader.instanceId },
      cardDb, 0);
    r = runPipeline(r.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);

    // Try to activate a second blocker (sibling) after block declaration.
    // Natural flow has moved to COUNTER_STEP; force BLOCK_STEP back on to
    // prove the blockerActivated guard holds even if the sub-phase were
    // somehow re-opened.
    const sibling = r.state.players[1].characters.find(
      (c) => c?.instanceId !== blocker.instanceId && c?.state === "ACTIVE",
    )!;
    const forced: GameState = {
      ...r.state,
      turn: { ...r.state.turn, battleSubPhase: "BLOCK_STEP" },
    };
    const r2 = runPipeline(forced,
      { type: "DECLARE_BLOCKER", blockerInstanceId: sibling.instanceId },
      cardDb, 0);
    expect(r2.valid).toBe(false);
    expect(r2.error).toContain("§7-1-2-1");
  });

  it("treats a granted [Unblockable] attacker as unblockable (ST29-016 case)", () => {
    // Attacker is a plain vanilla character, but has granted [Unblockable]
    // via active effect (modelling ST29-016 granting [Unblockable] to the
    // Luffy Leader). The defender holds a printed [Blocker]. Block must fail.
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);

    const attacker = state.players[0].characters[0]!;
    const printedBlocker = state.players[1].characters.find(
      (c) => c?.cardId === CARDS.BLOCKER.id,
    )!;
    const leader = state.players[1].leader;

    state = { ...state, activeEffects: [makeUnblockableGrant(attacker.instanceId, 0)] as GameState["activeEffects"] };

    let r = runPipeline(state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: leader.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);

    r = runPipeline(r.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: printedBlocker.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(false);
    expect(r.error).toContain("[Unblockable]");
  });

  it("keeps the redirected target fixed when a REDIRECT_ATTACK effect flips the target", () => {
    // OP14-060 case — effect mutates targetInstanceId mid-battle; subsequent
    // state does not un-redirect.
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;
    const originalTarget = state.players[1].leader;
    const newTargetCandidate = state.players[1].characters.find(
      (c) => c?.state === "ACTIVE",
    )!;

    let r = runPipeline(state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: originalTarget.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);
    expect(r.state.turn.battle!.targetInstanceId).toBe(originalTarget.instanceId);

    // Directly invoke the redirect action to simulate the [On Your Opponent's
    // Attack] effect resolving. Target selection is preselected to avoid the
    // interactive prompt path.
    const redirectResult = executeRedirectAttack(
      r.state,
      { type: "REDIRECT_ATTACK", target: { type: "LEADER_OR_CHARACTER", controller: "SELF", count: { exact: 1 } } },
      newTargetCandidate.instanceId, // source (unused for targeting since preselected)
      1, // controller = defender (player 1)
      cardDb,
      new Map(),
      [newTargetCandidate.instanceId],
    );
    expect(redirectResult.succeeded).toBe(true);
    expect(redirectResult.state.turn.battle!.targetInstanceId).toBe(newTargetCandidate.instanceId);

    // Advance through Block + Counter with PASS — target must remain the
    // redirected character throughout.
    let r2 = runPipeline(redirectResult.state, { type: "PASS" }, cardDb, 0);
    expect(r2.valid).toBe(true);
    expect(r2.state.turn.battle?.targetInstanceId ?? redirectResult.state.turn.battle!.targetInstanceId)
      .toBe(newTargetCandidate.instanceId);

    r2 = runPipeline(r2.state, { type: "PASS" }, cardDb, 0);
    expect(r2.valid).toBe(true);

    // Target at Damage Step is the redirected one.
    const charBattles = r2.state.eventLog.filter((e) => e.type === "CHARACTER_BATTLES");
    expect(charBattles.length).toBe(1);
    expect((charBattles[0] as { payload: { targetInstanceId: string } }).payload.targetInstanceId)
      .toBe(newTargetCandidate.instanceId);
  });

  it("aborts the battle if the redirected target leaves the field (D5 interaction)", () => {
    // OPT-243 semantics must still hold after redirect: if the new target
    // (the blocker) leaves mid-battle, the battle aborts without damage.
    const { state, cardDb, blocker, attacker, leader } = buildConditionalBlockerState(5, 5);

    let r = runPipeline(state,
      { type: "DECLARE_ATTACK", attackerInstanceId: attacker.instanceId, targetInstanceId: leader.instanceId },
      cardDb, 0);
    r = runPipeline(r.state,
      { type: "DECLARE_BLOCKER", blockerInstanceId: blocker.instanceId },
      cardDb, 0);
    expect(r.valid).toBe(true);

    // Remove the blocker from the field during Counter Step.
    const players = [...r.state.players] as [PlayerState, PlayerState];
    const p1Chars = players[1].characters.map((c) =>
      c?.instanceId === blocker.instanceId ? null : c,
    );
    players[1] = { ...players[1], characters: p1Chars as typeof players[1]["characters"] };
    const midBattle = { ...r.state, players };

    const afterPass = runPipeline(midBattle, { type: "PASS" }, cardDb, 0);
    expect(afterPass.valid).toBe(true);

    const aborts = afterPass.state.eventLog.filter((e) => e.type === "BATTLE_ABORTED");
    expect(aborts.length).toBe(1);
    expect((aborts[0] as { payload: { reason: string } }).payload.reason).toBe("TARGET_LEFT_FIELD");

    const damage = afterPass.state.eventLog.filter((e) => e.type === "DAMAGE_DEALT");
    expect(damage.length).toBe(0);
  });
});
