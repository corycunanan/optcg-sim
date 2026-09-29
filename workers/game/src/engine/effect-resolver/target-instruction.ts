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
  verb?: VerbBuilder;
  /**
   * Modal title naming the action the player is choosing for (OPT-779), shown
   * as `Card Effect: <title>`. Entries without a `verb` only contribute a title.
   */
  title?: VerbBuilder;
}

/**
 * Action-keyed player-facing copy: the target-instruction verb (OPT-775) and
 * the modal title (OPT-779) live side by side so they cannot drift. Internal
 * action types (APPLY_PROHIBITION, SCHEDULE_ACTION, REUSE_EFFECT,
 * NEGATE_EFFECTS, ...) deliberately have no entry, so they never surface.
 */
export const TARGET_ACTION_PRESENTATION: Partial<
  Record<ActionType, TargetActionPresentation>
> = {
  KO: {
    verb: () => "KO",
    title: (action) => cardKindTitle(action, "KO Characters", "KO Stage", "KO"),
  },
  SET_REST: { verb: () => "Rest", title: () => "Rest" },
  SET_ACTIVE: { verb: () => "Set active", title: () => "Set Active" },
  RETURN_TO_HAND: { verb: () => "Return to hand", title: () => "Return to Hand" },
  RETURN_TO_DECK: {
    title: () => "Return to Deck",
    verb: (action) =>
      action.type === "RETURN_TO_DECK"
        ? `Return to the ${action.params?.position === "TOP" ? "top" : "bottom"} of the deck`
        : undefined,
  },
  TRASH_CARD: { verb: () => "Trash", title: () => "Trash" },
  TRASH_FROM_HAND: { verb: () => "Trash", title: () => "Trash" },
  TRASH_FROM_LIFE: { verb: () => "Trash", title: () => "Trash" },
  GIVE_DON: {
    title: () => "Give DON!!",
    verb: (action) => {
      const amount =
        action.type === "GIVE_DON" ? (action.params?.amount ?? 1) : 1;
      return `Give ${amount} DON!! to`;
    },
  },
  MODIFY_POWER: {
    title: (action) =>
      action.type === "MODIFY_POWER"
        ? renderSignedTitle("Power", action.params?.amount)
        : undefined,
    verb: (action) =>
      action.type === "MODIFY_POWER"
        ? renderSignedVerb("power", action.params?.amount)
        : undefined,
  },
  MODIFY_COST: {
    title: (action) =>
      action.type === "MODIFY_COST"
        ? renderSignedTitle("Cost", action.params?.amount)
        : undefined,
    verb: (action) =>
      action.type === "MODIFY_COST"
        ? renderSignedVerb("cost", action.params?.amount)
        : undefined,
  },
  GRANT_KEYWORD: {
    title: () => "Grant Keyword",
    verb: (action) =>
      action.type === "GRANT_KEYWORD"
        ? `Give [${displayKeyword(action.params?.keyword)}] to`
        : undefined,
  },
  PLAY_CARD: {
    verb: () => "Play",
    title: (action) =>
      cardKindTitle(action, "Play Character", "Play Stage", "Play Card"),
  },
  PLAY_SELF: { title: () => "Play This Card" },
  PLAY_FROM_LIFE: {
    verb: () => "Play",
    title: (action) =>
      cardKindTitle(action, "Play Character", "Play Stage", "Play Card"),
  },
  ADD_TO_LIFE: { verb: () => "Add to Life", title: () => "Add to Life" },
  ADD_TO_LIFE_FROM_DECK: { verb: () => "Add to Life", title: () => "Add to Life" },
  ADD_TO_LIFE_FROM_HAND: { verb: () => "Add to Life", title: () => "Add to Life" },
  ADD_TO_LIFE_FROM_FIELD: { verb: () => "Add to Life", title: () => "Add to Life" },
  // Title-only entries: actions whose prompts are not target instructions.
  DRAW: { title: () => "Draw Cards" },
  SEARCH_DECK: { title: () => "Search Deck" },
  FULL_DECK_SEARCH: { title: () => "Search Deck" },
  SEARCH_TRASH_THE_REST: { title: () => "Search Deck" },
  SEARCH_AND_PLAY: { title: () => "Search and Play" },
  DECK_SCRY: { title: () => "Look at Deck" },
  LIFE_SCRY: { title: () => "Look at Life" },
  REVEAL: { title: () => "Reveal" },
  REVEAL_HAND: { title: () => "Reveal" },
  PLACE_HAND_TO_DECK: { title: () => "Place on Deck" },
  RETURN_HAND_TO_DECK: { title: () => "Place on Deck" },
  MILL: { title: () => "Trash from Deck" },
  LIFE_TO_HAND: { title: () => "Add to Hand" },
  ADD_DON_FROM_DECK: { title: () => "Add DON!!" },
  RETURN_DON_TO_DECK: { title: () => "Return DON!!" },
  FORCE_OPPONENT_DON_RETURN: { title: () => "Return DON!!" },
  SET_DON_ACTIVE: { title: () => "Set DON!! Active" },
  REST_DON: { title: () => "Rest DON!!" },
  REDISTRIBUTE_DON: { title: () => "Move DON!!" },
};

