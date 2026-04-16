# 01 — Schema Overview

> The foundational document for the OPTCG card effect schema. Defines the core type system that all other spec files reference. Read this first.

**Related docs:** [Triggers](./02-TRIGGERS.md) · [Conditions](./03-CONDITIONS.md) · [Actions](./04-ACTIONS.md) · [Targeting](./05-TARGETING.md) · [Prohibitions & Replacements](./06-PROHIBITIONS-AND-REPLACEMENTS.md) · [Rule Modifications](./07-RULE-MODIFICATIONS.md) · [Keywords](./10-KEYWORD-REFERENCE.md)

---

## Design Principles

1. **Declarative, not imperative.** The schema describes *what* an effect does, not *how* the engine executes it. Execution semantics live in the engine, not the data.
2. **One schema per card, not per printing.** Alternate art reprints share the same `effectSchema`. The schema is keyed to game identity, not product identity.
3. **Text-order preservation.** Effects are ordered top-to-bottom as printed on the card, per comprehensive rules 2-8-3. This ordering matters for resolution priority.
4. **Exhaustive enumeration over free-form strings.** Every trigger, condition, action, and target type is a member of a closed enum. No ad-hoc string matching at runtime.
5. **Composable primitives.** Complex effects are composed from simple, well-defined building blocks — not encoded as opaque blobs.

---

## Top-Level Structure

Each card's `effectSchema` is an ordered array of **EffectBlocks**. A card may have zero (vanilla), one, or many independent effect blocks.

```typescript
interface EffectSchema {
  effects: EffectBlock[];
}
```

---

## EffectBlock

The fundamental unit of the schema. Each block represents one complete, independent ability on a card.

```typescript
interface EffectBlock {
  id: string;
  category: EffectCategory;

  // --- Activation (auto / activate) ---
  trigger?: Trigger;
  costs?: Cost[];

  // --- Conditions (all categories) ---
  conditions?: Condition;

  // --- Resolution (auto / activate) ---
  actions?: Action[];

  // --- Continuous (permanent) ---
  modifiers?: Modifier[];
  prohibitions?: Prohibition[];

  // --- Interception (replacement) ---
  replaces?: ReplacementTrigger;
  replacement_actions?: Action[];

  // --- Game rules (rule_modification) ---
  rule?: RuleModification;

  // --- Metadata ---
  flags?: EffectFlags;
  duration?: Duration;
  zone?: EffectZone;
}
```

### Field Applicability by Category

Not every field is relevant to every category. The table below shows which fields apply:

| Field | auto | activate | permanent | replacement | rule_modification |
|-------|------|----------|-----------|-------------|-------------------|
| `trigger` | required | required | -- | -- | -- |
| `costs` | optional | optional | -- | optional | -- |
| `conditions` | optional | optional | optional | optional | optional |
| `actions` | required | required | -- | -- | optional |
| `modifiers` | -- | -- | optional | -- | -- |
| `prohibitions` | -- | -- | optional | -- | -- |
| `replaces` | -- | -- | -- | required | -- |
| `replacement_actions` | -- | -- | -- | required | -- |
| `rule` | -- | -- | -- | -- | required |
| `flags` | optional | optional | optional | optional | optional |
| `duration` | optional | optional | implicit | optional | implicit |
| `zone` | optional | optional | optional | optional | optional |

---

## Effect Categories

Every EffectBlock falls into exactly one category, derived from comprehensive rules section 8-1-3.

```typescript
type EffectCategory =
  | "auto"
  | "activate"
  | "permanent"
  | "replacement"
  | "rule_modification";
```

### auto

Fires automatically when a trigger event occurs. The player may choose whether to activate (if `flags.optional` is true), but the timing is dictated by the game event.

Examples: `[On Play]`, `[When Attacking]`, `[On K.O.]`, `[Trigger]`, `[Counter]`, custom triggers like "When your opponent's Character is K.O.'d"

### activate

Declared by the turn player during their Main Phase. Requires explicit player action to use.

Examples: `[Activate: Main]`, `[Main]` on Events

