"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import type {
  CardData,
  CardInstance,
  DonInstance,
  GameAction,
  LifeCard,
  PlayerState,
  PromptOptions,
  PromptType,
  TurnState,
} from "@shared/game-types";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { BoardCard } from "./board-card";
import { cn } from "@/lib/utils";

type CardDb = Record<string, CardData>;

/* ─── Drag & Drop payload types ───────────────────────────────────── */

interface HandCardDrag {
  type: "hand-card";
  card: CardInstance;
}

interface ActiveDonDrag {
  type: "active-don";
  don: DonInstance;
}

interface AttackerDrag {
  type: "attacker";
  card: CardInstance;
}

type DragPayload = HandCardDrag | ActiveDonDrag | AttackerDrag;

/* ─── Geometry constants (reference: GAME-BOARD-LAYOUT-REFERENCE.md) ── */

const NAVBAR_H = 48;
const SQUARE = 112;
const HAND_CARD_W = 84;
const HAND_CARD_H = 118;
const MID_ZONE_H = 64;
const CHAR_ROW_GAP = 10;
const ZONE_GAP = 32;
const ROW_GAP = 20;
const LEADER_GAP = 10;
const SIDE_ZONE_GAP = 12;

const CHAR_ROW_W = 5 * SQUARE + 4 * CHAR_ROW_GAP;
const FIELD_W = SQUARE + ZONE_GAP + CHAR_ROW_W + ZONE_GAP + SQUARE;
const FIELD_H = SQUARE + ROW_GAP + SQUARE;
const BOARD_CONTENT_H = FIELD_H + MID_ZONE_H + FIELD_H;

const MIN_HAND_BOARD_GAP = 30;
const PLAYER_HAND_VIEWPORT_MARGIN = 20;

// Card dimensions within slots — OPTCG card ratio (~63:88)
const BOARD_CARD_W = 80;
const BOARD_CARD_H = SQUARE;
const CARD_OFFSET_X = (SQUARE - BOARD_CARD_W) / 2;

/* ─── Viewport measurement ────────────────────────────────────────── */

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: FIELD_W, height: BOARD_CONTENT_H + 2 * HAND_CARD_H };
  }
  const vv = window.visualViewport;
  if (vv) return { width: vv.width, height: vv.height };
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
}

/* ─── Props ────────────────────────────────────────────────────────── */

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

/* ─── Mid-zone button ─────────────────────────────────────────────── */

function MidZoneBtn({
  children,
  onClick,
  accent,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-xs font-bold rounded cursor-pointer border transition-colors duration-100",
        accent
          ? "bg-gb-accent-green/15 text-gb-accent-green border-gb-accent-green/30 hover:border-gb-accent-green/50"
          : danger
            ? "text-gb-accent-red border-transparent hover:border-gb-accent-red/30"
            : "bg-gb-surface-raised text-gb-text border-gb-border-strong hover:border-gb-text-muted",
      )}
    >
      {children}
    </button>
  );
}

/* ─── Hand layer ──────────────────────────────────────────────────── */

