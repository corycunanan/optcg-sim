# 07 — Rule Modifications

> Rule modifications are effects that alter fundamental game rules. Unlike auto/activate effects that respond to events, or permanent effects that modify card properties, rule modifications change the rules themselves — restricting deck construction, overriding loss conditions, changing how game phases work, or granting properties that exist outside the normal effect layer.

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Conditions](./03-CONDITIONS.md) · [Engine Architecture](./08-ENGINE-ARCHITECTURE.md)

---

## RuleModification Type Definition

Rule modifications use a discriminated union keyed on `rule_type`. Each variant defines a distinct category of rule override.

```typescript
type RuleModification =
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
```

Rule modifications live in the `rule` field of an [EffectBlock](./01-SCHEMA-OVERVIEW.md) with `category: "rule_modification"`. They are always implicit `PERMANENT` duration and typically `zone: "ANY"` since many apply before or outside normal gameplay.

### Rule Modification Summary

| `rule_type` | Timing | Scope | Section |
|-------------|--------|-------|---------|
| `NAME_ALIAS` | Always (all zones, all game phases) | Card identity | [10.1](#name-aliasing-101) |
| `COUNTER_GRANT` | Always (all zones) | Card property | [10.2](#counter-value-grant-102) |
| `DECK_RESTRICTION` | Deck construction | Legal card pool | [10.3](#deck-construction-restrictions-103) |
| `COPY_LIMIT_OVERRIDE` | Deck construction | Copy count | [10.4](#deck-copy-limit-override-104) |
| `DON_DECK_SIZE_OVERRIDE` | Game setup | DON!! deck | [10.5](#don-deck-size-override-105) |
| `DON_PHASE_BEHAVIOR` | DON!! Phase | Phase rules | [10.6](#don-phase-behavior-modification-106) |
| `LOSS_CONDITION_MOD` | Continuous | Win/loss rules | [10.7](#loss-condition-modification-107) |
| `START_OF_GAME_EFFECT` | Game setup (before turn 1) | One-shot setup | [10.8](#start-of-game-effects-108) |
| `TRIGGER_TYPE_NEGATION` | Continuous | Effect resolution | [10.9](#blanket-trigger-type-negation-109) |
| `PLAY_STATE_MOD` | Continuous | Play mechanics | [10.10](#play-state-modification-1010) |
| `DAMAGE_RULE_MOD` | Continuous | Damage resolution | [10.11](#damage-rule-modification-1011) |

---

## Name Aliasing (10.1)

A card is treated as having one or more additional names for all game purposes: deck construction legality, targeting by name, condition checks, and copy-limit counting.

```typescript
interface NameAlias {
  rule_type: "NAME_ALIAS";
  aliases: string[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `aliases` | `string[]` | Additional card names this card is treated as having |

The card retains its original printed name and *also* matches any name in the `aliases` array. This affects:

- Deck construction copy-limit counting (a deck with 4 copies of "Yamato" and 1 copy of "Yamato (OP01-121)" that aliases "Kouzuki Oden" counts Yamato at 4 and Oden at 1)
- Name-based targeting (e.g., "up to 1 [Kouzuki Oden]" matches this card)
- Name-based conditions (e.g., "if you have [Kouzuki Oden]" is satisfied)

### Single Alias

Most name alias cards add exactly one additional name.

OP01-121 Yamato — "Also treat this card's name as [Kouzuki Oden] according to the rules."

```json
{
  "id": "name_alias",
  "category": "rule_modification",
  "rule": {
    "rule_type": "NAME_ALIAS",
    "aliases": ["Kouzuki Oden"]
  },
  "zone": "ANY"
}
```

Other single-alias cards: OP02-042, OP03-122, OP04-099, EB02-016 Chopperman (aliases "Tony Tony.Chopper"), EB02-024 Sogeking (aliases "Usopp"), P-027 General Franky (aliases "Franky").

### Multiple Aliases

A card can alias more than one name simultaneously.

EB04-038 Rosinante & Law — "Also treat this card's name as [Trafalgar Law] and [Donquixote Rosinante] according to the rules."

```json
{
  "id": "name_alias",
  "category": "rule_modification",
  "rule": {
    "rule_type": "NAME_ALIAS",
    "aliases": ["Trafalgar Law", "Donquixote Rosinante"]
  },
  "zone": "ANY"
}
```

---

## Counter Value Grant (10.2)

Grants a Counter value to cards that lack one. This is a rule-level property grant, not a modifier — it establishes a base Counter value where none was printed.

```typescript
interface CounterGrant {
  rule_type: "COUNTER_GRANT";
  value: number;
  filter: TargetFilter;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `value` | `number` | Counter value to grant (typically 1000) |
| `filter` | [`TargetFilter`](./05-TARGETING.md) | Which cards receive the Counter. Must include `has_counter: false` implicitly — only cards without a printed Counter are affected. |

EB01-001 Kouzuki Oden — "All of your {Land of Wano} type Character cards without a Counter have a +1000 Counter, according to the rules."

```json
{
  "id": "counter_grant",
  "category": "rule_modification",
  "rule": {
    "rule_type": "COUNTER_GRANT",
    "value": 1000,
    "filter": {
      "card_type": "CHARACTER",
      "traits": ["Land of Wano"],
      "has_counter": false
    }
  },
  "zone": "ANY"
}
```

The grant applies in all zones — the card has a Counter value in hand (where Counter is used) as well as for any effect that checks whether a card "has a Counter."

---

## Deck Construction Restrictions (10.3)

Limits which cards can be included in a deck when this Leader/card is used. Evaluated entirely during deck validation, before the game begins.

```typescript
interface DeckRestriction {
  rule_type: "DECK_RESTRICTION";
  restriction: "CANNOT_INCLUDE" | "ONLY_INCLUDE";
  filter: TargetFilter;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `restriction` | `"CANNOT_INCLUDE" \| "ONLY_INCLUDE"` | Whether the filter defines excluded cards or the exclusively allowed set |
| `filter` | [`TargetFilter`](./05-TARGETING.md) | Cards matching this filter are excluded (`CANNOT_INCLUDE`) or are the only cards allowed (`ONLY_INCLUDE`) |

### Restriction Modes

**`CANNOT_INCLUDE`** — Cards matching the filter are illegal in the deck.

**`ONLY_INCLUDE`** — Only cards matching the filter are legal. All non-matching cards are excluded. This is the inverse: a whitelist rather than a blacklist.

### Cost-Based Restriction

OP13-079 Imu — "you cannot include Events with a cost of 2 or more in your deck"

```json
{
  "id": "deck_restriction",
  "category": "rule_modification",
  "rule": {
    "rule_type": "DECK_RESTRICTION",
    "restriction": "CANNOT_INCLUDE",
    "filter": {
      "card_type": "EVENT",
      "cost_min": 2
    }
  }
}
```

### Broad Cost Restriction

OP12-001 Silvers Rayleigh — "you cannot include cards with a cost of 5 or more in your deck"

```json
{
  "id": "deck_restriction",
  "category": "rule_modification",
  "rule": {
    "rule_type": "DECK_RESTRICTION",
    "restriction": "CANNOT_INCLUDE",
    "filter": {
      "cost_min": 5
    }
  }
}
```

### Type-Only Restriction (Whitelist)

P-117 Nami — "you can only include {East Blue} type cards in your deck"

```json
{
  "id": "deck_restriction",
  "category": "rule_modification",
  "rule": {
    "rule_type": "DECK_RESTRICTION",
    "restriction": "ONLY_INCLUDE",
    "filter": {
      "traits": ["East Blue"]
    }
  }
}
```

### Validation Behavior

The deck builder and server-side validation both consume `DECK_RESTRICTION` rules from the selected Leader card:

1. Collect all `rule_modification` effect blocks where `rule.rule_type === "DECK_RESTRICTION"`.
2. For `CANNOT_INCLUDE`: reject any card in the deck list that matches the filter.
3. For `ONLY_INCLUDE`: reject any card that does **not** match the filter.
4. Multiple restrictions stack — a card must pass all restriction checks.

---

## Deck Copy Limit Override (10.4)

Overrides the standard 4-copy limit for this specific card. The OPTCG comprehensive rules (2-2-4) normally restrict decks to a maximum of 4 copies of any card (by name). This rule modification removes that cap.

```typescript
interface CopyLimitOverride {
  rule_type: "COPY_LIMIT_OVERRIDE";
  limit: "UNLIMITED";
}
```

| Field | Type | Description |
|-------|------|-------------|
| `limit` | `"UNLIMITED"` | The override. Currently only `UNLIMITED` exists in the card pool. |

OP01-075 Pacifista — "you may have any number of this card in your deck."

```json
{
  "id": "copy_limit",
  "category": "rule_modification",
  "rule": {
    "rule_type": "COPY_LIMIT_OVERRIDE",
    "limit": "UNLIMITED"
  }
}
```

The `limit` field uses a string literal rather than a number to clearly distinguish "no limit" from "higher limit." If future cards specify a numeric override (e.g., "up to 8 copies"), extend the type to `"UNLIMITED" | number`.

---

## DON!! Deck Size Override (10.5)

Changes the number of DON!! cards in the DON!! deck from the standard 10.

```typescript
interface DonDeckSizeOverride {
  rule_type: "DON_DECK_SIZE_OVERRIDE";
  size: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `size` | `number` | DON!! deck size (replaces the default 10) |

OP15-058 Enel — "your DON!! deck consists of 6 cards."

```json
{
  "id": "don_deck_size",
  "category": "rule_modification",
  "rule": {
    "rule_type": "DON_DECK_SIZE_OVERRIDE",
    "size": 6
  }
}
```

Applied during game setup when constructing the DON!! deck. The engine reads this from the Leader card before dealing DON!! cards.

---

## DON!! Phase Behavior Modification (10.6)

Alters how DON!! cards are placed during the DON!! Phase. The standard rule (comprehensive rules 5-3) places 2 DON!! cards from DON!! deck to the cost area. This modification changes what happens to one or more of those placements.

```typescript
interface DonPhaseBehavior {
  rule_type: "DON_PHASE_BEHAVIOR";
  condition?: Condition;
  count: number;
  destination: "GIVEN_TO_LEADER" | "GIVEN_TO_CHARACTER" | "PLACED_RESTED";
}
```

| Field | Type | Description |
|-------|------|-------------|
| `condition` | [`Condition`](./03-CONDITIONS.md) (optional) | Gate for when this modification applies |
| `count` | `number` | How many of the DON!! Phase placements are redirected |
| `destination` | `string` | Where the redirected DON!! goes instead of the cost area |

OP13-003 Gol.D.Roger — "If you have any DON!! cards on your field, 1 DON!! card placed during your DON!! Phase is given to your Leader."

```json
{
  "id": "don_phase_mod",
  "category": "rule_modification",
  "rule": {
    "rule_type": "DON_PHASE_BEHAVIOR",
    "condition": {
      "type": "DON_FIELD_COUNT",
      "controller": "SELF",
      "operator": ">=",
      "value": 1
    },
    "count": 1,
    "destination": "GIVEN_TO_LEADER"
  }
}
```

During DON!! Phase resolution, the engine checks for active `DON_PHASE_BEHAVIOR` modifications. If the condition is met, `count` DON!! placements are redirected to the specified destination. The remaining placements follow normal rules.

---

## Loss Condition Modification (10.7)

Changes the standard loss conditions. The OPTCG comprehensive rules define two loss conditions: (1) Life reaches 0 and leader takes damage, (2) deck-out (cannot draw from an empty deck). This modification type overrides either.

```typescript
interface LossConditionMod {
  rule_type: "LOSS_CONDITION_MOD";
  trigger_event: "DECK_OUT";
  modification: LossModificationType;
  delay?: DelaySpec;
}

type LossModificationType =
  | "WIN_INSTEAD"
  | "DELAYED_LOSS";

interface DelaySpec {
  timing: "END_OF_TURN";
}
```

| Field | Type | Description |
|-------|------|-------------|
| `trigger_event` | `"DECK_OUT"` | Which loss condition is modified |
| `modification` | `LossModificationType` | How the loss is changed |
| `delay` | `DelaySpec` (optional) | When `DELAYED_LOSS`, specifies when the loss actually occurs |

### Win Instead of Losing

OP03-040 Nami — "When your deck is reduced to 0, you win the game instead of losing."

```json
{
  "id": "loss_mod",
  "category": "rule_modification",
  "rule": {
    "rule_type": "LOSS_CONDITION_MOD",
    "trigger_event": "DECK_OUT",
    "modification": "WIN_INSTEAD"
  }
}
```

### Delayed Loss

OP15-022 Brook — "you do not lose when your deck has 0 cards. You lose at the end of the turn in which your deck becomes 0 cards."

```json
{
  "id": "loss_mod",
  "category": "rule_modification",
  "rule": {
    "rule_type": "LOSS_CONDITION_MOD",
    "trigger_event": "DECK_OUT",
    "modification": "DELAYED_LOSS",
    "delay": {
      "timing": "END_OF_TURN"
    }
  }
}
```

The engine hooks into the deck-out check. When a player would lose from deck-out:

1. Check for `LOSS_CONDITION_MOD` with `trigger_event: "DECK_OUT"`.
2. If `WIN_INSTEAD`: reverse the outcome — the player wins.
3. If `DELAYED_LOSS`: suppress the immediate loss and register a scheduled check at the specified `delay.timing`. The player loses at that point if the deck is still at 0.

---

## Start of Game Effects (10.8)

Actions performed during game setup, after deck validation and mulligan but before the first turn. These are one-shot effects resolved as part of the setup sequence.

```typescript
interface StartOfGameEffect {
  rule_type: "START_OF_GAME_EFFECT";
  actions: Action[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `actions` | [`Action[]`](./04-ACTIONS.md) | Ordered actions to execute during setup |

The `actions` array uses the same [Action](./04-ACTIONS.md) type as auto/activate effects, supporting full targeting, filtering, and chaining.

OP13-079 Imu — "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck."

```json
{
  "id": "start_of_game",
  "category": "rule_modification",
  "rule": {
    "rule_type": "START_OF_GAME_EFFECT",
    "actions": [
      {
        "type": "FULL_DECK_SEARCH",
        "target": {
          "type": "STAGE_CARD",
          "source_zone": "DECK",
          "count": { "up_to": 1 },
          "filter": {
            "card_type": "STAGE",
            "traits": ["Mary Geoise"]
          }
        },
        "params": {
          "destination": "PLAY"
        }
      }
    ]
  }
}
```

### Setup Sequence Integration

Start-of-game effects resolve in this order within the game setup:

1. Deck validation (including `DECK_RESTRICTION` checks)
2. DON!! deck construction (including `DON_DECK_SIZE_OVERRIDE`)
3. Mulligan
4. **Start-of-game effects** resolve (both players, turn-order player first)
5. First turn begins

If both players have start-of-game effects, the player going first resolves theirs first (per comprehensive rules on simultaneous setup effects).

---

## Blanket Trigger-Type Negation (10.9)

Negates all effects of a given trigger type for a specified controller. This is a sweeping suppression — every effect block with the matching trigger on the affected player's cards is treated as if it doesn't exist.

```typescript
interface TriggerTypeNegation {
  rule_type: "TRIGGER_TYPE_NEGATION";
  trigger_type: TriggerType;
  affected_controller: Controller;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `trigger_type` | [`TriggerType`](./02-TRIGGERS.md) | Which trigger type is negated (e.g., `ON_PLAY`) |
| `affected_controller` | [`Controller`](./05-TARGETING.md) | Whose effects are negated: `SELF` or `OPPONENT` |

OP09-081 Marshall.D.Teach has two rule modification blocks:

Self-negation (permanent while on field): "Your [On Play] effects are negated."

```json
{
  "id": "negate_own_on_play",
  "category": "rule_modification",
  "rule": {
    "rule_type": "TRIGGER_TYPE_NEGATION",
    "trigger_type": "ON_PLAY",
    "affected_controller": "SELF"
  }
}
```

Opponent-negation (granted via auto effect with duration): "Your opponent's [On Play] effects are negated until end of opponent's next turn."

This second instance would typically be delivered by an auto effect that applies a `TRIGGER_TYPE_NEGATION` as a modifier with a duration, rather than as a static rule modification. See [Conditions](./03-CONDITIONS.md) and [Actions](./04-ACTIONS.md) for how auto effects can impose temporary rule-level changes.

### Engine Behavior

When resolving any auto effect:

1. Before checking conditions, check for active `TRIGGER_TYPE_NEGATION` rules matching the effect's trigger type and the card's controller.
2. If a match exists, skip the effect entirely — it does not activate, does not check conditions, does not resolve actions.

---

## Play State Modification (10.10)

Changes the default state in which cards enter the field. The standard rule is that Characters are played active (upright). This modification changes the default entry state.

```typescript
interface PlayStateMod {
  rule_type: "PLAY_STATE_MOD";
  card_type: "CHARACTER" | "STAGE" | "ANY";
  entry_state: "RESTED";
}
```

| Field | Type | Description |
|-------|------|-------------|
| `card_type` | `string` | Which card types are affected |
| `entry_state` | `"RESTED"` | The state cards enter in (currently only `RESTED` exists) |

OP09-022 Lim — "Your Character cards are played rested."

```json
{
  "id": "play_state_mod",
  "category": "rule_modification",
  "rule": {
    "rule_type": "PLAY_STATE_MOD",
    "card_type": "CHARACTER",
    "entry_state": "RESTED"
  }
}
```

This interacts with Rush: a Character with Rush can still attack the turn it's played, but it enters rested and must be set active first (Rush sets the card active as part of its resolution).

---

## Damage Rule Modification (10.11)

Changes what happens to Life cards when they are removed due to damage. The standard rule (comprehensive rules 7-3-1) adds face-down Life cards to hand and face-up Life cards to hand. This modification redirects face-up Life cards to a different zone.

```typescript
interface DamageRuleMod {
  rule_type: "DAMAGE_RULE_MOD";
  applies_to: "FACE_UP_LIFE";
  destination: "DECK_BOTTOM" | "TRASH";
  instead_of: "HAND";
}
```

| Field | Type | Description |
|-------|------|-------------|
| `applies_to` | `"FACE_UP_LIFE"` | Which Life cards are affected |
| `destination` | `string` | Where the affected Life cards go instead |
| `instead_of` | `"HAND"` | The standard destination being replaced |

ST13-003 Monkey.D.Luffy — "Your face-up Life cards are placed at the bottom of your deck instead of being added to your hand, according to the rules."

```json
{
  "id": "damage_rule_mod",
  "category": "rule_modification",
  "rule": {
    "rule_type": "DAMAGE_RULE_MOD",
    "applies_to": "FACE_UP_LIFE",
    "destination": "DECK_BOTTOM",
    "instead_of": "HAND"
  }
}
```

### Interaction with Triggers

When a face-up Life card is redirected to deck bottom instead of hand:

- The `[Trigger]` effect on the card still activates (per comprehensive rules, Trigger checks happen when a Life card is removed, before it reaches its destination).
- The card does NOT enter the hand, so any "when a card is added to your hand from Life" triggers do NOT fire.

---

## EffectBlock Examples

### Full EffectBlock for a Leader with Multiple Rule Modifications

OP13-079 Imu has both a deck restriction and a start-of-game effect, encoded as separate EffectBlocks:

```json
{
  "effects": [
    {
      "id": "deck_restriction",
      "category": "rule_modification",
      "rule": {
        "rule_type": "DECK_RESTRICTION",
        "restriction": "CANNOT_INCLUDE",
        "filter": {
          "card_type": "EVENT",
          "cost_min": 2
        }
      }
    },
    {
      "id": "start_of_game",
      "category": "rule_modification",
      "rule": {
        "rule_type": "START_OF_GAME_EFFECT",
        "actions": [
          {
            "type": "FULL_DECK_SEARCH",
            "target": {
              "type": "STAGE_CARD",
              "source_zone": "DECK",
              "count": { "up_to": 1 },
              "filter": {
                "card_type": "STAGE",
                "traits": ["Mary Geoise"]
              }
            },
            "params": {
              "destination": "PLAY"
            }
          }
        ]
      }
    }
  ]
}
```

### Name Alias Alongside Normal Effects

EB02-024 Sogeking — has a name alias rule and a separate auto effect:

```json
{
  "effects": [
    {
      "id": "name_alias",
      "category": "rule_modification",
      "rule": {
        "rule_type": "NAME_ALIAS",
        "aliases": ["Usopp"]
      },
      "zone": "ANY"
    },
    {
      "id": "on_play_effect",
      "category": "auto",
      "trigger": { "type": "ON_PLAY" },
      "actions": [
        "..."
      ]
    }
  ]
}
```

---

## Engine Integration

Rule modifications require special handling at multiple points in the engine lifecycle. Unlike other effect categories that participate in the standard trigger/resolve pipeline, rule modifications hook into the game at structural checkpoints.

### Processing Order

| Phase | Rule Types Checked |
|-------|--------------------|
| Deck validation | `DECK_RESTRICTION`, `COPY_LIMIT_OVERRIDE` |
| Game setup | `DON_DECK_SIZE_OVERRIDE`, `START_OF_GAME_EFFECT` |
| DON!! Phase | `DON_PHASE_BEHAVIOR` |
| Effect resolution | `TRIGGER_TYPE_NEGATION` |
| Card entry | `PLAY_STATE_MOD` |
| Damage resolution | `DAMAGE_RULE_MOD` |
| Loss condition check | `LOSS_CONDITION_MOD` |
| Identity checks (any time) | `NAME_ALIAS`, `COUNTER_GRANT` |

### Indexing

The engine should build indexes at game start for frequently-checked rule modifications:

- **Name alias map**: `Map<string, Set<cardInstanceId>>` — for instant name lookups during targeting.
- **Active negations**: `Set<{ trigger_type, controller }>` — checked on every auto effect activation.
- **Play state overrides**: checked on every `PLAY_CARD` resolution.
- **Damage rule overrides**: checked on every damage step.

Deck-time rules (`DECK_RESTRICTION`, `COPY_LIMIT_OVERRIDE`) are only evaluated during validation and do not need runtime indexes.

---

_Last updated: 2026-03-19_
