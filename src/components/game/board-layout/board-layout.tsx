"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  ActiveEffect,
  CardDb,
  GameAction,
  GameEvent,
  PlayerState,
  PromptOptions,
  TurnState,
} from "@shared/game-types";
import { DndContext, MeasuringStrategy } from "@dnd-kit/core";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui";
import {
  NAVBAR_H,
  HAND_CARD_H,
  FIELD_W,
  BOARD_CONTENT_H,
} from "./constants";
import { midTop, computeBoardScaling } from "./board-geometry";
import { boardCollisionDetection } from "./board-collision";
import { useHandOrder, useHiddenHandOrder } from "@/hooks/use-hand-order";
import { useBattleState } from "./use-battle-state";
import { BoardModals } from "./board-modals";
import { HandLayer } from "./hand-layer";
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
import type {
  AcceptedGameUpdate,
  ActionRejection,
} from "@/hooks/use-game-ws";
import { ActionFeedbackProvider } from "./action-feedback";
import { useCardSpotlight } from "@/hooks/use-card-spotlight";
import { SpotlightOverlay } from "../spotlight-overlay";
import { useBoardDragState } from "./use-board-drag-state";
import { BoardDragOverlay } from "./board-drag-overlay";
import { useBoardModalRouting } from "./use-board-modal-routing";
import { useRedistributionState } from "./use-redistribution-state";

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
  actionRejection?: ActionRejection | null;
  acceptedUpdate?: AcceptedGameUpdate | null;
  promptRespondingPlayer?: 0 | 1 | null;
  /** Suppresses board-driven user input. Default `"full"` (production game).
   *  `"spectator"` and `"responseOnly"` are sandbox-only modes (OPT-290) that
   *  disable drag and right-click menus while leaving prompt modals usable. */
  interactionMode?: InteractionMode;
  /** Design-canvas size supplied by the parent `<ScaledBoard>` (via `<Board>`).
   *  BoardLayout authors against this canvas; `<ScaledBoard>` owns the
   *  viewport-fit transform on top. Required — BoardLayout must be rendered
   *  inside a `<ScaledBoard>`. */
  viewportSize: { width: number; height: number };
  /** Scale factor applied by the ancestor `<ScaledBoard>` transform. The
   *  dnd-kit `<DragOverlay>` portals to `document.body`, escaping that
   *  ancestor transform — so to render dragged cards at the same on-screen
   *  size as on-board cards, the overlay multiplies its inner `boardScale`
   *  by this value. */
  outerScale: number;
}

