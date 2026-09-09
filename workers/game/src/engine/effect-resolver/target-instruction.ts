import {
  getNestedActions,
  type Action,
  type ActionType,
  type Controller,
  type EffectSchema,
  type Target,
  type TargetFilter,
  type TargetType,
} from "../effect-types.js";

type VerbBuilder = (action: Action) => string | undefined;

export interface TargetActionPresentation {
  /** Player-facing imperative used at the start of a target instruction. */
  verb: VerbBuilder;
}

/**
 * Action-keyed target copy. OPT-779 can add its title column beside `verb`
 * without introducing a second action-label registry.
 */
export const TARGET_ACTION_PRESENTATION: Partial<
  Record<ActionType, TargetActionPresentation>
> = {
  KO: { verb: () => "KO" },
  SET_REST: { verb: () => "Rest" },
  SET_ACTIVE: { verb: () => "Set active" },
  RETURN_TO_HAND: { verb: () => "Return to hand" },
  RETURN_TO_DECK: {
    verb: (action) =>
      action.type === "RETURN_TO_DECK"
        ? `Return to the ${action.params?.position === "TOP" ? "top" : "bottom"} of the deck`
        : undefined,
  },
  TRASH_CARD: { verb: () => "Trash" },
  TRASH_FROM_HAND: { verb: () => "Trash" },
  TRASH_FROM_LIFE: { verb: () => "Trash" },
  GIVE_DON: {
    verb: (action) => {
      const amount =
        action.type === "GIVE_DON" ? (action.params?.amount ?? 1) : 1;
      return `Give ${amount} DON!! to`;
    },
  },
  MODIFY_POWER: {
    verb: (action) =>
      action.type === "MODIFY_POWER"
        ? renderSignedVerb("power", action.params?.amount)
        : undefined,
  },
  MODIFY_COST: {
    verb: (action) =>
      action.type === "MODIFY_COST"
        ? renderSignedVerb("cost", action.params?.amount)
        : undefined,
  },
  GRANT_KEYWORD: {
    verb: (action) =>
      action.type === "GRANT_KEYWORD"
        ? `Give [${displayKeyword(action.params?.keyword)}] to`
        : undefined,
  },
  PLAY_CARD: { verb: () => "Play" },
  PLAY_FROM_LIFE: { verb: () => "Play" },
  ADD_TO_LIFE: { verb: () => "Add to Life" },
  ADD_TO_LIFE_FROM_DECK: { verb: () => "Add to Life" },
  ADD_TO_LIFE_FROM_HAND: { verb: () => "Add to Life" },
  ADD_TO_LIFE_FROM_FIELD: { verb: () => "Add to Life" },
};

const SUPPORTED_FILTER_KEYS = new Set<keyof TargetFilter>([
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
  "traits",
  "traits_any_of",
  "traits_contains",
  "name",
  "name_any_of",
  "name_includes",
  "keywords",
  "is_rested",
  "is_active",
  "state",
]);

const KEYWORD_LABELS: Readonly<Record<string, string>> = {
  BANISH: "Banish",
  BLOCKER: "Blocker",
  CAN_ATTACK_ACTIVE: "Can Attack Active Characters",
  DOUBLE_ATTACK: "Double Attack",
  RUSH: "Rush",
  RUSH_CHARACTER: "Rush: Character",
  UNBLOCKABLE: "Unblockable",
};

interface TargetNoun {
  text: string;
  plural: boolean;
}

export interface TargetInstructionCoverage {
  targetCount: number;
  generatedCount: number;
  instructions: string[];
  fallbacks: string[];
}

