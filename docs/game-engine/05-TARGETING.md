# 05 — Targeting

> Defines the complete targeting system for the OPTCG card effect schema. Targeting determines *what* an action affects: which cards, which players, in which zones, under which constraints. Every action that operates on game objects uses a `Target` to identify them.

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Actions](./04-ACTIONS.md) · [Conditions](./03-CONDITIONS.md) · [Encoding Guide](./11-ENCODING-GUIDE.md)

---

## Target Type Definition

The top-level `Target` interface is the single entry point for all targeting. It appears in two places:

1. **`Action.target`** — identifies what an action affects.
2. **`Cost.target`** — identifies what a cost consumes.

```typescript
interface Target {
  type: TargetType;
  controller?: Controller;
  count?: CountMode;
  filter?: TargetFilter;
  source_zone?: SourceZone;

  // --- Advanced patterns (mutually exclusive with count + filter) ---
  aggregate_constraint?: AggregateConstraint;
  uniqueness_constraint?: UniquenessConstraint;
  dual_targets?: DualTarget[];
  named_distribution?: NamedCardDistribution;
  per_type_selection?: PerTypeSelection;
  mixed_pool?: MixedPool;
}
```

The `type` field is always required. All other fields are optional and contextual — an action that targets `SELF` needs no `controller`, `count`, or `filter`. An action that targets `CHARACTER` typically uses all four base fields plus zero or one advanced pattern.

---

## Target Types

Every targetable game object falls into one of these categories. The `TargetType` enum is a closed set.

```typescript
type TargetType =
  // --- Specific game objects ---
  | "SELF"
  | "YOUR_LEADER"
  | "OPPONENT_LEADER"

  // --- Field cards (in play) ---
  | "CHARACTER"
  | "STAGE"
  | "LEADER_OR_CHARACTER"
  | "ALL_YOUR_CHARACTERS"
  | "ALL_OPPONENT_CHARACTERS"

  // --- Cards in zones (not in play) ---
  | "CHARACTER_CARD"
  | "STAGE_CARD"
  | "EVENT_CARD"
  | "CARD_IN_HAND"
  | "CARD_IN_TRASH"
  | "CARD_ON_TOP_OF_DECK"
  | "CARD_IN_DECK"
  | "LIFE_CARD"

  // --- DON!! ---
  | "DON_IN_COST_AREA"
  | "DON_ATTACHED"
  | "DON_IN_DON_DECK"

  // --- Player ---
  | "PLAYER"

  // --- Multi-select from revealed/searched ---
  | "SELECTED_CARDS";
```

### Quick Reference

| TargetType | In Play? | Notes |
|---|---|---|
| `SELF` | Yes | The card this effect is on. No controller/count needed. |
| `YOUR_LEADER` | Yes | Your Leader card. No controller/count needed. |
| `OPPONENT_LEADER` | Yes | Opponent's Leader card. No controller/count needed. |
| `CHARACTER` | Yes | A Character on the field. Uses controller + count + filter. |
| `STAGE` | Yes | A Stage on the field. Uses controller + count + filter. |
| `LEADER_OR_CHARACTER` | Yes | Either a Leader or a Character on the field. OP10-098, EB02-007. |
| `ALL_YOUR_CHARACTERS` | Yes | Every Character you control. Implicit count = ALL. |
| `ALL_OPPONENT_CHARACTERS` | Yes | Every Character opponent controls. Implicit count = ALL. |
| `CHARACTER_CARD` | No | A Character card in a zone (hand, trash, deck, life). Requires `source_zone`. |
| `STAGE_CARD` | No | A Stage card in a zone. Requires `source_zone`. |
| `EVENT_CARD` | No | An Event card in a zone. Requires `source_zone`. |
| `CARD_IN_HAND` | No | Any card in hand (any type). |
| `CARD_IN_TRASH` | No | Any card in trash (any type). |
| `CARD_ON_TOP_OF_DECK` | No | Top N cards of a deck. Count specifies depth. |
| `CARD_IN_DECK` | No | Any card in deck (full deck search). ST03-007. |
| `LIFE_CARD` | No | A card in the Life area. |
| `DON_IN_COST_AREA` | Yes | Active or rested DON!! in the cost area. |
| `DON_ATTACHED` | Yes | DON!! given to a Leader or Character. |
| `DON_IN_DON_DECK` | No | DON!! in the DON!! deck (not yet in play). |
| `PLAYER` | -- | A player (for actions like "opponent trashes from hand"). |
| `SELECTED_CARDS` | -- | Cards chosen from a prior search/reveal step. Uses `target_ref`. |

### SELF vs YOUR_LEADER

