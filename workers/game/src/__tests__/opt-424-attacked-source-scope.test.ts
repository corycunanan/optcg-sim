/**
 * OPT-424 — Source-scope ATTACKED performed-action conditions.
 *
 * ACTION_PERFORMED_THIS_TURN "ATTACKED" previously scoped only by attacker
 * `controller` and target `card_type`, so OP12-020 Roronoa Zoro's
 * "If THIS Leader battles your opponent's Character during this turn..." fired
 * whenever ANY friendly Character battled a Character. The new optional
 * `source: "SELF_CARD"` field additionally requires the recorded
 * attackerInstanceId to equal the effect's own source card.
 */

import { describe, it, expect } from "vitest";
import type { CardData, GameState, PlayerState } from "../types.js";
import { createTestCardDb, createBattleReadyState } from "./helpers.js";
import { evaluateCondition } from "../engine/conditions.js";
import { runPipeline } from "../engine/pipeline.js";

function withPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[idx] = { ...newPlayers[idx], ...patch };
  return { ...state, players: newPlayers };
}

// ctx whose source card can be pointed at different attackers.
const ctxFor = (cardDb: Map<string, CardData>, sourceCardInstanceId: string) => ({
  sourceCardInstanceId,
  controller: 0 as const,
  cardDb,
});

// Declare + resolve a full attack (block step, counter step) so the
// resolution-time ATTACKED entry (with attackerInstanceId) is recorded.
function runFullAttack(
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
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex); // block step
  expect(result.valid).toBe(true);
  result = runPipeline(result.state, { type: "PASS" }, cardDb, state.turn.activePlayerIndex); // counter step
  expect(result.valid).toBe(true);
  return result.state;
}

describe("OPT-424: SELF_CARD-scoped ATTACKED (OP12-020 Zoro)", () => {
  // Set up: char-0-v1 attacks a rested opponent Character. char-0-b1 is a
  // second friendly Character that did NOT attack.
  function attackedState(cardDb: Map<string, CardData>): GameState {
    let state = createBattleReadyState(cardDb);
    const oppChars = [...state.players[1].characters];
    oppChars[0] = { ...oppChars[0]!, state: "RESTED" as const }; // make attackable
    state = withPlayer(state, 1, { characters: oppChars });
    const attacker = state.players[0].characters[0]!; // char-0-v1
    return runFullAttack(state, attacker.instanceId, oppChars[0]!.instanceId, cardDb);
  }

  const zoroCond = {
    type: "ACTION_PERFORMED_THIS_TURN",
    controller: "SELF",
    source: "SELF_CARD",
    action: "ATTACKED",
    filter: { card_type: "CHARACTER" },
  } as never;

  it("is true when THIS card is the one that battled an opposing Character", () => {
    const cardDb = createTestCardDb();
    const after = attackedState(cardDb);
    // Source card == the attacker (char-0-v1).
    expect(evaluateCondition(after, zoroCond, ctxFor(cardDb, "char-0-v1"))).toBe(true);
  });

  it("is false when only ANOTHER friendly Character battled (the false positive)", () => {
    const cardDb = createTestCardDb();
    const after = attackedState(cardDb);
    // Source card is char-0-b1, which never attacked — must NOT fire even
    // though a SELF-controlled Character did battle an opposing Character.
    expect(evaluateCondition(after, zoroCond, ctxFor(cardDb, "char-0-b1"))).toBe(false);
  });

  it("player-scoped condition (no source field) keeps old behavior — matches any friendly attacker", () => {
    const cardDb = createTestCardDb();
    const after = attackedState(cardDb);
    const playerScoped = {
      type: "ACTION_PERFORMED_THIS_TURN",
      controller: "SELF",
      action: "ATTACKED",
      filter: { card_type: "CHARACTER" },
    } as never;
    // True for both source cards — the whole player is the scope.
    expect(evaluateCondition(after, playerScoped, ctxFor(cardDb, "char-0-v1"))).toBe(true);
    expect(evaluateCondition(after, playerScoped, ctxFor(cardDb, "char-0-b1"))).toBe(true);
  });

  it("legacy declaration-time entries never satisfy a SELF_CARD-scoped condition", () => {
    const cardDb = createTestCardDb();
    let state = createBattleReadyState(cardDb);
    state = {
      ...state,
      turn: {
        ...state.turn,
        actionsPerformedThisTurn: [{ actionType: "DECLARE_ATTACK", timestamp: 1 }],
      },
    };
    // No attackerInstanceId on the declaration entry → SELF_CARD unsatisfiable.
    expect(evaluateCondition(state, zoroCond, ctxFor(cardDb, "char-0-v1"))).toBe(false);
    // ...but the unscoped condition still holds via the declaration entry.
    expect(evaluateCondition(state, {
      type: "ACTION_PERFORMED_THIS_TURN", action: "ATTACKED",
    } as never, ctxFor(cardDb, "char-0-v1"))).toBe(true);
  });
});
