# Card Effect Schema Authoring Guide

This directory contains authored effect schemas for OPTCG cards. Each schema defines a card's effects in a structured format that the engine can execute.

## File Organization

Schemas are grouped by set or deck:
- `op01.ts` — OP01 cards (98 cards)
- `op02.ts` — OP02 cards (98 cards)
- `op03/` — OP03 cards (directory with per-color files)
- `ace-deck.ts` — Ace test deck (18 cards, cross-set)
- `nami-deck.ts` — Nami test deck (15 cards)

**New sets should use the per-color directory structure:**
```
op03/
  red.ts      — Red card schemas + OP03_RED_SCHEMAS array
  green.ts    — Green card schemas + OP03_GREEN_SCHEMAS array
  blue.ts     — Blue card schemas + OP03_BLUE_SCHEMAS array
  purple.ts   — Purple card schemas + OP03_PURPLE_SCHEMAS array
  black.ts    — Black card schemas + OP03_BLACK_SCHEMAS array
  yellow.ts   — Yellow card schemas + OP03_YELLOW_SCHEMAS array
  index.ts    — Barrel: imports color arrays, exports OP03_SCHEMAS record + re-exports all constants
```

Each color file starts with `import type { EffectSchema } from "../../effect-types.js";` and exports its card constants plus a color array. The barrel `index.ts` builds the `Record<string, EffectSchema>` from all color arrays and re-exports individual constants for backwards compatibility. The registry imports from `./schemas/op03/index.js`.

For smaller sets or test decks, a single `{set-id}.ts` or `{deck-name}-deck.ts` file is still acceptable.

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
| `auto` | trigger, actions | `[On Play]`, `[When Attacking]`, `[On K.O.]`, `[Main]` on Events, custom event triggers |
| `activate` | trigger, actions | `[Activate: Main]` on Characters/Leaders |
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
| `[Counter]` (Characters) | `{ keyword: "COUNTER" }` | During Counter Step |
| `[Counter]` (Events) | `{ keyword: "COUNTER_EVENT" }` | Counter Event card |
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
| "When a Character is trashed" | `{ event: "ANY_CHARACTER_TRASHED" }` |
| "When your opponent's Character is trashed" | `{ event: "OPPONENT_CHARACTER_TRASHED" }` |
| "When DON!! returned to DON!! deck" | `{ event: "DON_RETURNED_TO_DON_DECK" }` |
| "When given a DON!!" | `{ event: "DON_GIVEN_TO_CARD" }` |
| "When an Event is activated (from hand)" | `{ event: "EVENT_ACTIVATED_FROM_HAND" }` |
| "When a Character activates an Event's [Main] from trash" | `{ event: "EVENT_MAIN_RESOLVED_FROM_TRASH" }` |
| "When an Event's [Trigger] resolves from Life" | `{ event: "EVENT_TRIGGER_RESOLVED" }` |
| "When an Event is activated (any path, excluding [Trigger] from Life)" | `{ any_of: [{ event: "EVENT_ACTIVATED_FROM_HAND" }, { event: "EVENT_MAIN_RESOLVED_FROM_TRASH" }] }` |
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
| "When card removed from Life" (alt) | `{ event: "LIFE_CARD_REMOVED" }` |
| "At end of your turn" (event) | `{ event: "END_OF_YOUR_TURN" }` |

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
| `NAMED_CARD_WITH_PROPERTY` | "If you have [Name] with N+ power" | `{ type: "NAMED_CARD_WITH_PROPERTY", controller: "SELF", name: "Luffy", property: { power: { operator: ">=", value: 7000 } } }` |
| `FIELD_PURITY` | "If only {Trait} Characters" | `{ type: "FIELD_PURITY", controller: "SELF", filter: { traits: ["Whitebeard Pirates"] } }` |

**Leader Properties:**

