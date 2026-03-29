/**
 * M4 Effect Engine — Complete TypeScript Types
 *
 * Translated from docs/game-engine/ spec files 01-11.
 * This is the canonical type system for the effect schema.
 */

// ─── Core Enums ───────────────────────────────────────────────────────────────

export type EffectCategory =
  | "auto"
  | "activate"
  | "permanent"
  | "replacement"
  | "rule_modification";

export type EffectZone = "FIELD" | "HAND" | "ANY";

export type Controller = "SELF" | "OPPONENT" | "EITHER" | "ANY";

export type CardColor = "RED" | "BLUE" | "GREEN" | "PURPLE" | "BLACK" | "YELLOW";

export type Attribute = "SLASH" | "STRIKE" | "RANGED" | "SPECIAL" | "WISDOM";

export type NumericOperator = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type CardState = "ACTIVE" | "RESTED";

export type ChainConnector = "THEN" | "IF_DO" | "AND";

// ─── Top-Level Schema ─────────────────────────────────────────────────────────

export interface EffectSchema {
  card_id?: string;
  card_name?: string;
  card_type?: string;
  effects: EffectBlock[];
  rule_modifications?: RuleModification[];
}

export interface EffectBlock {
  id: string;
  category: EffectCategory;

  // Activation (auto / activate)
  trigger?: Trigger;
  costs?: Cost[];

  // Conditions (all categories)
  conditions?: Condition;

  // Resolution (auto / activate)
  actions?: Action[];

  // Continuous (permanent)
  modifiers?: Modifier[];
  prohibitions?: Prohibition[];

  // Interception (replacement)
  replaces?: ReplacementTrigger;
  replacement_actions?: Action[];

  // Game rules (rule_modification)
  rule?: RuleModification;

  // Metadata
  flags?: EffectFlags;
  duration?: Duration;
  zone?: EffectZone;
}

