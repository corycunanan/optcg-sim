# 06 — Prohibitions & Replacement Effects

> Two related subsystems that intercept game actions. Prohibitions prevent actions from being attempted. Replacement effects substitute a different outcome when an action would resolve. Both are checked in the action pipeline before the original action executes — prohibitions at step 2 (legality check), replacements at step 3 (interception).

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Actions](./04-ACTIONS.md) · [Conditions](./03-CONDITIONS.md) · [Engine Architecture](./08-ENGINE-ARCHITECTURE.md) · [Targeting](./05-TARGETING.md)

---

## Part 1: Prohibitions

Prohibitions are continuous restrictions that make certain game actions illegal. They live on `permanent` category EffectBlocks in the `prohibitions` field and are active as long as the source card is in its valid zone and any block-level conditions are met.

The engine checks all active prohibitions at **step 2 of the action pipeline** (legality check). If a prohibition matches the attempted action, that action is rejected before it begins — no costs are paid, no replacement effects are checked, no state changes occur.

### Prohibition Type Definition

```typescript
interface Prohibition {
  type: ProhibitionType;
  target?: Target;
  scope?: ProhibitionScope;
  duration?: Duration;
  conditional_override?: ConditionalOverride;
}

interface ProhibitionScope {
  cause?: KOCause | RemovalCause | "ANY";
  source_filter?: TargetFilter;
  uses_per_turn?: number;
}

interface ConditionalOverride {
  action: Action;
}

type ProhibitionType =
  | "CANNOT_BE_KO"
  | "CANNOT_BE_RESTED"
  | "CANNOT_BE_REMOVED_FROM_FIELD"
  | "CANNOT_ATTACK"
  | "CANNOT_PLAY_CARDS"
  | "CANNOT_DRAW"
  | "CANNOT_BE_PLAYED_BY_EFFECTS"
  | "CANNOT_ACTIVATE_BLOCKER"
  | "CANNOT_ADD_LIFE_TO_HAND"
  | "CANNOT_SET_DON_ACTIVE"
  | "CANNOT_LEAVE_FIELD";
```

---

### Prohibition Categories

#### CANNOT_BE_KO — K.O. Protection (7.1)

The most scoped prohibition in the game. KO protection varies along four independent axes: cause, source filter, duration, and usage counter. All axes are optional — omitting an axis means "unrestricted on that axis."

```typescript
interface CannotBeKO extends Prohibition {
  type: "CANNOT_BE_KO";
  scope?: {
    cause?: "IN_BATTLE" | "BY_EFFECT" | "ANY";
    source_filter?: TargetFilter;
    uses_per_turn?: number;
  };
  duration?: Duration;
}
```

| Scope Combination | Card Text | Example |
|-------------------|-----------|---------|
| `cause: "IN_BATTLE"` | "cannot be K.O.'d in battle" | ST05-008 Shiki |
| `cause: "IN_BATTLE"`, `source_filter: { attribute: "Strike" }` | "cannot be K.O.'d by Strike attribute Characters" | OP01-024 |
| `cause: "IN_BATTLE"`, `source_filter: { card_type: "LEADER" }` | "cannot be K.O.'d in battle by Leaders" | ST08-002 Uta |
| `cause: "BY_EFFECT"` | "cannot be K.O.'d by effects" | ST06-004 Smoker |
| `cause: "BY_EFFECT"`, `source_filter: { controller: "OPPONENT" }` | "cannot be K.O.'d by opponent's effects" | ST14-009 Franky |
| `cause: "BY_EFFECT"`, `source_filter: { attribute_not: "Slash" }` | "cannot be K.O.'d by effects of Characters without Slash" | OP11-005 Smoker |
| `cause: "BY_EFFECT"`, `source_filter: { base_power_max: 5000 }` | "cannot be K.O.'d by effects of Characters with base power 5000 or less" | OP14-003 Capone"Gang"Bege |
| `duration: { type: "THIS_TURN" }` | "cannot be K.O.'d during this turn" | ST05-017 |
| `duration: { type: "THIS_BATTLE" }` | "cannot be K.O.'d during this battle" | OP02-118 |
| `uses_per_turn: 1` | "Once per turn, this Character cannot be K.O.'d" | OP10-118 |

