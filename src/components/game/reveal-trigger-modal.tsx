"use client";

import React from "react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from "@/components/ui";
import { CardTooltip } from "./use-card-tooltip";

const CARD_W = 80;
const CARD_H = 112;

interface RevealTriggerModalProps {
  cards: CardInstance[];
  effectDescription: string;
  cardDb: CardDb;
  isHidden: boolean;
  onHide: () => void;
  onAction: (action: GameAction) => void;
}

export function RevealTriggerModal({
  cards,
  effectDescription,
  cardDb,
  isHidden,
  onHide,
  onAction,
}: RevealTriggerModalProps) {
  return (
    <Dialog open={!isHidden} onOpenChange={(open) => { if (!open) onHide(); }}>
      <DialogContent
        showCloseButton={false}
        className="bg-gb-surface border-gb-border-strong text-gb-text sm:max-w-[400px] p-0 gap-0"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-gb-border space-y-0">
          <DialogTitle className="text-xs font-semibold text-gb-text-subtle tracking-wider uppercase">
            Trigger
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

        <div className="flex items-start gap-4 px-4 py-4">
          {cards[0] && <TriggerCard card={cards[0]} cardDb={cardDb} />}
          <p className="flex-1 text-sm text-gb-text leading-snug pt-1">
            {effectDescription}
          </p>
        </div>

        <DialogFooter className="flex-row gap-2 px-4 py-4 pt-0">
          <Button
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: true })}
            className="flex-1 bg-gb-accent-navy text-white border-gb-accent-navy hover:opacity-90"
          >
            Reveal &amp; Activate
          </Button>
          <Button
            variant="secondary"
            onClick={() => onAction({ type: "REVEAL_TRIGGER", reveal: false })}
            className="flex-1 bg-gb-surface-raised text-gb-text border-gb-border-strong hover:border-gb-text-muted hover:text-gb-text-bright"
          >
            Add to Hand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TriggerCard({ card, cardDb }: { card: CardInstance; cardDb: CardDb }) {
  const data = cardDb[card.cardId] ?? null;

  return (
    <CardTooltip data={data} cardId={card.cardId} card={card}>
      <div
        className="rounded-md overflow-hidden border border-gb-border-strong shrink-0"
        style={{ width: CARD_W, height: CARD_H }}
      >
        {data?.imageUrl ? (
          <img src={data.imageUrl} alt={data.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full bg-gb-surface-raised flex items-center justify-center p-2">
            <span className="text-xs text-gb-text-dim text-center leading-tight">{data?.name ?? "?"}</span>
          </div>
        )}
      </div>
    </CardTooltip>
  );
}
