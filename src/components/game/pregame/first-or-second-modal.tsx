"use client";

import type { GameAction } from "@shared/game-types";
import { GameButton } from "../game-button";

interface FirstOrSecondChoiceProps {
  onAction: (action: GameAction) => void;
}

/**
 * OPT-366: rendered inside PriorityRollDisplay when the priority decider is
 * the local player. Two buttons map to PLAYER_CHOICE { id: "FIRST" | "SECOND" }.
 */
export function FirstOrSecondChoice({ onAction }: FirstOrSecondChoiceProps) {
  return (
    <div className="bg-gb-surface border-gb-border-strong flex flex-col items-center gap-3 rounded-lg border-2 px-6 py-5 shadow-xl">
      <h3 className="text-gb-text-bright text-base font-semibold">
        Choose first or second
      </h3>
      <div className="flex gap-3">
        <GameButton
          variant="primary"
          size="lg"
          onClick={() => onAction({ type: "PLAYER_CHOICE", choiceId: "FIRST" })}
          className="min-w-[140px]"
        >
          Go first
        </GameButton>
        <GameButton
          variant="secondary"
          size="lg"
          onClick={() => onAction({ type: "PLAYER_CHOICE", choiceId: "SECOND" })}
          className="min-w-[140px]"
        >
          Go second
        </GameButton>
      </div>
    </div>
  );
}