```typescript
{ type: "LEADER_PROPERTY", controller: "SELF", property: {
  trait: "Straw Hat Crew"        // OR — exact match ({X} type)
  trait_contains: "Straw Hat"    // OR — substring match (type including "X")
  name: "Luffy"                  // OR
  power: { operator: ">=", value: 6000 }  // OR
  color: "RED"                   // OR — single color
  color_includes: "RED"          // OR — has this color (multicolor-safe)
  attribute: "SLASH"             // OR — has this attribute
  multicolored: true             // OR
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
| `LACKS_EFFECT_TYPE` | "Card without [Blocker]" | `{ type: "LACKS_EFFECT_TYPE", effect_type: "BLOCKER" }` |

**Comparative:**

```typescript
{ type: "COMPARATIVE", metric: "LIFE_COUNT", operator: "<=", margin: 0 }
// "If you have less Life than opponent"
// Metrics: LIFE_COUNT, DON_FIELD_COUNT, CHARACTER_COUNT
// operator compares self vs opponent+margin (margin defaults to 0)
```

**Other:**

| Type | Card Text |
|------|-----------|
| `ACTION_PERFORMED_THIS_TURN` | "If you activated an Event this turn" |
| `TURN_COUNT` | "If it is your second turn or later" |
| `RESTED_CARD_COUNT` | "If you have N+ rested cards" |
| `CARD_TYPE_IN_ZONE` | "N+ Events in trash" |
| `COMBINED_ZONE_COUNT` | "N+ cards across hand and trash" |
| `BOARD_WIDE_EXISTENCE` | "If there is a Character with N+ power" |
| `DON_GIVEN` | "If a card has DON!! attached" |
| `SOURCE_PROPERTY` | "If K.O.'d by [type] card" |
| `PLAY_METHOD` | "If played by effect / from hand" |
| `FACE_UP_LIFE` | "If you have N face-up Life" |
| `COMBINED_TOTAL` | "If total Characters across both players is N+" | `{ type: "COMBINED_TOTAL", metric: "CHARACTER_COUNT", operator: ">=", value: 5 }` |

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
| `LIFE_TO_HAND` | "Add N Life to hand" (with `position: "TOP"\|"BOTTOM"\|"TOP_OR_BOTTOM"`) |
| `TRASH_FROM_LIFE` | "Trash N from Life" |
| `PLACE_FROM_TRASH_TO_DECK` | "Return N from trash to deck" |
| `PLACE_STAGE_TO_DECK` | "Place Stage at deck bottom" |
| `PLACE_HAND_TO_DECK` | "Place N from hand to deck" |
| `GIVE_OPPONENT_DON` | "Give DON!! to opponent" |
| `RETURN_ATTACHED_DON_TO_COST` | "Return attached DON!!" |
| `PLACE_SELF_AND_HAND_TO_DECK` | "Place this card and hand to deck" |
| `REST_DON` | "Rest N DON!!" (as cost) |

### Branched Costs ("A or B")

| Type | Card Text | Notes |
|------|-----------|-------|
| `CHOOSE_ONE_COST` | "Pay X or Y" where X and Y are single costs | `options: SimpleCost[]` |
| `CHOICE` | "Pay X or Y" where a branch may itself be multiple costs | `options: Cost[][]`, optional `labels: string[]` |

Payability is evaluated per-branch: unpayable branches are hidden, a single payable branch auto-selects without prompting, and if no branch is payable the activation is blocked with `Cost cannot be paid`. Use `CHOICE` whenever any branch bundles more than one sub-cost; use `CHOOSE_ONE_COST` for the simpler flat case.

**Example — OP13-079 Imu [Activate: Main]:** "trash 1 {Celestial Dragons} Character **or** 1 card from hand: Draw 1."

```ts
costs: [
  {
    type: "CHOICE",
    labels: ["Trash Celestial Dragons Character", "Trash card from hand"],
    options: [
      [{ type: "TRASH_OWN_CHARACTER", amount: 1, filter: { traits: ["Celestial Dragons"] } }],
      [{ type: "TRASH_FROM_HAND", amount: 1 }],
    ],
  },
],
```

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
| `REST_OPPONENT_DON` | "Rest N of opponent's DON!!" |
| `GIVE_OPPONENT_DON_TO_OPPONENT` | "Give DON!! to opponent's card" |
| `DISTRIBUTE_DON` | "Distribute DON!! among cards" |
| `RETURN_ATTACHED_DON_TO_COST` | "Return attached DON!! to cost area" |
| `REDISTRIBUTE_DON` | "Redistribute DON!! among cards" |

### State Change

| Type | Card Text |
|------|-----------|
| `SET_ACTIVE` | "Set card to active" |
| `SET_REST` | "Set card to rested" |
| `APPLY_PROHIBITION` | "Cannot X" (via action, not permanent) |
| `REMOVE_PROHIBITION` | Remove an applied prohibition |

### Life Manipulation

| Type | Card Text | Params |
|------|-----------|--------|
| `ADD_TO_LIFE_FROM_DECK` | "Add N from deck to Life" | `{ amount: N, face: "UP"\|"DOWN", position: "TOP"\|"BOTTOM" }` |
| `ADD_TO_LIFE_FROM_HAND` | "Add from hand to Life" | `{ amount: N, face: "UP"\|"DOWN", position: "TOP"\|"BOTTOM" }` |
| `ADD_TO_LIFE_FROM_FIELD` | "Add card from field to Life" | `{ face: "UP"\|"DOWN" }` |
| `TRASH_FROM_LIFE` | "Trash N from Life" | `{ amount: N, position: "TOP"\|"BOTTOM" }` |
| `TURN_LIFE_FACE_UP` | "Face up N Life cards" | `{ amount: N, position: "TOP"\|"BOTTOM"\|"ALL" }` |
| `TURN_LIFE_FACE_DOWN` | "Turn N Life face down" | `{ amount: N }` |
| `TURN_ALL_LIFE_FACE_DOWN` | "Turn all Life face down" | — |
| `LIFE_SCRY` | "Look at top of Life cards" | `{ look_at: N }` |
| `LIFE_TO_HAND` | "Add Life card to hand" | `{ amount: N, position: "TOP"\|"BOTTOM" }` |
| `LIFE_CARD_TO_DECK` | "Place Life card to deck" | `{ amount: N, position: "TOP"\|"BOTTOM" }` |
| `PLAY_FROM_LIFE` | "Play card from Life" | `{ position: "TOP"\|"BOTTOM", entry_state: "ACTIVE"\|"RESTED" }` |
| `REORDER_ALL_LIFE` | "Rearrange all Life cards" | — |
| `DRAIN_LIFE_TO_THRESHOLD` | "Reduce Life to N" | `{ threshold: N }` |
| `TRASH_FACE_UP_LIFE` | "Trash face-up Life cards" | — |

### Hand / Deck Manipulation

| Type | Card Text | Params |
|------|-----------|--------|
| `HAND_WHEEL` | "Trash N from hand, draw M" | `{ trash_count: N, draw_count: M }` |
| `PLACE_HAND_TO_DECK` | "Place N from hand to deck" | `{ amount: N, position: "TOP"\|"BOTTOM" }` |
| `RETURN_HAND_TO_DECK` | "Return hand to deck" | `{ position: "TOP"\|"BOTTOM" }` |
| `REVEAL` | "Reveal N cards" | `{ amount: N, source: "DECK_TOP"\|"HAND" }` |
| `REVEAL_HAND` | "Reveal hand" | — |
| `SHUFFLE_DECK` | "Shuffle deck" | — |
| `SEARCH_TRASH_THE_REST` | "Look at N, pick some, trash rest" | Similar to SEARCH_DECK but rest goes to trash |

### Battle

| Type | Card Text |
|------|-----------|
| `REDIRECT_ATTACK` | "Redirect attack to this card" |
| `DEAL_DAMAGE` | "Deal N damage" |
| `SELF_TAKE_DAMAGE` | "Take N damage yourself" |

### Effect / Meta

| Type | Card Text | Params |
|------|-----------|--------|
| `ACTIVATE_EVENT_FROM_HAND` | "Activate Event from hand" | Target filter |
| `ACTIVATE_EVENT_FROM_TRASH` | "Activate Event from trash" | Target filter |
| `NEGATE_TRIGGER_TYPE` | "Negate [Trigger] effects" | `{ trigger_type: KeywordTriggerType }` |
| `GRANT_ATTRIBUTE` | "Gains [Attribute]" | `{ attribute: "SLASH"\|"STRIKE"\|etc. }` |
| `GRANT_COUNTER` | "Gains Counter" | — |
| `APPLY_ONE_TIME_MODIFIER` | Apply a one-shot modifier | `{ modification: Modifier, applies_to: {...} }` |
| `PLAY_SELF` | "Play this card" (from Trigger) | — |

### Additional Power & Stats

| Type | Card Text | Params |
|------|-----------|--------|
| `SET_COST` | "Set cost to N" | `{ value: N }` |
| `SWAP_BASE_POWER` | "Swap base power" | Target |
| `COPY_POWER` | "Copy power" | Target |
| `SET_POWER_TO_ZERO` | "Set power to 0" | Target |

### Flow / Meta

| Type | Card Text | Notes |
|------|-----------|-------|
| `PLAYER_CHOICE` | "Choose one:" | `{ options: [[actions], [actions]], labels: [...] }` |
| `OPPONENT_CHOICE` | "Opponent chooses" | `{ options: [[actions], [actions]], labels: [...] }` |
| `OPPONENT_ACTION` | "Opponent does X" | `{ action: Action }` |
| `CHOOSE_VALUE` | "Choose a number" | Player selects a value |
| `SCHEDULE_ACTION` | "At end of turn, do X" | `{ timing: "END_OF_THIS_TURN", action: {...} }` |
| `REUSE_EFFECT` | "Activate [Trigger] effect" | `{ target_effect: "COUNTER" \| "MAIN_EVENT" }` |
| `WIN_GAME` | "You win the game" | — |
| `EXTRA_TURN` | "Take an extra turn" | — |

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
| `STAGE` | Stage on field | Controller |
| `STAGE_CARD` | Stage in a zone | Requires `source_zone` |
| `EVENT_CARD` | Event in a zone | Requires `source_zone` |
| `CARD_IN_HAND` | Card in hand | Controller |
| `CARD_IN_TRASH` | Card in trash | Controller |
| `CARD_ON_TOP_OF_DECK` | Top N of deck | Controller |
| `CARD_IN_DECK` | Card in deck | Controller |
| `LIFE_CARD` | Life card | Controller |
| `DON_IN_COST_AREA` | DON!! in cost area | Controller |
| `DON_ATTACHED` | DON!! attached to card | Controller |
| `DON_IN_DON_DECK` | DON!! in DON deck | Controller |
| `PLAYER` | Player (for direct actions) | Controller |
| `SELECTED_CARDS` | Previously selected cards | Via `target_ref` |
| `OPPONENT_LIFE` | Opponent's Life zone | N/A |

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

**Traits:** `traits` (all required, AND), `traits_any_of` (at least one, OR), `traits_contains` (substring match — "type including X"), `traits_exclude`

**Name:** `name` (exact), `name_any_of` (array), `name_includes` (substring), `exclude_name`, `exclude_self`, `name_matching_ref` (match name from a prior result_ref)

**Keywords:** `keywords` (array), `has_trigger`, `attribute`, `attribute_not`, `has_effect`, `no_base_effect`, `lacks_effect_type`, `has_counter`

**Card Type:** `card_type` (`"CHARACTER"` | `"EVENT"` | `"STAGE"` | `"LEADER"` — filter by card category)

**State:** `is_rested`, `is_active`, `state` ("ACTIVE" | "RESTED")

**DON:** `don_given_count` (`{ operator, value }` — cards with N DON!! attached)

**Refs:** `exclude_ref` (exclude cards from a prior result_ref)

**Uniqueness:** `unique_names` (selected cards must have distinct names)

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
{ type: "SKIP_NEXT_REFRESH" }                      // Stays rested through next Refresh Phase
{ type: "PERMANENT" }                              // Until card leaves field
{ type: "WHILE_CONDITION", condition: Condition }   // While a condition is true
```

