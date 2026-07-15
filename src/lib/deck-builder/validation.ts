/**
 * OPTCG Deck Validation Engine
 *
 * Validates deck construction rules:
 * - Exactly 1 Leader
 * - Exactly 50 cards in main deck
 * - Max 4 copies of any card, unless card effect schema overrides it
 * - Color affinity: all cards share at least one color with the Leader
 * - Format legality: no banned cards (restricted cards within limits)
 * - Block rotation: if format is block-specific, all cards must be legal
 * - Leader deck restrictions: leader-authored card filters may constrain the main deck
 */

import {
  matchesTargetFilter,
  type SharedTargetFilter,
  type SharedTargetFilterCard,
} from "@shared/target-filter";

export const DEFAULT_COPY_LIMIT = 4;
export const MAIN_DECK_SIZE = 50;

type RuleModificationJson = Record<string, unknown>;
type DeckRestrictionType = "CANNOT_INCLUDE" | "ONLY_INCLUDE";

export interface DeckRestrictionRule {
  restriction: DeckRestrictionType;
  filter: RuleModificationJson;
}

interface DeckRestrictionCard {
  name: string;
  type: string;
  cost: number | null;
  traits: string[];
  color?: string[];
  power?: number | null;
  counter?: number | null;
  attribute?: string[];
  effectText?: string;
  triggerText?: string | null;
  effectSchema?: unknown | null;
}

export interface DeckCard {
  cardId: string;
  quantity: number;
  card: {
    id: string;
    name: string;
    color: string[];
    type: string;
    cost: number | null;
    power: number | null;
    counter: number | null;
    attribute?: string[];
    effectText?: string;
    triggerText?: string | null;
    imageUrl: string;
    banStatus: string;
    blockNumber: number;
    traits: string[];
    rarity: string;
    effectSchema?: unknown | null;
  };
}

