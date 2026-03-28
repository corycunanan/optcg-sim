---
name: encode-card
description: Encode OPTCG card effect text into machine-readable JSON schemas for the game engine. Supports single-card encoding and batch set encoding.
user-invokable: true
args:
  - name: mode
    description: "single" for one card, "batch" for an entire set file
    required: false
  - name: card_id
    description: Card ID to encode (single mode) or set code (batch mode, e.g. "EB-03")
    required: false
---

# Encode Card Effect Schema

> Encode OPTCG card effect text into machine-readable JSON schemas for the game engine.

## When to Use

- User asks to encode a card's effect text into the schema
- User asks to process a batch of cards from a set file
- User wants to validate or review an existing encoding
- User pastes card effect text and asks for the JSON representation

---

## Modes

### Single Card Mode

Encode one card at a time. The user provides effect text directly (pasted or quoted) or references a card by ID. Output a single card schema object.

### Batch Mode

Process an entire set file from `docs/cards/<SET>.md`. Read the file, identify every card with effect text, and produce a JSON array of card schemas. Skip vanilla cards (cards with no effect text).

---

## Context Loading

Before encoding any card, read these files in order. Do not skip this step — the encoding depends on pattern-matching tables, type definitions, and examples in these files.

### Required (always read first)

1. **`workers/game/src/engine/effect-types.ts`** — **Source of truth** for all valid enum values: action types, trigger types, condition types, cost types, filter fields, target types, prohibition types, duration types, and rule modification types. Always verify enum values against this file. Documentation may lag behind — this file is canonical.
2. **`docs/game-engine/11-ENCODING-GUIDE.md`** — Primary reference. Contains pattern-matching tables that map card text phrases to schema fields. This is the main lookup resource during encoding.
3. **`docs/game-engine/09-EXAMPLE-ENCODINGS.md`** — Ten fully annotated reference encodings. Use these as few-shot calibration before encoding new cards. Pay attention to the annotations — they explain why each encoding decision was made.
4. **`workers/game/src/engine/schemas/README.md`** — Authoring guide with complete catalogs of triggers, conditions, actions, costs, targets, filters, and examples.

### Required (read on first use per session)

5. **`docs/game-engine/01-SCHEMA-OVERVIEW.md`** — Core type system: EffectBlock structure, categories, flags, costs, chain semantics, durations, dynamic values.

### On-demand (consult for edge cases)

Read these only when a pattern is not covered by the encoding guide or example encodings:

6. `docs/game-engine/02-TRIGGERS.md` — Full trigger type catalog
7. `docs/game-engine/03-CONDITIONS.md` — All condition types and compound conditions
8. `docs/game-engine/04-ACTIONS.md` — Complete action type reference
9. `docs/game-engine/05-TARGETING.md` — Target types, filters, controller semantics
10. `docs/game-engine/06-PROHIBITIONS-AND-REPLACEMENTS.md` — Prohibition types, replacement effects, proxy replacements
11. `docs/game-engine/07-RULE-MODIFICATIONS.md` — Rule modification types
12. `docs/game-engine/10-KEYWORD-REFERENCE.md` — Keyword definitions and encoding rules

### Pre-scan for deferred patterns

Before encoding a set, run the deferred pattern scanner to identify cards that may be unencodable:

```
node workers/game/src/engine/schemas/pre-scan.sh docs/cards/<SET>.md
```

Review flagged cards against `docs/game-engine/DEFERRED-CARD-EFFECTS.md`. Skip flagged cards during encoding and add them to the deferred list if confirmed.

---

## Encoding Process

Follow these steps for every card. Do not skip steps.

### Step 1: Parse Card Text

Each card entry in the set file provides the card name (heading), card ID with type and color (`**{SET}-NNN** · Type · Color`), and the effect text. Read the `card_type` and color directly from this metadata line — do not query the database.

Split the card text into independent effect blocks. Each of these starts a new block:

