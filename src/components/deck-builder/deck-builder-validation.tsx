"use client";

import type { ValidationResult } from "@/lib/deck-builder/validation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
      <Badge
        variant={deckFull ? "success" : "secondary"}
        className={cn(
          "self-start px-3 py-1 text-sm font-bold tabular-nums",
          deckFull && "border-transparent bg-success text-content-inverse"
        )}
      >
        {totalCards}/50
      </Badge>

      {/* Error tags */}
      {errors.map((r) => (
        <Badge key={r.id} variant="error" className="self-start" title={r.message}>
          ✕ {r.rule}
        </Badge>
      ))}

      {/* Warning tags */}
      {warnings.map((r) => (
        <Badge key={r.id} variant="warning" className="self-start" title={r.message}>
          ⚠ {r.rule}
        </Badge>
      ))}

      {/* Passed tags */}
      {passed.map((r) => (
        <Badge key={r.id} variant="success" className="self-start">
          ✓ {r.rule}
        </Badge>
      ))}
    </div>
  );
}
