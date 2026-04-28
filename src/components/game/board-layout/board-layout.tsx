"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ActiveEffect,
  CardDb,
  GameAction,
  GameEvent,
  PlayerState,
  PromptOptions,
  TurnState,
} from "@shared/game-types";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import { useDragTilt } from "@/hooks/use-drag-tilt";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui";
import { Card } from "../card";
import {
  NAVBAR_H,
  HAND_CARD_H,
  FIELD_W,
  BOARD_CONTENT_H,
  getViewportSize,
} from "./constants";
import { midTop, computeBoardScaling } from "./board-geometry";
import { useBoardDnd } from "./use-board-dnd";
import { useHandOrder } from "@/hooks/use-hand-order";
import { useBattleState } from "./use-battle-state";
import { BoardModals } from "./board-modals";
import { HandLayer } from "./hand-layer";
import { DonCard } from "./don-zone";
import { MidZone } from "./mid-zone";
import { CardAnimationLayer } from "./card-animation-layer";
import { NavMenu } from "./nav-menu";
import { OpponentField } from "./opponent-field";
import { PlayerField } from "./player-field";
import { ZonePositionProvider, useZonePosition } from "@/contexts/zone-position-context";
import { ActiveEffectsProvider } from "@/contexts/active-effects-context";
import {
  InteractionModeProvider,
  type InteractionMode,
} from "./interaction-mode";
import { useCardTransitions } from "@/hooks/use-card-transitions";
import { useCounterPulse } from "@/hooks/use-counter-pulse";
import { useHandAnimationState } from "@/hooks/use-hand-animation-state";
import type { RedistributeTransfer } from "../redistribute-don-overlay";

export interface BoardLayoutProps {
  me: PlayerState | null;
  opp: PlayerState | null;
  myIndex: 0 | 1 | null;
  turn: TurnState | null;
  cardDb: CardDb;
  isMyTurn: boolean;
  battlePhase: string | null;
  connectionStatus: string;
  eventLog: GameEvent[];
  activeEffects: ActiveEffect[];
  activePrompt: PromptOptions | null;
  onAction: (action: GameAction) => void;
  onLeave: () => void;
  matchClosed: boolean;
  canUndo: boolean;
  /** Suppresses board-driven user input. Default `"full"` (production game).
   *  `"spectator"` and `"responseOnly"` are sandbox-only modes (OPT-290) that
   *  disable drag and right-click menus while leaving prompt modals usable. */
  interactionMode?: InteractionMode;
  /** When provided, BoardLayout authors against this design canvas instead of
   *  measuring the window. Set by `<Board>` to the parent `<ScaledBoard>`'s
   *  designWidth/designHeight so the inner board sizes against design pixels
   *  while `<ScaledBoard>` owns the viewport-fit transform. */
  viewportSize?: { width: number; height: number };
}

export function BoardLayout(props: BoardLayoutProps) {
  const interactionMode = props.interactionMode ?? "full";
  return (
    <ZonePositionProvider>
      <ActiveEffectsProvider value={props.activeEffects}>
        <InteractionModeProvider value={interactionMode}>
          <BoardLayoutInner {...props} interactionMode={interactionMode} />
        </InteractionModeProvider>
      </ActiveEffectsProvider>
    </ZonePositionProvider>
  );
}