export interface EffectFlags {
  once_per_turn?: boolean;
  optional?: boolean;
  keywords?: Keyword[];
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

export type Keyword =
  | "RUSH"
  | "BLOCKER"
  | "DOUBLE_ATTACK"
  | "BANISH"
  | "UNBLOCKABLE"
  | "RUSH_CHARACTER"
  | "CAN_ATTACK_ACTIVE";

// ─── Triggers (02-TRIGGERS) ──────────────────────────────────────────────────

export type Trigger = KeywordTrigger | CustomTrigger | CompoundTrigger;

export interface KeywordTrigger {
  keyword: KeywordTriggerType;
  turn_restriction?: TurnRestriction;
  once_per_turn?: boolean;
  don_requirement?: number;
  cause?: KOCause;
}

export interface CustomTrigger {
  event: CustomEventType;
  filter?: EventFilter;
  turn_restriction?: TurnRestriction;
  once_per_turn?: boolean;
  don_requirement?: number;
  quantity_threshold?: number;
}

export interface CompoundTrigger {
  any_of: Trigger[];
}

export type TurnRestriction = "YOUR_TURN" | "OPPONENT_TURN";

export type KeywordTriggerType =
  | "ON_PLAY"
  | "WHEN_ATTACKING"
  | "ON_KO"
  | "ON_BLOCK"
  | "ON_OPPONENT_ATTACK"
  | "ACTIVATE_MAIN"
  | "MAIN_EVENT"
  | "COUNTER"
  | "COUNTER_EVENT"
  | "TRIGGER"
  | "END_OF_YOUR_TURN"
  | "END_OF_OPPONENT_TURN"
  | "START_OF_TURN";

export type CustomEventType =
  | "OPPONENT_CHARACTER_KO"
  | "ANY_CHARACTER_KO"
  | "DON_RETURNED_TO_DON_DECK"
  | "DON_GIVEN_TO_CARD"
  | "EVENT_ACTIVATED"
  | "CHARACTER_PLAYED"
  | "CARD_REMOVED_FROM_LIFE"
  | "LIFE_CARD_REMOVED"
  | "TRIGGER_ACTIVATED"
  | "COMBAT_VICTORY"
  | "CHARACTER_BATTLES"
  | "END_OF_BATTLE"
  | "LIFE_COUNT_BECOMES_ZERO"
  | "CARD_ADDED_TO_HAND_FROM_LIFE"
  | "DRAW_OUTSIDE_DRAW_PHASE"
  | "CHARACTER_BECOMES_RESTED"
  | "CHARACTER_RETURNED_TO_HAND"
  | "DAMAGE_TAKEN"
  | "BLOCKER_ACTIVATED"
  | "LEADER_ATTACK_DEALS_DAMAGE"
  | "END_OF_YOUR_TURN";

export type KOCause = "ANY" | "BATTLE" | "EFFECT" | "OPPONENT_EFFECT";

export interface EventFilter {
  controller?: Controller;
  cause?: EventCause;
  target_filter?: TargetFilter;
  source_zone?: string;
  includes_trigger_keyword?: boolean;
  includes_blocker_keyword?: boolean;
  attribute?: Attribute;
  battle_target_type?: "CHARACTER" | "LEADER";
  no_base_effect?: boolean;
}

export type EventCause =
  | "BY_EFFECT"
  | "BY_YOUR_EFFECT"
  | "BY_OPPONENT_EFFECT"
  | "BY_CHARACTER_EFFECT"
  | "IN_BATTLE"
  | "ANY";

// ─── Conditions (03-CONDITIONS) ──────────────────────────────────────────────

export type Condition =
  | SimpleCondition
  | { all_of: Condition[] }
  | { any_of: Condition[] }
  | { not: Condition };

export type SimpleCondition =
  | LifeCountCondition
  | HandCountCondition
  | TrashCountCondition
  | DeckCountCondition
  | DonFieldCountCondition
  | ActiveDonCountCondition
  | AllDonStateCondition
  | CardOnFieldCondition
  | MultipleNamedCardsCondition
  | NamedCardWithPropertyCondition
  | FieldPurityCondition
  | LeaderPropertyCondition
  | SelfPowerCondition
  | SelfStateCondition
  | NoBaseEffectCondition
  | HasEffectTypeCondition
  | LacksEffectTypeCondition
  | ComparativeCondition
  | CombinedTotalCondition
  | WasPlayedThisTurnCondition
  | ActionPerformedThisTurnCondition
  | PlayMethodCondition
  | FaceUpLifeCondition
  | CardTypeInZoneCondition
  | CombinedZoneCountCondition
  | BoardWideExistenceCondition
  | RestedCardCountCondition
  | DonGivenCondition
  | TurnCountCondition
  | SourcePropertyCondition
  | RevealedCardPropertyCondition;

export interface LifeCountCondition {
  type: "LIFE_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface HandCountCondition {
  type: "HAND_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface TrashCountCondition {
  type: "TRASH_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface DeckCountCondition {
  type: "DECK_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface DonFieldCountCondition {
  type: "DON_FIELD_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface ActiveDonCountCondition {
  type: "ACTIVE_DON_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface AllDonStateCondition {
  type: "ALL_DON_STATE";
  controller: Controller;
  required_state: CardState;
}

export interface CardOnFieldCondition {
  type: "CARD_ON_FIELD";
  controller: Controller;
  filter: TargetFilter;
  count?: { operator: NumericOperator; value: number };
  exclude_self?: boolean;
}

export interface MultipleNamedCardsCondition {
  type: "MULTIPLE_NAMED_CARDS";
  controller: Controller;
  names: string[];
}

export interface NamedCardWithPropertyCondition {
  type: "NAMED_CARD_WITH_PROPERTY";
  controller: Controller;
  name: string;
  property: {
    power?: NumericRange;
    cost?: NumericRange;
  };
}

export interface FieldPurityCondition {
  type: "FIELD_PURITY";
  controller: Controller;
  filter: TargetFilter;
}

export interface LeaderPropertyCondition {
  type: "LEADER_PROPERTY";
  controller: Controller;
  property: LeaderPropertyCheck;
}

export type LeaderPropertyCheck =
  | { power: NumericRange }
  | { color_includes: CardColor }
  | { color: CardColor }
  | { trait: string }
  | { trait_contains: string }
  | { attribute: Attribute }
  | { name: string }
  | { multicolored: boolean };

export interface SelfPowerCondition {
  type: "SELF_POWER";
  operator: NumericOperator;
  value: number;
}

export interface SelfStateCondition {
  type: "SELF_STATE";
  required_state: CardState;
}

export interface NoBaseEffectCondition {
  type: "NO_BASE_EFFECT";
}

export interface HasEffectTypeCondition {
  type: "HAS_EFFECT_TYPE";
  effect_type: EffectKeyword;
}

export interface LacksEffectTypeCondition {
  type: "LACKS_EFFECT_TYPE";
  effect_type: EffectKeyword;
}

export type EffectKeyword =
  | "ON_PLAY"
  | "WHEN_ATTACKING"
  | "ON_KO"
  | "ON_BLOCK"
  | "COUNTER"
  | "TRIGGER"
  | "ACTIVATE_MAIN"
  | "BLOCKER"
  | "RUSH"
  | "DOUBLE_ATTACK"
  | "BANISH";

export interface ComparativeCondition {
  type: "COMPARATIVE";
  metric: ComparativeMetric;
  operator: NumericOperator;
  margin?: number;
}

export type ComparativeMetric = "LIFE_COUNT" | "DON_FIELD_COUNT" | "CHARACTER_COUNT";

export interface CombinedTotalCondition {
  type: "COMBINED_TOTAL";
  metric: ComparativeMetric;
  operator: NumericOperator;
  value: number;
}

export interface WasPlayedThisTurnCondition {
  type: "WAS_PLAYED_THIS_TURN";
}

export interface ActionPerformedThisTurnCondition {
  type: "ACTION_PERFORMED_THIS_TURN";
  controller: Controller;
  action: ActionReference;
  filter?: TargetFilter;
}

export type ActionReference = "ACTIVATED_EVENT" | "PLAYED_CHARACTER" | "USED_BLOCKER" | "ATTACKED";

export interface PlayMethodCondition {
  type: "PLAY_METHOD";
  method: PlaySource;
}

export type PlaySource = "FROM_HAND" | "BY_CHARACTER_EFFECT" | "BY_EVENT_EFFECT" | "BY_EFFECT";

export interface FaceUpLifeCondition {
  type: "FACE_UP_LIFE";
  controller: Controller;
  operator?: NumericOperator;
  value?: number;
}

export interface CardTypeInZoneCondition {
  type: "CARD_TYPE_IN_ZONE";
  controller: Controller;
  card_type: "CHARACTER" | "EVENT" | "STAGE" | "LEADER";
  zone: string;
  operator: NumericOperator;
  value: number;
}

export interface CombinedZoneCountCondition {
  type: "COMBINED_ZONE_COUNT";
  controller: Controller;
  zones: string[];
  operator: NumericOperator;
  value: number;
}

export interface BoardWideExistenceCondition {
  type: "BOARD_WIDE_EXISTENCE";
  filter: TargetFilter;
  count?: { operator: NumericOperator; value: number };
}

export interface RestedCardCountCondition {
  type: "RESTED_CARD_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface DonGivenCondition {
  type: "DON_GIVEN";
  controller: Controller;
  mode: "ANY_CARD_HAS_DON" | "SPECIFIC_CARD";
  operator?: NumericOperator;
  value?: number;
}

export interface TurnCountCondition {
  type: "TURN_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

export interface SourcePropertyCondition {
  type: "SOURCE_PROPERTY";
  context: SourceContext;
  source_filter: TargetFilter;
}

export type SourceContext = "KO_BY_EFFECT" | "KO_IN_BATTLE" | "REMOVAL_BY_EFFECT" | "REST_BY_EFFECT";

export interface RevealedCardPropertyCondition {
  type: "REVEALED_CARD_PROPERTY";
  result_ref: string;
  filter: TargetFilter;
}

// ─── Numeric Ranges ───────────────────────────────────────────────────────────

export type NumericRange =
  | { operator: NumericOperator; value: number | DynamicValue }
  | { min: number; max: number }
  | { any_of: NumericRange[] };

// ─── Dynamic Values ───────────────────────────────────────────────────────────

export type DynamicValue =
  | { type: "FIXED"; value: number }
  | { type: "PER_COUNT"; source: DynamicSource; multiplier: number; divisor?: number }
  | { type: "GAME_STATE"; source: GameStateSource; controller?: Controller }
  | { type: "ACTION_RESULT"; ref: string }
  | { type: "CHOSEN_VALUE" };

export type DynamicSource =
  | "CARDS_TRASHED_THIS_WAY"
  | "DON_RESTED_THIS_WAY"
  | "CHARACTERS_RETURNED_THIS_WAY"
  | "CHARACTERS_KO_THIS_WAY"
  | "CARDS_PLACED_TO_DECK_THIS_WAY"
  | "EVENTS_IN_TRASH"
  | "CARDS_IN_TRASH"
  | "REVEALED_CARD_COST"
  | "DON_GIVEN_TO_TARGET"
  | "MATCHING_CHARACTERS_ON_FIELD";

export type GameStateSource =
  | "LIFE_COUNT"
  | "OPPONENT_LIFE_COUNT"
  | "COMBINED_LIFE_COUNT"
  | "DON_FIELD_COUNT"
  | "OPPONENT_DON_FIELD_COUNT"
  | "HAND_COUNT"
  | "DECK_COUNT"
  | "RESTED_CARD_COUNT"
  | "MATCHING_CARD_COUNT"
  | "LEADER_BASE_POWER";

// ─── Actions (04-ACTIONS) ────────────────────────────────────────────────────

export interface Action {
  type: ActionType;
  target?: Target;
  params?: Record<string, unknown>;
  duration?: Duration;
  chain?: ChainConnector;
  target_ref?: string;
  result_ref?: string;
  conditions?: Condition;
}

export type ActionType =
  // Card Movement
  | "DRAW"
  | "SEARCH_DECK"
  | "TRASH_CARD"
  | "KO"
  | "RETURN_TO_HAND"
  | "RETURN_TO_DECK"
  | "PLAY_CARD"
  | "ADD_TO_LIFE"
  | "MILL"
  | "REVEAL"
  | "FULL_DECK_SEARCH"
  | "DECK_SCRY"
  | "SEARCH_TRASH_THE_REST"
  | "SEARCH_AND_PLAY"
  | "PLACE_HAND_TO_DECK"
  | "HAND_WHEEL"
  | "REVEAL_HAND"
  | "SHUFFLE_DECK"
  // Power & Stats
  | "MODIFY_POWER"
  | "SET_BASE_POWER"
  | "MODIFY_COST"
  | "SET_POWER_TO_ZERO"
  | "SWAP_BASE_POWER"
  | "COPY_POWER"
  | "SET_COST"
  // Keywords
  | "GRANT_KEYWORD"
  | "NEGATE_EFFECTS"
  // DON!!
  | "GIVE_DON"
  | "RETURN_DON_TO_DECK"
  | "ADD_DON_FROM_DECK"
  | "SET_DON_ACTIVE"
  | "REST_DON"
  | "REDISTRIBUTE_DON"
  | "FORCE_OPPONENT_DON_RETURN"
  | "REST_OPPONENT_DON"
  | "GIVE_OPPONENT_DON_TO_OPPONENT"
  | "DISTRIBUTE_DON"
  | "RETURN_ATTACHED_DON_TO_COST"
  // State Change
  | "SET_ACTIVE"
  | "SET_REST"
  | "APPLY_PROHIBITION"
  | "REMOVE_PROHIBITION"
  // Meta / Flow
  | "PLAYER_CHOICE"
  | "OPPONENT_CHOICE"
  | "CHOOSE_VALUE"
  | "WIN_GAME"
  | "OPPONENT_ACTION"
  | "EXTRA_TURN"
  | "SCHEDULE_ACTION"
  // Life Card
  | "TURN_LIFE_FACE_UP"
  | "TURN_LIFE_FACE_DOWN"
  | "TURN_ALL_LIFE_FACE_DOWN"
  | "LIFE_SCRY"
  | "REORDER_ALL_LIFE"
  | "ADD_TO_LIFE_FROM_DECK"
  | "ADD_TO_LIFE_FROM_HAND"
  | "ADD_TO_LIFE_FROM_FIELD"
  | "PLAY_FROM_LIFE"
  | "LIFE_TO_HAND"
  | "TRASH_FROM_LIFE"
  | "DRAIN_LIFE_TO_THRESHOLD"
  | "LIFE_CARD_TO_DECK"
  | "TRASH_FACE_UP_LIFE"
  // Battle
  | "REDIRECT_ATTACK"
  | "DEAL_DAMAGE"
  | "SELF_TAKE_DAMAGE"
  // Effect / Meta
  | "ACTIVATE_EVENT_FROM_HAND"
  | "ACTIVATE_EVENT_FROM_TRASH"
  | "REUSE_EFFECT"
  | "NEGATE_TRIGGER_TYPE"
  | "GRANT_ATTRIBUTE"
  | "TRASH_FROM_HAND"
  | "RETURN_HAND_TO_DECK"
  | "GRANT_COUNTER"
  // One-time modifier
  | "APPLY_ONE_TIME_MODIFIER"
  // Self-play
  | "PLAY_SELF";

// ─── Action Params Map ──────────────────────────────────────────────────────
// Maps each ActionType to its typed params shape. Used by getActionParams()
// to provide type-safe access in action handlers without per-site `as any` casts.

export interface ActionParamsMap {
  // No params (target-only)
  KO: Record<string, never>;
  RETURN_TO_HAND: Record<string, never>;
  SET_ACTIVE: Record<string, never>;
  SET_REST: Record<string, never>;
  NEGATE_EFFECTS: Record<string, never>;
  TRASH_FACE_UP_LIFE: Record<string, never>;
  TURN_ALL_LIFE_FACE_DOWN: Record<string, never>;
  REORDER_ALL_LIFE: Record<string, never>;
  SHUFFLE_DECK: Record<string, never>;
  PLAY_SELF: Record<string, never>;
  TRASH_CARD: Record<string, never>;

