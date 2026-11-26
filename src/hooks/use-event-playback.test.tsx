import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@shared/game-types";
import { buildEventTimeline } from "@/lib/game/event-timeline";
import { useEventPlayback } from "./use-event-playback";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
}));

function drawn(timestamp: number, playerIndex: 0 | 1 = 0): GameEvent {
  return {
    type: "CARD_DRAWN",
    playerIndex,
    timestamp,
    payload: { cardId: "OP01-003" },
  };
}

function knockOut(timestamp: number): GameEvent {
  return {
    type: "CARD_KO",
    playerIndex: 1,
    timestamp,
    payload: {
      cardId: "OP01-002",
      cardInstanceId: `k-${timestamp}`,
      cause: "effect",
      preKO_donCount: 0,
    },
  };
}

let renderer: ReactTestRenderer | null = null;

function Probe({ eventLog }: { eventLog: GameEvent[] }) {
  return <output>{useEventPlayback(eventLog) ? "playing" : "idle"}</output>;
}

function read(): string {
  return renderer?.root.findByType("output").children.join("") ?? "";
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

describe("useEventPlayback", () => {
  it("never replays history present on mount", async () => {
    await render([knockOut(1), drawn(2)]);
    expect(read()).toBe("idle");
  });

  it("holds until a multi-step update has finished playing", async () => {
    const update = [knockOut(1), drawn(2)];
    const { durationMs } = buildEventTimeline(update);
    await render([]);
    await render(update);
    expect(read()).toBe("playing");

    act(() => {
      vi.advanceTimersByTime(durationMs - 1);
    });
    expect(read()).toBe("playing");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(read()).toBe("idle");
  });

  it("does not hold for a single step", async () => {
    await render([]);
    await render([drawn(1), drawn(2)]);
    expect(read()).toBe("idle");
  });

  it("does not hold under reduced motion", async () => {
    motionState.reduced = true;
    await render([]);
    await render([knockOut(1), drawn(2)]);
    expect(read()).toBe("idle");
  });
});
