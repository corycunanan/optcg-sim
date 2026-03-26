# Card Effect Schema Authoring Guide

This directory contains authored effect schemas for OPTCG cards. Each schema defines a card's effects in a structured format that the engine can execute.

## File Organization

Schemas are grouped by set or deck:
- `op01.ts` — Representative OP01 cards (18 cards)
- `ace-deck.ts` — Ace test deck (19 cards, cross-set)
- `nami-deck.ts` — Nami test deck (15 cards)

New files should follow the pattern `{set-id}.ts` (e.g., `op02.ts`) or `{deck-name}-deck.ts` for test decks. Each file exports named constants and an array of all schemas for registration.

## Registration

All schemas must be registered in `schema-registry.ts` so the engine can look them up by `card_id`. Add your schemas to the registry's import list and include them in the lookup map.

## Top-Level Schema Structure

```typescript
const OP01_006: EffectSchema = {
  card_id: "OP01-006",          // Must match Card.id in database
  card_name: "Otama",           // Display reference only
  card_type: "Character",       // "Character" | "Event" | "Leader" | "Stage"
  effects: [                    // One or more EffectBlocks
    { /* effect block */ }
  ],
  rule_modifications: []        // Optional: deck rules, name aliases
};
```

## Effect Block Structure

Each effect block represents one distinct ability on the card:

```typescript
{
  id: string;                   // Unique: "{cardId}_effect_{n}"
  category: EffectCategory;     // "auto" | "activate" | "permanent" | "replacement" | "rule_modification"
  trigger?: Trigger;            // What fires this effect (auto/activate)
  costs?: Cost[];               // What to pay (before the colon in card text)
  conditions?: Condition;       // When the effect can resolve
  actions?: Action[];           // What to do (after the colon in card text)
  modifiers?: Modifier[];       // Continuous effects (permanent)
  prohibitions?: Prohibition[]; // Restrictions (permanent)
  replaces?: ReplacementTrigger; // What to intercept (replacement)
  replacement_actions?: Action[]; // What to do instead (replacement)
  rule?: RuleModification;      // Game rule change (rule_modification)
  flags?: EffectFlags;          // once_per_turn, optional, intrinsic keywords
  duration?: Duration;          // How long effect lasts
  zone?: EffectZone;            // "FIELD" | "HAND" | "ANY"
}
```

### Category Quick Reference

| Category | Required Fields | Use When |
|----------|----------------|----------|
| `auto` | trigger, actions | `[On Play]`, `[When Attacking]`, `[On K.O.]`, custom event triggers |
| `activate` | trigger, actions | `[Activate: Main]`, `[Main]` on Events |
| `permanent` | modifiers OR prohibitions | Auras, static buffs, "cannot X" restrictions |
| `replacement` | replaces, replacement_actions | "Instead of X, do Y" |
| `rule_modification` | rule | Name aliases, deck restrictions, counter grants |

---

## Encoding Card Text

The fundamental rule: **everything before the colon (`:`) is a cost; everything after is an action.**

### Reading Order

1. Identify the **trigger** — bracket tag `[On Play]` or text pattern "When X happens"
2. Identify **costs** — text before the colon
3. Identify **conditions** — "If..." clauses
4. Identify **actions** — text after the colon or after conditions
5. Note **flags** — `[Once Per Turn]`, "You may..."

### Example Breakdown

Card text: `[Once Per Turn] [When Attacking] If you have 2 or less Life cards, trash 1 card from your hand: K.O. up to 1 of your opponent's Characters with a cost of 4 or less.`

```typescript
{
  id: "CARD_ID_effect_1",
  category: "auto",
  trigger: { keyword: "WHEN_ATTACKING" },
  flags: { once_per_turn: true },
  conditions: {
    type: "LIFE_COUNT",
    controller: "SELF",
    operator: "<=",
    value: 2
  },
  costs: [
    { type: "TRASH_FROM_HAND", amount: 1 }
  ],
  actions: [
    {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { up_to: 1 },
        filter: { cost_max: 4 }
      }
    }
  ]
}
```