### permanent

Continuously active while the source card is in its valid zone and conditions are met. Does not "activate" — it establishes ongoing modifiers or prohibitions.

Examples: "This Character gains +2000 power", "This Character cannot attack", static keyword grants, aura effects

### replacement

Intercepts a game event and substitutes a different outcome. Checked at step 3 of the action pipeline before the original event executes.

Examples: "If your Character would be K.O.'d, you may trash 1 card from your hand instead", "When your deck is reduced to 0, you win the game instead of losing"

### rule_modification

Alters fundamental game rules. Active during deck construction (restricting legal cards), during game setup (start-of-game effects), or persistently changing core rules.

Examples: "Under the rules of this game, you cannot include Events with a cost of 2 or more in your deck", "Also treat this card's name as [Kouzuki Oden]", "you may have any number of this card in your deck"

---

## Effect Flags

Metadata that modifies how an effect block behaves.

```typescript
interface EffectFlags {
  once_per_turn?: boolean;
  optional?: boolean;
  keywords?: Keyword[];
}
```

- `once_per_turn` — Can only activate once per turn. Resets at turn start. Maps to `[Once Per Turn]` text.
- `optional` — Player may choose not to activate. Most auto effects with "you may" are optional. If false, the effect is mandatory when its trigger fires and conditions are met.
- `keywords` — Intrinsic keywords on this card (Rush, Blocker, etc.). These are first-class flags, not encoded as actions. See [10-KEYWORD-REFERENCE.md](./10-KEYWORD-REFERENCE.md).

---

## Effect Zone

Where the effect is active. Defaults to `"FIELD"` — most effects only function while the card is on the field. Some effects are active in the hand zone.

```typescript
type EffectZone = "FIELD" | "HAND" | "ANY";
```

- `"FIELD"` — Default. Active while the card is in the Character area, Leader zone, or Stage area.
- `"HAND"` — Active while the card is in the hand. Used for self-cost-reduction effects (e.g., EB04-061: "give this card in your hand −1 cost") and play restrictions (e.g., OP12-036: "This card in your hand cannot be played by effects").
- `"ANY"` — Active in any zone. Rare; used for rule modifications that apply universally.

---

## Cost System

Costs are ordered actions that must be paid before an effect resolves. If a cost cannot be fully paid, the effect cannot be activated.

```typescript
interface Cost {
  type: CostType;
  amount?: number | "ANY_NUMBER" | DynamicValue;
  filter?: TargetFilter;
  target?: Target;
}
```

### Cost Types

```typescript
type CostType =
  // DON!! costs
  | "DON_MINUS"               // Return N DON!! from field to DON!! deck
  | "DON_REST"                // Rest N active DON!! (the ① symbol)
  | "VARIABLE_DON_RETURN"     // Return 1 or more DON!! (min 1, no fixed max)

  // Self costs
  | "REST_SELF"               // Rest this card
  | "TRASH_SELF"              // Trash this card (not K.O.)

  // Hand costs
  | "TRASH_FROM_HAND"         // Trash N cards from hand (optional filter)
  | "REVEAL_FROM_HAND"        // Reveal N cards from hand matching filter
  | "PLAY_NAMED_CARD_FROM_HAND" // Play a specific named card as cost

  // Field costs
  | "REST_CARDS"              // Rest N of your cards (optional filter)
  | "REST_NAMED_CARD"         // Rest a specific named card
  | "KO_OWN_CHARACTER"        // K.O. one of your characters (optional filter)
  | "TRASH_OWN_CHARACTER"     // Trash character from field (not K.O.)
  | "RETURN_OWN_CHARACTER_TO_HAND"  // Bounce your character as cost
  | "PLACE_OWN_CHARACTER_TO_DECK"   // Place character at bottom of deck
  | "PLACE_STAGE_TO_DECK"     // Place your Stage at bottom of deck

  // Trash costs
  | "PLACE_FROM_TRASH_TO_DECK" // Return N cards from trash to deck bottom (optional filter)

  // Leader costs
  | "LEADER_POWER_REDUCTION"  // Reduce own Leader's power by amount

  // DON!! manipulation costs
  | "GIVE_OPPONENT_DON"       // Give opponent's DON!! to opponent's character
  | "RETURN_ATTACHED_DON_TO_COST" // Return given DON!! to cost area

  // Compound costs
  | "PLACE_SELF_AND_HAND_TO_DECK" // Stage + hand card to deck bottom

  // Cost-level disjunction
  | "CHOOSE_ONE_COST"         // Player picks ONE of the listed sub-costs to pay (single-cost options)
  | "CHOICE";                 // Player picks ONE branch from a list of multi-cost branches
```

