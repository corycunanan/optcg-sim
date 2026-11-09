import { describe, expect, it } from "vitest";
import type { GameEvent } from "@shared/game-types";
import { cardFizzle, cardTransitions } from "@/lib/motion";
import {
  BEAT_GAP_MS,
  MAX_PLAYBACK_MS,
  MIN_BEAT_GAP_MS,
  MULTI_CARD_STAGGER_MS,
  PULSE_READ_MS,
  SPOTLIGHT_DWELL_MS,
  buildEventTimeline,
  classifyEventBeat,
  eventOffsetMs,
} from "./event-timeline";

const FLIGHT_MS = Math.round(cardTransitions.zoneMove.duration * 1000);
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
    expect(knockOut).toBe(FLIGHT_MS + BEAT_GAP_MS);
    expect(draw).toBe(knockOut + FIZZLE_MS + BEAT_GAP_MS);
    expect(timeline.durationMs).toBe(draw + FLIGHT_MS);
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
    expect(timeline.durationMs).toBe(2 * MULTI_CARD_STAGGER_MS + FLIGHT_MS);
  });

  it("resolves a simultaneous K.O. together", () => {
    const events = [ko(), ko()];
    const timeline = buildEventTimeline(events);
    expect(events.map((event) => eventOffsetMs(timeline, event))).toEqual([
      0, 0,
    ]);
  });

  it("starts a new beat when the player changes", () => {
    const events = [drawn(0), drawn(1)];
    const timeline = buildEventTimeline(events);
    expect(eventOffsetMs(timeline, events[1])).toBe(FLIGHT_MS + BEAT_GAP_MS);
  });

  it("lets state-rendered events ride along with the beat before them", () => {
    const events = [played(), phase(), powered()];
    const timeline = buildEventTimeline(events);
    expect(eventOffsetMs(timeline, events[1])).toBe(0);
    expect(eventOffsetMs(timeline, events[2])).toBe(FLIGHT_MS + BEAT_GAP_MS);
    expect(timeline.durationMs).toBe(
      FLIGHT_MS + BEAT_GAP_MS + PULSE_READ_MS
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
});