`SELF` always refers to the card the effect is printed on, regardless of card type. For a Leader card's own effect, `SELF` and `YOUR_LEADER` resolve to the same object. The distinction matters for effects on non-Leader cards that reference your Leader (e.g., "your Leader gains +1000 power" uses `YOUR_LEADER`, not `SELF`).

### CHARACTER vs CHARACTER_CARD

`CHARACTER` targets an in-play Character on the field. `CHARACTER_CARD` targets a Character card in a zone (hand, trash, deck, life) that is not currently in play. The same physical card uses different target types depending on where it is.

---

## Controller

Specifies which player controls the targeted cards.

```typescript
type Controller = "SELF" | "OPPONENT" | "EITHER";
```

| Value | Meaning | Example |
|---|---|---|
| `SELF` | Your own cards | "up to 1 of your Characters" |
| `OPPONENT` | Opponent's cards | "up to 1 of your opponent's Characters" |
| `EITHER` | Either player's cards | "K.O. all Characters" (OP01-094 Kaido) |

### Defaults

- `SELF` — when the card text says "your" or has no ownership qualifier on a beneficial effect.
- `OPPONENT` — when the card text says "your opponent's" or has no ownership qualifier on a harmful effect.
- `EITHER` — when both players' cards are eligible (board wipes, global checks).

When `controller` is omitted, the engine infers from the action type:
- Beneficial actions (`MODIFY_POWER` positive, `GRANT_KEYWORD`, `DRAW`) default to `SELF`.
- Harmful actions (`KO`, `MODIFY_POWER` negative, `RETURN_TO_HAND` opponent) default to `OPPONENT`.

---

## Count Modes

How many targets the player selects.

```typescript
type CountMode =
  | { exact: number }
  | { up_to: number }
  | { all: true }
  | { any_number: true };
```

| Mode | Card Text Pattern | Semantics |
|---|---|---|
| `{ exact: N }` | "K.O. 1 of your opponent's Characters" | Must select exactly N. If fewer than N valid targets exist, the action fails / selects what it can (per action semantics). |
| `{ up_to: N }` | "up to 1 of your Characters" | Select 0 to N targets. The player may choose fewer. |
| `{ all: true }` | "K.O. all Characters" | Every valid target is selected. No player choice. |
| `{ any_number: true }` | "rest any number of your DON!!" | Select 0 or more, no upper bound. |

### Implicit Counts

- `ALL_YOUR_CHARACTERS` and `ALL_OPPONENT_CHARACTERS` have implicit `{ all: true }`.
- `SELF`, `YOUR_LEADER`, `OPPONENT_LEADER` have implicit `{ exact: 1 }`.
- When `count` is omitted on `CHARACTER` or other multi-target types, the engine defaults to `{ up_to: 1 }`.

---

## Target Filter

The `TargetFilter` interface constrains which cards within the target type are valid selections. All fields are optional; when multiple fields are present, they combine as a conjunction (AND). A card must satisfy every specified field.

```typescript
interface TargetFilter {
  // --- Cost filters ---
  cost_exact?: number | DynamicValue;
  cost_min?: number | DynamicValue;
  cost_max?: number | DynamicValue;
  cost_range?: CostRange;
  base_cost_exact?: number;
  base_cost_min?: number;
  base_cost_max?: number;

  // --- Power filters ---
  power_exact?: number | DynamicValue;
  power_min?: number | DynamicValue;
  power_max?: number | DynamicValue;
  power_range?: PowerRange;
  base_power_exact?: number;
  base_power_min?: number;
  base_power_max?: number;

  // --- Color filters ---
  color?: CardColor;
  color_includes?: CardColor[];
  color_not_matching_ref?: string;

  // --- Trait (type) filters ---
  traits?: string[];
  traits_any_of?: string[];

  // --- Name filters ---
  name?: string;
  name_any_of?: string[];
  name_includes?: string;
  exclude_name?: string;
  exclude_self?: boolean;

  // --- Keyword / ability filters ---
  keywords?: Keyword[];
  has_trigger?: boolean;
  attribute?: Attribute;
  has_effect?: boolean;
  no_base_effect?: boolean;
  lacks_effect_type?: TriggerEffectType;

  // --- State filters ---
  is_rested?: boolean;
  is_active?: boolean;

  // --- DON-given filters (OP15 patterns) ---
  don_given_count?: DonGivenFilter;

  // --- Disjunctive (OR) filters ---
  any_of?: TargetFilter[];
}
```

### Field Reference

#### Cost Filters

