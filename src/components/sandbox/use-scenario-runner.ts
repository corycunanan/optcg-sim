"use client";

// Scenario runner controller for the Animation Sandbox (OPT-289). Drives a
// scenario forward by holding playback state and folding `applyEvent` over
// `script[0..currentStepIndex]`'s events from `scenario.initialState`. The
// derived game state is what the sandbox session provider (OPT-286) feeds
// into the production `BoardLayout`.
//
// Two pieces, mirroring the OPT-286 split:
//
//   - `createScenarioRunner`: pure controller. Owns the timer and exposes
//     a small subscribable surface. Tests use this directly with
//     `vi.useFakeTimers()` (no DOM required, matching vitest's
//     `environment: "node"`).
//   - `useScenarioRunner`: thin React hook over the controller via
//     `useSyncExternalStore`.
//
// Step-backward is a documented non-goal for v1. Implementing it cleanly
// requires both per-step state snapshots (cheap) AND mid-flight reset of
// Motion timelines in `card-animation-layer` (not cheap). File a follow-up
// issue before adding it.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type {
  GameAction,
  GameEvent,
  PromptOptions,
} from "@shared/game-types";
import { applyEvent } from "@/lib/sandbox/apply-event";
import type {
  PartialGameState,
  Scenario,
  ScenarioStep,
} from "@/lib/sandbox/scenarios/types";

// ─── Public types ──────────────────────────────────────────────────────

export type PlaybackState =
  | "idle"
  | "playing"
  | "paused"
  | "awaiting-response"
  | "ended";

export interface ScenarioRunnerState {
  playbackState: PlaybackState;
  currentStepIndex: number;
  totalSteps: number;
  derivedGameState: PartialGameState;
  activePrompt: PromptOptions | null;
  eventLog: GameEvent[];
}

export interface ScenarioRunnerControls {
  play(): void;
  pause(): void;
  reset(): void;
  stepForward(): void;
  resolvePrompt(response: GameAction): void;
}