  // Simple amount
  DRAW: { amount: number | DynamicValue };
  MILL: { amount?: number };
  GIVE_DON: { amount?: number };
  ADD_DON_FROM_DECK: { amount?: number; target_state?: "ACTIVE" | "RESTED" };
  FORCE_OPPONENT_DON_RETURN: { amount?: number };
  SET_DON_ACTIVE: { amount?: number };
  REST_OPPONENT_DON: { amount?: number };
  RETURN_DON_TO_DECK: { amount?: number };
  TRASH_FROM_HAND: { amount?: number | DynamicValue };
  REVEAL: { amount?: number; source?: string };
  REVEAL_HAND: { amount?: number };

  // Amount + position
  PLACE_HAND_TO_DECK: { amount?: number; position?: "TOP" | "BOTTOM" };
  RETURN_HAND_TO_DECK: { position?: "TOP" | "BOTTOM" };
  LIFE_CARD_TO_DECK: { amount?: number; position?: "TOP" | "BOTTOM" };
  TURN_LIFE_FACE_DOWN: { amount?: number };

  // Power/cost modification
  MODIFY_POWER: { amount: number | DynamicValue };
  MODIFY_COST: { amount: number | DynamicValue };
  GRANT_KEYWORD: { keyword: string };
  GRANT_ATTRIBUTE: { attribute: string };

