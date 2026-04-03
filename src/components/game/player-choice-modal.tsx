"use client";

import React from "react";
import type { GameAction } from "@shared/game-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { GameButton } from "./game-button";

interface PlayerChoiceModalProps {
  effectDescription: string;
  choices: { id: string; label: string }[];
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function PlayerChoiceModal({
  effectDescription,
  choices,
  isHidden,
  onHide,
  onAction,
}: PlayerChoiceModalProps) {
  return (
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[400px] p-0 gap-0"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-gb-border space-y-0">
          <DialogTitle className="text-sm font-bold text-gb-text-bright">
            {effectDescription}
          </DialogTitle>
          <GameButton variant="ghost" size="sm" onClick={onHide}>
            Hide
          </GameButton>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-4 py-4">
          {choices.map((choice) => (
            <GameButton
              key={choice.id}
              variant="secondary"
              onClick={() =>
                onAction({ type: "PLAYER_CHOICE", choiceId: choice.id })
              }
              className="w-full justify-start px-4 py-3 h-auto text-sm"
            >
              {choice.label}
            </GameButton>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
