/**
 * Timing baseline F16 (README §2). Oracle = README, never the engine.
 *
 * Rule 9-2-1 (line 880): players who fulfil a defeat condition at the same checkpoint all lose (draw).
 * Rule 9-2-1-2 (line 884): 0 cards in deck. Rule 9-1-2 (line 876): rule processing is immediate.
 * Rule 1-2-1 (line 35): when the opponent loses, the player who has not lost wins.
 * Decision 3 (rev4 §10): evaluate both players at the same checkpoint; never run later instructions
 * to manufacture simultaneous defeat.
 */

import { describe, expect, it } from "vitest";
import type { CardData, CardInstance, GameAction, GameState, PlayerState } from "../../types.js";
import type { EffectSchema } from "../../engine/effect-types.js";
import { runPipeline } from "../../engine/pipeline.js";
import { registerCardEnteredField } from "../../engine/triggers.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "../helpers.js";

interface Built {
  state: GameState;
  cardDb: Map<string, CardData>;
}

let serial = 0;
function inst(cardId: string, controller: 0 | 1, zone: CardInstance["zone"]): CardInstance {
  return { instanceId: `${cardId}#${serial++}`, cardId, zone, state: "ACTIVE", attachedDon: [], turnPlayed: 1, controller, owner: controller };
}

function base(cards: CardData[]): Built {
  const cardDb = new Map(createTestCardDb());
  for (const c of cards) cardDb.set(c.id, c);
  const state = createBattleReadyState(cardDb);
  const players = state.players.map((p) => ({
    ...p,
    characters: padChars([]),
    hand: [],
    deck: [],
  })) as unknown as [PlayerState, PlayerState];
  return { state: { ...state, players, eventLog: [] }, cardDb };
}

function run(b: Built, action: GameAction, player: 0 | 1 = 0): void {
  const r = runPipeline(b.state, action, b.cardDb, player);
  expect(r.valid, r.error).toBe(true);
  b.state = r.state;
}

describe("F16a synthetic checkpoint: both decks empty when rule processing runs is a draw (rules 9-2-1 line 880, 9-2-1-2 line 884, 9-1-2 line 876; Decision 3)", () => {
  it("F16a FINISHED with winner null", () => {
    const b = base([]);
    expect(b.state.players[0].deck).toHaveLength(0);
    expect(b.state.players[1].deck).toHaveLength(0);

    run(b, { type: "ADVANCE_PHASE" });

    expect(b.state.status).toBe("FINISHED");
    expect(b.state.winner).toBeNull();
  });
});

describe("F16b sequential defeat stops at the first terminal checkpoint (rules 9-2-1 line 880, 1-2-1 line 35; Decision 3)", () => {
  const MILLER = "SYN-OPP-MILLER"; // [Activate: Main] opponent trashes 1 from deck, THEN you trash 1 from deck

  // Engine: CARD_TRASHED:p1 -> CARD_TRASHED:p0 -> GAME_OVER:p0; the second MILL ran, so both decks are empty and winner is null (draw).
  // Decision 3 / rule 9-2-1 (line 880): p1 is already defeated after instruction 1; instruction 2 must not run.
  it.fails("F16b p1 deck-out ends the game before the second MILL: winner 0, p0 deck still holds its card (ratchet OPT-960)", () => {
    const schema: EffectSchema = {
      card_id: MILLER,
      card_name: MILLER,
      card_type: "Character",
      effects: [
        {
          id: "miller-activate",
          category: "activate",
          trigger: { keyword: "ACTIVATE_MAIN" },
          actions: [
            { type: "OPPONENT_ACTION", params: { action: { type: "MILL", params: { amount: 1 } } } },
            { type: "MILL", params: { amount: 1 }, chain: "THEN" },
          ],
        },
      ],
    };
    const b = base([{ ...CARDS.VANILLA, id: MILLER, name: MILLER, effectSchema: schema }]);
    const miller = inst(MILLER, 0, "CHARACTER");
    b.state.players[0].characters[0] = miller;
    b.state = registerCardEnteredField(b.state, miller, b.cardDb.get(MILLER)!);
    b.state.players[0].deck.push(inst(CARDS.VANILLA.id, 0, "DECK"));
    b.state.players[1].deck.push(inst(CARDS.VANILLA.id, 1, "DECK"));

    run(b, { type: "ACTIVATE_EFFECT", cardInstanceId: miller.instanceId, effectId: "miller-activate" });

    const log = b.state.eventLog.map((e) => `${e.type}:p${e.playerIndex}`);
    expect(b.state.status, JSON.stringify(log)).toBe("FINISHED");
    expect(b.state.winner).toBe(0);
    expect(b.state.players[0].deck).toHaveLength(1);
  });
});
