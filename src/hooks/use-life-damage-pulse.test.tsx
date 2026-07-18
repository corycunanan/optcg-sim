import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import {
  LIFE_DAMAGE_PULSE_DURATION_MS,
  useLifeDamagePulse,
} from "./use-life-damage-pulse";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function damageEvent(
  timestamp: number,
  attackerIndex: 0 | 1,
  lethal = false
): GameEvent {
  return {
    type: "DAMAGE_DEALT",
    playerIndex: attackerIndex,
    timestamp,
    payload: {
      amount: 1,
      attackerInstanceId: "attacker-1",
      attackerType: "LEADER",
      lethal,
    },
  };
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  const activePlayers = useLifeDamagePulse(eventLog);
  return (
    <output>
      {Array.from(activePlayers, ([key, nonce]) => `${key}:${nonce}`).join(",")}
    </output>
  );
}

function readActivePlayers(): Map<number, number> {
  const value = renderer?.root.findByType("output").children.join("") ?? "";
  return new Map(
    value
      ? value.split(",").map((entry) => {
          const [key, nonce] = entry.split(":").map(Number);
          return [key, nonce] as const;
        })
      : []
  );
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

describe("useLifeDamagePulse", () => {
  it("pulses the life owner opposite the battle attacker", async () => {
    await render([]);
    await render([damageEvent(1, 0)]);
    expect(readActivePlayers()).toEqual(new Map([[1, 1]]));

    act(() => {
      vi.advanceTimersByTime(LIFE_DAMAGE_PULSE_DURATION_MS);
    });
    expect(readActivePlayers().size).toBe(0);
  });

  it("emits two observable pulses for Double Attack damage in one update", async () => {
    await render([]);
    await render([damageEvent(1, 0), damageEvent(2, 0)]);
    expect(readActivePlayers()).toEqual(new Map([[1, 1]]));

    act(() => {
      vi.advanceTimersByTime(LIFE_DAMAGE_PULSE_DURATION_MS);
    });
    expect(readActivePlayers()).toEqual(new Map([[1, 2]]));

    act(() => {
      vi.advanceTimersByTime(LIFE_DAMAGE_PULSE_DURATION_MS);
    });
    expect(readActivePlayers().size).toBe(0);
  });

  it("ignores lethal leader damage because it removes no life card", async () => {
    await render([]);
    await render([damageEvent(1, 1, true)]);
    expect(readActivePlayers().size).toBe(0);
  });

  it("short-circuits life-impact feedback for reduced motion", async () => {
    motionState.reduced = true;
    await render([]);
    await render([damageEvent(1, 1)]);
    expect(readActivePlayers().size).toBe(0);
  });
});
