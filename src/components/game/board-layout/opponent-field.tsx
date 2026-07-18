"use client";

import { useCallback, useId } from "react";
import type { CardDb, PlayerState } from "@shared/game-types";
import { useFieldArrivals } from "@/hooks/use-field-arrivals";
import { isAttackTargetEligible } from "@/lib/game/client-legality";
import { Card } from "../card";
import { EmptySlot } from "./empty-slot";
import {
  SQUARE,
  SIDE_ZONE_GAP,
  FIELD_W,
} from "./constants";
import {
  zone2Left,
  zone2Right,
  oppTop,
  oppLeaderTop,
  oppCharTop,
  charSlotCenters,
  leaderLeft,
  stgDonWidth,
  sideCardOffsetX,
} from "./board-geometry";
import { DonZone } from "./don-zone";
import { DeckPile } from "./deck-pile";
import { LifeZone } from "./life-zone";
import { OpponentFieldCard } from "./field-card";
import { DroppableTrashZone } from "./trash-zone";
import { ZoneRef } from "./zone-ref";
import { cn } from "@/lib/utils";
import type { TargetCardSelectionState } from "@/lib/game/target-selection";

interface OpponentFieldProps {
  opp: PlayerState | null;
  cardDb: CardDb;
  activeDragType: string | null;
  refreshWave: boolean;
  onPreviewZone: (preview: { type: "deck" | "trash"; owner: "opp" }) => void;
  attackerInstanceId?: string | null;
  defenderInstanceId?: string | null;
  counterPulseIds?: Set<string>;
  winnerPulseIds?: Set<string>;
  lifeTriggerPulse?: boolean;
  lifeDamagePulseNonce?: number;
  /** Signed offsets merged into displayed DON count per target card
   *  (OPT-274). Negative while a DON token is in-flight so the counter
   *  doesn't increment before the token lands. */
  donCountAdjustments?: Map<string, number>;
  /** Active arrivals keyed by pile zone (`o-deck`, `o-trash`, `o-life`). */
  pileArrivingCounts?: ReadonlyMap<string, number>;
  targetSelectionById?: ReadonlyMap<string, TargetCardSelectionState>;
  onTargetToggle?: (instanceId: string) => void;
}

export function getOpponentStageTabIndex(
  selection: TargetCardSelectionState | undefined,
): 0 | -1 {
  return selection ? 0 : -1;
}

