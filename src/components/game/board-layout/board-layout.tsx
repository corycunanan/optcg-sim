"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CardDb,
  GameAction,
  GameEvent,
  PlayerState,
  PromptOptions,
  PromptType,
  TurnState,
} from "@shared/game-types";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { motion, useReducedMotion } from "motion/react";
import { cardRest, cardActivate } from "@/lib/motion";
import { useDragTilt } from "@/hooks/use-drag-tilt";
import { cn } from "@/lib/utils";
import {
  TooltipProvider,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui";
import { BoardCard } from "../board-card";
import {
  NAVBAR_H,
  SQUARE,
  HAND_CARD_W,
  HAND_CARD_H,
  SIDE_ZONE_GAP,
  FIELD_W,
  BOARD_CONTENT_H,
  BOARD_CARD_W,
  BOARD_CARD_H,
  getViewportSize,
} from "./constants";
import {
  zone2Left,
  zone2Right,
  oppTop,
  oppLeaderTop,
  oppCharTop,
  midTop,
  playerTop,
  playerCharTop,
  playerLeaderTop,
  charSlotCenters,
  leaderLeft,
  stgDonWidth,
  sideCardOffsetX,
  computeBoardScaling,
} from "./board-geometry";
import { useBoardDnd } from "./use-board-dnd";
import { useBattleState } from "./use-battle-state";
import { BoardModals } from "./board-modals";
import { HandLayer } from "./hand-layer";
import { DonCard, DonZone } from "./don-zone";
import { LifeZone } from "./life-zone";
import { DroppableCharSlot, DroppableStageZone, PlayerFieldCard, OpponentFieldCard } from "./field-card";
import { MidZone } from "./mid-zone";
import { DroppableTrashZone } from "./trash-zone";
import { CardAnimationLayer } from "./card-animation-layer";
import { ZonePositionProvider, useZonePosition } from "@/contexts/zone-position-context";
import { useCardTransitions } from "@/hooks/use-card-transitions";
import { useHandAnimationState } from "@/hooks/use-hand-animation-state";

/** Registers a DOM element as a zone position anchor. */
function ZoneRef({ zoneKey, children, style, className }: {
  zoneKey: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const zonePos = useZonePosition();
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) zonePos.register(zoneKey, node);
      else zonePos.unregister(zoneKey);
    },
    [zoneKey, zonePos],
  );
  return <div ref={ref} style={style} className={className}>{children}</div>;
}

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
  activePrompt: {
    promptType: PromptType;
    options: PromptOptions;
  } | null;
  onAction: (action: GameAction) => void;
  onLeave: () => void;
  matchClosed: boolean;
}

