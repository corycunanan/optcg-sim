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

  // Conditions (all categories) — evaluated BEFORE optional activation and
  // cost payment. Use only for pre-colon/pre-cost predicates.
  conditions?: Condition;

  // OPT-437: post-colon "If ..." gate — evaluated exactly ONCE after costs
  // are fully paid, immediately before the action chain starts. When false,
  // every action in the block is skipped (Rules 8-3-1/8-3-3/4-10-1: the cost
  // is still paid; the entire post-colon remainder cannot resolve). Never
  // re-evaluated on mid-chain resumes.
  post_cost_conditions?: Condition;

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

/**
 * Block-level [Once Per Turn]. Canonical home is `flags.once_per_turn`, but
 * many schemas across sets declare it on the trigger object (the trigger
 * types also allow it) — the engine honors both placements.
 */
export function isOncePerTurnBlock(block: EffectBlock): boolean {
  if (block.flags?.once_per_turn) return true;
  const trigger = block.trigger as { once_per_turn?: boolean } | undefined;
  return trigger?.once_per_turn === true;
}

export interface EffectFlags {
  once_per_turn?: boolean;
  optional?: boolean;
  // Per-card lockout: declining this optional effect marks it used for the
  // rest of the turn (PRB02-004 Bonney ruling). Without this flag, declining
  // is a no-op and the trigger remains eligible on subsequent events.
  lock_on_decline?: boolean;
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
  | "WHEN_ATTACKED"
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
  | "ANY_CHARACTER_TRASHED"
  | "OPPONENT_CHARACTER_TRASHED"
  | "CHARACTER_REMOVED_FROM_FIELD"
  | "DON_RETURNED_TO_DON_DECK"
  | "DON_GIVEN_TO_CARD"
  | "EVENT_ACTIVATED_FROM_HAND"
  | "EVENT_MAIN_RESOLVED_FROM_TRASH"
  | "EVENT_TRIGGER_RESOLVED"
  | "CHARACTER_PLAYED"
  | "CARD_REMOVED_FROM_LIFE"
  | "LIFE_CARD_REMOVED"
  | "TRIGGER_ACTIVATED"
  | "COMBAT_VICTORY"
  | "CHARACTER_BATTLES"
  | "END_OF_BATTLE"
  | "BATTLE_ABORTED"
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
  // OPT-238: filter EVENT_ACTIVATED_FROM_HAND by whether the Event's cost was
  // reduced by an effect. `true` requires costReducedAmount > 0 on the event
  // payload. Only meaningful on EVENT_ACTIVATED_FROM_HAND-matching triggers.
  cost_reduced?: boolean;
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
  | CharacterTotalCostCondition
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
  | SelfCostCondition
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
  | IsMyTurnCondition
  | SourcePropertyCondition
  | RevealedCardPropertyCondition;

export interface LifeCountCondition {
  type: "LIFE_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}

/**
 * OPT-444: sum of the controller's on-field Characters' costs (effective,
 * post-modifier — unqualified "cost" per the OPT-247 convention).
 * OP10-022 Law: "If the total cost of your Characters is 5 or more".
 */
export interface CharacterTotalCostCondition {
  type: "CHARACTER_TOTAL_COST";
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
  | { name_includes: string }
  | { multicolored: boolean };

export interface SelfPowerCondition {
  type: "SELF_POWER";
  operator: NumericOperator;
  value: number;
}

export interface SelfCostCondition {
  type: "SELF_COST";
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

export type ComparativeMetric = "LIFE_COUNT" | "DON_FIELD_COUNT" | "CHARACTER_COUNT" | "HAND_COUNT";

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
  // Card-scoping (OPT-424): when "SELF_CARD", the recorded action must have
  // been performed by the effect's own source card, not merely by a card the
  // `controller` owns. Currently honored for the ATTACKED action — OP12-020
  // Zoro's "If THIS Leader battles..." must not fire when a friendly Character
  // did the battling. Omit for player-scoped conditions (e.g. "if YOU
  // activated an Event this turn").
  source?: "SELF_CARD";
}

export type ActionReference = "ACTIVATED_EVENT" | "PLAYED_CHARACTER" | "USED_BLOCKER" | "ATTACKED" | "CHARACTER_KO";

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

export interface IsMyTurnCondition {
  type: "IS_MY_TURN";
  controller: Controller;
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
  filter?: TargetFilter;
  compare?: {
    property: "COST";
    operator: NumericOperator;
    value: number | DynamicValue;
  };
}

// ─── Numeric Ranges ───────────────────────────────────────────────────────────

export type NumericRange =
  | { operator: NumericOperator; value: number | DynamicValue }
  | { min: number; max: number }
  | { any_of: NumericRange[] };

// ─── Dynamic Values ───────────────────────────────────────────────────────────

export type DynamicValue =
  | { type: "FIXED"; value: number }
  | {
      type: "PER_COUNT";
      source: DynamicSource;
      multiplier: number;
      divisor?: number;
      filter?: TargetFilter;
      ref?: string;
    }
  | { type: "GAME_STATE"; source: GameStateSource; controller?: Controller }
  | { type: "ACTION_RESULT"; ref: string }
  | { type: "CHOSEN_VALUE"; ref: string }
  | { type: "DRAW_TO"; target_count: number };

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
  | "MATCHING_CHARACTERS_ON_FIELD"
  | "HAND_COUNT"
  | "CHARACTERS_ON_FIELD"
  | "OPPONENT_CHARACTERS_ON_FIELD"
  | "DON_FIELD_COUNT";

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

export interface ActionBase {
  target?: Target;
  duration?: Duration;
  chain?: ChainConnector;
  target_ref?: string;
  result_ref?: string;
  conditions?: Condition;
}

/** Exhaustive action union keyed by type with its exact parameter contract. */
export type Action = {
  [K in ActionType]: ActionBase & {
    type: K;
    params?: ActionParamsMap[K];
  };
}[ActionType];

export type ActionOf<K extends ActionType> = Extract<Action, { type: K }>;

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

// Runtime-iterable mirror of the `ActionType` union — needed because TS types
// vanish at runtime and `schema-registry.ts` / `resolver.ts` both want to
// loop over every member. The two `_AllActionTypes*` checks below force the
// array and the union to stay in lockstep at compile time, so adding to
// either without the other breaks the build.
export const ALL_ACTION_TYPES = [
  // Card Movement
  "DRAW", "SEARCH_DECK", "TRASH_CARD", "KO", "RETURN_TO_HAND", "RETURN_TO_DECK",
  "PLAY_CARD", "ADD_TO_LIFE", "MILL", "REVEAL", "FULL_DECK_SEARCH", "DECK_SCRY",
  "SEARCH_TRASH_THE_REST", "SEARCH_AND_PLAY", "PLACE_HAND_TO_DECK", "HAND_WHEEL",
  "REVEAL_HAND", "SHUFFLE_DECK",
  // Power & Stats
  "MODIFY_POWER", "SET_BASE_POWER", "MODIFY_COST", "SET_POWER_TO_ZERO",
  "SWAP_BASE_POWER", "COPY_POWER", "SET_COST",
  // Keywords
  "GRANT_KEYWORD", "NEGATE_EFFECTS",
  // DON
  "GIVE_DON", "RETURN_DON_TO_DECK", "ADD_DON_FROM_DECK", "SET_DON_ACTIVE",
  "REST_DON", "REDISTRIBUTE_DON", "FORCE_OPPONENT_DON_RETURN", "REST_OPPONENT_DON",
  "GIVE_OPPONENT_DON_TO_OPPONENT", "DISTRIBUTE_DON", "RETURN_ATTACHED_DON_TO_COST",
  // State Change
  "SET_ACTIVE", "SET_REST", "APPLY_PROHIBITION", "REMOVE_PROHIBITION",
  // Meta / Flow
  "PLAYER_CHOICE", "OPPONENT_CHOICE", "CHOOSE_VALUE", "WIN_GAME",
  "OPPONENT_ACTION", "EXTRA_TURN", "SCHEDULE_ACTION",
  // Life Card
  "TURN_LIFE_FACE_UP", "TURN_LIFE_FACE_DOWN", "TURN_ALL_LIFE_FACE_DOWN",
  "LIFE_SCRY", "REORDER_ALL_LIFE", "ADD_TO_LIFE_FROM_DECK",
  "ADD_TO_LIFE_FROM_HAND", "ADD_TO_LIFE_FROM_FIELD", "PLAY_FROM_LIFE",
  "LIFE_TO_HAND", "TRASH_FROM_LIFE", "DRAIN_LIFE_TO_THRESHOLD",
  "LIFE_CARD_TO_DECK", "TRASH_FACE_UP_LIFE",
  // Battle
  "REDIRECT_ATTACK", "DEAL_DAMAGE", "SELF_TAKE_DAMAGE",
  // Effect / Meta
  "ACTIVATE_EVENT_FROM_HAND", "ACTIVATE_EVENT_FROM_TRASH", "REUSE_EFFECT",
  "NEGATE_TRIGGER_TYPE", "GRANT_ATTRIBUTE", "TRASH_FROM_HAND",
  "RETURN_HAND_TO_DECK", "GRANT_COUNTER",
  // One-time modifier
  "APPLY_ONE_TIME_MODIFIER",
  // Self-play
  "PLAY_SELF",
] as const satisfies readonly ActionType[];

/**
 * Action union members that intentionally do not have resolver handlers yet.
 * Authored schemas must not reference these; keeping the list in the canonical
 * type module lets boot validation and resolver drift checks share one source.
 */
export const ACTION_TYPES_WITHOUT_RESOLVER_HANDLER = [
  "RETURN_ATTACHED_DON_TO_COST",
  "GRANT_COUNTER",
  "REMOVE_PROHIBITION",
] as const satisfies readonly ActionType[];

type _AllActionTypesCovers = Exclude<ActionType, typeof ALL_ACTION_TYPES[number]> extends never ? true : never;
const _allActionTypesCovers: _AllActionTypesCovers = true;
void _allActionTypesCovers;

// ─── Action Params Map ──────────────────────────────────────────────────────
// Maps each ActionType to its typed params shape. Used by getActionParams()
// to provide type-safe access in action handlers without per-site untyped assertions.

export interface ActionParamsMap {
  DRAW: { amount: number | DynamicValue };
  SEARCH_DECK: {
    look_at?: number;
    pick?: CountMode;
    filter?: TargetFilter;
    rest_destination?: string;
    pick_destination?: string;
    face?: "UP" | "DOWN";
  };
  TRASH_CARD: Record<string, never>;
  KO: Record<string, never>;
  RETURN_TO_HAND: Record<string, never>;
  RETURN_TO_DECK: { position?: "TOP" | "BOTTOM" };
  PLAY_CARD: {
    source_zone?: string;
    cost_override?: string;
    entry_state?: CardState | "PLAYER_CHOICE";
    state_distribution?: { ACTIVE?: number; RESTED?: number };
  };
  ADD_TO_LIFE: { face?: "UP" | "DOWN"; position?: "TOP" | "BOTTOM" };
  MILL: { amount?: number | DynamicValue };
  REVEAL: {
    amount?: number;
    source?: string;
    visibility?: "BOTH" | "CONTROLLER_ONLY";
  };
  FULL_DECK_SEARCH: {
    filter?: TargetFilter;
    pick?: CountMode;
    shuffle_after?: boolean;
  };
  DECK_SCRY: { look_at?: number; count?: number };
  SEARCH_TRASH_THE_REST: {
    look_at?: number;
    pick?: CountMode;
    filter?: TargetFilter;
    rest_destination?: string;
    pick_destination?: string;
  };
  SEARCH_AND_PLAY: {
    look_at?: number;
    filter?: TargetFilter;
    rest_destination?: string;
    search_full_deck?: boolean;
    shuffle_after?: boolean;
    entry_state?: CardState;
    pick?: CountMode;
    cost_override?: string;
    destination?: string;
  };
  PLACE_HAND_TO_DECK: {
    amount?: number;
    position?: "TOP" | "BOTTOM" | "TOP_OR_BOTTOM";
  };
  HAND_WHEEL: {
    trash_count?: number | DynamicValue;
    draw_count?: number | DynamicValue;
    amount?: number;
  };
  REVEAL_HAND: { amount?: number };
  SHUFFLE_DECK: Record<string, never>;