| Field | Type | Card Text | Example |
|---|---|---|---|
| `cost_exact` | `number \| DynamicValue` | "with a cost of 5" | OP04-119 |
| `cost_min` | `number \| DynamicValue` | "with a cost of 5 or more" | OP12-081 |
| `cost_max` | `number \| DynamicValue` | "with a cost of 3 or less" | OP01-096 |
| `cost_range` | `CostRange` | "with a cost of 3 to 5" | OP05-088 |
| `base_cost_exact` | `number` | "with a base cost of 5" | OP04-119 |
| `base_cost_min` | `number` | "with a base cost of 8 or more" | OP12-081 |
| `base_cost_max` | `number` | "with a base cost of 5 or less" | EB04-043 |

```typescript
interface CostRange {
  min: number;
  max: number;
}
```

When `cost_max` or `cost_min` accept a `DynamicValue`, the threshold is computed from game state at resolution time (e.g., OP05-102 Gedatsu: "cost equal to or less than the number of your opponent's Life cards").

#### Power Filters

| Field | Type | Card Text | Example |
|---|---|---|---|
| `power_exact` | `number \| DynamicValue` | "with 5000 power" | OP13-082 |
| `power_min` | `number \| DynamicValue` | "with 5000 power or more" | OP14-018 |
| `power_max` | `number \| DynamicValue` | "with 3000 power or less" | OP15-018 |
| `power_range` | `PowerRange` | "with 5000 to 7000 power" | EB02-039 |
| `base_power_exact` | `number` | "with 5000 base power" | OP04-003 |
| `base_power_min` | `number` | "with 5000 base power or more" | OP15-001 |
| `base_power_max` | `number` | "with 5000 base power or less" | OP04-003 |

```typescript
interface PowerRange {
  min: number;
  max: number;
}
```

"Base" variants check the card's printed value, ignoring all in-game modifications (buffs, debuffs, DON!! bonuses). Non-base variants check effective (current) values.

#### Color Filters

| Field | Type | Card Text | Example |
|---|---|---|---|
| `color` | `CardColor` | "a red Character" | OP12-014 |
| `color_includes` | `CardColor[]` | "a Character whose colors include blue" | OP11-080 |
| `color_not_matching_ref` | `string` | "a different color than the returned Character" | OP01-002 |

```typescript
type CardColor = "RED" | "BLUE" | "GREEN" | "PURPLE" | "BLACK" | "YELLOW";
```

- `color` — exact single-color match.
- `color_includes` — the card's color set contains at least one of the listed colors. Required for multi-color cards (e.g., a Red/Green card matches `color_includes: ["RED"]`).
- `color_not_matching_ref` — relational constraint. The selected card's color must differ from the card referenced by the given `result_ref` ID from a prior action.

#### Trait Filters

| Field | Type | Card Text | Example |
|---|---|---|---|
| `traits` | `string[]` | "a {Straw Hat Crew} type Character" | EB02-010 |
| `traits_any_of` | `string[]` | "a {Straw Hat Crew}, {Kid Pirates}, or {Heart Pirates} type card" | OP05-076 |

- `traits` — conjunction. The card must have ALL listed traits.
- `traits_any_of` — disjunction. The card must have at least one of the listed traits.

#### Name Filters

| Field | Type | Card Text | Example |
|---|---|---|---|
| `name` | `string` | "[Monkey.D.Luffy]" | ST13-006 |
| `name_any_of` | `string[]` | "[Sabo] or [Portgas.D.Ace]" | ST13-006 |
| `name_includes` | `string` | card name contains substring | OP07-060 |
| `exclude_name` | `string` | "other than [Kurozumi Semimaru]" | OP01-099 |
| `exclude_self` | `boolean` | "other than this Character" | OP01-094 |

Name matching respects name aliasing (rule 10.1): a card with "Also treat this card's name as [Kouzuki Oden]" matches `name: "Kouzuki Oden"`.

#### Keyword / Ability Filters

| Field | Type | Card Text | Example |
|---|---|---|---|
| `keywords` | `Keyword[]` | "a Character with [Blocker]" | OP09-084 |
| `has_trigger` | `boolean` | "a card with a [Trigger]" | OP03-022, OP13-110 |
| `attribute` | `Attribute` | "a <Special> attribute Character" | OP11-006 |
| `has_effect` | `boolean` | "a Character with an effect" | (inverse of no_base_effect) |
| `no_base_effect` | `boolean` | "a Character with no base effect" | OP02-026, EB02-022 |
| `lacks_effect_type` | `TriggerEffectType` | "without a [When Attacking] effect" | EB03-001 |

```typescript
type Attribute = "SLASH" | "STRIKE" | "RANGED" | "SPECIAL" | "WISDOM";

type TriggerEffectType =
  | "ON_PLAY"
  | "WHEN_ATTACKING"
  | "ON_KO"
  | "ON_BLOCK"
  | "ACTIVATE_MAIN"
  | "COUNTER";
```

