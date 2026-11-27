import { describe, expect, it } from "vitest";
import type { GameEvent } from "@shared/game-types";
import { eventToTransitions } from "@/hooks/use-card-transitions";
import { FLIP_SECONDS } from "./card-motion";
import { buildEventTimeline } from "./event-timeline";
import {
  collectDeckLooks,
  fanSlotPoses,
  indexDeckLooks,
  lookReturnLeadMs,
  lookSlotZoneKey,
} from "./deck-look";

const look = (playerIndex: 0 | 1, ids: string[], timestamp = 1): GameEvent => ({
  type: "DECK_TOP_LOOKED",
  playerIndex,
  timestamp,
  payload: {
    count: ids.length,
    cards: ids.map((cardId, i) => ({
      instanceId: cardId === "hidden" ? "hidden" : `d${i}`,
      cardId,
    })),
  },
});

describe("collectDeckLooks (OPT-1056)", () => {
  it("maps the pick and the rest of an own look to their slots", () => {
    const events: GameEvent[] = [
      look(0, ["A", "B", "C"]),
      {
        type: "CARD_DRAWN",
        playerIndex: 0,
        timestamp: 2,
        payload: { cardId: "B", cardInstanceId: "h1", source: "search" },
      },
      {
        type: "CARDS_PLACED_IN_DECK",
        playerIndex: 0,
        timestamp: 3,
        payload: { count: 2, position: "BOTTOM" },
      },
    ];
    const [deckLook] = collectDeckLooks(events);
    expect(deckLook.faceDown).toBe(false);
    expect(deckLook.closed).toBe(true);
    expect(deckLook.departures.get(2)).toEqual([1]);
    expect(deckLook.departures.get(3)).toEqual([0, 2]);
  });

  it("stays open until a later event and is face-down for the opponent", () => {
    const [deckLook] = collectDeckLooks([look(1, ["hidden", "hidden"])]);
    expect(deckLook.closed).toBe(false);
    expect(deckLook.faceDown).toBe(true);
    expect(deckLook.cardIds).toEqual([null, null]);
  });

  it("sends a public pick from the slot its reveal rose from", () => {
    const events: GameEvent[] = [
      look(1, ["hidden", "hidden", "hidden"]),
      {
        type: "CARDS_REVEALED",
        playerIndex: 1,
        timestamp: 2,
        payload: { cards: [{ instanceId: "x", cardId: "Z" }], source: "search", visibility: "BOTH" },
      },
      {
        type: "CARD_DRAWN",
        playerIndex: 1,
        timestamp: 3,
        payload: { cardId: "hidden", cardInstanceId: "hidden", source: "search" },
      },
      {
        type: "CARD_TRASHED",
        playerIndex: 1,
        timestamp: 4,
        payload: { cardId: "Y", cardInstanceId: "y", reason: "search_trash" },
      },
    ];
    const [deckLook] = collectDeckLooks(events);
    const reveal = deckLook.reveals.get(2);
    expect(reveal).toEqual({ slot: 1, cardId: "Z" });
    expect(deckLook.departures.get(3)).toEqual([1]);
    expect(deckLook.departures.get(4)).toEqual([0]);
  });

  it("ignores an unrelated draw after the selection window", () => {
    const events: GameEvent[] = [
      look(0, ["A", "B"]),
      { type: "PHASE_CHANGED", playerIndex: 0, timestamp: 2, payload: { from: "MAIN", to: "END" } } as GameEvent,
      {
        type: "CARD_DRAWN",
        playerIndex: 0,
        timestamp: 3,
        payload: { cardId: "A", cardInstanceId: "h", source: "search" },
      },
    ];
    expect(collectDeckLooks(events)[0].departures.size).toBe(0);
  });
});

describe("look picks and returns (OPT-1056)", () => {
  it("marks the pick, which the fan closes up behind, and the returns", () => {
    const events: GameEvent[] = [
      look(0, ["A", "B", "C"]),
      {
        type: "CARD_DRAWN",
        playerIndex: 0,
        timestamp: 2,
        payload: { cardId: "B", cardInstanceId: "h-1", source: "search" },
      },
      {
        type: "CARDS_PLACED_IN_DECK",
        playerIndex: 0,
        timestamp: 3,
        payload: { count: 2, position: "BOTTOM" },
      },
    ];
    const [deckLook] = collectDeckLooks(events);
    expect([...deckLook.picks]).toEqual([1]);
    expect([...deckLook.returns].sort()).toEqual([0, 2]);
  });
});

describe("look fan flights (OPT-1056)", () => {
  it("deals the looked-at cards face-down from the deck into the fan slots", () => {
    const events = [look(0, ["A", "B"])];
    const index = indexDeckLooks(collectDeckLooks(events));
    const flights = eventToTransitions(events[0], 0, null, null, undefined, index);
    expect(flights.map((f) => [f.fromZoneKey, f.toZoneKey])).toEqual([
      ["p-deck", lookSlotZoneKey("p", { timestamp: 1 }, 0)],
      ["p-deck", lookSlotZoneKey("p", { timestamp: 1 }, 1)],
    ]);
    // The looking player's row turns face-up in the fan once it is all in.
    expect(flights[0]).toMatchObject({ sourceFaceDown: true, destinationFaceDown: true });
  });

  it("returns the rest face-down after the fan closes up and turns them over", () => {
    const events: GameEvent[] = [
      look(0, ["A", "B"]),
      {
        type: "CARDS_PLACED_IN_DECK",
        playerIndex: 0,
        timestamp: 2,
        payload: { count: 2, position: "BOTTOM" },
      },
    ];
    const index = indexDeckLooks(collectDeckLooks(events));
    const flights = eventToTransitions(events[1], 0, null, null, undefined, index);
    expect(flights).toHaveLength(2);
    expect(flights[1]).toMatchObject({
      cardId: "B",
      toZoneKey: "p-deck",
      sourceFaceDown: true,
      destinationFaceDown: true,
      hiddenUntilDelay: true,
    });
    const leadSeconds = lookReturnLeadMs(false, FLIP_SECONDS * 1000) / 1000;
    expect(flights[0].delay).toBeCloseTo(leadSeconds);
    expect(flights[1].delay).toBeGreaterThan(leadSeconds);
  });

  it("travels a trashed fan card instead of dissolving it", () => {
    const events: GameEvent[] = [
      look(1, ["hidden"]),
      {
        type: "CARD_TRASHED",
        playerIndex: 1,
        timestamp: 2,
        payload: { cardId: "Y", cardInstanceId: "y", reason: "search_trash" },
      },
    ];
    const index = indexDeckLooks(collectDeckLooks(events));
    const [flight] = eventToTransitions(events[1], 0, null, null, undefined, index);
    expect(flight.kind).toBeUndefined();
    expect(flight).toMatchObject({ toZoneKey: "o-trash", sourceFaceDown: true, destinationFaceDown: false });
  });

  it("holds the selection prompt for a lone look beat", () => {
    expect(buildEventTimeline([look(0, ["A", "B"])]).holdsPrompt).toBe(true);
  });
});

describe("fanSlotPoses", () => {
  it("lays own cards flat and spreads a face-down fan like a hand", () => {
    expect(fanSlotPoses(3, { faceDown: false, top: false, cardWidth: 100, maxWidth: 1000 }).map((p) => p.rotate)).toEqual([0, 0, 0]);
    const fan = fanSlotPoses(3, { faceDown: true, top: true, cardWidth: 100, maxWidth: 1000 });
    expect(fan[0].rotate).toBeGreaterThan(0);
    expect(fan[1]).toEqual({ x: 0, y: -0, rotate: -0 });
  });
});
