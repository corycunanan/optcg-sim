"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  ActiveEffect,
  ActiveProhibition,
  CardDb,
  EffectAvailability,
  GameAction,
  GameEvent,
  PlayerState,
  PromptOptions,
  TurnState,
} from "@shared/game-types";
import { DndContext, MeasuringStrategy } from "@dnd-kit/core";
import { useReducedMotion } from "motion/react";
import { TooltipProvider } from "@/components/ui";
import {
  HAND_CARD_H,
  FIELD_W,
  BOARD_CONTENT_H,
} from "./constants";
import {
  boardZoneKey,
  midTop,
  computeBoardScaling,
  resolveBoardComposition,
} from "./board-geometry";
import { boardCollisionDetection } from "./board-collision";
import { useHandOrder } from "@/hooks/use-hand-order";
import { useBattleState } from "./use-battle-state";
import { BoardModals } from "./board-modals";
import { HandLayer } from "./hand-layer";
import { MidZone } from "./mid-zone";
import { CardAnimationLayer } from "./card-animation-layer";
import { BoardNavbar } from "./board-navbar";
import { OpponentField } from "./opponent-field";
import { PlayerField } from "./player-field";
import { ZonePositionProvider, useZonePosition } from "@/contexts/zone-position-context";
import { ActiveEffectsProvider } from "@/contexts/active-effects-context";
import { EffectAvailabilityProvider } from "@/contexts/effect-availability-context";
import {
  InteractionModeProvider,
  type InteractionMode,
} from "./interaction-mode";
import {
  receivedHandsByPlayerIndex,
  useCardTransitions,
} from "@/hooks/use-card-transitions";
import { useCounterPulse } from "@/hooks/use-counter-pulse";
import { useCombatVictoryPulse } from "@/hooks/use-combat-victory-pulse";
import { useTriggerActivatedPulse } from "@/hooks/use-trigger-activated-pulse";
import { useLifeDamagePulse } from "@/hooks/use-life-damage-pulse";
import {
  usePowerModifiedPulse,
  type PowerModPulse,
} from "@/hooks/use-power-modified-pulse";
import { useEffectsNegatedPulse } from "@/hooks/use-effects-negated-pulse";
import { useAttackRedirectedPulse } from "@/hooks/use-attack-redirected-pulse";
import { useLifeScriedPulse } from "@/hooks/use-life-scried-pulse";
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
import { mergeDonCountAdjustments } from "./don-count-adjustments";

// Transient pulse hooks intentionally produce no pulses under reduced motion,
// but their empty collections can be recreated on a parent render. Reuse one
// bundle so those no-op values do not pierce the field memo boundaries.
const EMPTY_FIELD_PULSE_PROPS = {
  winnerPulseIds: new Set<string>(),
  powerModPulses: new Map<string, PowerModPulse>(),
  effectsNegatedPulses: new Map<string, string>(),
  attackRedirectedPulses: new Map<string, number>(),
};

export interface BoardLayoutProps {
  me: PlayerState | null;
  opp: PlayerState | null;
  myIndex: 0 | 1 | null;
  /** Engine player index whose field is anchored to the bottom edge. */
  bottomPlayerIndex: 0 | 1;
  turn: TurnState | null;
  cardDb: CardDb;
  isMyTurn: boolean;
  battlePhase: string | null;
  connectionStatus: string;
  eventLog: GameEvent[];
  activeEffects: ActiveEffect[];
  prohibitions?: ActiveProhibition[];
  effectAvailability?: Record<string, EffectAvailability[]>;
  activePrompt: PromptOptions | null;
  activePromptId: string | null;
  onAction: (action: GameAction) => void;
  onLeave: () => void;
  matchClosed: boolean;
  leavingGame?: boolean;
  canUndo: boolean;
  actionRejection?: ActionRejection | null;
  acceptedUpdate?: AcceptedGameUpdate | null;
  promptRespondingPlayer?: 0 | 1 | null;
  /** Suppresses board-driven user input. Default `"full"` (production game).
   *  `"spectator"` is fully read-only. `"responseOnly"` is sandbox-only and
   *  leaves prompt responses usable while suppressing ordinary board input. */
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
        <EffectAvailabilityProvider
          effectAvailability={props.effectAvailability}
        >
          <ActionFeedbackProvider rejection={props.actionRejection ?? null}>
            <InteractionModeProvider value={interactionMode}>
              <BoardLayoutInner {...props} interactionMode={interactionMode} />
            </InteractionModeProvider>
          </ActionFeedbackProvider>
        </EffectAvailabilityProvider>
      </ActiveEffectsProvider>
    </ZonePositionProvider>
  );
}

