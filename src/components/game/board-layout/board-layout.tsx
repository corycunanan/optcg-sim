"use client";

import { useLayoutEffect, useState } from "react";
import type {
  CardDb,
  GameAction,
  PlayerState,
  PromptOptions,
  PromptType,
  TurnState,
} from "@shared/game-types";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { BoardCard } from "../board-card";
import {
  NAVBAR_H,
  SQUARE,
  HAND_CARD_W,
  HAND_CARD_H,
  CHAR_ROW_GAP,
  ZONE_GAP,
  ROW_GAP,
  LEADER_GAP,
  SIDE_ZONE_GAP,
  CHAR_ROW_W,
  FIELD_W,
  FIELD_H,
  BOARD_CONTENT_H,
  MIN_HAND_BOARD_GAP,
  PLAYER_HAND_VIEWPORT_MARGIN,
  BOARD_CARD_W,
  BOARD_CARD_H,
  CARD_OFFSET_X,
  getViewportSize,
  type DragPayload,
} from "./constants";
import { HandLayer } from "./hand-layer";
import { DonCard, DonZone } from "./don-zone";
import { LifeZone } from "./life-zone";
import { DroppableCharSlot, PlayerFieldCard, OpponentFieldCard } from "./field-card";
import { MidZone } from "./mid-zone";

export interface BoardLayoutProps {
  me: PlayerState | null;
  opp: PlayerState | null;
  myIndex: 0 | 1 | null;
  turn: TurnState | null;
  cardDb: CardDb;
  isMyTurn: boolean;
  battlePhase: string | null;
  connectionStatus: string;
  activePrompt: {
    promptType: PromptType;
    options: PromptOptions;
  } | null;
  onAction: (action: GameAction) => void;
  onLeave: () => void;
  matchClosed: boolean;
}

