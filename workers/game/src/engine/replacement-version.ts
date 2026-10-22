import type { GameState } from "../types.js";

/** Reader rollout keeps this false; writer rollout removes the legacy adapter. */
export const REPLACEMENT_SCAN_WRITER_ENABLED = false;

export function usesReplacementScan(state: GameState): boolean {
  return REPLACEMENT_SCAN_WRITER_ENABLED || state.schemaVersion === 6;
}