- A bracket tag: `[On Play]`, `[Activate: Main]`, `[When Attacking]`, `[On K.O.]`, `[Counter]`, `[Trigger]`, `[Once Per Turn]`, etc.
- A DON!! requirement prefix: `[DON!! x1]`, `[DON!! x2]`
- A static paragraph with no bracket tag (continuous/permanent effects)
- On Event cards: "Effect" and "Trigger Effect" headers indicate two separate blocks

**Reminder text handling:** Text in parentheses after a keyword is reminder text. Encode the keyword, not the reminder. Example: `[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)` encodes as a permanent block with `flags.keywords: ["BLOCKER"]`. The parenthetical is ignored.

**Multi-trigger shorthand:** `[On Play]/[When Attacking]` means two separate triggers share the same actions. Encode as a single block if the schema supports multi-trigger, or two blocks with identical actions if it does not.

### Step 2: Classify Each Block

Assign exactly one `category` per block. Use these rules:

| Card Text Pattern | Category |
|---|---|
| `[On Play]`, `[When Attacking]`, `[On K.O.]`, `[Trigger]`, `[Counter]`, `[On Your Opponent's Attack]`, custom event triggers | `auto` |
| `[Activate: Main]` | `activate` |
| `[Main]` on Events | `auto` |
| Static text with no bracket trigger: "This Character gains...", "This Character cannot...", intrinsic keywords (`[Blocker]`, `[Rush]`, `[Double Attack]`, etc.) | `permanent` |
| "If X would be Y, Z instead", "you may ... instead" | `replacement` |
| "Under the rules of this game...", "Also treat this card's name as...", "you may have any number of this card" | `rule_modification` |

If a block has both `[Once Per Turn]` and another bracket tag, the category comes from the other tag. `[Once Per Turn]` is a flag, not a category determinant.

### Step 3: Identify Components

For each block, extract these components from the card text:

- **Trigger** — The event or timing that fires the effect. Map bracket tags to trigger keywords using the encoding guide tables.
- **Conditions** — "If..." clauses that gate the effect. Distinguish block-level conditions (gate the whole block) from inline conditions (gate a single action in a chain).
- **Costs** — Text before a colon (`:`) that the player must pay. Also DON!! minus/rest requirements. "You may rest this Leader:" means `REST_SELF` cost + `optional: true`.
- **Actions** — What the effect does. Each verb phrase maps to an action type.
- **Duration** — "during this turn", "during this battle", "until the end of your opponent's next turn", etc.
- **Flags** — `[Once Per Turn]` maps to `once_per_turn: true`. "You may" on the whole effect maps to `optional: true`. Intrinsic keywords go in `keywords`.

### Step 4: Encode

Build the JSON using the encoding guide pattern tables. For each component identified in Step 3:

1. Look up the card text phrase in the encoding guide's pattern tables.
2. If found, use the specified schema shape exactly.
3. If not found, consult the full spec file for that component type (triggers in 02, conditions in 03, etc.).
4. If still not found, flag it as a potential spec gap. Encode your best interpretation and add a comment explaining the ambiguity.

Build the EffectBlock by assembling the components according to the field applicability table in `01-SCHEMA-OVERVIEW.md`:

- `auto` and `activate` blocks use: trigger, costs (optional), conditions (optional), actions, flags (optional), duration (optional)
- `permanent` blocks use: modifiers and/or prohibitions, conditions (optional), flags (optional)
- `replacement` blocks use: replaces, replacement_actions, costs (optional), conditions (optional), flags (optional)
- `rule_modification` blocks use: rule, conditions (optional), flags (optional)

### Step 5: Validate

Run these checks on every encoded block:

1. **Unique IDs** — Every block has a unique, descriptive `id` string.
2. **Category matches content** — An `auto` block has `trigger` + `actions`. A `permanent` block has `modifiers` or `flags.keywords`. A `replacement` block has `replaces` + `replacement_actions`. No cross-contamination.
3. **Enum values exist** — Every trigger keyword, action type, condition type, cost type, duration type, and target type is a valid enum member from the spec.
4. **Chain connectors are correct** — `THEN` for "Then,", `IF_DO` for "If you do,", `AND` for simultaneous actions. The first action in a chain has no `chain` field. Only subsequent actions carry a connector.
5. **Durations match text** — "during this turn" is `THIS_TURN`, "during this battle" is `THIS_BATTLE`, etc. Verify every duration field against the duration semantics table.
6. **Targets have correct controller** — "your" maps to `SELF`, "your opponent's" maps to `OPPONENT`. Verify `controller` on every target.
7. **Counts are correct** — "up to 1" is `{ "up_to": 1 }`, "1" (mandatory) is `{ "exact": 1 }`, "all" is `{ "all": true }`.
8. **Costs use colon rule** — Text before `:` in the card text is a cost, not an action. Verify costs are in the `costs` array, not in `actions`.
9. **Keywords are in flags** — `[Blocker]`, `[Rush]`, `[Double Attack]`, `[Banish]` go in `flags.keywords`, not as separate action-bearing effect blocks.
10. **Optional is correctly placed** — "You may" on the whole effect goes in `flags.optional`. "You may" on a specific action makes that action optional, not the whole block.

---

## Output Format

### Single Card

```json
{
  "card_id": "OP01-016",
  "card_name": "Nami",
  "effects": [
    {
      "id": "on_play_search",
      "category": "auto",
      "trigger": { "keyword": "ON_PLAY" },
      "actions": [
        {
          "type": "SEARCH_DECK",
          "params": {
            "look_at": 5,
            "pick": { "up_to": 1 },
            "filter": {
              "traits": ["Straw Hat Crew"],
              "exclude_name": "Nami"
            },
            "rest_destination": "BOTTOM"
          }
        }
      ]
    }
  ]
}
```

### Batch (Set)

Output as a JSON array. One object per card that has effects. Omit vanilla cards (no effect text).

```json
[
  {
    "card_id": "EB03-001",
    "card_name": "Nefeltari Vivi",
    "effects": [ ... ]
  },
  {
    "card_id": "EB03-003",
    "card_name": "Uta",
    "effects": [ ... ]
  }
]
```

For batch mode, process cards in the order they appear in the set file. After encoding each card, run the validation checklist (Step 5) before moving to the next.

---

## Common Pitfalls

These are the most frequent encoding errors. Review this list before and after encoding.

### KO vs TRASH_CARD

- `KO` is an action that triggers `[On K.O.]` effects on the destroyed card. Use for "K.O. up to 1 of your opponent's Characters."
- `TRASH_CARD` removes a card without triggering K.O. effects. Use for "trash 1 card from your hand" or "trash 1 card from the top of your deck."
- If the card text says "K.O.", use `KO`. If it says "trash", use `TRASH_CARD` or `MILL` (for top-of-deck).

### THEN is Not Conditional

- "Then," in card text maps to `chain: "THEN"`. The action after THEN always executes regardless of whether the preceding action succeeded or found targets.
- "If you do," maps to `chain: "IF_DO"`. This IS conditional on the prior action succeeding.
- Do not confuse the two. THEN is unconditional; IF_DO is conditional.

### Once Per Turn is a Flag

- `[Once Per Turn]` goes in `flags.once_per_turn: true`. It is NOT a condition and NOT a separate effect block.
- It always appears alongside another trigger or timing tag.

### Optional Scope

- "You may" at the start of the whole effect (or on the cost) means `flags.optional: true` on the block.
- "You may" on a specific action within a chain means that individual action is optional. Other actions in the chain are unaffected.
- Do not put block-level optional on the flags when only one action in a multi-action chain is optional.

### Keywords are Flags, Not Action Blocks

- `[Blocker]`, `[Rush]`, `[Double Attack]`, `[Banish]`, `[Strike]` go in a permanent block with `flags.keywords: ["BLOCKER"]` (or the relevant keyword).
- Do NOT encode them as auto blocks with actions. They have no trigger and no action — they are intrinsic properties.
- The reminder text in parentheses after a keyword is documentation. Ignore it.