  MODIFY_POWER: { amount: number | DynamicValue };
  SET_BASE_POWER: { value: number | DynamicValue };
  MODIFY_COST: { amount: number | DynamicValue };
  SET_POWER_TO_ZERO: Record<string, never>;
  SWAP_BASE_POWER: Record<string, never>;
  COPY_POWER: {
    source?:
      | "OPPONENT_LEADER"
      | "ATTACKING_CARD"
      | "SELECTED_CHARACTER"
      | Target;
    source_target?: Target;
    source_power?: "BASE" | "EFFECTIVE";
  };
  SET_COST: { value: number | DynamicValue };

  GRANT_KEYWORD: { keyword: Keyword };
  NEGATE_EFFECTS: Record<string, never>;

  GIVE_DON: { amount?: number; don_state?: CardState };
  RETURN_DON_TO_DECK: { amount?: number | DynamicValue };
  ADD_DON_FROM_DECK: { amount?: number; target_state?: CardState };
  SET_DON_ACTIVE: { amount?: number };
  REST_DON: { amount?: number };
  REDISTRIBUTE_DON: { amount?: number };
  FORCE_OPPONENT_DON_RETURN: { amount?: number };
  REST_OPPONENT_DON: { amount?: number };
  GIVE_OPPONENT_DON_TO_OPPONENT: {
    amount?: number;
    source?: "COST_AREA";
    source_filter?: TargetFilter;
  };
  DISTRIBUTE_DON: {
    amount?: number;
    amount_per_target?: number;
    don_state?: CardState;
  };
  RETURN_ATTACHED_DON_TO_COST: Record<string, never>;