  // Search
  SEARCH_DECK: { look_at?: number; pick?: CountMode; filter?: TargetFilter; rest_destination?: string };
  FULL_DECK_SEARCH: { filter?: TargetFilter; shuffle_after?: boolean };
  DECK_SCRY: { look_at?: number };
  SEARCH_AND_PLAY: { look_at?: number; filter?: TargetFilter; rest_destination?: string; search_full_deck?: boolean; shuffle_after?: boolean; entry_state?: "ACTIVE" | "RESTED" };

  // Play/move
  PLAY_CARD: { source_zone?: string; cost_override?: string; entry_state?: "ACTIVE" | "RESTED" };
  RETURN_TO_DECK: { position?: "TOP" | "BOTTOM" };

  // Life
  ADD_TO_LIFE_FROM_DECK: { amount?: number; face?: "UP" | "DOWN"; position?: "TOP" | "BOTTOM" };
  ADD_TO_LIFE_FROM_HAND: { amount?: number; face?: "UP" | "DOWN"; position?: "TOP" | "BOTTOM" };
  ADD_TO_LIFE_FROM_FIELD: { face?: "UP" | "DOWN" };
  TRASH_FROM_LIFE: { amount?: number; position?: "TOP" | "BOTTOM"; controller?: string };
  LIFE_TO_HAND: { amount?: number; position?: "TOP" | "BOTTOM" };
  PLAY_FROM_LIFE: { position?: "TOP" | "BOTTOM"; entry_state?: "ACTIVE" | "RESTED" };
  TURN_LIFE_FACE_UP: { amount?: number; position?: "TOP" | "BOTTOM" | "ALL" };
  LIFE_SCRY: { look_at?: number };
  DRAIN_LIFE_TO_THRESHOLD: { threshold?: number };

