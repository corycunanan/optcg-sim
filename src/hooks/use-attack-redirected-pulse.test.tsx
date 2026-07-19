import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  ATTACK_REDIRECTED_PULSE_DURATION_MS,
  useAttackRedirectedPulse,
} from "./use-attack-redirected-pulse";

const motionState = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function redirectEvent(
  timestamp: number,
  newTargetInstanceId: string
): GameEvent {
  return {
    type: "ATTACK_REDIRECTED",
    playerIndex: 0,
    timestamp,
    payload: { newTargetInstanceId },
  };
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  const pulses = useAttackRedirectedPulse(eventLog);
  return <output>{JSON.stringify(Array.from(pulses.entries()))}</output>;
}

function readPulses(): Map<string, number> {
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

describe("useAttackRedirectedPulse", () => {
  it("pulses only the new target and clears on schedule", async () => {
    await render([]);
    await render([redirectEvent(1, "new-target")]);
    expect(readPulses()).toEqual(new Map([["new-target", 1]]));

    act(() => {
      vi.advanceTimersByTime(ATTACK_REDIRECTED_PULSE_DURATION_MS);
    });
    expect(readPulses().size).toBe(0);
  });

  it("does not replay history and respects reduced motion", async () => {
    await render([redirectEvent(5, "old-target")]);
    expect(readPulses().size).toBe(0);

    motionState.reduced = true;
    await render([
      redirectEvent(5, "old-target"),
      redirectEvent(6, "new-target"),
    ]);
    expect(readPulses().size).toBe(0);
  });
});