  SET_ACTIVE: Record<string, never>;
  SET_REST: Record<string, never>;
  APPLY_PROHIBITION: {
    prohibition_type: ProhibitionType;
    scope?: ProhibitionScope;
    conditional_override?: ConditionalOverride;
  };
  REMOVE_PROHIBITION: Record<string, never>;

  PLAYER_CHOICE: {
    options: Action[][];
    labels?: string[];
    mandatory?: boolean;
  };
  OPPONENT_CHOICE: {
    options: Action[][];
    labels?: string[];
    mandatory?: boolean;
  };
  CHOOSE_VALUE: {
    domain: "COST" | "POWER" | "NUMBER";
    constraints?: NumericRange;
    step?: number;
  };
  WIN_GAME: Record<string, never>;
  OPPONENT_ACTION: { action: Action; mandatory?: boolean };
  EXTRA_TURN: Record<string, never>;
  SCHEDULE_ACTION: {
    timing?: ScheduleTiming;
    action: Action;
    bound_to?: string | null;
  };

  TURN_LIFE_FACE_UP: { amount?: number; position?: "TOP" | "BOTTOM" | "ALL" };
  TURN_LIFE_FACE_DOWN: { amount?: number };
  TURN_ALL_LIFE_FACE_DOWN: Record<string, never>;
  LIFE_SCRY: { look_at?: number };
  REORDER_ALL_LIFE: Record<string, never>;
  ADD_TO_LIFE_FROM_DECK: {
    amount?: number;
    face?: "UP" | "DOWN";
    position?: "TOP" | "BOTTOM";
  };
  ADD_TO_LIFE_FROM_HAND: {
    amount?: number;
    face?: "UP" | "DOWN";
    position?: "TOP" | "BOTTOM";
  };
  ADD_TO_LIFE_FROM_FIELD: {
    amount?: number;
    face?: "UP" | "DOWN";
    position?: "TOP" | "BOTTOM" | "TOP_OR_BOTTOM";
    life_controller?: Controller;
  };
  PLAY_FROM_LIFE: { position?: "TOP" | "BOTTOM"; entry_state?: CardState };
  LIFE_TO_HAND: {
    amount?: number;
    position?: "TOP" | "BOTTOM" | "TOP_OR_BOTTOM";
  };
  TRASH_FROM_LIFE: {
    amount?: number;
    position?: "TOP" | "BOTTOM";
    controller?: Controller;
  };
  DRAIN_LIFE_TO_THRESHOLD: { threshold?: number };
  LIFE_CARD_TO_DECK: { amount?: number; position?: "TOP" | "BOTTOM" };
  TRASH_FACE_UP_LIFE: Record<string, never>;