function NavMenu({
  onLeave,
  onConcede,
  matchClosed,
}: {
  onLeave: () => void;
  onConcede: () => void;
  matchClosed: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer text-gb-text-subtle hover:text-gb-text-bright data-[state=open]:bg-gb-surface-raised data-[state=open]:text-gb-text-bright"
          aria-label="Game menu"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 bg-gb-surface border-gb-border-strong"
      >
        <DropdownMenuItem
          onClick={onLeave}
          className="text-xs text-gb-text focus:bg-gb-surface-raised"
        >
          &larr; Back to Lobbies
        </DropdownMenuItem>
        {!matchClosed && (
          <DropdownMenuItem
            onClick={onConcede}
            className="text-xs text-gb-accent-red focus:bg-gb-surface-raised focus:text-gb-accent-red"
          >
            Concede
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BoardLayout(props: BoardLayoutProps) {
  return (
    <ZonePositionProvider>
      <BoardLayoutInner {...props} />
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
  } = useBoardDnd(cardDb, bs.battle, onAction);

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
          <HandLayer cards={opp?.hand ?? []} faceDown cardDb={cardDb} zoneKey="o-hand" inFlightCardIds={oppHandAnim.inFlightByZone["o-hand"]} />
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
          {/* ═══════════ OPPONENT FIELD ═══════════════════════════════ */}

          {/* Zone 3 (left): Trash + Deck */}
          <ZoneRef zoneKey="o-trash" style={{ position: "absolute", left: sideCardOffsetX, top: oppTop }}>
            <BoardCard
              card={opp && opp.trash.length > 0 ? opp.trash[0] : undefined}
              cardDb={cardDb}
              empty={!opp || opp.trash.length === 0}
              label="TRASH"
              count={opp && opp.trash.length > 1 ? opp.trash.length : undefined}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              onClick={() => opp && opp.trash.length > 0 && setZonePreview({ type: "trash", owner: "opp" })}
            />
          </ZoneRef>
          <ZoneRef zoneKey="o-deck" style={{ position: "absolute", left: sideCardOffsetX, top: oppTop + SQUARE + SIDE_ZONE_GAP }}>
            <BoardCard
              cardDb={cardDb}
              sleeve
              label="DECK"
              count={opp?.deck.length}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              onClick={() => opp && setZonePreview({ type: "deck", owner: "opp" })}
            />
          </ZoneRef>

          {/* Zone 2: Leader row — STG / LDR / DON */}
          <ZoneRef zoneKey="o-stage" style={{ position: "absolute", left: zone2Left, top: oppLeaderTop, width: stgDonWidth, height: SQUARE }} className="flex items-center justify-center rounded-md border border-gb-border-strong/30">
            {opp?.stage ? (
              <motion.div
                animate={{
                  rotate: opp.stage.state === "RESTED" ? 90 : 0,
                  filter: opp.stage.state === "RESTED" ? "brightness(0.6)" : "brightness(1)",
                }}
                transition={{
                  ...(opp.stage.state === "RESTED" ? cardRest : cardActivate),
                  delay: refreshWave ? 0.18 : 0,
                }}
              >
                <BoardCard
                  card={opp.stage}
                  cardDb={cardDb}
                  width={BOARD_CARD_W}
                  height={BOARD_CARD_H}
                />
              </motion.div>
            ) : (
              <span className="text-xs font-bold text-gb-text-dim/40 leading-none select-none">
                STG
              </span>
            )}
          </ZoneRef>

          {opp?.leader ? (
            <OpponentFieldCard
              card={opp.leader}
              cardDb={cardDb}
              activeDragType={activeDragType}
              zoneKey="o-leader"
              style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
              animationDelay={refreshWave ? 0 : undefined}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="LDR"
              width={SQUARE}
              height={SQUARE}
              style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
            />
          )}

          <DonZone
            player={opp}
            zoneKey="o-don"
            style={{ left: zone2Right - stgDonWidth, top: oppLeaderTop, width: stgDonWidth, height: SQUARE }}
            animationDelay={refreshWave ? 0.2 : undefined}
          />

          {/* Zone 2: Character row */}
          {charSlotCenters.map((pos, i) => {
            const char = opp?.characters[i] ?? null;
            return char ? (
              <OpponentFieldCard
                key={`opp-c${i}`}
                card={char}
                cardDb={cardDb}
                activeDragType={activeDragType}
                zoneKey={`o-char-${i}`}
                style={{ position: "absolute", left: pos.left, top: oppCharTop }}
                animationDelay={refreshWave ? 0.03 * (i + 1) : undefined}
              />
            ) : (
              <BoardCard
                key={`opp-c${i}`}
                cardDb={cardDb}
                empty
                label={`C${i + 1}`}
                width={SQUARE}
                height={SQUARE}
                style={{ position: "absolute", left: pos.left, top: oppCharTop }}
              />
            );
          })}

          {/* Zone 1 (right): Life */}
          <LifeZone
            life={opp?.life ?? []}
            cardDb={cardDb}
            zoneKey="o-life"
            style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: oppTop }}
          />

          {/* ═══════════ MID ZONE ════════════════════════════════════ */}
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
            onAction={onAction}
          />

          {/* ═══════════ PLAYER FIELD ═════════════════════════════════ */}

          {/* Zone 1 (left): Life */}
          <LifeZone
            life={me?.life ?? []}
            cardDb={cardDb}
            zoneKey="p-life"
            style={{ position: "absolute", left: sideCardOffsetX, top: playerTop }}
          />

          {/* Zone 2: Character row */}
          {charSlotCenters.map((pos, i) => {
            const char = me?.characters[i] ?? null;
            if (!char) {
              return (
                <DroppableCharSlot
                  key={`plr-c${i}`}
                  slotIndex={i}
                  label={`C${i + 1}`}
                  cardDb={cardDb}
                  activeDragType={activeDragType}
                  zoneKey={`p-char-${i}`}
                  style={{ position: "absolute", left: pos.left, top: playerCharTop }}
                />
              );
            }
            const charData = cardDb[char.cardId];
            const isBlockerEligible = bs.inBlockStep && char.state === "ACTIVE" && !!charData?.keywords?.blocker;
            return (
              <PlayerFieldCard
                key={`plr-c${i}`}
                card={char}
                cardDb={cardDb}
                activeDragType={activeDragType}
                canAttack={bs.canInteract && char.state === "ACTIVE"}
                blockerSelectable={isBlockerEligible}
                selected={bs.selectedBlockerId === char.instanceId}
                onSelect={isBlockerEligible ? () => bs.setSelectedBlockerId(char.instanceId) : undefined}
                onAction={onAction}
                zoneKey={`p-char-${i}`}
                animationDelay={refreshWave ? 0.03 * (i + 1) : undefined}
                style={{ position: "absolute", left: pos.left, top: playerCharTop }}
              />
            );
          })}

          {/* Zone 2: Leader row — DON / LDR / STG */}
          <DonZone
            player={me}
            enableDrag={bs.canInteract}
            zoneKey="p-don"
            style={{ left: zone2Left, top: playerLeaderTop, width: stgDonWidth, height: SQUARE }}
            animationDelay={refreshWave ? 0.2 : undefined}
          />

          {me?.leader ? (
            <PlayerFieldCard
              card={me.leader}
              cardDb={cardDb}
              activeDragType={activeDragType}
              canAttack={bs.canInteract && me.leader.state === "ACTIVE"}
              onAction={onAction}
              zoneKey="p-leader"
              style={{ position: "absolute", left: leaderLeft, top: playerLeaderTop }}
              animationDelay={refreshWave ? 0 : undefined}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="LDR"
              width={SQUARE}
              height={SQUARE}
              style={{ position: "absolute", left: leaderLeft, top: playerLeaderTop }}
            />
          )}

          <DroppableStageZone
            card={me?.stage ?? null}
            cardDb={cardDb}
            activeDragType={activeDragType}
            zoneKey="p-stage"
            style={{ position: "absolute", left: zone2Right - stgDonWidth, top: playerLeaderTop, width: stgDonWidth, height: SQUARE }}
            animationDelay={refreshWave ? 0.18 : undefined}
          />

          {/* Zone 3 (right): Deck + Trash */}
          <ZoneRef zoneKey="p-deck" style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: playerTop }}>
            <BoardCard
              cardDb={cardDb}
              sleeve
              label="DECK"
              count={me?.deck.length}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              onClick={() => me && setZonePreview({ type: "deck", owner: "me" })}
            />
          </ZoneRef>
          <DroppableTrashZone
            trash={me?.trash ?? []}
            cardDb={cardDb}
            activeDrag={activeDrag}
            battleSubPhase={turn?.battleSubPhase ?? null}
            onClickTrash={() => me && me.trash.length > 0 && setZonePreview({ type: "trash", owner: "me" })}
            zoneKey="p-trash"
            style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: playerTop + SQUARE + SIDE_ZONE_GAP }}
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
            inFlightCardIds={playerHandAnim.inFlightByZone["p-hand"]}
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
              <DonCard />
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
    />

    </DndContext>
    </TooltipProvider>
  );
}