export interface ScenarioRunner extends ScenarioRunnerControls {
  getState(): ScenarioRunnerState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export const DEFAULT_EVENT_DELAY_MS = 800;

// ─── Pure controller ───────────────────────────────────────────────────

export function createScenarioRunner(scenario: Scenario): ScenarioRunner {
  // `script` is optional on Scenario (playground mode omits it). The runner is
  // only constructed for scripted scenarios, but defaulting here keeps the
  // call site type-safe without a non-null assertion.
  const script = scenario.script ?? [];
  const totalSteps = script.length;

  let playbackState: PlaybackState = "idle";
  let currentStepIndex = 0;
  // Where to return after the input gate calls resolvePrompt. Always
  // "playing" or "paused" — never the transient awaiting-response state.
  let resumeTo: "playing" | "paused" = "paused";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cachedSnapshot: ScenarioRunnerState | null = null;
  const listeners = new Set<() => void>();

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function notify(): void {
    cachedSnapshot = null;
    for (const listener of listeners) listener();
  }

  function stepDelayMs(step: ScenarioStep): number {
    switch (step.type) {
      case "event":
        return step.delayMs ?? DEFAULT_EVENT_DELAY_MS;
      case "wait":
        return step.ms;
      case "checkpoint":
        return 0;
      case "prompt":
        // Prompts don't run on a timer — see schedulePlay.
        return 0;
    }
  }

  // Drive playback forward from the current index. Mode determines whether
  // we land in "playing" (timer-driven) or "paused" (manual). Either way,
  // hitting a prompt step transitions to "awaiting-response" with
  // `resumeTo` recording where to return.
  function schedulePlay(mode: "playing" | "paused"): void {
    clearTimer();
    if (currentStepIndex >= totalSteps) {
      playbackState = "ended";
      return;
    }
    const step = script[currentStepIndex];
    if (step.type === "prompt") {
      playbackState = "awaiting-response";
      resumeTo = mode;
      return;
    }
    if (mode === "paused") {
      playbackState = "paused";
      return;
    }
    playbackState = "playing";
    const delay = stepDelayMs(step);
    timer = setTimeout(() => {
      timer = null;
      applyCurrentStep();
      schedulePlay("playing");
      notify();
    }, delay);
  }

  // Apply the step at currentStepIndex and advance the index. Pure-ish:
  // does not touch playbackState, timer, or resumeTo. `event` is the only
  // step type that contributes to the derived game state via `applyEvent`;
  // `wait` and `checkpoint` are pure script-position markers.
  function applyCurrentStep(): void {
    if (currentStepIndex >= totalSteps) return;
    currentStepIndex += 1;
  }

  // ─── public API ──────────────────────────────────────────────────────

  function play(): void {
    if (playbackState === "playing" || playbackState === "ended") return;
    if (playbackState === "awaiting-response") {
      // Don't override the pending prompt — record intent for resolve.
      resumeTo = "playing";
      notify();
      return;
    }
    schedulePlay("playing");
    notify();
  }

  function pause(): void {
    if (playbackState === "playing") {
      clearTimer();
      playbackState = "paused";
      notify();
      return;
    }
    if (playbackState === "awaiting-response") {
      resumeTo = "paused";
      notify();
      return;
    }
  }

  function reset(): void {
    clearTimer();
    currentStepIndex = 0;
    playbackState = "idle";
    resumeTo = "paused";
    notify();
  }

  function stepForward(): void {
    if (
      playbackState === "ended" ||
      playbackState === "awaiting-response" ||
      currentStepIndex >= totalSteps
    ) {
      return;
    }
    clearTimer();
    const step = script[currentStepIndex];
    if (step.type === "prompt") {
      // "Applying" a prompt transitions to awaiting-response without
      // advancing past it. resolvePrompt does the advance.
      playbackState = "awaiting-response";
      resumeTo = "paused";
      notify();
      return;
    }
    applyCurrentStep();
    if (currentStepIndex >= totalSteps) {
      playbackState = "ended";
    } else {
      playbackState = "paused";
    }
    notify();
  }

  function resolvePrompt(_response: GameAction): void {
    if (playbackState !== "awaiting-response") return;
    // The input gate (OPT-290) is responsible for predicate validation;
    // the runner just advances. The response argument is accepted for
    // API symmetry — the gate may forward it via session.sendAction.
    void _response;
    applyCurrentStep();
    schedulePlay(resumeTo);
    notify();
  }

  function getState(): ScenarioRunnerState {
    if (cachedSnapshot !== null) return cachedSnapshot;
    const eventLog = collectEventLog(script, currentStepIndex);
    const derivedGameState = eventLog.reduce<PartialGameState>(
      (s, e) => applyEvent(s, e),
      scenario.initialState,
    );
    const activePrompt =
      playbackState === "awaiting-response" &&
      currentStepIndex < totalSteps &&
      script[currentStepIndex].type === "prompt"
        ? (script[currentStepIndex] as Extract<
            ScenarioStep,
            { type: "prompt" }
          >).prompt
        : null;
    cachedSnapshot = {
      playbackState,
      currentStepIndex,
      totalSteps,
      derivedGameState,
      activePrompt,
      eventLog,
    };
    return cachedSnapshot;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    clearTimer();
    listeners.clear();
  }

  return {
    play,
    pause,
    reset,
    stepForward,
    resolvePrompt,
    getState,
    subscribe,
    dispose,
  };
}

// ─── React hook ────────────────────────────────────────────────────────

export function useScenarioRunner(
  scenario: Scenario,
): ScenarioRunnerState & ScenarioRunnerControls {
  // One controller per hook instance. Scenario reference changes are not
  // expected during a sandbox session (each scenario gets its own page);
  // file a follow-up if that assumption changes.
  const [runner] = useState(() => createScenarioRunner(scenario));

  useEffect(() => {
    return () => runner.dispose();
  }, [runner]);

  const state = useSyncExternalStore(
    runner.subscribe,
    runner.getState,
    runner.getState,
  );

  return useMemo(
    () => ({
      ...state,
      play: runner.play,
      pause: runner.pause,
      reset: runner.reset,
      stepForward: runner.stepForward,
      resolvePrompt: runner.resolvePrompt,
    }),
    [state, runner],
  );
}

// ─── helpers ───────────────────────────────────────────────────────────

function collectEventLog(
  script: ScenarioStep[],
  upToIndex: number,
): GameEvent[] {
  const out: GameEvent[] = [];
  const limit = Math.min(upToIndex, script.length);
  for (let i = 0; i < limit; i++) {
    const step = script[i];
    if (step.type === "event") out.push(step.event);
  }
  return out;
}
