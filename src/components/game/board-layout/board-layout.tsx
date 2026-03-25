"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CardDb,
  CardInstance,
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
  MID_ZONE_H,
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
import { MidZone, type BattleInfo } from "./mid-zone";
import { ArrangeTopCardsModal } from "../arrange-top-cards-modal";
import { SelectTargetModal } from "../select-target-modal";
import { PlayerChoiceModal } from "../player-choice-modal";
import { DroppableTrashZone } from "./trash-zone";

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

function NavMenu({
  onLeave,
  onConcede,
  matchClosed,
}: {
  onLeave: () => void;
  onConcede: () => void;
  matchClosed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open, close]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer",
          open
            ? "bg-gb-surface-raised text-gb-text-bright"
            : "text-gb-text-subtle hover:text-gb-text-bright",
        )}
        aria-label="Game menu"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
          <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-gb-border-strong bg-gb-surface py-1 shadow-lg z-50">
          <button
            onClick={() => {
              close();
              onLeave();
            }}
            className="w-full text-left px-3 py-2 text-xs text-gb-text hover:bg-gb-surface-raised transition-colors cursor-pointer"
          >
            &larr; Back to Lobbies
          </button>
          {!matchClosed && (
            <button
              onClick={() => {
                close();
                onConcede();
              }}
              className="w-full text-left px-3 py-2 text-xs text-gb-accent-red hover:bg-gb-surface-raised transition-colors cursor-pointer"
            >
              Concede
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  const [isPromptHidden, setIsPromptHidden] = useState(false);

  // Reset hidden state whenever a new prompt arrives
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
  const canEndPhase = !matchClosed && isMyTurn && !inBattle && phase === "MAIN";

  /* ── Battle interaction state ─────────────────────────────────────── */

  const isDefender = !isMyTurn && myIndex !== null && turn?.activePlayerIndex !== myIndex;
  const canPass = !matchClosed && isDefender && battlePhase === "COUNTER_STEP";
  const canDragCounter = !matchClosed && isDefender && battlePhase === "COUNTER_STEP";
  const inBlockStep = !matchClosed && isDefender && battlePhase === "BLOCK_STEP";
  const battle = turn?.battle ?? null;

  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBlockerId(null);
  }, [battlePhase]);

  const battleInfo: BattleInfo | null = useMemo(() => {
    if (!battle || !me || !opp) return null;
    const allCards: (CardInstance | null)[] = [
      me.leader, opp.leader,
      ...me.characters, ...opp.characters,
    ];
    const attackerCard = allCards.find((c) => c?.instanceId === battle.attackerInstanceId);
    const defenderCard = allCards.find((c) => c?.instanceId === battle.targetInstanceId);
    return {
      attackerName: attackerCard ? cardDb[attackerCard.cardId]?.name ?? "?" : "?",
      attackerPower: battle.attackerPower,
      defenderName: defenderCard ? cardDb[defenderCard.cardId]?.name ?? "?" : "?",
      defenderPower: battle.defenderPower,
      counterPowerAdded: battle.counterPowerAdded,
      battleSubPhase: battlePhase ?? "",
    };
  }, [battle, me, opp, cardDb, battlePhase]);

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
    } else if (
      dragData.type === "hand-card" &&
      dropData.type === "counter-trash" &&
      battle
    ) {
      const cardData = cardDb[dragData.card.cardId];
      if (cardData?.type === "Character" && cardData.counter != null && cardData.counter > 0) {
        onAction({
          type: "USE_COUNTER",
          cardInstanceId: dragData.card.instanceId,
          counterTargetInstanceId: battle.targetInstanceId,
        });
      } else if (cardData?.type === "Event" && cardData.effectText?.includes("[Counter]")) {
        onAction({
          type: "USE_COUNTER_EVENT",
          cardInstanceId: dragData.card.instanceId,
          counterTargetInstanceId: battle.targetInstanceId,
        });
      }
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
        className="absolute inset-x-0 top-0 z-30 flex items-center px-4 bg-gb-navbar"
        style={{ height: NAVBAR_H }}
      >
        <span className="text-xs font-bold tracking-widest text-gb-text-bright shrink-0">
          OPTCG SIM
        </span>

        {/* Center: turn info */}
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
              ? isDefender ? "You are blocking" : "Opponent is blocking"
              : battlePhase === "COUNTER_STEP"
                ? isDefender ? "You are countering" : "Opponent is countering"
                : phase}
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
            phase={phase}
            canEndPhase={canEndPhase}
            canPass={canPass}
            inBattle={inBattle}
            activePrompt={activePrompt}
            battleInfo={battleInfo}
            blockerMode={inBlockStep ? {
              selectedBlockerId,
              onBlock: () => {
                if (selectedBlockerId) {
                  onAction({ type: "DECLARE_BLOCKER", blockerInstanceId: selectedBlockerId });
                  setSelectedBlockerId(null);
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
                  style={{ position: "absolute", left: pos.left, top: playerCharTop }}
                />
              );
            }
            const charData = cardDb[char.cardId];
            const isBlockerEligible = inBlockStep && char.state === "ACTIVE" && !!charData?.keywords?.blocker;
            return (
              <PlayerFieldCard
                key={`plr-c${i}`}
                card={char}
                cardDb={cardDb}
                activeDragType={activeDragType}
                canAttack={canInteract && char.state === "ACTIVE"}
                blockerSelectable={isBlockerEligible}
                selected={selectedBlockerId === char.instanceId}
                onSelect={isBlockerEligible ? () => setSelectedBlockerId(char.instanceId) : undefined}
                onAction={onAction}
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
              onAction={onAction}
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
          <DroppableTrashZone
            trash={me?.trash ?? []}
            cardDb={cardDb}
            activeDrag={activeDrag}
            battleSubPhase={turn?.battleSubPhase ?? null}
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
            enableDrag={canInteract || canDragCounter}
            counterMode={canDragCounter}
          />
        </div>
      </div>

      {/* ── Interruption Modals ─────────────────────────────────────── */}
      {activePrompt?.promptType === "ARRANGE_TOP_CARDS" &&
        activePrompt.options.cards &&
        activePrompt.options.cards.length > 0 && (
          <ArrangeTopCardsModal
            cards={activePrompt.options.cards}
            effectDescription={activePrompt.options.effectDescription ?? "Look at the top cards of your deck"}
            canSendToBottom={activePrompt.options.canSendToBottom ?? true}
            cardDb={cardDb}
            isHidden={isPromptHidden}
            onHide={() => setIsPromptHidden(true)}
            onAction={onAction}
          />
        )}

      {activePrompt?.promptType === "SELECT_TARGET" &&
        activePrompt.options.cards &&
        activePrompt.options.cards.length > 0 && (
          <SelectTargetModal
            cards={activePrompt.options.cards}
            validTargets={activePrompt.options.validTargets ?? activePrompt.options.cards.map((c) => c.instanceId)}
            effectDescription={activePrompt.options.effectDescription ?? "Select a target"}
            countMin={activePrompt.options.countMin ?? 1}
            countMax={activePrompt.options.countMax ?? 1}
            ctaLabel={activePrompt.options.ctaLabel ?? "Confirm Selection"}
            cardDb={cardDb}
            isHidden={isPromptHidden}
            onHide={() => setIsPromptHidden(true)}
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
            onHide={() => setIsPromptHidden(true)}
            onAction={onAction}
          />
        )}
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