  REDIRECT_ATTACK: Record<string, never>;
  DEAL_DAMAGE: { amount?: number | DynamicValue };
  SELF_TAKE_DAMAGE: { amount?: number | DynamicValue };

  ACTIVATE_EVENT_FROM_HAND: Record<string, never>;
  ACTIVATE_EVENT_FROM_TRASH: Record<string, never>;
  REUSE_EFFECT: { target_effect: string };
  NEGATE_TRIGGER_TYPE: {
    trigger_type: KeywordTriggerType;
    affected_controller?: "SELF" | "OPPONENT";
  };
  GRANT_ATTRIBUTE: { attribute: Attribute };
  TRASH_FROM_HAND: {
    amount?: number | DynamicValue;
    optional?: boolean;
    until_count?: number;
    filter?: TargetFilter;
    _comment?: string;
  };
  RETURN_HAND_TO_DECK: { position?: "TOP" | "BOTTOM" };
  GRANT_COUNTER: Record<string, never>;

  APPLY_ONE_TIME_MODIFIER: {
    modification: Modifier;
    applies_to: RuntimeOneTimeModifier["appliesTo"];
  };
  PLAY_SELF: Record<string, never>;
}

/**
 * Type-safe params accessor for action handlers.
 * Replaces scattered untyped assertions with a single auditable assertion.
 */
export function getActionParams<T extends ActionType>(
  action: ActionOf<T>,
  type: T
): ActionParamsMap[T] {
  if (action.type !== type) {
    throw new Error(`Expected ${type} action params, received ${action.type}`);
  }
  return (action.params ?? {}) as ActionParamsMap[T];
}

/** Nested action branches carried by the action variants that support them. */
export function getNestedActions(action: Action): Action[] {
  switch (action.type) {
    case "PLAYER_CHOICE":
    case "OPPONENT_CHOICE":
      return action.params?.options.flat() ?? [];
    case "OPPONENT_ACTION":
    case "SCHEDULE_ACTION":
      return action.params?.action ? [action.params.action] : [];
    default:
      return [];
  }
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
  | "FIELD_CARD"
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
  | "OPPONENT_LIFE"
  | "TRIGGERING_CARD"
  // OPT-432: the triggering card resolved in the TRASH — "play this Character
  // card from your trash" targets the exact source instance; empty (the play
  // is skipped, Rule 1-3-2) when that instance is no longer in the trash.
  | "TRIGGERING_CARD_IN_TRASH";

/**
 * Runtime mirror of TargetType. Keep this next to the union so semantic
 * validation uses the same contract as the resolver instead of scraping the
 * TypeScript source.
 */
export const ALL_TARGET_TYPES = [
  "SELF",
  "YOUR_LEADER",
  "OPPONENT_LEADER",
  "CHARACTER",
  "STAGE",
  "LEADER_OR_CHARACTER",
  "FIELD_CARD",
  "ALL_YOUR_CHARACTERS",
  "ALL_OPPONENT_CHARACTERS",
  "CHARACTER_CARD",
  "STAGE_CARD",
  "EVENT_CARD",
  "CARD_IN_HAND",
  "CARD_IN_TRASH",
  "CARD_ON_TOP_OF_DECK",
  "CARD_IN_DECK",
  "LIFE_CARD",
  "DON_IN_COST_AREA",
  "DON_ATTACHED",
  "DON_IN_DON_DECK",
  "PLAYER",
  "SELECTED_CARDS",
  "OPPONENT_LIFE",
  "TRIGGERING_CARD",
  "TRIGGERING_CARD_IN_TRASH",
] as const satisfies readonly TargetType[];

type _AllTargetTypesCoverUnion = Exclude<TargetType, typeof ALL_TARGET_TYPES[number]> extends never ? true : never;
const _allTargetTypesCoverUnion: _AllTargetTypesCoverUnion = true;
void _allTargetTypesCoverUnion;

/**
 * Well-known result_ref key holding the card that triggered the currently
 * resolving auto effect (e.g. the character played from trash for OP16-079).
 * Seeded by resolveEffect; consumed by the TRIGGERING_CARD target type.
 */
export const TRIGGERING_CARD_REF = "__triggering_card";

export type CountMode =
  | { exact: number }
  | { up_to: number }
  | { all: true }
  | { any_number: true };

export type SourceZone = "HAND" | "TRASH" | "DECK" | "DECK_TOP" | "LIFE" | "FIELD" | "DON_DECK";

export interface TargetFilter {
  // Controller scoping for filters used outside Target.controller, especially
  // replacement target_filter ("your Character would be...").
  controller?: Controller;

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
  card_type?: "CHARACTER" | "EVENT" | "STAGE" | "LEADER" | "DON" | string[];

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

export type Cost = SimpleCost | ChoiceCost;

interface SimpleCostFields {
  amount?: number | "ANY_NUMBER" | DynamicValue;
  filter?: TargetFilter;
  target?: Target;
  position?: "TOP" | "BOTTOM" | "TOP_OR_BOTTOM";
  // OPT-455: face for Life-destination costs (ST13-001 places face-up).
  face?: "UP" | "DOWN";
  options?: Cost[];
  card_name?: string;
}

type SimpleCostType = Exclude<CostType, "CHOICE">;

/**
 * Distribute the simple-cost shape over its type so Cost is a true
 * discriminated union. Runtime data is unchanged; TypeScript can now narrow
 * every branch without assertions and enforce exhaustive dispatch.
 */
export type SimpleCost = {
  [Type in SimpleCostType]: SimpleCostFields & { type: Type };
}[SimpleCostType];

export interface ChoiceCost {
  type: "CHOICE";
  options: Cost[][];
  labels?: string[];
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
  // OPT-454: "place this Character at the bottom of the owner's deck" —
  // fixed to the source card, auto-pays like TRASH_SELF (no selection).
  | "PLACE_SELF_TO_DECK"
  | "PLACE_STAGE_TO_DECK"
  // OPT-455: "add 1 of your Characters ... to the top of your Life cards"
  | "ADD_OWN_CHARACTER_TO_LIFE"
  | "TRASH_OWN_STAGE"
  | "PLACE_FROM_TRASH_TO_DECK"
  | "LEADER_POWER_REDUCTION"
  | "GIVE_OPPONENT_DON"
  | "RETURN_ATTACHED_DON_TO_COST"
  | "PLACE_SELF_AND_HAND_TO_DECK"
  | "PLACE_SELF_AND_TRASH_TO_DECK"
  | "LIFE_TO_HAND"
  | "REST_DON"
  | "TURN_LIFE_FACE_UP"
  | "TURN_LIFE_FACE_DOWN"
  | "CHOOSE_ONE_COST"
  | "CHOICE";

/** Runtime mirror used by authored-schema validation. */
export const ALL_COST_TYPES = [
  "DON_MINUS", "DON_REST", "VARIABLE_DON_RETURN", "REST_SELF", "TRASH_SELF",
  "TRASH_FROM_HAND", "TRASH_FROM_LIFE", "PLACE_HAND_TO_DECK", "REVEAL_FROM_HAND",
  "PLAY_NAMED_CARD_FROM_HAND", "REST_CARDS", "REST_NAMED_CARD", "KO_OWN_CHARACTER",
  "TRASH_OWN_CHARACTER", "RETURN_OWN_CHARACTER_TO_HAND", "PLACE_OWN_CHARACTER_TO_DECK",
  "PLACE_SELF_TO_DECK", "PLACE_STAGE_TO_DECK", "ADD_OWN_CHARACTER_TO_LIFE",
  "TRASH_OWN_STAGE", "PLACE_FROM_TRASH_TO_DECK", "LEADER_POWER_REDUCTION",
  "GIVE_OPPONENT_DON", "RETURN_ATTACHED_DON_TO_COST", "PLACE_SELF_AND_HAND_TO_DECK",
  "PLACE_SELF_AND_TRASH_TO_DECK", "LIFE_TO_HAND", "REST_DON", "TURN_LIFE_FACE_UP",
  "TURN_LIFE_FACE_DOWN", "CHOOSE_ONE_COST", "CHOICE",
] as const satisfies readonly CostType[];

type _AllCostTypesCoverUnion = Exclude<CostType, typeof ALL_COST_TYPES[number]> extends never ? true : never;
const _allCostTypesCoverUnion: _AllCostTypesCoverUnion = true;
void _allCostTypesCoverUnion;

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
  | "REPLACEMENT_EFFECT"
  | "NEGATE_EFFECTS_FLAG";

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
  | "CANNOT_PLAY_FROM_HAND"
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
  cause?: KOCause | EventCause;
  controller?: Controller;
  filter?: TargetFilter;
  source_filter?: TargetFilter;
  uses_per_turn?: number;
  card_type_filter?: string;
  cost_filter?: { operator: NumericOperator; value: number };
  from_zone?: string;
  when_attacking?: Target;
  // OPT-260: keyword trigger type negated by NEGATE_TRIGGER_TYPE (OP09-081).
  triggerType?: KeywordTriggerType;
}

export type ConditionalOverride = Condition | { action: Action };

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
  | DamageRuleMod
  | TreatedAsAllIdentities;

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

/**
 * OPT-227: Leaders (typically OP-15 Enel archetype) whose effect reads
 * "This Leader is treated as a card with all card names, types, and attributes."
 *
 * The blanket satisfies positive identity checks and — per Bandai rulings — is
 * NOT asymmetric: when the blanket Leader attacks into "cannot be K.O.'d by
 * Slash" it still counts as Slash, so the defender's protection applies (i.e.
 * Leader cannot KO). Positive filters like `{ name: "X" }`, `{ traits: [...] }`,
 * `{ attribute: "Y" }` match; negative filters like `exclude_name`,
 * `attribute_not`, `traits_exclude` exclude such cards for the same reason.
 */
export interface TreatedAsAllIdentities {
  rule_type: "TREATED_AS_ALL_IDENTITIES";
  names?: boolean;
  types?: boolean;
  attributes?: boolean;
}

// ─── Runtime Effect State (08-ENGINE-ARCHITECTURE) ───────────────────────────

export interface RuntimeActiveEffect {
  id: string;
  sourceCardInstanceId: string;
  sourceEffectBlockId: string;
  category: EffectCategory;
  modifiers: Modifier[];
  conditions?: Condition;  // block-level conditions, re-evaluated at runtime
  duration: Duration;
  expiresAt: ExpiryTiming;
  controller: 0 | 1;
  appliesTo: string[];  // target CardInstance.instanceIds
  timestamp: number;
}

// `player` marks whose turn (or refresh) the expiry is anchored to. With
// per-round turn numbering (OPT-366) both seats share a turn.number, so a bare
// turn can't distinguish the two turns of a round — seatless entries (legacy
// persisted state) fall back to a turn-only comparison in shouldExpire.
export type ExpiryTiming =
  | { wave: "END_OF_END_PHASE"; turn: number; player?: 0 | 1 }
  | { wave: "END_OF_TURN"; turn: number; player?: 0 | 1 }
  | { wave: "REFRESH_PHASE"; turn: number; player?: 0 | 1 }
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
  /**
   * Expiry stamped at creation (OPT-408) — "next turn" anchors can't be
   * recomputed at check time. Optional: legacy persisted prohibitions fall
   * back to a check-time computation in expireProhibitions.
   */
  expiresAt?: ExpiryTiming;
  controller: 0 | 1;
  appliesTo: string[];  // CardInstance.instanceIds or player indices
  /**
   * OPT-451: Population target carried from the authored prohibition (e.g.
   * P-084's "all Characters with a cost of 3 or 4"). When `appliesTo` is
   * empty and this is set, coverage re-resolves against the live board at
   * match time — like modifier auras — so cards entering play later are
   * still covered.
   */
  target?: Target;
  /**
   * OPT-451: Block-level (and prohibition-level) conditions, re-evaluated at
   * match time — mirrors RuntimeActiveEffect.conditions.
   */
  conditions?: Condition;
  usesRemaining: number | null;
  conditionalOverride?: ConditionalOverride | null;
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
  appliesTo: {
    action?: ModifierType;
    filter?: TargetFilter;
    controller?: Controller;
    card_type?: "CHARACTER" | "EVENT" | "STAGE" | "LEADER";
  };
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

export interface RevealedCardSnapshot {
  instanceId: string;
  cardId: string;
  source: "DECK" | "DECK_TOP" | "LIFE_TOP";
  controller: 0 | 1;
}

export interface EffectResult {
  targetInstanceIds: string[];
  count: number;
  value?: unknown;
  revealedCards?: RevealedCardSnapshot[];
}

export interface CostResult {
  donRestedCount: number;
  cardsTrashedCount: number;
  cardsReturnedCount: number;
  cardsPlacedToDeckCount: number;
  charactersKoCount: number;
  cardsTrashedInstanceIds: string[];
  cardsReturnedInstanceIds: string[];
  charactersKoInstanceIds: string[];
}