### "Up to 0" is Valid

- `{ "up_to": 0 }` means the player can legally choose no targets. This is valid and intentional.
- Do not "correct" this to `{ "up_to": 1 }` or remove the action.

### Reminder Text

- Text in parentheses after a keyword explains what the keyword does. It is NOT a separate effect.
- Example: `[Rush] (This card can attack on the turn in which it is played.)` — encode only the `RUSH` keyword. The parenthetical adds nothing to the schema.

### Base vs Current Filters

- "base cost of 4 or more" uses `base_cost_min: 4` — checks the printed cost on the card.
- "cost of 4 or more" uses `cost_min: 4` — checks the current in-game cost (which may have been modified).
- "base power of 6000 or less" uses `base_power_max: 6000`.
- "6000 power or less" uses `power_max: 6000`.
- The "base" prefix matters. Do not omit it.

### MILL vs TRASH_CARD for Deck

- "Trash N cards from the top of your deck" is `MILL` (always takes from top, no target selection).
- `TRASH_CARD` requires a target — the player selects which card to trash.
- Use `MILL` when the source is the top of the deck and no selection is involved.

### Event Card Triggers

- Event cards played from hand during Main Phase use trigger keyword `MAIN_EVENT`, not `ACTIVATE_MAIN`.
- `ACTIVATE_MAIN` is for Characters, Leaders, and Stages with `[Activate: Main]`.
- `MAIN_EVENT` is for Events with `[Main]` or the `Effect:` header.
- `TRIGGER` is for the Trigger Effect on Events (revealed from Life).

### Costs Use the Colon

- In OPTCG card text, the colon (`:`) separates cost from effect.
- Everything before the colon is a cost. Everything after is the effect.
- Example: "You may trash 1 card from your hand: Draw 2 cards." — the trash is a cost, the draw is the action.

### Trait Filters: `traits` vs `traits_contains`

These are **different operations** — use the one that matches the card text:

- **`{Whitebeard Pirates} type`** (curly braces) → `traits: ["Whitebeard Pirates"]` — **exact match**. One of the card's traits must exactly equal the string. A card with trait "Former Whitebeard Pirates" does NOT match.
- **`type including "Whitebeard Pirates"`** or **`type includes "CP"`** → `traits_contains: ["Whitebeard Pirates"]` — **substring match**. One of the card's traits must contain the string. A card with trait "CP9" DOES match `traits_contains: ["CP"]`.

The same distinction applies to LEADER_PROPERTY conditions:
- "has the {Baroque Works} type" → `property: { trait: "Baroque Works" }` (exact)
- "Leader's type includes 'Baroque Works'" → `property: { trait_contains: "Baroque Works" }` (substring)

**Do NOT use `traits_contains` when the card text uses `{X} type` notation.** Only use it for explicit "type including" / "type includes" wording.

### "Play this card" Trigger Effects

- When a Trigger effect says `[Trigger] Play this card.`, encode as: `{ type: "PLAY_SELF" }` action with trigger `{ keyword: "TRIGGER" }`.
- `PLAY_SELF` means the card plays itself from wherever it is (typically from Life after Trigger reveal).

### Life Card Manipulation

- "Look at up to 1 card from the top of your or opponent's Life cards, and place it at the top or bottom" uses `LIFE_SCRY` action.
- "Add up to 1 card from the top of your deck to the top of your Life cards" uses `ADD_TO_LIFE_FROM_DECK` with `position: "TOP"`.
- "Trash up to 1 card from the top of your opponent's Life cards" uses `TRASH_FROM_LIFE` on opponent's life.
- "You may add 1 card from the top or bottom of your Life cards to your hand" is a `LIFE_TO_HAND` cost with `position: "TOP_OR_BOTTOM"`.
- "Add Character to Life cards face-up" uses `ADD_TO_LIFE_FROM_FIELD` with `face: "UP"`.

