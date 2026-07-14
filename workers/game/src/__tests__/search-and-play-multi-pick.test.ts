/**
 * SEARCH_AND_PLAY multi-pick — "Look at 5, play up to 2 …" (OP16-059).
 * The resume handler honors params.pick.up_to via the new
 * keptCardInstanceIds field, validates against validTargets, and enforces
 * the pick limit server-side. The legacy single keptCardInstanceId still
 * works for every older single-pick schema.
 */

import { describe, expect, it } from "vitest";
import { getSearchAndPlayPickLimit } from "../engine/effect-resolver/action-utils.js";
import { executeSearchAndPlay } from "../engine/effect-resolver/actions/hand-deck.js";
import { handleArrangeSearchAndPlay } from "../engine/effect-resolver/resume/deck.js";
import type { Action, ActionOf } from "../engine/effect-types.js";
import { OP02_030_ODEN } from "../engine/schemas/op02.js";
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
const wanoChar: CardData = {
  ...impelChar,
  id: "WANO-CHAR",
  name: "Wano Retainer",
  color: ["Green"],
  types: ["Land of Wano"],
};
cardDb.set(wanoChar.id, wanoChar);

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

function setup(cardId = impelChar.id): GameState {
  const base = createBattleReadyState(cardDb);
  const deck = [
    deckInstance(cardId, "d1"),
    deckInstance(cardId, "d2"),
    deckInstance(cardId, "d3"),
    ...base.players[0].deck.slice(3),
  ];
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], deck };
  return { ...base, players };
}

function productionOdenSearchAction(): ActionOf<"SEARCH_AND_PLAY"> {
  const action = OP02_030_ODEN.effects
    .flatMap((effect) => effect.actions ?? [])
    .find((candidate) => candidate.type === "SEARCH_AND_PLAY");
  if (!action || action.type !== "SEARCH_AND_PLAY") {
    throw new Error("OP02-030 SEARCH_AND_PLAY is missing");
  }
  return action;
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
  it.each([
    { pick: { all: true } as const },
    { pick: { any_number: true } as const },
  ])("allows the full valid pool for $pick", (params) => {
    expect(getSearchAndPlayPickLimit(params, 3)).toBe(3);
  });

  it("advertises one selection for omitted production pick limits", () => {
    const state = setup(wanoChar.id);
    const result = executeSearchAndPlay(
      state,
      productionOdenSearchAction(),
      state.players[0].leader.instanceId,
      0,
      cardDb,
      new Map(),
    );

    expect(result.pendingPrompt?.options.promptType).toBe("ARRANGE_TOP_CARDS");
    if (result.pendingPrompt?.options.promptType !== "ARRANGE_TOP_CARDS") {
      throw new Error("Expected OP02-030 to create an arrange prompt");
    }
    expect(result.pendingPrompt.options.maxKeep).toBe(1);
    expect(result.pendingPrompt.options.validTargets).toHaveLength(3);
  });

  it("defaults omitted production pick limits to one", () => {
    const state = setup();
    const deckBefore = state.players[0].deck.length;
    const charsBefore = state.players[0].characters.filter(Boolean).length;
    const events: PendingEvent[] = [];
    const next = handleArrangeSearchAndPlay(
      state,
      arrange(["d1", "d2", "d3"], []),
      productionOdenSearchAction(),
      0,
      cardDb,
      events,
      ["d1", "d2", "d3"],
    );

    expect(next).not.toBeNull();
    expect(next!.players[0].characters.filter(Boolean)).toHaveLength(
      charsBefore + 1,
    );
    expect(next!.players[0].deck).toHaveLength(deckBefore - 1);
    expect(events.filter((event) => event.type === "CARD_PLAYED")).toHaveLength(1);
  });

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

  // Regression: restOfDeck excludes every orderedInstanceId, so the
  // full-deck-search branch must add the arranged-but-unkept cards back —
  // previously they were silently deleted from the game.
  it("full-deck search keeps arranged-but-unkept cards in the deck", () => {
    const state = setup();
    const deckBefore = state.players[0].deck.length;
    const events: PendingEvent[] = [];
    const fullDeckAction: Action = {
      type: "SEARCH_AND_PLAY",
      params: {
        pick: { up_to: 1 },
        filter: { traits: ["Impel Down"] },
        search_full_deck: true,
        shuffle_after: true,
      },
    };
    const next = handleArrangeSearchAndPlay(
      state, arrange(["d1"], ["d2", "d3"]), fullDeckAction, 0, cardDb, events, ["d1", "d2", "d3"],
    );
    expect(next).not.toBeNull();
    // Only the kept card left the deck; the arranged rest stays in it.
    expect(next!.players[0].deck.length).toBe(deckBefore - 1);
    const deckIds = new Set(next!.players[0].deck.map((c) => c.instanceId));
    expect(deckIds.has("d2")).toBe(true);
    expect(deckIds.has("d3")).toBe(true);
    expect(deckIds.has("d1")).toBe(false);
  });
});