### CHOICE — branched cost ("A or B")

`CHOICE` expresses "pay one of these branches," where each branch can be one or more sub-costs. Use this for card text like OP13-079 Imu's [Activate: Main]:

> You may trash 1 of your {Celestial Dragons} type Characters or 1 card from your hand: Draw 1 card.

```json
{
  "type": "CHOICE",
  "labels": ["Trash Celestial Dragons Character", "Trash card from hand"],
  "options": [
    [{ "type": "TRASH_OWN_CHARACTER", "amount": 1, "filter": { "traits": ["Celestial Dragons"] } }],
    [{ "type": "TRASH_FROM_HAND", "amount": 1 }]
  ]
}
```

Semantics at cost-payment time:

1. Each branch is checked for payability via `isCostPayable` — a branch is payable iff **every** sub-cost in that branch is payable.
2. **0 payable** → activation is blocked at the validation step (`Cost cannot be paid`).
3. **1 payable** → the payable branch auto-expands inline; no branch prompt is emitted. The remaining sub-cost prompts (e.g. `SELECT_TARGET`) fire normally.
4. **≥2 payable** → engine emits a `PLAYER_CHOICE` prompt listing payable branches (unpayable branches are hidden). After the player picks, the chosen branch's sub-costs expand inline and the cost loop resumes.

`labels` is optional per-branch UI hint; if omitted, labels are derived from sub-cost types.

### CHOOSE_ONE_COST — cost-level "or"

Most "or" in card text is expressible through a permissive target filter or through an action-level `choose_one`. But a small number of cards let the player pick between **fundamentally different** sub-costs (e.g. trash a character OR trash a card from hand). For those, wrap the alternatives in `CHOOSE_ONE_COST`:

```json
{
  "type": "CHOOSE_ONE_COST",
  "options": [
    { "type": "TRASH_OWN_CHARACTER", "amount": 1, "filter": { "traits": ["Celestial Dragons"] } },
    { "type": "TRASH_FROM_HAND", "amount": 1 }
  ]
}
```

Semantics at cost-payment time:

1. Each option is checked for payability (selection options need enough valid targets; auto-payable options are dry-run).
2. **0 payable** → the effect cannot pay; activation is blocked.
3. **1 payable** → auto-selected; the normal prompt for that option fires. No choice prompt.
4. **≥2 payable** → engine emits a `PLAYER_CHOICE` prompt listing the payable options by their cost label. After the player chooses, the chosen option replaces the `CHOOSE_ONE_COST` slot and its own selection flow runs.

**When NOT to use.** If the alternatives differ only in target filter (e.g. "rest Leader or Stage"), use a single cost with a permissive filter. If the branching is within *actions*, use `choose_one` at the action level. `CHOOSE_ONE_COST` is specifically for disjunction of cost *types* / unrelated cost shapes. If any branch is itself a sequence of sub-costs (e.g. "trash 2 from hand AND rest 1 DON!!"), use `CHOICE` instead.

### Filtered Costs

Any cost that involves selecting a card supports an optional `filter` field using the same [TargetFilter](./05-TARGETING.md) system as actions:

```json
{
  "type": "TRASH_FROM_HAND",
  "amount": 1,
  "filter": { "traits": ["Whitebeard Pirates"] }
}
```

```json
{
  "type": "KO_OWN_CHARACTER",
  "amount": 1,
  "filter": { "traits": ["Thriller Bark Pirates"] }
}
```