---

## Complete Trigger Catalog

### Keyword Triggers

These map to printed bracket tags on cards:

| Card Text | Trigger | Notes |
|-----------|---------|-------|
| `[On Play]` | `{ keyword: "ON_PLAY" }` | When card enters field from hand |
| `[When Attacking]` | `{ keyword: "WHEN_ATTACKING" }` | When this card attacks |
| `[On K.O.]` | `{ keyword: "ON_KO" }` | When this card is K.O.'d |
| `[On Block]` | `{ keyword: "ON_BLOCK" }` | When this card blocks |
| `[On Your Opponent's Attack]` | `{ keyword: "ON_OPPONENT_ATTACK" }` | When opponent declares attack |
| `[Activate: Main]` | `{ keyword: "ACTIVATE_MAIN" }` | Manual activation in Main Phase |
| `[Main]` (Events) | `{ keyword: "MAIN_EVENT" }` | Event card activation |
| `[Counter]` | `{ keyword: "COUNTER" }` | During Counter Step |
| `[Trigger]` | `{ keyword: "TRIGGER" }` | When revealed from Life |
| `[End of Your Turn]` | `{ keyword: "END_OF_YOUR_TURN" }` | End of your turn |
| `[End of Your Opponent's Turn]` | `{ keyword: "END_OF_OPPONENT_TURN" }` | End of opponent's turn |
| `Start of Your Turn` | `{ keyword: "START_OF_TURN" }` | Start of your turn |

**Keyword Trigger Modifiers** (all optional):

```typescript
{
  keyword: "WHEN_ATTACKING",
  turn_restriction?: "YOUR_TURN" | "OPPONENT_TURN",
  once_per_turn?: boolean,          // [Once Per Turn]
  don_requirement?: number,          // [DON!! xN]
  cause?: "OPPONENT_EFFECT" | "IN_BATTLE"  // ON_KO only
}
```

### Custom Event Triggers

For effects that react to game events (not bracket-tag abilities):

| Card Text Pattern | Trigger |
|-------------------|---------|
| "When your opponent's Character is K.O.'d" | `{ event: "OPPONENT_CHARACTER_KO" }` |
| "When a Character is K.O.'d" | `{ event: "ANY_CHARACTER_KO" }` |
| "When DON!! returned to DON!! deck" | `{ event: "DON_RETURNED_TO_DON_DECK" }` |
| "When given a DON!!" | `{ event: "DON_GIVEN_TO_CARD" }` |
| "When an Event is activated" | `{ event: "EVENT_ACTIVATED" }` |
| "When you play a Character" | `{ event: "CHARACTER_PLAYED" }` |
| "When a card is removed from Life" | `{ event: "CARD_REMOVED_FROM_LIFE" }` |
| "When [Trigger] is activated" | `{ event: "TRIGGER_ACTIVATED" }` |
| "When this Character battles and K.O.'s" | `{ event: "COMBAT_VICTORY" }` |
| "When this Character battles" | `{ event: "CHARACTER_BATTLES" }` |
| "At end of battle" | `{ event: "END_OF_BATTLE" }` |
| "When Life reaches 0" | `{ event: "LIFE_COUNT_BECOMES_ZERO" }` |
| "When card added to hand from Life" | `{ event: "CARD_ADDED_TO_HAND_FROM_LIFE" }` |
| "When you draw outside Draw Phase" | `{ event: "DRAW_OUTSIDE_DRAW_PHASE" }` |
| "When Character becomes rested" | `{ event: "CHARACTER_BECOMES_RESTED" }` |
| "When Character returned to hand" | `{ event: "CHARACTER_RETURNED_TO_HAND" }` |
| "When you take damage" | `{ event: "DAMAGE_TAKEN" }` |
| "When opponent activates [Blocker]" | `{ event: "BLOCKER_ACTIVATED" }` |
| "When Leader attack deals damage" | `{ event: "LEADER_ATTACK_DEALS_DAMAGE" }` |

