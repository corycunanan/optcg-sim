"use client";

import React from "react";
import type {
  CardDb,
  CardInstance,
  GameAction,
  PromptSourceCard,
} from "@shared/game-types";
import { Card } from "./card";
import { EffectPromptDialog } from "./effect-prompt-dialog";

interface OptionalEffectModalProps {
  effectDescription: string;
  card?: CardInstance;
  sourceCard?: PromptSourceCard;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

/** "You may …" effects: Confirm activates the effect, Skip declines it. */
export function OptionalEffectModal({
  effectDescription,
  card,
  sourceCard,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: OptionalEffectModalProps) {
  return (
    <EffectPromptDialog
      effectDescription={effectDescription}
      sourceCard={sourceCard ?? card}
      cardDb={cardDb}
      isHidden={isHidden}
      onHide={onHide}
      onConfirm={() =>
        onAction({ type: "PLAYER_CHOICE", choiceId: "activate" })
      }
      onSkip={() => onAction({ type: "PASS" })}
      className="sm:max-w-[400px]"
    >
      {card && (
        <div className="flex justify-center">
          <Card
            variant="modal"
            size="field"
            data={{ card, cardId: card.cardId, cardDb }}
          />
        </div>
      )}
    </EffectPromptDialog>
  );
}
