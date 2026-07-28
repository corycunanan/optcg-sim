import type { KeywordSet } from "./game-types";

export const EMPTY_KEYWORDS: KeywordSet = {
  rush: false,
  rushCharacter: false,
  doubleAttack: false,
  banish: false,
  blocker: false,
  trigger: false,
  unblockable: false,
};

const PRINTED_TAG_FIELDS: Record<string, keyof KeywordSet> = {
  rush: "rush",
  "rush: character": "rushCharacter",
  "double attack": "doubleAttack",
  banish: "banish",
  blocker: "blocker",
  trigger: "trigger",
  unblockable: "unblockable",
};

/**
 * Parse only exact bracketed keyword tags in the leading tag run of each line.
 * This deliberately rejects prose that merely grants or mentions a keyword.
 */
export function extractStandalonePrintedKeywords(
  effectText: string,
  triggerText: string | null,
): KeywordSet {
  const keywords = { ...EMPTY_KEYWORDS };
  const lines = `${effectText}\n${triggerText ?? ""}`.split(/\r?\n/);
  for (const line of lines) {
    const tagPrefix = line.match(/^\s*(?:\[[^\]]+\]\s*)+/)?.[0] ?? "";
    for (const match of tagPrefix.matchAll(/\[([^\]]+)\]/g)) {
      const field = PRINTED_TAG_FIELDS[match[1].trim().toLowerCase()];
      if (field) keywords[field] = true;
    }
  }
  return keywords;
}