**Custom triggers support filters:**

```typescript
{
  event: "CHARACTER_PLAYED",
  filter: {
    controller: "SELF" | "OPPONENT" | "EITHER",
    cause: "BY_EFFECT" | "BY_YOUR_EFFECT" | "BY_OPPONENT_EFFECT" | "IN_BATTLE",
    target_filter: TargetFilter,     // Card property filters
    source_zone: Zone,
    includes_trigger_keyword: boolean,
    attribute: Attribute,
    battle_target_type: CardType
  },
  quantity_threshold: number,        // "When 2 or more..."
  turn_restriction: "YOUR_TURN" | "OPPONENT_TURN",
  once_per_turn: boolean,
  don_requirement: number
}
```

### Compound Triggers

For cards with multiple trigger conditions (OR logic):

```typescript
{
  any_of: [
    { keyword: "ON_PLAY" },
    { keyword: "WHEN_ATTACKING" }
  ]
}
```

---

## Complete Condition Catalog

### Simple Conditions

**Resource Conditions:**

| Type | Card Text | Example |
|------|-----------|---------|
| `LIFE_COUNT` | "If you have N or less Life" | `{ type: "LIFE_COUNT", controller: "SELF", operator: "<=", value: 2 }` |
| `HAND_COUNT` | "If you have N or less in hand" | `{ type: "HAND_COUNT", controller: "SELF", operator: "<=", value: 3 }` |
| `TRASH_COUNT` | "If you have N or more in trash" | `{ type: "TRASH_COUNT", controller: "SELF", operator: ">=", value: 10 }` |
| `DECK_COUNT` | "If you have N or less in deck" | `{ type: "DECK_COUNT", controller: "SELF", operator: "<=", value: 5 }` |
| `DON_FIELD_COUNT` | "If you have N DON!! on field" | `{ type: "DON_FIELD_COUNT", controller: "SELF", operator: ">=", value: 5 }` |
| `ACTIVE_DON_COUNT` | "If you have N active DON!!" | `{ type: "ACTIVE_DON_COUNT", controller: "SELF", operator: ">=", value: 3 }` |
| `ALL_DON_STATE` | "If all DON!! are rested" | `{ type: "ALL_DON_STATE", controller: "SELF", state: "RESTED" }` |

**Card Existence:**

| Type | Card Text | Example |
|------|-----------|---------|
| `CARD_ON_FIELD` | "If you have a [Name]" | `{ type: "CARD_ON_FIELD", controller: "SELF", filter: { name: "Nami" } }` |
| `CARD_ON_FIELD` | "If you have a Character with..." | `{ type: "CARD_ON_FIELD", controller: "SELF", filter: { traits: ["Straw Hat Crew"] }, count: { min: 2 } }` |
| `MULTIPLE_NAMED_CARDS` | "If you have [A] and [B]" | `{ type: "MULTIPLE_NAMED_CARDS", controller: "SELF", names: ["Luffy", "Zoro"] }` |
| `FIELD_PURITY` | "If only {Trait} Characters" | `{ type: "FIELD_PURITY", controller: "SELF", filter: { traits: ["Whitebeard Pirates"] } }` |

**Leader Properties:**

```typescript
{ type: "LEADER_PROPERTY", controller: "SELF", property: {
  trait: "Straw Hat Crew"   // OR
  name: "Luffy"             // OR
  power: { operator: ">=", value: 6000 }  // OR
  color_includes: ["RED"]   // OR
  multicolored: true
}}
```

**Self State:**

