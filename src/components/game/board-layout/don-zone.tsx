"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import type { DonInstance, PlayerState } from "@shared/game-types";
import { cn } from "@/lib/utils";
import { type ActiveDonDrag } from "./constants";

const DON_CARD_W = 50;
const DON_CARD_H = 70;
const DON_ACTIVE_OVERLAP = 35;
const DON_RESTED_OVERLAP = 60;
const DON_GROUP_GAP = -20;
const DON_IMG = "/images/DON/zoro.jpg";
export const DonCard = React.memo(function DonCard({ rested }: { rested?: boolean }) {
  const card = (
    <div
      className="rounded shrink-0 overflow-hidden shadow-don"
      style={{
        width: DON_CARD_W,
        height: DON_CARD_H,
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
});

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

export const DonZone = React.memo(function DonZone({
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
});