function DraggableHandCard({
  card,
  cardDb,
  width,
  height,
  disabled,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  width: number;
  height: number;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hand-${card.instanceId}`,
    data: { type: "hand-card", card } satisfies HandCardDrag,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        opacity: isDragging ? 0.3 : 1,
        cursor: disabled ? "default" : "grab",
      }}
    >
      <BoardCard card={card} cardDb={cardDb} width={width} height={height} />
    </div>
  );
}

function HandLayer({
  cards,
  faceDown,
  cardDb,
  enableDrag,
}: {
  cards: CardInstance[];
  faceDown?: boolean;
  cardDb: CardDb;
  enableDrag?: boolean;
}) {
  const count = cards.length;
  if (count === 0) return null;

  const maxWidth = FIELD_W - 60;
  const totalCardsW = count * HAND_CARD_W;
  const rawGap = count > 1 ? (maxWidth - totalCardsW) / (count - 1) : 0;
  const gap = Math.min(12, rawGap);

  return (
    <div className="flex items-center pointer-events-auto">
      {cards.map((card, i) =>
        faceDown ? (
          <BoardCard
            key={card.instanceId}
            cardDb={cardDb}
            faceDown
            width={HAND_CARD_W}
            height={HAND_CARD_H}
            style={i > 0 ? { marginLeft: gap } : undefined}
          />
        ) : (
          <DraggableHandCard
            key={card.instanceId}
            card={card}
            cardDb={cardDb}
            disabled={!enableDrag}
            width={HAND_CARD_W}
            height={HAND_CARD_H}
            style={i > 0 ? { marginLeft: gap } : undefined}
          />
        ),
      )}
    </div>
  );
}

/* ─── DON!! card constants (from Figma: Board Design / PlayerDONZone) ─ */

const DON_CARD_W = 50;
const DON_CARD_H = 70;
const DON_ACTIVE_OVERLAP = 35;
const DON_RESTED_OVERLAP = 60;
const DON_GROUP_GAP = -20;
const DON_IMG = "/images/DON/zoro.jpg";
const DON_SHADOW = "3px 3px 0px 0px rgba(0, 0, 0, 0.25)";

/* ─── Single DON!! card ────────────────────────────────────────────── */

function DonCard({ rested }: { rested?: boolean }) {
  const card = (
    <div
      className="rounded shrink-0 overflow-hidden"
      style={{
        width: DON_CARD_W,
        height: DON_CARD_H,
        boxShadow: DON_SHADOW,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DON_IMG}
        alt="DON!!"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );

  if (rested) {
    return (
      <div
        className="relative shrink-0"
        style={{ width: DON_CARD_H, height: DON_CARD_W }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: "translate(-50%, -50%) rotate(90deg)" }}
        >
          {card}
        </div>
      </div>
    );
  }

  return card;
}

/* ─── Draggable DON!! card ─────────────────────────────────────────── */

function DraggableDonCard({
  don,
  index,
  disabled,
}: {
  don: DonInstance;
  index: number;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `don-${don.instanceId}`,
    data: { type: "active-don", don } satisfies ActiveDonDrag,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        marginLeft: index > 0 ? -DON_ACTIVE_OVERLAP : 0,
        zIndex: index,
        opacity: isDragging ? 0.3 : 1,
        cursor: disabled ? "default" : "grab",
      }}
    >
      <DonCard />
    </div>
  );
}

/* ─── DON!! zone display ──────────────────────────────────────────── */

function DonZone({
  player,
  style,
  className,
  enableDrag,
}: {
  player: PlayerState | null;
  style: React.CSSProperties;
  className?: string;
  enableDrag?: boolean;
}) {
  const activeDon =
    player?.donCostArea.filter((d) => d.state === "ACTIVE") ?? [];
  const restedDon =
    player?.donCostArea.filter((d) => d.state === "RESTED") ?? [];
  const hasAny = activeDon.length > 0 || restedDon.length > 0;

  return (
    <div
      className={cn(
        "absolute flex items-center rounded-md border border-gb-border-strong/30",
        !hasAny && "justify-center",
        className,
      )}
      style={style}
    >
      {!hasAny && (
        <span className="text-xs font-bold text-gb-accent-amber/40 leading-none select-none">
          DON!!
        </span>
      )}

      {activeDon.length > 0 && (
        <div className="flex items-center">
          {activeDon.map((don, i) =>
            enableDrag ? (
              <DraggableDonCard key={don.instanceId} don={don} index={i} />
            ) : (
              <div
                key={don.instanceId}
                style={{
                  marginLeft: i > 0 ? -DON_ACTIVE_OVERLAP : 0,
                  zIndex: i,
                }}
              >
                <DonCard />
              </div>
            ),
          )}
        </div>
      )}

      {restedDon.length > 0 && (
        <div
          className="flex items-center"
          style={{
            marginLeft: activeDon.length > 0 ? DON_GROUP_GAP : 0,
          }}
        >
          {restedDon.map((don, i) => (
            <div
              key={don.instanceId}
              style={{
                marginLeft: i > 0 ? -DON_RESTED_OVERLAP : 0,
                zIndex: i,
              }}
            >
              <DonCard rested />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Life zone — vertically stacked card sleeves ─────────────────── */

const LIFE_STACK_OFFSET = 20;

function LifeZone({
  life,
  cardDb,
  style,
}: {
  life: LifeCard[];
  cardDb: CardDb;
  style: React.CSSProperties;
}) {
  const count = life.length;

  if (count === 0) {
    return (
      <BoardCard
        cardDb={cardDb}
        empty
        label="LIFE"
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
        style={style}
      />
    );
  }

  return (
    <div style={style}>
      {life.map((card, i) => (
        <BoardCard
          key={card.instanceId}
          cardDb={cardDb}
          sleeve
          count={i === 0 ? count : undefined}
          width={BOARD_CARD_W}
          height={BOARD_CARD_H}
          style={{
            position: "absolute",
            left: 0,
            top: i * LIFE_STACK_OFFSET,
            zIndex: count - i,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Droppable character slot (empty, accepts hand cards) ─────────── */

function DroppableCharSlot({
  slotIndex,
  label,
  cardDb,
  activeDragType,
  style,
}: {
  slotIndex: number;
  label: string;
  cardDb: CardDb;
  activeDragType: string | null;
  style: React.CSSProperties;
}) {
  const accepts = activeDragType === "hand-card";
  const { setNodeRef, isOver } = useDroppable({
    id: `char-slot-${slotIndex}`,
    data: { type: "character-slot", slotIndex },
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md transition-shadow",
        accepts && "ring-2 ring-gb-accent-blue/30",
        isOver && accepts && "ring-2 ring-gb-accent-green",
      )}
    >
      <BoardCard
        cardDb={cardDb}
        empty
        label={label}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
      />
    </div>
  );
}

/* ─── Player field card (draggable for attack + droppable for DON) ── */

function PlayerFieldCard({
  card,
  cardDb,
  activeDragType,
  canAttack,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  canAttack: boolean;
  style: React.CSSProperties;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `attacker-${card.instanceId}`,
    data: { type: "attacker", card } satisfies AttackerDrag,
    disabled: !canAttack,
  });

  const acceptsDon = activeDragType === "active-don";
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `don-target-${card.instanceId}`,
    data: { type: "don-target", targetInstanceId: card.instanceId },
  });

  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        opacity: isDragging ? 0.3 : 1,
        cursor: canAttack ? "grab" : "default",
      }}
      className={cn(
        "rounded-md",
        acceptsDon && "ring-2 ring-gb-accent-amber/30",
        isOver && acceptsDon && "ring-2 ring-gb-accent-amber",
      )}
    >
      <BoardCard
        card={card}
        cardDb={cardDb}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
      />
    </div>
  );
}

/* ─── Opponent field card (droppable for attack targeting) ──────────── */

function OpponentFieldCard({
  card,
  cardDb,
  activeDragType,
  style,
}: {
  card: CardInstance;
  cardDb: CardDb;
  activeDragType: string | null;
  style: React.CSSProperties;
}) {
  const accepts = activeDragType === "attacker";
  const { setNodeRef, isOver } = useDroppable({
    id: `attack-target-${card.instanceId}`,
    data: { type: "attack-target", targetInstanceId: card.instanceId },
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md",
        accepts && "ring-2 ring-gb-accent-red/30",
        isOver && accepts && "ring-2 ring-gb-accent-red",
      )}
    >
      <BoardCard
        card={card}
        cardDb={cardDb}
        width={BOARD_CARD_W}
        height={BOARD_CARD_H}
      />
    </div>
  );
}

/* ─── Board Layout ─────────────────────────────────────────────────── */

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

  /* ── Side-zone centering: cards are 80px wide within 112px column ── */

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
          {/* ═══════════════ OPPONENT FIELD ═══════════════════════════ */}

          {/* Zone 3 (left): Trash + Deck */}
          <BoardCard
            card={opp && opp.trash.length > 0 ? opp.trash[0] : undefined}
            cardDb={cardDb}
            empty={!opp || opp.trash.length === 0}
            label="TRASH"
            count={opp && opp.trash.length > 1 ? opp.trash.length : undefined}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            style={{
              position: "absolute",
              left: sideCardOffsetX,
              top: oppTop,
            }}
          />
          <BoardCard
            cardDb={cardDb}
            sleeve
            label="DECK"
            count={opp?.deck.length}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            style={{
              position: "absolute",
              left: sideCardOffsetX,
              top: oppTop + SQUARE + SIDE_ZONE_GAP,
            }}
          />

          {/* Zone 2: Leader row — STG / LDR / DON */}
          {opp?.stage ? (
            <BoardCard
              card={opp.stage}
              cardDb={cardDb}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{
                position: "absolute",
                left: zone2Left + (stgDonWidth - BOARD_CARD_W) / 2,
                top: oppLeaderTop,
              }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="STG"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{
                position: "absolute",
                left: zone2Left + (stgDonWidth - BOARD_CARD_W) / 2,
                top: oppLeaderTop,
              }}
            />
          )}

          {opp?.leader ? (
            <OpponentFieldCard
              card={opp.leader}
              cardDb={cardDb}
              activeDragType={activeDragType}
              style={{
                position: "absolute",
                left: leaderLeft,
                top: oppLeaderTop,
              }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="LDR"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{
                position: "absolute",
                left: leaderLeft,
                top: oppLeaderTop,
              }}
            />
          )}

          <DonZone
            player={opp}
            style={{
              left: zone2Right - stgDonWidth,
              top: oppLeaderTop,
              width: stgDonWidth,
              height: SQUARE,
            }}
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
                style={{
                  position: "absolute",
                  left: pos.left,
                  top: oppCharTop,
                }}
              />
            ) : (
              <BoardCard
                key={`opp-c${i}`}
                cardDb={cardDb}
                empty
                label={`C${i + 1}`}
                width={BOARD_CARD_W}
                height={BOARD_CARD_H}
                style={{
                  position: "absolute",
                  left: pos.left,
                  top: oppCharTop,
                }}
              />
            );
          })}

          {/* Zone 1 (right): Life */}
          <LifeZone
            life={opp?.life ?? []}
            cardDb={cardDb}
            style={{
              position: "absolute",
              left: FIELD_W - SQUARE + sideCardOffsetX,
              top: oppTop,
            }}
          />

          {/* ═══════════════ MID ZONE ════════════════════════════════ */}
          <div
            className="absolute flex items-center justify-between px-4 bg-gb-board-dark"
            style={{
              left: 0,
              top: midTop,
              width: FIELD_W,
              height: MID_ZONE_H,
            }}
          >
            {/* Left: turn info */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  isMyTurn ? "bg-gb-accent-green" : "bg-gb-accent-amber",
                )}
              />
              <span className="text-xs text-gb-text-bright font-bold">
                T{turn?.number ?? "—"}
              </span>
              <span className="text-xs text-gb-accent-blue font-bold">
                {phase}
              </span>
              {battlePhase && (
                <span className="text-xs text-gb-accent-purple font-bold">
                  &rsaquo; {battlePhase.replace(/_/g, " ")}
                </span>
              )}
              <span
                className={cn(
                  "text-xs font-bold",
                  isMyTurn ? "text-gb-accent-green" : "text-gb-text-dim",
                )}
              >
                {isMyTurn ? "YOUR TURN" : "OPP TURN"}
              </span>
            </div>

            {/* Center: active prompt */}
            {activePrompt && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gb-accent-amber font-bold">
                  &#x26A1;{" "}
                  {activePrompt.promptType.replace(/_/g, " ")}
                </span>
                {activePrompt.promptType === "REVEAL_TRIGGER" && (
                  <>
                    <MidZoneBtn
                      onClick={() =>
                        onAction({ type: "REVEAL_TRIGGER", reveal: true })
                      }
                    >
                      Reveal
                    </MidZoneBtn>
                    <MidZoneBtn
                      onClick={() =>
                        onAction({ type: "REVEAL_TRIGGER", reveal: false })
                      }
                    >
                      Add to Hand
                    </MidZoneBtn>
                  </>
                )}
                {activePrompt.options.optional && (
                  <MidZoneBtn onClick={() => onAction({ type: "PASS" })}>
                    Skip
                  </MidZoneBtn>
                )}
              </div>
            )}

            {/* Spacer when no prompt */}
            {!activePrompt && <div className="flex-1" />}

            {/* Right: phase actions */}
            <div className="flex items-center gap-2 shrink-0">
              {canEndPhase && (
                <MidZoneBtn
                  accent
                  onClick={() => onAction({ type: "ADVANCE_PHASE" })}
                >
                  End {phase} &rarr;
                </MidZoneBtn>
              )}
              {canPass && (
                <MidZoneBtn onClick={() => onAction({ type: "PASS" })}>
                  Pass
                </MidZoneBtn>
              )}
              {!isMyTurn && !inBattle && (
                <span className="text-xs text-gb-text-dim italic">
                  Waiting&hellip;
                </span>
              )}
              {!matchClosed && (
                <MidZoneBtn
                  danger
                  onClick={() => onAction({ type: "CONCEDE" })}
                >
                  Concede
                </MidZoneBtn>
              )}
            </div>
          </div>

          {/* ═══════════════ PLAYER FIELD ═════════════════════════════ */}

          {/* Zone 1 (left): Life */}
          <LifeZone
            life={me?.life ?? []}
            cardDb={cardDb}
            style={{
              position: "absolute",
              left: sideCardOffsetX,
              top: playerTop,
            }}
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
                style={{
                  position: "absolute",
                  left: pos.left,
                  top: playerCharTop,
                }}
              />
            ) : (
              <DroppableCharSlot
                key={`plr-c${i}`}
                slotIndex={i}
                label={`C${i + 1}`}
                cardDb={cardDb}
                activeDragType={activeDragType}
                style={{
                  position: "absolute",
                  left: pos.left,
                  top: playerCharTop,
                }}
              />
            );
          })}

          {/* Zone 2: Leader row — DON / LDR / STG */}
          <DonZone
            player={me}
            enableDrag={canInteract}
            style={{
              left: zone2Left,
              top: playerLeaderTop,
              width: stgDonWidth,
              height: SQUARE,
            }}
          />

          {me?.leader ? (
            <PlayerFieldCard
              card={me.leader}
              cardDb={cardDb}
              activeDragType={activeDragType}
              canAttack={canInteract && me.leader.state === "ACTIVE"}
              style={{
                position: "absolute",
                left: leaderLeft,
                top: playerLeaderTop,
              }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="LDR"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{
                position: "absolute",
                left: leaderLeft,
                top: playerLeaderTop,
              }}
            />
          )}

          {me?.stage ? (
            <BoardCard
              card={me.stage}
              cardDb={cardDb}
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{
                position: "absolute",
                left:
                  zone2Right - stgDonWidth + (stgDonWidth - BOARD_CARD_W) / 2,
                top: playerLeaderTop,
              }}
            />
          ) : (
            <BoardCard
              cardDb={cardDb}
              empty
              label="STG"
              width={BOARD_CARD_W}
              height={BOARD_CARD_H}
              style={{
                position: "absolute",
                left:
                  zone2Right - stgDonWidth + (stgDonWidth - BOARD_CARD_W) / 2,
                top: playerLeaderTop,
              }}
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
            style={{
              position: "absolute",
              left: FIELD_W - SQUARE + sideCardOffsetX,
              top: playerTop,
            }}
          />
          <BoardCard
            card={me && me.trash.length > 0 ? me.trash[0] : undefined}
            cardDb={cardDb}
            empty={!me || me.trash.length === 0}
            label="TRASH"
            count={me && me.trash.length > 1 ? me.trash.length : undefined}
            width={BOARD_CARD_W}
            height={BOARD_CARD_H}
            style={{
              position: "absolute",
              left: FIELD_W - SQUARE + sideCardOffsetX,
              top: playerTop + SQUARE + SIDE_ZONE_GAP,
            }}
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
