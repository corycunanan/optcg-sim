/**
 * Keyword extraction from card effect text.
 * Mirrors the keyword detection in workers/game/src/engine/keywords.ts,
 * but runs at game-init time on the Next.js side to build the KeywordSet
 * included in the GameInitPayload sent to the Durable Object.
 */

interface KeywordSet {
  rush: boolean;
  rushCharacter: boolean;
  doubleAttack: boolean;
  banish: boolean;
  blocker: boolean;
  trigger: boolean;
  unblockable: boolean;
}

export function extractKeywords(
  effectText: string,
  triggerText: string | null,
): KeywordSet {
  const text = (effectText + " " + (triggerText ?? "")).toLowerCase();

  return {
    rush: /\brush\b/.test(text) && !/rush:\s*character/i.test(text),
    rushCharacter: /rush:\s*character/i.test(text),
    doubleAttack: /double attack/i.test(text),
    banish: /\bbanish\b/i.test(text),
    blocker: /\bblocker\b/i.test(text),
    trigger: /\[trigger\]/i.test(text),
    unblockable: /\bunblockable\b/i.test(text),
  };
}