| Type | Card Text | Example |
|------|-----------|---------|
| `SELF_POWER` | "If this has N+ power" | `{ type: "SELF_POWER", operator: ">=", value: 7000 }` |
| `SELF_STATE` | "If this is rested" | `{ type: "SELF_STATE", state: "RESTED" }` |
| `WAS_PLAYED_THIS_TURN` | "If played this turn" | `{ type: "WAS_PLAYED_THIS_TURN" }` |
| `NO_BASE_EFFECT` | "Character with no effect" | `{ type: "NO_BASE_EFFECT" }` |
| `HAS_EFFECT_TYPE` | "Card with [Trigger]" | `{ type: "HAS_EFFECT_TYPE", effect_type: "TRIGGER" }` |

**Comparative:**

```typescript
{ type: "COMPARATIVE", metric: "LIFE_COUNT", comparison: "LESS_THAN" }
// "If you have less Life than opponent"
// Metrics: LIFE_COUNT, HAND_COUNT, DECK_COUNT, DON_FIELD_COUNT
```

**Other:**

| Type | Card Text |
|------|-----------|
| `ACTION_PERFORMED_THIS_TURN` | "If you activated an Event this turn" |
| `TURN_COUNT` | "If it is your second turn or later" |
| `RESTED_CARD_COUNT` | "If you have N+ rested cards" |
| `CARD_TYPE_IN_ZONE` | "N+ Events in trash" |
| `BOARD_WIDE_EXISTENCE` | "If there is a Character with N+ power" |

### Compound Conditions

```typescript
{ all_of: [cond1, cond2] }    // AND — both must be true
{ any_of: [cond1, cond2] }    // OR — at least one true
{ not: condition }              // Negation
```

---

## Complete Cost Catalog

All costs go in the `costs` array. They represent text **before the colon**.

### DON!! Costs

| Type | Card Text | Example |
|------|-----------|---------|
| `DON_MINUS` | "DON!! -N" (return to deck) | `{ type: "DON_MINUS", amount: 6 }` |
| `DON_REST` | "① / ② / ③" (rest DON) | `{ type: "DON_REST", amount: 1 }` |
| `REST_DON` | "Rest N DON!!" | `{ type: "REST_DON", amount: 3 }` |
| `VARIABLE_DON_RETURN` | "Return 1+ DON!!" | `{ type: "VARIABLE_DON_RETURN" }` |

### Self Costs

| Type | Card Text |
|------|-----------|
| `REST_SELF` | "Rest this card" |
| `TRASH_SELF` | "Trash this card" (not K.O.) |

### Hand Costs

| Type | Card Text | Notes |
|------|-----------|-------|
| `TRASH_FROM_HAND` | "Trash N from hand" | Optional `filter: { traits: [...] }` |
| `REVEAL_FROM_HAND` | "Reveal N from hand" | With filter |
| `PLAY_NAMED_CARD_FROM_HAND` | "Play [Name] from hand" | |

### Field Costs

| Type | Card Text |
|------|-----------|
| `REST_CARDS` | "Rest N of your cards" |
| `REST_NAMED_CARD` | "Rest [Name]" |
| `KO_OWN_CHARACTER` | "K.O. one of your Characters" |
| `TRASH_OWN_CHARACTER` | "Trash your Character" |
| `RETURN_OWN_CHARACTER_TO_HAND` | "Return your Character to hand" |
| `PLACE_OWN_CHARACTER_TO_DECK` | "Place Character at deck bottom" |

### Other Costs

| Type | Card Text |
|------|-----------|
| `LEADER_POWER_REDUCTION` | "Your Leader -N power" |
| `LIFE_TO_HAND` | "Add N Life to hand" |
| `TRASH_FROM_LIFE` | "Trash N from Life" |
| `PLACE_FROM_TRASH_TO_DECK` | "Return N from trash to deck" |

---

## Complete Action Catalog

Actions go in the `actions` array. They represent text **after the colon**.

### Card Movement

