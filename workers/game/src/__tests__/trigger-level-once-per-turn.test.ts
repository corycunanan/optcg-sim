/**
 * Trigger-level [Once Per Turn] — dozens of schemas across ~25 sets declare
 * once_per_turn inside the trigger object instead of flags. The engine now
 * honors both placements via isOncePerTurnBlock().
 */

import { describe, expect, it } from "vitest";
import { isOncePerTurnBlock } from "../engine/effect-types.js";
import type { EffectBlock } from "../engine/effect-types.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import type { CardData, CardInstance, GameEvent, GameState, KeywordSet, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

const cardDb = createTestCardDb();

const triggerLevelBlock: EffectBlock = {
  id: "test_trigger_opt",
  category: "auto",
  trigger: { keyword: "ON_OPPONENT_ATTACK", once_per_turn: true } as EffectBlock["trigger"],
  actions: [{ type: "DRAW", params: { amount: 1 } }],
};

const testCard: CardData = {
  id: "OPT-TEST", name: "Once Per Turn Tester", type: "Character", color: ["Red"],
  cost: 3, power: 4000, counter: null, life: null, attribute: [], types: [],
  effectText: "", triggerText: null,
  keywords: { rush: false, rushCharacter: false, doubleAttack: false, banish: false, blocker: false, trigger: false, unblockable: false } as KeywordSet,
  effectSchema: { card_id: "OPT-TEST", card_name: "Once Per Turn Tester", card_type: "Character", effects: [triggerLevelBlock] },
  imageUrl: null,
};
cardDb.set(testCard.id, testCard);

function setup(): GameState {
  const base = createBattleReadyState(cardDb);
  const inst: CardInstance = {
    instanceId: "opt-test-char", cardId: testCard.id, zone: "CHARACTER", state: "ACTIVE",
    attachedDon: [], turnPlayed: 1, controller: 0, owner: 0,
  };
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], characters: padChars([inst]) };
  // ON_OPPONENT_ATTACK only fires on the opponent's turn — make player 1 active.
  const turn = { ...base.turn, activePlayerIndex: 1 as const };
  return registerTriggersForCard({ ...base, players, turn }, inst, testCard);
}

const attackEvent: GameEvent = {
  type: "ATTACK_DECLARED",
  playerIndex: 1,
  payload: { attackerInstanceId: "char-1-v1", targetInstanceId: "leader-0", attackerPower: 4000 },
} as GameEvent;

describe("trigger-level once_per_turn", () => {
  it("isOncePerTurnBlock honors both placements", () => {
    expect(isOncePerTurnBlock(triggerLevelBlock)).toBe(true);
    expect(isOncePerTurnBlock({ id: "f", category: "auto", flags: { once_per_turn: true } })).toBe(true);
    expect(isOncePerTurnBlock({ id: "n", category: "auto" })).toBe(false);
  });

  it("matches the first time, then is skipped once marked used this turn", () => {
    const state = setup();
    const first = matchTriggersForEvent(state, attackEvent, cardDb);
    expect(first.some((m) => m.trigger.sourceCardInstanceId === "opt-test-char")).toBe(true);

    const usedState: GameState = {
      ...state,
      turn: { ...state.turn, oncePerTurnUsed: { ...state.turn.oncePerTurnUsed, [triggerLevelBlock.id]: ["opt-test-char"] } },
    };
    const second = matchTriggersForEvent(usedState, attackEvent, cardDb);
    expect(second.some((m) => m.trigger.sourceCardInstanceId === "opt-test-char")).toBe(false);
  });
});
