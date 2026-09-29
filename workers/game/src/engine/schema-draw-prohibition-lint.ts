/**
 * OPT-876 schema-lint rule for CANNOT_DRAW `scope.cause`.
 *
 * `ProhibitionScope.cause` is shared by every prohibition type, so the type
 * system accepts values (BATTLE, IN_BATTLE, OPPONENT_EFFECT, ...) that have no
 * meaning for a draw. `isDrawProhibitedByEffect` (prohibitions.ts) handles only
 * CANNOT_DRAW_CAUSES and ignores anything else, so an unsupported value would
 * silently never block. This rule makes that value unauthorable.
 *
 * Covers both encodings: APPLY_PROHIBITION params
 * (`prohibition_type: "CANNOT_DRAW"`) and permanent `prohibitions` entries
 * (`type: "CANNOT_DRAW"`).
 */
import type { EffectSchema } from "./effect-types.js";
import { CANNOT_DRAW_CAUSES, isCannotDrawCause } from "./prohibitions.js";

function collect(node: unknown, path: string, cardId: string, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collect(child, `${path}[${index}]`, cardId, out));
    return;
  }
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  if (record.prohibition_type === "CANNOT_DRAW" || record.type === "CANNOT_DRAW") {
    const scope = record.scope as Record<string, unknown> | undefined;
    const cause = scope?.cause;
    if (cause !== undefined && !isCannotDrawCause(cause)) {
      out.push(
        `${cardId} ${path}: CANNOT_DRAW scope.cause ${JSON.stringify(cause)} is unsupported; use one of ${CANNOT_DRAW_CAUSES.join(", ")} (omitted = BY_YOUR_EFFECT)`,
      );
    }
  }
  for (const [key, value] of Object.entries(record)) {
    collect(value, path ? `${path}.${key}` : key, cardId, out);
  }
}

/** Unsupported CANNOT_DRAW causes in one schema. */
export function findDrawProhibitionCauseViolations(schema: EffectSchema): string[] {
  const out: string[] = [];
  collect(schema, "", schema.card_id ?? "UNKNOWN", out);
  return out;
}

export function findDrawProhibitionIntentViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  return Object.values(schemas).flatMap(findDrawProhibitionCauseViolations);
}
