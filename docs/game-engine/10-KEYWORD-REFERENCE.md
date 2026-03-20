# 10 — Keyword Reference

> Complete reference for OPTCG keywords, normalization rules, and advanced keyword patterns. Keywords are first-class flags in the schema — intrinsic keywords live in `EffectFlags.keywords`, while keyword grants are encoded as `GRANT_KEYWORD` actions with targets and durations.

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Actions](./04-ACTIONS.md) · [Triggers](./02-TRIGGERS.md) · [Prohibitions & Replacements](./06-PROHIBITIONS-AND-REPLACEMENTS.md)

---

## Keyword Enum

The closed set of all keyword abilities recognized by the engine.

```typescript
type Keyword =
  | "RUSH"
  | "BLOCKER"
  | "DOUBLE_ATTACK"
  | "BANISH"
  | "UNBLOCKABLE"
  | "RUSH_CHARACTER"
  | "CAN_ATTACK_ACTIVE";
```

Keywords appear in two contexts:

1. **Intrinsic** — printed on the card itself. Stored in `EffectFlags.keywords` (see [Schema Overview](./01-SCHEMA-OVERVIEW.md)).
2. **Granted** — given to a card by another card's effect. Encoded as a `GRANT_KEYWORD` action with a target and duration (see [Actions](./04-ACTIONS.md)).

```typescript
interface EffectFlags {
  once_per_turn?: boolean;
  optional?: boolean;
  keywords?: Keyword[];
}
```

Intrinsic keywords require no trigger, no action resolution, and no duration — they are always active while the card is in play. Granted keywords behave identically during their active duration but are removed when the duration expires.

---

## Standard Keywords

### Rush

**Reminder text:** This card can attack on the turn it is played.

