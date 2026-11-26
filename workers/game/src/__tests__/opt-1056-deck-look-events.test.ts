import { describe, expect, it } from "vitest";
import type { Action } from "../engine/effect-types.js";
import { executeActionChain } from "../engine/effect-resolver/resolver.js";
import { resumeFromStack } from "../engine/effect-resolver/resume.js";
import { filterEventForPlayer } from "../engine/visibility.js";
import type { GameAction, GameEvent, PendingEvent } from "../types.js";
import { createBattleReadyState, createTestCardDb } from "./helpers.js";

function start(action: Action) {
  const cardDb = createTestCardDb();
  const state = createBattleReadyState(cardDb);
  const result = executeActionChain(
    state,
    [action],
    state.players[0].leader.instanceId,
    0,
    cardDb,
  );
  return { cardDb, state, result };
}

function lookEvents(events: readonly PendingEvent[]) {
  return events.filter((event) => event.type === "DECK_TOP_LOOKED");
}

function placements(events: readonly PendingEvent[]) {
  return events.filter((event) => event.type === "CARDS_PLACED_IN_DECK");
}

function arrange(
  ids: string[],
  kept: string[],
  destination: "top" | "bottom" = "bottom",
): Extract<GameAction, { type: "ARRANGE_TOP_CARDS" }> {
  return {
    type: "ARRANGE_TOP_CARDS",
    keptCardInstanceId: kept[0] ?? "",
    keptCardInstanceIds: kept,
    orderedInstanceIds: ids.filter((id) => !kept.includes(id)),
    destination,
  };
}

describe("OPT-1056 deck look events", () => {
  it("announces the top N when a SEARCH_DECK selection opens", () => {
    const { state, result } = start({
      type: "SEARCH_DECK",
      params: { look_at: 5, pick: { up_to: 1 }, filter: {} },
    });
    const top = state.players[0].deck.slice(0, 5);
    expect(lookEvents(result.events)).toEqual([
      expect.objectContaining({
        playerIndex: 0,
        payload: {
          count: 5,
          cards: top.map((card) => ({ instanceId: card.instanceId, cardId: card.cardId })),
        },
      }),
    ]);
  });

  it("places the unpicked rest at the bottom after the pick", () => {
    const { cardDb, result } = start({
      type: "SEARCH_DECK",
      params: { look_at: 5, pick: { up_to: 1 }, filter: {} },
    });
    const prompt = result.pendingPrompt!;
    if (prompt.options.promptType !== "ARRANGE_TOP_CARDS") throw new Error("prompt");
    const ids = prompt.options.cards.map((card) => card.instanceId);
    const resumed = resumeFromStack(result.state, arrange(ids, [ids[1]]), cardDb);
    expect(placements(resumed.events)).toEqual([
      expect.objectContaining({ playerIndex: 0, payload: { count: 4, position: "BOTTOM" } }),
    ]);
    const drawn = resumed.events.find((event) => event.type === "CARD_DRAWN");
    const placed = resumed.events.findIndex((event) => event.type === "CARDS_PLACED_IN_DECK");
    expect(resumed.events.indexOf(drawn!)).toBeLessThan(placed);
  });

  it("emits no placement when SEARCH_TRASH_THE_REST trashes the rest", () => {
    const { cardDb, result } = start({
      type: "SEARCH_TRASH_THE_REST",
      params: { look_at: 3, pick: { up_to: 1 }, filter: {}, rest_destination: "TRASH" },
    });
    expect(lookEvents(result.events)).toHaveLength(1);
    const prompt = result.pendingPrompt!;
    if (prompt.options.promptType !== "ARRANGE_TOP_CARDS") throw new Error("prompt");
    const ids = prompt.options.cards.map((card) => card.instanceId);
    const resumed = resumeFromStack(result.state, arrange(ids, [ids[0]]), cardDb);
    expect(placements(resumed.events)).toEqual([]);
    expect(
      resumed.events.filter(
        (event) => event.type === "CARD_TRASHED" && event.payload?.reason === "search_trash",
      ),
    ).toHaveLength(2);
  });

  it("places the whole DECK_SCRY group at the chosen end", () => {
    const { cardDb, result } = start({ type: "DECK_SCRY", params: { look_at: 3 } });
    expect(lookEvents(result.events)[0]?.payload).toMatchObject({ count: 3 });
    const prompt = result.pendingPrompt!;
    if (prompt.options.promptType !== "ARRANGE_TOP_CARDS") throw new Error("prompt");
    const ids = prompt.options.cards.map((card) => card.instanceId);
    const resumed = resumeFromStack(result.state, arrange(ids, [], "top"), cardDb);
    expect(placements(resumed.events)).toEqual([
      expect.objectContaining({ payload: { count: 3, position: "TOP" } }),
    ]);
  });

  it("hides looked-at identities from the opponent", () => {
    const { result } = start({
      type: "SEARCH_DECK",
      params: { look_at: 2, pick: { up_to: 1 }, filter: {} },
    });
    const event = { ...lookEvents(result.events)[0], timestamp: 1 } as GameEvent;
    const own = filterEventForPlayer(event, 0);
    const opponent = filterEventForPlayer(event, 1);
    expect(own).toEqual(event);
    expect(opponent.payload).toEqual({
      count: 2,
      cards: [
        { instanceId: "hidden", cardId: "hidden" },
        { instanceId: "hidden", cardId: "hidden" },
      ],
    });
  });

  it("does not announce a full-deck search as a top-N look", () => {
    const { result } = start({
      type: "SEARCH_AND_PLAY",
      params: { search_full_deck: true, filter: {} },
    } as Action);
    expect(lookEvents(result.events)).toEqual([]);
  });
});
