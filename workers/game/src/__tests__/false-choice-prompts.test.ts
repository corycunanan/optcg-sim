/**
 * False-choice prompts: prompts whose only meaningful answer is forced are
 * resolved by the engine, and each one leaves a PROMPT_AUTO_RESOLVED entry
 * in the event log. Costs keep their prompts (Cory, 2026-11-16).
 */

import { describe, expect, it } from "vitest";
import { executeSearchAndPlay } from "../engine/effect-resolver/actions/hand-deck.js";
import {
  executeSearchDeck,
  executeSearchTrashTheRest,
} from "../engine/effect-resolver/actions/draw-search.js";
import { executeChooseValue } from "../engine/effect-resolver/actions/choice.js";
import { executeAddToLifeFromField } from "../engine/effect-resolver/actions/life.js";
import { isFixedReferenceChainVacuous } from "../engine/effect-resolver/feasibility.js";
import {
  handleArrangeSearchAndPlay,
  handleArrangeSearchDeck,
  handleArrangeSearchTrashTheRest,
} from "../engine/effect-resolver/resume/deck.js";
import type { Action, ActionOf } from "../engine/effect-types.js";
import type { CardData, CardInstance, GameAction, GameState, KeywordSet, PendingEvent, PlayerState } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function noKeywords(): KeywordSet {
  return {
    rush: false, rushCharacter: false, doubleAttack: false, banish: false,
    blocker: false, trigger: false, unblockable: false,
  };
}

const cardDb = createTestCardDb();
const stage: CardData = {
  id: "MG-STAGE", name: "Mary Geoise", type: "Stage", color: ["Black"], cost: 1,
  power: null, counter: null, life: null, attribute: [], types: ["Mary Geoise"],
  effectText: "", triggerText: null, keywords: noKeywords(), effectSchema: null, imageUrl: null,
};
cardDb.set(stage.id, stage);

function deckCard(cardId: string, instanceId: string): CardInstance {
  return {
    instanceId, cardId, zone: "DECK", state: "ACTIVE",
    attachedDon: [], turnPlayed: 0, controller: 0, owner: 0,
  };
}

function withDeckTop(cards: CardInstance[]): GameState {
  const base = createBattleReadyState(cardDb);
  const players = [...base.players] as [PlayerState, PlayerState];
  players[0] = { ...players[0], deck: [...cards, ...players[0].deck] };
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

function autoResolved(events: PendingEvent[]) {
  return events.filter((event) => event.type === "PROMPT_AUTO_RESOLVED");
}

function sourceId(state: GameState): string {
  return state.players[0].leader.instanceId;
}

describe("order of unpicked cards", () => {
  const fullDeckSearch: ActionOf<"SEARCH_AND_PLAY"> = {
    type: "SEARCH_AND_PLAY",
    params: {
      search_full_deck: true,
      filter: { traits: ["Mary Geoise"], card_type: "STAGE" },
      shuffle_after: true,
    },
  };

  it("does not ask to order a full-deck search's leftovers (Imu, OP13-079)", () => {
    const state = withDeckTop([deckCard(stage.id, "s1"), deckCard(stage.id, "s2")]);
    const result = executeSearchAndPlay(state, fullDeckSearch, sourceId(state), 0, cardDb, new Map());
    const options = result.pendingPrompt?.options;
    expect(options?.promptType).toBe("ARRANGE_TOP_CARDS");
    if (options?.promptType !== "ARRANGE_TOP_CARDS") throw new Error("expected arrange");
    expect(options.restOrderMatters).toBe(false);
  });

  it("logs the leftovers going back when the player skips the pick", () => {
    const state = withDeckTop([deckCard(stage.id, "s1"), deckCard(stage.id, "s2")]);
    const deckSize = state.players[0].deck.length;
    const events: PendingEvent[] = [];
    const next = handleArrangeSearchAndPlay(
      state, arrange([], ["s1", "s2"]), fullDeckSearch, 0, cardDb, events, ["s1", "s2"], sourceId(state),
    );
    expect(next!.players[0].deck).toHaveLength(deckSize);
    const logged = autoResolved(events);
    expect(logged).toHaveLength(1);
    expect(logged[0].payload).toMatchObject({
      detail: "Returned the other 2 cards to the deck and shuffled it",
    });
  });

  it("keeps the order step for a look-at search that bottoms the rest", () => {
    const action: ActionOf<"SEARCH_AND_PLAY"> = {
      type: "SEARCH_AND_PLAY",
      params: { look_at: 5, filter: { traits: ["Mary Geoise"] }, rest_destination: "BOTTOM" },
    };
    const state = withDeckTop([deckCard(stage.id, "s1")]);
    const result = executeSearchAndPlay(state, action, sourceId(state), 0, cardDb, new Map());
    const options = result.pendingPrompt?.options;
    if (options?.promptType !== "ARRANGE_TOP_CARDS") throw new Error("expected arrange");
    expect(options.restOrderMatters).toBeUndefined();
  });

  it("does not ask to order cards going to the trash (rule 3-5-2)", () => {
    const action: ActionOf<"SEARCH_TRASH_THE_REST"> = {
      type: "SEARCH_TRASH_THE_REST",
      params: { look_at: 3, filter: { traits: ["Mary Geoise"] } },
    };
    const state = withDeckTop([deckCard(stage.id, "s1"), deckCard(stage.id, "s2"), deckCard(stage.id, "s3")]);
    const result = executeSearchTrashTheRest(state, action, sourceId(state), 0, cardDb, new Map());
    const options = result.pendingPrompt?.options;
    if (options?.promptType !== "ARRANGE_TOP_CARDS") throw new Error("expected arrange");
    expect(options.restOrderMatters).toBe(false);

    const events: PendingEvent[] = [];
    handleArrangeSearchTrashTheRest(
      state, arrange(["s1"], ["s2", "s3"]), action, 0, ["s1", "s2", "s3"], events, sourceId(state),
    );
    expect(autoResolved(events).map((event) => event.payload)).toEqual([
      expect.objectContaining({ detail: "Trashed the other 2 cards" }),
    ]);
  });

  it("logs a single leftover placed at a fixed end, and nothing for two", () => {
    const action: ActionOf<"SEARCH_DECK"> = {
      type: "SEARCH_DECK",
      params: { look_at: 2, filter: { traits: ["Mary Geoise"] }, rest_destination: "BOTTOM" },
    };
    const state = withDeckTop([deckCard(stage.id, "s1"), deckCard(stage.id, "s2")]);
    expect(executeSearchDeck(state, action, sourceId(state), 0, cardDb, new Map()).pendingPrompt)
      .toBeDefined();

    const one: PendingEvent[] = [];
    handleArrangeSearchDeck(state, arrange(["s1"], ["s2"]), action, 0, ["s1", "s2"], one, sourceId(state));
    expect(autoResolved(one).map((event) => event.payload)).toEqual([
      expect.objectContaining({ detail: "Placed 1 card on the bottom of the deck" }),
    ]);

    const two: PendingEvent[] = [];
    handleArrangeSearchDeck(state, arrange([], ["s1", "s2"]), action, 0, ["s1", "s2"], two, sourceId(state));
    expect(autoResolved(two)).toHaveLength(0);
  });
});

describe("CHOOSE_VALUE", () => {
  it("records the only legal value without a prompt", () => {
    const state = createBattleReadyState(cardDb);
    const action: ActionOf<"CHOOSE_VALUE"> = {
      type: "CHOOSE_VALUE",
      params: { domain: "NUMBER", constraints: { min: 2, max: 2 } },
      result_ref: "picked",
    };
    const result = executeChooseValue(state, action, sourceId(state), 0, cardDb, new Map());
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.succeeded).toBe(true);
    expect(result.result?.value).toBe(2);
    expect(autoResolved(result.events)).toHaveLength(1);
  });

  it("still prompts with two or more values", () => {
    const state = createBattleReadyState(cardDb);
    const action: ActionOf<"CHOOSE_VALUE"> = {
      type: "CHOOSE_VALUE",
      params: { domain: "NUMBER", constraints: { min: 1, max: 2 } },
      result_ref: "picked",
    };
    expect(executeChooseValue(state, action, sourceId(state), 0, cardDb, new Map()).pendingPrompt)
      .toBeDefined();
  });
});