function BoardLayoutInner({
  me,
  opp,
  myIndex,
  bottomPlayerIndex,
  turn,
  cardDb,
  isMyTurn,
  battlePhase,
  connectionStatus,
  eventLog,
  prohibitions = [],
  activePrompt,
  activePromptId,
  actionRejection = null,
  acceptedUpdate = null,
  promptRespondingPlayer = null,
  onAction,
  onLeave,
  matchClosed,
  leavingGame,
  canUndo,
  interactionMode = "full",
  viewportSize,
  outerScale,
}: BoardLayoutProps & { interactionMode?: InteractionMode }) {
  const boardInputEnabled = interactionMode === "full";
  const spectatorMode = interactionMode === "spectator";
  const interactiveBoardOverlaysEnabled = !spectatorMode;
  const dndDisabled = !boardInputEnabled;
  const zoneRegistry = useZonePosition();
  const viewport = viewportSize;
  const composition = resolveBoardComposition(
    me,
    opp,
    myIndex,
    bottomPlayerIndex,
  );
  const bottomPlayer = composition.bottom;
  const topPlayer = composition.top;
  const topPlayerIndex = composition.topPlayerIndex;
  const spotlight = useCardSpotlight({
    eventLog,
    acceptedUpdate,
    myIndex,
    promptRespondingPlayer,
  });
  const dispatchBoardAction = useCallback(
    (action: GameAction) => {
      if (!spectatorMode && !spotlight.isBlockingPrompt) onAction(action);
    },
    [onAction, spectatorMode, spotlight.isBlockingPrompt]
  );
  const modalRouting = useBoardModalRouting({
    activePrompt,
    promptBlocked:
      !interactiveBoardOverlaysEnabled || spotlight.isBlockingPrompt,
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
  const { orderedHand: opponentOrderedHand } = useHandOrder(opp?.hand ?? []);

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

  /* ── Card flight animations ──────────────────────────────────── */

  const receivedHands = receivedHandsByPlayerIndex(
    bottomPlayer?.hand ?? [],
    topPlayer?.hand ?? [],
    bottomPlayerIndex,
  );

  const { transitions: cardAnimations, removeTransition } = useCardTransitions(
    eventLog,
    bottomPlayerIndex,
    drag.activeDrag !== null,
    zoneRegistry,
    spotlight.presentation,
    receivedHands,
  );

  const counterPulseIds = useCounterPulse(eventLog, bs.battle);
  const winnerPulseIds = useCombatVictoryPulse(eventLog);
  const triggerPulsePlayerIndexes = useTriggerActivatedPulse(eventLog);
  const lifeDamagePulseNonces = useLifeDamagePulse(eventLog);
  const powerModPulses = usePowerModifiedPulse(eventLog);
  const effectsNegatedPulses = useEffectsNegatedPulse(eventLog);
  const attackRedirectedPulses = useAttackRedirectedPulse(eventLog);
  const lifeScriedPulses = useLifeScriedPulse(eventLog);
  const fieldPulseProps = useMemo(
    () =>
      reducedMotion
        ? EMPTY_FIELD_PULSE_PROPS
        : {
            winnerPulseIds,
            powerModPulses,
            effectsNegatedPulses,
            attackRedirectedPulses,
          },
    [
      attackRedirectedPulses,
      effectsNegatedPulses,
      powerModPulses,
      reducedMotion,
      winnerPulseIds,
    ],
  );
  const attackerInstanceId = bs.battle?.attackerInstanceId ?? null;
  const defenderInstanceId = bs.battle?.targetInstanceId ?? null;
  const attackerCard = attackerInstanceId
    ? [
        bottomPlayer?.leader,
        topPlayer?.leader,
        ...(bottomPlayer?.characters ?? []),
        ...(topPlayer?.characters ?? []),
      ].find((card) => card?.instanceId === attackerInstanceId) ?? null
    : null;
  const playerLifeTriggerPulse = triggerPulsePlayerIndexes.has(bottomPlayerIndex);
  const opponentLifeTriggerPulse = triggerPulsePlayerIndexes.has(topPlayerIndex);
  const playerLifeDamagePulseNonce = lifeDamagePulseNonces.get(bottomPlayerIndex);
  const opponentLifeDamagePulseNonce = lifeDamagePulseNonces.get(topPlayerIndex);
  const playerLifeScriedPulseNonce = lifeScriedPulses.get(bottomPlayerIndex);
  const opponentLifeScriedPulseNonce = lifeScriedPulses.get(topPlayerIndex);

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
    return mergeDonCountAdjustments(
      redistribution.donCountAdjustments,
      inFlightDonAdjustByCard,
    );
  }, [redistribution.donCountAdjustments, inFlightDonAdjustByCard]);

  const bottomOrderedHand = composition.bottomOwner === "me"
    ? playerOrderedHand
    : opponentOrderedHand;
  const topOrderedHand = composition.topOwner === "me"
    ? playerOrderedHand
    : opponentOrderedHand;
  const playerHandAnim = useHandAnimationState(
    cardAnimations,
    bottomOrderedHand,
    boardZoneKey(bottomPlayerIndex, bottomPlayerIndex, "hand"),
  );
  const oppHandAnim = useHandAnimationState(
    cardAnimations,
    topOrderedHand,
    boardZoneKey(topPlayerIndex, bottomPlayerIndex, "hand"),
  );

  /* ── Sleeve/DON URLs per player index ────────────────────────── */

  const sleeveUrls: [string | null, string | null] = bottomPlayerIndex === 0
    ? [bottomPlayer?.sleeveUrl ?? null, topPlayer?.sleeveUrl ?? null]
    : [topPlayer?.sleeveUrl ?? null, bottomPlayer?.sleeveUrl ?? null];

  const donArtUrls: [string | null, string | null] = bottomPlayerIndex === 0
    ? [bottomPlayer?.donArtUrl ?? null, topPlayer?.donArtUrl ?? null]
    : [topPlayer?.donArtUrl ?? null, bottomPlayer?.donArtUrl ?? null];

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

  const phaseLabel =
    battlePhase === "BLOCK_STEP"
      ? bs.isDefender
        ? "You are blocking"
        : "Opponent is blocking"
      : battlePhase === "COUNTER_STEP"
        ? bs.isDefender
          ? "You are countering"
          : "Opponent is countering"
        : bs.phase;

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
      <BoardNavbar
        turnNumber={turn?.number ?? null}
        isMyTurn={isMyTurn}
        phaseLabel={phaseLabel}
        interactionMode={interactionMode}
        playerIndex={myIndex}
        connectionStatus={connectionStatus}
        onLeave={onLeave}
        onConcede={() => dispatchBoardAction({ type: "CONCEDE" })}
        matchClosed={matchClosed}
        leavingGame={leavingGame}
      />

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
          <HandLayer cards={topOrderedHand} cardDb={cardDb} zoneKey={boardZoneKey(topPlayerIndex, bottomPlayerIndex, "hand")} inFlightInstanceIds={oppHandAnim.inFlightInstanceIds} sleeveUrl={topPlayer?.sleeveUrl} />
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
            opp={topPlayer}
            playerIndex={topPlayerIndex}
            bottomPlayerIndex={bottomPlayerIndex}
            owner={composition.topOwner}
            cardDb={cardDb}
            activeDragType={drag.activeDragType}
            refreshWave={refreshWave}
            onPreviewZone={modalRouting.openZonePreview}
            attackerInstanceId={attackerInstanceId}
            defenderInstanceId={defenderInstanceId}
            counterPulseIds={counterPulseIds}
            winnerPulseIds={fieldPulseProps.winnerPulseIds}
            powerModPulses={fieldPulseProps.powerModPulses}
            effectsNegatedPulses={fieldPulseProps.effectsNegatedPulses}
            attackRedirectedPulses={fieldPulseProps.attackRedirectedPulses}
            lifeTriggerPulse={opponentLifeTriggerPulse}
            lifeDamagePulseNonce={opponentLifeDamagePulseNonce}
            lifeScriedPulseNonce={opponentLifeScriedPulseNonce}
            donCountAdjustments={mergedDonCountAdjustments}
            pileArrivingCounts={pileArrivingCounts}
            targetSelectionById={modalRouting.targetSelection.model?.byId}
            onTargetToggle={modalRouting.targetSelection.toggle}
          />

          <MidZone
            top={midTop}
            isMyTurn={isMyTurn}
            phase={bs.phase}
            canEndPhase={
              boardInputEnabled &&
              bs.canEndPhase &&
              !boardPrompt &&
              !spotlight.isBlockingPrompt
            }
            canPass={
              boardInputEnabled &&
              bs.canPass &&
              !boardPrompt &&
              !spotlight.isBlockingPrompt
            }
            inBattle={bs.inBattle}
            activePrompt={boardPrompt}
            rejectionReason={actionRejection?.reason ?? null}
            battleInfo={bs.battleInfo}
            blockerMode={boardInputEnabled && bs.inBlockStep && !spotlight.isBlockingPrompt ? {
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
            canUndo={
              boardInputEnabled && canUndo && !spotlight.isBlockingPrompt
            }
            onAction={dispatchBoardAction}
          />

          <PlayerField
            me={bottomPlayer}
            playerIndex={bottomPlayerIndex}
            bottomPlayerIndex={bottomPlayerIndex}
            owner={composition.bottomOwner}
            cardDb={cardDb}
            prohibitions={prohibitions}
            activeDragType={drag.activeDragType}
            activeDrag={drag.activeDrag}
            refreshWave={refreshWave}
            canInteract={
              boardInputEnabled &&
              bs.canInteract &&
              !modalRouting.targetSelectionActive &&
              !spotlight.isBlockingPrompt
            }
            canActivateMain={
              boardInputEnabled &&
              bs.canInteract &&
              !activePrompt &&
              !spotlight.isBlockingPrompt
            }
            oncePerTurnUsed={turn?.oncePerTurnUsed}
            canDragCounter={
              boardInputEnabled &&
              bs.canDragCounter &&
              !modalRouting.targetSelectionActive &&
              !spotlight.isBlockingPrompt
            }
            inBlockStep={
              boardInputEnabled &&
              bs.inBlockStep &&
              !spotlight.isBlockingPrompt
            }
            selectedBlockerId={bs.selectedBlockerId}
            setSelectedBlockerId={bs.setSelectedBlockerId}
            onAction={dispatchBoardAction}
            onPreviewZone={modalRouting.openZonePreview}
            redistributeSourceIds={redistribution.sourceIds}
            pendingTransferDonIdsByCard={redistribution.pendingDonIdsByCard}
            donCountAdjustments={mergedDonCountAdjustments}
            attackerInstanceId={attackerInstanceId}
            attackerCard={attackerCard}
            blockerAlreadyDeclared={bs.battle?.blockerActivated ?? false}
            defenderInstanceId={defenderInstanceId}
            counterPulseIds={counterPulseIds}
            winnerPulseIds={fieldPulseProps.winnerPulseIds}
            powerModPulses={fieldPulseProps.powerModPulses}
            effectsNegatedPulses={fieldPulseProps.effectsNegatedPulses}
            attackRedirectedPulses={fieldPulseProps.attackRedirectedPulses}
            lifeTriggerPulse={playerLifeTriggerPulse}
            lifeDamagePulseNonce={playerLifeDamagePulseNonce}
            lifeScriedPulseNonce={playerLifeScriedPulseNonce}
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
            cards={bottomOrderedHand}
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
                ? (bottomPlayer?.donCostArea.filter((don) => don.state === "ACTIVE").length ?? 0)
                : undefined
            }
            zoneKey={boardZoneKey(bottomPlayerIndex, bottomPlayerIndex, "hand")}
            inFlightInstanceIds={playerHandAnim.inFlightInstanceIds}
            sleeveUrl={bottomPlayer?.sleeveUrl}
          />
        </div>
      </div>

      {interactiveBoardOverlaysEnabled && (
        <>
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
            activePromptId={activePromptId}
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

          <BoardDragOverlay
            activeDrag={drag.activeDrag}
            cardDb={cardDb}
            donArtUrl={me?.donArtUrl}
            overlayScale={drag.overlayScale}
            tiltX={drag.tiltX}
            tiltY={drag.tiltY}
          />
        </>
      )}
    </div>

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
