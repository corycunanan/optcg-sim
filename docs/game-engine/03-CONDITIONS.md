# 03 — Conditions

> Conditions are boolean gates that determine whether an effect block activates or an inline action executes. Every condition evaluates to true or false against the current game state. They never produce side effects — they only observe.

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Triggers](./02-TRIGGERS.md) · [Actions](./04-ACTIONS.md) · [Targeting](./05-TARGETING.md)

---

## Condition Type Definition

```typescript
type Condition =
  | SimpleCondition
  | { all_of: Condition[] }
  | { any_of: Condition[] }
  | { not: Condition };
```

`Condition` is a recursive discriminated union. Every condition resolves to one of four shapes:

1. **SimpleCondition** — a single boolean check against game state, discriminated on the `type` field.
2. **all_of** — conjunction: all child conditions must be true.
3. **any_of** — disjunction: at least one child condition must be true.
4. **not** — negation: the child condition must be false.

Conditions appear in two positions within an [EffectBlock](./01-SCHEMA-OVERVIEW.md):

- **Block-level** (`EffectBlock.conditions`) — gates the entire effect. If false, the effect does not activate.
- **Inline on action** (`Action.conditions`) — gates a single action within a chain. If false, that action is skipped but subsequent actions may still execute (per chain connector rules).

### SimpleCondition

```typescript
type SimpleCondition =
  // Life & Resource
  | LifeCountCondition
  | HandCountCondition
  | TrashCountCondition
  | DeckCountCondition
  | DonFieldCountCondition
  | ActiveDonCountCondition
  | AllDonStateCondition

  // Card Existence
  | CardOnFieldCondition
  | MultipleNamedCardsCondition
  | NamedCardWithPropertyCondition
  | FieldPurityCondition

  // Leader
  | LeaderPropertyCondition

  // Card Property (Self-Referencing)
  | SelfPowerCondition
  | SelfStateCondition
  | NoBaseEffectCondition
  | HasEffectTypeCondition
  | LacksEffectTypeCondition

  // Comparative
  | ComparativeCondition
  | CombinedTotalCondition

  // Temporal
  | WasPlayedThisTurnCondition
  | ActionPerformedThisTurnCondition
  | PlayMethodCondition

  // Zone-Specific
  | FaceUpLifeCondition
  | CardTypeInZoneCondition
  | CombinedZoneCountCondition

  // Board State
  | BoardWideExistenceCondition
  | RestedCardCountCondition
  | DonGivenCondition
  | TurnCountCondition

  // Source-Specific
  | SourcePropertyCondition;
```

### Shared Types

Referenced across multiple condition definitions:

```typescript
type Controller = "SELF" | "OPPONENT" | "EITHER";
type NumericOperator = "==" | "!=" | "<" | "<=" | ">" | ">=";
type CardState = "ACTIVE" | "RESTED";
type Zone = "FIELD" | "TRASH" | "HAND" | "DECK" | "LIFE";
```

`Controller` determines whose game state is checked:

- `"SELF"` — the controller of the source card (the card bearing the effect).
- `"OPPONENT"` — the opponent of the source card's controller.
- `"EITHER"` — true if at least one player satisfies the check.