export interface DeckLeader {
  id: string;
  name: string;
  color: string[];
  type: string;
  life: number | null;
  power: number | null;
  imageUrl: string;
  traits: string[];
  effectText: string;
  effectSchema?: unknown | null;
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationResult {
  id: string;
  rule: string;
  message: string;
  severity: ValidationSeverity;
  passed: boolean;
  cardIds?: string[]; // Cards that caused the violation
}

export interface DeckValidation {
  isValid: boolean;
  results: ValidationResult[];
  stats: DeckStats;
}

export interface DeckStats {
  totalCards: number;
  colorBreakdown: Record<string, number>;
  costCurve: Record<number, number>;
  typeBreakdown: Record<string, number>;
  traitBreakdown: Record<string, number>;
}

function computeStats(cards: DeckCard[]): DeckStats {
  const colorBreakdown: Record<string, number> = {};
  const costCurve: Record<number, number> = {};
  const typeBreakdown: Record<string, number> = {};
  const traitBreakdown: Record<string, number> = {};
  let totalCards = 0;

  for (const dc of cards) {
    totalCards += dc.quantity;

    // Color breakdown
    for (const color of dc.card.color) {
      colorBreakdown[color] = (colorBreakdown[color] || 0) + dc.quantity;
    }

    // Cost curve (group 10+ as 10)
    if (dc.card.cost !== null) {
      const costBucket = Math.min(dc.card.cost, 10);
      costCurve[costBucket] = (costCurve[costBucket] || 0) + dc.quantity;
    }

    // Type breakdown
    typeBreakdown[dc.card.type] =
      (typeBreakdown[dc.card.type] || 0) + dc.quantity;

    // Trait breakdown
    for (const trait of dc.card.traits ?? []) {
      traitBreakdown[trait] = (traitBreakdown[trait] || 0) + dc.quantity;
    }
  }

  return {
    totalCards,
    colorBreakdown,
    costCurve,
    typeBreakdown,
    traitBreakdown,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collect rule modifications from both schema encodings used by authored cards. */
export function collectRuleModifications(
  effectSchema: unknown
): RuleModificationJson[] {
  if (!isRecord(effectSchema)) return [];

  const mods: RuleModificationJson[] = [];
  const topLevelMods = effectSchema.rule_modifications;
  if (Array.isArray(topLevelMods)) {
    for (const mod of topLevelMods) {
      if (isRecord(mod)) mods.push(mod);
    }
  }

  const effects = effectSchema.effects;
  if (Array.isArray(effects)) {
    for (const effect of effects) {
      if (!isRecord(effect)) continue;
      if (effect.category !== "rule_modification") continue;
      if (isRecord(effect.rule)) mods.push(effect.rule);
    }
  }

  return mods;
}

export function allowsUnlimitedCopies(card: {
  effectSchema?: unknown | null;
}): boolean {
  return collectRuleModifications(card.effectSchema).some(
    (mod) =>
      mod.rule_type === "COPY_LIMIT_OVERRIDE" && mod.limit === "UNLIMITED"
  );
}

export function getDeckCardCopyLimit(card: {
  effectSchema?: unknown | null;
}): number {
  return allowsUnlimitedCopies(card) ? MAIN_DECK_SIZE : DEFAULT_COPY_LIMIT;
}

function isDeckRestrictionRule(mod: RuleModificationJson): mod is {
  rule_type: "DECK_RESTRICTION";
  restriction: DeckRestrictionType;
  filter: RuleModificationJson;
} {
  return (
    mod.rule_type === "DECK_RESTRICTION" &&
    (mod.restriction === "CANNOT_INCLUDE" ||
      mod.restriction === "ONLY_INCLUDE") &&
    isRecord(mod.filter)
  );
}

export function collectDeckRestrictionRules(leader: {
  effectSchema?: unknown | null;
}): DeckRestrictionRule[] {
  return collectRuleModifications(leader.effectSchema)
    .filter(isDeckRestrictionRule)
    .map((mod) => ({
      restriction: mod.restriction,
      filter: mod.filter,
    }));
}

export function matchesDeckRestrictionFilter(
  card: DeckRestrictionCard,
  filter: RuleModificationJson
): boolean {
  const effectText = card.effectText ?? "";
  const printedKeywords: Record<string, boolean> = {
    BLOCKER: effectText.includes("[Blocker]"),
    RUSH: effectText.includes("[Rush]"),
    RUSH_CHARACTER: effectText.includes("[Rush: Character]"),
    DOUBLE_ATTACK: effectText.includes("[Double Attack]"),
    BANISH: effectText.includes("[Banish]"),
    UNBLOCKABLE: effectText.includes("[Unblockable]"),
    TRIGGER: Boolean(card.triggerText?.trim()),
  };
  const treatsAsAll = (kind: "names" | "types" | "attributes") =>
    collectRuleModifications(card.effectSchema).some(
      (mod) =>
        mod.rule_type === "TREATED_AS_ALL_IDENTITIES" && mod[kind] === true
    );
  const sharedCard: SharedTargetFilterCard = {
    cost: card.cost ?? 0,
    baseCost: card.cost ?? 0,
    power: card.power ?? 0,
    basePower: card.power ?? 0,
    colors: card.color ?? [],
    traits: card.traits ?? [],
    name: card.name,
    attributes: card.attribute ?? [],
    cardType: card.type,
    attachedDonCount: 0,
    hasTrigger: printedKeywords.TRIGGER,
    hasEffect: effectText.trim().length > 0,
    hasBaseEffect: effectText.trim().length > 0,
    hasCounter: card.counter !== null && card.counter !== undefined,
    treatsAsAllNames: treatsAsAll("names"),
    treatsAsAllTraits: treatsAsAll("types"),
    treatsAsAllAttributes: treatsAsAll("attributes"),
  };

  return matchesTargetFilter(sharedCard, filter as SharedTargetFilter, {
    getEffectiveCost: ({ cost }) => cost,
    getEffectivePower: ({ power }) => power,
    hasKeyword: (_candidate, keyword) =>
      keyword === "BLOCKER" ||
      keyword === "RUSH" ||
      keyword === "RUSH_CHARACTER" ||
      keyword === "DOUBLE_ATTACK" ||
      keyword === "BANISH" ||
      keyword === "UNBLOCKABLE"
        ? printedKeywords[keyword]
        : true,
    hasGrantedAttribute: () => false,
    hasEffectKeyword: (_candidate, keyword) => {
      switch (keyword) {
        case "ON_PLAY":
          return effectText.includes("[On Play]");
        case "WHEN_ATTACKING":
          return effectText.includes("[When Attacking]");
        case "ON_KO":
          return effectText.includes("[On K.O.]");
        case "ON_BLOCK":
          return effectText.includes("[On Block]");
        case "COUNTER":
          return effectText.includes("[Counter]");
        case "ACTIVATE_MAIN":
          return effectText.includes("[Activate: Main]");
        default:
          return printedKeywords[keyword] ?? false;
      }
    },
    unknownKeyBehavior: "reject",
  });
}

export function isCardAllowedByDeckRestrictionRules(
  rules: DeckRestrictionRule[],
  card: DeckRestrictionCard
): boolean {
  for (const rule of rules) {
    const matchesFilter = matchesDeckRestrictionFilter(card, rule.filter);
    if (rule.restriction === "CANNOT_INCLUDE" && matchesFilter) return false;
    if (rule.restriction === "ONLY_INCLUDE" && !matchesFilter) return false;
  }

  return true;
}

export function validateDeck(
  leader: DeckLeader | null,
  cards: DeckCard[],
  _format: string = "Standard"
): DeckValidation {
  void _format;

  const results: ValidationResult[] = [];
  const stats = computeStats(cards);

  // Rule 1: Must have a leader
  results.push({
    id: "leader",
    rule: "Leader",
    message: leader ? `${leader.name}` : "No leader selected",
    severity: "error",
    passed: !!leader,
  });

  // Rule 2: Exactly 50 cards in main deck
  results.push({
    id: "deck-size",
    rule: "Deck Size",
    message: `${stats.totalCards}/${MAIN_DECK_SIZE} cards`,
    severity: "error",
    passed: stats.totalCards === MAIN_DECK_SIZE,
  });

  // Rule 3: Max 4 copies per card (unless the card's effect lifts the limit)
  const overLimitCards = cards.filter(
    (dc) => dc.quantity > DEFAULT_COPY_LIMIT && !allowsUnlimitedCopies(dc.card)
  );
  results.push({
    id: "copy-limit",
    rule: "Copy Limit",
    message:
      overLimitCards.length > 0
        ? `${overLimitCards.map((dc) => `${dc.card.name} (${dc.quantity})`).join(", ")} exceed 4-copy limit`
        : "All cards within 4-copy limit",
    severity: "error",
    passed: overLimitCards.length === 0,
    cardIds: overLimitCards.map((dc) => dc.cardId),
  });

  // Rule 4: Color affinity — all cards must share at least one color with the leader
  if (leader) {
    const leaderColors = new Set(leader.color);
    const colorViolations = cards.filter(
      (dc) => !dc.card.color.some((c) => leaderColors.has(c))
    );
    results.push({
      id: "color-affinity",
      rule: "Color Affinity",
      message:
        colorViolations.length > 0
          ? `${colorViolations.length} card(s) don't share a color with ${leader.name}: ${colorViolations.map((dc) => dc.card.name).join(", ")}`
          : "All cards share a color with leader",
      severity: "error",
      passed: colorViolations.length === 0,
      cardIds: colorViolations.map((dc) => dc.cardId),
    });

    const deckRestrictionRules = collectDeckRestrictionRules(leader);
    if (deckRestrictionRules.length > 0) {
      const deckRestrictionViolations = cards.filter(
        (dc) =>
          !isCardAllowedByDeckRestrictionRules(deckRestrictionRules, dc.card)
      );
      results.push({
        id: "leader-deck-restriction",
        rule: "Leader Restriction",
        message:
          deckRestrictionViolations.length > 0
            ? `${deckRestrictionViolations.length} card(s) violate ${leader.name}'s deck restriction: ${deckRestrictionViolations.map((dc) => dc.card.name).join(", ")}`
            : "All cards satisfy leader deck restrictions",
        severity: "error",
        passed: deckRestrictionViolations.length === 0,
        cardIds: deckRestrictionViolations.map((dc) => dc.cardId),
      });
    }
  }

  // Rule 5: Ban status
  const bannedCards = cards.filter((dc) => dc.card.banStatus === "BANNED");
  results.push({
    id: "ban-status",
    rule: "Ban List",
    message:
      bannedCards.length > 0
        ? `${bannedCards.map((dc) => dc.card.name).join(", ")} banned`
        : "No banned cards",
    severity: "error",
    passed: bannedCards.length === 0,
    cardIds: bannedCards.map((dc) => dc.cardId),
  });

  // Rule 6: Restricted cards (max 1 copy)
  const restrictedOver = cards.filter(
    (dc) => dc.card.banStatus === "RESTRICTED" && dc.quantity > 1
  );
  if (restrictedOver.length > 0) {
    results.push({
      id: "restricted",
      rule: "Restricted",
      message: `${restrictedOver.map((dc) => `${dc.card.name} (${dc.quantity})`).join(", ")} — restricted cards limited to 1 copy`,
      severity: "error",
      passed: false,
      cardIds: restrictedOver.map((dc) => dc.cardId),
    });
  } else {
    results.push({
      id: "restricted",
      rule: "Restricted",
      message: "No restricted card violations",
      severity: "error",
      passed: true,
    });
  }

  // Warning: No leader types in main deck
  const leadersInDeck = cards.filter((dc) => dc.card.type === "Leader");
  if (leadersInDeck.length > 0) {
    results.push({
      id: "no-leaders-in-deck",
      rule: "No Leaders in Main Deck",
      message: `${leadersInDeck.map((dc) => dc.card.name).join(", ")} — Leader cards cannot be in the main deck`,
      severity: "error",
      passed: false,
      cardIds: leadersInDeck.map((dc) => dc.cardId),
    });
  }

  const isValid = results.every((r) => r.passed || r.severity === "warning");

  return { isValid, results, stats };
}
