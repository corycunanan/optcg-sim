"use client";

import React from "react";
import type { GameAction } from "@shared/game-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from "@/components/ui";

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
          <Button
            variant="ghost"
            size="sm"
            onClick={onHide}
            className="text-xs text-gb-text-dim hover:text-gb-text hover:bg-gb-surface-raised h-auto px-2 py-1"
          >
            Hide
          </Button>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-4 py-4">
          {choices.map((choice) => (
            <Button
              key={choice.id}
              variant="secondary"
              onClick={() =>
                onAction({ type: "PLAYER_CHOICE", choiceId: choice.id })
              }
              className="w-full justify-start px-4 py-3 h-auto text-sm font-medium bg-gb-surface-raised text-gb-text border-gb-border-strong hover:border-gb-text-muted hover:text-gb-text-bright"
            >
              {choice.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