| Type | Card Text | Params |
|------|-----------|--------|
| `DRAW` | "Draw N" | `{ amount: N }` |
| `SEARCH_DECK` | "Look at N, pick up to M, rest at bottom" | `{ look_at: N, pick: { up_to: M }, rest_destination: "BOTTOM" }` |
| `FULL_DECK_SEARCH` | "Search your deck" | `{ pick: { up_to: 1 }, filter: {...} }` |
| `SEARCH_AND_PLAY` | "Look at N, play up to M" | `{ look_at: N, play: { up_to: M } }` |
| `KO` | "K.O. up to N" | Target with count + filter |
| `RETURN_TO_HAND` | "Return to hand" | Target |
| `RETURN_TO_DECK` | "Place at top/bottom of deck" | Target, `{ position: "TOP" \| "BOTTOM" }` |
| `TRASH_CARD` | "Trash" (not K.O.) | Target |
| `TRASH_FROM_HAND` | "Trash N from hand" | `{ amount: N }` |
| `PLAY_CARD` | "Play from hand/trash/life" | Target, source zone |
| `MILL` | "Trash N from top of deck" | `{ amount: N }` |
| `DECK_SCRY` | "Look at N, arrange" | `{ amount: N, position: "TOP" }` |

### Power & Stats

| Type | Card Text | Params |
|------|-----------|--------|
| `MODIFY_POWER` | "+N / -N power" | `{ amount: N }`, duration |
| `SET_BASE_POWER` | "Set base power to N" | `{ value: N }` |
| `SET_POWER_TO_ZERO` | "Set power to 0" | Target |
| `MODIFY_COST` | "+N / -N cost" | `{ amount: N }` |

### Keywords

| Type | Card Text | Params |
|------|-----------|--------|
| `GRANT_KEYWORD` | "Gains [Keyword]" | `{ keyword: "RUSH" }`, target, duration |
| `NEGATE_EFFECTS` | "Negate effects" | Target |

### DON!! Manipulation

| Type | Card Text |
|------|-----------|
| `GIVE_DON` | "Give up to N DON!! to card" |
| `RETURN_DON_TO_DECK` | "Return N DON!! to deck" |
| `ADD_DON_FROM_DECK` | "Add N from DON!! deck" |
| `SET_DON_ACTIVE` | "Set up to N DON!! active" |
| `REST_DON` | "Rest N DON!!" |
| `FORCE_OPPONENT_DON_RETURN` | "Opponent returns N DON!!" |

### State Change

| Type | Card Text |
|------|-----------|
| `SET_ACTIVE` | "Set card to active" |
| `SET_REST` | "Set card to rested" |
| `APPLY_PROHIBITION` | "Cannot X" (via action, not permanent) |

### Life Manipulation

| Type | Card Text |
|------|-----------|
| `ADD_TO_LIFE_FROM_DECK` | "Add N from deck to Life" |
| `ADD_TO_LIFE_FROM_HAND` | "Add from hand to Life" |
| `TRASH_FROM_LIFE` | "Trash N from Life" |
| `TURN_LIFE_FACE_UP` | "Face up N Life cards" |
| `PLAY_FROM_LIFE` | "Play card from Life" |

### Flow / Meta

| Type | Card Text | Notes |
|------|-----------|-------|
| `PLAYER_CHOICE` | "Choose one:" | `{ choices: [{ id, label, actions }] }` |
| `OPPONENT_CHOICE` | "Opponent chooses" | `{ options: [...] }` |
| `SCHEDULE_ACTION` | "At end of turn, do X" | `{ timing: "END_OF_THIS_TURN", action: {...} }` |
| `REUSE_EFFECT` | "Activate [Trigger] effect" | `{ target_effect: "COUNTER" \| "MAIN_EVENT" }` |

### Chain Connectors

Actions chain together with connectors on the **following** action:

| Connector | Card Text | Behavior |
|-----------|-----------|----------|
| `THEN` | "Then," | Execute next regardless of prior success |
| `IF_DO` | "If you do," | Execute only if prior action succeeded |
| `AND` | (simultaneous) | Atomic operation |

```typescript
actions: [
  { type: "DRAW", params: { amount: 2 } },
  { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
  { type: "KO", target: {...}, chain: "IF_DO" }
]
```

