/**
 * Runtime-neutral TargetFilter predicate core.
 *
 * Runtimes provide effective-stat, keyword, identity, and result-reference
 * adapters. The boolean composition and every per-key predicate live here so
 * deck construction and in-game targeting cannot develop separate semantics.
 */

export type SharedDynamicValue = {
  type: string;
  value?: number;
};

export type SharedFilterNumber = number | SharedDynamicValue;

export interface SharedTargetFilter {
  controller?: string;
  cost_exact?: SharedFilterNumber;
  cost_min?: SharedFilterNumber;
  cost_max?: SharedFilterNumber;
  cost_range?: { min: number; max: number };
  base_cost_exact?: number;
  base_cost_min?: number;
  base_cost_max?: number;
  power_exact?: SharedFilterNumber;
  power_min?: SharedFilterNumber;
  power_max?: SharedFilterNumber;
  power_range?: { min: number; max: number };
  base_power_exact?: number;
  base_power_min?: number;
  base_power_max?: number;
  color?: string;
  color_includes?: string[];
  color_not_matching_ref?: string;
  traits?: string[];
  traits_any_of?: string[];
  traits_contains?: string[];
  traits_exclude?: string[];
  name?: string;
  name_any_of?: string[];
  name_includes?: string;
  exclude_name?: string;
  exclude_self?: boolean;
  name_matching_ref?: string;
  keywords?: string[];
  has_trigger?: boolean;
  attribute?: string;
  attribute_not?: string;
  has_effect?: boolean;
  no_base_effect?: boolean;
  lacks_effect_type?: string;
  has_counter?: boolean;
  card_type?: string | string[];
  is_rested?: boolean;
  is_active?: boolean;
  state?: string;
  don_given_count?: { operator: string; value: SharedFilterNumber };
  exclude_ref?: string;
  unique_names?: boolean;
  any_of?: SharedTargetFilter[];
}

export const TARGET_FILTER_KEYS = Object.freeze([
  "controller",
  "cost_exact",
  "cost_min",
  "cost_max",
  "cost_range",
  "base_cost_exact",
  "base_cost_min",
  "base_cost_max",
  "power_exact",
  "power_min",
  "power_max",
  "power_range",
  "base_power_exact",
  "base_power_min",
  "base_power_max",
  "color",
  "color_includes",
  "color_not_matching_ref",
  "traits",
  "traits_any_of",
  "traits_contains",
  "traits_exclude",
  "name",
  "name_any_of",
  "name_includes",
  "exclude_name",
  "exclude_self",
  "name_matching_ref",
  "keywords",
  "has_trigger",
  "attribute",
  "attribute_not",
  "has_effect",
  "no_base_effect",
  "lacks_effect_type",
  "has_counter",
  "card_type",
  "is_rested",
  "is_active",
  "state",
  "don_given_count",
  "exclude_ref",
  "unique_names",
  "any_of",
] as const satisfies readonly (keyof SharedTargetFilter)[]);

type TargetFilterKeyListIsComplete = Exclude<
  keyof SharedTargetFilter,
  (typeof TARGET_FILTER_KEYS)[number]
> extends never
  ? true
  : never;
const targetFilterKeyListIsComplete: TargetFilterKeyListIsComplete = true;
void targetFilterKeyListIsComplete;

const targetFilterKeySet: ReadonlySet<string> = new Set(TARGET_FILTER_KEYS);

export interface SharedTargetFilterCard {
  controller?: number;
  cost: number;
  baseCost: number;
  power: number;
  basePower: number;
  colors: readonly string[];
  traits: readonly string[];
  name: string;
  attributes: readonly string[];
  cardType: string;
  state?: string;
  attachedDonCount: number;
  instanceId?: string;
  hasTrigger: boolean;
  hasEffect: boolean;
  hasBaseEffect: boolean;
  hasCounter: boolean;
  treatsAsAllNames: boolean;
  treatsAsAllTraits: boolean;
  treatsAsAllAttributes: boolean;
}

export interface SharedTargetFilterContext {
  filterController?: number;
  costOverride?: number;
  getEffectiveCost?: (card: SharedTargetFilterCard) => number;
  getEffectivePower?: (card: SharedTargetFilterCard) => number;
  hasKeyword?: (card: SharedTargetFilterCard, keyword: string) => boolean;
  hasGrantedAttribute?: (
    card: SharedTargetFilterCard,
    attribute: string
  ) => boolean;
  hasEffectKeyword?: (card: SharedTargetFilterCard, keyword: string) => boolean;
  resolveDynamicValue?: (
    value: SharedDynamicValue,
    card: SharedTargetFilterCard
  ) => number | null;
  getReferencedCard?: (ref: string) => SharedTargetFilterCard | undefined;
  getReferencedInstanceIds?: (ref: string) => readonly string[] | undefined;
  unknownKeyBehavior?: "ignore" | "reject";
}