---

## Prohibition Types

Used in `permanent` effect blocks via the `prohibitions` array:

| Type | Card Text | Scope |
|------|-----------|-------|
| `CANNOT_BE_KO` | "Cannot be K.O.'d" | `cause: "IN_BATTLE" \| "BY_EFFECT" \| "ANY"` |
| `CANNOT_ATTACK` | "Cannot attack" | Optional conditional_override |
| `CANNOT_BLOCK` / `CANNOT_ACTIVATE_BLOCKER` | "Cannot block" | |
| `CANNOT_PLAY_FROM_HAND` | "Unable to play cards from hand" | `controller: "SELF" \| "OPPONENT"` |
| `CANNOT_BE_REMOVED_FROM_FIELD` | "Cannot be removed" | |
| `CANNOT_BE_RESTED` | "Cannot be rested" | |
| `CANNOT_DRAW` | "Cannot draw by effects" | |
| `CANNOT_ADD_LIFE_TO_HAND` | "Cannot add Life to hand" | |
| `CANNOT_SET_DON_ACTIVE` | "Cannot activate DON!!" | |
| `CANNOT_BE_BLOCKED` | "Cannot be blocked" | |
| `CANNOT_PLAY_CHARACTER` | "Cannot play Characters" | filter |
| `CANNOT_PLAY_EVENT` | "Cannot play Events" | |
| `CANNOT_USE_COUNTER` | "Cannot use Counter" | |
| `CANNOT_USE_BLOCKER` | "Cannot use [Blocker]" | |
| `CANNOT_ACTIVATE_EFFECT` | "Cannot activate effects" | |
| `CANNOT_ACTIVATE_ON_PLAY` | "Cannot activate [On Play]" | |
| `CANNOT_ADD_LIFE` | "Cannot add to Life" | |
| `CANNOT_BE_PLAYED_BY_EFFECTS` | "Cannot be played by effects" | |
| `CANNOT_LEAVE_FIELD` | "Cannot leave field" | |
| `CANNOT_REFRESH` | "Cannot refresh (stays rested)" | |
| `CANNOT_ATTACH_DON` | "Cannot receive DON!!" | |
| `CANNOT_BE_RETURNED_TO_HAND` | "Cannot be returned to hand" | |
| `CANNOT_BE_RETURNED_TO_DECK` | "Cannot be returned to deck" | |

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
| `LOSS_CONDITION_MOD` | "Win instead of losing" | `{ rule_type: "LOSS_CONDITION_MOD", trigger_event: "DECK_OUT", modification: "WIN_INSTEAD" }` |
| `DON_PHASE_BEHAVIOR` | "DON!! placed differently" | `{ rule_type: "DON_PHASE_BEHAVIOR", count: N, destination: "GIVEN_TO_LEADER" }` |
| `START_OF_GAME_EFFECT` | "At start of game, do X" | `{ rule_type: "START_OF_GAME_EFFECT", actions: [...] }` |
| `TRIGGER_TYPE_NEGATION` | "Negate [Trigger] effects" | `{ rule_type: "TRIGGER_TYPE_NEGATION", trigger_type: "ON_PLAY", affected_controller: "OPPONENT" }` |
| `PLAY_STATE_MOD` | "Characters enter rested" | `{ rule_type: "PLAY_STATE_MOD", card_type: "CHARACTER", entry_state: "RESTED" }` |
| `DAMAGE_RULE_MOD` | "Face-up Life goes to deck" | `{ rule_type: "DAMAGE_RULE_MOD", applies_to: "FACE_UP_LIFE", destination: "DECK_BOTTOM" }` |

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

