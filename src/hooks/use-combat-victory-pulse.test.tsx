import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  COMBAT_VICTORY_PULSE_DURATION_MS,
  useCombatVictoryPulse,
} from "./use-combat-victory-pulse";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function event(
  type: GameEvent["type"],
  timestamp: number,
  payload: object
): GameEvent {
  return { type, playerIndex: 0, timestamp, payload } as GameEvent;
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  const activeIds = useCombatVictoryPulse(eventLog);
  return <output>{Array.from(activeIds).join(",")}</output>;
}

function readActiveIds(): Set<string> {
  const value = renderer?.root.findByType("output").children.join("") ?? "";
  return new Set(value ? value.split(",") : []);
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

describe("useCombatVictoryPulse", () => {
  it("keys feedback from COMBAT_VICTORY, never BATTLE_RESOLVED", async () => {
    await render([]);
    await render([event("BATTLE_RESOLVED", 1, {})]);
    expect(readActiveIds().size).toBe(0);

    await render([
      event("BATTLE_RESOLVED", 1, {}),
      event("COMBAT_VICTORY", 2, {
        cardInstanceId: "winner-1",
        targetInstanceId: "loser-1",
      }),
    ]);

    expect(readActiveIds()).toEqual(new Set(["winner-1"]));

    act(() => {
      vi.advanceTimersByTime(COMBAT_VICTORY_PULSE_DURATION_MS);
    });
    expect(readActiveIds().size).toBe(0);
  });

  it("does not replay event history on mount", async () => {
    await render([
      event("COMBAT_VICTORY", 5, {
        cardInstanceId: "old-winner",
        targetInstanceId: "old-loser",
      }),
    ]);

    expect(readActiveIds().size).toBe(0);
  });

  it("short-circuits winner feedback for reduced motion", async () => {
    motionState.reduced = true;
    await render([]);
    await render([
      event("COMBAT_VICTORY", 1, {
        cardInstanceId: "winner-1",
        targetInstanceId: "loser-1",
      }),
    ]);

    expect(readActiveIds().size).toBe(0);
  });
});