---

## Target System

### Target Types

| Type | Description | Controller |
|------|-------------|------------|
| `SELF` | This card | N/A |
| `YOUR_LEADER` | Your Leader | N/A |
| `OPPONENT_LEADER` | Opponent's Leader | N/A |
| `CHARACTER` | Character(s) on field | `"SELF"` / `"OPPONENT"` / `"EITHER"` |
| `LEADER_OR_CHARACTER` | Leader or Character | Controller required |
| `ALL_YOUR_CHARACTERS` | Every Character you control | N/A |
| `ALL_OPPONENT_CHARACTERS` | Every opponent Character | N/A |
| `CHARACTER_CARD` | Character in a zone | Requires `source_zone` |
| `CARD_IN_HAND` | Card in hand | Controller |
| `CARD_IN_TRASH` | Card in trash | Controller |
| `CARD_ON_TOP_OF_DECK` | Top N of deck | Controller |
| `DON_IN_COST_AREA` | DON!! in cost area | Controller |

### Count Modes

```typescript
count: { exact: 1 }        // Must select exactly 1
count: { up_to: 2 }        // Select 0 to 2
count: { all: true }       // Every valid target
count: { any_number: true } // 0 or more, unbounded
```

### Target Filters

Filters narrow valid targets. Key fields:

**Cost:** `cost_exact`, `cost_min`, `cost_max`, `cost_range`, `base_cost_exact`, `base_cost_min`, `base_cost_max`

**Power:** `power_exact`, `power_min`, `power_max`, `power_range`, `base_power_exact`, `base_power_min`, `base_power_max`

**Color:** `color` (single), `color_includes` (array), `color_not_matching_ref`

**Traits:** `traits` (all required, AND), `traits_any_of` (at least one, OR), `traits_exclude`

**Name:** `name` (exact), `name_any_of` (array), `name_includes` (substring), `exclude_name`, `exclude_self`

**Keywords:** `keywords` (array), `has_trigger`, `attribute`, `has_effect`, `no_base_effect`

**State:** `is_rested`, `is_active`

**Disjunctive:** `any_of: TargetFilter[]` — OR combination of filter sets

### Back-References

When a second action refers to the result of a first:

```typescript
actions: [
  {
    type: "RETURN_TO_HAND",
    target: { type: "CHARACTER", controller: "OPPONENT", count: { up_to: 1 } },
    result_ref: "returned_card"
  },
  {
    type: "PLAY_CARD",
    target_ref: "returned_card",
    chain: "THEN"
  }
]
```

---

## Duration Types

```typescript
{ type: "THIS_TURN" }                              // Until end of current turn
{ type: "THIS_BATTLE" }                            // Until end of current battle
{ type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }   // Through opponent's next turn
{ type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
{ type: "UNTIL_END_OF_YOUR_NEXT_TURN" }
{ type: "UNTIL_START_OF_YOUR_NEXT_TURN" }
{ type: "PERMANENT" }                              // Until card leaves field
```

---

## Prohibition Types

Used in `permanent` effect blocks via the `prohibitions` array:

| Type | Card Text | Scope |
|------|-----------|-------|
| `CANNOT_BE_KO` | "Cannot be K.O.'d" | `cause: "IN_BATTLE" \| "BY_EFFECT" \| "ANY"` |
| `CANNOT_ATTACK` | "Cannot attack" | Optional conditional_override |
| `CANNOT_BLOCK` / `CANNOT_ACTIVATE_BLOCKER` | "Cannot block" | |
| `CANNOT_PLAY_CARDS` | "Cannot play cards" | `card_type_filter`, `cost_filter` |
| `CANNOT_BE_REMOVED_FROM_FIELD` | "Cannot be removed" | |
| `CANNOT_BE_RESTED` | "Cannot be rested" | |
| `CANNOT_DRAW` | "Cannot draw by effects" | |
| `CANNOT_ADD_LIFE_TO_HAND` | "Cannot add Life to hand" | |
| `CANNOT_SET_DON_ACTIVE` | "Cannot activate DON!!" | |