---

## Chain Semantics

Actions within an EffectBlock execute sequentially. The connector between consecutive actions determines dependency behavior, per comprehensive rules 4-10.

```typescript
type ChainConnector = "THEN" | "IF_DO" | "AND";
```

### Connectors

- **`THEN`** — Execute the next action regardless of whether the preceding action fully resolved. The canonical "Then," in card text. The second action is NOT conditional on the first succeeding.
- **`IF_DO`** — Execute the next action only if the preceding action successfully resolved (produced a result). Maps to "If you do," in card text. If the first action was impossible or chose 0 targets, skip the second.
- **`AND`** — Simultaneous with the preceding action. Both are part of a single atomic operation.

### Action Structure with Chaining

```typescript
interface Action {
  type: ActionType;
  target?: Target;
  params?: Record<string, any>;
  duration?: Duration;
  chain?: ChainConnector;
  target_ref?: string;
  result_ref?: string;
}
```

### Back-References (`target_ref`)

A later action can reference the specific card(s) targeted by a prior action. The prior action assigns `result_ref: "ref_id"`, and the later action uses `target_ref: "ref_id"`.

Example — OP01-029 Radical Beam: "+2000 power to target. Then, if 2 or less Life, that card gains additional +2000."

```json
{
  "actions": [
    {
      "type": "MODIFY_POWER",
      "target": { "type": "CHARACTER", "controller": "SELF", "count": { "up_to": 1 } },
      "params": { "amount": 2000 },
      "duration": { "type": "THIS_BATTLE" },
      "result_ref": "boosted_card"
    },
    {
      "type": "MODIFY_POWER",
      "target_ref": "boosted_card",
      "params": { "amount": 2000 },
      "duration": { "type": "THIS_BATTLE" },
      "chain": "THEN",
      "conditions": { "type": "LIFE_COUNT", "controller": "SELF", "operator": "<=", "value": 2 }
    }
  ]
}
```

### Relational Constraints Between Steps

The second action's targeting can be constrained by a property of the first action's result.

Example — OP01-002 Trafalgar Law: "Return 1 Character. Then, play a Character of a different color."

```json
{
  "actions": [
    {
      "type": "RETURN_TO_HAND",
      "target": { "type": "CHARACTER", "controller": "SELF", "count": { "exact": 1 } },
      "result_ref": "returned_card"
    },
    {
      "type": "PLAY_CARD",
      "target": {
        "type": "CHARACTER_CARD",
        "source_zone": "HAND",
        "filter": { "color_not_matching_ref": "returned_card" }
      },
      "chain": "THEN"
    }
  ]
}
```

### Cross-Reference Counts

A later step uses the count from an earlier step's result.

```json
{
  "params": { "amount": { "ref": "returned_count" } }
}
```

Example — EB04-011: "Draw a card for each {Neptunian}. Then, trash the same number from your hand."

---

## Duration Types

How long an effect or modifier lasts.

```typescript
type Duration =
  | { type: "THIS_TURN" }
  | { type: "THIS_BATTLE" }
  | { type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }
  | { type: "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
  | { type: "UNTIL_END_OF_YOUR_NEXT_TURN" }
  | { type: "UNTIL_START_OF_YOUR_NEXT_TURN" }
  | { type: "SKIP_NEXT_REFRESH" }
  | { type: "PERMANENT" }
  | { type: "WHILE_CONDITION"; condition: Condition };
```

### Duration Semantics