function displayKeyword(keyword: string | undefined): string {
  if (!keyword) return "Keyword";
  return (
    KEYWORD_LABELS[keyword] ??
    keyword
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function renderSignedVerb(
  property: "power" | "cost",
  amount: unknown
): string | undefined {
  if (typeof amount !== "number") return undefined;
  const signedAmount = amount < 0 ? `−${Math.abs(amount)}` : `+${amount}`;
  return `Give ${signedAmount} ${property} to`;
}

function ownerPrefix(controller: Controller | undefined): string {
  switch (controller ?? "SELF") {
    case "SELF":
      return "your ";
    case "OPPONENT":
      return "your opponent's ";
    case "EITHER":
    case "ANY":
      return "";
  }
}

function targetNoun(target: Target): TargetNoun | undefined {
  const owned = (noun: string, plural = true): TargetNoun => ({
    text: `${ownerPrefix(target.controller)}${noun}`,
    plural,
  });

  switch (target.type) {
    case "SELF":
      return { text: "this card", plural: false };
    case "YOUR_LEADER":
      return { text: "your Leader", plural: false };
    case "OPPONENT_LEADER":
      return { text: "your opponent's Leader", plural: false };
    case "CHARACTER":
      return owned("Characters");
    case "STAGE":
      return owned("Stage", false);
    case "LEADER_OR_CHARACTER":
      return owned("Leaders or Characters");
    case "FIELD_CARD":
      return owned("field cards");
    case "ALL_YOUR_CHARACTERS":
      return { text: "your Characters", plural: true };
    case "ALL_OPPONENT_CHARACTERS":
      return { text: "your opponent's Characters", plural: true };
    case "CHARACTER_CARD":
      return owned("Character cards");
    case "STAGE_CARD":
      return owned("Stage cards");
    case "EVENT_CARD":
      return owned("Event cards");
    case "CARD_IN_HAND": {
      const controller = target.controller ?? "SELF";
      if (controller === "OPPONENT") {
        return { text: "your opponent's cards in hand", plural: true };
      }
      if (controller === "SELF") {
        return { text: "your cards in hand", plural: true };
      }
      return { text: "cards in hand", plural: true };
    }
    case "CARD_IN_TRASH":
      return owned("cards in the trash");
    case "CARD_ON_TOP_OF_DECK":
      return owned("card on top of the deck", false);
    case "CARD_IN_DECK":
      return owned("cards in the deck");
    case "LIFE_CARD":
      return owned("Life cards");
    case "DON_IN_COST_AREA":
      return owned("DON!! cards");
    case "DON_ATTACHED":
      return owned("attached DON!! cards");
    case "DON_IN_DON_DECK":
      return owned("DON!! cards in the DON!! deck");
    case "PLAYER":
      return target.controller === "SELF"
        ? { text: "yourself", plural: false }
        : { text: "your opponent", plural: false };
    case "OPPONENT_LIFE":
      return { text: "cards in your opponent's Life", plural: true };
    case "TRIGGERING_CARD":
    case "TRIGGERING_CARD_IN_TRASH":
      return { text: "the triggering card", plural: false };
    case "SELECTED_CARDS":
    case undefined:
      return undefined;
  }
}

function renderCount(countMin?: number, countMax?: number): string | undefined {
  if (countMin === undefined || countMax === undefined) return undefined;
  if (countMin === countMax) return String(countMin);
  if (countMin === 0) return `up to ${countMax}`;
  return `${countMin} to ${countMax}`;
}

function renderNumber(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}

function numericQualifier(
  filter: TargetFilter,
  property: "cost" | "power"
): string | undefined | false {
  const exact = filter[`${property}_exact`];
  const min = filter[`${property}_min`];
  const max = filter[`${property}_max`];
  const range = filter[`${property}_range`];
  const baseExact = filter[`base_${property}_exact`];
  const baseMin = filter[`base_${property}_min`];
  const baseMax = filter[`base_${property}_max`];
  const groups = [exact, min, max, range, baseExact, baseMin, baseMax].filter(
    (value) => value !== undefined
  );
  if (groups.length === 0) return undefined;
  if (groups.length > 1) return false;

  const phrase = (label: string, suffix: string): string | false => {
    const value = renderNumber(
      exact ?? min ?? max ?? baseExact ?? baseMin ?? baseMax
    );
    return value === undefined ? false : `with a ${label} of ${value}${suffix}`;
  };

  if (exact !== undefined) return phrase(property, "");
  if (min !== undefined) return phrase(property, " or more");
  if (max !== undefined) return phrase(property, " or less");
  if (range !== undefined) {
    return `with a ${property} of ${range.min} to ${range.max}`;
  }
  if (baseExact !== undefined) return phrase(`base ${property}`, "");
  if (baseMin !== undefined) return phrase(`base ${property}`, " or more");
  return phrase(`base ${property}`, " or less");
}

function joinBracketed(values: readonly string[], connector: string): string {
  return values.map((value) => `[${value}]`).join(connector);
}

function joinTraits(values: readonly string[], connector: string): string {
  return values.map((value) => `{${value}}`).join(connector);
}

function renderQualifiers(
  target: Target,
  noun: TargetNoun
): string[] | undefined {
  const filter = target.filter;
  if (!filter) return [];
  if (
    Object.keys(filter).some(
      (key) => !SUPPORTED_FILTER_KEYS.has(key as keyof TargetFilter)
    )
  ) {
    return undefined;
  }

  // The compact grammar cannot faithfully collapse simultaneous color/state
  // predicates. Keep the printed clause rather than silently dropping one.
  if (
    (filter.color && filter.color_includes) ||
    filter.is_rested === false ||
    filter.is_active === false ||
    [filter.state, filter.is_rested, filter.is_active].filter(
      (value) => value !== undefined
    ).length > 1
  ) {
    return undefined;
  }
  const qualifiers: string[] = [];
  const cost = numericQualifier(filter, "cost");
  const power = numericQualifier(filter, "power");
  if (cost === false || power === false) return undefined;
  if (cost) qualifiers.push(cost);
  if (power) qualifiers.push(power);

  const colors = filter.color ? [filter.color] : filter.color_includes;
  if (colors?.length) {
    qualifiers.push(
      `that ${noun.plural ? "are" : "is"} ${colors
        .map((color) => color.toLowerCase())
        .join(" or ")}`
    );
  }

  if (filter.traits?.length) {
    qualifiers.push(`with the ${joinTraits(filter.traits, " and ")} type`);
  }
  if (filter.traits_any_of?.length) {
    qualifiers.push(
      `with the ${joinTraits(filter.traits_any_of, " or ")} type`
    );
  }
  if (filter.traits_contains?.length) {
    qualifiers.push(
      `with a type containing ${filter.traits_contains
        .map((trait) => `{${trait}}`)
        .join(" and ")}`
    );
  }

  if (filter.name) qualifiers.push(`named [${filter.name}]`);
  if (filter.name_any_of?.length) {
    qualifiers.push(`named ${joinBracketed(filter.name_any_of, " or ")}`);
  }
  if (filter.name_includes) {
    qualifiers.push(`with [${filter.name_includes}] in the name`);
  }
  if (filter.keywords?.length) {
    qualifiers.push(
      `with ${filter.keywords
        .map((keyword) => `[${displayKeyword(keyword)}]`)
        .join(" and ")}`
    );
  }

  const state =
    filter.state ??
    (filter.is_rested ? "RESTED" : filter.is_active ? "ACTIVE" : undefined);
  if (state) {
    qualifiers.push(
      `that ${noun.plural ? "are" : "is"} ${state.toLowerCase()}`
    );
  }
  return qualifiers;
}

function renderConstraintTail(target: Target): string[] | undefined {
  const tail: string[] = [];
  if (target.aggregate_constraint) {
    const { property, operator, value } = target.aggregate_constraint;
    if (typeof value !== "number") return undefined;
    const comparison =
      operator === "<="
        ? `${value} or less`
        : operator === ">="
          ? `${value} or more`
          : String(value);
    tail.push(`with a total ${property} of ${comparison}`);
  }
  if (target.uniqueness_constraint) {
    tail.push(`with different ${target.uniqueness_constraint.field}s`);
  }
  return tail;
}

export function generateTargetInstruction(
  action: Action,
  target: Target,
  countMin?: number,
  countMax?: number
): string | undefined {
  if (
    target.dual_targets ||
    target.per_type_selection ||
    target.mixed_pool ||
    target.named_distribution ||
    target.self_ref ||
    target.ref
  ) {
    return undefined;
  }

  const noun = targetNoun(target);
  if (!noun) return undefined;
  const verb = (
    TARGET_ACTION_PRESENTATION[action.type]?.verb ?? (() => "Choose")
  )(action);
  if (!verb) return undefined;
  const qualifiers = renderQualifiers(target, noun);
  const tail = renderConstraintTail(target);
  if (!qualifiers || !tail) return undefined;

  const count = renderCount(countMin, countMax);
  return [
    verb,
    count,
    count ? "of" : undefined,
    noun.text,
    ...qualifiers,
    ...tail,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .concat(".");
}

function staticCountBounds(target: Target): [number?, number?] {
  if (target.count && "exact" in target.count) {
    return [target.count.exact, target.count.exact];
  }
  if (target.count && "up_to" in target.count) {
    return [0, target.count.up_to];
  }
  return [];
}

export function collectTargetInstructionCoverage(
  schemas: Readonly<Record<string, EffectSchema>>
): TargetInstructionCoverage {
  const rendered: string[] = [];
  const fallbacks: string[] = [];
  let targetCount = 0;
  const visitedTargets = new Set<Target>();

  const walk = (
    cardId: string,
    blockId: string,
    actions: Action[],
    path: string
  ): void => {
    actions.forEach((action, index) => {
      const actionPath = `${path}[${index}]`;
      if (action.target) {
        visitedTargets.add(action.target);
        targetCount += 1;
        const instruction = generateTargetInstruction(
          action,
          action.target,
          ...staticCountBounds(action.target)
        );
        if (instruction) rendered.push(instruction);
        else
          fallbacks.push(
            `${cardId} :: ${blockId} :: ${actionPath} (${action.type})`
          );
      }
      walk(cardId, blockId, getNestedActions(action), `${actionPath}.nested`);
    });
  };

  for (const [cardId, schema] of Object.entries(schemas)) {
    for (const block of schema.effects) {
      walk(cardId, block.id, block.actions ?? [], "actions");
      walk(
        cardId,
        block.id,
        block.replacement_actions ?? [],
        "replacement_actions"
      );
      if (block.rule?.rule_type === "START_OF_GAME_EFFECT") {
        walk(cardId, block.id, block.rule.actions, "rule.actions");
      }
    }
    for (const [index, rule] of (schema.rule_modifications ?? []).entries()) {
      if (rule.rule_type === "START_OF_GAME_EFFECT") {
        walk(cardId, `rule_modification[${index}]`, rule.actions, "actions");
      }
    }
  }

  // Costs, conditions and modifiers can also carry target blocks. They are
  // not action instructions, so explicitly inventory them as printed-text
  // fallbacks instead of silently omitting them from the golden coverage.
  const inventoryOtherTargets = (value: unknown, path: string): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (
        key === "target" &&
        child &&
        typeof child === "object" &&
        !visitedTargets.has(child as Target)
      ) {
        targetCount += 1;
        visitedTargets.add(child as Target);
        fallbacks.push(`${childPath} (non-action target)`);
      }
      inventoryOtherTargets(child, childPath);
    }
  };
  for (const [cardId, schema] of Object.entries(schemas)) {
    inventoryOtherTargets(schema, cardId);
  }

  return {
    targetCount,
    generatedCount: rendered.length,
    instructions: [...new Set(rendered)].sort(),
    fallbacks: fallbacks.sort(),
  };
}
