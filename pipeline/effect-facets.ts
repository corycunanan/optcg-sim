import {
  EFFECT_FACET_GROUPS,
  type EffectFacetTag,
} from "@shared/effect-facets";
import {
  TARGET_FILTER_KEYS,
  type SharedTargetFilter,
} from "@shared/target-filter";
import type {
  Action,
  Cost,
  EffectBlock,
  EffectSchema,
  Modifier,
  Target,
  Trigger,
} from "../workers/game/src/engine/effect-types";

export type EffectTraitRef = {
  trait: string;
  role: "target" | "search" | "cost" | "exclude";
  blockId: string;
};

type TraitRole = Exclude<EffectTraitRef["role"], "exclude">;

const ORDERED_TAGS: readonly EffectFacetTag[] = EFFECT_FACET_GROUPS.flatMap(
  (group) => group.tags.map((tag) => tag.id)
);
const REGISTERED_TAGS: ReadonlyMap<string, EffectFacetTag> = new Map(
  ORDERED_TAGS.map((tag) => [tag, tag])
);
const TARGET_FILTER_KEY_SET: ReadonlySet<string> = new Set(TARGET_FILTER_KEYS);

const SEARCH_ACTION_TYPES: ReadonlySet<Action["type"]> = new Set([
  "SEARCH_DECK",
  "FULL_DECK_SEARCH",
  "SEARCH_TRASH_THE_REST",
  "SEARCH_AND_PLAY",
]);
const KEYWORDS: ReadonlySet<string> = new Set([
  "RUSH",
  "BLOCKER",
  "DOUBLE_ATTACK",
  "BANISH",
  "UNBLOCKABLE",
  "RUSH_CHARACTER",
  "CAN_ATTACK_ACTIVE",
]);

const CONDITION_TYPES: ReadonlySet<string> = new Set([
  "LIFE_COUNT",
  "CHARACTER_TOTAL_COST",
  "HAND_COUNT",
  "TRASH_COUNT",
  "DECK_COUNT",
  "DON_FIELD_COUNT",
  "ACTIVE_DON_COUNT",
  "ALL_DON_STATE",
  "CARD_ON_FIELD",
  "MULTIPLE_NAMED_CARDS",
  "NAMED_CARD_WITH_PROPERTY",
  "FIELD_PURITY",
  "LEADER_PROPERTY",
  "SELF_POWER",
  "SELF_COST",
  "SELF_STATE",
  "NO_BASE_EFFECT",
  "HAS_EFFECT_TYPE",
  "LACKS_EFFECT_TYPE",
  "COMPARATIVE",
  "COMBINED_TOTAL",
  "WAS_PLAYED_THIS_TURN",
  "ACTION_PERFORMED_THIS_TURN",
  "PLAY_METHOD",
  "FACE_UP_LIFE",
  "CARD_TYPE_IN_ZONE",
  "COMBINED_ZONE_COUNT",
  "BOARD_WIDE_EXISTENCE",
  "RESTED_CARD_COUNT",
  "DON_GIVEN",
  "TURN_COUNT",
  "IS_MY_TURN",
  "SOURCE_PROPERTY",
  "REVEALED_CARD_PROPERTY",
]);

function addTag(tags: Set<EffectFacetTag>, candidate: string): void {
  const registered = REGISTERED_TAGS.get(candidate);
  if (!registered) {
    throw new Error(`Unregistered effect facet tag: ${candidate}`);
  }
  tags.add(registered);
}

