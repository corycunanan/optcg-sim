"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { useDndMonitor, useDraggable, useDroppable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { CardData, CardDb, CardInstance, GameAction, TurnState } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { canPlayCardInZone } from "@/lib/game/client-legality";
import { useZonePosition } from "@/contexts/zone-position-context";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import {
  cardEntry,
  cardReject,
  cardRejectReduced,
  cardWinnerPulse,
} from "@/lib/motion";
import { Card } from "../card";
import { SQUARE, type AttackerDrag, type RedistributeDonDrag } from "./constants";
import { CardActionMenuContent } from "../card-action-menu";
import { DropOverlay } from "./drop-zones";
import { DonCard } from "./don-zone";
import { useInteractionMode } from "./interaction-mode";
import { useCardRejection } from "./action-feedback";
import {
  canOpenActivateMainMenu,
  getActivateMainState,
} from "@/lib/game/activate-main";
import type { TargetCardSelectionState } from "@/lib/game/target-selection";
import { useEffectAvailability } from "@/contexts/effect-availability-context";
import { resolveCardHighlightRingColor } from "../card/overlays/card-highlight-ring";
import type { PowerModPulse } from "@/hooks/use-power-modified-pulse";

/** Initial transform for the summon-entry pop (OPT-274). Field card mounts
 *  with these values and animates to `{ scale: 1, opacity: 1 }` on its first
 *  render when `entering` is set. Reduced-motion consumers pass `entering={false}`
 *  so the card just appears. */
const ENTRY_INITIAL = { scale: 0.9, opacity: 0 } as const;
const ENTRY_ANIMATE = { scale: 1, opacity: 1 } as const;

// Pilot migration onto `<Card>` primitive (OPT-267). The primitive owns the
// 3D face stack, rest/active rotation, hover/tap springs, DON corner badge,
// and tooltip. Consumer wrappers keep: dnd-kit refs, zone registration,
// right-click menu, selection/blocker rings, drop-zone affordances, and the
// DON-redistribute drag-source bar.