**Encoding example** — ST14-009 Franky: "This Character cannot be K.O.'d by your opponent's effects."

```json
{
  "category": "permanent",
  "prohibitions": [{
    "type": "CANNOT_BE_KO",
    "scope": {
      "cause": "BY_EFFECT",
      "source_filter": { "controller": "OPPONENT" }
    }
  }]
}
```

**Encoding example** — OP10-118: "Once per turn, this Character cannot be K.O.'d."

```json
{
  "category": "permanent",
  "prohibitions": [{
    "type": "CANNOT_BE_KO",
    "scope": {
      "cause": "ANY",
      "uses_per_turn": 1
    }
  }]
}
```

---

#### CANNOT_BE_RESTED (7.2)

Prevents a card from being changed to the rested state. Appears in two forms: unconditional (any source) and source-scoped (only by opponent's effects, or by specific card types).

```typescript
interface CannotBeRested extends Prohibition {
  type: "CANNOT_BE_RESTED";
  scope?: {
    source_filter?: TargetFilter;
  };
  duration?: Duration;
}
```

| Variant | Card Text | Example |
|---------|-----------|---------|
| Unconditional | "cannot be rested" | OP14-033 Perona, OP14-069 Doflamingo, OP14-119 Mihawk, EB02-011 Arlong |
| By opponent's effects | "cannot be rested by your opponent's effects" | OP12-021 Ipponmatsu |
| By opponent's Leader/Character effects | "cannot be rested by your opponent's Leader and Character effects" | OP15-024 Usopp |

**Encoding example** — OP12-021 Ipponmatsu:

```json
{
  "category": "permanent",
  "prohibitions": [{
    "type": "CANNOT_BE_RESTED",
    "scope": {
      "source_filter": { "controller": "OPPONENT" }
    }
  }]
}
```

---

#### CANNOT_BE_REMOVED_FROM_FIELD (7.3)

Broader than KO protection. Blocks all forms of removal: K.O., bounce to hand, placement to deck, trash, etc.

```typescript
interface CannotBeRemovedFromField extends Prohibition {
  type: "CANNOT_BE_REMOVED_FROM_FIELD";
  scope?: {
    source_filter?: TargetFilter;
  };
}
```

| Variant | Card Text | Example |
|---------|-----------|---------|
| By opponent's effects | "cannot be removed from the field by your opponent's effects" | OP13-083 St. Jaygarcia Saturn |
| By any effects | "cannot be removed from the field by effects" | P-104 Shanks |

---

#### CANNOT_ATTACK (7.4)

Prevents a card from declaring an attack. The most varied prohibition type — five distinct patterns.

```typescript
interface CannotAttack extends Prohibition {
  type: "CANNOT_ATTACK";
  target?: Target;
  conditions?: Condition;
  conditional_override?: ConditionalOverride;
}
```

| Variant | Card Text | Example |
|---------|-----------|---------|
| Unconditional (self) | "This Character cannot attack." | P-084 Buggy |
| Leader prohibition | "This Leader cannot attack." | OP03-058 Iceberg |
| Conditional (negated) | "cannot attack unless opponent has 2+ Characters with 5000+ base power" | EB04-005 Trafalgar Law |
| Universal (both sides) | "all Characters with a cost of 3 or 4 cannot attack" | P-084 Buggy |
| With override cost | "cannot attack unless opponent trashes 2 cards whenever they attack" | OP08-043 Edward.Newgate |

**Conditional variants** use inverted conditions — the prohibition is active when the condition is NOT met. The `conditions` field on the EffectBlock defines when the prohibition is *lifted*, not when it applies.

**Override cost** is a special mechanism: the opponent can bypass the prohibition by paying a cost. This uses `conditional_override` with an action the opponent must perform.

```json
{
  "category": "permanent",
  "prohibitions": [{
    "type": "CANNOT_ATTACK",
    "conditional_override": {
      "action": {
        "type": "TRASH_FROM_HAND",
        "target": { "controller": "OPPONENT" },
        "params": { "amount": 2 }
      }
    }
  }]
}
```

---

#### CANNOT_PLAY_CARDS (7.6)

Restricts the controller from playing cards. Scoped by card type, cost, and/or source zone.

```typescript
interface CannotPlayCards extends Prohibition {
  type: "CANNOT_PLAY_CARDS";
  scope?: {
    card_type_filter?: CardType;
    cost_filter?: { operator: ">=" | "<=" | ">" | "<"; value: number };
    from_zone?: Zone;
  };
  duration?: Duration;
}
```

| Variant | Card Text | Example |
|---------|-----------|---------|
| Characters this turn | "you cannot play Character cards during this turn" | OP14-020 |
| Characters above cost | "cannot play Character cards with a base cost of 7 or more" | OP12-030 |
| All cards from hand | "you cannot play cards from your hand during this turn" | OP13-028 Shanks |
| Characters on field | "you cannot play any Character cards on your field during this turn" | EB03-024 Vivi |

---

#### CANNOT_DRAW (7.7)

Prevents the controller from drawing cards via their own effects. Does not prevent the mandatory draw during the Draw Phase.

```typescript
interface CannotDraw extends Prohibition {
  type: "CANNOT_DRAW";
  scope?: {
    source_filter?: { controller: "SELF" };
  };
  duration?: Duration;
}
```

| Card Text | Example |
|-----------|---------|
| "you cannot draw cards using your own effects during this turn" | OP12-099 Kalgara |

---

#### CANNOT_BE_PLAYED_BY_EFFECTS (7.8)

An in-hand prohibition — the card cannot be played by effects (only by normal play). Uses `zone: "HAND"` on the EffectBlock.

```typescript
interface CannotBePlayedByEffects extends Prohibition {
  type: "CANNOT_BE_PLAYED_BY_EFFECTS";
}
```

| Card Text | Example |
|-----------|---------|
| "This card in your hand cannot be played by effects." | OP12-036 Roronoa Zoro |

**Encoding:** This prohibition lives on an EffectBlock with `zone: "HAND"`:

```json
{
  "category": "permanent",
  "zone": "HAND",
  "prohibitions": [{
    "type": "CANNOT_BE_PLAYED_BY_EFFECTS"
  }]
}
```

---

#### CANNOT_ACTIVATE_BLOCKER (7.9)

Prevents the opponent from activating the Blocker keyword. Always scoped to a specific attacker — the prohibition is only active when the designated card is attacking.

```typescript
interface CannotActivateBlocker extends Prohibition {
  type: "CANNOT_ACTIVATE_BLOCKER";
  scope?: {
    when_attacking?: Target;
  };
  duration?: Duration;
}
```

| Variant | Card Text | Example |
|---------|-----------|---------|
| When given DON attacks | "opponent cannot activate Blocker when the card given these DON cards attacks" | OP12-016 |
| When selected card attacks | "if the selected card attacks during this turn, opponent cannot activate Blocker" | OP12-077, OP07-057 |
| During this battle | "opponent cannot activate Blocker during this battle" | ST01-012 |
| When Leader/Character attacks | "opponent cannot activate Blocker if that Leader or Character attacks" | ST01-016 Diable Jambe |

This prohibition type interacts with deferred conditional prohibitions (see section 9.7 of CARD-ANALYSIS-FINDINGS.md). The prohibition is granted to a target now, but only takes effect when that target declares an attack.

---

#### CANNOT_ADD_LIFE_TO_HAND (7.10)

Prevents adding Life cards to hand via own effects. Does not prevent the mandatory Life damage rule (receiving damage removes Life).

```typescript
interface CannotAddLifeToHand extends Prohibition {
  type: "CANNOT_ADD_LIFE_TO_HAND";
  scope?: {
    source_filter?: { controller: "SELF" };
  };
  duration?: Duration;
}
```

| Card Text | Example |
|-----------|---------|
| "you cannot add Life cards to your hand using your own effects during this turn" | ST15-001 Atmos, OP06-020 Hody Jones |

---

#### CANNOT_SET_DON_ACTIVE (7.11)

Prevents setting DON cards to active state via specific effect types.

```typescript
interface CannotSetDonActive extends Prohibition {
  type: "CANNOT_SET_DON_ACTIVE";
  scope?: {
    source_filter?: { card_type: CardType };
  };
  duration?: Duration;
}
```

| Card Text | Example |
|-----------|---------|
| "you cannot set DON cards as active using Character effects during this turn" | EB04-016 Bird Neptunian, OP10-030 Smoker |

---

### Self-Prohibition as Drawback (7.12)

Prohibitions are not always protective — they can be drawbacks imposed on the controller as the cost of a powerful effect. These use the same type system but target the controller's own actions.

| Card Text | Example |
|-----------|---------|
| "you cannot play any Character cards on your field during this turn" | EB03-024 Vivi |
| "you cannot play Character cards during this turn" | OP14-020 |
| "All of your opponent's Characters cannot be removed from the field by your effects" | OP14-079 Crocodile |

Drawback prohibitions are typically granted by `auto` category effects as part of the action chain, not as standalone `permanent` blocks. The auto effect resolves its beneficial actions, then grants a prohibition with `duration: { type: "THIS_TURN" }` as the final step.

---

### Prohibition Scope Qualifiers

Prohibitions are scoped through multiple independent axes. Each axis narrows when the prohibition applies.

#### cause

What type of action is being prohibited.

```typescript
type KOCause = "IN_BATTLE" | "BY_EFFECT" | "ANY";
type RemovalCause = "BY_EFFECT" | "BY_OPPONENT_EFFECT" | "ANY";
```

- `"IN_BATTLE"` — only prevents KO when the protected card's power is reduced to 0 during battle resolution
- `"BY_EFFECT"` — only prevents KO/removal caused by a card effect (action type KO, TRASH, etc.)
- `"BY_OPPONENT_EFFECT"` — further scoped to effects controlled by the opponent
- `"ANY"` — no restriction on cause (default when `cause` is omitted)

#### source_filter

A `TargetFilter` applied to the *card causing* the prohibited action, not the card being protected. Uses the same filter system defined in [Targeting](./05-TARGETING.md).

Examples of source filters:

| Filter | Meaning |
|--------|---------|
| `{ "controller": "OPPONENT" }` | Caused by opponent's card |
| `{ "attribute": "Strike" }` | Caused by a Strike-attribute card |
| `{ "card_type": "LEADER" }` | Caused by a Leader |
| `{ "base_power_max": 5000 }` | Caused by a card with base power 5000 or less |
| `{ "attribute_not": "Slash" }` | Caused by a card without the Slash attribute |
| `{ "card_type": ["LEADER", "CHARACTER"] }` | Caused by a Leader or Character |

The engine resolves `source_filter` by checking: "does the card that initiated this action match this filter?" If the causing card does not match, the prohibition does not apply and the action proceeds.

#### duration

How long the prohibition remains active. Uses the standard [Duration](./01-SCHEMA-OVERVIEW.md) system.

| Duration | Prohibition Expires |
|----------|-------------------|
| `{ type: "THIS_TURN" }` | End of current turn |
| `{ type: "THIS_BATTLE" }` | When current battle resolves |
| `{ type: "UNTIL_END_OF_OPPONENT_NEXT_END_PHASE" }` | End of opponent's next End Phase |
| `{ type: "PERMANENT" }` | While source card is on field (default for `permanent` blocks) |

#### uses_per_turn

Integer limiting how many times per turn the prohibition can prevent an action. After N preventions, subsequent matching actions are allowed.

- OP10-118: `uses_per_turn: 1` — "Once per turn, this Character cannot be K.O.'d." After the first KO is prevented, the character can be KO'd normally for the rest of the turn.

The engine tracks usage with a counter that resets during the Refresh Phase.

#### conditional_override

Allows the opponent to bypass the prohibition by performing a specified action (paying a cost).

```typescript
interface ConditionalOverride {
  action: Action;
}
```

OP08-043 Edward.Newgate: "Your opponent's Characters and Leader cannot attack unless your opponent trashes 2 cards from their hand each time they attack."

The engine presents the override action as a choice: the opponent may pay the cost to proceed with the prohibited action, or decline and have the action blocked.

---

## Part 2: Replacement Effects

Replacement effects intercept a game event *as it would happen* and substitute a different outcome. They live on `replacement` category EffectBlocks, using the `replaces` field (what to intercept) and `replacement_actions` field (what to do instead).

The engine checks all active replacement effects at **step 3 of the action pipeline** (interception), after the action passes the legality check (step 2, where prohibitions are evaluated) but before the action executes (step 4). If a replacement effect matches, the original action is cancelled and the replacement actions execute in its place.

### ReplacementTrigger Type Definition

```typescript
interface ReplacementTrigger {
  event: ReplacementEvent;
  target_filter?: TargetFilter;
  cause_filter?: CauseFilter;
}

type ReplacementEvent =
  | "WOULD_BE_KO"
  | "WOULD_BE_REMOVED_FROM_FIELD"
  | "WOULD_LEAVE_FIELD"
  | "WOULD_BE_RESTED"
  | "WOULD_LOSE_GAME"
  | "LIFE_ADDED_TO_HAND";

type CauseFilter =
  | { by: "OPPONENT_EFFECT" }
  | { by: "ANY_EFFECT" }
  | { by: "ANY" };
```

---

### Replacement Triggers (8.1)

Each trigger defines the event being intercepted. The `target_filter` scopes which card must be the subject of the event (used for proxy replacements — see section below). The `cause_filter` scopes what kind of action caused the event.

#### WOULD_BE_KO

Fires when a Character would be K.O.'d by any cause (battle or effect).

| Card Text | Example |
|-----------|---------|
| "If this Character would be K.O.'d..." | P-084 Buggy |
| "If your Character with a base cost of 4 or more would be K.O.'d..." | EB03-001 Vivi |
| "If your black Character with a base cost of 5 or less would be K.O.'d..." | EB04-043 Kaku |
| "If your {Egghead} type Character would be K.O.'d..." | ST29-008 Nami |

#### WOULD_BE_REMOVED_FROM_FIELD

Fires when a Character would be removed from the field specifically by an effect (not by battle KO). Covers KO-by-effect, bounce, deck-tuck, and trash.

| Card Text | Example |
|-----------|---------|
| "If your Character would be removed from the field by your opponent's effect..." | OP15-090 Perona |
| "If your {Cross Guild} type Character would be removed from the field by your opponent's effect..." | ST25-003 Crocodile & Mihawk |
| "If your {Straw Hat Crew} type Character would be removed from the field..." | P-111 Nico Robin |
| "If your {Navy} type Character with 7000 base power or less would be removed from the field..." | OP11-001 Koby |

Always paired with a `cause_filter` — typically `{ by: "OPPONENT_EFFECT" }`.

#### WOULD_LEAVE_FIELD

The broadest removal interception. Fires when a Character would leave the field for any reason: battle KO, effect KO, bounce, deck-tuck, trash, or any other zone transition away from the field.

| Card Text | Example |
|-----------|---------|
| "If this Character would leave the field..." | OP05-100 Enel |

#### WOULD_BE_RESTED

Fires when a Character would be changed from active to rested state by an opponent's effect.

| Card Text | Example |
|-----------|---------|
| "If this Character would be rested by your opponent's effect..." | PRB02-006 Roronoa Zoro |

#### WOULD_LOSE_GAME

Fires when the controller would lose the game due to deck-out (reducing deck to 0 cards). Does not fire on loss-by-life (taking damage with 0 Life).

| Card Text | Example |
|-----------|---------|
| "When your deck is reduced to 0, you win the game instead of losing." | OP03-040 Nami |

#### LIFE_ADDED_TO_HAND

Fires when a Life card would be added to the controller's hand (the standard Life damage rule). This is a rule-level replacement — it changes how Life damage works.

| Card Text | Example |
|-----------|---------|
| "Life cards are placed at the bottom of your deck instead of being added to your hand." | ST13-003 Monkey.D.Luffy |

---

### Replacement Actions (8.2)

Each replacement effect specifies one or more actions that execute *instead of* the intercepted event. These use the standard [Action](./04-ACTIONS.md) system and execute in the `replacement_actions` field.

| Replacement Action | Action Type | Example |
|-------------------|-------------|---------|
| Trash card from hand | `TRASH_FROM_HAND` | EB03-001 Vivi, OP15-090 Perona, ST25-003 |
| Trash Character card with filter from hand | `TRASH_FROM_HAND` with filter | P-084 Buggy: "trash 1 Character card with 6000 power or less" |
| Return DON to DON deck | `RETURN_DON` | EB04-030 Kaido |
| Place cards from trash to deck bottom | `PLACE_FROM_TRASH_TO_DECK` | OP11-001 Koby: "place 3 cards from your trash at the bottom" |
| Rest own DON card | `REST_DON` | P-111 Nico Robin |
| Self power reduction | `MODIFY_POWER` (negative) | PRB02-002 Trafalgar Law: "give this Character -2000 power instead" |
| Rest a different Character | `REST_CARD` | PRB02-006 Roronoa Zoro: "rest 1 of your other Characters instead" |
| Turn Life card face-up | `TURN_LIFE_FACE_UP` | ST29-008 Nami |
| Place to Life face-down | `PLACE_TO_LIFE` | OP11-101: "add it to the top of your Life cards face-down instead" |
| Win the game | `WIN_GAME` | OP03-040 Nami |
| Place at bottom of deck | `PLACE_TO_DECK_BOTTOM` | ST13-003 Monkey.D.Luffy |

**Encoding example** — EB03-001 Vivi: "If your Character with a base cost of 4 or more would be K.O.'d, you may trash 1 card from your hand instead."

```json
{
  "category": "replacement",
  "replaces": {
    "event": "WOULD_BE_KO",
    "target_filter": { "controller": "SELF", "base_cost_min": 4 }
  },
  "replacement_actions": [{
    "type": "TRASH_FROM_HAND",
    "target": { "controller": "SELF" },
    "params": { "amount": 1 }
  }],
  "flags": { "optional": true }
}
```

**Encoding example** — OP03-040 Nami: "When your deck is reduced to 0, you win the game instead of losing."

```json
{
  "category": "replacement",
  "replaces": {
    "event": "WOULD_LOSE_GAME"
  },
  "conditions": {
    "type": "DECK_COUNT",
    "controller": "SELF",
    "operator": "==",
    "value": 0
  },
  "replacement_actions": [{
    "type": "WIN_GAME"
  }]
}
```

**Encoding example** — PRB02-006 Roronoa Zoro: "If this Character would be rested by your opponent's effect, rest 1 of your other Characters instead."

```json
{
  "category": "replacement",
  "replaces": {
    "event": "WOULD_BE_RESTED",
    "cause_filter": { "by": "OPPONENT_EFFECT" }
  },
  "replacement_actions": [{
    "type": "REST_CARD",
    "target": {
      "type": "CHARACTER",
      "controller": "SELF",
      "count": { "exact": 1 },
      "filter": { "not_self": true }
    }
  }]
}
```

---

### Proxy Replacement Effects (8.3)

Most replacement effects protect the card they are printed on (self-replacement). **Proxy replacements** protect *other* cards — the source card intercepts events happening to a different card on the field.

Proxy replacements use the `target_filter` field on `ReplacementTrigger` to specify which cards are protected. The source card itself is NOT necessarily the one being saved — it is the one providing the protection.

| Protected Cards | Source Card | Card Text |
|-----------------|-------------|-----------|
| Your Characters with base cost 4+ | EB03-001 Vivi | "If your Character with a base cost of 4 or more would be K.O.'d..." |
| Your {Cross Guild} Characters | ST25-003 Crocodile & Mihawk | "If your {Cross Guild} type Character would be removed..." |
| Your {Straw Hat Crew} Characters | P-111 Nico Robin | "If your {Straw Hat Crew} type Character would be removed..." |
| Your {Egghead} Characters | ST29-008 Nami | "If your {Egghead} type Character would be K.O.'d..." |
| Your Characters with base power 7000 or less | OP15-090 Perona | "If your Character with 7000 base power or less would be removed..." |
| Your {Navy} Characters with base power 7000 or less | OP11-001 Koby | "If your {Navy} type Character with 7000 base power or less would be removed..." |
| Your black Characters with base cost 5 or less | EB04-043 Kaku | "If your black Character with a base cost of 5 or less would be K.O.'d..." |

**Encoding pattern** — the `target_filter` on `replaces` defines the protected population:

```json
{
  "category": "replacement",
  "replaces": {
    "event": "WOULD_BE_KO",
    "target_filter": {
      "controller": "SELF",
      "color": "BLACK",
      "base_cost_max": 5
    }
  },
  "replacement_actions": [{ "..." }],
  "flags": { "optional": true }
}
```

When the engine processes a KO action at step 3, it checks all active replacement effects. For proxy replacements, it matches the *card being KO'd* against the `target_filter`. The source card (Kaku, Vivi, etc.) must be on the field and in an eligible state.

---

### Replacement Priority Rules

When multiple replacement effects could intercept the same event, the comprehensive rules (8-1-3-4-3) define priority:

1. **Controller chooses.** The controller of the card being affected chooses which replacement effect to apply.
2. **One replacement per event.** Once a replacement effect is applied, the original event is fully replaced. Other replacement effects for that same event do not fire.
3. **Replacement does not re-trigger.** The replacement action itself cannot be intercepted by another replacement effect for the same event type. This prevents infinite loops.
4. **Optional replacements require player consent.** If `flags.optional` is true, the player may decline the replacement, allowing the original event to proceed (or another replacement to apply).

**Engine implementation:** At step 3, the engine collects all matching replacement effects, groups them by controller, and prompts the controller to select one (or decline all optional ones). The selected replacement's `replacement_actions` execute, and the original action is discarded.

---

### Replacement Effect Category Structure

Replacement EffectBlocks follow this pattern within the schema:

```typescript
interface ReplacementEffectBlock extends EffectBlock {
  category: "replacement";

  replaces: ReplacementTrigger;
  replacement_actions: Action[];

  conditions?: Condition;
  costs?: Cost[];
  flags?: EffectFlags;
  duration?: Duration;
}
```

| Field | Purpose |
|-------|---------|
| `replaces` | What event to intercept (required) |
| `replacement_actions` | What to do instead (required) |
| `conditions` | Block-level condition that must be true for the replacement to be eligible |
| `costs` | Cost the controller must pay when the replacement would apply |
| `flags.optional` | Whether the controller may decline the replacement |
| `duration` | How long the replacement effect is active (defaults to `PERMANENT` while source is on field) |

**Conditions example** — a replacement that only works when you have 2+ Life:

```json
{
  "category": "replacement",
  "replaces": { "event": "WOULD_BE_KO" },
  "conditions": {
    "type": "LIFE_COUNT",
    "controller": "SELF",
    "operator": ">=",
    "value": 2
  },
  "replacement_actions": [{ "type": "TRASH_FROM_HAND", "params": { "amount": 1 } }],
  "flags": { "optional": true }
}
```

**Costs example** — a replacement that requires paying DON:

```json
{
  "category": "replacement",
  "replaces": { "event": "WOULD_BE_REMOVED_FROM_FIELD", "cause_filter": { "by": "OPPONENT_EFFECT" } },
  "costs": [{ "type": "DON_MINUS", "amount": 1 }],
  "replacement_actions": [{ "type": "TRASH_FROM_HAND", "params": { "amount": 1 } }],
  "flags": { "optional": true }
}
```

---

_Last updated: 2026-03-19_