  // Hand/deck
  HAND_WHEEL: { trash_count?: number | DynamicValue; draw_count?: number | DynamicValue; amount?: number };

  // Choice/meta
  PLAYER_CHOICE: { options: Action[][]; labels?: string[] };
  OPPONENT_CHOICE: { options: Action[][]; labels?: string[] };
  OPPONENT_ACTION: { action: Action };

  // Effects/scheduling
  SCHEDULE_ACTION: { timing?: ScheduleTiming; action: Action; bound_to?: string | null };
  APPLY_PROHIBITION: { prohibition_type: string; scope?: Record<string, unknown>; conditional_override?: Record<string, unknown> };
  APPLY_ONE_TIME_MODIFIER: { modification: Modifier; applies_to: Record<string, unknown> };
  REUSE_EFFECT: { target_effect: string };

  // Unimplemented — forward-compatible
  ADD_TO_LIFE: Record<string, unknown>;
  SEARCH_TRASH_THE_REST: { look_at?: number; pick?: CountMode; filter?: TargetFilter; rest_destination?: string; pick_destination?: string };
  SET_BASE_POWER: Record<string, unknown>;
  SET_POWER_TO_ZERO: Record<string, unknown>;
  SWAP_BASE_POWER: Record<string, unknown>;
  COPY_POWER: Record<string, unknown>;
  SET_COST: Record<string, unknown>;
  REMOVE_KEYWORD: Record<string, unknown>;
  GRANT_COUNTER: Record<string, unknown>;
  REST_DON: Record<string, unknown>;
  REDISTRIBUTE_DON: Record<string, unknown>;
  GIVE_OPPONENT_DON_TO_OPPONENT: Record<string, unknown>;
  DISTRIBUTE_DON: Record<string, unknown>;
  RETURN_ATTACHED_DON_TO_COST: Record<string, unknown>;
  REMOVE_PROHIBITION: Record<string, unknown>;
  CHOOSE_VALUE: Record<string, unknown>;
  WIN_GAME: Record<string, unknown>;
  EXTRA_TURN: Record<string, unknown>;
  REDIRECT_ATTACK: Record<string, unknown>;
  DEAL_DAMAGE: Record<string, unknown>;
  SELF_TAKE_DAMAGE: Record<string, unknown>;
  ACTIVATE_EVENT_FROM_HAND: Record<string, unknown>;
  ACTIVATE_EVENT_FROM_TRASH: Record<string, unknown>;
  NEGATE_TRIGGER_TYPE: Record<string, unknown>;
}

/**
 * Type-safe params accessor for action handlers.
 * Replaces scattered `as any` casts with a single auditable assertion.
 */
export function getActionParams<T extends keyof ActionParamsMap>(
  action: Action,
  _type: T,
): ActionParamsMap[T] {
  return (action.params ?? {}) as ActionParamsMap[T];
}

// ─── Targeting (05-TARGETING) ────────────────────────────────────────────────

export interface Target {
  type?: TargetType;
  controller?: Controller;
  count?: CountMode;
  filter?: TargetFilter;
  source_zone?: SourceZone | SourceZone[];
  self_ref?: boolean;

