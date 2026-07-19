import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  EFFECTS_NEGATED_PULSE_DURATION_MS,
  useEffectsNegatedPulse,
} from "./use-effects-negated-pulse";

const motionState = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function negatedEvent(
  timestamp: number,
  targetInstanceIds: string[]
): GameEvent {
  return {
    type: "EFFECTS_NEGATED",
    playerIndex: 0,
    timestamp,
    payload: { targetInstanceIds },
  };
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  const pulses = useEffectsNegatedPulse(eventLog);
  return <output>{JSON.stringify(Array.from(pulses.entries()))}</output>;
}

function readPulses(): Map<string, string> {
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

describe("useEffectsNegatedPulse", () => {
  it("fans one event out to every negated target and clears together", async () => {
    await render([]);
    await render([negatedEvent(1, ["card-2", "card-1"])]);
    expect(new Set(readPulses().keys())).toEqual(new Set(["card-1", "card-2"]));

    act(() => {
      vi.advanceTimersByTime(EFFECTS_NEGATED_PULSE_DURATION_MS);
    });
    expect(readPulses().size).toBe(0);
  });

  it("does not replay history and respects reduced motion", async () => {
    await render([negatedEvent(5, ["old-card"])]);
    expect(readPulses().size).toBe(0);

    motionState.reduced = true;
    await render([
      negatedEvent(5, ["old-card"]),
      negatedEvent(6, ["new-card"]),
    ]);
    expect(readPulses().size).toBe(0);
  });
});
