"use client";

import type { DeckStats } from "@/lib/deck-builder/validation";

const COLOR_VAR: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

interface DeckBuilderStatsChartsProps {
  stats: DeckStats;
}

export function DeckBuilderStatsCharts({ stats }: DeckBuilderStatsChartsProps) {
  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-surface-1 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
          Cost Curve
        </h3>
        <CostCurveChart costCurve={stats.costCurve} />
      </div>
      <div className="rounded border border-border bg-surface-1 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-content-tertiary">
          Colors
        </h3>
        <ColorBreakdown breakdown={stats.colorBreakdown} total={stats.totalCards} />
      </div>
    </div>
  );
}

function CostCurveChart({ costCurve }: { costCurve: Record<number, number> }) {
  const maxCost = 10;
  const maxCount = Math.max(1, ...Object.values(costCurve));

  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {Array.from({ length: maxCost + 1 }, (_, i) => {
        const count = costCurve[i] || 0;
        const height = count > 0 ? Math.max(6, (count / maxCount) * 104) : 3;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            {count > 0 && (
              <span className="text-xs font-bold tabular-nums text-content-tertiary">{count}</span>
            )}
            <div
              className="w-full rounded-t transition-all duration-300"
              style={{
                height,
                background: count > 0 ? "var(--navy-900)" : "var(--surface-3)",
                opacity: count > 0 ? 1 : 0.4,
              }}
            />
            <span className="text-xs tabular-nums text-content-tertiary">
              {i === 10 ? "10+" : i}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ColorBreakdown({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  const colors = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  if (colors.length === 0) {
    return <p className="text-xs text-content-tertiary">No cards added yet</p>;
  }

  return (
    <div className="space-y-2">
      {colors.map(([color, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={color} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: COLOR_VAR[color] || "var(--border)" }}
            />
            <span className="w-12 text-xs font-medium text-content-secondary">{color}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: COLOR_VAR[color] || "var(--border)" }}
              />
            </div>
            <span className="w-6 text-right text-xs font-bold tabular-nums text-content-secondary">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
