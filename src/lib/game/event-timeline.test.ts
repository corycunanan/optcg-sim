import { describe, expect, it } from "vitest";
import type { GameEvent } from "@shared/game-types";
import { FLIP_SECONDS } from "@/lib/game/card-motion";
import { cardFizzle, cardStagger, cardTravel } from "@/lib/motion";
import {
  BEAT_GAP_MS,
  MAX_PLAYBACK_MS,
  MIN_BEAT_GAP_MS,
  MULTI_CARD_STAGGER_MS,
  PULSE_READ_MS,
  siblingStaggerMs,
  SPOTLIGHT_DWELL_MS,
  buildEventTimeline,
  classifyEventBeat,
  eventOffsetMs,
} from "./event-timeline";

// A public card's travel beat holds for the flip it may play first, then the
// longest flight (OPT-1054).
const FLIGHT_MS = cardTravel.maxMs;
const FLIP_MS = Math.round(FLIP_SECONDS * 1000);
const TRAVEL_MS = FLIP_MS + FLIGHT_MS;
const FIZZLE_MS = Math.round(cardFizzle.transition.duration * 1000);

let clock = 0;
function at<T extends Omit<GameEvent, "timestamp">>(value: T): GameEvent {
  clock += 1;
  return { ...value, timestamp: clock } as GameEvent;
}

const played = (playerIndex: 0 | 1 = 0) =>
  at({
    type: "CARD_PLAYED",
    playerIndex,
    payload: {
      cardId: "OP01-001",
      cardInstanceId: `c-${clock}`,
      zone: "CHARACTER",
      source: "hand",
    },
  });
const ko = (playerIndex: 0 | 1 = 1) =>
  at({
    type: "CARD_KO",
    playerIndex,
    payload: {
      cardId: "OP01-002",
      cardInstanceId: `k-${clock}`,
      cause: "effect",
      preKO_donCount: 0,
    },
  });
const drawn = (playerIndex: 0 | 1 = 0) =>
  at({
    type: "CARD_DRAWN",
    playerIndex,
    payload: { cardId: "OP01-003" },
  });
const powered = () =>
  at({
    type: "POWER_MODIFIED",
    playerIndex: 0,
    payload: { targetInstanceId: "x", amount: 1000 },
  });
const phase = () =>
  at({
    type: "PHASE_CHANGED",
    playerIndex: 0,
    payload: { from: "MAIN", to: "END" },
  });
const donRested = () =>
  at({ type: "DON_RESTED", playerIndex: 0, payload: { count: 2 } });

describe("classifyEventBeat", () => {
  it("gives state-rendered events no beat of their own", () => {
    expect(classifyEventBeat(phase())).toBeNull();
    expect(classifyEventBeat(donRested())).toBeNull();
  });

  it("classifies flights, dissolves, glows, and spotlights", () => {
    expect(classifyEventBeat(played())).toBe("travel");
    expect(classifyEventBeat(ko())).toBe("transform");
    expect(classifyEventBeat(powered())).toBe("pulse");
    expect(
      classifyEventBeat(
        at({
          type: "EVENT_ACTIVATED_FROM_HAND",
          playerIndex: 0,
          payload: { cardId: "OP01-004", cardInstanceId: "e" },
        })
      )
    ).toBe("spotlight");
  });
});

