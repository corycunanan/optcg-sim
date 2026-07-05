/**
 * CARD_PLAYED origin zone — play events stamp payload.sourceZone so
 * event-filter `source_zone` matches where the card was played FROM. The
 * card's current zone is the destination by the time triggers match, so the
 * old current-zone check could never distinguish hand plays from trash plays.
 *
 * OP16-079 Yamato: "When a {Land of Wano} type Character card is played from
 * your trash, that Character gains [Rush] during this turn."
 */

import { describe, expect, it } from "vitest";
import { OP16_079_YAMATO } from "../engine/schemas/op16.js";
import { matchTriggersForEvent, registerTriggersForCard } from "../engine/triggers.js";
import type { CardData, CardInstance, GameEvent, GameState, KeywordSet, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb, padChars } from "./helpers.js";

function noKeywords(): KeywordSet {
  return {
    rush: false, rushCharacter: false, doubleAttack: false, banish: false,
    blocker: false, trigger: false, unblockable: false,
  };
}

const cardDb = createTestCardDb();
const yamato: CardData = {
  id: "OP16-079", name: "Yamato", type: "Leader", color: ["Green"], cost: null,
  power: 5000, counter: null, life: 5, attribute: [], types: ["Land of Wano"],
  effectText: "", triggerText: null, keywords: noKeywords(),
  effectSchema: OP16_079_YAMATO, imageUrl: null,
};
const wanoChar: CardData = {
  id: "WANO-CHAR", name: "Wano Ally", type: "Character", color: ["Green"], cost: 3,
  power: 4000, counter: 1000, life: null, attribute: [], types: ["Land of Wano"],
  effectText: "", triggerText: null, keywords: noKeywords(), effectSchema: null, imageUrl: null,
};
cardDb.set(yamato.id, yamato);
cardDb.set(wanoChar.id, wanoChar);

function setupState(): { state: GameState; playedInst: CardInstance } {
  const base = createBattleReadyState(cardDb);
  const leaderInst: CardInstance = {
    instanceId: "yamato-leader", cardId: yamato.id, zone: "LEADER", state: "ACTIVE",
    attachedDon: [], turnPlayed: 0, controller: 0, owner: 0,
  };
  const playedInst: CardInstance = {
    instanceId: "wano-played", cardId: wanoChar.id, zone: "CHARACTER", state: "RESTED",
    attachedDon: [], turnPlayed: 3, controller: 0, owner: 0,
  };
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], leader: leaderInst, characters: padChars([playedInst]) };
  const state = registerTriggersForCard({ ...base, players }, leaderInst, yamato);
  return { state, playedInst };
}

function playedEvent(playedInst: CardInstance, sourceZone: "HAND" | "TRASH"): GameEvent {
  return {
    type: "CARD_PLAYED",
    playerIndex: 0,
    payload: {
      cardInstanceId: playedInst.instanceId,
      cardId: playedInst.cardId,
      zone: "CHARACTER",
      source: "BY_EFFECT",
      playedRested: true,
      sourceZone,
    },
  } as GameEvent;
}

describe("OP16-079 Yamato — played-from-trash trigger", () => {
  it("matches when the character was played from the trash", () => {
    const { state, playedInst } = setupState();
    const matched = matchTriggersForEvent(state, playedEvent(playedInst, "TRASH"), cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === "yamato-leader")).toBe(true);
  });

  it("does NOT match when the character was played from hand", () => {
    const { state, playedInst } = setupState();
    const matched = matchTriggersForEvent(state, playedEvent(playedInst, "HAND"), cardDb);
    expect(matched.some((m) => m.trigger.sourceCardInstanceId === "yamato-leader")).toBe(false);
  });
});
