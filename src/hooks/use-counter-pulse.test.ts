import { describe, expect, it } from "vitest";
import type { GameEvent } from "@shared/game-types";
import { countNewCounterEvents } from "./use-counter-pulse";

function event(type: string, timestamp: number, payload: unknown = {}): GameEvent {
  return {
    type,
    playerIndex: 0,
    timestamp,
    payload,
  } as unknown as GameEvent;
}

describe("countNewCounterEvents", () => {
  it("returns zero when the log is empty", () => {
    const result = countNewCounterEvents([], 0);
    expect(result.count).toBe(0);
    expect(result.maxTimestamp).toBe(0);
  });

  it("ignores events at or below the cursor", () => {
    const log = [
      event("COUNTER_USED", 10),
      event("COUNTER_USED", 20),
    ];
    const result = countNewCounterEvents(log, 20);
    expect(result.count).toBe(0);
    expect(result.maxTimestamp).toBe(20);
  });

  it("counts only COUNTER_USED events past the cursor", () => {
    const log = [
      event("COUNTER_USED", 10),
      event("CARD_PLAYED", 15),
      event("COUNTER_USED", 20),
      event("COUNTER_USED", 25),
    ];
    const result = countNewCounterEvents(log, 10);
    expect(result.count).toBe(2);
    expect(result.maxTimestamp).toBe(25);
  });

  it("maxTimestamp tracks the highest event timestamp (any type) past the cursor", () => {
    const log = [
      event("COUNTER_USED", 10),
      event("CARD_PLAYED", 30),
      event("COUNTER_USED", 25),
    ];
    const result = countNewCounterEvents(log, 10);
    expect(result.count).toBe(1);
    expect(result.maxTimestamp).toBe(30);
  });
});
