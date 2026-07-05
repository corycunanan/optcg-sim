/**
 * SEARCH_AND_PLAY multi-pick — "Look at 5, play up to 2 …" (OP16-059).
 * The resume handler honors params.pick.up_to via the new
 * keptCardInstanceIds field, validates against validTargets, and enforces
 * the pick limit server-side. The legacy single keptCardInstanceId still
 * works for every older single-pick schema.
 */

import { describe, expect, it } from "vitest";
import { handleArrangeSearchAndPlay } from "../engine/effect-resolver/resume/deck.js";
import type { Action } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameAction, GameState, KeywordSet, PendingEvent, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function noKeywords(): KeywordSet {
  return {
    rush: false, rushCharacter: false, doubleAttack: false, banish: false,
    blocker: false, trigger: false, unblockable: false,
  };
}

const cardDb = createTestCardDb();
const impelChar: CardData = {
  id: "IMPEL-CHAR", name: "Prisoner", type: "Character", color: ["Blue"], cost: 3,
  power: 4000, counter: 1000, life: null, attribute: [], types: ["Impel Down"],
  effectText: "", triggerText: null, keywords: noKeywords(), effectSchema: null, imageUrl: null,
};
cardDb.set(impelChar.id, impelChar);

function deckInstance(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId, cardId, zone: "DECK", state: "ACTIVE",
    attachedDon: [], turnPlayed: 0, controller: 0, owner: 0,
  };
}

const pausedAction: Action = {
  type: "SEARCH_AND_PLAY",
  params: { look_at: 5, pick: { up_to: 2 }, filter: { traits: ["Impel Down"] }, rest_destination: "BOTTOM" },
};

function setup(): GameState {
  const base = createBattleReadyState(cardDb);
  const deck = [
    deckInstance(impelChar.id, "d1"),
    deckInstance(impelChar.id, "d2"),
    deckInstance(impelChar.id, "d3"),
    ...base.players[0].deck.slice(3),
  ];
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], deck };
  return { ...base, players };
}

function arrange(kept: string[], ordered: string[]): GameAction {
  return {
    type: "ARRANGE_TOP_CARDS",
    keptCardInstanceId: kept[0] ?? "",
    keptCardInstanceIds: kept,
    orderedInstanceIds: ordered,
    destination: "bottom",
  };
}

describe("SEARCH_AND_PLAY multi-pick", () => {
  it("plays two kept characters and bottoms the rest", () => {
    const state = setup();
    const deckBefore = state.players[0].deck.length;
    const charsBefore = state.players[0].characters.filter(Boolean).length;
    const events: PendingEvent[] = [];
    const next = handleArrangeSearchAndPlay(
      state, arrange(["d1", "d2"], ["d3"]), pausedAction, 0, cardDb, events, ["d1", "d2", "d3"],
    );
    expect(next).not.toBeNull();
    expect(next!.players[0].characters.filter(Boolean).length).toBe(charsBefore + 2);
    expect(events.filter((e) => e.type === "CARD_PLAYED")).toHaveLength(2);
    expect(next!.players[0].deck.length).toBe(deckBefore - 2);
    // d3 went to the bottom of the deck
    expect(next!.players[0].deck[next!.players[0].deck.length - 1].instanceId).toBe("d3");
  });

  it("caps picks at the pick limit and rejects ids outside validTargets", () => {
    const state = setup();
    const charsBefore = state.players[0].characters.filter(Boolean).length;
    const events: PendingEvent[] = [];
    // 3 requested, limit 2; "bogus" not in validTargets
    const next = handleArrangeSearchAndPlay(
      state, arrange(["bogus", "d1", "d2", "d3"], []), pausedAction, 0, cardDb, events, ["d1", "d2", "d3"],
    );
    expect(next!.players[0].characters.filter(Boolean).length).toBe(charsBefore + 2);
  });

  it("legacy single keptCardInstanceId still plays one card", () => {
    const state = setup();
    const charsBefore = state.players[0].characters.filter(Boolean).length;
    const events: PendingEvent[] = [];
    const action: GameAction = {
      type: "ARRANGE_TOP_CARDS", keptCardInstanceId: "d1", orderedInstanceIds: ["d2", "d3"], destination: "bottom",
    };
    const next = handleArrangeSearchAndPlay(state, action, pausedAction, 0, cardDb, events, ["d1", "d2", "d3"]);
    expect(next!.players[0].characters.filter(Boolean).length).toBe(charsBefore + 1);
  });
});
