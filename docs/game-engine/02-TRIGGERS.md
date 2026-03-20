# 02 — Triggers

> Defines every trigger type in the OPTCG card effect schema. A trigger is the game event that causes an `auto` or `activate` EffectBlock to fire. This document covers the 12 keyword triggers printed in bracket notation, 19 custom reactive triggers observed across the full card pool, compound triggers, and all trigger modifiers.

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Conditions](./03-CONDITIONS.md) · [Actions](./04-ACTIONS.md) · [Engine Architecture](./08-ENGINE-ARCHITECTURE.md)

---

## Trigger Type Definition

The top-level `Trigger` is a discriminated union of three shapes. The engine dispatches on the presence of `keyword`, `event`, or `any_of` to determine which branch to evaluate.

```typescript
type Trigger =
  | KeywordTrigger
  | CustomTrigger
  | CompoundTrigger;
```

```typescript
interface KeywordTrigger {
  keyword: KeywordTriggerType;
  turn_restriction?: TurnRestriction;
  once_per_turn?: boolean;
  don_requirement?: number;
  cause?: KOCause;
}

interface CustomTrigger {
  event: CustomEventType;
  filter?: EventFilter;
  turn_restriction?: TurnRestriction;
  once_per_turn?: boolean;
  don_requirement?: number;
  quantity_threshold?: number;
}

interface CompoundTrigger {
  any_of: Trigger[];
}

type TurnRestriction = "YOUR_TURN" | "OPPONENT_TURN";
```

---

## Keyword Triggers

Twelve trigger types printed in `[Bracket Notation]` on the card. Each maps to a single enum value in `KeywordTriggerType`.

```typescript
type KeywordTriggerType =
  | "ON_PLAY"
  | "WHEN_ATTACKING"
  | "ON_KO"
  | "ON_BLOCK"
  | "ON_OPPONENT_ATTACK"
  | "ACTIVATE_MAIN"
  | "MAIN_EVENT"
  | "COUNTER"
  | "TRIGGER"
  | "END_OF_YOUR_TURN"
  | "END_OF_OPPONENT_TURN"
  | "START_OF_TURN";
```

### Keyword Trigger Catalog

| Enum | Text Pattern | Semantics | Example Cards |
|------|-------------|-----------|---------------|
| `ON_PLAY` | `[On Play]` | Fires when this card enters the field from any zone (hand, deck, life, trash). The canonical "enters the battlefield" trigger. | OP01-016, ST01-006 |
| `WHEN_ATTACKING` | `[When Attacking]` | Fires when this card is declared as the attacker, after DON!! attachment but before the opponent declares a blocker. | OP01-025, ST01-012 |
| `ON_KO` | `[On K.O.]` | Fires when this card is K.O.'d. Accepts an optional `cause` qualifier (see [Scoped ON_KO Variants](#scoped-on_ko-variants)). | OP09-052, ST15-003 |
| `ON_BLOCK` | `[On Block]` | Fires when this card activates its Blocker keyword and becomes the new battle target. | OP01-078, OP03-017 |
| `ON_OPPONENT_ATTACK` | `[On Your Opponent's Attack]` | Fires when any of your opponent's cards declares an attack against any of your cards. Not scoped to "attacks this card." | OP15-002, OP03-058 |
| `ACTIVATE_MAIN` | `[Activate: Main]` | Player-declared activation during Main Phase. Category is `activate`, not `auto`. Costs are typical. | ST07-010, OP01-051 |
| `MAIN_EVENT` | `[Main]` | The Main Phase trigger for Event cards. Functionally identical to `ACTIVATE_MAIN` but printed on Events. | OP03-017, ST12-016 |
| `COUNTER` | `[Counter]` | Fires during the Counter Step of a battle when one of the defending player's cards is being attacked. Events with `[Counter]` can be played from hand during this step. | OP01-029, ST01-015 |
| `TRIGGER` | `[Trigger]` | Fires when this card is revealed from the Life area as damage. The player may choose to activate the Trigger effect instead of adding the card to hand. | ST03-016, OP01-028 |
| `END_OF_YOUR_TURN` | `[End of Your Turn]` | Fires during the End Phase of the controller's turn. | OP05-098, ST08-001 |
| `END_OF_OPPONENT_TURN` | `[End of Your Opponent's Turn]` | Fires during the End Phase of the opponent's turn. | OP06-044, EB03-033 |
| `START_OF_TURN` | "at the start of your turn" | Fires at the beginning of the controller's turn, before the DON!! Phase. Not printed in bracket notation — appears as rules text. | OP13-079, OP15-058 |

