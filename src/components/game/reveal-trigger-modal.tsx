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

interface RevealTriggerModalProps {
  cards: CardInstance[];
  effectDescription: string;
  sourceCard?: PromptSourceCard;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

/**
 * A Life card with [Trigger] was revealed: Confirm activates the trigger,
 * Skip adds the card to hand without activating it.
 */
export function RevealTriggerModal({
  cards,
  effectDescription,
  sourceCard,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: RevealTriggerModalProps) {
  const firstCard = cards[0];
  return (
    <EffectPromptDialog
      effectDescription={effectDescription}
      sourceCard={sourceCard ?? firstCard}
      cardDb={cardDb}
      isHidden={isHidden}
      onHide={onHide}
      onConfirm={() => onAction({ type: "REVEAL_TRIGGER", reveal: true })}
      onSkip={() => onAction({ type: "REVEAL_TRIGGER", reveal: false })}
      note={
        <p className="text-gb-text-dim text-sm">
          Skip adds the card to your hand without activating its trigger.
        </p>
      }
      className="sm:max-w-[400px]"
    >
      {firstCard && (
        <div className="flex justify-center">
          <Card
            variant="modal"
            size="field"
            data={{ card: firstCard, cardId: firstCard.cardId, cardDb }}
          />
        </div>
      )}
    </EffectPromptDialog>
  );
}