| Type | Expires | Common Text |
|------|---------|-------------|
| `THIS_TURN` | End of current turn's End Phase | "during this turn" |
| `THIS_BATTLE` | When the current battle resolves | "during this battle" |
| `UNTIL_END_OF_OPPONENT_NEXT_END_PHASE` | End of opponent's next End Phase | "until the end of your opponent's next End Phase" |
| `UNTIL_END_OF_OPPONENT_NEXT_TURN` | End of opponent's next turn | "until the end of your opponent's next turn" |
| `UNTIL_END_OF_YOUR_NEXT_TURN` | End of your next turn | "until the end of your next turn" |
| `UNTIL_START_OF_YOUR_NEXT_TURN` | Start of your next turn (Refresh Phase) | "until the start of your next turn" |
| `SKIP_NEXT_REFRESH` | After the next Refresh Phase that would untap this card | "will not become active in opponent's next Refresh Phase" |
| `PERMANENT` | As long as the source card is in its valid zone | Static effects, auras |
| `WHILE_CONDITION` | As long as the attached condition remains true | Conditional statics |

### Expiry Waves

The engine processes duration expiry in three waves per comprehensive rules 6-6-1-2 and 6-6-1-3:

1. **End of End Phase**: `UNTIL_END_OF_OPPONENT_NEXT_END_PHASE` effects expire
2. **End of turn**: `THIS_TURN` effects expire
3. **Refresh Phase**: `UNTIL_START_OF_YOUR_NEXT_TURN` and `SKIP_NEXT_REFRESH` effects expire

### Delayed / Scheduled Actions

Some effects create obligations that resolve at a future timing point. These are NOT duration types — they are actions deferred to a future event.

```typescript
interface ScheduledAction {
  timing: ScheduleTiming;
  action: Action;
  bound_to?: string;  // reference to a card placed by this effect
}

type ScheduleTiming =
  | "END_OF_THIS_TURN"
  | "END_OF_THIS_BATTLE"
  | "START_OF_NEXT_MAIN_PHASE"
  | "START_OF_OPPONENT_NEXT_MAIN_PHASE";
```

Examples:
- OP06-006 Saga: "trash 1 of your Characters at the end of this turn"
- OP08-074 Black Maria: "at the end of this turn, return DON!! until same as opponent"
- OP11-092 Helmeppo: "place the Character played by this effect at the bottom at end of turn" (temporary play — `bound_to` references the played card)

### "Next Time" One-Shot Modifiers

A pending modifier that applies exactly once to the next matching action, then expires.

```typescript
interface OneTimeModifier {
  type: "NEXT_TIME_MODIFIER";
  applies_to: { action: ActionType; filter?: TargetFilter };
  modification: Modifier;
  expires: Duration;
}
```

Example — OP02-025 Kin'emon: "the next time you play a {Land of Wano} Character with cost 3+ this turn, cost reduced by 1."

---

## Dynamic Values

For effects where amounts scale based on game state or prior action results rather than fixed numbers.

```typescript
type DynamicValue =
  | { type: "FIXED"; value: number }
  | { type: "PER_COUNT"; source: DynamicSource; multiplier: number; divisor?: number }
  | { type: "GAME_STATE"; source: GameStateSource; controller?: Controller }
  | { type: "ACTION_RESULT"; ref: string }
  | { type: "CHOSEN_VALUE" };
```

### PER_COUNT — "For Every X" Scaling

Used when an amount scales with a count.

```typescript
type DynamicSource =
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
```

| Source | Multiplier | Divisor | Example |
|--------|-----------|---------|---------|
| `CARDS_TRASHED_THIS_WAY` | 1000 | 1 | OP03-001 Ace, OP15-002 Lucy |
| `DON_RESTED_THIS_WAY` | 2000 | 1 | OP13-001 Luffy |
| `CHARACTERS_RETURNED_THIS_WAY` | 2000 | 1 | P-059 The World's Continuation |
| `EVENTS_IN_TRASH` | 1000 | 2 | OP01-083 Mr.1 |
| `CARDS_IN_TRASH` | 1000 | 5 | EB04-048 Rob Lucci |
| `CARDS_PLACED_TO_DECK_THIS_WAY` | 1000 | 3 | OP07-091 |
| `REVEALED_CARD_COST` | 1000 | 1 | OP15-119 |

### GAME_STATE — Live Game State Values

Thresholds or amounts derived from the current game state.