function lower(value: string): string {
  return value.toLowerCase();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function controllerQualifier(
  target: Target | undefined
): "self" | "opponent" | undefined {
  if (target?.controller === "SELF" || target?.type === "SELF") return "self";
  if (target?.controller === "OPPONENT") return "opponent";
  return undefined;
}

function qualifiedTag(
  group: "don" | "life" | "state" | "stat",
  value: string,
  qualifier?: "self" | "opponent"
): string {
  return `${group}:${value}${qualifier ? `:${qualifier}` : ""}`;
}

function visitTrigger(trigger: Trigger, tags: Set<EffectFacetTag>): void {
  if ("any_of" in trigger) {
    for (const member of trigger.any_of) visitTrigger(member, tags);
    return;
  }

  if ("keyword" in trigger) addTag(tags, `trigger:${lower(trigger.keyword)}`);
  if ("event" in trigger) addTag(tags, `trigger:${lower(trigger.event)}`);
  if ((trigger.don_requirement ?? 0) >= 1) {
    addTag(tags, "timing:don_requirement");
  }
  if (trigger.turn_restriction) {
    addTag(tags, `timing:${lower(trigger.turn_restriction)}`);
  }
  if (trigger.once_per_turn) addTag(tags, "flag:once_per_turn");
}

function isWipe(target: Target | undefined): boolean {
  return (
    target?.count !== undefined && "all" in target.count && target.count.all
  );
}

function visitRemovalAction(action: Action, tags: Set<EffectFacetTag>): void {
  let values: string[] = [];
  switch (action.type) {
    case "KO":
      values = ["ko"];
      break;
    case "TRASH_CARD":
      values = ["trash"];
      break;
    case "RETURN_TO_HAND":
      values = ["bounce"];
      break;
    case "RETURN_TO_DECK":
      if (action.params?.position === "BOTTOM") values = ["bottom_deck"];
      else if (action.params?.position === "TOP") values = ["top_deck"];
      else values = ["bottom_deck", "top_deck"];
      break;
  }

  const wipe = isWipe(action.target) ? ":wipe" : "";
  for (const value of values) addTag(tags, `removal:${value}${wipe}`);
}

function visitDonAction(action: Action, tags: Set<EffectFacetTag>): void {
  let value: string | undefined;
  let qualifier = controllerQualifier(action.target);
  switch (action.type) {
    case "ADD_DON_FROM_DECK":
      value = "ramp";
      break;
    case "SET_DON_ACTIVE":
      value = "untap";
      break;
    case "GIVE_DON":
    case "DISTRIBUTE_DON":
    case "REDISTRIBUTE_DON":
      value = "give";
      break;
    case "GIVE_OPPONENT_DON_TO_OPPONENT":
      value = "give";
      qualifier = "opponent";
      break;
    case "RETURN_DON_TO_DECK":
    case "RETURN_ATTACHED_DON_TO_COST":
      value = "return";
      break;
    case "FORCE_OPPONENT_DON_RETURN":
      value = "return";
      qualifier = "opponent";
      break;
    case "REST_DON":
      value = "rest";
      break;
    case "REST_OPPONENT_DON":
      value = "rest";
      qualifier = "opponent";
      break;
  }
  if (value) addTag(tags, qualifiedTag("don", value, qualifier));
}

function visitLifeAction(action: Action, tags: Set<EffectFacetTag>): void {
  let value: string | undefined;
  let qualifier = controllerQualifier(action.target);
  switch (action.type) {
    case "ADD_TO_LIFE":
    case "ADD_TO_LIFE_FROM_DECK":
    case "ADD_TO_LIFE_FROM_HAND":
    case "ADD_TO_LIFE_FROM_FIELD":
      value = "add";
      break;
    case "TRASH_FROM_LIFE":
    case "TRASH_FACE_UP_LIFE":
      value = "trash";
      break;
    case "LIFE_TO_HAND":
      value = "to_hand";
      break;
    case "LIFE_CARD_TO_DECK":
      value = "to_deck";
      break;
    case "TURN_LIFE_FACE_UP":
      value = "face_up";
      break;
    case "TURN_LIFE_FACE_DOWN":
    case "TURN_ALL_LIFE_FACE_DOWN":
      value = "face_down";
      break;
    case "LIFE_SCRY":
    case "REORDER_ALL_LIFE":
      value = "scry";
      break;
    case "DEAL_DAMAGE":
      value = "damage";
      qualifier = "opponent";
      break;
    case "SELF_TAKE_DAMAGE":
      value = "damage";
      qualifier = "self";
      break;
    case "DRAIN_LIFE_TO_THRESHOLD":
      value = "drain";
      break;
  }
  if (value) addTag(tags, qualifiedTag("life", value, qualifier));
}

function visitStateAction(action: Action, tags: Set<EffectFacetTag>): void {
  const qualifier = controllerQualifier(action.target);
  switch (action.type) {
    case "SET_REST":
      addTag(tags, qualifiedTag("state", "rest", qualifier));
      break;
    case "SET_ACTIVE":
      addTag(tags, qualifiedTag("state", "active", qualifier));
      break;
    case "APPLY_PROHIBITION":
      addTag(tags, "state:prohibit");
      break;
    case "NEGATE_EFFECTS":
    case "NEGATE_TRIGGER_TYPE":
      addTag(tags, "state:negate");
      break;
    case "REDIRECT_ATTACK":
      addTag(tags, "state:redirect");
      break;
  }
}

function numericDirection(value: unknown): "up" | "down" | undefined {
  if (typeof value === "number") {
    if (value > 0) return "up";
    if (value < 0) return "down";
    return undefined;
  }
  return value && typeof value === "object" ? "up" : undefined;
}

function visitStatChange(
  change: Action | Modifier,
  tags: Set<EffectFacetTag>
): void {
  const qualifier = controllerQualifier(change.target);
  const params = change.params as Record<string, unknown> | undefined;
  switch (change.type) {
    case "MODIFY_POWER": {
      const direction = numericDirection(params?.amount);
      if (direction) {
        addTag(tags, qualifiedTag("stat", `power_${direction}`, qualifier));
      }
      break;
    }
    case "MODIFY_COST": {
      const direction = numericDirection(params?.amount);
      if (direction) {
        addTag(tags, qualifiedTag("stat", `cost_${direction}`, qualifier));
      }
      break;
    }
    case "SET_POWER_TO_ZERO":
      addTag(tags, "stat:power_to_zero");
      break;
    case "SET_BASE_POWER":
      addTag(tags, "stat:set_base_power");
      break;
    case "SET_COST":
      addTag(tags, "stat:set_cost");
      break;
    case "COPY_POWER":
      addTag(tags, "stat:copy_power");
      break;
    case "SWAP_BASE_POWER":
      addTag(tags, "stat:swap_base_power");
      break;
    case "GRANT_ATTRIBUTE":
      addTag(tags, "stat:grant_attribute");
      break;
  }
}

function visitHandAction(action: Action, tags: Set<EffectFacetTag>): void {
  const simpleTags: Partial<Record<Action["type"], string>> = {
    DRAW: "draw",
    SEARCH_DECK: "search",
    FULL_DECK_SEARCH: "search",
    SEARCH_TRASH_THE_REST: "search_trash",
    DECK_SCRY: "scry",
    MILL: "mill",
    REVEAL: "reveal",
    REVEAL_HAND: "reveal",
    TRASH_FROM_HAND: "discard",
    PLACE_HAND_TO_DECK: "to_deck",
    RETURN_HAND_TO_DECK: "to_deck",
    HAND_WHEEL: "wheel",
    ACTIVATE_EVENT_FROM_HAND: "event_reuse",
    ACTIVATE_EVENT_FROM_TRASH: "event_reuse",
    REUSE_EFFECT: "event_reuse",
    GRANT_COUNTER: "grant_counter",
    SEARCH_AND_PLAY: "play_from_deck",
    PLAY_FROM_LIFE: "play_from_life",
  };
  const value = simpleTags[action.type];
  if (value) addTag(tags, `hand:${value}`);

  if (action.type !== "PLAY_CARD") return;
  const configuredSource =
    action.params?.source_zone ?? action.target?.source_zone;
  const sourceZones = Array.isArray(configuredSource)
    ? configuredSource
    : configuredSource
      ? [configuredSource]
      : [];
  for (const sourceZone of sourceZones) {
    if (sourceZone === "HAND_OR_TRASH") {
      addTag(tags, "hand:play_from_hand");
      addTag(tags, "hand:play_from_trash");
    } else if (sourceZone === "HAND") {
      addTag(tags, "hand:play_from_hand");
    } else if (sourceZone === "TRASH") {
      addTag(tags, "hand:play_from_trash");
    } else if (sourceZone === "DECK" || sourceZone === "DECK_TOP") {
      addTag(tags, "hand:play_from_deck");
    } else if (sourceZone === "LIFE") {
      addTag(tags, "hand:play_from_life");
    }
  }
}

function visitGrantedKeyword(
  value: Action | Modifier,
  tags: Set<EffectFacetTag>
): void {
  if (value.type !== "GRANT_KEYWORD") return;
  const keyword = (value.params as { keyword?: unknown } | undefined)?.keyword;
  if (typeof keyword === "string" && KEYWORDS.has(keyword)) {
    addTag(tags, `keyword:${lower(keyword)}:granted`);
  }
}

function visitAction(action: Action, tags: Set<EffectFacetTag>): void {
  visitRemovalAction(action, tags);
  visitDonAction(action, tags);
  visitLifeAction(action, tags);
  visitStateAction(action, tags);
  visitStatChange(action, tags);
  visitHandAction(action, tags);
  visitGrantedKeyword(action, tags);
  visitConditions(action.conditions, tags);
  visitDurationConditions(action.duration, tags);

  if (action.type === "PLAYER_CHOICE" || action.type === "OPPONENT_CHOICE") {
    for (const option of action.params?.options ?? []) {
      for (const nestedAction of option) visitAction(nestedAction, tags);
    }
  }
}

function visitCost(cost: Cost, tags: Set<EffectFacetTag>): void {
  if (cost.type === "CHOICE") {
    for (const option of cost.options) {
      for (const nestedCost of option) visitCost(nestedCost, tags);
    }
    return;
  }

  addTag(tags, `cost:${lower(cost.type)}`);
  for (const nestedCost of cost.options ?? []) visitCost(nestedCost, tags);
}

function visitConditions(value: unknown, tags: Set<EffectFacetTag>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) visitConditions(entry, tags);
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.type === "string" && CONDITION_TYPES.has(record.type)) {
    addTag(tags, `condition:${lower(record.type)}`);
  }
  for (const nested of Object.values(record)) visitConditions(nested, tags);
}