`NumericRange` is a reusable value specification that supports single comparisons, bounded ranges, and non-contiguous ranges. Defined fully in [Numeric Range Conditions](#numeric-range-conditions).

```typescript
type NumericRange =
  | { operator: NumericOperator; value: number | DynamicValue }
  | { min: number; max: number }
  | { any_of: NumericRange[] };
```

### Catalog

All SimpleCondition types at a glance. Each is detailed in the section indicated.

| Type | Description | Text Pattern | Example Cards |
|------|-------------|-------------|---------------|
| `LIFE_COUNT` | Absolute life card count | "If you have N or less Life cards..." | OP14-107, OP13-115 |
| `HAND_COUNT` | Hand card count | "If you have N or less cards in your hand..." | Various |
| `TRASH_COUNT` | Trash card count | "If you have N or more cards in your trash..." | Various |
| `DECK_COUNT` | Deck card count | "If you have N or less cards in your deck..." | OP03-045, OP15-022 |
| `DON_FIELD_COUNT` | Total DON!! on field | "If you have N DON!! cards on your field..." | P-104, P-107 |
| `ACTIVE_DON_COUNT` | Active (untapped) DON!! count | "If you have N or more active DON!! cards..." | OP04-028, OP13-001 |
| `ALL_DON_STATE` | All DON!! in one state | "If all of your DON!! cards are rested..." | OP02-027 |
| `CARD_ON_FIELD` | Card matching filter exists | "If you have [Name]..." / "If you have a Character with..." | OP01-044, OP04-005 |
| `MULTIPLE_NAMED_CARDS` | Multiple named cards co-exist | "If you have [A] and [B]..." | OP15-064, OP15-072 |
| `NAMED_CARD_WITH_PROPERTY` | Named card with property constraint | "If you have [Name] with N power or more..." | OP15-080 |
| `FIELD_PURITY` | All characters match filter | "If the only Characters on your field are {Trait}..." | OP05-084, EB02-010 |
| `LEADER_PROPERTY` | Leader matches property | "if your Leader has 0 power or less..." | OP05-009, OP11-080 |
| `SELF_POWER` | This card's current power | "If this Character has N power or more..." | OP05-004, OP14-004 |
| `SELF_STATE` | This card's active/rested state | "If this Character is rested..." | ST02-014, OP04-017 |
| `NO_BASE_EFFECT` | Card has no printed effects | "Character with no base effect..." | OP02-026, EB02-022 |
| `HAS_EFFECT_TYPE` | Card has specific effect keyword | "Character card with a [Trigger]..." | OP03-022, OP13-100 |
| `LACKS_EFFECT_TYPE` | Card lacks specific effect keyword | "Characters without a [When Attacking] effect" | EB03-001, PRB01-001 |
| `COMPARATIVE` | Metric comparison between players | "less Life cards than your opponent..." | OP03-108, OP05-069 |
| `COMBINED_TOTAL` | Sum across both players vs threshold | "you and your opponent have a total of N..." | OP09-100, EB04-055 |
| `WAS_PLAYED_THIS_TURN` | Card entered play this turn | "If this Character was played on this turn..." | ST19-003, EB04-012 |
| `ACTION_PERFORMED_THIS_TURN` | Specific action occurred this turn | "If you have activated an Event..." | OP15-002 |
| `PLAY_METHOD` | How a card was played | "plays a Character using a Character's effect" | OP12-081 |
| `FACE_UP_LIFE` | Face-up life card exists | "If you have a face-up Life card..." | EB03-051, PRB02-018 |
| `CARD_TYPE_IN_ZONE` | Card type count in zone | "N or more Events in your trash..." | EB04-034, OP15-021 |
| `COMBINED_ZONE_COUNT` | Card count across multiple zones | "a total of N or less cards in Life area and hand..." | OP04-040, OP04-116 |
| `BOARD_WIDE_EXISTENCE` | Card exists on any field | "If there is a Character with N power or more..." | OP14-018, EB04-045 |
| `RESTED_CARD_COUNT` | Total rested cards (all types) | "If you have N or more rested cards..." | ST16-003, OP12-118 |
| `DON_GIVEN` | DON!! attachment state | "If your opponent has any DON!! cards given..." | OP15-005, OP15-001 |
| `TURN_COUNT` | Game turn number | "If it is your second turn or later..." | OP15-058 |
| `SOURCE_PROPERTY` | Source of event matches filter | "by effects of Characters with N base power..." | OP14-003, OP11-005 |

---

## Compound Logic

Compound wrappers compose simple conditions into complex boolean expressions. They are recursive — any `Condition` can appear as a child, including other compound wrappers.

### all_of (Conjunction)

All child conditions must be true. Maps to implicit AND between clauses in card text. Most cards with multiple conditions use conjunction by default — when a card says "If A and B," encode as `all_of`.

```typescript
{ all_of: Condition[] }
```

Example — OP15-080 Oars: "If you have [Gecko Moria] with 10000 power or more on your field and there are no other [Oars] cards..."

```json
{
  "all_of": [
    {
      "type": "NAMED_CARD_WITH_PROPERTY",
      "controller": "SELF",
      "name": "Gecko Moria",
      "property": { "power": { "operator": ">=", "value": 10000 } }
    },
    {
      "not": {
        "type": "CARD_ON_FIELD",
        "controller": "SELF",
        "filter": { "name": "Oars" },
        "exclude_self": true
      }
    }
  ]
}
```

### any_of (Disjunction)

At least one child condition must be true. Maps to explicit "or" in card text.

> **Findings ref:** 2.24 (OR Compound Conditions), 2.3 (Either-Player Conditions)

```typescript
{ any_of: Condition[] }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If X or Y..." | ST10-002, OP13-002 |
| "If either you or your opponent..." | P-104, P-107, OP09-118 |

Example — ST10-002 Monkey.D.Luffy: "If you have 0 DON!! cards on your field or 8 or more DON!! cards..."

```json
{
  "any_of": [
    { "type": "DON_FIELD_COUNT", "controller": "SELF", "operator": "==", "value": 0 },
    { "type": "DON_FIELD_COUNT", "controller": "SELF", "operator": ">=", "value": 8 }
  ]
}
```

Example — OP13-002 Portgas.D.Ace: "When you take damage or your Character with 6000 base power or more is K.O.'d..." (the trigger is a disjunction; the condition equivalent uses `any_of` when the effect needs to check which sub-event fired).

Either-player conditions (2.3) can also be expressed as `any_of` with two mirrored conditions, or more concisely with `controller: "EITHER"` on the relevant condition type. See [Comparative Conditions](#comparative-conditions) for details.

### not (Negation)

The child condition must be false. Maps to "you don't have" / "you have no" / "there are no" text patterns.

> **Findings ref:** 2.11 (NOT/Absence Conditions)

```typescript
{ not: Condition }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you don't have [Name]..." | OP01-044, OP01-050, OP03-027, OP08-005 |
| "if you have no other [Name]" | OP07-060, OP15-080 |

Example — OP01-044 Shachi: "If you don't have [Penguin]..."

```json
{
  "not": {
    "type": "CARD_ON_FIELD",
    "controller": "SELF",
    "filter": { "name": "Penguin" }
  }
}
```

---

## Life & Resource Conditions

Conditions that check card counts and resource states. These are the most common condition family across the card pool.

### LIFE_COUNT

Checks the number of Life cards a player has.

> **Findings ref:** 2.16 (Opponent's Life Count)

```typescript
interface LifeCountCondition {
  type: "LIFE_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Controller | Example Cards |
|-------------|-----------|---------------|
| "If you have N or less Life cards..." | `"SELF"` | Extremely common across all sets |
| "If your opponent has N or less Life cards..." | `"OPPONENT"` | OP14-107, OP13-115 |
| "if either you or your opponent has 0 Life cards..." | `"EITHER"` | OP09-118 |

The `controller: "EITHER"` variant provides a compact encoding for either-player Life checks (findings 2.3) without requiring an explicit `any_of` wrapper.

### HAND_COUNT

Checks the number of cards in a player's hand.

```typescript
interface HandCountCondition {
  type: "HAND_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Controller | Example Cards |
|-------------|-----------|---------------|
| "If you have N or less cards in your hand..." | `"SELF"` | Various |
| "If your opponent has N or more cards in their hand..." | `"OPPONENT"` | Various |

### TRASH_COUNT

Checks the number of cards in a player's trash.

```typescript
interface TrashCountCondition {
  type: "TRASH_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Controller | Example Cards |
|-------------|-----------|---------------|
| "If you have N or more cards in your trash..." | `"SELF"` | Various |

### DECK_COUNT

Checks the number of cards remaining in a player's deck.

> **Findings ref:** 2.4

```typescript
interface DeckCountCondition {
  type: "DECK_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have 20 or less cards in your deck..." | OP03-045, OP03-049, OP03-053 |
| "if your deck has 0 cards..." | OP15-022 |

### DON_FIELD_COUNT

Checks the total number of DON!! cards on a player's field (active + rested combined).

```typescript
interface DonFieldCountCondition {
  type: "DON_FIELD_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Controller | Example Cards |
|-------------|-----------|---------------|
| "If you have N DON!! cards on your field..." | `"SELF"` | Many across all sets |
| "If either you or your opponent has 10 DON!! cards on the field..." | `"EITHER"` | P-104, P-107 |

### ACTIVE_DON_COUNT

Checks the number of active (untapped) DON!! cards on a player's field. Distinct from `DON_FIELD_COUNT` which counts all DON!! regardless of state.

> **Findings ref:** 2.18

```typescript
interface ActiveDonCountCondition {
  type: "ACTIVE_DON_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have 2 or more active DON!! cards..." | OP04-028 |
| "If you have 5 or less active DON!! cards..." | OP13-001 |

### ALL_DON_STATE

Checks whether ALL of a player's DON!! cards are in a specific state. This is a universal quantifier over DON!! cards — if even one DON!! is not in the required state, the condition fails. An empty DON!! field satisfies the check vacuously.

> **Findings ref:** 2.17

```typescript
interface AllDonStateCondition {
  type: "ALL_DON_STATE";
  controller: Controller;
  required_state: CardState;
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If all of your DON!! cards are rested..." | OP02-027 |

---

## Card Existence Conditions

Conditions that check whether specific cards or card configurations exist on the field.

### CARD_ON_FIELD

Checks whether at least one card matching a filter exists on a player's field. The most general existence check. Supports count thresholds and self-exclusion for uniqueness patterns.

> **Findings ref:** 2.11 (absence via `not`), 2.12 (uniqueness via `exclude_self`)

```typescript
interface CardOnFieldCondition {
  type: "CARD_ON_FIELD";
  controller: Controller;
  filter: TargetFilter;
  count?: { operator: NumericOperator; value: number };
  exclude_self?: boolean;
}
```

- `filter` — a [TargetFilter](./05-TARGETING.md) matching card properties (name, trait, cost, power, color, attribute, etc.).
- `count` — when provided, checks the count of matching cards against a threshold. When omitted, defaults to existence (at least 1).
- `exclude_self` — when true, the source card is excluded from the check. Used for uniqueness/duplicate patterns.

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have a Character with cost 8+..." | ST14-015 |
| "If you have [Name]..." (positive existence) | Various |
| "If you don't have [Name]..." (via `not` wrapper) | OP01-044, OP01-050, OP03-027, OP08-005 |
| "If you have [Name] other than this Character..." | OP04-005 |
| "if you have no other [Name]" (via `not` + `exclude_self`) | OP07-060, EB01-012, OP15-080 |

Example — OP04-005 Kung Fu Jugon: "If you have a [Kung Fu Jugon] other than this Character..."

```json
{
  "type": "CARD_ON_FIELD",
  "controller": "SELF",
  "filter": { "name": "Kung Fu Jugon" },
  "exclude_self": true
}
```

Example — EB01-012 Cavendish: "you have no other [Cavendish] Characters..."

```json
{
  "not": {
    "type": "CARD_ON_FIELD",
    "controller": "SELF",
    "filter": { "name": "Cavendish" },
    "exclude_self": true
  }
}
```

### MULTIPLE_NAMED_CARDS

Checks that multiple specific named cards all exist simultaneously on the field. All listed names must have at least one matching card present.

> **Findings ref:** 2.27

```typescript
interface MultipleNamedCardsCondition {
  type: "MULTIPLE_NAMED_CARDS";
  controller: Controller;
  names: string[];
}
```

Semantically equivalent to `{ all_of: [CARD_ON_FIELD for each name] }` but provided as a dedicated type for encoding clarity — the encoding agent should prefer this over a manual `all_of` when the pattern is "If you have [A] and [B]..."

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have [Satori] and [Hotori]..." | OP15-064 |
| "If you have [Kotori] and [Satori]..." | OP15-072 |

### NAMED_CARD_WITH_PROPERTY

Checks that a specific named card exists on the field AND satisfies an additional property constraint (power, cost, etc.). Combines name matching with a numeric property check in a single condition.

> **Findings ref:** 2.28

```typescript
interface NamedCardWithPropertyCondition {
  type: "NAMED_CARD_WITH_PROPERTY";
  controller: Controller;
  name: string;
  property: {
    power?: NumericRange;
    cost?: NumericRange;
  };
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have [Gecko Moria] with 10000 power or more on your field..." | OP15-080 |

Example — OP15-080 Oars:

```json
{
  "type": "NAMED_CARD_WITH_PROPERTY",
  "controller": "SELF",
  "name": "Gecko Moria",
  "property": { "power": { "operator": ">=", "value": 10000 } }
}
```

### FIELD_PURITY

Universal quantifier: ALL characters on the field must match a filter. Any non-matching character fails the condition. An empty character area satisfies this vacuously (there are no counterexamples).

> **Findings ref:** 2.10

```typescript
interface FieldPurityCondition {
  type: "FIELD_PURITY";
  controller: Controller;
  filter: TargetFilter;
}
```

The engine checks: for every Character card on the specified player's field, does it match `filter`? If any Character does not match, the condition is false.

| Text Pattern | Example Cards |
|-------------|---------------|
| "If the only Characters on your field are {Celestial Dragons} type Characters..." | OP05-084 |
| "when you only have Characters with a type including 'GERMA'..." | OP11-043, OP13-095 |
| "If the only Characters on your field are {Straw Hat Crew} type Characters..." | EB02-010 |

Example — OP05-084 Saint Charlos:

```json
{
  "type": "FIELD_PURITY",
  "controller": "SELF",
  "filter": { "traits": ["Celestial Dragons"] }
}
```

---

## Leader Conditions

Conditions that check properties of a player's Leader card.

### LEADER_PROPERTY

Checks whether the Leader matches a property constraint. The `property` field selects which axis to check.

> **Findings ref:** 2.6 (Leader Power), 2.26 (Leader Color Includes)

```typescript
interface LeaderPropertyCondition {
  type: "LEADER_PROPERTY";
  controller: Controller;
  property: LeaderPropertyCheck;
}

type LeaderPropertyCheck =
  | { power: NumericRange }
  | { color_includes: CardColor }
  | { color: CardColor }
  | { trait: string }
  | { attribute: Attribute }
  | { name: string };
```

The distinction between `color` (exact match) and `color_includes` (set membership) is critical for multicolor Leaders. A red/green Leader satisfies `{ color_includes: "RED" }` but NOT `{ color: "RED" }`.

| Text Pattern | Property Check | Example Cards |
|-------------|---------------|---------------|
| "if your Leader has 0 power or less..." | `{ power: { operator: "<=", value: 0 } }` | OP05-009, OP15-004 |
| "If your Leader's colors include blue..." | `{ color_includes: "BLUE" }` | OP11-080 |
| "If your Leader has {Trait}..." | `{ trait: "..." }` | Various |

Example — OP05-009 Toh-Toh: "Draw 1 card if your Leader has 0 power or less."

```json
{
  "type": "LEADER_PROPERTY",
  "controller": "SELF",
  "property": { "power": { "operator": "<=", "value": 0 } }
}
```

Example — OP11-080 Gear Two: "If your Leader's colors include blue..."

```json
{
  "type": "LEADER_PROPERTY",
  "controller": "SELF",
  "property": { "color_includes": "BLUE" }
}
```

---

## Card Property Conditions

Conditions that check properties of the source card itself (self-referencing). These use an implicit "this card" as the subject.

### SELF_POWER

Checks this card's current effective power, including all active buffs and debuffs.

> **Findings ref:** 2.5

```typescript
interface SelfPowerCondition {
  type: "SELF_POWER";
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If this Character has 7000 power or more..." | OP05-004 |
| "If this Character has 5000 power or more..." | OP14-004, OP14-002 |

### SELF_STATE

Checks whether this card is active (untapped) or rested (tapped).

> **Findings ref:** 2.7

```typescript
interface SelfStateCondition {
  type: "SELF_STATE";
  required_state: CardState;
}
```

| Text Pattern | Required State | Example Cards |
|-------------|---------------|---------------|
| "If this Character is rested..." | `"RESTED"` | ST02-014 |
| "if your Leader is active..." | `"ACTIVE"` | OP04-017 |

### NO_BASE_EFFECT

Checks that a card has no printed (base) effects. This appears both as a standalone condition and as a property within [TargetFilter](./05-TARGETING.md). As a condition, it checks the source card or a card identified in context.

> **Findings ref:** 2.8

```typescript
interface NoBaseEffectCondition {
  type: "NO_BASE_EFFECT";
}
```

| Text Pattern | Context | Example Cards |
|-------------|---------|---------------|
| "Character with no base effect" (trigger filter) | Trigger qualification | OP02-026 |
| "play up to 1 Character card with...no base effect" (target filter) | Action targeting | EB02-022 |
| "Characters with no base effect gains +2000 power" (modifier filter) | Continuous grant | EB03-009, OP02-045, OP02-046, OP03-091 |

### HAS_EFFECT_TYPE

Checks that a card has a specific effect keyword or trigger type in its printed text.

```typescript
interface HasEffectTypeCondition {
  type: "HAS_EFFECT_TYPE";
  effect_type: EffectKeyword;
}

type EffectKeyword =
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
```

| Text Pattern | Effect Type | Example Cards |
|-------------|------------|---------------|
| "Character card with a [Trigger]" | `"TRIGGER"` | OP03-022, OP13-100, OP13-110, ST29-014, EB04-027 |

### LACKS_EFFECT_TYPE

Checks that a card does NOT have a specific effect keyword. The inverse of `HAS_EFFECT_TYPE`. Provided as a dedicated type because encoding absence of a specific keyword is common enough to warrant a first-class representation rather than wrapping `HAS_EFFECT_TYPE` in `not`.

> **Findings ref:** 2.9

```typescript
interface LacksEffectTypeCondition {
  type: "LACKS_EFFECT_TYPE";
  effect_type: EffectKeyword;
}
```

| Text Pattern | Effect Type | Example Cards |
|-------------|------------|---------------|
| "Characters without a [When Attacking] effect" | `"WHEN_ATTACKING"` | EB03-001 |
| "Characters without an [On Play] effect" | `"ON_PLAY"` | PRB01-001 |

---

## Comparative Conditions

Conditions that compare a metric between two players rather than checking an absolute threshold.

### COMPARATIVE

Compares the same metric between the source card's controller and their opponent using a relative operator.

> **Findings ref:** 2.1 (Your Value vs Opponent's), 2.3 (Either-Player via `controller: "EITHER"` on resource conditions)

```typescript
interface ComparativeCondition {
  type: "COMPARATIVE";
  metric: ComparativeMetric;
  operator: NumericOperator;
  margin?: number;
}

type ComparativeMetric =
  | "LIFE_COUNT"
  | "DON_FIELD_COUNT"
  | "CHARACTER_COUNT";
```

The condition evaluates: **self_value `<operator>` opponent_value + margin**.

Default `margin` is `0`. A negative margin encodes "self is at least N less than opponent."

| Text Pattern | Metric | Operator | Margin | Example Cards |
|-------------|--------|----------|--------|---------------|
| "If you have less Life cards than your opponent..." | `LIFE_COUNT` | `<` | -- | OP03-108 |
| "equal to or less than opponent's" Life count | `LIFE_COUNT` | `<=` | -- | OP13-102 |
| "If your opponent has more DON!! cards on their field than you..." | `DON_FIELD_COUNT` | `<` | -- | OP05-069, EB02-035 |
| "number of your Characters is at least 2 less than opponent's" | `CHARACTER_COUNT` | `<=` | `-2` | OP10-098, EB04-059 |

Example — OP03-108: "If you have less Life cards than your opponent..."

```json
{
  "type": "COMPARATIVE",
  "metric": "LIFE_COUNT",
  "operator": "<"
}
```

Example — OP10-098: "number of your Characters is at least 2 less than your opponent's"

```json
{
  "type": "COMPARATIVE",
  "metric": "CHARACTER_COUNT",
  "operator": "<=",
  "margin": -2
}
```

**Either-player conditions** (findings 2.3) do not use `COMPARATIVE`. They are expressed using `controller: "EITHER"` on the relevant resource condition type. For example, P-104 Shanks: "If either you or your opponent has 10 DON!! cards on the field":

```json
{
  "type": "DON_FIELD_COUNT",
  "controller": "EITHER",
  "operator": ">=",
  "value": 10
}
```

This is equivalent to `{ any_of: [{ type: "DON_FIELD_COUNT", controller: "SELF", ... }, { type: "DON_FIELD_COUNT", controller: "OPPONENT", ... }] }` but more concise. The encoding agent should prefer the `"EITHER"` variant when both sides use the same threshold.

### COMBINED_TOTAL

Sums a metric across both players and checks the combined total against a threshold.

> **Findings ref:** 2.2

```typescript
interface CombinedTotalCondition {
  type: "COMBINED_TOTAL";
  metric: ComparativeMetric;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Metric | Example Cards |
|-------------|--------|---------------|
| "you and your opponent have a total of 5 or less Life cards" | `LIFE_COUNT` | OP09-100, EB04-055 |
| "total of 5 or more Life cards" | `LIFE_COUNT` | OP11-114 |

Example — OP09-100 Karasu: "you and your opponent have a total of 5 or less Life cards"

```json
{
  "type": "COMBINED_TOTAL",
  "metric": "LIFE_COUNT",
  "operator": "<=",
  "value": 5
}
```

`COMBINED_TOTAL` is also used as a dynamic threshold source in target filters (findings 2.13). OP04-112 Yamato: "cost equal to or less than the total of your and your opponent's Life cards" — here the combined total becomes a [DynamicValue](./01-SCHEMA-OVERVIEW.md) of type `GAME_STATE` with source `COMBINED_LIFE_COUNT`.

---

## Temporal Conditions

Conditions that check what has happened during the current turn or how the source card entered play.

### WAS_PLAYED_THIS_TURN

Checks whether this card was played during the current turn. Always self-referencing. Used on `[When Attacking]` effects that should only fire on the same turn the card entered play.

> **Findings ref:** 2.25

```typescript
interface WasPlayedThisTurnCondition {
  type: "WAS_PLAYED_THIS_TURN";
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If this Character was played on this turn..." | ST19-003, EB04-012, EB03-013, OP15-008 |

### ACTION_PERFORMED_THIS_TURN

Checks whether a specific game action was performed during the current turn. Optionally constrains the action to match a filter (e.g., "activated an Event with base cost 3+").

> **Findings ref:** 2.33

```typescript
interface ActionPerformedThisTurnCondition {
  type: "ACTION_PERFORMED_THIS_TURN";
  controller: Controller;
  action: ActionReference;
  filter?: TargetFilter;
}

type ActionReference =
  | "ACTIVATED_EVENT"
  | "PLAYED_CHARACTER"
  | "USED_BLOCKER"
  | "ATTACKED";
```

| Text Pattern | Action | Filter | Example Cards |
|-------------|--------|--------|---------------|
| "If you have activated an Event with a base cost of 3 or more during this turn..." | `ACTIVATED_EVENT` | `{ base_cost: { operator: ">=", value: 3 } }` | OP15-002 |

Example — OP15-002 Lucy:

```json
{
  "type": "ACTION_PERFORMED_THIS_TURN",
  "controller": "SELF",
  "action": "ACTIVATED_EVENT",
  "filter": { "base_cost": { "operator": ">=", "value": 3 } }
}
```

### PLAY_METHOD

Checks HOW a card was played — from hand normally, by a Character's effect, by an Event's effect, or generically by any effect. Typically appears as a trigger qualification (narrowing which plays fire a trigger) or as a condition on effects that care about the play source.

> **Findings ref:** 2.34

```typescript
interface PlayMethodCondition {
  type: "PLAY_METHOD";
  method: PlaySource;
}

type PlaySource =
  | "FROM_HAND"
  | "BY_CHARACTER_EFFECT"
  | "BY_EVENT_EFFECT"
  | "BY_EFFECT";
```

| Text Pattern | Method | Example Cards |
|-------------|--------|---------------|
| "plays a Character using a Character's effect" | `BY_CHARACTER_EFFECT` | OP12-081 |
| "play a Character...from your hand" | `FROM_HAND` | OP02-026 |

---

## Dynamic Threshold Conditions

Conditions and target filter values where the threshold is derived from live game state rather than a fixed number. These integrate the `DynamicValue` type defined in [Schema Overview](./01-SCHEMA-OVERVIEW.md).

> **Findings ref:** 2.13

Dynamic thresholds appear in two positions:

1. **Condition values** — a condition's comparison threshold is game-state-dependent.
2. **Target filter values** — a filter's cost or power bound is game-state-dependent. See [Targeting](./05-TARGETING.md).

Both use `DynamicValue` wherever a fixed `number` would normally appear:

```typescript
type DynamicValue =
  | { type: "FIXED"; value: number }
  | { type: "GAME_STATE"; source: GameStateSource; controller?: Controller }
  | { type: "PER_COUNT"; source: DynamicSource; multiplier: number; divisor?: number }
  | { type: "ACTION_RESULT"; ref: string }
  | { type: "CHOSEN_VALUE" };

type GameStateSource =
  | "LIFE_COUNT"
  | "OPPONENT_LIFE_COUNT"
  | "COMBINED_LIFE_COUNT"
  | "DON_FIELD_COUNT"
  | "OPPONENT_DON_FIELD_COUNT"
  | "HAND_COUNT"
  | "DECK_COUNT"
  | "RESTED_CARD_COUNT"
  | "MATCHING_CARD_COUNT";
```

Any `NumericRange` value field accepts `DynamicValue` in place of a fixed number:

```json
{ "operator": "<=", "value": { "type": "GAME_STATE", "source": "OPPONENT_LIFE_COUNT" } }
```

| Text Pattern | Dynamic Source | Example Cards |
|-------------|---------------|---------------|
| "cost equal to or less than the number of your opponent's Life cards" | `OPPONENT_LIFE_COUNT` | OP05-102, ST29-002 |
| "cost equal to or less than the total of your and your opponent's Life cards" | `COMBINED_LIFE_COUNT` | OP04-112 |
| "cost equal to or less than the number of DON!! cards on your field" | `DON_FIELD_COUNT` | OP13-099 |
| "cost equal to or less than the number of DON!! cards on your opponent's field" | `OPPONENT_DON_FIELD_COUNT` | P-090 |

Example — OP05-102 Gedatsu: "K.O. up to 1 of your opponent's Characters with a cost equal to or less than the number of your opponent's Life cards."

```json
{
  "type": "KO",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": {
      "cost": { "operator": "<=", "value": { "type": "GAME_STATE", "source": "OPPONENT_LIFE_COUNT" } }
    }
  }
}
```

The engine evaluates the `DynamicValue` at resolution time by reading the referenced game state metric, then uses the result as a fixed number for the comparison.

---

## Zone-Specific Conditions

Conditions that check properties of cards within a specific zone, or card counts spanning multiple zones.

### FACE_UP_LIFE

Checks whether a player has face-up Life cards. Life cards default to face-down; certain effects turn them face-up. This condition gates effects that interact with the face-up Life subsystem.

> **Findings ref:** 2.21

```typescript
interface FaceUpLifeCondition {
  type: "FACE_UP_LIFE";
  controller: Controller;
  operator?: NumericOperator;
  value?: number;
}
```

When `operator` and `value` are omitted, defaults to existence check (at least 1 face-up Life card).

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have a face-up Life card..." | EB03-051, PRB02-018 |

### CARD_TYPE_IN_ZONE

Counts cards of a specific card type in a specific zone and checks the count against a threshold.

> **Findings ref:** 2.23

```typescript
interface CardTypeInZoneCondition {
  type: "CARD_TYPE_IN_ZONE";
  controller: Controller;
  card_type: "CHARACTER" | "EVENT" | "STAGE" | "LEADER";
  zone: Zone;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Card Type | Zone | Example Cards |
|-------------|----------|------|---------------|
| "4 or more Events in your trash" | `EVENT` | `TRASH` | EB04-034, OP15-021 |
| "+1000 power for every 2 Events in your trash" | `EVENT` | `TRASH` | EB01-027 |

Example — EB04-034 Charlotte Pudding: "If you have 4 or more Events in your trash..."

```json
{
  "type": "CARD_TYPE_IN_ZONE",
  "controller": "SELF",
  "card_type": "EVENT",
  "zone": "TRASH",
  "operator": ">=",
  "value": 4
}
```

When used for scaling values ("for every 2 Events in your trash"), the count feeds into a `DynamicValue` of type `PER_COUNT` rather than serving as a standalone condition. See [Schema Overview — Dynamic Values](./01-SCHEMA-OVERVIEW.md).

### COMBINED_ZONE_COUNT

Sums card counts across multiple zones for a single player and checks the total against a threshold.

> **Findings ref:** 2.14

```typescript
interface CombinedZoneCountCondition {
  type: "COMBINED_ZONE_COUNT";
  controller: Controller;
  zones: Zone[];
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Zones | Example Cards |
|-------------|-------|---------------|
| "a total of 4 or less cards in your Life area and hand" | `["LIFE", "HAND"]` | OP04-040, OP04-116 |

Example — OP04-040 Queen: "If you have a total of 4 or less cards in your Life area and hand..."

```json
{
  "type": "COMBINED_ZONE_COUNT",
  "controller": "SELF",
  "zones": ["LIFE", "HAND"],
  "operator": "<=",
  "value": 4
}
```

---

## Numeric Range Conditions

Numeric ranges specify how card property values (cost, power) are bounded within conditions and [TargetFilter](./05-TARGETING.md) definitions. `NumericRange` is not a standalone condition type but a value specification used within other conditions and filters.

```typescript
type NumericRange =
  | { operator: NumericOperator; value: number | DynamicValue }
  | { min: number; max: number }
  | { any_of: NumericRange[] };
```

Three shapes:

### Single Comparison

The standard case: one operator and one value.

```typescript
{ operator: NumericOperator; value: number | DynamicValue }
```

Examples: `{ operator: "<=", value: 5 }` for "5 or less", `{ operator: ">=", value: 8000 }` for "8000 or more".

### Bounded Range

> **Findings ref:** 2.15

A contiguous range with minimum and maximum (inclusive on both ends).

```typescript
{ min: number; max: number }
```

| Text Pattern | Range | Example Cards |
|-------------|-------|---------------|
| "cost of 3 to 5" | `{ min: 3, max: 5 }` | OP05-088 |
| "cost of 3 to 7" | `{ min: 3, max: 7 }` | OP05-091 |
| "cost of 2 to 8" | `{ min: 2, max: 8 }` | EB03-060 |
| "5000 to 7000 power" | `{ min: 5000, max: 7000 }` | EB02-039 |
| "cost of 3 to 8" | `{ min: 3, max: 8 }` | OP10-099 |

### Disjunctive Range

> **Findings ref:** 2.19

Non-contiguous value ranges where the value must fall into one of several disconnected intervals.

```typescript
{ any_of: NumericRange[] }
```

| Text Pattern | Encoding | Example Cards |
|-------------|----------|---------------|
| "0 or 3 or more DON!! cards on your field" | `{ any_of: [{ operator: "==", value: 0 }, { operator: ">=", value: 3 }] }` | OP05-060 |
| "cost of 0 or cost of 8 or more" | `{ any_of: [{ operator: "==", value: 0 }, { operator: ">=", value: 8 }] }` | OP14-090, EB03-046 |

Example — OP05-060 Monkey.D.Luffy: "If you have 0 or 3 or more DON!! cards on your field..."

```json
{
  "type": "DON_FIELD_COUNT",
  "controller": "SELF",
  "range": {
    "any_of": [
      { "operator": "==", "value": 0 },
      { "operator": ">=", "value": 3 }
    ]
  }
}
```

For conditions that use `operator` + `value` directly (like `DON_FIELD_COUNT`), the encoding agent should use the `any_of` compound wrapper when the range is disjunctive:

```json
{
  "any_of": [
    { "type": "DON_FIELD_COUNT", "controller": "SELF", "operator": "==", "value": 0 },
    { "type": "DON_FIELD_COUNT", "controller": "SELF", "operator": ">=", "value": 3 }
  ]
}
```

Within [TargetFilter](./05-TARGETING.md), `NumericRange` is used directly on `cost` and `power` fields, so bounded and disjunctive ranges apply natively there without needing a condition-level `any_of`.

---

## Board State Conditions

Conditions that check global board state properties not scoped to a specific card.

### BOARD_WIDE_EXISTENCE

Checks whether a card matching a filter exists on EITHER player's field. No ownership qualifier — the check spans both players' fields.

> **Findings ref:** 2.20

```typescript
interface BoardWideExistenceCondition {
  type: "BOARD_WIDE_EXISTENCE";
  filter: TargetFilter;
  count?: { operator: NumericOperator; value: number };
}
```

When `count` is omitted, defaults to existence (at least 1). Unlike `CARD_ON_FIELD` which is scoped to one player via `controller`, this checks both fields together.

| Text Pattern | Example Cards |
|-------------|---------------|
| "If there is a Character with 8000 power or more..." | OP14-018 |
| "If there is a Character with a cost of 0 or with a cost of 8 or more..." | EB03-046 |
| "If there are 2 or more Characters with a cost of 8 or more..." | EB04-045 |

Example — EB04-045 Ginny: "If there are 2 or more Characters with a cost of 8 or more..."

```json
{
  "type": "BOARD_WIDE_EXISTENCE",
  "filter": { "card_type": "CHARACTER", "cost": { "operator": ">=", "value": 8 } },
  "count": { "operator": ">=", "value": 2 }
}
```

Example — EB03-046 Miss Doublefinger: "If there is a Character with a cost of 0 or with a cost of 8 or more..." (disjunctive cost range)

```json
{
  "type": "BOARD_WIDE_EXISTENCE",
  "filter": {
    "card_type": "CHARACTER",
    "cost": { "any_of": [{ "operator": "==", "value": 0 }, { "operator": ">=", "value": 8 }] }
  }
}
```

### RESTED_CARD_COUNT

Counts ALL rested cards on a player's field — Characters, DON!!, Stages, and Leader. Not filtered by card type. This is a holistic board-state metric used by decks that benefit from resting cards.

> **Findings ref:** 2.29

```typescript
interface RestedCardCountCondition {
  type: "RESTED_CARD_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have 6 or more rested cards..." | ST16-003, ST24-001 |
| "If you have 8 or more rested cards..." | OP12-118 |

### DON_GIVEN

Checks DON!! attachment state on cards. Operates in two modes depending on whether it checks for global existence or per-card count.

> **Findings ref:** 2.30 (DON Given to Target), 2.31 (Opponent Has DON Given)

```typescript
interface DonGivenCondition {
  type: "DON_GIVEN";
  controller: Controller;
  mode: "ANY_CARD_HAS_DON" | "SPECIFIC_CARD";
  operator?: NumericOperator;
  value?: number;
}
```

**Mode: ANY_CARD_HAS_DON** — Boolean game-state condition: at least one of the specified player's cards has DON!! given to it. `operator` and `value` are not used.

| Text Pattern | Example Cards |
|-------------|---------------|
| "If your opponent has any DON!! cards given..." | OP15-005 |

```json
{
  "type": "DON_GIVEN",
  "controller": "OPPONENT",
  "mode": "ANY_CARD_HAS_DON"
}
```

**Mode: SPECIFIC_CARD** — Checks a specific card's DON!! given count. Used primarily as a [TargetFilter](./05-TARGETING.md) property but appears here for completeness.

| Text Pattern | Example Cards |
|-------------|---------------|
| "Characters that have 2 or more DON!! cards given" | OP15-001, OP15-025 |
| "Characters with a DON!! card given" | OP15-018 |
| "cost equal to the number of DON!! cards given to it" | OP15-031 |

When used in target filters, `don_given` is a property on `TargetFilter` with a `NumericRange` value. See [Targeting](./05-TARGETING.md) for the filter encoding.

### TURN_COUNT

Checks the current game turn number for a player.

> **Findings ref:** 2.22

```typescript
interface TurnCountCondition {
  type: "TURN_COUNT";
  controller: Controller;
  operator: NumericOperator;
  value: number;
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If it is your second turn or later..." | OP15-058 |

Example — OP15-058 Enel:

```json
{
  "type": "TURN_COUNT",
  "controller": "SELF",
  "operator": ">=",
  "value": 2
}
```

---

## Negation / Absence Conditions

Negation is handled by the `not` compound wrapper applied to any condition. This section consolidates common negation patterns.

> **Findings ref:** 2.11 (NOT/Absence), 2.12 (Duplicate/Uniqueness)

### Named Card Absence

"You don't have [Name]" — negate a `CARD_ON_FIELD` existence check.

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you don't have [Penguin]..." | OP01-044 |
| "if you don't have [Kuromarimo]" | OP08-005 |
| "If you don't have [Name]..." | OP01-050, OP03-027 |

```json
{
  "not": {
    "type": "CARD_ON_FIELD",
    "controller": "SELF",
    "filter": { "name": "Penguin" }
  }
}
```

### Uniqueness / No-Other-Copy

Checks whether no other card with the same name exists. Uses `CARD_ON_FIELD` with `exclude_self: true` inside a `not` wrapper.

| Pattern | Meaning | Example Cards |
|---------|---------|---------------|
| "you have no other [Cavendish] Characters..." | Only this copy of the named card exists | EB01-012 |
| "there are no other [Oars] cards..." | No other copy of named card on field | OP15-080 |
| "if you have no other [Itomimizu]" | Same | OP07-060 |

```json
{
  "not": {
    "type": "CARD_ON_FIELD",
    "controller": "SELF",
    "filter": { "name": "Cavendish" },
    "exclude_self": true
  }
}
```

### Positive Duplicate Check

The inverse — "you DO have another copy." Uses `CARD_ON_FIELD` with `exclude_self: true` without `not`.

| Text Pattern | Example Cards |
|-------------|---------------|
| "If you have a [Kung Fu Jugon] other than this Character..." | OP04-005 |

```json
{
  "type": "CARD_ON_FIELD",
  "controller": "SELF",
  "filter": { "name": "Kung Fu Jugon" },
  "exclude_self": true
}
```

### Composing Complex Absence

Combine `not` with `all_of` or `any_of` for complex absence patterns. OP15-080 Oars requires both a positive named-card-with-property check AND a negative uniqueness check:

```json
{
  "all_of": [
    {
      "type": "NAMED_CARD_WITH_PROPERTY",
      "controller": "SELF",
      "name": "Gecko Moria",
      "property": { "power": { "operator": ">=", "value": 10000 } }
    },
    {
      "not": {
        "type": "CARD_ON_FIELD",
        "controller": "SELF",
        "filter": { "name": "Oars" },
        "exclude_self": true
      }
    }
  ]
}
```

---

## Source-Specific Immunity Conditions

Conditions that filter the SOURCE of a game event (KO, removal, rest, battle). These are used within [Prohibitions](./06-PROHIBITIONS-AND-REPLACEMENTS.md) to scope which incoming effects the protection blocks.

> **Findings ref:** 2.32

```typescript
interface SourcePropertyCondition {
  type: "SOURCE_PROPERTY";
  context: SourceContext;
  source_filter: TargetFilter;
}

type SourceContext =
  | "KO_BY_EFFECT"
  | "KO_IN_BATTLE"
  | "REMOVAL_BY_EFFECT"
  | "REST_BY_EFFECT";
```

The condition checks: "Is the card or effect causing this event a card matching `source_filter`?"

| Text Pattern | Context | Source Filter | Example Cards |
|-------------|---------|---------------|---------------|
| "cannot be K.O.'d by effects of your opponent's Characters with 5000 base power or less" | `KO_BY_EFFECT` | `{ base_power: { operator: "<=", value: 5000 } }` | OP14-003 |
| "cannot be K.O.'d by effects of Characters without the \<Special\> attribute" | `KO_BY_EFFECT` | `{ attribute_not: "SPECIAL" }` | OP11-005 |
| "cannot be K.O.'d in battle by \<Strike\> attribute Characters" | `KO_IN_BATTLE` | `{ attribute: "STRIKE" }` | OP01-024 |

These conditions attach to Prohibition blocks as the `conditions` field, scoping when the prohibition is active:

```json
{
  "category": "permanent",
  "prohibitions": [{
    "prohibition_type": "CANNOT_BE_KO",
    "conditions": {
      "type": "SOURCE_PROPERTY",
      "context": "KO_BY_EFFECT",
      "source_filter": {
        "controller": "OPPONENT",
        "base_power": { "operator": "<=", "value": 5000 }
      }
    }
  }]
}
```

When a game event occurs (e.g., an opponent's Character effect attempts to KO this card), the engine checks whether the source of that event matches `source_filter`. If it does, the prohibition blocks the event. If it does not match, the prohibition does not apply and the event proceeds normally.

The `context` field distinguishes between different categories of events because the same card may have different immunity scopes for different event types (e.g., immune to KO by effects but not immune to KO in battle).

---

_Last updated: 2026-03-19_