export function BoardLayout({
  me,
  opp,
  myIndex,
  turn,
  cardDb,
  isMyTurn,
  battlePhase,
  connectionStatus,
  activePrompt,
  onAction,
  onLeave,
  matchClosed,
}: BoardLayoutProps) {
  const [viewport, setViewport] = useState(getViewportSize);

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

  /* ── Derived geometry ──────────────────────────────────────────── */

  const zone2Left = SQUARE + ZONE_GAP;
  const zone2Right = zone2Left + CHAR_ROW_W;

  const oppTop = 0;
  const oppLeaderTop = oppTop;
  const oppCharTop = oppTop + SQUARE + ROW_GAP;
  const midTop = oppTop + FIELD_H;
  const playerTop = midTop + MID_ZONE_H;
  const playerCharTop = playerTop;
  const playerLeaderTop = playerTop + SQUARE + ROW_GAP;

  const charSlotCenters = Array.from({ length: 5 }, (_, i) => ({
    left: zone2Left + i * (SQUARE + CHAR_ROW_GAP) + CARD_OFFSET_X,
  }));

  const leaderLeft = zone2Left + (CHAR_ROW_W - SQUARE) / 2 + CARD_OFFSET_X;
  const stgDonWidth = (CHAR_ROW_W - SQUARE - 2 * LEADER_GAP) / 2;

  /* ── Scale ─────────────────────────────────────────────────────── */

  const boardScale = Math.max(
    0,
    Math.min(
      1,
      viewport.width / FIELD_W,
      (viewport.height -
        PLAYER_HAND_VIEWPORT_MARGIN -
        2 * MIN_HAND_BOARD_GAP) /
        (BOARD_CONTENT_H + 2 * HAND_CARD_H),
    ),
  );

  const scaledBoardH = BOARD_CONTENT_H * boardScale;
  const scaledHandH = HAND_CARD_H * boardScale;
  const boardBottom =
    viewport.height -
    PLAYER_HAND_VIEWPORT_MARGIN -
    scaledHandH -
    MIN_HAND_BOARD_GAP;
  const boardTop = boardBottom - scaledBoardH;
  const playerHandTop = boardBottom + MIN_HAND_BOARD_GAP;

  /* ── Phase / battle state ──────────────────────────────────────── */

  const phase = turn?.phase ?? "";
  const inBattle = !!battlePhase;
  const canEndPhase = !matchClosed && isMyTurn && !inBattle;
  const canPass = !matchClosed && inBattle;

  /* ── Drag & drop ─────────────────────────────────────────────────── */

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const activeDragType = activeDrag?.type ?? null;
  const canInteract = isMyTurn && phase === "MAIN" && !inBattle && !matchClosed;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active.data.current as DragPayload);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const dragData = active.data.current as DragPayload;
    const dropData = over.data.current as Record<string, unknown>;

    if (dragData.type === "hand-card" && dropData.type === "character-slot") {
      onAction({
        type: "PLAY_CARD",
        cardInstanceId: dragData.card.instanceId,
        position: dropData.slotIndex as number,
      });
    } else if (
      dragData.type === "active-don" &&
      dropData.type === "don-target"
    ) {
      onAction({
        type: "ATTACH_DON",
        targetInstanceId: dropData.targetInstanceId as string,
        count: 1,
      });
    } else if (
      dragData.type === "attacker" &&
      dropData.type === "attack-target"
    ) {
      onAction({
        type: "DECLARE_ATTACK",
        attackerInstanceId: dragData.card.instanceId,
        targetInstanceId: dropData.targetInstanceId as string,
      });
    }
  }

  /* ── Status indicator ──────────────────────────────────────────── */

  const statusDot =
    connectionStatus === "connected"
      ? "bg-gb-accent-green"
      : connectionStatus === "connecting"
        ? "bg-gb-accent-amber"
        : "bg-gb-accent-red";

  const sideCardOffsetX = CARD_OFFSET_X;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
    <div className="relative h-full w-full overflow-hidden bg-gb-board">
      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <nav
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4"
        style={{
          height: NAVBAR_H,
          backgroundColor: "oklch(16% 0.008 245 / 0.92)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span className="text-xs font-bold tracking-widest text-gb-text-bright">
          OPTCG SIM
        </span>
        <div className="flex items-center gap-3">
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
          <button
            onClick={onLeave}
            className="px-2 py-1 text-xs text-gb-text-subtle hover:text-gb-text-bright transition-colors"
          >
            &larr; Lobbies
          </button>
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
          <HandLayer cards={opp?.hand ?? []} faceDown cardDb={cardDb} />
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
          <BoardCard
            card={opp && opp.trash.length > 0 ? opp.trash[0] : undefined}
            cardDb={cardDb}
            empty={!opp || opp.trash.length === 0}
            label="TRASH"
            count={opp && opp.trash.length > 1 ? opp.trash.length : undefined}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            style={{ position: "absolute", left: sideCardOffsetX, top: oppTop }}
          />
          <BoardCard
            cardDb={cardDb}
            sleeve
            label="DECK"
            count={opp?.deck.length}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            style={{ position: "absolute", left: sideCardOffsetX, top: oppTop + SQUARE + SIDE_ZONE_GAP }}
          />

          {/* Zone 2: Leader row — STG / LDR / DON */}
          {opp?.stage ? (
            <BoardCard
              card={opp.stage}
              cardDb={cardDb}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{ position: "absolute", left: zone2Left + (stgDonWidth - BOARD_CARD_W) / 2, top: oppLeaderTop }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="STG"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{ position: "absolute", left: zone2Left + (stgDonWidth - BOARD_CARD_W) / 2, top: oppLeaderTop }}
            />
          )}

          {opp?.leader ? (
            <OpponentFieldCard
              card={opp.leader}
              cardDb={cardDb}
              activeDragType={activeDragType}
              style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="LDR"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
            />
          )}

          <DonZone
            player={opp}
            style={{ left: zone2Right - stgDonWidth, top: oppLeaderTop, width: stgDonWidth, height: SQUARE }}
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
                style={{ position: "absolute", left: pos.left, top: oppCharTop }}
              />
            ) : (
              <BoardCard
                key={`opp-c${i}`}
                cardDb={cardDb}
                empty
                label={`C${i + 1}`}
                width={BOARD_CARD_W}
                height={BOARD_CARD_H}
                style={{ position: "absolute", left: pos.left, top: oppCharTop }}
              />
            );
          })}

          {/* Zone 1 (right): Life */}
          <LifeZone
            life={opp?.life ?? []}
            cardDb={cardDb}
            style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: oppTop }}
          />

          {/* ═══════════ MID ZONE ════════════════════════════════════ */}
          <MidZone
            top={midTop}
            isMyTurn={isMyTurn}
            turnNumber={turn?.number}
            phase={phase}
            battlePhase={battlePhase}
            canEndPhase={canEndPhase}
            canPass={canPass}
            matchClosed={matchClosed}
            activePrompt={activePrompt}
            onAction={onAction}
          />

          {/* ═══════════ PLAYER FIELD ═════════════════════════════════ */}

          {/* Zone 1 (left): Life */}
          <LifeZone
            life={me?.life ?? []}
            cardDb={cardDb}
            style={{ position: "absolute", left: sideCardOffsetX, top: playerTop }}
          />

          {/* Zone 2: Character row */}
          {charSlotCenters.map((pos, i) => {
            const char = me?.characters[i] ?? null;
            return char ? (
              <PlayerFieldCard
                key={`plr-c${i}`}
                card={char}
                cardDb={cardDb}
                activeDragType={activeDragType}
                canAttack={canInteract && char.state === "ACTIVE"}
                style={{ position: "absolute", left: pos.left, top: playerCharTop }}
              />
            ) : (
              <DroppableCharSlot
                key={`plr-c${i}`}
                slotIndex={i}
                label={`C${i + 1}`}
                cardDb={cardDb}
                activeDragType={activeDragType}
                style={{ position: "absolute", left: pos.left, top: playerCharTop }}
              />
            );
          })}

          {/* Zone 2: Leader row — DON / LDR / STG */}
          <DonZone
            player={me}
            enableDrag={canInteract}
            style={{ left: zone2Left, top: playerLeaderTop, width: stgDonWidth, height: SQUARE }}
          />

          {me?.leader ? (
            <PlayerFieldCard
              card={me.leader}
              cardDb={cardDb}
              activeDragType={activeDragType}
              canAttack={canInteract && me.leader.state === "ACTIVE"}
              style={{ position: "absolute", left: leaderLeft, top: playerLeaderTop }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="LDR"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{ position: "absolute", left: leaderLeft, top: playerLeaderTop }}
            />
          )}

          {me?.stage ? (
            <BoardCard
              card={me.stage}
              cardDb={cardDb}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{ position: "absolute", left: zone2Right - stgDonWidth + (stgDonWidth - BOARD_CARD_W) / 2, top: playerLeaderTop }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="STG"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{ position: "absolute", left: zone2Right - stgDonWidth + (stgDonWidth - BOARD_CARD_W) / 2, top: playerLeaderTop }}
            />
          )}

          {/* Zone 3 (right): Deck + Trash */}
          <BoardCard
            cardDb={cardDb}
            sleeve
            label="DECK"
            count={me?.deck.length}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            style={{ position: "absolute", left: FIELD_W - SQUARE + sideCardOffsetX, top: playerTop }}
          />
          <BoardCard
            card={me && me.trash.length > 0 ? me.trash[0] : undefined}
            cardDb={cardDb}
            empty={!me || me.trash.length === 0}
            label="TRASH"
            count={me && me.trash.length > 1 ? me.trash.length : undefined}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
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
            enableDrag={canInteract}
          />
        </div>
      </div>
    </div>

    <DragOverlay dropAnimation={null}>
      {activeDrag?.type === "hand-card" && (
        <BoardCard
          card={activeDrag.card}
          cardDb={cardDb}
          width={HAND_CARD_W * boardScale}
          height={HAND_CARD_H * boardScale}
        />
      )}
      {activeDrag?.type === "active-don" && (
        <div
          style={{
            transform: `scale(${boardScale})`,
            transformOrigin: "top left",
          }}
        >
          <DonCard />
        </div>
      )}
      {activeDrag?.type === "attacker" && (
        <BoardCard
          card={activeDrag.card}
          cardDb={cardDb}
          width={BOARD_CARD_W * boardScale}
          height={BOARD_CARD_H * boardScale}
        />
      )}
    </DragOverlay>
    </DndContext>
  );
}
