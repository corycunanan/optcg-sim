"use client";

import type { ValidationResult } from "@/lib/deck-validation";
import { cn } from "@/components/ui/cn";

interface DeckBuilderValidationProps {
  results: ValidationResult[];
  totalCards: number;
}

export function DeckBuilderValidation({ results, totalCards }: DeckBuilderValidationProps) {
  // Exclude leader (shown as card) and deck-size (shown as X/50 tag)
  const rules = results.filter((r) => r.id !== "leader" && r.id !== "deck-size");
  const errors = rules.filter((r) => !r.passed && r.severity === "error");
  const warnings = rules.filter((r) => !r.passed && r.severity === "warning");
  const passed = rules.filter((r) => r.passed);

  const deckFull = totalCards === 50;

  return (
    <div className="flex flex-col gap-2">
      {/* X/50 deck size tag */}
      <span
        className={cn(
          "self-start rounded px-3 py-1 text-sm font-bold tabular-nums",
          deckFull
            ? "bg-success text-content-inverse"
            : "bg-surface-3 text-content-secondary"
        )}
      >
        {totalCards}/50
      </span>

      {/* Error tags */}
      {errors.map((r) => (
        <span
          key={r.id}
          className="self-start rounded bg-error-soft px-2 py-1 text-xs font-semibold text-error"
          title={r.message}
        >
          ✕ {r.rule}
        </span>
      ))}

      {/* Warning tags */}
      {warnings.map((r) => (
        <span
          key={r.id}
          className="self-start rounded bg-warning-soft px-2 py-1 text-xs font-semibold text-warning"
          title={r.message}
        >
          ⚠ {r.rule}
        </span>
      ))}

      {/* Passed tags */}
      {passed.map((r) => (
        <span
          key={r.id}
          className="self-start rounded bg-success-soft px-2 py-1 text-xs font-medium text-success"
        >
          ✓ {r.rule}
        </span>
      ))}
    </div>
  );
}