9. **`traits` vs `traits_contains` — match the card text exactly.**
   - `{Whitebeard Pirates} type` (curly braces) → `traits: ["Whitebeard Pirates"]` — **exact match** per trait. "Former Whitebeard Pirates" does NOT match.
   - `type including "Whitebeard Pirates"` → `traits_contains: ["Whitebeard Pirates"]` — **substring match**. "Former Whitebeard Pirates" DOES match.
   - Same for LEADER_PROPERTY: `{X} type` → `trait: "X"` (exact), `type includes "X"` → `trait_contains: "X"` (substring).
   - Do NOT use `traits_contains` for `{X} type` card text.

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
  // Replacement events: WOULD_BE_KO, WOULD_BE_REMOVED_FROM_FIELD,
  // WOULD_LEAVE_FIELD, WOULD_BE_RESTED, WOULD_LOSE_GAME, LIFE_ADDED_TO_HAND
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

#### Self-exclusion (enforced by lint)

When the replacement's card text says **"other than [<self>]"**, the
`target_filter` MUST explicitly exclude the source card. Pick either:

- `exclude_self: true` (preferred — rename-safe), or
- `exclude_name: "<card_name>"` (matches the card's own name)

Example — OP10-032 Tashigi: _"If you have a green Character **other than [Tashigi]** that would be removed from the field..."_

```typescript
{
  category: "replacement",
  replaces: {
    event: "WOULD_BE_REMOVED_FROM_FIELD",
    target_filter: {
      color: "GREEN",
      card_type: "CHARACTER",
      exclude_name: "Tashigi", // REQUIRED — text says "other than [Tashigi]"
    },
    cause_filter: { by: "OPPONENT_EFFECT" },
  },
  // ...
}
```

Replacements without a `target_filter` default to "self only" at runtime
(see `triggers.ts` `appliesTo` fallback), so no exclusion is needed — but
once you add a filter, the lint expects the exclusion when the card text
contains the "other than [<self>]" phrasing. The enforcing test is
`src/__tests__/schema-lint-replacements.test.ts`.

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
