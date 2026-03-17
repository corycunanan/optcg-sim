"use client";

import type { DeckLeaderEntry } from "@/lib/deck-builder-state";
import type { DeckStats } from "@/lib/deck-validation";

const COLOR_VAR: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

interface DeckBuilderStatsProps {
  leader: DeckLeaderEntry | null;
  stats: DeckStats;
  onRemoveLeader: () => void;
}

export function DeckBuilderStats({
  leader,
  stats,
  onRemoveLeader,
}: DeckBuilderStatsProps) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-4">
      {/* Leader card */}
      <div
        className="relative w-28 overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: leader
            ? `2px solid ${COLOR_VAR[leader.color[0]] || "var(--border)"}`
            : "2px dashed var(--border)",
        }}
      >
        {leader ? (
          <div className="group relative">
            <div className="aspect-[600/838] w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={leader.imageUrl}
                alt={leader.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div
              className="absolute inset-x-0 bottom-0 px-1.5 py-1"
              style={{
                background:
                  "linear-gradient(to top, oklch(10% 0.01 210) 0%, transparent 100%)",
              }}
            >
              <p
                className="truncate text-[10px] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {leader.name}
              </p>
              <p
                className="text-[9px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {leader.id} · {leader.color.join("/")}
              </p>
            </div>
            {/* Remove button */}
            <button
              onClick={onRemoveLeader}
              className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                background: "oklch(0% 0 0 / 0.7)",
                color: "var(--error)",
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex aspect-[600/838] items-center justify-center p-2 text-center">
            <p
              className="text-[10px] font-medium"
              style={{ color: "var(--text-tertiary)" }}
            >
              Search &amp; click a Leader to select
            </p>
          </div>
        )}
      </div>

      {/* Stats panels */}
      <div className="space-y-3">
        {/* Cost curve */}
        <div
          className="rounded-xl p-3"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h3
            className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            Cost Curve
          </h3>
          <CostCurveChart costCurve={stats.costCurve} />
        </div>

        {/* Color breakdown */}
        <div
          className="rounded-xl p-3"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h3
            className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)" }}
          >
            Colors
          </h3>
          <ColorBreakdown breakdown={stats.colorBreakdown} total={stats.totalCards} />
        </div>
      </div>
    </div>
  );
}

function CostCurveChart({ costCurve }: { costCurve: Record<number, number> }) {
  const maxCost = 10;
  const maxCount = Math.max(1, ...Object.values(costCurve));

  return (
    <div className="flex items-end gap-1" style={{ height: 64 }}>
      {Array.from({ length: maxCost + 1 }, (_, i) => {
        const count = costCurve[i] || 0;
        const height = count > 0 ? Math.max(4, (count / maxCount) * 56) : 2;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
            {count > 0 && (
              <span
                className="text-[9px] font-bold tabular-nums"
                style={{ color: "var(--text-tertiary)" }}
              >
                {count}
              </span>
            )}
            <div
              className="w-full rounded-t transition-all duration-300"
              style={{
                height,
                background:
                  count > 0
                    ? "var(--teal)"
                    : "var(--surface-3)",
                opacity: count > 0 ? 1 : 0.3,
              }}
            />
            <span
              className="text-[9px] tabular-nums"
              style={{ color: "var(--text-tertiary)" }}
            >
              {i === 10 ? "10+" : i}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ColorBreakdown({
  breakdown,
  total,
}: {
  breakdown: Record<string, number>;
  total: number;
}) {
  const colors = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  if (colors.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        No cards added yet
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {colors.map(([color, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={color} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: COLOR_VAR[color] || "var(--border)" }}
            />
            <span
              className="w-12 text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {color}
            </span>
            <div
              className="h-2 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--surface-3)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background: COLOR_VAR[color] || "var(--border)",
                }}
              />
            </div>
            <span
              className="w-6 text-right text-[10px] font-bold tabular-nums"
              style={{ color: "var(--text-secondary)" }}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
