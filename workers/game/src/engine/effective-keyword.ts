import type { CardData } from "../types.js";

export type EffectiveKeyword =
  | "BLOCKER"
  | "RUSH"
  | "RUSH_CHARACTER"
  | "DOUBLE_ATTACK"
  | "BANISH"
  | "UNBLOCKABLE"
  | "TRIGGER";

/** Pure combination of printed, negated, and externally granted keyword state. */
export function isKeywordEffective(
  cardData: CardData,
  keyword: EffectiveKeyword,
  printedEffectsNegated: boolean,
  externallyGranted: boolean
): boolean {
  const printed = (() => {
    switch (keyword) {
      case "BLOCKER":
        return cardData.keywords.blocker;
      case "RUSH":
        return cardData.keywords.rush;
      case "RUSH_CHARACTER":
        return cardData.keywords.rushCharacter;
      case "DOUBLE_ATTACK":
        return cardData.keywords.doubleAttack;
      case "BANISH":
        return cardData.keywords.banish;
      case "UNBLOCKABLE":
        return cardData.keywords.unblockable;
      case "TRIGGER":
        return cardData.keywords.trigger;
    }
  })();
  return (printed && !printedEffectsNegated) || externallyGranted;
}
