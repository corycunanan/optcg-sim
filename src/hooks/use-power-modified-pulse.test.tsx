import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  POWER_MODIFIED_PULSE_DURATION_MS,
  usePowerModifiedPulse,
} from "./use-power-modified-pulse";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function powerEvent(
  timestamp: number,
  targetInstanceId: string,
  payload: { amount?: number; value?: number }
): GameEvent {
  return {
    type: "POWER_MODIFIED",
    playerIndex: 0,
    timestamp,
    payload: { targetInstanceId, ...payload },
  };
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  const pulses = usePowerModifiedPulse(eventLog);
  return <output>{JSON.stringify(Array.from(pulses.entries()))}</output>;
}

function readPulses(): Map<string, { delta: number; nonce: number }> {
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

describe("usePowerModifiedPulse", () => {
  it("queues deltas per target and increments the restart nonce", async () => {
    const first = powerEvent(1, "card-1", { amount: 2000 });
    const second = powerEvent(2, "card-1", { amount: -1000 });
    await render([]);
    await render([first]);
    expect(readPulses().get("card-1")).toEqual({ delta: 2000, nonce: 1 });

    await render([first, second]);
    expect(readPulses().get("card-1")).toEqual({ delta: 2000, nonce: 1 });

    act(() => {
      vi.advanceTimersByTime(POWER_MODIFIED_PULSE_DURATION_MS);
    });
    expect(readPulses().get("card-1")).toEqual({ delta: -1000, nonce: 2 });

    act(() => {
      vi.advanceTimersByTime(POWER_MODIFIED_PULSE_DURATION_MS);
    });
    expect(readPulses().size).toBe(0);
  });

  it("uses value payloads without replaying mounted history", async () => {
    await render([powerEvent(5, "old-card", { value: 5000 })]);
    expect(readPulses().size).toBe(0);

    await render([
      powerEvent(5, "old-card", { value: 5000 }),
      powerEvent(6, "new-card", { value: 7000 }),
    ]);
    expect(readPulses().get("new-card")?.delta).toBe(7000);
  });

  it("short-circuits power feedback for reduced motion", async () => {
    motionState.reduced = true;
    await render([]);
    await render([powerEvent(1, "card-1", { amount: 1000 })]);
    expect(readPulses().size).toBe(0);
  });
});
