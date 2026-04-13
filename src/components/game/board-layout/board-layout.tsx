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
import { BoardCard } from "../board-card";
import {
  NAVBAR_H,
  HAND_CARD_W,
  HAND_CARD_H,
  FIELD_W,
  BOARD_CONTENT_H,
  BOARD_CARD_W,
  BOARD_CARD_H,
  getViewportSize,
} from "./constants";
import { midTop, computeBoardScaling } from "./board-geometry";
import { useBoardDnd } from "./use-board-dnd";
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
import { useCardTransitions } from "@/hooks/use-card-transitions";
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
}

export function BoardLayout(props: BoardLayoutProps) {
  return (
    <ZonePositionProvider>
      <ActiveEffectsProvider value={props.activeEffects}>
        <BoardLayoutInner {...props} />
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
}: BoardLayoutProps) {
  const zoneRegistry = useZonePosition();
  const [viewport, setViewport] = useState(getViewportSize);
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
    function update() {
      setViewport(getViewportSize());
    }
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  /* ── Derived state from extracted hooks ───────────────────────────── */

  const { boardScale, boardTop, playerHandTop } = computeBoardScaling(viewport);

  const bs = useBattleState(me, opp, myIndex, turn, cardDb, isMyTurn, battlePhase, matchClosed);

  const {
    activeDrag,
    activeDragType,
    sensors,
    handleDragStart,
    handleDragEnd,
  } = useBoardDnd(cardDb, bs.battle, onAction, handleRedistributeDrop);

  const dragTilt = useDragTilt();

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

  const playerHandAnim = useHandAnimationState(cardAnimations, me?.hand ?? [], "p-hand");
  const oppHandAnim = useHandAnimationState(cardAnimations, opp?.hand ?? [], "o-hand");

  /* ── Sleeve/DON URLs per player index ────────────────────────── */

  const sleeveUrls: [string | null, string | null] = myIndex === 0
    ? [me?.sleeveUrl ?? null, opp?.sleeveUrl ?? null]
    : [opp?.sleeveUrl ?? null, me?.sleeveUrl ?? null];

  /* ── Refresh phase stagger detection ────────────────────────── */

  const reducedMotion = useReducedMotion();
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
            donCountAdjustments={donCountAdjustments}
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
            cards={me?.hand ?? []}
            cardDb={cardDb}
            enableDrag={bs.canInteract || bs.canDragCounter}
            counterMode={bs.canDragCounter}
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
        <motion.div style={{ rotate: dragTilt.tilt }}>
          {activeDrag.type === "hand-card" && (
            <BoardCard
              card={activeDrag.card}
              cardDb={cardDb}
              width={HAND_CARD_W * boardScale}
              height={HAND_CARD_H * boardScale}
            />
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
            <BoardCard
              card={activeDrag.card}
              cardDb={cardDb}
              width={BOARD_CARD_W * boardScale}
              height={BOARD_CARD_H * boardScale}
            />
          )}
        </motion.div>
      )}
    </DragOverlay>

    <CardAnimationLayer
      transitions={cardAnimations}
      cardDb={cardDb}
      onComplete={removeTransition}
      sleeveUrls={sleeveUrls}
    />

    </DndContext>
    </TooltipProvider>
  );
}
