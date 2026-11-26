import { expect } from "vitest";

/**
 * Frozen historic corpora predate the DON!! move detail on DON_DETACHED and
 * DON_PLACED_ON_FIELD (OPT-1057): `to`, `fromCostArea`, `sources` and
 * `donInstanceIds`. Assert the detail's own contract on every such event in
 * the value, then omit only those fields on a comparison copy so the rest of
 * the replay still matches byte for byte.
 */
export function withoutAssertedDonMoveDetail<T>(value: T): T {
  const copy = structuredClone(value);
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const raw = node as Record<string, unknown>;
    const payload = raw.payload as Record<string, unknown> | undefined;
    if (payload && typeof payload === "object" && raw.type === "DON_PLACED_ON_FIELD") {
      if (payload.donInstanceIds !== undefined) {
        expect(payload.donInstanceIds).toHaveLength(payload.count as number);
      }
      delete payload.donInstanceIds;
    }
    if (payload && typeof payload === "object" && raw.type === "DON_DETACHED") {
      if (payload.to === "COST_AREA") {
        // The Refresh return never carries a count (triggers.ts, OPT-881).
        expect(payload.count).toBeUndefined();
      } else if (payload.to === "DON_DECK") {
        const count = payload.count as number;
        const sources = (payload.sources ?? []) as { count: number }[];
        // A zero DON!! −0 return still emits one, with count 0.
        expect(count).toBeGreaterThanOrEqual(0);
        expect(payload.fromCostArea as number + sources.reduce((n, s) => n + s.count, 0)).toBe(count);
        expect(payload.donInstanceIds).toHaveLength(count);
      }
      delete payload.to;
      delete payload.fromCostArea;
      delete payload.sources;
      delete payload.donInstanceIds;
    }
    for (const child of Object.values(raw)) visit(child);
  }
  visit(copy);
  return copy;
}
