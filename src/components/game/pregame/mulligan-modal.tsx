"use client";

import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { motion } from "motion/react";
import type { MulliganRedrawPlayback } from "@/hooks/use-mulligan-redraw";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { mulliganPilePoint, mulliganRowWidth } from "@/lib/game/mulligan-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Card } from "../card";
import { CARD_SIZES } from "../card/sizes";
import { GameButton } from "../game-button";
import { MulliganDeckPile } from "./mulligan-deck-pile";
import {
  MULLIGAN_STAGE_GEOMETRY,
  MulliganRedrawStage,
} from "./mulligan-redraw-stage";

interface MulliganModalProps {
  /** True when this client owns the active mulligan prompt. False = waiting view. */
  isResponder: boolean;
  myHand: CardInstance[];
  cardDb: CardDb;
  /** The viewer's card sleeve, for the deck pile and face-down cards. */
  sleeveUrl?: string | null;
  onAction: (action: GameAction) => void;
  /** Called just before Redraw is sent, to start the redraw animation. */
  onRedraw?: () => void;
  /** A redraw animation in progress (OPT-1060). While set, the modal plays
   *  it over the hand row whatever the server's current phase. */
  playback?: MulliganRedrawPlayback | null;
  onPlaybackDone?: () => void;
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
  sleeveUrl,
  onAction,
  onRedraw,
  playback = null,
  onPlaybackDone,
}: MulliganModalProps) {
  const showHand = isResponder || playback !== null;
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
            {playback
              ? "Shuffling your hand back into your deck and drawing 5 new cards…"
              : isResponder
                ? "Keep this opening hand, or shuffle it back into your deck and draw 5 new cards."
                : "Waiting for the other player to decide on their opening hand…"}
          </DialogDescription>
        </div>

        {showHand && (
          <>
            {/* The hand row is the layout box; the deck pile hangs off its
                right edge so the hand stays centered. The redraw stage draws
                over the same box (OPT-1060). */}
            <div
              className="relative"
              style={{
                width: mulliganRowWidth(5, MULLIGAN_STAGE_GEOMETRY),
                height: CARD_SIZES.modal.height,
              }}
            >
            {playback ? (
              <MulliganRedrawStage
                oldHand={playback.oldHand}
                newHand={playback.newHand}
                cardDb={cardDb}
                sleeveUrl={sleeveUrl}
                onDone={() => onPlaybackDone?.()}
              />
            ) : (
            <>
            <motion.div
              className="absolute top-0 left-0"
              style={{ x: mulliganPilePoint(MULLIGAN_STAGE_GEOMETRY).x }}
            >
              <MulliganDeckPile sleeveUrl={sleeveUrl} />
            </motion.div>
            <TooltipProvider delayDuration={0} disableHoverableContent>
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
                    className="rounded-card focus-visible:ring-gb-signal-eligible focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {/* Same primitive as the hand and the effect modals, so
                        the opening hand gets the shared hover and the card
                        inspection tooltip. */}
                    <Card
                      variant="modal"
                      data={{ card, cardId: card.cardId, cardDb }}
                    />
                  </div>
                );
              })}
            </div>
            </TooltipProvider>
            </>
            )}
            </div>

            {/* Hidden, not removed, during the redraw so the layout holds. */}
            <div className={cn("flex gap-3", playback && "invisible")}>
              <GameButton
                variant="primary"
                size="lg"
                disabled={playback !== null}
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
                disabled={playback !== null}
                onClick={() => {
                  onRedraw?.();
                  onAction({ type: "PLAYER_CHOICE", choiceId: "REDRAW" });
                }}
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
