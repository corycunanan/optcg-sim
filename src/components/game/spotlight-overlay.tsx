"use client";

import { useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Eye, LayoutPanelTop, X } from "lucide-react";
import type { CardDb } from "@shared/game-types";
import { useZonePosition } from "@/contexts/zone-position-context";
import {
  spotlightCardZoneKey,
  type SpotlightCard,
  type SpotlightPresentation,
} from "@/lib/game/spotlight";
import { Card } from "./card";
import { GameButton } from "./game-button";

interface SpotlightOverlayProps {
  presentation: SpotlightPresentation | null;
  cardDb: CardDb;
  myIndex: 0 | 1 | null;
  isWaiting: boolean;
  view: "spotlight" | "board";
  onDismiss: () => void;
  onToggleView: () => void;
}

function presentationCopy(
  presentation: SpotlightPresentation,
  myIndex: 0 | 1 | null
) {
  const actor = presentation.playerIndex === myIndex ? "You" : "Opponent";
  switch (presentation.kind) {
    case "EVENT":
      return {
        eyebrow: "Event activated",
        title:
          presentation.source === "counter"
            ? `${actor} used a Counter Event`
            : presentation.source === "trash"
              ? `${actor} resolved an Event`
              : `${actor} played an Event`,
      };
    case "TRIGGER":
      return {
        eyebrow: "Trigger revealed",
        title: `${actor} activated a Trigger`,
      };
    case "REVEAL":
      return {
        eyebrow:
          presentation.source === "search" ? "Search result" : "Cards revealed",
        title: `${actor} revealed ${presentation.cards.length === 1 ? "a card" : `${presentation.cards.length} cards`}`,
      };
  }
}

function SpotlightCardView({
  presentation,
  card,
  index,
  cardDb,
  reducedMotion,
}: {
  presentation: SpotlightPresentation;
  card: SpotlightCard;
  index: number;
  cardDb: CardDb;
  reducedMotion: boolean;
}) {
  const zonePos = useZonePosition();
  const zoneKey = spotlightCardZoneKey(presentation.id, card);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) zonePos.register(zoneKey, node);
      else zonePos.unregister(zoneKey);
    },
    [zoneKey, zonePos]
  );

  return (
    <motion.div
      ref={ref}
      initial={reducedMotion ? false : { y: 24, opacity: 0, scale: 0.94 }}
      animate={{ y: 0, opacity: 1, scale: 1, rotateY: 0 }}
      exit={
        reducedMotion
          ? { opacity: 0 }
          : { opacity: 0, rotateY: 90, scale: 0.94 }
      }
      transition={{
        duration: reducedMotion ? 0 : 0.24,
        delay: reducedMotion ? 0 : index * 0.06,
      }}
    >
      <Card
        variant="modal"
        size={presentation.cards.length === 1 ? "preview" : "modal"}
        data={{ cardId: card.cardId, cardDb }}
        interaction={{ tooltipDisabled: true }}
      />
    </motion.div>
  );
}

export function SpotlightOverlay({
  presentation,
  cardDb,
  myIndex,
  isWaiting,
  view,
  onDismiss,
  onToggleView,
}: SpotlightOverlayProps) {
  const reducedMotion = useReducedMotion();
  const copy = presentation ? presentationCopy(presentation, myIndex) : null;

  return (
    <AnimatePresence>
      {presentation && view === "spotlight" && copy && (
        <motion.section
          key={presentation.id}
          data-testid="card-spotlight"
          role="dialog"
          aria-modal="true"
          aria-label={`${copy.eyebrow}: ${copy.title}`}
          className="absolute inset-0 z-50 flex items-center justify-center"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <button
            type="button"
            aria-label="Dismiss card spotlight"
            className="bg-gb-navbar/90 focus-visible:ring-gb-accent-blue absolute inset-0 cursor-default focus-visible:ring-4 focus-visible:outline-none focus-visible:ring-inset"
            onClick={onDismiss}
          />

          <div className="border-gb-accent-amber/40 bg-gb-surface relative flex max-w-4xl flex-col items-center gap-6 rounded-lg border px-10 py-8 shadow-2xl">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-gb-accent-amber text-base font-bold tracking-widest uppercase">
                {copy.eyebrow}
              </span>
              <h2 className="font-display text-gb-text-bright text-3xl uppercase">
                {copy.title}
              </h2>
            </div>

            <div className="flex max-w-3xl flex-wrap items-center justify-center gap-4">
              {presentation.cards.map((card, index) => (
                <SpotlightCardView
                  key={card.instanceId ?? `${card.cardId}-${index}`}
                  presentation={presentation}
                  card={card}
                  index={index}
                  cardDb={cardDb}
                  reducedMotion={reducedMotion ?? false}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              {isWaiting && (
                <GameButton
                  variant="secondary"
                  size="lg"
                  className="focus-visible:ring-4"
                  aria-keyshortcuts="B"
                  onClick={onToggleView}
                >
                  <LayoutPanelTop aria-hidden="true" className="size-5" />
                  View board
                  <kbd className="border-gb-border-strong rounded border px-2 py-1 text-base">
                    B
                  </kbd>
                </GameButton>
              )}
              <GameButton
                variant="amber"
                size="lg"
                className="focus-visible:ring-4"
                onClick={onDismiss}
              >
                <X aria-hidden="true" className="size-5" />
                Dismiss
              </GameButton>
            </div>

            {isWaiting && (
              <p className="text-gb-text-dim text-lg">
                Waiting for your opponent to finish choosing.
              </p>
            )}
          </div>
        </motion.section>
      )}

      {presentation && view === "board" && (
        <motion.div
          key={`${presentation.id}-board-toggle`}
          data-testid="card-spotlight-board-toggle"
          className="border-gb-accent-amber/40 bg-gb-surface absolute top-16 right-6 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg"
          initial={reducedMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <Eye aria-hidden="true" className="text-gb-accent-amber size-5" />
          <span className="text-gb-text text-base">Reveal paused</span>
          <GameButton
            variant="amber"
            size="lg"
            className="focus-visible:ring-4"
            aria-keyshortcuts="B"
            onClick={onToggleView}
          >
            Show spotlight
            <kbd className="border-gb-accent-amber/40 rounded border px-2 py-1 text-base">
              B
            </kbd>
          </GameButton>
          <GameButton
            variant="ghost"
            size="lg"
            aria-label="Dismiss card spotlight"
            className="focus-visible:ring-4"
            onClick={onDismiss}
          >
            <X aria-hidden="true" className="size-5" />
          </GameButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
