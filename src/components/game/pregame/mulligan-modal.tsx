"use client";

import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameButton } from "../game-button";

interface MulliganModalProps {
  /** True when this client owns the active mulligan prompt. False = waiting view. */
  isResponder: boolean;
  myHand: CardInstance[];
  cardDb: CardDb;
  onAction: (action: GameAction) => void;
}

/**
 * OPT-366 §5-2-1-6-1: opening-hand mulligan. Shows the responder's 5-card
 * opening hand with Keep / Redraw buttons. Non-responders see a waiting state.
 *
 * Mulligan rule: redraw returns the entire hand to the deck, reshuffles, and
 * draws 5 fresh cards. The opponent's mulligan decision is hidden until both
 * players resolve.
 */
export function MulliganModal({
  isResponder,
  myHand,
  cardDb,
  onAction,
}: MulliganModalProps) {
  const rovingFocus = useRovingFocus<HTMLDivElement>(
    myHand.map((card) => card.instanceId)
  );

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="bg-gb-board/90 inset-0 z-[200] flex h-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-6 border-0 p-0 backdrop-blur-sm sm:max-w-none"
      >
        <div className="flex flex-col items-center gap-2">
          <DialogTitle className="text-gb-text-bright">
            Mulligan
          </DialogTitle>
          <DialogDescription className="text-gb-text-dim max-w-md text-center text-sm">
            {isResponder
              ? "Keep this opening hand, or shuffle it back into your deck and draw 5 new cards."
              : "Waiting for the other player to decide on their opening hand…"}
          </DialogDescription>
        </div>

        {isResponder && (
          <>
            <div className="flex gap-3" role="list" aria-label="Opening hand">
              {myHand.map((card) => {
                const data = cardDb[card.cardId];
                return (
                  <div
                    key={card.instanceId}
                    ref={(node) =>
                      rovingFocus.setItemRef(card.instanceId, node)
                    }
                    role="listitem"
                    tabIndex={rovingFocus.getTabIndex(card.instanceId)}
                    aria-label={data?.name ?? card.cardId}
                    onFocus={() => rovingFocus.onFocus(card.instanceId)}
                    onKeyDown={(event) =>
                      rovingFocus.onKeyDown(event, card.instanceId)
                    }
                    className={cn(
                      "border-gb-border-strong w-card-thumb aspect-card focus-visible:ring-gb-signal-eligible overflow-hidden rounded-md border-2 shadow-md focus-visible:ring-2 focus-visible:outline-none"
                    )}
                  >
                    {data?.imageUrl ? (
                      <img
                        src={data.imageUrl}
                        alt={data.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="bg-gb-surface-raised flex h-full w-full items-center justify-center p-2">
                        <span className="text-gb-text-dim text-center text-sm">
                          {data?.name ?? card.cardId}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <GameButton
                variant="primary"
                size="lg"
                onClick={() =>
                  onAction({ type: "PLAYER_CHOICE", choiceId: "KEEP" })
                }
                className="min-w-[160px]"
              >
                Keep hand
              </GameButton>
              <GameButton
                variant="secondary"
                size="lg"
                onClick={() =>
                  onAction({ type: "PLAYER_CHOICE", choiceId: "REDRAW" })
                }
                className="min-w-[160px]"
              >
                Redraw
              </GameButton>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
