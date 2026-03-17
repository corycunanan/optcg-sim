"use client";

import type { ValidationResult } from "@/lib/deck-validation";

interface DeckBuilderValidationProps {
  results: ValidationResult[];
}

export function DeckBuilderValidation({ results }: DeckBuilderValidationProps) {
  const errors = results.filter((r) => !r.passed && r.severity === "error");
  const warnings = results.filter((r) => !r.passed && r.severity === "warning");
  const passed = results.filter((r) => r.passed);

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-2.5"
        style={{
          background: "oklch(72% 0.14 155 / 0.08)",
          border: "1px solid oklch(72% 0.14 155 / 0.2)",
        }}
      >
        <span className="text-sm">✅</span>
        <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
          All deck rules satisfied
        </span>
      </div>
    );
  }

  return (
    <div
      className="space-y-1 rounded-xl p-3"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <h3
        className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-tertiary)" }}
      >
        Validation
      </h3>

      {errors.map((r) => (
        <div
          key={r.id}
          className="flex items-start gap-2 rounded-lg px-2.5 py-1.5"
          style={{ background: "oklch(60% 0.18 25 / 0.06)" }}
        >
          <span className="mt-0.5 text-xs">❌</span>
          <div>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--error)" }}
            >
              {r.rule}
            </span>
            <p
              className="text-[11px] leading-tight"
              style={{ color: "var(--text-secondary)" }}
            >
              {r.message}
            </p>
          </div>
        </div>
      ))}

      {warnings.map((r) => (
        <div
          key={r.id}
          className="flex items-start gap-2 rounded-lg px-2.5 py-1.5"
          style={{ background: "oklch(78% 0.14 80 / 0.06)" }}
        >
          <span className="mt-0.5 text-xs">⚠️</span>
          <div>
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--warning)" }}
            >
              {r.rule}
            </span>
            <p
              className="text-[11px] leading-tight"
              style={{ color: "var(--text-secondary)" }}
            >
              {r.message}
            </p>
          </div>
        </div>
      ))}

      {passed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5 pt-1">
          {passed.map((r) => (
            <span
              key={r.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: "oklch(72% 0.14 155 / 0.08)",
                color: "var(--success)",
              }}
            >
              ✓ {r.rule}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