function compareNum(
  actual: number,
  operator: string,
  expected: number
): boolean {
  switch (operator) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    default:
      return false;
  }
}

function matchesNumber(
  actual: number,
  operator: string,
  expected: SharedFilterNumber,
  card: SharedTargetFilterCard,
  context: SharedTargetFilterContext
): boolean {
  if (typeof expected === "number")
    return compareNum(actual, operator, expected);
  if (expected.type === "FIXED" && typeof expected.value === "number") {
    return compareNum(actual, operator, expected.value);
  }
  const resolved = context.resolveDynamicValue?.(expected, card);
  return resolved == null || compareNum(actual, operator, resolved);
}

function normalized(values: readonly string[]): string[] {
  return values.map((value) => value.toUpperCase());
}

export function matchesTargetFilter(
  card: SharedTargetFilterCard,
  filter: SharedTargetFilter,
  context: SharedTargetFilterContext = {}
): boolean {
  if (
    context.unknownKeyBehavior === "reject" &&
    Object.keys(filter).some((key) => !targetFilterKeySet.has(key))
  ) {
    return false;
  }

  if (
    filter.controller &&
    filter.controller !== "ANY" &&
    filter.controller !== "EITHER" &&
    context.filterController !== undefined
  ) {
    const expected =
      filter.controller === "SELF"
        ? context.filterController
        : 1 - context.filterController;
    if (card.controller !== expected) return false;
  }

  if (filter.any_of) {
    const baseFilter = { ...filter, any_of: undefined };
    const baseOk =
      Object.values(baseFilter).every((value) => value === undefined) ||
      matchesTargetFilter(card, baseFilter, context);
    if (!baseOk) return false;
    return filter.any_of.some((alternative) =>
      matchesTargetFilter(card, alternative, context)
    );
  }

  const hasCurrentCostFilter =
    filter.cost_exact !== undefined ||
    filter.cost_min !== undefined ||
    filter.cost_max !== undefined ||
    filter.cost_range !== undefined;
  if (hasCurrentCostFilter) {
    const cost = context.costOverride ?? context.getEffectiveCost?.(card);
    if (cost === undefined) return false;
    if (
      filter.cost_exact !== undefined &&
      !matchesNumber(cost, "==", filter.cost_exact, card, context)
    )
      return false;
    if (
      filter.cost_min !== undefined &&
      !matchesNumber(cost, ">=", filter.cost_min, card, context)
    )
      return false;
    if (
      filter.cost_max !== undefined &&
      !matchesNumber(cost, "<=", filter.cost_max, card, context)
    )
      return false;
    if (
      filter.cost_range &&
      (cost < filter.cost_range.min || cost > filter.cost_range.max)
    )
      return false;
  }
  if (
    filter.base_cost_exact !== undefined &&
    card.baseCost !== filter.base_cost_exact
  )
    return false;
  if (
    filter.base_cost_min !== undefined &&
    card.baseCost < filter.base_cost_min
  )
    return false;
  if (
    filter.base_cost_max !== undefined &&
    card.baseCost > filter.base_cost_max
  )
    return false;

  const hasPowerFilter =
    filter.power_exact !== undefined ||
    filter.power_min !== undefined ||
    filter.power_max !== undefined ||
    filter.power_range !== undefined;
  if (hasPowerFilter) {
    const power = context.getEffectivePower?.(card);
    if (power === undefined) return false;
    if (
      filter.power_exact !== undefined &&
      !matchesNumber(power, "==", filter.power_exact, card, context)
    )
      return false;
    if (
      filter.power_min !== undefined &&
      !matchesNumber(power, ">=", filter.power_min, card, context)
    )
      return false;
    if (
      filter.power_max !== undefined &&
      !matchesNumber(power, "<=", filter.power_max, card, context)
    )
      return false;
    if (
      filter.power_range &&
      (power < filter.power_range.min || power > filter.power_range.max)
    )
      return false;
  }
  if (
    filter.base_power_exact !== undefined &&
    card.basePower !== filter.base_power_exact
  )
    return false;
  if (
    filter.base_power_min !== undefined &&
    card.basePower < filter.base_power_min
  )
    return false;
  if (
    filter.base_power_max !== undefined &&
    card.basePower > filter.base_power_max
  )
    return false;

  const colors = normalized(card.colors);
  if (filter.color && !colors.includes(filter.color)) return false;
  if (
    filter.color_includes &&
    !filter.color_includes.some((color) => colors.includes(color))
  )
    return false;
  if (filter.color_not_matching_ref) {
    const referenced = context.getReferencedCard?.(
      filter.color_not_matching_ref
    );
    if (
      referenced &&
      colors.some((color) => normalized(referenced.colors).includes(color))
    )
      return false;
  }

  if (
    filter.traits &&
    !card.treatsAsAllTraits &&
    !filter.traits.every((trait) => card.traits.includes(trait))
  )
    return false;
  if (
    filter.traits_any_of &&
    !card.treatsAsAllTraits &&
    !filter.traits_any_of.some((trait) => card.traits.includes(trait))
  )
    return false;
  if (
    filter.traits_contains &&
    !card.treatsAsAllTraits &&
    !filter.traits_contains.every((needle) =>
      card.traits.some((trait) => trait.includes(needle))
    )
  )
    return false;
  if (
    filter.traits_exclude &&
    (card.treatsAsAllTraits ||
      filter.traits_exclude.some((trait) => card.traits.includes(trait)))
  )
    return false;

  if (filter.name && !card.treatsAsAllNames && card.name !== filter.name)
    return false;
  if (
    filter.name_any_of &&
    !card.treatsAsAllNames &&
    !filter.name_any_of.includes(card.name)
  )
    return false;
  if (
    filter.name_includes &&
    !card.treatsAsAllNames &&
    !card.name.includes(filter.name_includes)
  )
    return false;
  if (
    filter.exclude_name &&
    (card.treatsAsAllNames || card.name === filter.exclude_name)
  )
    return false;
  if (filter.name_matching_ref) {
    const referenced = context.getReferencedCard?.(filter.name_matching_ref);
    if (referenced && card.name !== referenced.name) return false;
  }

  if (filter.keywords) {
    for (const keyword of filter.keywords) {
      if (keyword === "RUSH") {
        if (
          !context.hasKeyword?.(card, "RUSH") &&
          !context.hasKeyword?.(card, "RUSH_CHARACTER")
        )
          return false;
      } else if (!context.hasKeyword?.(card, keyword)) {
        return false;
      }
    }
  }
  if (filter.has_trigger === true && !card.hasTrigger) return false;
  if (filter.has_trigger === false && card.hasTrigger) return false;

  const attributes = normalized(card.attributes);
  if (filter.attribute && !card.treatsAsAllAttributes) {
    const wanted = filter.attribute.toUpperCase();
    if (
      !attributes.includes(wanted) &&
      !context.hasGrantedAttribute?.(card, wanted)
    )
      return false;
  }
  if (filter.attribute_not) {
    const unwanted = filter.attribute_not.toUpperCase();
    if (
      card.treatsAsAllAttributes ||
      attributes.includes(unwanted) ||
      context.hasGrantedAttribute?.(card, unwanted)
    )
      return false;
  }

  if (filter.has_effect === true && !card.hasEffect) return false;
  if (filter.has_effect === false && card.hasEffect) return false;
  if (filter.no_base_effect === true && card.hasBaseEffect) return false;
  if (filter.has_counter === true && !card.hasCounter) return false;
  if (filter.has_counter === false && card.hasCounter) return false;
  if (
    filter.lacks_effect_type &&
    context.hasEffectKeyword?.(card, filter.lacks_effect_type)
  )
    return false;

  if (filter.card_type) {
    const cardType = card.cardType.toUpperCase();
    const accepted = Array.isArray(filter.card_type)
      ? filter.card_type.some((type) => type.toUpperCase() === cardType)
      : filter.card_type.toUpperCase() === cardType;
    if (!accepted) return false;
  }

  if (filter.is_rested === true && card.state !== "RESTED") return false;
  if (filter.is_active === true && card.state !== "ACTIVE") return false;
  if (filter.state && card.state !== filter.state) return false;

  if (filter.exclude_ref && card.instanceId) {
    if (
      context
        .getReferencedInstanceIds?.(filter.exclude_ref)
        ?.includes(card.instanceId)
    )
      return false;
  }

  if (filter.don_given_count) {
    const expected =
      typeof filter.don_given_count.value === "number"
        ? filter.don_given_count.value
        : 0;
    if (
      !compareNum(
        card.attachedDonCount,
        filter.don_given_count.operator,
        expected
      )
    )
      return false;
  }

  return true;
}
