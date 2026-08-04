"use client";

import { useCallback } from "react";
import type {
  CardDb,
  GameAction,
  PlayerState,
  PromptOptions,
} from "@shared/game-types";
import { ArrangeTopCardsModal } from "../arrange-top-cards-modal";
import { SelectTargetModal } from "../select-target-modal";
import { PlayerChoiceModal } from "../player-choice-modal";
import { OptionalEffectModal } from "../optional-effect-modal";
import { RevealTriggerModal } from "../reveal-trigger-modal";
import { GameDeckPreviewModal } from "../deck-preview-modal";
import { LifePreviewModal } from "../life-preview-modal";
import { TrashPreviewModal } from "../trash-preview-modal";
import { RedistributeDonOverlay, type RedistributeTransfer } from "../redistribute-don-overlay";
import { selectTargetPromptKey } from "@/lib/game/target-selection";
import type { ZonePreview } from "./use-board-modal-routing";

interface BoardModalsProps {
  activePrompt: PromptOptions | null;
  activePromptId: string | null;
  isPromptHidden: boolean;
  onHide: () => void;
  cardDb: CardDb;
  onAction: (action: GameAction) => void;
  zonePreview: ZonePreview | null;
  onCloseZonePreview: () => void;
  me: PlayerState | null;
  opp: PlayerState | null;
  redistributeTransfers: RedistributeTransfer[];
  onRedistributeUndo: () => void;
  selectTargetInPlace?: boolean;
}

export function BoardModals({
  activePrompt,
  activePromptId,
  isPromptHidden,
  onHide,
  cardDb,
  onAction,
  zonePreview,
  onCloseZonePreview,
  me,
  opp,
  redistributeTransfers,
  onRedistributeUndo,
  selectTargetInPlace = false,
}: BoardModalsProps) {
  const handleZonePreviewOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onCloseZonePreview();
    },
    [onCloseZonePreview],
  );

  return (
    <>
      {/* ── Interruption Modals ─────────────────────────────────────── */}
      {activePrompt?.promptType === "ARRANGE_TOP_CARDS" &&
        activePrompt.cards.length > 0 && (
          <ArrangeTopCardsModal
            key={activePrompt.cards.map((c) => c.instanceId).join(",")}
            cards={activePrompt.cards}
            effectDescription={activePrompt.effectDescription}
            canSendToBottom={activePrompt.canSendToBottom}
            restDestination={activePrompt.restDestination}
            validTargets={activePrompt.validTargets}
            maxKeep={activePrompt.maxKeep}
            cardDb={cardDb}
            isHidden={isPromptHidden}
            onHide={onHide}
            onAction={onAction}
          />
        )}

      {activePrompt?.promptType === "SELECT_TARGET" &&
        !selectTargetInPlace &&
        activePrompt.cards.length > 0 && (
          <SelectTargetModal
            key={selectTargetPromptKey(activePrompt)}
            cards={activePrompt.cards}
            validTargets={activePrompt.validTargets}
            effectDescription={activePrompt.effectDescription}
            countMin={activePrompt.countMin}
            countMax={activePrompt.countMax}
            ctaLabel={activePrompt.ctaLabel}
            aggregateConstraint={activePrompt.aggregateConstraint}
            uniquenessConstraint={activePrompt.uniquenessConstraint}
            namedDistribution={activePrompt.namedDistribution}
            dualTargets={activePrompt.dualTargets}
            cardDb={cardDb}
            isHidden={isPromptHidden}
            onHide={onHide}
            onAction={onAction}
          />
        )}

      {/* OPT-366: pregame PLAYER_CHOICE prompts are owned by <PregameOverlay/>
          in live-game-shell. Skip the generic modal to avoid double-rendering. */}
      {activePrompt?.promptType === "PLAYER_CHOICE" &&
        activePrompt.choices.length > 0 &&
        activePrompt.source !== "PREGAME" && (
          <PlayerChoiceModal
            key={activePromptId ?? "player-choice"}
            effectDescription={activePrompt.effectDescription}
            choices={activePrompt.choices}
            donReturn={activePrompt.donReturn}
            confirmOrSkip={activePrompt.confirmOrSkip}
            isHidden={isPromptHidden}
            onHide={onHide}
            onAction={onAction}
          />
        )}

      {activePrompt?.promptType === "REDISTRIBUTE_DON" && (
        <RedistributeDonOverlay
          effectDescription={activePrompt.effectDescription}
          maxTransfers={activePrompt.maxTransfers}
          transfers={redistributeTransfers}
          onUndo={onRedistributeUndo}
          onAction={onAction}
        />
      )}

      {activePrompt?.promptType === "OPTIONAL_EFFECT" && (
        <OptionalEffectModal
          effectDescription={activePrompt.effectDescription}
          card={activePrompt.cards?.[0]}
          cardDb={cardDb}
          isHidden={isPromptHidden}
          onHide={onHide}
          onAction={onAction}
        />
      )}

      {activePrompt?.promptType === "REVEAL_TRIGGER" &&
        activePrompt.cards.length > 0 && (
          <RevealTriggerModal
            cards={activePrompt.cards}
            effectDescription={activePrompt.effectDescription}
            cardDb={cardDb}
            isHidden={isPromptHidden}
            onHide={onHide}
            onAction={onAction}
          />
        )}

      {/* ── Zone preview modals ─────────────────────────────────────── */}
      {zonePreview?.type === "deck" && (
        <GameDeckPreviewModal
          deckList={zonePreview.owner === "me" ? (me?.deckList ?? []) : (opp?.deckList ?? [])}
          remainingCount={zonePreview.owner === "me" ? (me?.deck.length ?? 0) : (opp?.deck.length ?? 0)}
          cardDb={cardDb}
          title={zonePreview.owner === "me" ? "Your Decklist" : "Opponent\u2019s Decklist"}
          open
          onOpenChange={handleZonePreviewOpenChange}
        />
      )}
      {zonePreview?.type === "trash" && (
        <TrashPreviewModal
          trash={zonePreview.owner === "me" ? (me?.trash ?? []) : (opp?.trash ?? [])}
          cardDb={cardDb}
          title={zonePreview.owner === "me" ? "Your Trash" : "Opponent\u2019s Trash"}
          open
          onOpenChange={handleZonePreviewOpenChange}
        />
      )}
      {zonePreview?.type === "life" && (
        <LifePreviewModal
          life={zonePreview.owner === "me" ? (me?.life ?? []) : (opp?.life ?? [])}
          cardDb={cardDb}
          title={zonePreview.owner === "me" ? "Your Life" : "Opponent\u2019s Life"}
          open
          onOpenChange={handleZonePreviewOpenChange}
        />
      )}
    </>
  );
}
