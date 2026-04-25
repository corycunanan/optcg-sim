"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import type { CardDb, CardInstance, GameAction } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { useZonePosition } from "@/contexts/zone-position-context";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import { cardEntry } from "@/lib/motion";
import { Card } from "../card";
import { SQUARE, type AttackerDrag, type RedistributeDonDrag } from "./constants";
import { CardActionMenuContent } from "../card-action-menu";
import { DropOverlay } from "./drop-zones";
import { useInteractionMode } from "./interaction-mode";

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
  canAttack,
  blockerSelectable,
  selected,
  isAttacker,
  isDefender,
  counterPulse,
  onSelect,
  onAction,
  zoneKey,
  slotIndex,
  boardFull,
  style,
  animationDelay,
  redistributeSource,
  pendingTransferDonIds,
  donCountAdjust,
  entering,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  canAttack: boolean;
  blockerSelectable?: boolean;
  selected?: boolean;
  isAttacker?: boolean;
  /** True when this card is `battle.targetInstanceId` — the current defender.
   *  Moves with the battle: leader at declare-attack, then the blocker once
   *  block is declared. Drives the amber pulse ring (OPT-274). */
  isDefender?: boolean;
  counterPulse?: boolean;
  onSelect?: () => void;
  onAction?: (action: GameAction) => void;
  zoneKey?: string;
  slotIndex?: number;
  boardFull?: boolean;
  style: React.CSSProperties;
  animationDelay?: number;
  redistributeSource?: boolean;
  pendingTransferDonIds?: Set<string>;
  donCountAdjust?: number;
  /** If true, plays a one-shot summon-entry pop on mount (OPT-274). Parent
   *  (PlayerField) only sets this for instanceIds that weren't in the
   *  previous render, so the effect doesn't fire on page-level rehydrates. */
  entering?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const zonePos = useZonePosition();
  const reducedMotion = useReducedMotion();
  const interactionMode = useInteractionMode();
  const inputSuppressed = interactionMode !== "full";

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `attacker-${card.instanceId}`,
    data: { type: "attacker", card } satisfies AttackerDrag,
    disabled: !canAttack || inputSuppressed,
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
  const acceptsHandCard = !!boardFull && activeDragType === "hand-card";
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: acceptsHandCard ? `char-slot-${slotIndex}` : `don-target-${card.instanceId}`,
    data: acceptsHandCard
      ? { type: "character-slot", slotIndex }
      : { type: "don-target", targetInstanceId: card.instanceId },
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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (inputSuppressed) return;
      setMenuOpen(true);
    },
    [inputSuppressed],
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
  // wins): counter flash (transient) > attacker (current aggressor) > defender
  // (OPT-274 — current battle target, same amber pulse as attacker) > selected
  // (user-chosen blocker) > blockerSelectable (eligible candidate).
  const highlightRing = counterPulse
    ? ("counter" as const)
    : isAttacker
      ? ("attacker" as const)
      : isDefender
        ? ("defender" as const)
        : selected
          ? ("selected" as const)
          : blockerSelectable
            ? ("blocker" as const)
            : undefined;

  // Entry pop (OPT-274): only triggers on first render when the parent
  // flagged this card as newly-arrived. `isDragging` opacity still wins
  // (composes via `animate` overriding scale/opacity post-mount).
  const shouldEnter = !!entering && !reducedMotion;
  const initialTarget = shouldEnter ? ENTRY_INITIAL : false;
  const animateTarget = { scale: 1, opacity: isDragging ? 0.3 : 1 };
  const wrapperTransition = shouldEnter
    ? { scale: cardEntry, opacity: { duration: 0.2, ease: "easeOut" as const } }
    : { duration: 0.15, ease: "easeOut" as const };

  return (
    <DropdownMenu open={menuOpen} onOpenChange={(open) => { if (!open) setMenuOpen(false); }}>
      <DropdownMenuTrigger asChild>
        <motion.div
          ref={mergedRef}
          {...attributes}
          {...listeners}
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          initial={initialTarget}
          animate={animateTarget}
          transition={wrapperTransition}
          style={{
            ...style,
            width: SQUARE,
            height: SQUARE,
            cursor: canAttack ? "grab" : blockerSelectable ? "pointer" : "default",
          }}
          className="relative flex items-center justify-center rounded-md"
        >
          <DropOverlay active={acceptsDon || acceptsHandCard} hovered={isOver && (acceptsDon || acceptsHandCard)} color={acceptsHandCard ? "red" : "amber"} />
          <Card
            data={{ card, cardDb }}
            variant="field"
            state={cardState}
            overlays={{ donCount, highlightRing }}
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
                "absolute z-20 left-0 right-0 bottom-0 h-6 rounded-b-md cursor-grab",
                "bg-gb-accent-gold/30 ring-1 ring-gb-accent-gold/60",
                "animate-pulse",
                isDonDragging ? "opacity-30" : "opacity-100",
              )}
              aria-label="Drag attached DON"
            />
          )}
        </motion.div>
      </DropdownMenuTrigger>

      {onAction && (
        <CardActionMenuContent
          card={card}
          cardDb={cardDb}
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
  isAttacker,
  isDefender,
  counterPulse,
  zoneKey,
  style,
  animationDelay,
  donCountAdjust,
  entering,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  isAttacker?: boolean;
  /** See `PlayerFieldCard.isDefender` — identical semantics on the opposing
   *  side. */
  isDefender?: boolean;
  counterPulse?: boolean;
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
  const reducedMotion = useReducedMotion();
  const accepts = activeDragType === "attacker";
  const { setNodeRef, isOver } = useDroppable({
    id: `attack-target-${card.instanceId}`,
    data: { type: "attack-target", targetInstanceId: card.instanceId },
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
  const highlightRing = counterPulse
    ? ("counter" as const)
    : isAttacker
      ? ("attacker" as const)
      : isDefender
        ? ("defender" as const)
        : undefined;

  const shouldEnter = !!entering && !reducedMotion;
  const donCount = card.attachedDon.length + (donCountAdjust ?? 0);

  return (
    <motion.div
      ref={ref}
      initial={shouldEnter ? ENTRY_INITIAL : false}
      animate={ENTRY_ANIMATE}
      transition={shouldEnter ? cardEntry : { duration: 0 }}
      style={{ ...style, width: SQUARE, height: SQUARE }}
      className="relative flex items-center justify-center rounded-md"
    >
      <DropOverlay active={accepts} hovered={isOver && accepts} color="red" />
      <Card
        data={{ card, cardDb }}
        variant="field"
        state={cardState}
        overlays={{ donCount, highlightRing }}
        motionDelay={animationDelay}
        className="relative z-[1]"
      />
    </motion.div>
  );
});
