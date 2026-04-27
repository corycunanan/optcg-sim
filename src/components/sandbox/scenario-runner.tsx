"use client";

// Animation Sandbox scenario player shell. Branches on `scenario.mode`:
//
//   - "scripted" (default): runner controller (OPT-289) + input gate (OPT-290)
//     + applyEvent-folded session (OPT-286). Plays a hand-authored event
//     script through the production BoardLayout.
//   - "playground" (OPT-306): engine-driven session (OPT-305). User actions
//     flow through `runPipeline`; the runner has no script and no playback
//     timer. Only Reset is meaningful in the transport — the rest of the
//     control bar is no-op'd here and will be replaced with playground-mode
//     chrome in OPT-307.
//
// The two paths intentionally do not share a hook chain. They share only the
// outer chrome (header, board container, info panel slot, control bar slot)
// via `ScenarioRunnerShell`. Per OPT-306: don't unify the runner branches.

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { CardData } from "@shared/game-types";
import { BoardLayout } from "@/components/game/board-layout";
import { SANDBOX_CARD_DB } from "@/lib/sandbox/sandbox-card-data";
import { scenarios } from "@/lib/sandbox/scenarios";
import type { Scenario } from "@/lib/sandbox/scenarios";
import { useScenarioRunner } from "./use-scenario-runner";
import { useScenarioInputGate } from "./scenario-input-gate";
import { useSandboxGameSession } from "./sandbox-session-provider";
import { useSandboxEngineSession } from "./sandbox-engine-session-provider";
import { ScenarioInfoPanel } from "./scenario-info-panel";
import type { ScenarioInputHint } from "./scenario-input-gate";
import { PlaybackControlBar } from "./playback-control-bar";
import { SandboxMuteProvider } from "./use-sandbox-mute";

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

  return (
    <ScenarioRunnerShell
      scenario={scenario}
      hint={gate.hint}
      board={
        <BoardLayout
          me={session.game.me}
          opp={session.game.opp}
          myIndex={session.game.myIndex}
          turn={session.game.turn}
          cardDb={session.game.cardDb}
          isMyTurn={session.game.isMyTurn}
          battlePhase={session.game.battlePhase}
          connectionStatus={session.game.connectionStatus}
          eventLog={session.game.gameState.eventLog}
          activeEffects={session.game.gameState.activeEffects}
          activePrompt={session.game.activePrompt}
          onAction={session.game.sendAction}
          onLeave={session.navigation.handleBackToLobbies}
          matchClosed={session.game.matchClosed}
          canUndo={session.game.canUndo}
          interactionMode={gate.interactionMode}
        />
      }
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

  return (
    <ScenarioRunnerShell
      scenario={scenario}
      hint={null}
      board={
        <BoardLayout
          me={session.game.me}
          opp={session.game.opp}
          myIndex={session.game.myIndex}
          turn={session.game.turn}
          cardDb={session.game.cardDb}
          isMyTurn={session.game.isMyTurn}
          battlePhase={session.game.battlePhase}
          connectionStatus={session.game.connectionStatus}
          eventLog={session.game.gameState.eventLog}
          activeEffects={session.game.gameState.activeEffects}
          activePrompt={session.game.activePrompt}
          onAction={session.game.sendAction}
          onLeave={session.navigation.handleBackToLobbies}
          matchClosed={session.game.matchClosed}
          canUndo={session.game.canUndo}
          interactionMode="full"
        />
      }
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

// ─── Shared chrome ─────────────────────────────────────────────────────

function ScenarioRunnerShell({
  scenario,
  board,
  hint,
  controlBar,
}: {
  scenario: Scenario;
  board: ReactNode;
  hint: ScenarioInputHint | null;
  controlBar: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-gb-board">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-5 py-2">
        <Link
          href="/sandbox"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-content-secondary hover:bg-surface-2 hover:text-content-primary"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          <span>Back to Sandbox</span>
        </Link>
        <span aria-hidden className="text-content-disabled">·</span>
        <h1 className="truncate text-sm font-bold text-content-primary">
          {scenario.title}
        </h1>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-w-0">{board}</div>
        <aside className="hidden w-80 shrink-0 border-l border-border bg-surface-1 lg:block">
          <ScenarioInfoPanel scenario={scenario} hint={hint} />
        </aside>
      </div>

      {controlBar}
    </div>
  );
}

function noop(): void {}
