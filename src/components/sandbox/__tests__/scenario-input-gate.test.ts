import { describe, expect, it, vi } from "vitest";
import type { GameAction } from "@shared/game-types";
import { buildScenarioInputGate } from "../scenario-input-gate";
import type { Scenario } from "@/lib/sandbox/scenarios/types";
import type { PlaybackState } from "../use-scenario-runner";

const SELECT_TARGET_ACTION: GameAction = {
  type: "SELECT_TARGET",
  selectedInstanceIds: ["p0-leader"],
};

const PLAY_CARD_ACTION: GameAction = {
  type: "PLAY_CARD",
  cardInstanceId: "p0-hand-0",
};

const SELECT_TARGET_OTHER: GameAction = {
  type: "SELECT_TARGET",
  selectedInstanceIds: ["p1-leader"],
};

function spectatorScenario(): Pick<Scenario, "inputMode" | "expectedResponse"> {
  return { inputMode: "spectator" };
}

function interactiveScenario(
  overrides: Partial<NonNullable<Scenario["expectedResponse"]>> = {},
): Pick<Scenario, "inputMode" | "expectedResponse"> {
  return {
    inputMode: "interactive",
    expectedResponse: {
      allowedActionTypes: ["SELECT_TARGET"],
      predicate: (action) =>
        action.type === "SELECT_TARGET" &&
        action.selectedInstanceIds.includes("p0-leader"),
      ...overrides,
    },
  };
}

describe("buildScenarioInputGate — spectator", () => {
  it("returns spectator interactionMode and Watching hint", () => {
    const resolvePrompt = vi.fn();
    const gate = buildScenarioInputGate({
      scenario: spectatorScenario(),
      playbackState: "playing",
      resolvePrompt,
    });
    expect(gate.interactionMode).toBe("spectator");
    expect(gate.hint).toEqual({ kind: "watching", text: "Watching" });
  });

  it("swallows every action regardless of playback state", () => {
    const states: PlaybackState[] = [
      "idle",
      "playing",
      "paused",
      "awaiting-response",
      "ended",
    ];
    for (const playbackState of states) {
      const resolvePrompt = vi.fn();
      const gate = buildScenarioInputGate({
        scenario: spectatorScenario(),
        playbackState,
        resolvePrompt,
      });
      gate.sendAction(SELECT_TARGET_ACTION);
      gate.sendAction(PLAY_CARD_ACTION);
      expect(resolvePrompt).not.toHaveBeenCalled();
    }
  });
});

describe("buildScenarioInputGate — interactive (not awaiting-response)", () => {
  it.each<PlaybackState>(["idle", "playing", "paused", "ended"])(
    "swallows actions and returns no hint while playbackState=%s",
    (playbackState) => {
      const resolvePrompt = vi.fn();
      const gate = buildScenarioInputGate({
        scenario: interactiveScenario(),
        playbackState,
        resolvePrompt,
      });
      expect(gate.interactionMode).toBe("responseOnly");
      expect(gate.hint).toBeNull();
      gate.sendAction(SELECT_TARGET_ACTION);
      expect(resolvePrompt).not.toHaveBeenCalled();
    },
  );
});

describe("buildScenarioInputGate — interactive (awaiting-response)", () => {
  it("forwards a matching action to resolvePrompt", () => {
    const resolvePrompt = vi.fn();
    const gate = buildScenarioInputGate({
      scenario: interactiveScenario(),
      playbackState: "awaiting-response",
      resolvePrompt,
    });
    gate.sendAction(SELECT_TARGET_ACTION);
    expect(resolvePrompt).toHaveBeenCalledTimes(1);
    expect(resolvePrompt).toHaveBeenCalledWith(SELECT_TARGET_ACTION);
  });

  it("drops actions whose type is not in allowedActionTypes", () => {
    const resolvePrompt = vi.fn();
    const gate = buildScenarioInputGate({
      scenario: interactiveScenario(),
      playbackState: "awaiting-response",
      resolvePrompt,
    });
    gate.sendAction(PLAY_CARD_ACTION);
    expect(resolvePrompt).not.toHaveBeenCalled();
  });

  it("drops allowed-type actions whose predicate returns false", () => {
    const resolvePrompt = vi.fn();
    const gate = buildScenarioInputGate({
      scenario: interactiveScenario(),
      playbackState: "awaiting-response",
      resolvePrompt,
    });
    gate.sendAction(SELECT_TARGET_OTHER);
    expect(resolvePrompt).not.toHaveBeenCalled();
  });

  it("uses the scenario's hint text when provided", () => {
    const gate = buildScenarioInputGate({
      scenario: interactiveScenario({ hint: "Pick your leader" }),
      playbackState: "awaiting-response",
      resolvePrompt: vi.fn(),
    });
    expect(gate.hint).toEqual({
      kind: "respond-to-continue",
      text: "Pick your leader",
    });
  });

  it("falls back to a default hint when none is provided", () => {
    const gate = buildScenarioInputGate({
      scenario: interactiveScenario(),
      playbackState: "awaiting-response",
      resolvePrompt: vi.fn(),
    });
    expect(gate.hint).toEqual({
      kind: "respond-to-continue",
      text: "Respond to continue",
    });
  });

  it("drops every action when interactive scenario has no expectedResponse", () => {
    const resolvePrompt = vi.fn();
    const gate = buildScenarioInputGate({
      scenario: { inputMode: "interactive" },
      playbackState: "awaiting-response",
      resolvePrompt,
    });
    gate.sendAction(SELECT_TARGET_ACTION);
    expect(resolvePrompt).not.toHaveBeenCalled();
  });
});