- `no_base_effect` — true when the card has zero printed effect blocks. This checks the original card definition, not the current in-game state (granted effects do not disqualify).
- `lacks_effect_type` — the card does not have a printed effect block with the specified trigger type. EB03-001 Vivi: "up to 1 of your Characters without a [When Attacking] effect."
- `has_trigger` — the card has the [Trigger] keyword. Used as a filter for search/play effects (OP03-022, ST29-014).

#### State Filters

| Field | Type | Card Text | Example |
|---|---|---|---|
| `is_rested` | `boolean` | "rested Character" | OP15-025 |
| `is_active` | `boolean` | "active Character" | EB01-028 |

#### DON-Given Filters

Introduced in OP15 for the Krieg Pirates archetype. Filters targets based on how many DON!! cards have been given to them.

```typescript
interface DonGivenFilter {
  operator: ">=" | "<=" | "==" | ">" | "<";
  value: number | DynamicValue;
}
```

| Card Text | Encoding | Example |
|---|---|---|
| "with a DON!! card given" | `{ operator: ">=", value: 1 }` | OP15-018 |
| "with 2 or more DON!! cards given" | `{ operator: ">=", value: 2 }` | OP15-001 |
| "with 3 or more DON!! cards given" | `{ operator: ">=", value: 3 }` | OP15-025 |
| "cost equal to the number of DON!! given" | `{ operator: "==", value: { type: "GAME_STATE", source: "DON_GIVEN_TO_TARGET" } }` | OP15-031 |

#### Disjunctive Filters

When a card specifies OR-joined filter criteria, use `any_of` to express the disjunction:

```json
{
  "any_of": [
    { "cost_exact": 0 },
    { "cost_min": 8 }
  ]
}
```

This encodes OP14-090 Mr.1: "a Character with a cost of 0 or with a cost of 8 or more."

---

## Source Zone

When an action plays, searches, or selects cards from a zone, `source_zone` indicates where the cards come from. Required for `CHARACTER_CARD`, `STAGE_CARD`, `EVENT_CARD`, and `CARD_IN_DECK` target types.

```typescript
type SourceZone =
  | "HAND"
  | "TRASH"
  | "DECK"
  | "DECK_TOP"
  | "LIFE"
  | "FIELD"
  | "DON_DECK";
```

| Zone | Description | Example |
|---|---|---|
| `HAND` | Player's hand | "Play from your hand" |
| `TRASH` | Player's trash pile | "Play from your trash" (OP06-062, OP13-082) |
| `DECK` | Full deck search (then shuffle) | ST03-007 Sentomaru |
| `DECK_TOP` | Top N cards of deck (look/reveal) | OP01-073, OP04-046 |
| `LIFE` | Life area | OP10-022, ST13-007 |
| `FIELD` | In-play area (Character area, Stage area) | "Return 1 of your Characters" |
| `DON_DECK` | DON!! deck | "Add DON!! from your DON!! deck" |

### Multi-Source Zones

When cards can come from either of two zones, use an array:

```typescript
interface Target {
  source_zone?: SourceZone | SourceZone[];
}
```

Example — ST13-003 Monkey.D.Luffy: "add up to 2 Character cards with a cost of 5 from your hand or trash to the top of your Life cards face-up."

```json
{
  "type": "CHARACTER_CARD",
  "controller": "SELF",
  "count": { "up_to": 2 },
  "filter": { "cost_exact": 5 },
  "source_zone": ["HAND", "TRASH"]
}
```

---

## Advanced Targeting Patterns

The following patterns extend the base `Target` interface for effects that exceed simple "select N cards matching filter" semantics. Each pattern was identified across all 51 card sets and requires first-class schema support.

---

### 5.1 Aggregate Sum Constraint

Target selection where the SUM of a numeric property across all selected targets must satisfy a threshold. The player selects multiple targets, but the combined total of a property (typically power) is bounded.

```typescript
interface AggregateConstraint {
  property: "power" | "cost";
  operator: "<=" | ">=" | "==";
  value: number | DynamicValue;
}
```

**Cards:** OP05-007 Sabo, OP09-018 Get Out of Here!

**Example** — OP05-007 Sabo: "K.O. up to 2 of your opponent's Characters with a total power of 4000 or less."

```json
{
  "type": "CHARACTER",
  "controller": "OPPONENT",
  "count": { "up_to": 2 },
  "aggregate_constraint": {
    "property": "power",
    "operator": "<=",
    "value": 4000
  }
}
```

The engine validates that `sum(selected.power) <= 4000` after the player makes their selections. This is distinct from per-card `power_max` — individual cards may exceed the threshold as long as the combined total does not.