**Engine behavior:** When a Character with Rush is played, the engine skips the "summoning sickness" check for that Character. The Character may declare attacks (against the opponent's Leader or rested Characters) during the same turn it was played.

**Intrinsic encoding:**

```json
{
  "flags": { "keywords": ["RUSH"] }
}
```

**Grant encoding — ST10-012:**

```json
{
  "type": "GRANT_KEYWORD",
  "target": { "type": "SELF" },
  "params": { "keyword": "RUSH" },
  "duration": { "type": "PERMANENT" }
}
```

**Example cards (intrinsic):** OP01-017 Monkey.D.Luffy, ST01-012 Monkey.D.Luffy

---

### Blocker

**Reminder text:** When your opponent attacks, you may rest this card to make it the new target of the attack.

**Engine behavior:** During the opponent's attack declaration, after the attacker and target are chosen, the engine checks for active Blockers on the defending player's side. If a Blocker exists and is active (not rested), the defending player may rest it to redirect the attack to the Blocker. Blocker activation fires `BLOCKER_ACTIVATED` which some triggers listen for (e.g., OP15-119: "When your opponent activates [Blocker]").

**Intrinsic encoding:**

```json
{
  "flags": { "keywords": ["BLOCKER"] }
}
```

**Grant encoding — OP02-074 Saldeath (aura):**

```json
{
  "category": "permanent",
  "modifiers": [{
    "type": "GRANT_KEYWORD",
    "target": {
      "controller": "SELF",
      "card_type": "CHARACTER",
      "filter": { "name": "Blugori" }
    },
    "params": { "keyword": "BLOCKER" }
  }]
}
```

**Example cards (intrinsic):** ST01-013 Roronoa Zoro, OP01-051 Trafalgar Law

---

### Double Attack

**Reminder text:** This card deals 2 damage.

**Engine behavior:** When a Character or Leader with Double Attack deals damage to the opponent's Life (i.e., the attack is not blocked and resolves against the Leader), the engine removes 2 Life cards instead of 1. Each Life card removed triggers its own Trigger check independently.

**Intrinsic encoding:**

```json
{
  "flags": { "keywords": ["DOUBLE_ATTACK"] }
}
```

**Grant encoding:**

```json
{
  "type": "GRANT_KEYWORD",
  "target": {
    "controller": "SELF",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "params": { "keyword": "DOUBLE_ATTACK" },
  "duration": { "type": "THIS_TURN" }
}
```

**Example cards (intrinsic):** OP01-094 Kaido

---

### Banish

**Reminder text:** When this card's attack K.O.'s a Character in battle, that Character is placed at the bottom of the owner's deck instead of being trashed.

**Engine behavior:** Banish is a replacement effect on battle KO resolution. When a Character with Banish wins a battle and the opposing Character would be K.O.'d, the engine replaces the normal KO action (move to trash) with a return-to-deck-bottom action. The K.O. event still fires (triggering `[On K.O.]` effects), but the card's destination changes from trash to deck bottom.

**Intrinsic encoding:**

```json
{
  "flags": { "keywords": ["BANISH"] }
}
```

**Grant encoding:**

```json
{
  "type": "GRANT_KEYWORD",
  "target": { "type": "SELF" },
  "params": { "keyword": "BANISH" },
  "duration": { "type": "THIS_TURN" }
}
```

**Example cards (intrinsic):** OP10-097, various OP-09 Blackbeard Pirates cards

---

### Unblockable

**Reminder text:** When this card attacks, your opponent cannot activate [Blocker].

**Engine behavior:** When a Character with Unblockable declares an attack, the engine skips the Blocker activation window entirely. The defending player is not prompted to activate Blocker. This is equivalent to `CANNOT_ACTIVATE_BLOCKER` scoped to "when this card attacks," but encoded as a keyword for cards that print it.

**Intrinsic encoding:**

```json
{
  "flags": { "keywords": ["UNBLOCKABLE"] }
}
```

**Grant encoding — OP15-070 Fuza (aura):**

```json
{
  "category": "permanent",
  "modifiers": [{
    "type": "GRANT_KEYWORD",
    "target": {
      "controller": "SELF",
      "card_type": "CHARACTER",
      "filter": { "name_any": ["Shura"] }
    },
    "params": { "keyword": "UNBLOCKABLE" }
  }]
}
```

**Example cards (intrinsic):** Various cards from OP-09 onward

---

### Rush: Character

**Reminder text:** This card can attack Characters on the turn it is played.

**Engine behavior:** A partial Rush. Characters with Rush: Character can attack opponent's rested Characters on the turn they are played, but they CANNOT attack the opponent's Leader on their play turn. On subsequent turns, the restriction is lifted and the Character attacks normally.

The engine implements this as: skip summoning sickness check for Character-targeting attacks only. Leader-targeting attacks are still blocked by the standard summoning sickness rule on the play turn.

This keyword is mechanically distinct from full Rush — Rush removes all attack restrictions on the play turn, while Rush: Character only removes the Character-attack restriction.

**Intrinsic encoding:**

```json
{
  "flags": { "keywords": ["RUSH_CHARACTER"] }
}
```

**Grant encoding — Stages granting Rush: Character to a population:**

OP01-001 Koby: "Your {SWORD} type Characters can attack Characters on the turn in which they are played."

```json
{
  "category": "permanent",
  "modifiers": [{
    "type": "GRANT_KEYWORD",
    "target": {
      "controller": "SELF",
      "card_type": "CHARACTER",
      "filter": { "traits": ["SWORD"] }
    },
    "params": { "keyword": "RUSH_CHARACTER" }
  }]
}
```

OP04-096 Corrida Coliseum: "Your {Dressrosa} type Characters can attack Characters on the turn in which they are played."

```json
{
  "category": "permanent",
  "modifiers": [{
    "type": "GRANT_KEYWORD",
    "target": {
      "controller": "SELF",
      "card_type": "CHARACTER",
      "filter": { "traits": ["Dressrosa"] }
    },
    "params": { "keyword": "RUSH_CHARACTER" }
  }]
}
```

**Example cards (intrinsic):** Various; more commonly granted by Stage effects

---

## Keyword Normalization Rules

When encoding card effects, some text-described behaviors are mechanically identical to keywords. This section defines when to encode as `GRANT_KEYWORD` versus when to encode as an action or prohibition.

### Rule 1: Identical Behavior = GRANT_KEYWORD

If a card's text describes behavior that is mechanically identical to a keyword's definition, encode it as `GRANT_KEYWORD`.

| Card Text | Encoding |
|-----------|----------|
| "This Character gains [Rush]" | `GRANT_KEYWORD` with `keyword: "RUSH"` |
| "This Character gains [Blocker]" | `GRANT_KEYWORD` with `keyword: "BLOCKER"` |
| "This Character gains [Double Attack]" | `GRANT_KEYWORD` with `keyword: "DOUBLE_ATTACK"` |
| "This Character gains [Banish]" | `GRANT_KEYWORD` with `keyword: "BANISH"` |

Bracket notation in card text (e.g., `[Rush]`, `[Blocker]`) always indicates a keyword grant.

### Rule 2: Different Scope, Condition, or Duration = Action/Prohibition

If the described behavior differs from the keyword in any mechanical dimension — conditional activation, different scope, different duration, or additional constraints — encode it as the appropriate action or prohibition, NOT as a keyword.

| Card Text | Why Not a Keyword | Correct Encoding |
|-----------|-------------------|------------------|
| "Your opponent cannot activate [Blocker] during this battle" (ST01-012) | Conditional on "during this battle," scoped to attacker | `APPLY_PROHIBITION` with `prohibition_type: "CANNOT_ACTIVATE_BLOCKER"`, `duration: THIS_BATTLE` |
| "If the selected card attacks during this turn, your opponent cannot activate [Blocker]" (OP07-057) | Deferred conditional — only activates when the target attacks | Deferred `APPLY_PROHIBITION` bound to target's attack event |
| "This Character can also attack your opponent's active Characters" (OP01-021) | Not Rush — enables active-targeting, not play-turn attacks | `GRANT_KEYWORD` with `keyword: "CAN_ATTACK_ACTIVE"` |

### Rule 3: Negation of a Keyword = Prohibition

Text that negates a keyword's effect on the opponent is a prohibition, not a keyword grant on the attacker.

| Card Text | Encoding |
|-----------|----------|
| "Your opponent cannot activate [Blocker]" | `APPLY_PROHIBITION` with `CANNOT_ACTIVATE_BLOCKER` |
| "This Character cannot attack" | `APPLY_PROHIBITION` with `CANNOT_ATTACK` |

### Normalization Table

Complete mapping of common text patterns to their encoding:

| Card Text Pattern | Schema Encoding | Type |
|-------------------|-----------------|------|
| "gains [Rush]" | `GRANT_KEYWORD { keyword: "RUSH" }` | Keyword grant |
| "gains [Blocker]" | `GRANT_KEYWORD { keyword: "BLOCKER" }` | Keyword grant |
| "gains [Double Attack]" | `GRANT_KEYWORD { keyword: "DOUBLE_ATTACK" }` | Keyword grant |
| "gains [Banish]" | `GRANT_KEYWORD { keyword: "BANISH" }` | Keyword grant |
| "gains [Unblockable]" | `GRANT_KEYWORD { keyword: "UNBLOCKABLE" }` | Keyword grant |
| "can attack Characters on the turn played" | `GRANT_KEYWORD { keyword: "RUSH_CHARACTER" }` | Keyword grant |
| "can also attack active Characters" | `GRANT_KEYWORD { keyword: "CAN_ATTACK_ACTIVE" }` | Keyword grant |
| "opponent cannot activate [Blocker] during this battle" | `APPLY_PROHIBITION { type: "CANNOT_ACTIVATE_BLOCKER" }` | Prohibition |
| "opponent cannot activate [Blocker] if X attacks" | Deferred `APPLY_PROHIBITION` | Prohibition |
| "This Character cannot attack" | Permanent `CANNOT_ATTACK` prohibition | Prohibition |
| "Characters cannot attack" (population) | Permanent `CANNOT_ATTACK` prohibition with target filter | Prohibition |

---

## Advanced Keyword Patterns

### Can Attack Active Characters (13.2)

A distinct ability — NOT equivalent to Rush or Rush: Character. This ability removes the targeting restriction that normally limits attacks to rested Characters. A Character with `CAN_ATTACK_ACTIVE` can target active (untapped) opponent Characters in addition to rested ones and the opponent's Leader.

This does NOT bypass summoning sickness. A Character played this turn still cannot attack unless it also has Rush.

**Card text:** "This Character can also attack your opponent's active Characters."

**Example cards:** OP01-021 Franky, OP06-110, OP11-010, OP11-014, OP11-082, OP11-084, OP11-119, EB03-008, EB04-050

**Encoding:**

```json
{
  "type": "GRANT_KEYWORD",
  "target": { "type": "SELF" },
  "params": { "keyword": "CAN_ATTACK_ACTIVE" },
  "duration": { "type": "PERMANENT" }
}
```

**Engine behavior:** During attack declaration, when determining legal attack targets, the engine includes the opponent's active Characters in the target pool if the attacker has `CAN_ATTACK_ACTIVE`. Without this ability, only rested Characters and the Leader are valid targets.

**Distinction from Rush: Character:**

| Ability | Play-turn attack? | Target active Characters? |
|---------|-------------------|---------------------------|
| Rush | Yes (Leader + Characters) | No (rested only, per normal rules) |
| Rush: Character | Yes (Characters only) | No (rested only) |
| Can Attack Active | No (normal summoning sickness) | Yes |

---

### Characters Can Attack Characters on Play Turn (13.3)

A population-level Rush: Character granted by Stage cards. Differs from intrinsic Rush: Character in that it is not printed on the Character itself — it comes from an external source (a Stage) and applies to all matching Characters while the Stage is on the field.

**Card text patterns:**
- "Your {SWORD} type Characters can attack Characters on the turn in which they are played." (OP01-001 Koby)
- "Your {Dressrosa} type Characters can attack Characters on the turn in which they are played." (OP04-096 Corrida Coliseum)

**Encoding:** Uses `permanent` category EffectBlock with a modifier, not an auto/activate effect:

```json
{
  "id": "corrida_coliseum_rush",
  "category": "permanent",
  "modifiers": [{
    "type": "GRANT_KEYWORD",
    "target": {
      "controller": "SELF",
      "card_type": "CHARACTER",
      "filter": { "traits": ["Dressrosa"] }
    },
    "params": { "keyword": "RUSH_CHARACTER" }
  }]
}
```

**Engine behavior:** The Stage continuously broadcasts `RUSH_CHARACTER` to all matching Characters on the controller's field. When a new Character enters the field that matches the filter, it immediately gains the keyword. When the Stage leaves the field, the keyword is removed from all recipients.

---

### Keyword Choice (13.4)

The player selects one keyword from a predefined set. The chosen keyword is granted to the target for the specified duration. Only one keyword is granted — this is NOT a "gain all" effect.

**Card text:** "This Character gains [Double Attack], [Banish] or [Blocker] until the end of your opponent's next turn." (OP09-084 Catarina Devon)

**Encoding:** Uses `PLAYER_CHOICE` wrapping multiple `GRANT_KEYWORD` branches:

```json
{
  "type": "PLAYER_CHOICE",
  "params": {
    "options": [
      [{
        "type": "GRANT_KEYWORD",
        "target": { "self_ref": true },
        "params": { "keyword": "DOUBLE_ATTACK" },
        "duration": { "type": "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
      }],
      [{
        "type": "GRANT_KEYWORD",
        "target": { "self_ref": true },
        "params": { "keyword": "BANISH" },
        "duration": { "type": "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
      }],
      [{
        "type": "GRANT_KEYWORD",
        "target": { "self_ref": true },
        "params": { "keyword": "BLOCKER" },
        "duration": { "type": "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
      }]
    ]
  }
}
```

**Engine behavior:** The engine presents the player with the keyword options. The player selects one. The corresponding `GRANT_KEYWORD` action executes. The unselected options are discarded.

The `PLAYER_CHOICE` wrapper is the standard mechanism for any "pick one of N" effect. It is not keyword-specific — the same structure applies to destination choice, action choice, etc. (see [Actions — PLAYER_CHOICE](./04-ACTIONS.md)).

---

### Conditional Self-Negation (13.5)

A card has a static prohibition as a drawback, and a triggered ability that negates its own prohibition when a condition is met. The card "unlocks itself."

**Card text:** "This Character cannot attack. When a card is trashed from your hand by an effect, this Character's effect is negated during this turn." (OP14-056 Wadatsumi)

**Encoding:** Two EffectBlocks on the same card:

```json
{
  "effects": [
    {
      "id": "wadatsumi_drawback",
      "category": "permanent",
      "prohibitions": [{
        "type": "CANNOT_ATTACK"
      }]
    },
    {
      "id": "wadatsumi_unlock",
      "category": "auto",
      "trigger": { "type": "CARD_TRASHED_FROM_HAND_BY_EFFECT" },
      "actions": [{
        "type": "NEGATE_EFFECTS",
        "target": { "self_ref": true },
        "duration": { "type": "THIS_TURN" }
      }]
    }
  ]
}
```

**Engine behavior:** The permanent block establishes `CANNOT_ATTACK`. When the trigger fires (a card is trashed from your hand by an effect), `NEGATE_EFFECTS` blanks all effects on the card for the turn — including the `CANNOT_ATTACK` prohibition. The Character can now attack during this turn. At end of turn, the negation expires and the prohibition re-activates.

This is distinct from `REMOVE_PROHIBITION` (which removes a specific prohibition permanently). `NEGATE_EFFECTS` blanks all effects temporarily, which is the correct encoding when the card text says "this Character's effect is negated."

---

### Aura Effects (13.6)

One card on the field continuously grants abilities, protections, or stat modifications to all other cards matching a filter. Auras use `permanent` category EffectBlocks with `modifiers`, NOT individual `GRANT_KEYWORD` actions.

**Card text patterns:**
- "All of your [Shura] cards and this Character gain [Unblockable]." (OP15-070 Fuza)
- "All of your [Ohm] cards and this Character gain [Double Attack]." (OP15-071 Holly)
- "{Kurozumi Clan} type Characters other than your [Kurozumi Semimaru] cannot be K.O.'d in battle." (OP01-099 Kurozumi Semimaru)
- "[Blugori] gains [Blocker]." (OP02-074 Saldeath)

**Keyword aura encoding — OP15-070 Fuza:**

```json
{
  "id": "fuza_aura",
  "category": "permanent",
  "modifiers": [{
    "type": "GRANT_KEYWORD",
    "target": {
      "controller": "SELF",
      "card_type": "CHARACTER",
      "filter": { "name_any": ["Shura"], "or_self": true }
    },
    "params": { "keyword": "UNBLOCKABLE" }
  }]
}
```

**Protection aura encoding — OP01-099 Kurozumi Semimaru:**

```json
{
  "id": "semimaru_aura",
  "category": "permanent",
  "prohibitions": [{
    "type": "CANNOT_BE_KO",
    "target": {
      "controller": "SELF",
      "card_type": "CHARACTER",
      "filter": { "traits": ["Kurozumi Clan"], "exclude_name": "Kurozumi Semimaru" }
    },
    "scope": { "cause": "IN_BATTLE" }
  }]
}
```

**Engine behavior:** Auras are re-evaluated continuously. When a new card enters the field that matches the aura's filter, it immediately receives the modifier. When the aura source leaves the field, all granted modifiers are removed. Auras do NOT fire events or trigger activation — they simply establish a persistent game state layer.

**Key distinction:** Aura effects differ from triggered `GRANT_KEYWORD` actions in three ways:

| | Aura (permanent modifier) | Triggered GRANT_KEYWORD |
|-|---------------------------|-------------------------|
| **Timing** | Continuous — always active | One-shot — resolves once |
| **New cards** | Automatically applies to new matching cards | Only applies to cards present at resolution |
| **Source removal** | Modifier removed when source leaves field | Keyword persists until duration expires |

---

### Static Play Cost Reduction (13.7)

Permanent effects that reduce the play cost for cards matching a filter. These are `permanent` category EffectBlocks with `MODIFY_COST` modifiers, not auto effects that fire on play.

**Card text patterns:**
- "The cost of playing {Celestial Dragons} type Character cards with a cost of 2 or more from your hand will be reduced by 1." (OP05-097 Mary Geoise)
- "Give blue Events in your hand -1 cost." (OP01-067)

**Encoding — OP05-097 Mary Geoise:**

```json
{
  "id": "mary_geoise_cost_reduction",
  "category": "permanent",
  "modifiers": [{
    "type": "MODIFY_COST",
    "target": {
      "controller": "SELF",
      "zone": "HAND",
      "card_type": "CHARACTER",
      "filter": { "traits": ["Celestial Dragons"], "cost": { "operator": ">=", "value": 2 } }
    },
    "params": { "amount": -1 }
  }]
}
```

**Engine behavior:** The engine applies cost reduction as a continuous modifier during cost calculation. When a player attempts to play a card, the engine collects all active cost reduction modifiers whose filters match the card being played. The reductions stack additively. Cost cannot be reduced below 0.

Cost reduction auras follow the same rules as keyword auras (section 13.6): they apply to all matching cards continuously, automatically include newly drawn cards, and are removed when the source leaves the field.

---

### Hand-Zone Static Effects (13.8)

Effects that are active while the card is in the hand zone, not on the field. These use `zone: "HAND"` on the EffectBlock. Two subtypes exist: self-cost-reduction and play restrictions.

#### Self-Cost-Reduction in Hand

The card reduces its own play cost while in hand, subject to a condition.

**Card text patterns:**
- "If you have 1 or less Life cards, give this card in your hand -1 cost." (EB04-061 Monkey.D.Luffy)
- "If you have 4 or more Events in your trash, give this card in your hand -3 cost." (OP15-021)
- Various from OP15-013, OP15-102, ST23-001, ST23-002, ST26-001, PRB02-014

**Encoding — EB04-061 Monkey.D.Luffy:**

```json
{
  "id": "luffy_hand_cost_reduction",
  "category": "permanent",
  "zone": "HAND",
  "conditions": {
    "type": "LIFE_COUNT",
    "controller": "SELF",
    "operator": "<=",
    "value": 1
  },
  "modifiers": [{
    "type": "MODIFY_COST",
    "target": { "self_ref": true },
    "params": { "amount": -1 }
  }]
}
```

#### Play Restrictions in Hand

The card restricts how it can be played while in hand.

**Card text:** "This card in your hand cannot be played by effects." (OP12-036 Roronoa Zoro)

**Encoding:**

```json
{
  "id": "zoro_play_restriction",
  "category": "permanent",
  "zone": "HAND",
  "prohibitions": [{
    "type": "CANNOT_BE_PLAYED_BY_EFFECTS"
  }]
}
```

**Engine behavior:** Hand-zone effects participate in the engine's modifier and prohibition systems while the card is in hand. The `zone: "HAND"` qualifier tells the engine to activate these EffectBlocks when the card is in the hand zone (not the default field zone). When the card leaves the hand (played, trashed, placed to deck), the effect deactivates.

Self-cost-reduction effects are checked during the cost calculation step of play actions. The engine evaluates the block-level condition against the current game state. If the condition is met, the cost modifier applies.

See [Schema Overview — Effect Zone](./01-SCHEMA-OVERVIEW.md) for the `EffectZone` type definition.

---

## Keyword Evolution Notes

The OPTCG keyword system has evolved over the game's lifetime. Early sets described certain mechanics in full text; later sets formalized recurring patterns into official keywords. This matters for schema encoding because older cards and newer cards can have mechanically identical effects with different card text.

### ST01-012: "Cannot Activate Blocker" Predates [Unblockable]

ST01-012 Monkey.D.Luffy (Starter Deck 01, 2022) reads: "Your opponent cannot activate [Blocker] during this battle."

Later sets introduced `[Unblockable]` as a keyword. The mechanical effect is similar but not identical:

| | ST01-012 Text | [Unblockable] Keyword |
|-|---------------|----------------------|
| **Scope** | "During this battle" only | Whenever this card attacks |
| **Trigger** | Requires `[When Attacking]` with DON!! x2 | Intrinsic — always active |
| **Duration** | `THIS_BATTLE` | Permanent while in play |
| **Activation cost** | 2 attached DON!! | None |

Because of the conditional activation and battle-scoped duration, ST01-012 is encoded as a triggered `APPLY_PROHIBITION`, NOT as `GRANT_KEYWORD { keyword: "UNBLOCKABLE" }`:

```json
{
  "category": "auto",
  "trigger": { "type": "WHEN_ATTACKING" },
  "costs": [{ "type": "DON_REST", "amount": 2 }],
  "actions": [{
    "type": "APPLY_PROHIBITION",
    "target": { "controller": "OPPONENT" },
    "params": { "prohibition_type": "CANNOT_ACTIVATE_BLOCKER" },
    "duration": { "type": "THIS_BATTLE" }
  }]
}
```

### "Can Attack Characters on Play Turn" Becomes Rush: Character

Early card text described this ability in a full sentence: "Your {Type} type Characters can attack Characters on the turn in which they are played." This pattern appeared on Stages starting from OP-01.

Later sets formalized this into `[Rush: Character]` (printed in keyword brackets on the card). The schema uses `RUSH_CHARACTER` for both — the normalization rule applies regardless of whether the card prints the keyword bracket notation or the long-form text.

### Pattern: Text Effects Formalize into Keywords

As the OPTCG card pool grew, recurring text patterns were promoted to official keywords:

| First Appearance | Text Pattern | Became Keyword |
|-----------------|--------------|----------------|
| ST-01 (2022) | "opponent cannot activate Blocker" | `[Unblockable]` |
| OP-01 (2022) | "can attack Characters on the turn played" | `[Rush: Character]` |
| OP-09 (2024) | "place at bottom of deck instead of trash" on battle KO | `[Banish]` |

**Encoding principle:** When a card's text describes a behavior that was later formalized into a keyword, encode the card using the keyword only if the behavior is mechanically identical. If the text version has additional constraints (conditions, costs, different duration), preserve those constraints in the encoding rather than collapsing to the keyword.

---

_Last updated: 2026-03-19_