```typescript
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

Example — OP05-102 Gedatsu: "K.O. Character with cost ≤ opponent's Life count"

```json
{
  "type": "KO",
  "target": {
    "filter": {
      "cost_max": { "type": "GAME_STATE", "source": "OPPONENT_LIFE_COUNT" }
    }
  }
}
```

### ACTION_RESULT — Prior Step References

Values derived from the result of a prior action in the same chain.

Example — OP04-048 Sasaki: "draw cards equal to the number you returned to your deck"

```json
{
  "actions": [
    {
      "type": "HAND_WHEEL",
      "result_ref": "returned_count"
    },
    {
      "type": "DRAW",
      "params": { "amount": { "type": "ACTION_RESULT", "ref": "returned_count" } },
      "chain": "THEN"
    }
  ]
}
```

### CHOSEN_VALUE — Player-Named Value

Used when a player declares a number before effect resolution.

Example — OP11-066 Charlotte Oven: "Choose a cost and reveal 1 card. If the revealed card has the chosen cost..."

---

## Inline Conditions on Actions

Individual actions within a chain can have their own conditions, separate from the block-level conditions. These gate only that specific action, not the entire effect.

```typescript
interface Action {
  // ... other fields
  conditions?: Condition;
}
```

Example — ST14-015 Main effect: "+3000 power. Then, if you have a Character with cost 8+, K.O. up to 1 with cost 2 or less."

The second action has an inline condition (`CARD_ON_FIELD` with cost 8+) while the first is unconditional.

---

## Tiered Threshold Effects

Some permanent effects stack multiple modifier tiers based on crossing successive thresholds. All qualifying tiers apply simultaneously.

```typescript
interface TieredModifier {
  tiers: {
    condition: Condition;
    modifiers: Modifier[];
  }[];
}
```

Example — OP15-092 Monkey.D.Luffy: "Apply based on trash count: 10+ → A; 20+ → A+B; 30+ → A+B+C"

At 25 cards in trash, both tier 1 and tier 2 apply.

---

## Complete Type Index

Quick reference for all types defined in this document. Full definitions for referenced types live in their respective spec files.

| Type | Defined In | Purpose |
|------|-----------|---------|
| `EffectSchema` | This file | Top-level container |
| `EffectBlock` | This file | Single ability unit |
| `EffectCategory` | This file | 5 effect categories |
| `EffectFlags` | This file | Metadata (once_per_turn, optional, keywords) |
| `EffectZone` | This file | Where the effect is active |
| `Cost` / `CostType` | This file | Activation payment |
| `ChainConnector` | This file | THEN / IF_DO / AND |
| `Duration` | This file | Expiry timing |
| `ScheduledAction` | This file | Deferred future action |
| `OneTimeModifier` | This file | "Next time" pending modifier |
| `DynamicValue` | This file | Scaling / computed amounts |
| `Trigger` | [02-TRIGGERS.md](./02-TRIGGERS.md) | Activation event |
| `Condition` | [03-CONDITIONS.md](./03-CONDITIONS.md) | Boolean state check |
| `Action` / `ActionType` | [04-ACTIONS.md](./04-ACTIONS.md) | Atomic game operation |
| `Target` / `TargetFilter` | [05-TARGETING.md](./05-TARGETING.md) | Who/what is affected |
| `Prohibition` | [06-PROHIBITIONS-AND-REPLACEMENTS.md](./06-PROHIBITIONS-AND-REPLACEMENTS.md) | "Cannot X" restriction |
| `ReplacementTrigger` | [06-PROHIBITIONS-AND-REPLACEMENTS.md](./06-PROHIBITIONS-AND-REPLACEMENTS.md) | Intercepted event |
| `RuleModification` | [07-RULE-MODIFICATIONS.md](./07-RULE-MODIFICATIONS.md) | Game rule override |
| `Modifier` | [08-ENGINE-ARCHITECTURE.md](./08-ENGINE-ARCHITECTURE.md) | Continuous state change |
| `Keyword` | [10-KEYWORD-REFERENCE.md](./10-KEYWORD-REFERENCE.md) | Intrinsic keyword flag |

---

_Last updated: 2026-03-19_