function visitDurationConditions(
  duration: { type: string; condition?: unknown } | undefined,
  tags: Set<EffectFacetTag>
): void {
  if (duration?.type === "WHILE_CONDITION") {
    visitConditions(duration.condition, tags);
  }
}

function collectTraitValues(
  value: Record<string, unknown>,
  role: TraitRole,
  blockId: string,
  refs: Map<string, EffectTraitRef>
): void {
  const filter = Object.fromEntries(
    Object.entries(value).filter(([key]) => TARGET_FILTER_KEY_SET.has(key))
  ) as SharedTargetFilter;

  const record = (trait: string, traitRole: EffectTraitRef["role"]): void => {
    const ref = { trait, role: traitRole, blockId };
    refs.set(`${blockId}\u0000${traitRole}\u0000${trait}`, ref);
  };
  for (const trait of filter.traits ?? []) record(trait, role);
  for (const trait of filter.traits_any_of ?? []) record(trait, role);
  for (const trait of filter.traits_contains ?? []) record(trait, role);
  for (const trait of filter.traits_exclude ?? []) record(trait, "exclude");
}

function visitTraitReferences(
  value: unknown,
  role: TraitRole,
  blockId: string,
  refs: Map<string, EffectTraitRef>
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) visitTraitReferences(entry, role, blockId, refs);
    return;
  }

  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : undefined;
  const nestedRole =
    role !== "cost" && type && SEARCH_ACTION_TYPES.has(type as Action["type"])
      ? "search"
      : role;
  collectTraitValues(record, nestedRole, blockId, refs);

  for (const [key, nested] of Object.entries(record)) {
    visitTraitReferences(
      nested,
      key === "costs" ? "cost" : nestedRole,
      blockId,
      refs
    );
  }
}