describe("buildEventTimeline", () => {
  it("is empty for no events", () => {
    const timeline = buildEventTimeline([]);
    expect(timeline.offsets.size).toBe(0);
    expect(timeline.durationMs).toBe(0);
  });

  it("plays a play, its On Play K.O., and a draw one after another", () => {
    const events = [donRested(), played(), ko(), drawn()];
    const timeline = buildEventTimeline(events);
    const [rest, play, knockOut, draw] = events.map((event) =>
      eventOffsetMs(timeline, event)
    );

    expect(rest).toBe(0);
    expect(play).toBe(0);
    expect(knockOut).toBe(TRAVEL_MS + BEAT_GAP_MS);
    expect(draw).toBe(knockOut + FIZZLE_MS + BEAT_GAP_MS);
    expect(timeline.durationMs).toBe(draw + TRAVEL_MS);
    expect(timeline.beatCount).toBe(3);
  });

  it("fans sibling draws out inside one beat", () => {
    const events = [drawn(), drawn(), drawn()];
    const timeline = buildEventTimeline(events);

    expect(events.map((event) => eventOffsetMs(timeline, event))).toEqual([
      0,
      MULTI_CARD_STAGGER_MS,
      2 * MULTI_CARD_STAGGER_MS,
    ]);
    expect(timeline.durationMs).toBe(2 * MULTI_CARD_STAGGER_MS + TRAVEL_MS);
  });

  it("resolves a simultaneous K.O. together", () => {
    const events = [ko(), ko()];
    const timeline = buildEventTimeline(events);
    expect(events.map((event) => eventOffsetMs(timeline, event))).toEqual([
      0, 0,
    ]);
  });

  it("dissolves a K.O. across both boards together", () => {
    const events = [ko(0), ko(1), ko(1)];
    const timeline = buildEventTimeline(events);
    expect(events.map((event) => eventOffsetMs(timeline, event))).toEqual([
      0, 0, 0,
    ]);
  });

  it("starts a new flight beat when the player changes", () => {
    const events = [drawn(0), drawn(1)];
    const timeline = buildEventTimeline(events);
    expect(eventOffsetMs(timeline, events[1])).toBe(TRAVEL_MS + BEAT_GAP_MS);
  });

  it("lets state-rendered events ride along with the beat before them", () => {
    const events = [played(), phase(), powered()];
    const timeline = buildEventTimeline(events);
    expect(eventOffsetMs(timeline, events[1])).toBe(0);
    expect(eventOffsetMs(timeline, events[2])).toBe(TRAVEL_MS + BEAT_GAP_MS);
    expect(timeline.durationMs).toBe(
      TRAVEL_MS + BEAT_GAP_MS + PULSE_READ_MS
    );
  });

  it("holds the following step for the spotlight dwell", () => {
    const events = [
      at({
        type: "EVENT_ACTIVATED_FROM_HAND",
        playerIndex: 0,
        payload: { cardId: "OP01-004", cardInstanceId: "e" },
      }),
      ko(),
    ];
    const timeline = buildEventTimeline(events);
    expect(eventOffsetMs(timeline, events[1])).toBe(
      SPOTLIGHT_DWELL_MS + BEAT_GAP_MS
    );
  });

  it("compresses gaps so a long chain stays near the cap", () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 8; i += 1) {
      events.push(powered(), ko());
    }
    const timeline = buildEventTimeline(events);
    const totalLead = 8 * (PULSE_READ_MS + FIZZLE_MS);
    const gaps = (timeline.durationMs - totalLead) / 15;

    expect(gaps).toBeLessThan(BEAT_GAP_MS);
    expect(gaps).toBeGreaterThanOrEqual(MIN_BEAT_GAP_MS);
    expect(timeline.durationMs).toBeLessThanOrEqual(
      Math.max(MAX_PLAYBACK_MS, totalLead + 15 * MIN_BEAT_GAP_MS)
    );
  });

  it("plays everything at once under reduced motion", () => {
    const events = [played(), ko(), drawn()];
    const timeline = buildEventTimeline(events, { reducedMotion: true });
    expect(events.map((event) => eventOffsetMs(timeline, event))).toEqual([
      0, 0, 0,
    ]);
    expect(timeline.durationMs).toBe(0);
  });

  it("deals draws 90ms apart, pile moves 70ms and plays 60ms (OPT-1054)", () => {
    expect(MULTI_CARD_STAGGER_MS).toBe(cardStagger.drawMs);
    expect(siblingStaggerMs("CARD_DRAWN")).toBe(90);
    expect(siblingStaggerMs("DON_GIVEN_TO_CARD")).toBe(90);
    expect(siblingStaggerMs("CARD_RETURNED_TO_DECK")).toBe(70);
    expect(siblingStaggerMs("LIFE_CARD_TO_DECK")).toBe(70);
    expect(siblingStaggerMs("CARD_PLAYED")).toBe(60);

    const toDeck = () =>
      at({
        type: "CARD_RETURNED_TO_DECK",
        playerIndex: 0,
        payload: { cardId: "OP01-005", cardInstanceId: `r-${clock}` },
      });
    const deckMoves = [toDeck(), toDeck()];
    const pile = buildEventTimeline(deckMoves);
    expect(eventOffsetMs(pile, deckMoves[1])).toBe(70);

    const plays = [played(), played()];
    const field = buildEventTimeline(plays);
    expect(eventOffsetMs(field, plays[1])).toBe(60);
  });

  it("holds a public card's beat for its flip but not a sleeved one (OPT-1054)", () => {
    const hiddenDraw = at({
      type: "CARD_DRAWN",
      playerIndex: 1,
      payload: {},
    });
    expect(buildEventTimeline([hiddenDraw]).durationMs).toBe(FLIGHT_MS);
    expect(buildEventTimeline([drawn()]).durationMs).toBe(TRAVEL_MS);
    const lifeToHand = at({
      type: "CARD_ADDED_TO_HAND_FROM_LIFE",
      playerIndex: 0,
      payload: { cardId: "OP01-006", cardInstanceId: "h-1" },
    });
    // Life to hand without a Life side never flips (OPT-1059 adds sourceFace).
    expect(buildEventTimeline([lifeToHand]).durationMs).toBe(FLIGHT_MS);
  });
});

