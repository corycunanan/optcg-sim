"use client";

// Input gate for the Animation Sandbox (OPT-290). Wraps `sendAction` so
// scenarios opt into one of two input modes:
//
//   - spectator: every action is swallowed. The board renders read-only.
//   - interactive: actions only forward to the runner's `resolvePrompt`
//     when the runner is `awaiting-response` AND the action satisfies the
//     scenario's `expectedResponse` (allowed type + predicate).
//
// Drag/right-click suppression is handled by `BoardLayout`'s
// `interactionMode` prop (see `board-layout/interaction-mode.ts`). This
// gate only owns the *action* path. The two pieces are paired in OPT-291's
// scenario player page: the gate's `interactionMode` value feeds
// BoardLayout, and its `sendAction` feeds the sandbox session provider.
//
// The runner intentionally does not validate against the scenario's
// predicate — that's this file's job. See OPT-289's runner top comment.

import { useMemo } from "react";
import type { GameAction } from "@shared/game-types";
import type { Scenario } from "@/lib/sandbox/scenarios/types";
import type { PlaybackState } from "./use-scenario-runner";
import type { InteractionMode } from "@/components/game/board-layout/interaction-mode";

// ─── Public types ──────────────────────────────────────────────────────

export interface ScenarioInputGate {
  /** Feed this into `<BoardLayout interactionMode={…} />`. */
  interactionMode: InteractionMode;
  /** Wrapped `sendAction`. Always safe to call — invalid actions no-op. */
  sendAction: (action: GameAction) => void;
  /** Info-panel hint text. `null` when no banner is appropriate (e.g.,
   *  interactive scenario mid-playback before the prompt fires). */
  hint: ScenarioInputHint | null;
}

export type ScenarioInputHint =
  | { kind: "watching"; text: string }
  | { kind: "respond-to-continue"; text: string };

export interface ScenarioInputGateInput {
  scenario: Pick<Scenario, "inputMode" | "expectedResponse">;
  /** Current playback state from the runner. The gate only forwards actions
   *  while this is `awaiting-response`. */
  playbackState: PlaybackState;
  /** Runner's `resolvePrompt` — called on validated interactive responses. */
  resolvePrompt: (action: GameAction) => void;
}

// ─── Pure builder ──────────────────────────────────────────────────────

export function buildScenarioInputGate(
  input: ScenarioInputGateInput,
): ScenarioInputGate {
  const { scenario, playbackState, resolvePrompt } = input;

  if (scenario.inputMode === "spectator") {
    return {
      interactionMode: "spectator",
      sendAction: noop,
      hint: { kind: "watching", text: "Watching" },
    };
  }

  const expected = scenario.expectedResponse;
  const awaiting = playbackState === "awaiting-response";

  function sendAction(action: GameAction): void {
    if (!awaiting) return;
    if (!expected) return;
    if (!expected.allowedActionTypes.includes(action.type)) return;
    if (!expected.predicate(action)) return;
    resolvePrompt(action);
  }

  const hint: ScenarioInputHint | null = awaiting
    ? {
        kind: "respond-to-continue",
        text: expected?.hint ?? "Respond to continue",
      }
    : null;

  return {
    interactionMode: "responseOnly",
    sendAction,
    hint,
  };
}

// ─── React hook ────────────────────────────────────────────────────────

export function useScenarioInputGate({
  scenario,
  playbackState,
  resolvePrompt,
}: ScenarioInputGateInput): ScenarioInputGate {
  return useMemo(
    () => buildScenarioInputGate({ scenario, playbackState, resolvePrompt }),
    [scenario, playbackState, resolvePrompt],
  );
}

function noop(): void {}