function visitBlock(
  block: EffectBlock,
  tags: Set<EffectFacetTag>,
  traits: Map<string, EffectTraitRef>
): void {
  addTag(tags, `category:${block.category}`);
  if (block.trigger) visitTrigger(block.trigger, tags);

  for (const keyword of block.flags?.keywords ?? []) {
    addTag(tags, `keyword:${lower(keyword)}`);
  }
  if (block.flags?.once_per_turn) addTag(tags, "flag:once_per_turn");
  if (block.flags?.optional) addTag(tags, "flag:optional");
  if (block.flags?.lock_on_decline) addTag(tags, "flag:lock_on_decline");

  if (
    (block.category === "auto" || block.category === "activate") &&
    !block.costs?.length
  ) {
    addTag(tags, "cost:none");
  }
  for (const cost of block.costs ?? []) visitCost(cost, tags);
  for (const action of block.actions ?? []) visitAction(action, tags);
  for (const action of block.replacement_actions ?? [])
    visitAction(action, tags);
  for (const modifier of block.modifiers ?? []) {
    visitStatChange(modifier, tags);
    visitGrantedKeyword(modifier, tags);
    visitDurationConditions(modifier.duration, tags);
  }
  for (const prohibition of block.prohibitions ?? []) {
    addTag(tags, "state:prohibit");
    visitConditions(prohibition.conditions, tags);
    visitDurationConditions(prohibition.duration, tags);
  }

  visitConditions(block.conditions, tags);
  visitConditions(block.post_cost_conditions, tags);
  visitDurationConditions(block.duration, tags);
  visitTraitReferences(block, "target", block.id, traits);
}

/**
 * Extract deterministic, card-level Tier 1 facets from one authored schema.
 * The function reads only its argument and returns newly allocated arrays.
 */
export function extractCardFacets(schema: EffectSchema): {
  tags: EffectFacetTag[];
  effectTraits: EffectTraitRef[];
} {
  const tags = new Set<EffectFacetTag>();
  const traits = new Map<string, EffectTraitRef>();

  for (const block of schema.effects) visitBlock(block, tags, traits);

  return {
    tags: ORDERED_TAGS.filter((tag) => tags.has(tag)),
    effectTraits: [...traits.values()].sort(
      (left, right) =>
        compareText(left.trait, right.trait) ||
        compareText(left.role, right.role) ||
        compareText(left.blockId, right.blockId)
    ),
  };
}
