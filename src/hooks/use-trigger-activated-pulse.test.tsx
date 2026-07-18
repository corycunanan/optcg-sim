import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  TRIGGER_ACTIVATED_PULSE_DURATION_MS,
  useTriggerActivatedPulse,
} from "./use-trigger-activated-pulse";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function triggerEvent(
  timestamp: number,
  playerIndex: 0 | 1,
  activated?: boolean
): GameEvent {
  return {
    type: "TRIGGER_ACTIVATED",
    playerIndex,
    timestamp,
    payload: { cardId: "OP01-001", activated },
  };
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  const activePlayers = useTriggerActivatedPulse(eventLog);
  return <output>{Array.from(activePlayers).join(",")}</output>;
}

function readActivePlayers(): Set<number> {
  const value = renderer?.root.findByType("output").children.join("") ?? "";
  return new Set(value ? value.split(",").map(Number) : []);
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

describe("useTriggerActivatedPulse", () => {
  it("pulses only the owner of an accepted Trigger", async () => {
    await render([]);
    await render([triggerEvent(1, 0), triggerEvent(2, 0, false)]);
    expect(readActivePlayers().size).toBe(0);

    await render([
      triggerEvent(1, 0),
      triggerEvent(2, 0, false),
      triggerEvent(3, 1, true),
    ]);
    expect(readActivePlayers()).toEqual(new Set([1]));

    act(() => {
      vi.advanceTimersByTime(TRIGGER_ACTIVATED_PULSE_DURATION_MS);
    });
    expect(readActivePlayers().size).toBe(0);
  });

  it("does not replay accepted Trigger history on mount", async () => {
    await render([triggerEvent(5, 1, true)]);
    expect(readActivePlayers().size).toBe(0);
  });

  it("short-circuits Trigger feedback for reduced motion", async () => {
    motionState.reduced = true;
    await render([]);
    await render([triggerEvent(1, 0, true)]);
    expect(readActivePlayers().size).toBe(0);
  });
});
