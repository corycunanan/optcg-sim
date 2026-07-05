/**
 * CANNOT_REFRESH prohibition — "[up to 1 of your opponent's rested Characters]
 * will not become active in your opponent's next Refresh Phase."
 * (ST30-010, OP16-030, OP16-040)
 *
 * Covers the two halves of the mechanic:
 * 1. The prohibition survives the end-of-turn expiry wave (SKIP_NEXT_REFRESH
 *    maps to wave NEVER, not the END_OF_TURN default).
 * 2. The owner's Refresh Phase leaves the targeted card rested, consumes the
 *    prohibition, and the following refresh activates the card normally.
 */

import { describe, it, expect } from "vitest";
import type { GameState, PlayerState } from "../types.js";
import { runPipeline } from "../engine/pipeline.js";
import { createTestCardDb, createBattleReadyState } from "./helpers.js";

const cardDb = createTestCardDb();

function withRestedP1Chars(state: GameState): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[1] = {
    ...players[1],
    characters: players[1].characters.map((c) =>
      c ? { ...c, state: "RESTED" as const } : c,
    ),
  };
  return { ...state, players };
}

function withCannotRefresh(state: GameState, appliesTo: string[]): GameState {
  const prohibition = {
    id: "prohib-cannot-refresh-test",
    sourceCardInstanceId: "char-0-v1",
    sourceEffectBlockId: "",
    prohibitionType: "CANNOT_REFRESH",
    scope: {},
    duration: { type: "SKIP_NEXT_REFRESH" },
    controller: 0 as const,
    appliesTo,
    usesRemaining: null,
  };
  return { ...state, prohibitions: [...state.prohibitions, prohibition as any] };
}

function advancePhase(state: GameState): GameState {
  const result = runPipeline(state, { type: "ADVANCE_PHASE" }, cardDb, state.turn.activePlayerIndex);
  expect(result.valid).toBe(true);
  return result.state;
}

/** Advance until the given player has completed their REFRESH phase (phase === DRAW). */
function advanceThroughRefreshOf(state: GameState, playerIndex: 0 | 1): GameState {
  let current = state;
  let safety = 12;
  while (safety-- > 0) {
    current = advancePhase(current);
    if (current.turn.activePlayerIndex === playerIndex && current.turn.phase === "DRAW") {
      return current;
    }
  }
  throw new Error("advanceThroughRefreshOf: safety limit reached");
}

function getP1Char(state: GameState, instanceId: string) {
  const card = state.players[1].characters.find((c) => c?.instanceId === instanceId);
  expect(card).toBeDefined();
  return card!;
}

describe("CANNOT_REFRESH prohibition", () => {
  it("survives end of turn, holds the target rested through one refresh, then is consumed", () => {
    // Player 0 active in MAIN (turn 3); both of player 1's characters rested;
    // char-1-v1 is under "will not become active" from player 0's effect.
    let state = withCannotRefresh(withRestedP1Chars(createBattleReadyState(cardDb)), ["char-1-v1"]);

    // Player 0 ends their turn: MAIN → END runs automatically, handing off to
    // player 1 at REFRESH. The END_OF_TURN expiry wave must not cull the
    // prohibition before the refresh it exists to skip.
    state = advancePhase(state);
    expect(state.turn.activePlayerIndex).toBe(1);
    expect(state.turn.phase).toBe("REFRESH");
    expect(state.prohibitions).toHaveLength(1);

    // Player 1's Refresh Phase: the prohibited character stays rested while
    // the rest of the board refreshes normally, and the prohibition is spent.
    state = advancePhase(state);
    expect(state.turn.phase).toBe("DRAW");
    expect(getP1Char(state, "char-1-v1").state).toBe("RESTED");
    expect(getP1Char(state, "char-1-b1").state).toBe("ACTIVE");
    expect(state.players[1].donCostArea.every((d) => d.state === "ACTIVE")).toBe(true);
    expect(state.prohibitions).toHaveLength(0);

    // The following refresh for player 1 activates the character normally.
    state = advanceThroughRefreshOf(state, 0);
    state = advanceThroughRefreshOf(state, 1);
    expect(getP1Char(state, "char-1-v1").state).toBe("ACTIVE");
  });

  it("does not consume a prohibition at the non-owner's refresh", () => {
    // Same setup, but walk through player 0's refresh first: a prohibition on
    // player 1's card must not be touched by player 0's Refresh Phase.
    let state = withCannotRefresh(withRestedP1Chars(createBattleReadyState(cardDb)), ["char-1-v1"]);

    // Hand off to player 1 (their refresh consumes it — covered above), so
    // instead check the prior half: simulate player 1 having applied it going
    // into player 0's refresh by reassigning appliesTo to a player 0 card.
    const players = [...state.players] as [PlayerState, PlayerState];
    players[0] = {
      ...players[0],
      characters: players[0].characters.map((c) =>
        c?.instanceId === "char-0-v1" ? { ...c, state: "RESTED" as const } : c,
      ),
    };
    state = { ...state, players, prohibitions: [] };
    state = withCannotRefresh(state, ["char-0-v1"]);

    // Player 0 ends turn; player 1 refreshes — prohibition targets a player 0
    // card, so player 1's refresh must leave it alone.
    state = advanceThroughRefreshOf(state, 1);
    expect(state.prohibitions).toHaveLength(1);

    // Player 0's own refresh then honors and consumes it.
    state = advanceThroughRefreshOf(state, 0);
    const held = state.players[0].characters.find((c) => c?.instanceId === "char-0-v1");
    expect(held?.state).toBe("RESTED");
    expect(state.prohibitions).toHaveLength(0);
  });
});
