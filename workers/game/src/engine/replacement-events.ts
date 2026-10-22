import type { BatchActionKind, ReplacementEvent } from "./replacements.js";

/** The complete ordered families supplied by the four batch action producers. */
export function replacementEventsFor(actionKind: BatchActionKind, events?: ReplacementEvent[]): ReplacementEvent[] {
  if (events) return events;
  if (actionKind === "KO") return ["WOULD_BE_KO", "WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"];
  if (actionKind === "SET_REST") return ["WOULD_BE_RESTED"];
  return ["WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"];
}
