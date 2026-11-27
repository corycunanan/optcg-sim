import { expect } from "vitest";
import { GAME_END_REASON_CODES } from "../../../../shared/game-types.js";
import { withoutAssertedMotionPayloads } from "./motion-payload-support.js";

/**
 * Frozen historic corpora predate the stored terminal `endReasonCode`
 * (OPT-978). Assert its independent contract on every state in the value
 * (a valid code on terminal states only), then omit only that field on a
 * comparison copy so the rest of the replay still matches byte for byte.
 * The same corpora predate the OPT-1059 motion payload fields, which are
 * asserted and omitted the same way (`withoutAssertedMotionPayloads`).
 */
export function withoutAssertedEndReasonCode<T>(value: T): T {
  const copy = withoutAssertedMotionPayloads(value);
  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const raw = node as Record<string, unknown>;
    if ("endReasonCode" in raw && Array.isArray(raw.players) && typeof raw.status === "string") {
      const code = raw.endReasonCode;
      if (code !== undefined && code !== null) {
        expect(raw.status).not.toBe("IN_PROGRESS");
        expect(GAME_END_REASON_CODES).toContain(code);
      }
      delete raw.endReasonCode;
    }
    for (const child of Object.values(raw)) visit(child);
  }
  visit(copy);
  return copy;
}
