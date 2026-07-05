/**
 * ST-19 trash-cost regression — commit 25c74d8 replaced matchesHandFilter
 * with full matchesFilter for TRASH_FROM_HAND costs. The old color check
 * ("BLACK".includes("Black") === false) made ST19-001/002's black-Navy trash
 * costs unmatchable against the DB's capitalized colors; the new comparison
 * uppercases both sides. Pin the fixed behavior and the filter enforcement.
 */

import { describe, expect, it } from "vitest";
import { computeCostTargets, isCostPayable } from "../engine/effect-resolver/cost-handler.js";
import type { Cost } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameState, KeywordSet, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function noKeywords(): KeywordSet {
  return {
    rush: false, rushCharacter: false, doubleAttack: false, banish: false,
    blocker: false, trigger: false, unblockable: false,
  };
}

const cardDb = createTestCardDb();
const blackNavy: CardData = {
  id: "BLACK-NAVY", name: "Navy Officer", type: "Character", color: ["Black"], cost: 3,
  power: 4000, counter: 1000, life: null, attribute: [], types: ["Navy"],
  effectText: "", triggerText: null, keywords: noKeywords(), effectSchema: null, imageUrl: null,
};
const redPirate: CardData = {
  id: "RED-PIRATE", name: "Pirate", type: "Character", color: ["Red"], cost: 3,
  power: 4000, counter: 1000, life: null, attribute: [], types: ["Straw Hat Crew"],
  effectText: "", triggerText: null, keywords: noKeywords(), effectSchema: null, imageUrl: null,
};
cardDb.set(blackNavy.id, blackNavy);
cardDb.set(redPirate.id, redPirate);

function handInstance(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId, cardId, zone: "HAND", state: "ACTIVE",
    attachedDon: [], turnPlayed: 0, controller: 0, owner: 0,
  };
}

function withHand(state: GameState, hand: CardInstance[]): GameState {
  const players = [...state.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], hand };
  return { ...state, players };
}

// ST19-001 Smoker's cost shape (ST19-002 is the same with amount: 2).
const st19Cost: Cost = { type: "TRASH_FROM_HAND", amount: 1, filter: { color: "BLACK", traits: ["Navy"] } } as Cost;

describe("ST-19 black-Navy trash costs under full-filter matching", () => {
  it("is payable with a Black Navy card in hand (capitalized DB color)", () => {
    const state = withHand(createBattleReadyState(cardDb), [handInstance(blackNavy.id, "h-navy")]);
    expect(isCostPayable(state, st19Cost, 0, cardDb)).toBe(true);
    expect(computeCostTargets(state, st19Cost, 0, cardDb)).toContain("h-navy");
  });

  it("is NOT payable when hand has only non-matching cards", () => {
    const state = withHand(createBattleReadyState(cardDb), [handInstance(redPirate.id, "h-red")]);
    expect(isCostPayable(state, st19Cost, 0, cardDb)).toBe(false);
  });

  it("excludes non-matching cards from the selectable targets", () => {
    const state = withHand(createBattleReadyState(cardDb), [
      handInstance(blackNavy.id, "h-navy"),
      handInstance(redPirate.id, "h-red"),
    ]);
    const targets = computeCostTargets(state, st19Cost, 0, cardDb);
    expect(targets).toContain("h-navy");
    expect(targets).not.toContain("h-red");
  });
});