---

### 5.2 Uniqueness Constraint

When selecting multiple cards, each must have a distinct value for a specified field. Prevents selecting two cards with the same name.

```typescript
interface UniquenessConstraint {
  field: "name" | "color";
}
```

**Cards:** OP06-062 Vinsmoke Judge, OP13-082 Five Elders

**Example** — OP06-062 Vinsmoke Judge: "Play up to 4 {GERMA 66} type Character cards with different card names and a cost of 2 or less from your trash."

```json
{
  "type": "CHARACTER_CARD",
  "controller": "SELF",
  "source_zone": "TRASH",
  "count": { "up_to": 4 },
  "filter": {
    "traits": ["GERMA 66"],
    "cost_max": 2
  },
  "uniqueness_constraint": { "field": "name" }
}
```

The engine enforces that no two selected cards share the same card name. Name aliasing applies — two cards that both alias to "Trafalgar Law" are considered duplicates.

---

### 5.3 Asymmetric Multi-Target

Select N targets where each receives a different effect. The selection is a single targeting operation, but the engine applies distinct actions to each selected target based on position or designation.

```typescript
interface AsymmetricTarget {
  targets: {
    filter?: TargetFilter;
    count: CountMode;
    role: string;
  }[];
}
```

**Cards:** OP06-086 Gecko Moria, OP08-118 Silvers Rayleigh, OP10-058 Rebecca

**Example** — OP08-118 Silvers Rayleigh: "Select up to 2 of your opponent's Characters; give 1 Character -3000 power and the other -2000 power."

This pattern is encoded as a sequence of actions rather than a single target. The first action uses `result_ref` and the second uses `target_ref` with exclusion:

```json
{
  "actions": [
    {
      "type": "MODIFY_POWER",
      "target": {
        "type": "CHARACTER",
        "controller": "OPPONENT",
        "count": { "up_to": 1 }
      },
      "params": { "amount": -3000 },
      "duration": { "type": "THIS_TURN" },
      "result_ref": "target_a"
    },
    {
      "type": "MODIFY_POWER",
      "target": {
        "type": "CHARACTER",
        "controller": "OPPONENT",
        "count": { "up_to": 1 },
        "filter": { "exclude_ref": "target_a" }
      },
      "params": { "amount": -2000 },
      "duration": { "type": "THIS_TURN" },
      "chain": "AND"
    }
  ]
}
```

The `exclude_ref` filter field ensures the second target differs from the first. For `OP06-086` and `OP10-058`, the asymmetry is in the play state (one active, one rested) rather than the effect magnitude.

---

### 5.4 Mixed Card-Type Pool

Selecting from a pool that spans multiple card types (Characters, DON!!, Stages, Leaders) with a shared total count.

```typescript
interface MixedPool {
  types: TargetType[];
  total_count: CountMode;
}
```

**Cards:** OP06-035 Hody Jones, OP12-037 Demon Aura, EB02-007

**Example** — OP06-035 Hody Jones: "Rest up to a total of 2 of your opponent's Characters or DON!! cards."

```json
{
  "type": "CHARACTER",
  "controller": "OPPONENT",
  "mixed_pool": {
    "types": ["CHARACTER", "DON_IN_COST_AREA"],
    "total_count": { "up_to": 2 }
  }
}
```

**Example** — EB02-007: "Up to a total of 3 of your Leader and Character cards gain +1000 power."

```json
{
  "type": "LEADER_OR_CHARACTER",
  "controller": "SELF",
  "mixed_pool": {
    "types": ["YOUR_LEADER", "CHARACTER"],
    "total_count": { "up_to": 3 }
  }
}
```

The engine presents all matching cards of any listed type as a single selection pool. The total number selected across all types is bounded by `total_count`.

---

### 5.5 Dual Targeting in Single Action

A single action targets two separately filtered sets. Each set has its own filter and count, and the action applies identically to all selected targets.

```typescript
interface DualTarget {
  filter: TargetFilter;
  count: CountMode;
}
```

**Cards:** OP01-096 King, OP03-018, EB04-059

**Example** — OP01-096 King: "K.O. up to 1 of your opponent's Characters with a cost of 3 or less and up to 1 of your opponent's Characters with a cost of 2 or less."

```json
{
  "type": "CHARACTER",
  "controller": "OPPONENT",
  "dual_targets": [
    {
      "filter": { "cost_max": 3 },
      "count": { "up_to": 1 }
    },
    {
      "filter": { "cost_max": 2 },
      "count": { "up_to": 1 }
    }
  ]
}
```