### KeywordTrigger Fields

```typescript
interface KeywordTrigger {
  keyword: KeywordTriggerType;

  // Restricts the trigger to fire only during a specific player's turn.
  turn_restriction?: TurnRestriction;

  // [Once Per Turn] — can only fire once per turn. Resets at turn start.
  once_per_turn?: boolean;

  // [DON!! xN] prefix — trigger effect requires N DON!! attached to this card.
  // The DON!! are not consumed; they are a precondition.
  don_requirement?: number;

  // ON_KO only — qualifies what caused the K.O. Defaults to "ANY".
  cause?: KOCause;
}
```

The `don_requirement` field handles the `[DON!! xN]` prefix pattern. When present, the trigger fires normally but the effect only resolves if the source card has at least N DON!! cards attached. This field is available on both `KeywordTrigger` and `CustomTrigger`.

Example — ST01-012 Monkey.D.Luffy: `[DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle.`

```json
{
  "trigger": {
    "keyword": "WHEN_ATTACKING",
    "don_requirement": 2
  }
}
```

---

## Custom Trigger Events

Reactive triggers on game events not covered by the 12 keyword triggers. Each is a `CustomTrigger` with an `event` discriminant and an optional `filter` that narrows the event scope.

```typescript
type CustomEventType =
  | "OPPONENT_CHARACTER_KO"
  | "ANY_CHARACTER_KO"
  | "DON_RETURNED_TO_DON_DECK"
  | "DON_GIVEN_TO_CARD"
  | "EVENT_ACTIVATED"
  | "CHARACTER_PLAYED"
  | "CARD_REMOVED_FROM_LIFE"
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
  | "LEADER_ATTACK_DEALS_DAMAGE";
```

```typescript
interface EventFilter {
  controller?: Controller;
  cause?: EventCause;
  target_filter?: TargetFilter;
  source_zone?: Zone;
  includes_trigger_keyword?: boolean;
  includes_blocker_keyword?: boolean;
  attribute?: Attribute;
  battle_target_type?: CardType;
}

type Controller = "SELF" | "OPPONENT" | "EITHER" | "ANY";

type EventCause = "BY_EFFECT" | "BY_YOUR_EFFECT" | "BY_OPPONENT_EFFECT"
               | "BY_CHARACTER_EFFECT" | "IN_BATTLE" | "ANY";
```

---

### OPPONENT_CHARACTER_KO

Fires when any of the opponent's Characters are K.O.'d, regardless of cause.

