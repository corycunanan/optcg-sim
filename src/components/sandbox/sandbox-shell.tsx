"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  Board,
  type BoardState,
  type BoardDispatch,
} from "@/components/game/board";
import {
  MinViewportGate,
  PortalRoot,
  ScaledBoard,
} from "@/components/game/scaled-board";
import { ScenarioInfoPanel } from "./scenario-info-panel";
import type { Scenario } from "@/lib/sandbox/scenarios";
import type { ScenarioInputHint } from "./scenario-input-gate";

export interface SandboxShellProps {
  scenario: Scenario;
  hint: ScenarioInputHint | null;
  state: BoardState;
  dispatch: BoardDispatch;
  controlBar: ReactNode;
}

export function SandboxShell({
  scenario,
  hint,
  state,
  dispatch,
  controlBar,
}: SandboxShellProps) {
  return (
    <MinViewportGate>
      <div className="flex h-full flex-col overflow-hidden bg-gb-board">
        <PortalRoot />

        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-5 py-2">
          <Link
            href="/sandbox"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-content-secondary hover:bg-surface-2 hover:text-content-primary"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            <span>Back to Sandbox</span>
          </Link>
          <span aria-hidden className="text-content-disabled">
            ·
          </span>
          <h1 className="truncate text-sm font-bold text-content-primary">
            {scenario.title}
          </h1>
        </header>

        <div className="flex flex-1 min-h-0">
          <div className="relative flex-1 min-w-0">
            <ScaledBoard designWidth={1920} designHeight={1080}>
              <Board state={state} dispatch={dispatch} />
            </ScaledBoard>
          </div>
          <aside className="hidden w-80 shrink-0 border-l border-border bg-surface-1 lg:block">
            <ScenarioInfoPanel scenario={scenario} hint={hint} />
          </aside>
        </div>

        {controlBar}
      </div>
    </MinViewportGate>
  );
}
