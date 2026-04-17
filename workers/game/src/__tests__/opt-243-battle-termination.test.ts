/**
 * OPT-243 — Battle termination on attacker/target leaving field mid-step (D5).
 *
 * Per Bandai rulings: if the attacker OR target leaves the field during Attack,
 * Block, or Counter Step (via [On Block] trash, bounce, 5-character-limit, etc.)
 * the battle ENDS before Damage Step. Critically:
 *
 *   - `CHARACTER_BATTLES` does NOT publish (damage step never began)
 *   - `DAMAGE_DEALT` / `CARD_KO` do NOT fire
 *   - `BATTLE_ABORTED` fires with the reason (ATTACKER_LEFT_FIELD / TARGET_LEFT_FIELD)
 *   - `END_OF_BATTLE` still fires as cleanup, with `aborted: true`
 *
 * Normal battles emit `CHARACTER_BATTLES` at Damage Step entry and
 * `END_OF_BATTLE` with `aborted: false`.
 */

import { describe, it, expect } from "vitest";
import type { CardData, GameEvent, GameEventType, GameState, PlayerState } from "../types.js";
import { createTestCardDb, createBattleReadyState, padChars } from "./helpers.js";
import { runPipeline } from "../engine/pipeline.js";
import { moveCard } from "../engine/state.js";

function findEvents<T extends GameEventType>(
  state: GameState,
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return state.eventLog.filter(
    (e): e is Extract<GameEvent, { type: T }> => e.type === type,
  );
}

function declareAttackAndPassBlock(
  state: GameState,
  attackerInstanceId: string,
  targetInstanceId: string,
  cardDb: Map<string, CardData>,
): GameState {
  let result = runPipeline(
    state,
    { type: "DECLARE_ATTACK", attackerInstanceId, targetInstanceId },
    cardDb,
    state.turn.activePlayerIndex,
  );
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex);
  expect(result.valid).toBe(true);
  return result.state;
}