Both sub-targets resolve as part of the same action. A single Character may satisfy both filters — the engine must determine if the card text allows selecting the same card in both slots (typically it does not, as the intent is two distinct targets).

---

### 5.6 Per-Type Selection

Select one from each card type category. The count is implicit — one per type listed.

```typescript
interface PerTypeSelection {
  types: TargetType[];
  count_per_type: CountMode;
}
```

**Cards:** OP10-098 Liberation

**Example** — OP10-098 Liberation: "Negate the effect of up to 1 of each of your opponent's Leader and Character cards."

```json
{
  "type": "LEADER_OR_CHARACTER",
  "controller": "OPPONENT",
  "per_type_selection": {
    "types": ["OPPONENT_LEADER", "CHARACTER"],
    "count_per_type": { "up_to": 1 }
  }
}
```

The player selects up to 1 Leader and up to 1 Character independently. This is distinct from `dual_targets` because the split is by card type, not by filter.

---

### 5.7 Attribute Filter

Card attributes (combat style) as a targeting dimension. Attributes are a fixed enum printed on Character cards.

```typescript
type Attribute = "SLASH" | "STRIKE" | "RANGED" | "SPECIAL" | "WISDOM";
```

**Cards:** OP11-006 Zephyr, ST05-010 Zephyr

**Example** — OP11-006 Zephyr: "Give up to 1 of your opponent's <Special> attribute Characters -5000 power."

```json
{
  "type": "CHARACTER",
  "controller": "OPPONENT",
  "count": { "up_to": 1 },
  "filter": { "attribute": "SPECIAL" }
}
```

Attributes are printed properties that cannot be modified by in-game effects (except for `GRANT_ATTRIBUTE` from OP15-093). The `attribute` filter checks the card's current attribute set.

---

### 5.8 Trigger Keyword as Filter

The `[Trigger]` keyword printed on a card serves as a filter criterion for search and play effects.

**Cards:** OP03-022 Arlong, OP13-110 Stussy, ST29-014 Roronoa Zoro, EB04-027 Boa Hancock

**Example** — OP03-022 Arlong: "Play up to 1 Character card with a cost of 4 or less and a [Trigger] from your hand."

```json
{
  "type": "CHARACTER_CARD",
  "controller": "SELF",
  "source_zone": "HAND",
  "count": { "up_to": 1 },
  "filter": {
    "cost_max": 4,
    "has_trigger": true
  }
}
```

`has_trigger` checks for the presence of an effect block with `trigger.keyword === "TRIGGER"` on the card definition. This is a base card property — it is not affected by in-game effect negation.

---

### 5.9 Base Cost / Base Power Filters

Filters that check the original printed value on the card, ignoring all in-game modifications (cost reductions, power buffs/debuffs, DON!! bonuses).

**Cards:** OP04-003 Usopp, OP04-119 Donquixote Rosinante, OP15-001 Krieg

**Example** — OP04-003 Usopp: "Characters with 5000 base power or less cannot attack."

```json
{
  "filter": { "base_power_max": 5000 }
}
```

**Example** — OP04-119 Donquixote Rosinante: "Characters with a base cost of 5."

```json
{
  "filter": { "base_cost_exact": 5 }
}
```

The `base_*` family of filter fields always checks the card's as-printed value. The non-prefixed `cost_*` and `power_*` fields check effective (current, in-game) values. Both families can be used in the same filter (though this is rare).

---

### 5.10 Multi-Source Zones

Cards can come from either of two or more zones. The player selects from a unified pool spanning all listed zones.

**Cards:** ST13-003 Monkey.D.Luffy

**Example** — ST13-003 Monkey.D.Luffy: "add up to 2 Character cards with a cost of 5 from your hand or trash to the top of your Life cards face-up."

```json
{
  "type": "CHARACTER_CARD",
  "controller": "SELF",
  "count": { "up_to": 2 },
  "filter": { "cost_exact": 5 },
  "source_zone": ["HAND", "TRASH"]
}
```

When `source_zone` is an array, the engine presents all matching cards from every listed zone in a single selection pool. The player may select cards from different zones in the same operation.

---

### 5.11 Named Card Distribution

Select up to 1 of each specific named card from a predefined list. Each name can appear at most once in the selection.

```typescript
interface NamedCardDistribution {
  names: string[];
  shared_filter?: TargetFilter;
}
```

**Cards:** ST13-006 Curly.Dadan

**Example** — ST13-006 Curly.Dadan: "Play up to 1 each of [Sabo], [Portgas.D.Ace], and [Monkey.D.Luffy] with a cost of 2 from your hand."

```json
{
  "type": "CHARACTER_CARD",
  "controller": "SELF",
  "source_zone": "HAND",
  "named_distribution": {
    "names": ["Sabo", "Portgas.D.Ace", "Monkey.D.Luffy"],
    "shared_filter": { "cost_exact": 2 }
  }
}
```