describe("top or bottom of an empty Life", () => {
  const action = {
    type: "ADD_TO_LIFE_FROM_FIELD",
    target: { type: "CHARACTER", controller: "SELF", count: { exact: 1 } },
    params: { position: "TOP_OR_BOTTOM" },
  } as unknown as ActionOf<"ADD_TO_LIFE_FROM_FIELD">;

  function withLife(count: number): GameState {
    const base = createBattleReadyState(cardDb);
    const players = [...base.players] as [PlayerState, PlayerState];
    players[0] = { ...players[0], life: players[0].life.slice(0, count) };
    return { ...base, players };
  }

  it("adds the card without asking when Life is empty", () => {
    const state = withLife(0);
    const target = state.players[0].characters.find(Boolean)!.instanceId;
    const result = executeAddToLifeFromField(state, action, sourceId(state), 0, cardDb, new Map(), [target]);
    expect(result.pendingPrompt).toBeUndefined();
    expect(result.state.players[0].life).toHaveLength(1);
    expect(autoResolved(result.events)).toHaveLength(1);
  });

  it("still asks when Life has cards", () => {
    const state = withLife(2);
    const target = state.players[0].characters.find(Boolean)!.instanceId;
    const result = executeAddToLifeFromField(state, action, sourceId(state), 0, cardDb, new Map(), [target]);
    expect(result.pendingPrompt?.options.promptType).toBe("PLAYER_CHOICE");
  });
});

describe("optional effects with no legal target (OPT-904, widened)", () => {
  function noOpponentCharacters(): GameState {
    const base = createBattleReadyState(cardDb);
    const players = [...base.players] as [PlayerState, PlayerState];
    players[1] = { ...players[1], characters: players[1].characters.map(() => null) };
    players[0] = { ...players[0], trash: [] };
    return { ...base, players };
  }

  const vacuous = (actions: Action[]) => {
    const state = noOpponentCharacters();
    return isFixedReferenceChainVacuous(state, actions, sourceId(state), 0, cardDb, new Map());
  };

  it("skips a K.O. on an empty opponent field", () => {
    expect(vacuous([
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } },
      { type: "DRAW", params: { amount: 1 }, chain: "IF_DO" },
    ] as Action[])).toBe(true);
  });

  it("skips a play from an empty trash", () => {
    expect(vacuous([
      { type: "PLAY_CARD", target: { type: "CHARACTER_CARD", source_zone: "TRASH", count: { up_to: 1 } } },
    ] as Action[])).toBe(true);
  });

  it("still offers a play from hand, which would reveal the hand", () => {
    expect(vacuous([
      { type: "PLAY_CARD", target: { type: "CHARACTER_CARD", count: { up_to: 1 }, filter: { cost_exact: 99 } } },
    ] as Action[])).toBe(false);
  });

  it("still offers when a later clause does not depend on the first", () => {
    expect(vacuous([
      { type: "KO", target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } } },
      { type: "DRAW", params: { amount: 1 }, chain: "THEN" },
    ] as Action[])).toBe(false);
  });
});
