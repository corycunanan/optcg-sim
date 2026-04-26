"use client";

// Animation Sandbox scenario player shell (OPT-291). The assembly point for
// the four pieces built earlier in the project: the runner controller
// (OPT-289), the input gate (OPT-290), the session provider (OPT-286), and
// the curated card data (OPT-287). Wires them into the production
// `BoardLayout` (rendered as-is) and adds the surrounding chrome (back
// link, info panel, control bar).
//
// Layout: a flex column inside the existing `<main>` slot from the root
// layout. Top strip → board + info panel → bottom control bar. The
// BoardLayout's own geometry is window-viewport-based so it expects roughly
// the full area below the navbar; the side panel sits flush to its right
// edge.

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { BoardLayout } from "@/components/game/board-layout";
import { SANDBOX_CARD_DB } from "@/lib/sandbox/sandbox-card-data";
import { scenarios } from "@/lib/sandbox/scenarios";
import { useScenarioRunner } from "./use-scenario-runner";
import { useScenarioInputGate } from "./scenario-input-gate";
import { useSandboxGameSession } from "./sandbox-session-provider";
import { ScenarioInfoPanel } from "./scenario-info-panel";
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
    <SandboxMuteProvider>
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
          <div className="relative flex-1 min-w-0">
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
          </div>
          <aside className="hidden w-80 shrink-0 border-l border-border bg-surface-1 lg:block">
            <ScenarioInfoPanel scenario={scenario} hint={gate.hint} />
          </aside>
        </div>

        <PlaybackControlBar
          playbackState={runner.playbackState}
          currentStepIndex={runner.currentStepIndex}
          totalSteps={runner.totalSteps}
          onPlay={runner.play}
          onPause={runner.pause}
          onReset={runner.reset}
          onStep={runner.stepForward}
        />
      </div>
    </SandboxMuteProvider>
  );
}