The engine allows 0 or 1 of each listed name. `shared_filter` applies to all selections in addition to the name match. This is distinct from `uniqueness_constraint` — here the set of valid names is fixed and enumerated rather than dynamically derived from the selection pool.

---

### 5.12 Dynamic Name Reference from Prior Step

The target filter references a card name determined by a prior action in the same chain. The name is not statically known — it depends on what the player chose earlier.

**Cards:** EB02-039 GERMA 66

**Example** — EB02-039 GERMA 66: "Trash 1 of your Characters. Then, play up to 1 Character card with 5000 to 7000 power and the same card name as the trashed card from your trash."

```json
{
  "actions": [
    {
      "type": "TRASH",
      "target": {
        "type": "CHARACTER",
        "controller": "SELF",
        "count": { "exact": 1 }
      },
      "result_ref": "trashed_card"
    },
    {
      "type": "PLAY_CARD",
      "target": {
        "type": "CHARACTER_CARD",
        "controller": "SELF",
        "source_zone": "TRASH",
        "count": { "up_to": 1 },
        "filter": {
          "power_range": { "min": 5000, "max": 7000 },
          "name_matching_ref": "trashed_card"
        }
      },
      "chain": "THEN"
    }
  ]
}
```

```typescript
interface TargetFilter {
  name_matching_ref?: string;
  color_not_matching_ref?: string;
}
```

Both `name_matching_ref` and `color_not_matching_ref` use a `result_ref` from a prior step to dynamically constrain the filter at resolution time. The engine resolves the reference, reads the property from the referenced card, and applies the match/exclusion.

---

### 5.13 Power-Based Play Filter

Play effects that filter candidates by power rather than cost. Less common than cost-based play filters but appears across multiple sets.

**Cards:** OP04-010 Tony Tony.Chopper, EB02-022 Usopp, EB04-027 Boa Hancock, OP13-082 Five Elders

**Example** — OP04-010 Tony Tony.Chopper: "Play up to 1 {Animal} type Character card with 3000 power or less from your hand."

```json
{
  "type": "CHARACTER_CARD",
  "controller": "SELF",
  "source_zone": "HAND",
  "count": { "up_to": 1 },
  "filter": {
    "traits": ["Animal"],
    "power_max": 3000
  }
}
```

Power-based play filters use the card's printed power (the base value on the card in the source zone), since cards not in play have no effective power modifications.

---

### 5.14 Multi-Type Disjunctive Search

Search effects where the candidate filter is a disjunction of traits and/or names. The player finds a card matching any of several criteria.

**Cards:** OP05-076 When You're at Sea, OP03-112, OP12-014 Boa Hancock

**Example** — OP05-076 When You're at Sea: "reveal up to 1 {Straw Hat Crew}, {Kid Pirates}, or {Heart Pirates} type card."

```json
{
  "type": "CARD_IN_DECK",
  "controller": "SELF",
  "source_zone": "DECK",
  "count": { "up_to": 1 },
  "filter": {
    "traits_any_of": ["Straw Hat Crew", "Kid Pirates", "Heart Pirates"]
  }
}
```

**Example** — OP12-014 Boa Hancock: "[Monkey.D.Luffy] or red Event"

```json
{
  "filter": {
    "any_of": [
      { "name": "Monkey.D.Luffy" },
      { "color": "RED", "card_type": "EVENT" }
    ]
  }
}
```

For simple trait disjunction, use `traits_any_of`. For more complex disjunctions mixing names, colors, and card types, use `filter.any_of` — an array of `TargetFilter` objects where the card must match at least one.

---

### 5.15 Multi-Pick Search

A single search/reveal operation where the player takes multiple cards, potentially with different name filters within the same search pool.

**Cards:** OP04-046 Queen

**Example** — OP04-046 Queen: "look at 7 cards from the top of your deck; reveal a total of up to 2 [Plague Rounds] or [Ice Oni] cards and add them to your hand."

```json
{
  "actions": [
    {
      "type": "SEARCH_TOP",
      "params": { "depth": 7 },
      "result_ref": "searched_cards"
    },
    {
      "type": "SELECT_AND_ADD_TO_HAND",
      "target": {
        "type": "SELECTED_CARDS",
        "count": { "up_to": 2 },
        "filter": {
          "name_any_of": ["Plague Rounds", "Ice Oni"]
        }
      },
      "target_ref": "searched_cards",
      "chain": "THEN"
    }
  ]
}
```

