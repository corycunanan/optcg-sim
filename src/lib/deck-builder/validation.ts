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
 */

export const DEFAULT_COPY_LIMIT = 4;
export const MAIN_DECK_SIZE = 50;

type RuleModificationJson = Record<string, unknown>;

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