/**
 * Modal title for an action (OPT-779), or `undefined` for internal or unmapped
 * types so the client falls back to its timing title. OPPONENT_ACTION unwraps
 * to the inner action, since the opponent is the one choosing.
 */
export function actionTitle(action: Action | null | undefined): string | undefined {
  if (!action) return undefined;
  if (action.type === "OPPONENT_ACTION") {
    return actionTitle(action.params?.action);
  }
  return TARGET_ACTION_PRESENTATION[action.type]?.title?.(action);
}

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

/** Static sign of an amount, or `undefined` when it depends on game state. */
function amountSign(amount: unknown): -1 | 1 | undefined {
  if (typeof amount === "number") return amount < 0 ? -1 : 1;
  if (!amount || typeof amount !== "object") return undefined;
  const value = amount as { type?: string; value?: unknown; multiplier?: unknown };
  if (value.type === "FIXED") return amountSign(value.value);
  // A PER_COUNT total is count (>= 0) times the multiplier, so the multiplier
  // fixes the sign.
  if (value.type === "PER_COUNT") return amountSign(value.multiplier);
  return undefined;
}

function renderSignedTitle(
  property: "Power" | "Cost",
  amount: unknown
): string {
  const sign = amountSign(amount);
  if (sign === undefined) return `Modify ${property}`;
  if (property === "Power") return sign < 0 ? "Decrease Power" : "Increase Power";
  return sign < 0 ? "Reduce Cost" : "Increase Cost";
}

type CardKind = "CHARACTER" | "STAGE";

function kindOfTypeName(name: string): CardKind | undefined {
  const upper = name.toUpperCase();
  if (upper === "CHARACTER" || upper === "CHARACTER_CARD") return "CHARACTER";
  if (upper === "STAGE" || upper === "STAGE_CARD") return "STAGE";
  return undefined;
}

/**
 * Whether the action's target is only Characters or only Stages. Mixed or
 * unknown targets return `undefined` so the title stays neutral.
 */
function targetCardKind(action: Action): CardKind | undefined {
  const target = (action as { target?: Target }).target;
  if (!target) return undefined;
  const byType = kindOfTypeName(target.type ?? "");
  if (byType) return byType;
  const filterType = (target.filter as { card_type?: string | string[] } | undefined)
    ?.card_type;
  if (filterType === undefined) return undefined;
  const kinds = new Set(
    (Array.isArray(filterType) ? filterType : [filterType]).map(kindOfTypeName)
  );
  if (kinds.size !== 1) return undefined;
  return [...kinds][0];
}

function cardKindTitle(
  action: Action,
  character: string,
  stage: string,
  neutral: string
): string {
  const kind = targetCardKind(action);
  return kind === "CHARACTER" ? character : kind === "STAGE" ? stage : neutral;
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
    case "BATTLE_TARGET":
      return { text: "the card battled with", plural: false };
    case "REPLACED_CARD":
      return { text: "the card being replaced", plural: false };
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
      // Conditional prohibition overrides carry authored actions even though
      // the shared runtime walker does not currently traverse payment actions.
      // Inventory their copy without changing prohibition execution semantics.
      const override =
        action.type === "APPLY_PROHIBITION"
          ? action.params?.conditional_override
          : undefined;
      if (
        override &&
        "action" in override &&
        typeof override.action === "object"
      ) {
        walk(
          cardId,
          blockId,
          [override.action],
          `${actionPath}.conditional_override`
        );
      }
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