The `name_any_of` field enables selecting cards matching any name in the list. The total across all names is bounded by the count. This differs from `named_distribution` — here there is no per-name limit. The player could take 2 copies of [Plague Rounds] and 0 of [Ice Oni].

---

### 5.16 DON Given Count as Filter

Targets are filtered based on how many DON!! cards have been given to them. Exclusive to the OP15 Krieg Pirates archetype, where DON!! distribution to opponent's cards is a core mechanic.

**Cards:** OP15-001 Krieg, OP15-018 Mohji, OP15-025 Kuro, OP15-031 Purinpurin

**Example** — OP15-001 Krieg: "Rest up to 1 of your opponent's Characters that has 2 or more DON!! cards given."

```json
{
  "type": "CHARACTER",
  "controller": "OPPONENT",
  "count": { "up_to": 1 },
  "filter": {
    "don_given_count": { "operator": ">=", "value": 2 }
  }
}
```

**Example** — OP15-031 Purinpurin: "If the chosen Character has a cost equal to the number of DON!! cards given to it, K.O. it."

```json
{
  "filter": {
    "don_given_count": {
      "operator": "==",
      "value": { "type": "GAME_STATE", "source": "TARGET_COST" }
    }
  }
}
```

In the OP15-031 case, the filter compares DON-given count against the target's own cost. This is a self-referential dynamic filter — the value being compared against is a property of the card being evaluated, not a global game state value. The engine must evaluate this per-candidate.

---

## Filter Evaluation Semantics

### Conjunction by Default

All fields within a single `TargetFilter` combine with AND logic. A card must satisfy every specified field to be a valid target:

```json
{
  "cost_max": 4,
  "traits": ["Straw Hat Crew"],
  "has_trigger": true
}
```

This matches: cost 4 or less AND {Straw Hat Crew} type AND has [Trigger].

### Disjunction via `any_of`

When filter criteria are OR-joined, use the `any_of` array. Each element is a full `TargetFilter`; the card must match at least one:

```json
{
  "any_of": [
    { "name": "Sabo" },
    { "traits": ["Big Mom Pirates"] }
  ]
}
```

`any_of` can be combined with top-level fields — the top-level fields apply as AND to the disjunction:

```json
{
  "cost_max": 5,
  "any_of": [
    { "name": "Sanji" },
    { "traits": ["Big Mom Pirates"] }
  ]
}
```

This matches: cost 5 or less AND (name is [Sanji] OR type includes {Big Mom Pirates}).

### Dynamic Values in Filters

Filter fields that accept `DynamicValue` are resolved at effect resolution time, not at schema parse time. The engine evaluates the dynamic value against current game state before applying the filter.

```json
{
  "cost_max": {
    "type": "GAME_STATE",
    "source": "OPPONENT_LIFE_COUNT"
  }
}
```

At resolution, if the opponent has 3 Life cards, this evaluates to `cost_max: 3`.

### Exclude Ref

The `exclude_ref` field (used in asymmetric targeting) prevents selecting a card that was already selected by a referenced prior step:

```typescript
interface TargetFilter {
  exclude_ref?: string;
}
```

This is distinct from `exclude_self` (which excludes the source card of the effect) and `exclude_name` (which excludes by card name).

---

## Complete Type Summary

| Type | Defined In | Purpose |
|---|---|---|
| `Target` | This file | Top-level targeting container |
| `TargetType` | This file | Enum of targetable game objects |
| `Controller` | This file | SELF / OPPONENT / EITHER |
| `CountMode` | This file | exact / up_to / all / any_number |
| `TargetFilter` | This file | Constraint fields for card selection |
| `SourceZone` | This file | Where cards are selected from |
| `CostRange` / `PowerRange` | This file | Bounded numeric ranges |
| `DonGivenFilter` | This file | DON-given count constraint |
| `AggregateConstraint` | This file | Sum-based multi-target constraint |
| `UniquenessConstraint` | This file | Distinct-value multi-target constraint |
| `DualTarget` | This file | Two separately filtered target sets |
| `MixedPool` | This file | Cross-type selection pool |
| `PerTypeSelection` | This file | One per card type |
| `NamedCardDistribution` | This file | Up to 1 of each named card |
| `AsymmetricTarget` | This file | Different effects per target |
| `CardColor` | This file | RED / BLUE / GREEN / PURPLE / BLACK / YELLOW |
| `Attribute` | This file | SLASH / STRIKE / RANGED / SPECIAL / WISDOM |
| `DynamicValue` | [Schema Overview](./01-SCHEMA-OVERVIEW.md) | Computed amounts |
| `Keyword` | [Keyword Reference](./10-KEYWORD-REFERENCE.md) | Intrinsic keyword flag |

---

_Last updated: 2026-03-19_
