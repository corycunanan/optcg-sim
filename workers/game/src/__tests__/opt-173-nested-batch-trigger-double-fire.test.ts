/**
 * OPT-173: nested batch-trigger drain double-fires triggers when a triggered
 * effect runs its own multi-target batch.
 *
 * Setup mirrors the rule 6-2 drain added in OPT-172: the inner multi-target
 * handler (KO 2) scans its per-frame events for ON_KO triggers and pauses the
 * batch via `pendingBatchTriggers`. Without OPT-173's fix, the outer pipeline
 * trigger-queue scan (`scanEventsForTriggers` at the LIFO boundary) re-scans
 * the same CARD_KO events and queues the same ON_KO triggers a second time.
 *
 * The fix marks events as `__scannedForTriggers` after any scan; subsequent
 * scans skip them so each trigger fires exactly once.
 */

import { describe, it, expect } from "vitest";
import { runPipeline } from "../engine/pipeline.js";
import { registerTriggersForCard } from "../engine/triggers.js";
import type { EffectSchema } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, PlayerState } from "../types.js";
import { CARDS, createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const ON_KO_DRAW_SCHEMA: EffectSchema = {
  card_id: "CHAR-ONKO-DRAW",
  card_name: "OnKoDraw",
  card_type: "Character",
  effects: [
    {
      id: "on-ko-draw-1",
      category: "auto",
      trigger: { keyword: "ON_KO" },
      actions: [{ type: "DRAW", params: { amount: 1 } }],
    },
  ],
};

const ON_PLAY_KO2_SCHEMA: EffectSchema = {
  card_id: "CHAR-ONPLAY-KO2",
  card_name: "OnPlayKo2",
  card_type: "Character",
  effects: [
    {
      id: "on-play-ko-2",
      category: "auto",
      trigger: { keyword: "ON_PLAY" },
      actions: [
        {
          type: "KO",
          target: { type: "CHARACTER", controller: "OPPONENT", count: { exact: 2 } },
        },
      ],
    },
  ],
};

function makeOnKoDrawCard(): CardData {
  return {
    id: "CHAR-ONKO-DRAW",
    name: "OnKoDraw",
    type: "Character",
    color: ["Red"],
    cost: 2,
    power: 3000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "[On K.O.] Draw 1.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: ON_KO_DRAW_SCHEMA,
    imageUrl: null,
  };
}

function makeOnPlayKo2Card(): CardData {
  return {
    id: "CHAR-ONPLAY-KO2",
    name: "OnPlayKo2",
    type: "Character",
    color: ["Red"],
    cost: 0,
    power: 1000,
    counter: null,
    life: null,
    attribute: [],
    types: [],
    effectText: "[On Play] K.O. 2 of your opponent's Characters.",
    triggerText: null,
    keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false },
    effectSchema: ON_PLAY_KO2_SCHEMA,
    imageUrl: null,
  };
}

function fieldChar(cardId: string, owner: 0 | 1, suffix: string): CardInstance {
  return {
    instanceId: `char-${owner}-${suffix}`,
    cardId,
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: 1,
    controller: owner,
    owner,
  };
}

describe("OPT-173: nested batch-trigger drain double-fire", () => {
  it("each ON_KO fires exactly once when the KO batch runs inside an ON_PLAY drain", () => {
    const cardDb = createTestCardDb();
    const drawCard = makeOnKoDrawCard();
    const ko2Card = makeOnPlayKo2Card();
    cardDb.set(drawCard.id, drawCard);
    cardDb.set(ko2Card.id, ko2Card);

    const base = createBattleReadyState(cardDb);

    // Player 1 has two victims with [On K.O.] Draw 1 on field.
    const v1 = fieldChar(drawCard.id, 1, "v1");
    const v2 = fieldChar(drawCard.id, 1, "v2");

    // Player 0 hand holds the ON_PLAY KO-2 executor.
    const executor: CardInstance = {
      instanceId: "executor-1",
      cardId: ko2Card.id,
      zone: "HAND",
      state: "ACTIVE",
      attachedDon: [],
      turnPlayed: null,
      controller: 0,
      owner: 0,
    };

    const newPlayers = [...base.players] as [PlayerState, PlayerState];
    newPlayers[0] = { ...newPlayers[0], hand: [...newPlayers[0].hand, executor], characters: padChars([]) };
    newPlayers[1] = { ...newPlayers[1], characters: padChars([v1, v2]) };
    let state: GameState = { ...base, players: newPlayers };

    // Register on-field triggers (test setup places characters directly, so
    // CARD_PLAYED-driven registration never ran for v1/v2).
    state = registerTriggersForCard(state, v1, drawCard);
    state = registerTriggersForCard(state, v2, drawCard);

    const p1HandBefore = state.players[1].hand.length;
    const p1DeckBefore = state.players[1].deck.length;

    const result = runPipeline(state, { type: "PLAY_CARD", cardInstanceId: executor.instanceId }, cardDb, 0);
    expect(result.valid).toBe(true);
    expect(result.pendingPrompt).toBeUndefined();

    // Each victim KO'd exactly once (no double-emit in eventLog either: the
    // pipeline's outer scan would add CARD_KO twice without OPT-173).
    const koEvents = result.state.eventLog.filter((e) => e.type === "CARD_KO");
    expect(koEvents).toHaveLength(2);

    // Player 1 drew exactly one card per ON_KO. Without the fix, the outer
    // pipeline scan re-queues both ON_KO triggers, drawing 2 extra cards.
    expect(result.state.players[1].hand.length).toBe(p1HandBefore + 2);
    expect(result.state.players[1].deck.length).toBe(p1DeckBefore - 2);
  });
});