  // Result ref (for SELECTED_CARDS target type)
  ref?: string;

  // Advanced patterns
  aggregate_constraint?: AggregateConstraint;
  uniqueness_constraint?: UniquenessConstraint;
  dual_targets?: DualTarget[];
  named_distribution?: NamedCardDistribution;
  per_type_selection?: PerTypeSelection;
  mixed_pool?: MixedPool;
}

export type TargetType =
  | "SELF"
  | "YOUR_LEADER"
  | "OPPONENT_LEADER"
  | "CHARACTER"
  | "STAGE"
  | "LEADER_OR_CHARACTER"
  | "ALL_YOUR_CHARACTERS"
  | "ALL_OPPONENT_CHARACTERS"
  | "CHARACTER_CARD"
  | "STAGE_CARD"
  | "EVENT_CARD"
  | "CARD_IN_HAND"
  | "CARD_IN_TRASH"
  | "CARD_ON_TOP_OF_DECK"
  | "CARD_IN_DECK"
  | "LIFE_CARD"
  | "DON_IN_COST_AREA"
  | "DON_ATTACHED"
  | "DON_IN_DON_DECK"
  | "PLAYER"
  | "SELECTED_CARDS"
  | "OPPONENT_LIFE";

export type CountMode =
  | { exact: number }
  | { up_to: number }
  | { all: true }
  | { any_number: true };

export type SourceZone = "HAND" | "TRASH" | "DECK" | "DECK_TOP" | "LIFE" | "FIELD" | "DON_DECK";

export interface TargetFilter {
  // Cost filters
  cost_exact?: number | DynamicValue;
  cost_min?: number | DynamicValue;
  cost_max?: number | DynamicValue;
  cost_range?: { min: number; max: number };
  base_cost_exact?: number;
  base_cost_min?: number;
  base_cost_max?: number;

  // Power filters
  power_exact?: number | DynamicValue;
  power_min?: number | DynamicValue;
  power_max?: number | DynamicValue;
  power_range?: { min: number; max: number };
  base_power_exact?: number;
  base_power_min?: number;
  base_power_max?: number;

  // Color filters
  color?: CardColor;
  color_includes?: CardColor[];
  color_not_matching_ref?: string;

  // Trait filters
  traits?: string[];
  traits_any_of?: string[];
  traits_contains?: string[];
  traits_exclude?: string[];

  // Name filters
  name?: string;
  name_any_of?: string[];
  name_includes?: string;
  exclude_name?: string;
  exclude_self?: boolean;
  name_matching_ref?: string;

  // Keyword / ability filters
  keywords?: Keyword[];
  has_trigger?: boolean;
  attribute?: Attribute;
  attribute_not?: Attribute;
  has_effect?: boolean;
  no_base_effect?: boolean;
  lacks_effect_type?: string;
  has_counter?: boolean;

  // Card type filter
  card_type?: "CHARACTER" | "EVENT" | "STAGE" | "LEADER" | string[];

  // State filters
  is_rested?: boolean;
  is_active?: boolean;
  state?: CardState;

  // DON-given filters
  don_given_count?: DonGivenFilter;

  // Ref filters
  exclude_ref?: string;

  // Play filter
  unique_names?: boolean;