export function OpponentField({
  opp,
  cardDb,
  activeDragType,
  refreshWave,
  onPreviewZone,
  attackerInstanceId,
  defenderInstanceId,
  counterPulseIds,
  winnerPulseIds,
  lifeTriggerPulse,
  lifeDamagePulseNonce,
  donCountAdjustments,
  pileArrivingCounts,
  targetSelectionById,
  onTargetToggle,
}: OpponentFieldProps) {
  const stageDescriptionId = useId();
  const oppTrash = opp?.trash ?? [];
  const stage = opp?.stage ?? null;
  const stageSelection = stage
    ? targetSelectionById?.get(stage.instanceId)
    : undefined;
  const handleStageKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        stage &&
        stageSelection &&
        !stageSelection.disabledReason &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        onTargetToggle?.(stage.instanceId);
      }
    },
    [onTargetToggle, stage, stageSelection],
  );

  // Detect newly-arrived cards so the summon-entry pop plays on mount
  // (OPT-274). `useFieldArrivals` compares against the previous render's
  // instanceIds and seeds empty on the first render.
  const fieldIds: string[] = [];
  if (opp?.leader) fieldIds.push(opp.leader.instanceId);
  for (const c of opp?.characters ?? []) {
    if (c) fieldIds.push(c.instanceId);
  }
  const arrivals = useFieldArrivals(fieldIds);

  return (
    <>
      {/* Zone 3 (left): Trash + Deck */}
      <DroppableTrashZone
        trash={oppTrash}
        cardDb={cardDb}
        onClickTrash={
          oppTrash.length > 0
            ? () => onPreviewZone({ type: "trash", owner: "opp" })
            : undefined
        }
        zoneKey="o-trash"
        arrivingCount={pileArrivingCounts?.get("o-trash")}
        style={{ position: "absolute", left: sideCardOffsetX, top: oppTop }}
      />
      <DeckPile
        count={opp?.deck.length ?? 0}
        arrivingCount={pileArrivingCounts?.get("o-deck")}
        cardDb={cardDb}
        sleeveUrl={opp?.sleeveUrl}
        zoneKey="o-deck"
        style={{
          position: "absolute",
          left: sideCardOffsetX,
          top: oppTop + SQUARE + SIDE_ZONE_GAP,
        }}
        onClick={
          opp ? () => onPreviewZone({ type: "deck", owner: "opp" }) : undefined
        }
      />

      {/* Zone 2: Leader row — STG / LDR / DON */}
      <ZoneRef zoneKey="o-stage" style={{ position: "absolute", left: zone2Left, top: oppLeaderTop, width: stgDonWidth, height: SQUARE }} className="flex items-center justify-center rounded-md border border-gb-border-strong/30">
        {stage ? (
          <div
            data-target-selection={stageSelection ? "" : undefined}
            data-target-instance-id={stageSelection ? stage.instanceId : undefined}
            onClick={
              stageSelection && !stageSelection.disabledReason
                ? () => onTargetToggle?.(stage.instanceId)
                : undefined
            }
            onKeyDown={handleStageKeyDown}
            role={stageSelection ? "button" : "img"}
            tabIndex={getOpponentStageTabIndex(stageSelection)}
            aria-label={[
              cardDb[stage.cardId]?.name ?? stage.cardId,
              stage.state === "RESTED" ? "rested" : "active",
              stageSelection?.selected
                ? "selected"
                : stageSelection?.eligible
                  ? "eligible for selection"
                  : null,
              stageSelection?.disabledReason,
            ]
              .filter(Boolean)
              .join(". ")}
            aria-pressed={stageSelection ? !!stageSelection.selected : undefined}
            aria-disabled={stageSelection?.disabledReason ? true : undefined}
            aria-describedby={
              stageSelection?.disabledReason ? stageDescriptionId : undefined
            }
            className={cn(
              "rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gb-signal-eligible",
              stageSelection?.disabledReason && "opacity-35",
              stageSelection && !stageSelection.disabledReason && "cursor-pointer",
            )}
          >
            <Card
              variant="field"
              data={{ card: stage, cardDb }}
              state={stage.state === "RESTED" ? "rest" : "active"}
              overlays={{
                highlightRing: stageSelection?.selected
                  ? "selected"
                  : stageSelection?.eligible
                    ? "eligible"
                    : undefined,
              }}
              interaction={{
                tooltipNotice: stageSelection?.disabledReason ?? undefined,
              }}
              motionDelay={refreshWave ? 0.18 : undefined}
            />
            {stageSelection?.disabledReason && (
              <span id={stageDescriptionId} className="sr-only">
                {stageSelection.disabledReason}
              </span>
            )}
          </div>
        ) : (
          <span className="text-base font-bold text-gb-text-dim/40 leading-none select-none">
            STG
          </span>
        )}
      </ZoneRef>

      {opp?.leader ? (
        <OpponentFieldCard
          card={opp.leader}
          cardDb={cardDb}
          activeDragType={activeDragType}
          attackTargetEligible={isAttackTargetEligible("leader", opp.leader.state)}
          isAttacker={attackerInstanceId === opp.leader.instanceId}
          isDefender={defenderInstanceId === opp.leader.instanceId}
          winnerPulse={winnerPulseIds?.has(opp.leader.instanceId)}
          counterPulse={counterPulseIds?.has(opp.leader.instanceId)}
          targetSelection={targetSelectionById?.get(opp.leader.instanceId)}
          onTargetToggle={() => onTargetToggle?.(opp.leader.instanceId)}
          zoneKey="o-leader"
          style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
          animationDelay={refreshWave ? 0 : undefined}
          donCountAdjust={donCountAdjustments?.get(opp.leader.instanceId)}
          entering={arrivals.has(opp.leader.instanceId)}
        />
      ) : (
        <EmptySlot
          label="LDR"
          style={{ position: "absolute", left: leaderLeft, top: oppLeaderTop }}
        />
      )}

      <DonZone
        player={opp}
        zoneKey="o-don"
        donArtUrl={opp?.donArtUrl}
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
            attackTargetEligible={isAttackTargetEligible("character", char.state)}
            isAttacker={attackerInstanceId === char.instanceId}
            isDefender={defenderInstanceId === char.instanceId}
            winnerPulse={winnerPulseIds?.has(char.instanceId)}
            counterPulse={counterPulseIds?.has(char.instanceId)}
            targetSelection={targetSelectionById?.get(char.instanceId)}
            onTargetToggle={() => onTargetToggle?.(char.instanceId)}
            zoneKey={`o-char-${i}`}
            style={{ position: "absolute", left: pos.left, top: oppCharTop }}
            animationDelay={refreshWave ? 0.03 * (i + 1) : undefined}
            donCountAdjust={donCountAdjustments?.get(char.instanceId)}
            entering={arrivals.has(char.instanceId)}
          />
        ) : (
          <EmptySlot
            key={`opp-c${i}`}
            label={`C${i + 1}`}
            style={{ position: "absolute", left: pos.left, top: oppCharTop }}
          />
        );
      })}

      {/* Zone 1 (right): Life */}
      <LifeZone
        life={opp?.life ?? []}
        cardDb={cardDb}
        zoneKey="o-life"
        sleeveUrl={opp?.sleeveUrl}
        arrivingCount={pileArrivingCounts?.get("o-life")}
        triggerPulse={lifeTriggerPulse}
        damagePulseNonce={lifeDamagePulseNonce}
        style={{
          position: "absolute",
          left: FIELD_W - SQUARE + sideCardOffsetX,
          top: oppTop,
        }}
      />
    </>
  );
}