describe("OPT-243 D5: Battle termination on mid-step removal", () => {
  it("aborts when the attacker leaves the field during Counter Step", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;
    const target = state.players[1].leader;

    // Advance to COUNTER_STEP, then remove the attacker mid-battle
    let midBattle = declareAttackAndPassBlock(state, attacker.instanceId, target.instanceId, cardDb);
    expect(midBattle.turn.battleSubPhase).toBe("COUNTER_STEP");

    midBattle = moveCard(midBattle, attacker.instanceId, "TRASH");

    const afterPass = runPipeline(
      midBattle,
      { type: "PASS" },
      cardDb,
      midBattle.turn.activePlayerIndex,
    );
    expect(afterPass.valid).toBe(true);

    const aborts = findEvents(afterPass.state, "BATTLE_ABORTED");
    expect(aborts.length).toBe(1);
    expect(aborts[0].payload.reason).toBe("ATTACKER_LEFT_FIELD");
    expect(aborts[0].payload.attackerInstanceId).toBe(attacker.instanceId);

    // No CHARACTER_BATTLES, no damage
    expect(findEvents(afterPass.state, "CHARACTER_BATTLES").length).toBe(0);
    expect(findEvents(afterPass.state, "DAMAGE_DEALT").length).toBe(0);
    expect(findEvents(afterPass.state, "COMBAT_VICTORY").length).toBe(0);

    // END_OF_BATTLE fires with aborted: true
    const ends = findEvents(afterPass.state, "END_OF_BATTLE");
    expect(ends.length).toBe(1);
    expect(ends[0].payload.aborted).toBe(true);

    // Battle state cleared
    expect(afterPass.state.turn.battle).toBeNull();
    expect(afterPass.state.turn.battleSubPhase).toBeNull();
  });

  it("aborts when the target leaves the field during Counter Step", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;
    const target = state.players[1].characters[0]!; // character target, not leader

    // Rest the target so it's a legal attack target.
    const p1Chars = [...state.players[1].characters];
    p1Chars[0] = { ...target, state: "RESTED" };
    const newPlayers = [...state.players] as [PlayerState, PlayerState];
    newPlayers[1] = { ...newPlayers[1], characters: p1Chars };
    state = { ...state, players: newPlayers };

    let midBattle = declareAttackAndPassBlock(state, attacker.instanceId, target.instanceId, cardDb);
    expect(midBattle.turn.battleSubPhase).toBe("COUNTER_STEP");

    midBattle = moveCard(midBattle, target.instanceId, "TRASH");

    const afterPass = runPipeline(
      midBattle,
      { type: "PASS" },
      cardDb,
      midBattle.turn.activePlayerIndex,
    );
    expect(afterPass.valid).toBe(true);

    const aborts = findEvents(afterPass.state, "BATTLE_ABORTED");
    expect(aborts.length).toBe(1);
    expect(aborts[0].payload.reason).toBe("TARGET_LEFT_FIELD");
    expect(aborts[0].payload.targetInstanceId).toBe(target.instanceId);

    expect(findEvents(afterPass.state, "CHARACTER_BATTLES").length).toBe(0);
    expect(findEvents(afterPass.state, "DAMAGE_DEALT").length).toBe(0);
    expect(findEvents(afterPass.state, "COMBAT_VICTORY").length).toBe(0);
    expect(findEvents(afterPass.state, "CARD_KO").length).toBe(0);

    const ends = findEvents(afterPass.state, "END_OF_BATTLE");
    expect(ends.length).toBe(1);
    expect(ends[0].payload.aborted).toBe(true);
  });

  it("completes normally when both combatants remain on the field", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;
    const target = state.players[1].leader;

    // Full attack: DECLARE_ATTACK → PASS (block) → PASS (counter) → Damage Step
    const midBattle = declareAttackAndPassBlock(state, attacker.instanceId, target.instanceId, cardDb);
    const afterPass = runPipeline(
      midBattle,
      { type: "PASS" },
      cardDb,
      midBattle.turn.activePlayerIndex,
    );
    expect(afterPass.valid).toBe(true);

    // CHARACTER_BATTLES fires exactly once at Damage Step entry
    const charBattles = findEvents(afterPass.state, "CHARACTER_BATTLES");
    expect(charBattles.length).toBe(1);
    expect(charBattles[0].payload.cardInstanceId).toBe(attacker.instanceId);
    expect(charBattles[0].payload.targetInstanceId).toBe(target.instanceId);

    // END_OF_BATTLE fires with aborted: false
    const ends = findEvents(afterPass.state, "END_OF_BATTLE");
    expect(ends.length).toBe(1);
    expect(ends[0].payload.aborted).toBe(false);

    // No abort event
    expect(findEvents(afterPass.state, "BATTLE_ABORTED").length).toBe(0);
  });

  it("does not emit CHARACTER_BATTLES at ATTACK_DECLARED (deferred to Damage Step)", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;

    const result = runPipeline(
      state,
      {
        type: "DECLARE_ATTACK",
        attackerInstanceId: attacker.instanceId,
        targetInstanceId: state.players[1].leader.instanceId,
      },
      cardDb,
      0,
    );
    expect(result.valid).toBe(true);

    // The pipeline has emitted ATTACK_DECLARED and advanced to BLOCK_STEP.
    // CHARACTER_BATTLES must NOT appear yet.
    expect(findEvents(result.state, "ATTACK_DECLARED").length).toBe(1);
    expect(findEvents(result.state, "CHARACTER_BATTLES").length).toBe(0);
  });

  it("does not re-emit CHARACTER_BATTLES when a Leader is the attacker", () => {
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const leaderAttacker = state.players[0].leader;

    const midBattle = declareAttackAndPassBlock(
      state,
      leaderAttacker.instanceId,
      state.players[1].leader.instanceId,
      cardDb,
    );
    const afterPass = runPipeline(
      midBattle,
      { type: "PASS" },
      cardDb,
      midBattle.turn.activePlayerIndex,
    );
    expect(afterPass.valid).toBe(true);

    expect(findEvents(afterPass.state, "CHARACTER_BATTLES").length).toBe(0);

    // END_OF_BATTLE still fires
    const ends = findEvents(afterPass.state, "END_OF_BATTLE");
    expect(ends.length).toBe(1);
    expect(ends[0].payload.aborted).toBe(false);
  });

  it("aborts cleanly when the attacker's slot is emptied before Damage Step", () => {
    // Exercises the non-moveCard removal path: slot nulled directly (the
    // instanceId lookup returns null via findCardInState's zone search).
    const cardDb = createTestCardDb();
    const state = createBattleReadyState(cardDb);
    const attacker = state.players[0].characters[0]!;
    const target = state.players[1].leader;

    let midBattle = declareAttackAndPassBlock(state, attacker.instanceId, target.instanceId, cardDb);

    const newPlayers = [...midBattle.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], characters: padChars([]) };
    midBattle = { ...midBattle, players: newPlayers };

    const afterPass = runPipeline(
      midBattle,
      { type: "PASS" },
      cardDb,
      midBattle.turn.activePlayerIndex,
    );
    expect(afterPass.valid).toBe(true);

    expect(findEvents(afterPass.state, "BATTLE_ABORTED").length).toBe(1);
    expect(findEvents(afterPass.state, "DAMAGE_DEALT").length).toBe(0);
  });
});
