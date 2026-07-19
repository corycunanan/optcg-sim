import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  LIFE_SCRIED_PULSE_DURATION_MS,
  useLifeScriedPulse,
} from "./use-life-scried-pulse";

const motionState = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function scryEvent(timestamp: number, playerIndex: 0 | 1): GameEvent {
  return {
    type: "LIFE_SCRIED",
    playerIndex,
    timestamp,
    payload: { cards: [], count: 2 },
  };
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  const pulses = useLifeScriedPulse(eventLog);
  return <output>{JSON.stringify(Array.from(pulses.entries()))}</output>;
}

function readPulses(): Map<0 | 1, number> {
  const value = renderer?.root.findByType("output").children.join("") ?? "[]";
  return new Map(JSON.parse(value));
}

async function render(eventLog: GameEvent[]) {
  await act(async () => {
    if (renderer) renderer.update(<Probe eventLog={eventLog} />);
    else renderer = create(<Probe eventLog={eventLog} />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  motionState.reduced = false;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.useRealTimers();
});

describe("useLifeScriedPulse", () => {
  it("pulses only the scrying player's Life zone", async () => {
    await render([]);
    await render([scryEvent(1, 1)]);
    expect(readPulses()).toEqual(new Map([[1, 1]]));

    act(() => {
      vi.advanceTimersByTime(LIFE_SCRIED_PULSE_DURATION_MS);
    });
    expect(readPulses().size).toBe(0);
  });

  it("does not replay history and respects reduced motion", async () => {
    await render([scryEvent(5, 0)]);
    expect(readPulses().size).toBe(0);

    motionState.reduced = true;
    await render([scryEvent(5, 0), scryEvent(6, 1)]);
    expect(readPulses().size).toBe(0);
  });
});
