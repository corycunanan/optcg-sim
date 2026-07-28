/**
 * Keyword extraction from card effect text.
 * Mirrors the keyword detection in workers/game/src/engine/keywords.ts,
 * but runs at game-init time on the Next.js side to build the KeywordSet
 * included in the GameInitPayload sent to the Durable Object.
 */

import type { KeywordSet } from "@shared/game-types";
import { extractStandalonePrintedKeywords } from "@shared/printed-keywords";

export function extractKeywords(
  effectText: string,
  triggerText: string | null,
): KeywordSet {
  return extractStandalonePrintedKeywords(effectText, triggerText);
}