function BoardLayoutInner({
  me,
  opp,
  myIndex,
  turn,
  cardDb,
  isMyTurn,
  battlePhase,
  connectionStatus,
  eventLog,
  activePrompt,
  onAction,
  onLeave,
  matchClosed,
  canUndo,
  interactionMode = "full",
  viewportSize,
}: BoardLayoutProps & { interactionMode?: InteractionMode }) {
  const dndDisabled = interactionMode !== "full";
  const zoneRegistry = useZonePosition();
  const [windowViewport, setWindowViewport] = useState(getViewportSize);
  const viewport = viewportSize ?? windowViewport;
  const [isPromptHidden, setIsPromptHidden] = useState(false);
  const [zonePreview, setZonePreview] = useState<
    | { type: "deck"; owner: "me" | "opp" }
    | { type: "trash"; owner: "me" | "opp" }
    | null
  >(null);

  useEffect(() => {
    setIsPromptHidden(false);
  }, [activePrompt?.promptType]);

  /* ── Redistribute DON prompt state ───────────────────────────── */

  const redistributePrompt = activePrompt?.promptType === "REDISTRIBUTE_DON" ? activePrompt : null;
  const [redistributeTransfers, setRedistributeTransfers] = useState<RedistributeTransfer[]>([]);

  // Reset pending transfers when prompt identity changes (new prompt, or cleared).
  useEffect(() => {
    setRedistributeTransfers([]);
  }, [redistributePrompt?.validSourceCardIds, redistributePrompt?.validTargetCardIds, redistributePrompt?.maxTransfers]);

  const handleRedistributeDrop = useCallback(
    (fromCardId: string, donId: string, toCardId: string) => {
      if (!redistributePrompt) return;
      if (fromCardId === toCardId) return;
      if (!redistributePrompt.validSourceCardIds.includes(fromCardId)) return;
      if (!redistributePrompt.validTargetCardIds.includes(toCardId)) return;
      setRedistributeTransfers((prev) => {
        if (prev.length >= redistributePrompt.maxTransfers) return prev;
        // Each DON can only be moved once in one submission
        if (prev.some((t) => t.donInstanceId === donId)) return prev;
        return [...prev, { fromCardInstanceId: fromCardId, donInstanceId: donId, toCardInstanceId: toCardId }];
      });
    },
    [redistributePrompt],
  );

  const redistributeSourceIds = useMemo(() => {
    if (!redistributePrompt) return undefined;
    return new Set(redistributePrompt.validSourceCardIds);
  }, [redistributePrompt]);

  const pendingTransferDonIdsByCard = useMemo(() => {
    if (!redistributePrompt || redistributeTransfers.length === 0) return undefined;
    const map = new Map<string, Set<string>>();
    for (const t of redistributeTransfers) {
      let set = map.get(t.fromCardInstanceId);
      if (!set) {
        set = new Set<string>();
        map.set(t.fromCardInstanceId, set);
      }
      set.add(t.donInstanceId);
    }
    return map;
  }, [redistributePrompt, redistributeTransfers]);

  const donCountAdjustments = useMemo(() => {
    if (!redistributePrompt || redistributeTransfers.length === 0) return undefined;
    const map = new Map<string, number>();
    for (const t of redistributeTransfers) {
      map.set(t.fromCardInstanceId, (map.get(t.fromCardInstanceId) ?? 0) - 1);
      map.set(t.toCardInstanceId, (map.get(t.toCardInstanceId) ?? 0) + 1);
    }
    return map;
  }, [redistributePrompt, redistributeTransfers]);

  useLayoutEffect(() => {
    if (viewportSize) return;
    function update() {
      setWindowViewport(getViewportSize());
    }
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [viewportSize]);

  /* ── Derived state from extracted hooks ───────────────────────────── */

  const { boardScale, boardTop, playerHandTop } = computeBoardScaling(viewport);

  const bs = useBattleState(me, opp, myIndex, turn, cardDb, isMyTurn, battlePhase, matchClosed);

  const { orderedHand: playerOrderedHand, reorder: reorderPlayerHand } = useHandOrder(
    me?.hand ?? [],
  );

  const {
    activeDrag,
    activeDragType,
    sensors,
    handleDragStart,
    handleDragEnd,
  } = useBoardDnd(
    cardDb,
    bs.battle,
    onAction,
    handleRedistributeDrop,
    reorderPlayerHand,
    dndDisabled,
  );

  const reducedMotion = useReducedMotion();
  const dragTilt = useDragTilt({ disabled: !!reducedMotion });

  /* ── Status indicator ──────────────────────────────────────────── */

  const statusDot =
    connectionStatus === "connected"
      ? "bg-gb-accent-green"
      : connectionStatus === "connecting"
        ? "bg-gb-accent-amber"
        : "bg-gb-accent-red";

  /* ── Card flight animations ──────────────────────────────────── */

  const { transitions: cardAnimations, removeTransition } = useCardTransitions(
    eventLog,
    myIndex,
    activeDrag !== null,
    zoneRegistry,
  );

  const counterPulseIds = useCounterPulse(eventLog, bs.battle);
  const attackerInstanceId = bs.battle?.attackerInstanceId ?? null;
  const defenderInstanceId = bs.battle?.targetInstanceId ?? null;

  // While a DON token is flying onto a target card, the displayed count is
  // held back by the number of in-flight tokens so the counter doesn't
  // increment before the token lands (OPT-274). Merged with redistribute
  // adjustments below.
  const inFlightDonAdjustByCard = useMemo(() => {
    if (cardAnimations.length === 0) return null;
    const m = new Map<string, number>();
    for (const t of cardAnimations) {
      if (t.kind !== "don-attach" || !t.targetInstanceId) continue;
      m.set(t.targetInstanceId, (m.get(t.targetInstanceId) ?? 0) - 1);
    }
    return m.size > 0 ? m : null;
  }, [cardAnimations]);

  // Cards currently flying *into* the trash zones. The trash rendering on
  // both sides uses these sets to hide the card until its flight completes —
  // otherwise the server-confirmed top card appears in the trash instantly
  // while the flight ghost is still mid-air, which reads as "teleport then
  // animation" (OPT-274 follow-up).
  const pTrashArrivingIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of cardAnimations) {
      if (t.toZoneKey === "p-trash" && t.instanceId) s.add(t.instanceId);
    }
    return s;
  }, [cardAnimations]);

  const oTrashArrivingIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of cardAnimations) {
      if (t.toZoneKey === "o-trash" && t.instanceId) s.add(t.instanceId);
    }
    return s;
  }, [cardAnimations]);

  const mergedDonCountAdjustments = useMemo(() => {
    if (!inFlightDonAdjustByCard && !donCountAdjustments) return undefined;
    const out = new Map<string, number>();
    if (donCountAdjustments) {
      for (const [k, v] of donCountAdjustments) out.set(k, v);
    }
    if (inFlightDonAdjustByCard) {
      for (const [k, v] of inFlightDonAdjustByCard) {
        out.set(k, (out.get(k) ?? 0) + v);
      }
    }
    return out.size > 0 ? out : undefined;
  }, [donCountAdjustments, inFlightDonAdjustByCard]);

  const playerHandAnim = useHandAnimationState(cardAnimations, playerOrderedHand, "p-hand");
  const oppHandAnim = useHandAnimationState(cardAnimations, opp?.hand ?? [], "o-hand");

  /* ── Sleeve/DON URLs per player index ────────────────────────── */

  const sleeveUrls: [string | null, string | null] = myIndex === 0
    ? [me?.sleeveUrl ?? null, opp?.sleeveUrl ?? null]
    : [opp?.sleeveUrl ?? null, me?.sleeveUrl ?? null];

  const donArtUrls: [string | null, string | null] = myIndex === 0
    ? [me?.donArtUrl ?? null, opp?.donArtUrl ?? null]
    : [opp?.donArtUrl ?? null, me?.donArtUrl ?? null];

  /* ── Refresh phase stagger detection ────────────────────────── */

  const prevPhaseRef = useRef(turn?.phase);
  const [refreshWave, setRefreshWave] = useState(false);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = turn?.phase;
    if (!reducedMotion && prevPhase === "REFRESH" && turn?.phase === "DRAW") {
      setRefreshWave(true);
      const timer = setTimeout(() => setRefreshWave(false), 500);
      return () => clearTimeout(timer);
    }
  }, [turn?.phase, reducedMotion]);

  return (
    <TooltipProvider delayDuration={0} disableHoverableContent>
    <DndContext
      sensors={sensors}
      onDragStart={(e) => { handleDragStart(e); dragTilt.handleDragStart(e); }}
      onDragMove={dragTilt.handleDragMove}
      onDragEnd={(e) => { handleDragEnd(e); dragTilt.handleDragEnd(e); }}
    >
    <div className="relative h-full w-full overflow-hidden bg-gb-board">
      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <nav
        className="absolute inset-x-0 top-0 z-30 flex items-center px-4 bg-gb-navbar"
        style={{ height: NAVBAR_H }}
      >
        <span className="text-xs font-bold tracking-widest text-gb-text-bright shrink-0">
          OPTCG SIM
        </span>

        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-xs text-gb-text-bright font-bold">
            Turn {turn?.number ?? "—"}
          </span>
          <div
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              isMyTurn ? "bg-gb-accent-green" : "bg-gb-accent-amber",
            )}
          />
          <span
            className={cn(
              "text-xs font-bold",
              isMyTurn ? "text-gb-accent-green" : "text-gb-text-dim",
            )}
          >
            {isMyTurn ? "Your Turn" : "Opponent\u2019s Turn"}
          </span>
          <span className="text-xs text-gb-accent-blue font-bold">
            {battlePhase === "BLOCK_STEP"
              ? bs.isDefender ? "You are blocking" : "Opponent is blocking"
              : battlePhase === "COUNTER_STEP"
                ? bs.isDefender ? "You are countering" : "Opponent is countering"
                : bs.phase}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {interactionMode === "spectator" && (
            <span
              data-testid="board-spectator-badge"
              className="rounded px-2 py-1 text-xs font-bold tracking-widest uppercase bg-gb-accent-amber/20 text-gb-accent-amber border border-gb-accent-amber/40"
            >
              Watching
            </span>
          )}
          {interactionMode === "responseOnly" && (
            <span
              data-testid="board-respond-badge"
              className="rounded px-2 py-1 text-xs font-bold tracking-widest uppercase bg-gb-accent-blue/20 text-gb-accent-blue border border-gb-accent-blue/40"
            >
              Respond
            </span>
          )}
          {myIndex !== null && (
            <span className="text-xs text-gb-text-dim">
              P{myIndex + 1}
            </span>
          )}
          <div className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", statusDot)} />
            <span className="text-xs text-gb-text-dim">
              {connectionStatus}
            </span>
          </div>
          <NavMenu
            onLeave={onLeave}
            onConcede={() => onAction({ type: "CONCEDE" })}
            matchClosed={matchClosed}
          />
        </div>
      </nav>

      {/* ── Opponent Hand Layer ─────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
        <div
          className="relative flex items-end justify-center"
          style={{
            width: FIELD_W,
            height: HAND_CARD_H,
            transform: `scale(${boardScale})`,
            transformOrigin: "top center",
          }}
        >
          <HandLayer cards={opp?.hand ?? []} faceDown cardDb={cardDb} zoneKey="o-hand" inFlightInstanceIds={oppHandAnim.inFlightInstanceIds} sleeveUrl={opp?.sleeveUrl} />
        </div>
      </div>

      {/* ── Board Layer ────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{ top: boardTop }}
      >
        <div
          className="relative shrink-0"
          style={{
            width: FIELD_W,
            height: BOARD_CONTENT_H,
            transform: `scale(${boardScale})`,
            transformOrigin: "top center",
          }}
        >
          <OpponentField
            opp={opp}
            cardDb={cardDb}
            activeDragType={activeDragType}
            refreshWave={refreshWave}
            onPreviewZone={setZonePreview}
            attackerInstanceId={attackerInstanceId}
            defenderInstanceId={defenderInstanceId}
            counterPulseIds={counterPulseIds}
            donCountAdjustments={inFlightDonAdjustByCard ?? undefined}
            trashArrivingIds={oTrashArrivingIds}
          />

          <MidZone
            top={midTop}
            isMyTurn={isMyTurn}
            phase={bs.phase}
            canEndPhase={bs.canEndPhase}
            canPass={bs.canPass}
            inBattle={bs.inBattle}
            activePrompt={activePrompt}
            battleInfo={bs.battleInfo}
            blockerMode={bs.inBlockStep ? {
              selectedBlockerId: bs.selectedBlockerId,
              onBlock: () => {
                if (bs.selectedBlockerId) {
                  onAction({ type: "DECLARE_BLOCKER", blockerInstanceId: bs.selectedBlockerId });
                  bs.setSelectedBlockerId(null);
                }
              },
            } : undefined}
            isPromptHidden={isPromptHidden}
            onShowPrompt={() => setIsPromptHidden(false)}
            canUndo={canUndo}
            onAction={onAction}
          />

          <PlayerField
            me={me}
            cardDb={cardDb}
            activeDragType={activeDragType}
            activeDrag={activeDrag}
            turn={turn}
            refreshWave={refreshWave}
            canInteract={bs.canInteract}
            canDragCounter={bs.canDragCounter}
            inBlockStep={bs.inBlockStep}
            selectedBlockerId={bs.selectedBlockerId}
            setSelectedBlockerId={bs.setSelectedBlockerId}
            onAction={onAction}
            onPreviewZone={setZonePreview}
            redistributeSourceIds={redistributeSourceIds}
            pendingTransferDonIdsByCard={pendingTransferDonIdsByCard}
            donCountAdjustments={mergedDonCountAdjustments}
            attackerInstanceId={attackerInstanceId}
            defenderInstanceId={defenderInstanceId}
            counterPulseIds={counterPulseIds}
            trashArrivingIds={pTrashArrivingIds}
          />
        </div>
      </div>

      {/* ── Player Hand Layer ──────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-center"
        style={{ top: playerHandTop }}
      >
        <div
          className="relative flex items-start justify-center"
          style={{
            width: FIELD_W,
            height: HAND_CARD_H,
            transform: `scale(${boardScale})`,
            transformOrigin: "top center",
          }}
        >
          <HandLayer
            cards={playerOrderedHand}
            cardDb={cardDb}
            enableDrag={!dndDisabled && (bs.canInteract || bs.canDragCounter)}
            counterMode={!dndDisabled && bs.canDragCounter}
            zoneKey="p-hand"
            inFlightInstanceIds={playerHandAnim.inFlightInstanceIds}
            sleeveUrl={me?.sleeveUrl}
          />
        </div>
      </div>

      <BoardModals
        activePrompt={activePrompt}
        isPromptHidden={isPromptHidden}
        onHide={() => setIsPromptHidden(true)}
        cardDb={cardDb}
        onAction={onAction}
        zonePreview={zonePreview}
        onCloseZonePreview={() => setZonePreview(null)}
        me={me}
        opp={opp}
        redistributeTransfers={redistributeTransfers}
        onRedistributeUndo={() => setRedistributeTransfers((prev) => prev.slice(0, -1))}
      />
    </div>

    <DragOverlay dropAnimation={null}>
      {activeDrag && (
        <motion.div
          style={{
            // Parent perspective so the rotateX/rotateY reads as depth rather
            // than orthographic skew. The inner <Card> owns its own
            // perspective stack; this one lives on the DragOverlay wrapper
            // specifically to give the drag tilt physical volume.
            transformPerspective: 1000,
            rotateX: dragTilt.tiltX,
            rotateY: dragTilt.tiltY,
          }}
        >
          {activeDrag.type === "hand-card" && (
            <div
              style={{
                transform: `scale(${boardScale})`,
                transformOrigin: "top left",
              }}
            >
              <Card
                variant="hand"
                data={{ cardDb, card: activeDrag.card }}
                interaction={{ tooltipDisabled: true }}
              />
            </div>
          )}
          {activeDrag.type === "active-don" && (
            <div
              style={{
                transform: `scale(${boardScale})`,
                transformOrigin: "top left",
              }}
            >
              <DonCard donArtUrl={me?.donArtUrl} />
            </div>
          )}
          {activeDrag.type === "redistribute-don" && (
            <div
              style={{
                transform: `scale(${boardScale})`,
                transformOrigin: "top left",
              }}
            >
              <DonCard donArtUrl={me?.donArtUrl} />
            </div>
          )}
          {activeDrag.type === "attacker" && (
            <div
              style={{
                transform: `scale(${boardScale})`,
                transformOrigin: "top left",
              }}
            >
              <Card
                variant="field"
                data={{ cardDb, card: activeDrag.card }}
                overlays={{ donCount: activeDrag.card.attachedDon.length }}
                interaction={{ tooltipDisabled: true }}
              />
            </div>
          )}
        </motion.div>
      )}
    </DragOverlay>

    <CardAnimationLayer
      transitions={cardAnimations}
      cardDb={cardDb}
      onComplete={removeTransition}
      sleeveUrls={sleeveUrls}
      donArtUrls={donArtUrls}
    />

    </DndContext>
    </TooltipProvider>
  );
}