export function BoardLayout(props: BoardLayoutProps) {
  const interactionMode = props.interactionMode ?? "full";
  return (
    <ZonePositionProvider>
      <ActiveEffectsProvider value={props.activeEffects}>
        <ActionFeedbackProvider rejection={props.actionRejection ?? null}>
          <InteractionModeProvider value={interactionMode}>
            <BoardLayoutInner {...props} interactionMode={interactionMode} />
          </InteractionModeProvider>
        </ActionFeedbackProvider>
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
  actionRejection = null,
  acceptedUpdate = null,
  promptRespondingPlayer = null,
  onAction,
  onLeave,
  matchClosed,
  canUndo,
  interactionMode = "full",
  viewportSize,
  outerScale,
}: BoardLayoutProps & { interactionMode?: InteractionMode }) {
  const dndDisabled = interactionMode !== "full";
  const zoneRegistry = useZonePosition();
  const viewport = viewportSize;
  const spotlight = useCardSpotlight({
    eventLog,
    acceptedUpdate,
    myIndex,
    promptRespondingPlayer,
  });
  const dispatchBoardAction = useCallback(
    (action: GameAction) => {
      if (!spotlight.isBlockingPrompt) onAction(action);
    },
    [onAction, spotlight.isBlockingPrompt]
  );
  const modalRouting = useBoardModalRouting({
    activePrompt,
    promptBlocked: spotlight.isBlockingPrompt,
    me,
    opp,
    cardDb,
    onAction: dispatchBoardAction,
  });
  const boardPrompt = modalRouting.prompt;

  const redistribution = useRedistributionState(boardPrompt);

  /* ── Derived state from extracted hooks ───────────────────────────── */

  const { boardScale, boardTop, playerHandTop } = computeBoardScaling(viewport);

  const bs = useBattleState(me, opp, myIndex, turn, cardDb, isMyTurn, battlePhase, matchClosed);

  const { orderedHand: playerOrderedHand, reorder: reorderPlayerHand } = useHandOrder(
    me?.hand ?? [],
  );
  const opponentOrderedHand = useHiddenHandOrder(opp?.hand ?? []);

  const drag = useBoardDragState({
    cardDb,
    battle: bs.battle,
    onAction: dispatchBoardAction,
    onRedistributeDrop: redistribution.handleDrop,
    onHandReorder: reorderPlayerHand,
    disabled:
      dndDisabled ||
      modalRouting.targetSelectionActive ||
      spotlight.isBlockingPrompt,
    boardScale,
    outerScale,
  });

  const reducedMotion = useReducedMotion();

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
    drag.activeDrag !== null,
    zoneRegistry,
    spotlight.presentation,
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

  // Hold the server-confirmed top/count for every stacked pile until its
  // travel or transform presentation completes. Count-only transforms carry
  // an aggregated arrivalCount so one fizzle can still materialize +N cards.
  const pileArrivingCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transition of cardAnimations) {
      if (!/-(deck|trash|life)$/.test(transition.toZoneKey)) continue;
      counts.set(
        transition.toZoneKey,
        (counts.get(transition.toZoneKey) ?? 0) + (transition.arrivalCount ?? 1),
      );
    }
    return counts;
  }, [cardAnimations]);

  const mergedDonCountAdjustments = useMemo(() => {
    if (!inFlightDonAdjustByCard && !redistribution.donCountAdjustments) return undefined;
    const out = new Map<string, number>();
    if (redistribution.donCountAdjustments) {
      for (const [k, v] of redistribution.donCountAdjustments) out.set(k, v);
    }
    if (inFlightDonAdjustByCard) {
      for (const [k, v] of inFlightDonAdjustByCard) {
        out.set(k, (out.get(k) ?? 0) + v);
      }
    }
    return out.size > 0 ? out : undefined;
  }, [redistribution.donCountAdjustments, inFlightDonAdjustByCard]);

  const playerHandAnim = useHandAnimationState(cardAnimations, playerOrderedHand, "p-hand");
  const oppHandAnim = useHandAnimationState(cardAnimations, opponentOrderedHand, "o-hand");

  /* ── Sleeve/DON URLs per player index ────────────────────────── */

  const sleeveUrls: [string | null, string | null] = myIndex === 0
    ? [me?.sleeveUrl ?? null, opp?.sleeveUrl ?? null]
    : [opp?.sleeveUrl ?? null, me?.sleeveUrl ?? null];

  const donArtUrls: [string | null, string | null] = myIndex === 0
    ? [me?.donArtUrl ?? null, opp?.donArtUrl ?? null]
    : [opp?.donArtUrl ?? null, me?.donArtUrl ?? null];

  /* ── Refresh phase stagger detection ────────────────────────── */

  const prevPhaseRef = useRef(turn?.phase);
  const [refreshWaveTick, bumpRefreshWaveTick] = useReducer((tick: number) => tick + 1, 0);
  const refreshWave = refreshWaveTick % 2 === 1;

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = turn?.phase;
    if (!reducedMotion && prevPhase === "REFRESH" && turn?.phase === "DRAW") {
      bumpRefreshWaveTick();
      const timer = setTimeout(() => bumpRefreshWaveTick(), 500);
      return () => clearTimeout(timer);
    }
  }, [turn?.phase, reducedMotion]);

  return (
    <TooltipProvider delayDuration={0} disableHoverableContent>
    <DndContext
      sensors={drag.sensors}
      accessibility={drag.accessibility}
      collisionDetection={boardCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={drag.handleDragStart}
      onDragMove={drag.handleDragMove}
      onDragEnd={drag.handleDragEnd}
      onDragCancel={drag.handleDragCancel}
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
            // CSS `zoom` (not `transform: scale`) so descendants lay out at the
            // final pixel size — `<img>` rasterization samples the full-res
            // source instead of bitmap-stretching the cached layer texture
            // when the ancestor scale is >1 on large monitors.
            zoom: boardScale,
          }}
        >
          <HandLayer cards={opponentOrderedHand} faceDown cardDb={cardDb} zoneKey="o-hand" inFlightInstanceIds={oppHandAnim.inFlightInstanceIds} sleeveUrl={opp?.sleeveUrl} />
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
            zoom: boardScale,
          }}
        >
          <OpponentField
            opp={opp}
            cardDb={cardDb}
            activeDragType={drag.activeDragType}
            refreshWave={refreshWave}
            onPreviewZone={modalRouting.openZonePreview}
            attackerInstanceId={attackerInstanceId}
            defenderInstanceId={defenderInstanceId}
            counterPulseIds={counterPulseIds}
            donCountAdjustments={inFlightDonAdjustByCard ?? undefined}
            pileArrivingCounts={pileArrivingCounts}
            targetSelectionById={modalRouting.targetSelection.model?.byId}
            onTargetToggle={modalRouting.targetSelection.toggle}
          />

          <MidZone
            top={midTop}
            isMyTurn={isMyTurn}
            phase={bs.phase}
            canEndPhase={
              bs.canEndPhase && !boardPrompt && !spotlight.isBlockingPrompt
            }
            canPass={bs.canPass && !boardPrompt && !spotlight.isBlockingPrompt}
            inBattle={bs.inBattle}
            activePrompt={boardPrompt}
            rejectionReason={actionRejection?.reason ?? null}
            battleInfo={bs.battleInfo}
            blockerMode={bs.inBlockStep && !spotlight.isBlockingPrompt ? {
              selectedBlockerId: bs.selectedBlockerId,
              onBlock: () => {
                if (bs.selectedBlockerId) {
                  dispatchBoardAction({ type: "DECLARE_BLOCKER", blockerInstanceId: bs.selectedBlockerId });
                  bs.setSelectedBlockerId(null);
                }
              },
            } : undefined}
            targetSelectionMode={
              modalRouting.targetSelection.prompt && modalRouting.targetSelection.model
                ? {
                    effectDescription: modalRouting.targetSelection.prompt.effectDescription,
                    countLabel: modalRouting.targetSelection.model.countLabel,
                    selectedCount: modalRouting.targetSelection.model.selectedCount,
                    aggregateLabel: modalRouting.targetSelection.model.aggregateLabel,
                    ctaLabel: modalRouting.targetSelection.prompt.ctaLabel,
                    canConfirm: modalRouting.targetSelection.model.canConfirm,
                    canSkip: modalRouting.targetSelection.prompt.countMin === 0,
                    onConfirm: modalRouting.targetSelection.confirm,
                    onSkip: modalRouting.targetSelection.skip,
                  }
                : undefined
            }
            isPromptHidden={modalRouting.isPromptHidden}
            onShowPrompt={modalRouting.showPrompt}
            canUndo={canUndo && !spotlight.isBlockingPrompt}
            onAction={dispatchBoardAction}
          />

          <PlayerField
            me={me}
            cardDb={cardDb}
            activeDragType={drag.activeDragType}
            activeDrag={drag.activeDrag}
            refreshWave={refreshWave}
            canInteract={
              bs.canInteract &&
              !modalRouting.targetSelectionActive &&
              !spotlight.isBlockingPrompt
            }
            canActivateMain={
              bs.canInteract &&
              !activePrompt &&
              !spotlight.isBlockingPrompt
            }
            oncePerTurnUsed={turn?.oncePerTurnUsed}
            canDragCounter={
              bs.canDragCounter &&
              !modalRouting.targetSelectionActive &&
              !spotlight.isBlockingPrompt
            }
            inBlockStep={bs.inBlockStep && !spotlight.isBlockingPrompt}
            selectedBlockerId={bs.selectedBlockerId}
            setSelectedBlockerId={bs.setSelectedBlockerId}
            onAction={dispatchBoardAction}
            onPreviewZone={modalRouting.openZonePreview}
            redistributeSourceIds={redistribution.sourceIds}
            pendingTransferDonIdsByCard={redistribution.pendingDonIdsByCard}
            donCountAdjustments={mergedDonCountAdjustments}
            attackerInstanceId={attackerInstanceId}
            defenderInstanceId={defenderInstanceId}
            counterPulseIds={counterPulseIds}
            pileArrivingCounts={pileArrivingCounts}
            targetSelectionById={modalRouting.targetSelection.model?.byId}
            onTargetToggle={modalRouting.targetSelection.toggle}
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
            zoom: boardScale,
          }}
        >
          <HandLayer
            cards={playerOrderedHand}
            cardDb={cardDb}
            enableDrag={
              !dndDisabled &&
              !spotlight.isBlockingPrompt &&
              !modalRouting.targetSelectionActive &&
              (bs.canInteract || bs.canDragCounter)
            }
            counterMode={
              !dndDisabled &&
              !spotlight.isBlockingPrompt &&
              !modalRouting.targetSelectionActive &&
              bs.canDragCounter
            }
            availableDon={
              !dndDisabled && bs.canInteract
                ? (me?.donCostArea.filter((don) => don.state === "ACTIVE").length ?? 0)
                : undefined
            }
            zoneKey="p-hand"
            inFlightInstanceIds={playerHandAnim.inFlightInstanceIds}
            sleeveUrl={me?.sleeveUrl}
          />
        </div>
      </div>

      <SpotlightOverlay
        presentation={spotlight.presentation}
        cardDb={cardDb}
        myIndex={myIndex}
        isWaiting={spotlight.isWaiting}
        view={spotlight.view}
        onDismiss={spotlight.dismiss}
        onToggleView={spotlight.toggleView}
      />

      <BoardModals
        activePrompt={boardPrompt}
        isPromptHidden={modalRouting.isPromptHidden}
        onHide={modalRouting.hidePrompt}
        cardDb={cardDb}
        onAction={dispatchBoardAction}
        zonePreview={modalRouting.zonePreview}
        onCloseZonePreview={modalRouting.closeZonePreview}
        me={me}
        opp={opp}
        redistributeTransfers={redistribution.transfers}
        onRedistributeUndo={redistribution.undo}
        selectTargetInPlace={modalRouting.targetSelectionActive}
      />
    </div>

    <BoardDragOverlay
      activeDrag={drag.activeDrag}
      cardDb={cardDb}
      donArtUrl={me?.donArtUrl}
      overlayScale={drag.overlayScale}
      tiltX={drag.tiltX}
      tiltY={drag.tiltY}
    />

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