```typescript
{ event: "OPPONENT_CHARACTER_KO" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When your opponent's Character is K.O.'d" | OP01-061 Kaido, OP03-076 Rob Lucci |
| "[Your Turn] [Once Per Turn] When your opponent's Character is K.O.'d" | EB04-044 Koby |

Example — OP01-061 Kaido:

```json
{
  "trigger": {
    "event": "OPPONENT_CHARACTER_KO"
  }
}
```

Example — EB04-044 Koby (with modifiers):

```json
{
  "trigger": {
    "event": "OPPONENT_CHARACTER_KO",
    "turn_restriction": "YOUR_TURN",
    "once_per_turn": true
  }
}
```

---

### ANY_CHARACTER_KO

Fires when any Character is K.O.'d — yours or your opponent's. Broader scope than `OPPONENT_CHARACTER_KO`.

```typescript
{ event: "ANY_CHARACTER_KO" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When a Character is K.O.'d" | ST08-001 Monkey.D.Luffy |
| "[Once Per Turn] When a Character is K.O.'d" | EB01-047 Laboon |

Example — EB01-047 Laboon:

```json
{
  "trigger": {
    "event": "ANY_CHARACTER_KO",
    "once_per_turn": true
  }
}
```

---

### DON_RETURNED_TO_DON_DECK

Fires when DON!! cards leave the field and return to the DON!! deck. Supports quantity thresholds and cause filters.

```typescript
{
  event: "DON_RETURNED_TO_DON_DECK",
  filter?: {
    controller?: Controller,    // whose DON!! field
    cause?: EventCause          // "BY_YOUR_EFFECT" for cause-filtered variants
  },
  quantity_threshold?: number   // minimum DON!! returned to fire
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When a DON!! card on the field is returned to your DON!! deck" | OP02-071 Magellan |
| "When a DON!! card on your field is returned to your DON!! deck" | OP05-074 Eustass"Captain"Kid, ST10-007 Killer, ST10-011 Heat, ST10-014 Wire |
| "When 2 or more DON!! cards on your field are returned to your DON!! deck" | OP09-061 Monkey.D.Luffy |
| "When a DON!! card on your field is returned to your DON!! deck by your effect" | EB03-033 Charlotte Brulee |

Example — OP09-061 (quantity threshold):

```json
{
  "trigger": {
    "event": "DON_RETURNED_TO_DON_DECK",
    "filter": { "controller": "SELF" },
    "quantity_threshold": 2
  }
}
```

Example — EB03-033 (cause filter + turn restriction):

```json
{
  "trigger": {
    "event": "DON_RETURNED_TO_DON_DECK",
    "filter": { "controller": "SELF", "cause": "BY_YOUR_EFFECT" },
    "turn_restriction": "OPPONENT_TURN",
    "once_per_turn": true
  }
}
```

---

### DON_GIVEN_TO_CARD

Fires when a DON!! card is attached to this Leader or any of your Characters.

```typescript
{ event: "DON_GIVEN_TO_CARD" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When this Leader or any of your Characters is given a DON!! card" | OP02-002 Monkey.D.Garp |

Example:

```json
{
  "trigger": {
    "event": "DON_GIVEN_TO_CARD"
  }
}
```

---

### EVENT_ACTIVATED

Fires when a player activates an Event card. The `controller` filter determines whose Event activation triggers it. Can also fire on [Trigger] or [Blocker] activations via additional filter flags.

```typescript
{
  event: "EVENT_ACTIVATED",
  filter?: {
    controller?: Controller,
    includes_trigger_keyword?: boolean,
    includes_blocker_keyword?: boolean
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When your opponent activates an Event" | OP01-004 Usopp, OP06-044 Gion |
| "When you activate an Event" | OP04-053 Page One |
| "When your opponent activates an Event or [Trigger]" | OP11-102 Camie |
| "When your opponent activates an Event or [Blocker]" | OP15-119 Monkey.D.Luffy |

Example — OP01-004 (opponent activates Event):

```json
{
  "trigger": {
    "event": "EVENT_ACTIVATED",
    "filter": { "controller": "OPPONENT" }
  }
}
```

Example — OP11-102 (Event or Trigger):

```json
{
  "trigger": {
    "any_of": [
      { "event": "EVENT_ACTIVATED", "filter": { "controller": "OPPONENT" } },
      { "event": "TRIGGER_ACTIVATED", "filter": { "controller": "OPPONENT" } }
    ]
  }
}
```

Note: The "Event or [Trigger]" and "Event or [Blocker]" patterns can alternatively be modeled as a `CompoundTrigger` with `any_of`, or as a single `EVENT_ACTIVATED` trigger with inclusive filter flags. The compound approach is preferred for clarity.

---

### CHARACTER_PLAYED

Fires when a Character card is played (enters the field from hand or by effect). The `controller` filter determines whose play triggers it. Additional filters constrain the played card's properties.

```typescript
{
  event: "CHARACTER_PLAYED",
  filter?: {
    controller?: Controller,
    target_filter?: TargetFilter,    // cost, type, name, power constraints on played card
    source_zone?: Zone,              // "HAND" for "from your hand" restriction
    cause?: EventCause,              // "BY_CHARACTER_EFFECT" for method-of-play filter
    includes_trigger_keyword?: boolean,
    no_base_effect?: boolean
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When your opponent plays a Character" | OP04-024 Sugar |
| "When you play a Character with no base effect from your hand" | OP02-026 Sanji |
| "When your opponent plays a Character with a base cost of 8 or more" | OP12-081 Koala |
| "When your opponent plays a Character using a Character's effect" | OP12-081 Koala (second clause) |
| "When you play a Character with a [Trigger]" | OP13-100 Jewelry Bonney |

Example — OP02-026 Sanji:

```json
{
  "trigger": {
    "event": "CHARACTER_PLAYED",
    "filter": {
      "controller": "SELF",
      "source_zone": "HAND",
      "no_base_effect": true
    }
  }
}
```

Example — OP12-081 Koala (compound — either high-cost play or play-by-effect):

```json
{
  "trigger": {
    "any_of": [
      {
        "event": "CHARACTER_PLAYED",
        "filter": {
          "controller": "OPPONENT",
          "target_filter": { "base_cost_min": 8 }
        }
      },
      {
        "event": "CHARACTER_PLAYED",
        "filter": {
          "controller": "OPPONENT",
          "cause": "BY_CHARACTER_EFFECT"
        }
      }
    ]
  }
}
```

---

### CARD_REMOVED_FROM_LIFE

Fires when a card is removed from any player's Life area (by damage, effect, or any cause).

```typescript
{
  event: "CARD_REMOVED_FROM_LIFE",
  filter?: {
    controller?: Controller   // "SELF", "OPPONENT", or "EITHER"
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When a card is removed from your opponent's Life cards" | OP08-105 Jewelry Bonney |
| "When a card is removed from your or your opponent's Life cards" | OP11-041 Nami, OP12-099 Kalgara |

Example — OP11-041 Nami:

```json
{
  "trigger": {
    "event": "CARD_REMOVED_FROM_LIFE",
    "filter": { "controller": "EITHER" }
  }
}
```

---

### TRIGGER_ACTIVATED

Fires when any [Trigger] effect activates from the Life area.

```typescript
{ event: "TRIGGER_ACTIVATED" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When a [Trigger] activates" | OP05-109 Pagaya, OP13-106 Conney |

Example:

```json
{
  "trigger": {
    "event": "TRIGGER_ACTIVATED"
  }
}
```

---

### COMBAT_VICTORY

Fires when this Character battles and K.O.'s an opponent's Character as a result of that battle.

```typescript
{ event: "COMBAT_VICTORY" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When this Character battles and K.O.'s your opponent's Character" | OP02-094 Isuka, OP04-086 |

Example:

```json
{
  "trigger": {
    "event": "COMBAT_VICTORY"
  }
}
```

The engine determines a combat victory when: this Character is the attacker, the defending Character's power is less than or equal to the attacker's power at battle resolution, and the defender is K.O.'d as a result.

---

### CHARACTER_BATTLES

Fires when this Character enters a battle against a specific target type. Distinct from `WHEN_ATTACKING` — this fires for both attacking and defending, and can filter by the opponent's card properties.

```typescript
{
  event: "CHARACTER_BATTLES",
  filter?: {
    battle_target_type?: CardType,  // "CHARACTER" vs "LEADER"
    target_filter?: TargetFilter    // attribute, power, etc. of the battled card
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "If this Character battles your opponent's Character" | ST02-010 Basil Hawkins |
| "When this Character battles \<Strike\> attribute Characters" | ST05-010 Zephyr |

Example — ST05-010 Zephyr:

```json
{
  "trigger": {
    "event": "CHARACTER_BATTLES",
    "filter": {
      "target_filter": { "attribute": "STRIKE" }
    }
  }
}
```

---

### END_OF_BATTLE

Fires at the conclusion of a battle in which this Character participated. Provides access to the battle context for targeting "the opponent's Character you battled with."

```typescript
{
  event: "END_OF_BATTLE",
  filter?: {
    battle_target_type?: CardType,
    target_filter?: TargetFilter   // cost, power constraints on the battled opponent
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "At the end of a battle in which this Character battles your opponent's Character" | ST08-013 Mr.2.Bon.Kurei |
| "At the end of a battle in which this Character battles your opponent's Character with a cost of 5 or less" | OP04-047 Ice Oni |

The engine must track battle participants so that actions referencing "the opponent's Character you battled with" can resolve. This is handled via `target_ref` on the trigger, which the action chain can reference.

Example — OP04-047 Ice Oni:

```json
{
  "trigger": {
    "event": "END_OF_BATTLE",
    "filter": {
      "battle_target_type": "CHARACTER",
      "target_filter": { "cost_max": 5, "controller": "OPPONENT" }
    }
  }
}
```

---

### LIFE_COUNT_BECOMES_ZERO

Fires when a player's Life card count reaches exactly 0.

```typescript
{
  event: "LIFE_COUNT_BECOMES_ZERO",
  filter?: {
    controller?: Controller   // whose life count
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When your number of Life cards becomes 0" | OP05-098 Enel |

Example:

```json
{
  "trigger": {
    "event": "LIFE_COUNT_BECOMES_ZERO",
    "filter": { "controller": "SELF" }
  }
}
```

---

### CARD_ADDED_TO_HAND_FROM_LIFE

Fires when a card is added to the controller's hand from the Life area (typically via damage).

```typescript
{ event: "CARD_ADDED_TO_HAND_FROM_LIFE" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When a card is added to your hand from your Life" | OP05-107 Lieutenant Spacey |

Example:

```json
{
  "trigger": {
    "event": "CARD_ADDED_TO_HAND_FROM_LIFE"
  }
}
```

---

### DRAW_OUTSIDE_DRAW_PHASE

Fires when the controller draws a card outside of their normal Draw Phase draw.

```typescript
{ event: "DRAW_OUTSIDE_DRAW_PHASE" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When you draw a card outside of your Draw Phase" | OP05-053 Mozambia |

Example:

```json
{
  "trigger": {
    "event": "DRAW_OUTSIDE_DRAW_PHASE"
  }
}
```

---

### CHARACTER_BECOMES_RESTED

Fires when this Character transitions from active to rested state. Supports cause filtering for source-specific variants.

```typescript
{
  event: "CHARACTER_BECOMES_RESTED",
  filter?: {
    cause?: EventCause   // "BY_OPPONENT_EFFECT", "BY_CHARACTER_EFFECT", "ANY"
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When this Character becomes rested" | OP14-119 Dracule Mihawk |
| "When this Character becomes rested by your opponent's Character's effect" | OP14-070 Buffalo |

Example — OP14-070 Buffalo:

```json
{
  "trigger": {
    "event": "CHARACTER_BECOMES_RESTED",
    "filter": { "cause": "BY_OPPONENT_EFFECT" }
  }
}
```

---

### CHARACTER_RETURNED_TO_HAND

Fires when an opponent's Character is returned to the owner's hand, scoped by cause.

```typescript
{
  event: "CHARACTER_RETURNED_TO_HAND",
  filter?: {
    controller?: Controller,   // whose character was returned
    cause?: EventCause         // "BY_YOUR_EFFECT"
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When your opponent's Character is returned to the owner's hand by your effect" | EB02-023 Crocodile |

Example:

```json
{
  "trigger": {
    "event": "CHARACTER_RETURNED_TO_HAND",
    "filter": { "controller": "OPPONENT", "cause": "BY_YOUR_EFFECT" }
  }
}
```

---

### DAMAGE_TAKEN

Fires when the controller takes damage (a Life card is removed as combat damage or effect damage).

```typescript
{ event: "DAMAGE_TAKEN" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When you take damage" | OP13-002 Portgas.D.Ace |

Note: OP13-002 uses this as part of a compound trigger — "When you take damage **or** your Character with 6000 base power or more is K.O.'d." The compound form uses `any_of`:

```json
{
  "trigger": {
    "any_of": [
      { "event": "DAMAGE_TAKEN" },
      {
        "event": "ANY_CHARACTER_KO",
        "filter": {
          "controller": "SELF",
          "target_filter": { "base_power_min": 6000 }
        }
      }
    ]
  }
}
```

---

### BLOCKER_ACTIVATED

Fires when the opponent activates a [Blocker] keyword ability.

```typescript
{
  event: "BLOCKER_ACTIVATED",
  filter?: {
    controller?: Controller
  }
}
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When your opponent activates [Blocker]" | OP09-118 Gol.D.Roger |

Example:

```json
{
  "trigger": {
    "event": "BLOCKER_ACTIVATED",
    "filter": { "controller": "OPPONENT" }
  }
}
```

---

### LEADER_ATTACK_DEALS_DAMAGE

Fires when this Leader's attack successfully deals damage to the opponent's Life.

```typescript
{ event: "LEADER_ATTACK_DEALS_DAMAGE" }
```

| Text Pattern | Example Cards |
|-------------|---------------|
| "When this Leader's attack deals damage to your opponent's Life" | OP03-040 Nami |

Example:

```json
{
  "trigger": {
    "event": "LEADER_ATTACK_DEALS_DAMAGE"
  }
}
```

---

## Custom Trigger Summary

| Event | Text Pattern | Example Cards |
|-------|-------------|---------------|
| `OPPONENT_CHARACTER_KO` | "When your opponent's Character is K.O.'d" | OP01-061, OP03-076, EB04-044 |
| `ANY_CHARACTER_KO` | "When a Character is K.O.'d" | ST08-001, EB01-047 |
| `DON_RETURNED_TO_DON_DECK` | "When a DON!! card...is returned to your DON!! deck" | OP02-071, OP05-074, OP09-061, EB03-033, ST10-007, ST10-011, ST10-014 |
| `DON_GIVEN_TO_CARD` | "When...given a DON!! card" | OP02-002 |
| `EVENT_ACTIVATED` | "When [you/opponent] activates an Event" | OP01-004, OP04-053, OP06-044 |
| `CHARACTER_PLAYED` | "When [you/opponent] plays a Character" | OP02-026, OP04-024, OP12-081, OP13-100 |
| `CARD_REMOVED_FROM_LIFE` | "When a card is removed from...Life cards" | OP08-105, OP11-041, OP12-099 |
| `TRIGGER_ACTIVATED` | "When a [Trigger] activates" | OP05-109, OP13-106 |
| `COMBAT_VICTORY` | "When this Character battles and K.O.'s" | OP02-094, OP04-086 |
| `CHARACTER_BATTLES` | "When this Character battles..." | ST02-010, ST05-010 |
| `END_OF_BATTLE` | "At the end of a battle in which this Character battles" | ST08-013, OP04-047 |
| `LIFE_COUNT_BECOMES_ZERO` | "When your number of Life cards becomes 0" | OP05-098 |
| `CARD_ADDED_TO_HAND_FROM_LIFE` | "When a card is added to your hand from your Life" | OP05-107 |
| `DRAW_OUTSIDE_DRAW_PHASE` | "When you draw a card outside of your Draw Phase" | OP05-053 |
| `CHARACTER_BECOMES_RESTED` | "When this Character becomes rested" | OP14-119, OP14-070 |
| `CHARACTER_RETURNED_TO_HAND` | "When...Character is returned to the owner's hand" | EB02-023 |
| `DAMAGE_TAKEN` | "When you take damage" | OP13-002 |
| `BLOCKER_ACTIVATED` | "When your opponent activates [Blocker]" | OP09-118 |
| `LEADER_ATTACK_DEALS_DAMAGE` | "When this Leader's attack deals damage" | OP03-040 |

---

## Compound / Dual Triggers

A single EffectBlock fires on either of two (or more) trigger events. Printed as `/` notation on the card (e.g., `[On Play]/[When Attacking]`). Modeled as a `CompoundTrigger` containing an `any_of` array.

```typescript
interface CompoundTrigger {
  any_of: Trigger[];
}
```

When the engine evaluates a `CompoundTrigger`, it checks each trigger in `any_of` independently. The effect fires if **any one** matches the current game event. The effect does not fire multiple times if multiple triggers match simultaneously — `any_of` is a disjunction, not a multi-fire.

### Observed Compound Patterns

| Pattern | Example Cards |
|---------|---------------|
| `[On Play]` / `[When Attacking]` | ST26-005, EB01-012, EB01-046, ST10-012, ST14-007, OP02-036, OP02-062 |
| `[When Attacking]` / `[On Your Opponent's Attack]` | OP15-002 |
| `[When Attacking]` / `[On Block]` | OP01-078 |
| `[Main]` / `[Counter]` | OP03-017, ST12-016 |
| `[On Play]` / `[On K.O.]` | EB02-053 |

Example — ST26-005 (`[On Play]/[When Attacking]`):

```json
{
  "trigger": {
    "any_of": [
      { "keyword": "ON_PLAY" },
      { "keyword": "WHEN_ATTACKING" }
    ]
  }
}
```

Example — OP03-017 (`[Main]/[Counter]`):

```json
{
  "trigger": {
    "any_of": [
      { "keyword": "MAIN_EVENT" },
      { "keyword": "COUNTER" }
    ]
  }
}
```

Compound triggers also occur between keyword triggers and custom triggers. OP13-002's "When you take damage **or** your Character with 6000 base power or more is K.O.'d" is a compound of `DAMAGE_TAKEN` and a filtered `ANY_CHARACTER_KO` (see [DAMAGE_TAKEN](#damage_taken) above).

---

## Turn-Restricted Triggers

`[Your Turn]` or `[Opponent's Turn]` prefixed on a trigger restricts the turn during which the trigger can fire. This is a **timing gate** — an `[On Play]` gated by `[Your Turn]` will not fire if the card is played during the opponent's turn (e.g., via a Trigger effect).

```typescript
type TurnRestriction = "YOUR_TURN" | "OPPONENT_TURN";
```

The `turn_restriction` field is available on both `KeywordTrigger` and `CustomTrigger`.

### Observed Patterns

| Restriction | Trigger | Example Cards |
|-------------|---------|---------------|
| `YOUR_TURN` | `ON_PLAY` | ST22-011, EB03-031, EB03-032, OP03-013 |
| `OPPONENT_TURN` | `ON_KO` | EB03-055, EB03-042 |
| `YOUR_TURN` | `OPPONENT_CHARACTER_KO` (custom) | EB04-044 |
| `OPPONENT_TURN` | `DON_RETURNED_TO_DON_DECK` (custom) | EB03-033 |

Example — EB03-055 (`[Opponent's Turn] [On K.O.]`):

```json
{
  "trigger": {
    "keyword": "ON_KO",
    "turn_restriction": "OPPONENT_TURN"
  }
}
```

### Engine Behavior

When the engine checks whether a trigger fires:

1. Evaluate the base trigger event (keyword match or custom event match).
2. If `turn_restriction` is present, check the current turn owner. If the turn owner does not match the restriction, the trigger does not fire.
3. All other modifiers (`once_per_turn`, `don_requirement`, conditions) are evaluated after the turn check passes.

---

## Scoped ON_KO Variants

The standard `ON_KO` keyword trigger fires when "this card is K.O.'d" by any cause. The card pool introduces cause-specific variants that distinguish *how* the K.O. happened.

```typescript
type KOCause =
  | "ANY"              // default — any cause
  | "BATTLE"           // K.O.'d as a result of battle damage
  | "EFFECT"           // K.O.'d by any effect
  | "OPPONENT_EFFECT"; // K.O.'d specifically by an opponent's effect
```

The `cause` field is only valid on `KeywordTrigger` where `keyword` is `ON_KO`. It defaults to `"ANY"` when omitted.

### Observed Patterns

| Cause | Text Pattern | Example Cards |
|-------|-------------|---------------|
| `ANY` | `[On K.O.]` (standard) | Most cards with On K.O. |
| `OPPONENT_EFFECT` | "When this Character is K.O.'d by your opponent's effect" | OP09-052 Marco, OP11-024, OP11-035, OP11-051, ST15-003 Kingdew |
| `BATTLE` | K.O.'d in battle (implied by comprehensive rules as distinct from effect-KO) | Structural — distinguishes combat from effect removal |
| `EFFECT` | "When this Character is K.O.'d by an effect" | Generic effect-KO (either player's effect) |

Example — OP09-052 Marco:

```json
{
  "trigger": {
    "keyword": "ON_KO",
    "cause": "OPPONENT_EFFECT"
  }
}
```

### Engine Behavior

When a Character is K.O.'d, the engine must tag the K.O. event with its cause before checking On K.O. triggers:

- Battle resolution K.O. → cause = `BATTLE`
- K.O. by the controller's own effect → cause = `EFFECT`
- K.O. by the opponent's effect → cause = `OPPONENT_EFFECT`

A trigger with `cause: "ANY"` matches all three. A trigger with `cause: "OPPONENT_EFFECT"` only matches the third. A trigger with `cause: "EFFECT"` matches both the second and third (any effect, regardless of controller).

---

## Self-Referencing Effect Reuse

The `[Trigger]` keyword trigger can instruct the player to activate a different EffectBlock on the same card. This is modeled as a `REUSE_EFFECT` action (defined in [Actions](./04-ACTIONS.md)) rather than a special trigger type. The trigger itself is a standard `{ keyword: "TRIGGER" }`.

```typescript
interface ReuseEffectAction {
  type: "REUSE_EFFECT";
  target_effect: KeywordTriggerType;
}
```

The `target_effect` field identifies which EffectBlock to activate by its trigger keyword. The engine locates the matching EffectBlock on the same card and resolves it.

### Observed Patterns

| Text Pattern | Target Effect | Example Cards |
|-------------|---------------|---------------|
| "[Trigger] Activate this card's [Counter] effect." | `COUNTER` | ST03-016, OP01-028, OP01-030 |
| "[Trigger] Activate this card's [Main] effect." | `MAIN_EVENT` | ST21-017, EB01-020, EB01-051, EB04-049 |
| "[Trigger] Activate this card's [On Play] effect." | `ON_PLAY` | OP13-113, OP14-108 |

Example — ST03-016 (Trigger activates Counter):

```json
{
  "id": "trigger_block",
  "category": "auto",
  "trigger": { "keyword": "TRIGGER" },
  "actions": [
    { "type": "REUSE_EFFECT", "target_effect": "COUNTER" }
  ]
}
```

Example — OP13-113 (Trigger activates On Play):

```json
{
  "id": "trigger_block",
  "category": "auto",
  "trigger": { "keyword": "TRIGGER" },
  "actions": [
    { "type": "REUSE_EFFECT", "target_effect": "ON_PLAY" }
  ]
}
```

### Engine Behavior

1. The `[Trigger]` effect fires when the card is revealed from Life.
2. The engine resolves `REUSE_EFFECT` by finding the EffectBlock on the same card whose trigger keyword matches `target_effect`.
3. The referenced EffectBlock's conditions are evaluated and its actions are resolved as though that trigger had fired.
4. Costs on the referenced EffectBlock are paid normally.

---

## Cost on Trigger Effects

Most trigger effects (`[Trigger]`) are free to activate. Some require a DON!! cost, making activation optional based on the player's available DON!! on the field.

This is modeled using the standard `costs` field on the EffectBlock, not a special trigger property. The trigger is `{ keyword: "TRIGGER" }` and the cost is an adjacent field on the same EffectBlock.

```typescript
interface EffectBlock {
  trigger: { keyword: "TRIGGER" };
  costs: Cost[];
  actions: Action[];
}
```

### Observed Patterns

| Cost | Text Pattern | Example Cards |
|------|-------------|---------------|
| DON!! -1 | "[Trigger] DON!! -1: Play this card." | EB01-035 Ms. Monday, EB01-038 Oh Come My Way |
| DON!! -2 | "[Trigger] DON!! -2: Play this card." | OP04-064 Ms. All Sunday |

Example — EB01-035 Ms. Monday:

```json
{
  "category": "auto",
  "trigger": { "keyword": "TRIGGER" },
  "costs": [
    { "type": "DON_MINUS", "amount": 1 }
  ],
  "actions": [
    { "type": "PLAY_SELF" }
  ]
}
```

Example — OP04-064 Ms. All Sunday:

```json
{
  "category": "auto",
  "trigger": { "keyword": "TRIGGER" },
  "costs": [
    { "type": "DON_MINUS", "amount": 2 }
  ],
  "actions": [
    { "type": "PLAY_SELF" }
  ]
}
```

### Engine Behavior

When a `[Trigger]` effect has costs:

1. The card is revealed from Life.
2. The engine checks if the player can pay the costs.
3. If the player can pay and chooses to activate, costs are paid and actions resolve.
4. If costs cannot be paid, the Trigger effect cannot be activated. The card is added to hand normally.

This uses the same cost payment pipeline as `[Activate: Main]` effects. See [Cost Types](./01-SCHEMA-OVERVIEW.md#cost-system) for the full cost taxonomy.

---

_Last updated: 2026-03-19_