---

## Rule Modifications

Used in `rule_modification` effect blocks:

| Rule Type | Card Text | Example |
|-----------|-----------|---------|
| `NAME_ALIAS` | "Treat name as [X]" | `{ rule_type: "NAME_ALIAS", aliases: ["Kouzuki Oden"] }` |
| `COUNTER_GRANT` | "Give Counter to cards" | `{ rule_type: "COUNTER_GRANT", value: 1000, filter: {...} }` |
| `DECK_RESTRICTION` | "Cannot include X" | `{ rule_type: "DECK_RESTRICTION", restriction: "CANNOT_INCLUDE", filter: {...} }` |
| `COPY_LIMIT_OVERRIDE` | "Any number of copies" | `{ rule_type: "COPY_LIMIT_OVERRIDE", limit: "UNLIMITED" }` |
| `DON_DECK_SIZE_OVERRIDE` | "DON!! deck is N" | `{ rule_type: "DON_DECK_SIZE_OVERRIDE", size: 6 }` |

---

## Keywords

### Intrinsic Keywords (Printed on Card)

Encode as flags on a permanent effect block:

```typescript
{
  id: "OP01-025_keywords",
  category: "permanent",
  flags: { keywords: ["BLOCKER"] }
}
```

### Granted Keywords (By Effect)

Encode as a `GRANT_KEYWORD` action with a target and duration:

```typescript
{
  type: "GRANT_KEYWORD",
  target: { type: "SELF" },
  params: { keyword: "RUSH" },
  duration: { type: "THIS_TURN" }
}
```

### Keyword Values

`RUSH`, `BLOCKER`, `DOUBLE_ATTACK`, `BANISH`, `UNBLOCKABLE`, `RUSH_CHARACTER`, `CAN_ATTACK_ACTIVE`

---

## Effect Flags

```typescript
flags: {
  once_per_turn: true,    // Maps to [Once Per Turn]
  optional: true,          // Maps to "You may..."
  keywords: ["BLOCKER"]    // Intrinsic keywords (permanent blocks only)
}
```

---

## Critical Authoring Rules

1. **Costs vs actions.** Everything before `:` is a cost, everything after is an action. Costs go in `costs[]`, actions go in `actions[]`.

2. **KO vs TRASH.** `KO` fires ON_KO triggers. `TRASH_CARD` does not. Match the card text exactly.

3. **SELF vs YOUR_LEADER.** `SELF` = the card this effect is on. `YOUR_LEADER` = your Leader (used on non-Leader cards that reference the Leader).

4. **Base vs effective values.** `base_cost_max` checks printed cost. `cost_max` checks current cost after modifiers. Match the card text ("base" = base, otherwise = effective).

5. **Intrinsic vs granted keywords.** Printed keywords go in `flags.keywords`. Keywords given by effects use the `GRANT_KEYWORD` action.

6. **Zone for in-hand effects.** Effects active in hand (not on field) must set `zone: "HAND"`.

7. **Each bracket tag = one effect block.** `[On Play] ...` and `[When Attacking] ...` on the same card are separate effect blocks.

8. **Unique IDs.** Every effect block needs a unique `id` within the card. Convention: `"{cardId}_effect_{n}"` or descriptive like `"{cardId}_on_play"`.

---

## Validation Checklist

Before committing a schema, verify:

- [ ] `card_id` matches the database Card.id exactly
- [ ] Every effect block has a unique `id`
- [ ] `category` matches the effect type (auto/activate/permanent/replacement/rule_modification)
- [ ] Trigger uses exact enum values from the trigger catalog above
- [ ] Costs are encoded as costs, not actions
- [ ] Conditions use valid condition types
- [ ] Actions use valid action types
- [ ] `once_per_turn: true` set for `[Once Per Turn]` effects
- [ ] `optional: true` set for "You may..." effects
- [ ] Intrinsic keywords in `flags.keywords`, not as `GRANT_KEYWORD` actions
- [ ] `chain: "THEN"` for "Then,"; `chain: "IF_DO"` for "If you do,"
- [ ] `result_ref` / `target_ref` used for back-references ("that card")
- [ ] Duration matches card text (THIS_TURN, THIS_BATTLE, PERMANENT, etc.)
- [ ] `zone: "HAND"` set on effects that work from hand
- [ ] Filters use `base_*` variants when card text says "base"
- [ ] Schema is registered in `schema-registry.ts`

---

## Full Card Examples

### Simple: On Play Draw

Card text: `[On Play] Draw 1 card.`

```typescript
{
  id: "OP01-006_effect_1",
  category: "auto",
  trigger: { keyword: "ON_PLAY" },
  actions: [
    { type: "DRAW", params: { amount: 1 } }
  ]
}
```

### With Cost and Condition

Card text: `[Activate: Main] [Once Per Turn] If you have 3 or less Life, rest this card: Give your Leader +2000 power during this turn.`

```typescript
{
  id: "CARD_activate_main",
  category: "auto",
  trigger: { keyword: "ACTIVATE_MAIN" },
  flags: { once_per_turn: true },
  conditions: {
    type: "LIFE_COUNT",
    controller: "SELF",
    operator: "<=",
    value: 3
  },
  costs: [
    { type: "REST_SELF" }
  ],
  actions: [
    {
      type: "MODIFY_POWER",
      target: { type: "YOUR_LEADER" },
      params: { amount: 2000 },
      duration: { type: "THIS_TURN" }
    }
  ]
}
```

### Compound Trigger with DON Requirement

Card text: `[DON!! x1] [When Attacking] K.O. up to 1 of your opponent's Characters with 3000 power or less.`

```typescript
{
  id: "CARD_when_attacking_ko",
  category: "auto",
  trigger: {
    keyword: "WHEN_ATTACKING",
    don_requirement: 1
  },
  actions: [
    {
      type: "KO",
      target: {
        type: "CHARACTER",
        controller: "OPPONENT",
        count: { up_to: 1 },
        filter: { power_max: 3000 }
      }
    }
  ]
}
```

### Replacement Effect

Card text: `[Once Per Turn] If this Character would be K.O.'d, you may trash 1 {Whitebeard Pirates} card from your hand instead.`

```typescript
{
  id: "CARD_ko_protection",
  category: "replacement",
  replaces: { event: "WOULD_BE_KO" },
  replacement_actions: [
    {
      type: "TRASH_FROM_HAND",
      params: { amount: 1, filter: { traits: ["Whitebeard Pirates"] } }
    }
  ],
  flags: { once_per_turn: true, optional: true }
}
```

### Permanent Aura

Card text: `Your {Straw Hat Crew} type Characters gain +1000 power.`

```typescript
{
  id: "CARD_crew_aura",
  category: "permanent",
  modifiers: [
    {
      type: "MODIFY_POWER",
      target: {
        type: "CHARACTER",
        controller: "SELF",
        filter: { traits: ["Straw Hat Crew"] }
      },
      params: { amount: 1000 }
    }
  ]
}
```

### Chained Actions

Card text: `[On Play] Draw 2 cards. Then, trash 1 card from your hand. If you do, give your Leader up to 2 rested DON!!.`

```typescript
{
  id: "CARD_on_play_chain",
  category: "auto",
  trigger: { keyword: "ON_PLAY" },
  actions: [
    { type: "DRAW", params: { amount: 2 } },
    { type: "TRASH_FROM_HAND", params: { amount: 1 }, chain: "THEN" },
    {
      type: "GIVE_DON",
      target: { type: "YOUR_LEADER" },
      params: { amount: 2, source: "RESTED" },
      chain: "IF_DO"
    }
  ]
}
```