  // Disjunctive (OR)
  any_of?: TargetFilter[];
}

export interface DonGivenFilter {
  operator: NumericOperator;
  value: number | DynamicValue;
}

export interface AggregateConstraint {
  property: "power" | "cost";
  operator: "<=" | ">=" | "==";
  value: number | DynamicValue;
}

export interface UniquenessConstraint {
  field: "name" | "color";
}

export interface DualTarget {
  filter: TargetFilter;
  count: CountMode;
}

export interface NamedCardDistribution {
  names: string[];
  shared_filter?: TargetFilter;
}

export interface PerTypeSelection {
  types: TargetType[];
  count_per_type: CountMode;
}

export interface MixedPool {
  types: TargetType[];
  total_count: CountMode;
}

// ─── Costs (01-SCHEMA-OVERVIEW) ──────────────────────────────────────────────

export interface Cost {
  type: CostType;
  amount?: number | "ANY_NUMBER" | DynamicValue;
  filter?: TargetFilter;
  target?: Target;
  position?: "TOP" | "BOTTOM" | "TOP_OR_BOTTOM";
}

export type CostType =
  | "DON_MINUS"
  | "DON_REST"
  | "VARIABLE_DON_RETURN"
  | "REST_SELF"
  | "TRASH_SELF"
  | "TRASH_FROM_HAND"
  | "TRASH_FROM_LIFE"
  | "PLACE_HAND_TO_DECK"
  | "REVEAL_FROM_HAND"
  | "PLAY_NAMED_CARD_FROM_HAND"
  | "REST_CARDS"
  | "REST_NAMED_CARD"
  | "KO_OWN_CHARACTER"
  | "TRASH_OWN_CHARACTER"
  | "RETURN_OWN_CHARACTER_TO_HAND"
  | "PLACE_OWN_CHARACTER_TO_DECK"
  | "PLACE_STAGE_TO_DECK"
  | "PLACE_FROM_TRASH_TO_DECK"
  | "LEADER_POWER_REDUCTION"
  | "GIVE_OPPONENT_DON"
  | "RETURN_ATTACHED_DON_TO_COST"
  | "PLACE_SELF_AND_HAND_TO_DECK"
  | "LIFE_TO_HAND"
  | "REST_DON"
  | "TURN_LIFE_FACE_UP"
  | "TURN_LIFE_FACE_DOWN";

// ─── Durations (01-SCHEMA-OVERVIEW) ──────────────────────────────────────────

export type Duration =
  | { type: "THIS_TURN" }
  | { type: "THIS_BATTLE" }
  | { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }
  | { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
  | { type: "UNTIL_END_OF_YOUR_NEXT_TURN" }
  | { type: "UNTIL_START_OF_YOUR_NEXT_TURN" }
  | { type: "SKIP_NEXT_REFRESH" }
  | { type: "PERMANENT" }
  | { type: "WHILE_CONDITION"; condition: Condition };

export type ScheduleTiming =
  | "END_OF_THIS_TURN"
  | "END_OF_THIS_BATTLE"
  | "START_OF_NEXT_MAIN_PHASE"
  | "START_OF_OPPONENT_NEXT_MAIN_PHASE";

// ─── Modifiers (08-ENGINE-ARCHITECTURE) ──────────────────────────────────────

export type ModifierType =
  | ActionType
  | "SET_POWER"
  | "MODIFY_POWER"
  | "SET_COST"
  | "MODIFY_COST"
  | "GRANT_KEYWORD"
  | "REMOVE_KEYWORD"
  | "REPLACEMENT_EFFECT";

export interface Modifier {
  type: ModifierType;
  target?: Target;
  params?: Record<string, unknown>;
  duration?: Duration;
}

// ─── Prohibitions (06-PROHIBITIONS-AND-REPLACEMENTS) ─────────────────────────

export interface Prohibition {
  type: ProhibitionType;
  target?: Target;
  scope?: ProhibitionScope;
  duration?: Duration;
  conditional_override?: ConditionalOverride;
  conditions?: Condition;
}

export type ProhibitionType =
  | "CANNOT_BE_KO"
  | "CANNOT_BE_RESTED"
  | "CANNOT_BE_REMOVED_FROM_FIELD"
  | "CANNOT_ATTACK"
  | "CANNOT_BLOCK"
  | "CANNOT_BE_BLOCKED"
  | "CANNOT_PLAY_CARDS"
  | "CANNOT_PLAY_CHARACTER"
  | "CANNOT_PLAY_EVENT"
  | "CANNOT_USE_COUNTER"
  | "CANNOT_USE_BLOCKER"
  | "CANNOT_ACTIVATE_EFFECT"
  | "CANNOT_ACTIVATE_ON_PLAY"
  | "CANNOT_ADD_LIFE"
  | "CANNOT_DRAW"
  | "CANNOT_BE_PLAYED_BY_EFFECTS"
  | "CANNOT_ACTIVATE_BLOCKER"
  | "CANNOT_ADD_LIFE_TO_HAND"
  | "CANNOT_SET_DON_ACTIVE"
  | "CANNOT_LEAVE_FIELD"
  | "CANNOT_REFRESH"
  | "CANNOT_ATTACH_DON"
  | "CANNOT_BE_RETURNED_TO_HAND"
  | "CANNOT_BE_RETURNED_TO_DECK";

export interface ProhibitionScope {
  cause?: KOCause | "BY_OPPONENT_EFFECT" | "ANY";
  controller?: Controller;
  filter?: TargetFilter;
  source_filter?: TargetFilter;
  uses_per_turn?: number;
  card_type_filter?: string;
  cost_filter?: { operator: NumericOperator; value: number };
  from_zone?: string;
  when_attacking?: Target;
}

export type ConditionalOverride = Condition;

// ─── Replacement Effects (06-PROHIBITIONS-AND-REPLACEMENTS) ──────────────────

export interface ReplacementTrigger {
  event: ReplacementEvent;
  target_filter?: TargetFilter;
  cause_filter?: CauseFilter;
}

export type ReplacementEvent =
  | "WOULD_BE_KO"
  | "WOULD_BE_REMOVED_FROM_FIELD"
  | "WOULD_LEAVE_FIELD"
  | "WOULD_BE_RESTED"
  | "WOULD_LOSE_GAME"
  | "LIFE_ADDED_TO_HAND";

export interface CauseFilter {
  by: "OPPONENT_EFFECT" | "ANY_EFFECT" | "ANY";
}

// ─── Rule Modifications (07-RULE-MODIFICATIONS) ─────────────────────────────

export type RuleModification =
  | NameAlias
  | CounterGrant
  | DeckRestriction
  | CopyLimitOverride
  | DonDeckSizeOverride
  | DonPhaseBehavior
  | LossConditionMod
  | StartOfGameEffect
  | TriggerTypeNegation
  | PlayStateMod
  | DamageRuleMod;

export interface NameAlias {
  rule_type: "NAME_ALIAS";
  aliases: string[];
}

export interface CounterGrant {
  rule_type: "COUNTER_GRANT";
  value: number;
  filter: TargetFilter;
}

export interface DeckRestriction {
  rule_type: "DECK_RESTRICTION";
  restriction: "CANNOT_INCLUDE" | "ONLY_INCLUDE";
  filter: TargetFilter;
}

export interface CopyLimitOverride {
  rule_type: "COPY_LIMIT_OVERRIDE";
  limit: "UNLIMITED";
}

export interface DonDeckSizeOverride {
  rule_type: "DON_DECK_SIZE_OVERRIDE";
  size: number;
}

export interface DonPhaseBehavior {
  rule_type: "DON_PHASE_BEHAVIOR";
  condition?: Condition;
  count: number;
  destination: "GIVEN_TO_LEADER" | "GIVEN_TO_CHARACTER" | "PLACED_RESTED";
}

export interface LossConditionMod {
  rule_type: "LOSS_CONDITION_MOD";
  trigger_event: "DECK_OUT";
  modification: "WIN_INSTEAD" | "DELAYED_LOSS";
  delay?: { timing: "END_OF_TURN" };
}

export interface StartOfGameEffect {
  rule_type: "START_OF_GAME_EFFECT";
  actions: Action[];
}

export interface TriggerTypeNegation {
  rule_type: "TRIGGER_TYPE_NEGATION";
  trigger_type: KeywordTriggerType;
  affected_controller: Controller;
}

export interface PlayStateMod {
  rule_type: "PLAY_STATE_MOD";
  card_type: "CHARACTER" | "STAGE" | "ANY";
  entry_state: "RESTED";
}

export interface DamageRuleMod {
  rule_type: "DAMAGE_RULE_MOD";
  applies_to: "FACE_UP_LIFE";
  destination: "DECK_BOTTOM" | "TRASH";
  instead_of: "HAND";
}

// ─── Runtime Effect State (08-ENGINE-ARCHITECTURE) ───────────────────────────

export interface RuntimeActiveEffect {
  id: string;
  sourceCardInstanceId: string;
  sourceEffectBlockId: string;
  category: EffectCategory;
  modifiers: Modifier[];
  duration: Duration;
  expiresAt: ExpiryTiming;
  controller: 0 | 1;
  appliesTo: string[];  // target CardInstance.instanceIds
  timestamp: number;
}

export type ExpiryTiming =
  | { wave: "END_OF_END_PHASE"; turn: number }
  | { wave: "END_OF_TURN"; turn: number }
  | { wave: "REFRESH_PHASE"; turn: number }
  | { wave: "END_OF_BATTLE"; battleId: string }
  | { wave: "SOURCE_LEAVES_ZONE" }
  | { wave: "CONDITION_FALSE" }
  | { wave: "NEVER" };

export interface RuntimeProhibition {
  id: string;
  sourceCardInstanceId: string;
  sourceEffectBlockId: string;
  prohibitionType: ProhibitionType;
  scope: ProhibitionScope;
  duration: Duration;
  controller: 0 | 1;
  appliesTo: string[];  // CardInstance.instanceIds or player indices
  usesRemaining: number | null;
  conditionalOverride?: ConditionalOverride;
}

export interface RuntimeScheduledAction {
  id: string;
  timing: ScheduleTiming;
  action: Action;
  boundToInstanceId: string | null;
  sourceEffectId: string;
  controller: 0 | 1;
}

export interface RuntimeOneTimeModifier {
  id: string;
  appliesTo: { action: ModifierType; filter?: TargetFilter };
  modification: Modifier;
  expires: Duration;
  consumed: boolean;
  controller: 0 | 1;
}

export interface RuntimeRegisteredTrigger {
  id: string;
  sourceCardInstanceId: string;
  effectBlockId: string;
  trigger: Trigger;
  effectBlock: EffectBlock;
  zone: EffectZone;
  controller: 0 | 1;
}

// ─── Effect Resolution Context ───────────────────────────────────────────────

export interface EffectResolutionContext {
  sourceCardInstanceId: string;
  sourceEffectBlockId: string;
  controller: 0 | 1;
  resultRefs: Map<string, EffectResult>;
  costResults: CostResult;
}

export interface EffectResult {
  targetInstanceIds: string[];
  count: number;
  value?: unknown;
}

export interface CostResult {
  donRestedCount: number;
  cardsTrashedCount: number;
  cardsReturnedCount: number;
  cardsPlacedToDeckCount: number;
  charactersKoCount: number;
}