### "Win Instead of Losing" Rule Modifications

- Cards like "When your deck is reduced to 0, you win the game instead of losing" use `rule_modification` category with `LOSS_CONDITION_MOD`:
  ```json
  { "rule_type": "LOSS_CONDITION_MOD", "trigger_event": "DECK_OUT", "modification": "WIN_INSTEAD" }
  ```

### DON!! −N (Return to Deck) as Cost

- "DON!! −N" in card text (often with parenthetical explanation) is a cost: `{ type: "DON_MINUS", amount: N }`.
- The `flags.optional` should be set if the DON!! cost is optional (preceded by "You may").

### "Activate this card's [Main] effect" Trigger

- Common Trigger effect pattern. Uses `REUSE_EFFECT` action with `{ target_effect: "MAIN_EVENT" }`.

---

## Edge Case Handling

1. **Pattern not in encoding guide:** Consult the full spec file for that component type (02-TRIGGERS, 03-CONDITIONS, 04-ACTIONS, 05-TARGETING, 06-PROHIBITIONS, 07-RULE-MODIFICATIONS, 10-KEYWORDS).
2. **Pattern not in any spec file:** Flag it as a spec gap. Encode your best interpretation and include a `"_comment"` field on the block explaining the gap:
   ```json
   {
     "id": "unrecognized_pattern",
     "_comment": "SPEC GAP: 'whenever this card is returned to your hand' has no matching trigger. Encoded as custom trigger RETURNED_TO_HAND.",
     ...
   }
   ```
3. **Ambiguous text:** If the card text could mean two different things, encode the more common interpretation and note the ambiguity in a `"_comment"` field.
4. **Complex choice structures:** "Choose one" with multiple branches uses `PLAYER_CHOICE`. "Your opponent chooses one" uses `OPPONENT_CHOICE`. Each branch is an array of actions.
5. **Self-referencing effects:** "this Character" or "this Leader" as a target uses `target.type: "SELF"`. Do not create a filter to find the card by name.

---

## Quality Checks

Run these after completing all encodings (single or batch). These are post-encoding verification steps, separate from the per-block validation in Step 5.

1. **Block count matches text** — The number of EffectBlocks equals the number of independent effect paragraphs on the card. No missing blocks, no phantom blocks.
2. **Text-order preservation** — Blocks appear in the same top-to-bottom order as printed on the card (per comprehensive rules 2-8-3).
3. **No duplicate IDs** — Across all blocks on a card, every `id` is unique. In batch mode, IDs must be unique within each card (not globally).
4. **Consistent controller perspective** — All targets use `SELF`/`OPPONENT` relative to the card's controller. Never use absolute player references.
5. **Cross-reference integrity** — Every `target_ref` has a matching `result_ref` in a prior action. Every `result_ref` is referenced by exactly one later action.
6. **No orphaned durations** — If an action has a `duration`, the action type supports temporal effects (e.g., `MODIFY_POWER`, `GRANT_KEYWORD`, `APPLY_PROHIBITION`). Actions like `DRAW`, `KO`, `TRASH_CARD` are instantaneous and should not have durations.
7. **Batch completeness** — In batch mode, verify every non-vanilla card in the set file produced an encoding. Report any cards that were skipped and why.

---

## Batch Mode Workflow

When processing a full set file:

1. Read the set file at `docs/cards/<SET>.md`.
2. Parse the file to extract all cards. Each card entry has a heading (card name), a bold card ID line with type and color metadata (e.g., `**EB03-001** · Leader · Red/Blue`), and effect text. Cards are separated by `---` dividers. Use the type and color from this line — do not query the database.
3. Skip cards with no effect text (vanilla cards).
4. For each card with effects:
   a. Run the full encoding process (Steps 1-5).
   b. Append the result to the output array.
5. After all cards are encoded, run the batch quality checks.
6. Output the complete JSON array.

For large sets (50+ cards), process in chunks of 10-15 cards and present intermediate results to the user for review before continuing.
