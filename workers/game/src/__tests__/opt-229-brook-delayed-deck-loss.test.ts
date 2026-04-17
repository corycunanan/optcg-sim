/**
 * OPT-229 (A7): OP15-022 Brook Leader — "You lose at the end of the turn in
 * which your deck becomes 0 cards." The defeat layer reads a
 * LOSS_CONDITION_MOD/DELAYED_LOSS rule_modifications on the player's Leader
 * and defers the deck-out loss until the end of the turn. A sticky per-turn
 * flag (`state.turn.deckHitZeroThisTurn`) records the transition.
 */

import { describe, it, expect } from "vitest";
import { checkDefeat } from "../engine/defeat.js";
import { runPipeline } from "../engine/pipeline.js";
import type { CardData, GameState, PlayerState } from "../types.js";
import type { EffectSchema } from "../engine/effect-types.js";
import { setupGame, CARDS } from "./helpers.js";

const BROOK_SCHEMA: EffectSchema = {
  card_id: "OP15-022",
  card_name: "Brook",
  card_type: "Leader",
  rule_modifications: [
    {
      rule_type: "LOSS_CONDITION_MOD",
      trigger_event: "DECK_OUT",
      modification: "DELAYED_LOSS",
      delay: { timing: "END_OF_TURN" },
    },
  ],
  effects: [],
};

function makeBrookLeaderData(): CardData {
  return { ...CARDS.LEADER, effectSchema: BROOK_SCHEMA };
}

function withEmptyDeck(state: GameState, pi: 0 | 1): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[pi] = { ...players[pi], deck: [] };
  return { ...state, players };
}

function withBrookLeader(
  state: GameState,
  cardDb: Map<string, CardData>,
  pi: 0 | 1,
): { state: GameState; cardDb: Map<string, CardData> } {
  const brookData = makeBrookLeaderData();
  const newCardDb = new Map(cardDb);
  newCardDb.set(brookData.id, brookData);
  const players = [...state.players] as [PlayerState, PlayerState];
  players[pi] = {
    ...players[pi],
    leader: { ...players[pi].leader, cardId: brookData.id },
  };
  return { state: { ...state, players }, cardDb: newCardDb };
}

describe("OPT-229: Brook Leader delayed deck-out loss", () => {
  it("suppresses immediate deck-out for a Brook-leader player", () => {
    const { state: base, cardDb: baseDb } = setupGame();
    const { state: s1, cardDb } = withBrookLeader(base, baseDb, 0);
    const state = withEmptyDeck(s1, 0);

    // Normally deck.length === 0 → immediate loss, but Brook defers it.
    expect(checkDefeat(state, {}, cardDb)).toBeNull();
  });

  it("immediate deck-out still applies to a non-Brook player", () => {
    const { state: base, cardDb } = setupGame();
    const state = withEmptyDeck(base, 0);

    const result = checkDefeat(state, {}, cardDb);
    expect(result).toBeTruthy();
    expect(result!.winner).toBe(1);
  });

  it("end-of-turn with sticky flag set collects the deferred loss", () => {
    const { state: base, cardDb: baseDb } = setupGame();
    const { state: s1, cardDb } = withBrookLeader(base, baseDb, 0);
    // Simulate: deck hit 0 earlier in the turn, then was refilled.
    const s2: GameState = {
      ...s1,
      turn: { ...s1.turn, deckHitZeroThisTurn: [true, false] },
    };

    // Without endOfTurn: no loss, even though flag is set.
    expect(checkDefeat(s2, {}, cardDb)).toBeNull();

    // With endOfTurn: Brook loses.
    const result = checkDefeat(s2, { endOfTurn: true }, cardDb);
    expect(result).toBeTruthy();
    expect(result!.winner).toBe(1);
  });

  it("end-of-turn without the sticky flag → no loss", () => {
    const { state: base, cardDb: baseDb } = setupGame();
    const { state, cardDb } = withBrookLeader(base, baseDb, 0);

    expect(checkDefeat(state, { endOfTurn: true }, cardDb)).toBeNull();
  });

  it("pipeline sets deckHitZeroThisTurn when a player's deck is empty", () => {
    const { state: base, cardDb: baseDb } = setupGame();
    const { state: s1, cardDb } = withBrookLeader(base, baseDb, 0);
    const s2 = withEmptyDeck(s1, 0);

    // Any no-op-ish action that runs the pipeline; PASS_PRIORITY-style actions
    // vary, but ADVANCE_PHASE on a valid state exercises finishPipeline.
    const result = runPipeline(s2, { type: "ADVANCE_PHASE" }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.state.turn.deckHitZeroThisTurn[0]).toBe(true);
    expect(result.state.turn.deckHitZeroThisTurn[1]).toBe(false);
    // Brook leader → no game over yet.
    expect(result.gameOver).toBeUndefined();
  });

  it("both Brook players decked simultaneously at end of turn → draw", () => {
    const { state: base, cardDb: baseDb } = setupGame();
    const { state: s1, cardDb: db1 } = withBrookLeader(base, baseDb, 0);
    const { state: s2, cardDb } = withBrookLeader(s1, db1, 1);
    const s3: GameState = {
      ...s2,
      turn: { ...s2.turn, deckHitZeroThisTurn: [true, true] },
    };

    const result = checkDefeat(s3, { endOfTurn: true }, cardDb);
    expect(result).toBeTruthy();
    expect(result!.winner).toBeNull();
  });

  it("life-out still wins the game immediately for a Brook player (deck-out delay is scoped to deck-out)", () => {
    const { state: base, cardDb: baseDb } = setupGame();
    const { state: s1, cardDb } = withBrookLeader(base, baseDb, 0);
    const players = [...s1.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], life: [] };
    const state: GameState = { ...s1, players };

    const result = checkDefeat(state, { damagedPlayerIndex: 0 }, cardDb);
    expect(result).toBeTruthy();
    expect(result!.winner).toBe(1);
  });
});
