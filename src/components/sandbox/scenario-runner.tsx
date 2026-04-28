"use client";

// Animation Sandbox scenario player. Branches on `scenario.mode`:
//
//   - "scripted" (default): runner controller (OPT-289) + input gate (OPT-290)
//     + applyEvent-folded session (OPT-286). Plays a hand-authored event
//     script through the production Board.
//   - "playground" (OPT-306): engine-driven session (OPT-305). User actions
//     flow through `runPipeline`; the runner has no script and no playback
//     timer.
//
// Both modes hand the BoardState/BoardDispatch they synthesize to
// `<SandboxShell>` (OPT-314), which composes the chrome and wraps `<Board>`
// in `<ScaledBoard>` + `<PortalRoot>`. Sandbox chrome (header, info panel,
// playback control bar) lives outside the scaled subtree as required by the
// shell contract.

import { useMemo, useCallback } from "react";
import type { CardData } from "@shared/game-types";
import { SANDBOX_CARD_DB } from "@/lib/sandbox/sandbox-card-data";
import { scenarios } from "@/lib/sandbox/scenarios";
import type { Scenario } from "@/lib/sandbox/scenarios";
import { useScenarioRunner } from "./use-scenario-runner";
import { useScenarioInputGate } from "./scenario-input-gate";
import { useSandboxGameSession } from "./sandbox-session-provider";
import { useSandboxEngineSession } from "./sandbox-engine-session-provider";
import { PlaybackControlBar } from "./playback-control-bar";
import { SandboxMuteProvider } from "./use-sandbox-mute";
import { SandboxShell } from "./sandbox-shell";
import type {
  BoardState,
  BoardDispatch,
} from "@/components/game/board";

export interface ScenarioRunnerProps {
  // Accept the id and look up the scenario client-side. Passing the full
  // Scenario object across the server/client boundary fails because
  // expectedResponse.predicate is a function and Next.js cannot serialize it.
  scenarioId: string;
}

export function ScenarioRunner({ scenarioId }: ScenarioRunnerProps) {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  return (
    <SandboxMuteProvider>
      {scenario.mode === "playground" ? (
        <PlaygroundScenarioBody scenario={scenario} />
      ) : (
        <ScriptedScenarioBody scenario={scenario} />
      )}
    </SandboxMuteProvider>
  );
}

// ─── Scripted body (OPT-289 + OPT-290 + OPT-286) ───────────────────────

function ScriptedScenarioBody({ scenario }: { scenario: Scenario }) {
  const runner = useScenarioRunner(scenario);
  const gate = useScenarioInputGate({
    scenario,
    playbackState: runner.playbackState,
    resolvePrompt: runner.resolvePrompt,
  });

  const sessionInput = useMemo(
    () => ({
      initialState: scenario.initialState,
      events: runner.eventLog,
      cardDb: SANDBOX_CARD_DB,
      activePrompt: runner.activePrompt,
      onAction: gate.sendAction,
    }),
    [
      scenario.initialState,
      runner.eventLog,
      runner.activePrompt,
      gate.sendAction,
    ],
  );

  const session = useSandboxGameSession(sessionInput);

  const onLeave = useCallback(
    () => void session.navigation.handleBackToLobbies(),
    [session.navigation],
  );

  const state: BoardState = {
    me: session.game.me,
    opp: session.game.opp,
    myIndex: session.game.myIndex,
    turn: session.game.turn,
    cardDb: session.game.cardDb,
    isMyTurn: session.game.isMyTurn,
    battlePhase: session.game.battlePhase,
    connectionStatus: session.game.connectionStatus,
    eventLog: session.game.gameState.eventLog,
    activeEffects: session.game.gameState.activeEffects,
    activePrompt: session.game.activePrompt,
    matchClosed: session.game.matchClosed,
    canUndo: session.game.canUndo,
    interactionMode: gate.interactionMode,
  };

  const dispatch: BoardDispatch = {
    onAction: session.game.sendAction,
    onLeave,
  };

  return (
    <SandboxShell
      scenario={scenario}
      hint={gate.hint}
      state={state}
      dispatch={dispatch}
      controlBar={
        <PlaybackControlBar
          playbackState={runner.playbackState}
          currentStepIndex={runner.currentStepIndex}
          totalSteps={runner.totalSteps}
          onPlay={runner.play}
          onPause={runner.pause}
          onReset={runner.reset}
          onStep={runner.stepForward}
        />
      }
    />
  );
}

// ─── Playground body (OPT-305) ─────────────────────────────────────────

function PlaygroundScenarioBody({ scenario }: { scenario: Scenario }) {
  // Engine consumes Map<string, CardData>; the rest of the sandbox surface
  // uses the Record shape. Convert once and memoize so the engine session's
  // dispatch identity stays stable across renders.
  const cardDbMap = useMemo<Map<string, CardData>>(
    () => new Map(Object.entries(SANDBOX_CARD_DB)),
    [],
  );

  const session = useSandboxEngineSession({
    initialState: scenario.initialState,
    cardDb: cardDbMap,
  });

  const onLeave = useCallback(
    () => void session.navigation.handleBackToLobbies(),
    [session.navigation],
  );

  const state: BoardState = {
    me: session.game.me,
    opp: session.game.opp,
    myIndex: session.game.myIndex,
    turn: session.game.turn,
    cardDb: session.game.cardDb,
    isMyTurn: session.game.isMyTurn,
    battlePhase: session.game.battlePhase,
    connectionStatus: session.game.connectionStatus,
    eventLog: session.game.gameState.eventLog,
    activeEffects: session.game.gameState.activeEffects,
    activePrompt: session.game.activePrompt,
    matchClosed: session.game.matchClosed,
    canUndo: session.game.canUndo,
    interactionMode: "full",
  };

  const dispatch: BoardDispatch = {
    onAction: session.game.sendAction,
    onLeave,
  };

  return (
    <SandboxShell
      scenario={scenario}
      hint={null}
      state={state}
      dispatch={dispatch}
      controlBar={
        // Playground chrome (OPT-307): PlaybackControlBar branches on
        // `mode="playground"` to hide Play/Pause/Step + the step counter
        // and promote Reset. Mute stays available in both modes.
        <PlaybackControlBar
          mode="playground"
          playbackState="idle"
          currentStepIndex={0}
          totalSteps={0}
          onPlay={noop}
          onPause={noop}
          onReset={session.reset}
          onStep={noop}
        />
      }
    />
  );
}

function noop(): void {}