describe("Life, mill and bounce beats (OPT-1059)", () => {
  const mill = (n: number) =>
    at({
      type: "CARD_TRASHED",
      playerIndex: 0,
      payload: {
        count: n,
        reason: "mill",
        from: "DECK",
        cards: Array.from({ length: n }, (_, i) => ({
          instanceId: `t-${i}`,
          cardId: `OP01-00${i}`,
        })),
      },
    } as Omit<GameEvent, "timestamp">);

  it("plays a named mill as one travel beat that flips its top card", () => {
    const event = mill(3);
    expect(classifyEventBeat(event)).toBe("travel");
    const timeline = buildEventTimeline([event]);
    expect(timeline.durationMs).toBe(
      FLIP_MS + 2 * cardStagger.pileMs + FLIGHT_MS
    );
  });

  it("keeps a count-only mill a dissolve", () => {
    const event = at({
      type: "CARD_TRASHED",
      playerIndex: 0,
      payload: { count: 2, reason: "mill", from: "DECK" },
    } as Omit<GameEvent, "timestamp">);
    expect(classifyEventBeat(event)).toBe("transform");
  });

  it("holds an add-to-Life beat for its flip", () => {
    const event = at({
      type: "CARD_ADDED_TO_LIFE",
      playerIndex: 0,
      payload: {
        cardId: "OP01-010",
        cardInstanceId: "f-1",
        newCardInstanceId: "l-1",
        face: "DOWN",
      },
    } as Omit<GameEvent, "timestamp">);
    expect(classifyEventBeat(event)).toBe("travel");
    expect(buildEventTimeline([event]).durationMs).toBe(TRAVEL_MS);
    expect(siblingStaggerMs("CARD_ADDED_TO_LIFE")).toBe(cardStagger.pileMs);
  });

  it("holds a public Life-to-hand beat for its flip", () => {
    const event = at({
      type: "CARD_ADDED_TO_HAND_FROM_LIFE",
      playerIndex: 0,
      payload: { cardId: "OP01-010", cardInstanceId: "h-1", sourceFace: "DOWN" },
    } as Omit<GameEvent, "timestamp">);
    expect(buildEventTimeline([event]).durationMs).toBe(TRAVEL_MS);
  });

  it("gives a Life card turning over its own beat", () => {
    const turn = at({
      type: "LIFE_CARD_FACE_CHANGED",
      playerIndex: 0,
      payload: { face: "UP" },
    } as Omit<GameEvent, "timestamp">);
    expect(classifyEventBeat(turn)).toBe("pulse");
  });
});
