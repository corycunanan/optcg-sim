import { expect } from "vitest";

/** Field and trash zones: a card added to Life from one of these names its
 *  side since OPT-1059. */
const FIELD_SOURCES = new Set(["CHARACTER", "STAGE", "LEADER", "TRASH"]);

/**
 * Frozen historic corpora predate the OPT-1059 motion payload fields: the
 * Life side on `CARD_ADDED_TO_HAND_FROM_LIFE` (`sourceFace`), the milled
 * cards on a deck `CARD_TRASHED` (`cards`), and the Life side on a
 * field-sourced `CARD_ADDED_TO_LIFE` (`face`). Assert each field's own
 * contract, then omit only those fields on a comparison copy so the rest of
 * the replay still matches byte for byte.
 */
export function withoutAssertedMotionPayloads<T>(value: T): T {
  const copy = structuredClone(value);
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const raw = node as Record<string, unknown>;
    const payload = raw.payload as Record<string, unknown> | undefined;
    if (typeof raw.type === "string" && payload && typeof payload === "object") {
      if (raw.type === "CARD_ADDED_TO_HAND_FROM_LIFE" && "sourceFace" in payload) {
        expect(["UP", "DOWN"]).toContain(payload.sourceFace);
        delete payload.sourceFace;
      }
      if (raw.type === "CARD_TRASHED" && payload.reason === "mill" && "cards" in payload) {
        expect(Array.isArray(payload.cards)).toBe(true);
        expect((payload.cards as unknown[]).length).toBe(payload.count);
        delete payload.cards;
      }
      if (
        raw.type === "CARD_ADDED_TO_LIFE" &&
        "face" in payload &&
        FIELD_SOURCES.has(String(payload.sourceZone))
      ) {
        expect(["UP", "DOWN"]).toContain(payload.face);
        delete payload.face;
      }
    }
    for (const child of Object.values(raw)) visit(child);
  }
  visit(copy);
  return copy;
}