export const PlayerFieldCard = React.memo(function PlayerFieldCard({
  card,
  cardDb,
  activeDragType,
  draggedCardType,
  playSignalActive = true,
  canAttack,
  blockerSelectable,
  selected,
  isAttacker,
  isDefender,
  winnerPulse,
  powerMod,
  effectsNegatedPulseNonce,
  attackRedirectedPulseNonce,
  counterTarget,
  counterDragActive,
  eventDropTarget,
  counterPulse,
  canActivateMain,
  oncePerTurnUsed,
  targetSelection,
  onTargetToggle,
  onSelect,
  onAction,
  zoneKey,
  slotIndex,
  boardFull,
  style,
  animationDelay,
  redistributeSource,
  donArtUrl,
  pendingTransferDonIds,
  donCountAdjust,
  entering,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  draggedCardType?: CardData["type"];
  playSignalActive?: boolean;
  canAttack: boolean;
  blockerSelectable?: boolean;
  selected?: boolean;
  isAttacker?: boolean;
  /** True when this card is `battle.targetInstanceId` — the current defender.
   *  Moves with the battle: leader at declare-attack, then the blocker once
   *  block is declared. Drives the amber pulse ring (OPT-274). */
  isDefender?: boolean;
  /** One-shot COMBAT_VICTORY feedback. Wins ring precedence while active. */
  winnerPulse?: boolean;
  /** Floating POWER_MODIFIED delta + keyed surface flash. */
  powerMod?: PowerModPulse;
  /** EFFECTS_NEGATED desaturated-ring restart key. */
  effectsNegatedPulseNonce?: string;
  /** ATTACK_REDIRECTED amber-sweep restart nonce. */
  attackRedirectedPulseNonce?: number;
  /** Current battle defender while a Character counter is being dragged. */
  counterTarget?: boolean;
  /** A Character-counter drag is in progress. Board-full replacement is never
   *  legal mid-battle, so non-defender cards must not offer the replace drop —
   *  a missed defender drop would otherwise dispatch PLAY_CARD (SIG-6). */
  counterDragActive?: boolean;
  /** Part of the broad own-field play surface while an Event is dragged. */
  eventDropTarget?: boolean;
  counterPulse?: boolean;
  canActivateMain?: boolean;
  oncePerTurnUsed?: TurnState["oncePerTurnUsed"];
  targetSelection?: TargetCardSelectionState;
  onTargetToggle?: () => void;
  onSelect?: () => void;
  onAction?: (action: GameAction) => void;
  zoneKey?: string;
  slotIndex?: number;
  boardFull?: boolean;
  style: React.CSSProperties;
  animationDelay?: number;
  redistributeSource?: boolean;
  donArtUrl?: string | null;
  pendingTransferDonIds?: Set<string>;
  donCountAdjust?: number;
  /** If true, plays a one-shot summon-entry pop on mount (OPT-274). Parent
   *  (PlayerField) only sets this for instanceIds that weren't in the
   *  previous render, so the effect doesn't fire on page-level rehydrates. */
  entering?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const descriptionId = useId();
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion();
  const interactionMode = useInteractionMode();
  const inputSuppressed = interactionMode !== "full";
  const rejectionSequence = useCardRejection(card.instanceId);
  const { hasUsableEffect } = useEffectAvailability();
  const activation = getActivateMainState(card, cardDb, oncePerTurnUsed);
  const sourceStateAllowsActivation =
    !activation?.requiresActiveSelf || card.state === "ACTIVE";
  const menuTriggerEnabled =
    !!onAction &&
    canOpenActivateMainMenu({
      hasEffect: !!activation,
      hasSelectionAction: !!onSelect || !!targetSelection,
      inputSuppressed,
    });
  const effectAction = activation
    ? activation.usedThisTurn
      ? ("used" as const)
      : canActivateMain && !inputSuppressed && sourceStateAllowsActivation
        ? ("available" as const)
        : ("unavailable" as const)
    : undefined;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `attacker-${card.instanceId}`,
    data: { type: "attacker", card } satisfies AttackerDrag,
    disabled: !canAttack || inputSuppressed || !!targetSelection,
  });

  const acceptsDon = activeDragType === "active-don" || activeDragType === "redistribute-don";

  const firstDon = pendingTransferDonIds
    ? card.attachedDon.find((d) => !pendingTransferDonIds.has(d.instanceId))
    : card.attachedDon[0];
  const canRedistribute = !!redistributeSource && !!firstDon;
  const {
    attributes: donAttributes,
    listeners: donListeners,
    setNodeRef: setDonDragRef,
    isDragging: isDonDragging,
  } = useDraggable({
    id: `redistribute-don-${card.instanceId}`,
    data: firstDon
      ? ({
          type: "redistribute-don",
          don: firstDon,
          fromCardInstanceId: card.instanceId,
        } satisfies RedistributeDonDrag)
      : undefined,
    disabled: !canRedistribute,
  });
  const acceptsCounter = !!counterTarget && activeDragType === "hand-card";
  const acceptsEvent = !!eventDropTarget && activeDragType === "hand-card";
  const acceptsHandCard =
    !acceptsCounter &&
    !acceptsEvent &&
    !counterDragActive &&
    !!boardFull &&
    activeDragType === "hand-card" &&
    canPlayCardInZone(draggedCardType, "character");
  const dropActive = acceptsDon || acceptsCounter || acceptsEvent || acceptsHandCard;
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: acceptsCounter
      ? `counter-target-${card.instanceId}`
      : acceptsEvent
        ? `own-field-card-${card.instanceId}`
        : acceptsHandCard
          ? `char-slot-${slotIndex}`
          : `don-target-${card.instanceId}`,
    data: acceptsCounter
      ? { type: "counter-target", targetInstanceId: card.instanceId }
      : acceptsEvent
        ? { type: "own-field" }
        : acceptsHandCard
          ? { type: "character-slot", slotIndex }
          : { type: "don-target", targetInstanceId: card.instanceId },
    disabled: !dropActive,
  });

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
      if (zoneKey) {
        if (node) {
          zonePos.register(zoneKey, node);
          zonePos.registerCard(card.instanceId, zoneKey);
        } else {
          zonePos.unregister(zoneKey);
          // Intentionally NOT unregistering the card→zone mapping here.
          // `useCardTransitions` looks up the source zone for events like
          // CARD_KO / CARD_TRASHED *after* the card has already left the
          // field (the field-card unmounts when the server state drops
          // the character from its slot). Keeping the last known zone in
          // the registry lets the KO flight originate from the character's
          // actual slot instead of falling back to a hardcoded center tile.
          // New registrations overwrite via Map.set, so cross-zone moves
          // still land on the current zone.
        }
      }
    },
    [setDragRef, setDropRef, zoneKey, zonePos, card.instanceId],
  );

  // Keep card→zone mapping up to date if instanceId changes while mounted.
  // No cleanup: same rationale as `mergedRef` — we want the last known zone
  // to survive unmount so in-flight transitions can resolve it.
  useEffect(() => {
    if (zoneKey) zonePos.registerCard(card.instanceId, zoneKey);
  }, [card.instanceId, zoneKey, zonePos]);

  // Radix opens menus on pointer-down, before dnd-kit's 8px activation
  // threshold can distinguish a click from a drag. Close that provisional
  // menu as soon as this card's drag begins so combat owns the gesture.
  useDndMonitor({
    onDragStart(event) {
      if (event.active.id === `attacker-${card.instanceId}`) {
        setMenuOpen(false);
      }
    },
  });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (inputSuppressed || targetSelection) return;
      setMenuOpen(true);
    },
    [inputSuppressed, targetSelection],
  );

  const donCount = card.attachedDon.length + (donCountAdjust ?? 0);
  const baseState = card.state === "RESTED" ? "rest" : "active";
  // Battle states take precedence: attacker while attacking, selected blocker
  // gets `blocking`. Otherwise fall through to the game-state rotation.
  const cardState: "attacking" | "blocking" | "rest" | "active" = isAttacker
    ? "attacking"
    : selected
      ? "blocking"
      : baseState;
  // Ring consolidation (OPT-273): formerly consumer className `ring-2 ring-gb-accent-*`.
  // Now routed through the primitive's highlightRing overlay so ring semantics
  // live in one place and can compose with motion presets. Precedence (top
  // wins): combat winner > attack redirected > effects negated > counter flash
  // (all transient) > attacker (current aggressor) > defender
  // (OPT-274 — current battle target, same amber pulse as attacker) > selected
  // (user-chosen blocker or effect target) > eligible candidate > ambient
  // usable-effect availability.
  const selectionSelected = !!selected || !!targetSelection?.selected;
  const selectionEligible = !!blockerSelectable || !!targetSelection?.eligible;
  const selectionControl = !!blockerSelectable || !!targetSelection;
  const disabledReason = targetSelection?.disabledReason ?? null;
  const cardName = cardDb[card.cardId]?.name ?? card.cardId;
  const activeHighlightRing = winnerPulse
    ? ("winner" as const)
    : attackRedirectedPulseNonce !== undefined
      ? ("redirected" as const)
      : effectsNegatedPulseNonce !== undefined
        ? ("negated" as const)
        : counterPulse
          ? ("counter" as const)
          : isAttacker
            ? ("attacker" as const)
            : isDefender
              ? ("defender" as const)
              : selectionSelected
                ? ("selected" as const)
                : selectionEligible
                  ? ("eligible" as const)
                  : undefined;
  const highlightRingNonce =
    activeHighlightRing === "redirected"
      ? attackRedirectedPulseNonce
      : activeHighlightRing === "negated"
        ? effectsNegatedPulseNonce
        : undefined;
  const highlightRing = resolveCardHighlightRingColor(
    activeHighlightRing,
    hasUsableEffect(card.instanceId),
  );

  // Entry pop (OPT-274): only triggers on first render when the parent
  // flagged this card as newly-arrived. `isDragging` opacity still wins
  // (composes via `animate` overriding scale/opacity post-mount).
  const shouldEnter = !!entering && !reducedMotion;
  const winnerFeedbackActive = !!winnerPulse && !reducedMotion;
  const initialTarget = shouldEnter ? ENTRY_INITIAL : false;
  const rejectionAnimation = reducedMotion ? cardRejectReduced : cardReject;
  const animateTarget = rejectionSequence
    ? { scale: 1, ...rejectionAnimation }
    : {
        scale: 1,
        x: winnerFeedbackActive ? cardWinnerPulse.x : 0,
        opacity: isDragging ? 0.3 : targetSelection?.disabledReason ? 0.35 : 1,
      };
  const wrapperTransition = rejectionSequence
    ? rejectionAnimation.transition
    : winnerFeedbackActive
      ? cardWinnerPulse.transition
      : shouldEnter
        ? { scale: cardEntry, opacity: { duration: 0.2, ease: "easeOut" as const } }
        : { duration: 0.15, ease: "easeOut" as const };

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        if (targetSelection && !targetSelection.disabledReason) {
          event.preventDefault();
          onTargetToggle?.();
          return;
        }
        if (!targetSelection && blockerSelectable) {
          event.preventDefault();
          onSelect?.();
          return;
        }
        // On a card that can both attack and open an effect menu, Enter owns
        // the menu verb while Space remains the keyboard drag verb. Radix
        // receives Enter; dnd-kit receives Space.
        if (menuTriggerEnabled && event.key === "Enter") return;
      }
      listeners?.onKeyDown?.(event);
    },
    [
      blockerSelectable,
      listeners,
      menuTriggerEnabled,
      onSelect,
      onTargetToggle,
      targetSelection,
    ],
  );

  const ariaDescriptionIds = [
    canAttack ? attributes["aria-describedby"] : null,
    disabledReason ? descriptionId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const ariaLabel = [
    cardName,
    card.state === "RESTED" ? "rested" : "active",
    donCount > 0 ? `${donCount} DON attached` : null,
    selectionSelected
      ? "selected"
      : selectionEligible
        ? "eligible for selection"
        : null,
    disabledReason,
    canAttack ? "draggable attacker" : null,
    menuTriggerEnabled ? "actions available" : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild disabled={!menuTriggerEnabled}>
        <motion.div
          key={rejectionSequence ?? "idle"}
          ref={mergedRef}
          {...attributes}
          {...listeners}
          role={canAttack || selectionControl || menuTriggerEnabled ? "button" : "img"}
          tabIndex={0}
          aria-label={ariaLabel}
          aria-pressed={
            selectionControl
              ? selectionSelected
              : canAttack
                ? attributes["aria-pressed"]
                : undefined
          }
          aria-disabled={disabledReason ? true : undefined}
          aria-roledescription={canAttack ? attributes["aria-roledescription"] : undefined}
          aria-describedby={ariaDescriptionIds || undefined}
          onClick={
            targetSelection && !targetSelection.disabledReason
              ? onTargetToggle
              : targetSelection
                ? undefined
                : onSelect
          }
          data-blocker-selection={blockerSelectable ? "" : undefined}
          data-effect-menu-trigger={activation ? card.instanceId : undefined}
          data-target-selection={targetSelection ? "" : undefined}
          data-target-instance-id={targetSelection ? card.instanceId : undefined}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          initial={initialTarget}
          animate={animateTarget}
          transition={wrapperTransition}
          style={{
            ...style,
            width: SQUARE,
            height: SQUARE,
          }}
          className={cn(
            "relative flex touch-none items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gb-signal-eligible",
            targetSelection
              ? targetSelection.disabledReason
                ? "cursor-default"
                : "cursor-pointer"
              : canAttack
                ? "cursor-grab"
                : blockerSelectable || menuTriggerEnabled
                  ? "cursor-pointer"
                  : "cursor-default",
          )}
        >
          <DropOverlay
            active={
              acceptsDon || acceptsCounter || (acceptsHandCard && !!playSignalActive)
            }
            hovered={
              isOver &&
              (acceptsDon || acceptsCounter || (acceptsHandCard && !!playSignalActive))
            }
            color={acceptsHandCard ? "red" : "amber"}
          />
          <Card
            data={{ card, cardDb }}
            variant="field"
            state={cardState}
            overlays={{
              donCount,
              highlightRing,
              highlightRingNonce,
              powerMod,
              effectAction,
            }}
            interaction={{
              tooltipNotice: targetSelection?.disabledReason ?? undefined,
            }}
            motionDelay={animationDelay}
            className="relative z-[1]"
          />
          {canRedistribute && (
            <div
              ref={setDonDragRef}
              {...donAttributes}
              {...donListeners}
              onPointerDown={(e) => {
                e.stopPropagation();
                donListeners?.onPointerDown?.(e);
              }}
              className={cn(
                "absolute bottom-0 right-0 z-20 origin-bottom-right scale-75 touch-none cursor-grab rounded animate-pulse focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gb-signal-eligible",
                isDonDragging ? "opacity-30" : "opacity-100",
              )}
              aria-label="Drag attached DON"
            >
              <DonCard donArtUrl={donArtUrl} />
            </div>
          )}
          {disabledReason && (
            <span id={descriptionId} className="sr-only">
              {disabledReason}
            </span>
          )}
        </motion.div>
      </DropdownMenuTrigger>

      {onAction && (
        <CardActionMenuContent
          card={card}
          cardDb={cardDb}
          activation={activation}
          canActivateNow={effectAction === "available"}
          onAction={onAction}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </DropdownMenu>
  );
});

export const OpponentFieldCard = React.memo(function OpponentFieldCard({
  card,
  cardDb,
  activeDragType,
  attackTargetEligible,
  isAttacker,
  isDefender,
  winnerPulse,
  powerMod,
  effectsNegatedPulseNonce,
  attackRedirectedPulseNonce,
  counterPulse,
  targetSelection,
  onTargetToggle,
  zoneKey,
  style,
  animationDelay,
  donCountAdjust,
  entering,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  attackTargetEligible: boolean;
  isAttacker?: boolean;
  /** See `PlayerFieldCard.isDefender` — identical semantics on the opposing
   *  side. */
  isDefender?: boolean;
  winnerPulse?: boolean;
  powerMod?: PowerModPulse;
  effectsNegatedPulseNonce?: string;
  attackRedirectedPulseNonce?: number;
  counterPulse?: boolean;
  targetSelection?: TargetCardSelectionState;
  onTargetToggle?: () => void;
  zoneKey?: string;
  style: React.CSSProperties;
  animationDelay?: number;
  /** Signed offset merged into displayed DON count (OPT-274). Negative
   *  while a DON token is in-flight onto this card. */
  donCountAdjust?: number;
  /** Entry pop on first render (OPT-274). See PlayerFieldCard. */
  entering?: boolean;
}) {
  const zonePos = useZonePosition();
  const descriptionId = useId();
  const reducedMotion = useReducedMotion();
  const accepts =
    !targetSelection && activeDragType === "attacker" && attackTargetEligible;
  const { setNodeRef, isOver } = useDroppable({
    id: `attack-target-${card.instanceId}`,
    data: { type: "attack-target", targetInstanceId: card.instanceId },
    disabled: !accepts,
  });

  const ref = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      if (zoneKey) {
        if (node) {
          zonePos.register(zoneKey, node);
          zonePos.registerCard(card.instanceId, zoneKey);
        } else {
          zonePos.unregister(zoneKey);
          zonePos.unregisterCard(card.instanceId);
        }
      }
    },
    [setNodeRef, zoneKey, zonePos, card.instanceId],
  );

  // Keep card→zone mapping up to date if instanceId changes while mounted
  useEffect(() => {
    if (zoneKey) zonePos.registerCard(card.instanceId, zoneKey);
    return () => { zonePos.unregisterCard(card.instanceId); };
  }, [card.instanceId, zoneKey, zonePos]);

  const baseState = card.state === "RESTED" ? "rest" : "active";
  const cardState: "attacking" | "rest" | "active" = isAttacker
    ? "attacking"
    : baseState;
  const highlightRing = winnerPulse
    ? ("winner" as const)
    : attackRedirectedPulseNonce !== undefined
      ? ("redirected" as const)
      : effectsNegatedPulseNonce !== undefined
        ? ("negated" as const)
        : counterPulse
          ? ("counter" as const)
          : isAttacker
            ? ("attacker" as const)
            : isDefender
              ? ("defender" as const)
              : targetSelection?.selected
                ? ("selected" as const)
                : targetSelection?.eligible
                  ? ("eligible" as const)
                  : undefined;
  const highlightRingNonce =
    highlightRing === "redirected"
      ? attackRedirectedPulseNonce
      : highlightRing === "negated"
        ? effectsNegatedPulseNonce
        : undefined;

  const shouldEnter = !!entering && !reducedMotion;
  const winnerFeedbackActive = !!winnerPulse && !reducedMotion;
  const donCount = card.attachedDon.length + (donCountAdjust ?? 0);
  const cardName = cardDb[card.cardId]?.name ?? card.cardId;
  const disabledReason = targetSelection?.disabledReason ?? null;
  const selectionControl = !!targetSelection;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        (event.key === "Enter" || event.key === " ") &&
        targetSelection &&
        !targetSelection.disabledReason
      ) {
        event.preventDefault();
        onTargetToggle?.();
      }
    },
    [onTargetToggle, targetSelection],
  );

  return (
    <motion.div
      ref={ref}
      initial={shouldEnter ? ENTRY_INITIAL : false}
      animate={{
        ...ENTRY_ANIMATE,
        x: winnerFeedbackActive ? cardWinnerPulse.x : 0,
        opacity: targetSelection?.disabledReason ? 0.35 : 1,
      }}
      transition={
        winnerFeedbackActive
          ? cardWinnerPulse.transition
          : shouldEnter
            ? cardEntry
            : { duration: 0 }
      }
      onClick={
        targetSelection && !targetSelection.disabledReason
          ? onTargetToggle
          : undefined
      }
      onKeyDown={handleKeyDown}
      role={selectionControl ? "button" : "img"}
      tabIndex={0}
      aria-label={[
        cardName,
        card.state === "RESTED" ? "rested" : "active",
        donCount > 0 ? `${donCount} DON attached` : null,
        targetSelection?.selected
          ? "selected"
          : targetSelection?.eligible
            ? "eligible for selection"
            : null,
        disabledReason,
        accepts ? "legal attack target" : null,
      ]
        .filter(Boolean)
        .join(". ")}
      aria-pressed={selectionControl ? !!targetSelection?.selected : undefined}
      aria-disabled={disabledReason ? true : undefined}
      aria-describedby={disabledReason ? descriptionId : undefined}
      data-target-selection={targetSelection ? "" : undefined}
      data-target-instance-id={targetSelection ? card.instanceId : undefined}
      style={{ ...style, width: SQUARE, height: SQUARE }}
      className={cn(
        "relative flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gb-signal-eligible",
        targetSelection && !targetSelection.disabledReason
          ? "cursor-pointer"
          : "cursor-default",
      )}
    >
      <DropOverlay active={accepts} hovered={isOver && accepts} color="red" />
      <Card
        data={{ card, cardDb }}
        variant="field"
        state={cardState}
        overlays={{ donCount, highlightRing, highlightRingNonce, powerMod }}
        interaction={{
          tooltipNotice: targetSelection?.disabledReason ?? undefined,
        }}
        motionDelay={animationDelay}
        className="relative z-[1]"
      />
      {disabledReason && (
        <span id={descriptionId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </motion.div>
  );
});
