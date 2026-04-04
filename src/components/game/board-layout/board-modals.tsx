"use client";

import type {
  CardDb,
  CardInstance,
  GameAction,
  PlayerState,
  PromptOptions,
  PromptType,
} from "@shared/game-types";
import { ArrangeTopCardsModal } from "../arrange-top-cards-modal";
import { SelectTargetModal } from "../select-target-modal";
import { PlayerChoiceModal } from "../player-choice-modal";
import { OptionalEffectModal } from "../optional-effect-modal";
import { RevealTriggerModal } from "../reveal-trigger-modal";
import { GameDeckPreviewModal } from "../deck-preview-modal";
import { TrashPreviewModal } from "../trash-preview-modal";

interface BoardModalsProps {
  activePrompt: {
    promptType: PromptType;
    options: PromptOptions;
  } | null;
  isPromptHidden: boolean;
  onHide: () => void;
  cardDb: CardDb;
  onAction: (action: GameAction) => void;
  zonePreview:
    | { type: "deck"; owner: "me" | "opp" }
    | { type: "trash"; owner: "me" | "opp" }
    | null;
  onCloseZonePreview: () => void;
  me: PlayerState | null;
  opp: PlayerState | null;
}

export function BoardModals({
  activePrompt,
  isPromptHidden,
  onHide,
  cardDb,
  onAction,
  zonePreview,
  onCloseZonePreview,
  me,
  opp,
}: BoardModalsProps) {
  return (
    <>
      {/* ── Interruption Modals ─────────────────────────────────────── */}
      {activePrompt?.promptType === "ARRANGE_TOP_CARDS" &&
        activePrompt.options.cards &&
        activePrompt.options.cards.length > 0 && (
          <ArrangeTopCardsModal
            cards={activePrompt.options.cards}
            effectDescription={activePrompt.options.effectDescription ?? "Look at the top cards of your deck"}
            canSendToBottom={activePrompt.options.canSendToBottom ?? true}
            validTargets={activePrompt.options.validTargets}
            cardDb={cardDb}
            isHidden={isPromptHidden}
            onHide={onHide}
            onAction={onAction}
          />
        )}

      {activePrompt?.promptType === "SELECT_TARGET" &&
        activePrompt.options.cards &&
        activePrompt.options.cards.length > 0 && (
          <SelectTargetModal
            cards={activePrompt.options.cards}
            validTargets={activePrompt.options.validTargets ?? activePrompt.options.cards.map((c: CardInstance) => c.instanceId)}
            effectDescription={activePrompt.options.effectDescription ?? "Select a target"}
            countMin={activePrompt.options.countMin ?? 1}
            countMax={activePrompt.options.countMax ?? 1}
            ctaLabel={activePrompt.options.ctaLabel ?? "Confirm Selection"}
            cardDb={cardDb}
            isHidden={isPromptHidden}
            onHide={onHide}
            onAction={onAction}
          />
        )}

      {activePrompt?.promptType === "PLAYER_CHOICE" &&
        activePrompt.options.choices &&
        activePrompt.options.choices.length > 0 && (
          <PlayerChoiceModal
            effectDescription={activePrompt.options.effectDescription ?? "Choose an effect"}
            choices={activePrompt.options.choices}
            isHidden={isPromptHidden}
            onHide={onHide}
            onAction={onAction}
          />
        )}

      {activePrompt?.promptType === "OPTIONAL_EFFECT" && (
        <OptionalEffectModal
          effectDescription={activePrompt.options.effectDescription ?? "You may activate this effect"}
          card={activePrompt.options.cards?.[0]}
          cardDb={cardDb}
          isHidden={isPromptHidden}
          onHide={onHide}
          onAction={onAction}
        />
      )}

      {activePrompt?.promptType === "REVEAL_TRIGGER" &&
        activePrompt.options.cards &&
        activePrompt.options.cards.length > 0 && (
          <RevealTriggerModal
            cards={activePrompt.options.cards}
            effectDescription={activePrompt.options.effectDescription ?? "You may reveal this Trigger card to activate its effect"}
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
          cardDb={cardDb}
          title={zonePreview.owner === "me" ? "Your Deck" : "Opponent\u2019s Deck"}
          open
          onOpenChange={(open) => { if (!open) onCloseZonePreview(); }}
        />
      )}
      {zonePreview?.type === "trash" && (
        <TrashPreviewModal
          trash={zonePreview.owner === "me" ? (me?.trash ?? []) : (opp?.trash ?? [])}
          cardDb={cardDb}
          title={zonePreview.owner === "me" ? "Your Trash" : "Opponent\u2019s Trash"}
          open
          onOpenChange={(open) => { if (!open) onCloseZonePreview(); }}
        />
      )}
    </>
  );
}
