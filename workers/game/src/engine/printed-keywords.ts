import type { KeywordSet } from "../../../../shared/game-types.js";
import {
  EMPTY_KEYWORDS,
  extractStandalonePrintedKeywords,
} from "../../../../shared/printed-keywords.js";
import type { CardData } from "../types.js";
import type { EffectSchema, Keyword } from "./effect-types.js";

const KEYWORD_FIELDS: Partial<Record<Keyword, keyof KeywordSet>> = {
  RUSH: "rush",
  RUSH_CHARACTER: "rushCharacter",
  DOUBLE_ATTACK: "doubleAttack",
  BANISH: "banish",
  BLOCKER: "blocker",
  UNBLOCKABLE: "unblockable",
};

function hasTriggerKeyword(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasTriggerKeyword);
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (node.keyword === "TRIGGER") return true;
  return Object.values(node).some(hasTriggerKeyword);
}

function isGatedPermanentKeywordEffect(
  effect: EffectSchema["effects"][number],
): boolean {
  return (
    effect.conditions !== undefined ||
    effect.post_cost_conditions !== undefined ||
    effect.costs !== undefined ||
    effect.trigger !== undefined ||
    effect.duration !== undefined
  );
}

function deriveFromSchema(schema: EffectSchema): KeywordSet {
  const keywords = { ...EMPTY_KEYWORDS };
  for (const effect of schema.effects) {
    if (
      effect.category === "permanent" &&
      !isGatedPermanentKeywordEffect(effect)
    ) {
      for (const keyword of effect.flags?.keywords ?? []) {
        const field = KEYWORD_FIELDS[keyword];
        if (field) keywords[field] = true;
      }
    }
    if (hasTriggerKeyword(effect.trigger)) keywords.trigger = true;
  }
  return keywords;
}

/**
 * Worker-owned printed keyword derivation.
 *
 * Authored schemas are authoritative: ungated permanent keyword flags are
 * intrinsic, structured Trigger blocks represent printed Trigger abilities,
 * and gated flags / GRANT_KEYWORD nodes remain runtime-only. Schema-less cards
 * use only exact standalone tags at the start of a text line.
 */
export function derivePrintedKeywords(
  cardData: CardData,
  schema: EffectSchema | null,
): KeywordSet {
  return schema
    ? deriveFromSchema(schema)
    : extractStandalonePrintedKeywords(cardData.effectText, cardData.triggerText);
}
