# Semantic Schema Linter — Requirements

> Item 6 from encoding process improvements. A linter that catches encoding errors the TypeScript compiler and `validateEffectSchema()` cannot.

## Problem

TypeScript type-checks the shape of schemas but cannot validate semantic correctness — whether the encoded schema accurately represents the card text. The existing `validateEffectSchema()` in `schema-registry.ts` checks structural requirements (unique IDs, category-required fields, valid action types) but misses a class of bugs where the schema is structurally valid but semantically wrong.

Examples of bugs this would catch:
- `traits: ["Whitebeard Pirates"]` when card text says "type including" (should be `traits_contains`)
- Missing `chain: "THEN"` when card text has "Then,"
- `TRASH_CARD` used for "trash from top of deck" (should be `MILL`)
- `MODIFY_POWER` with `duration: { type: "THIS_TURN" }` on an action like `DRAW` (instantaneous actions don't have durations)
- `GRANT_KEYWORD` as a standalone action block instead of `flags.keywords` on a permanent block

## Scope

A Node script at `workers/game/src/engine/schemas/lint-schemas.sh` that:
1. Reads all schema files in the `schemas/` directory
2. Runs semantic rules against each card's `EffectSchema`
3. Reports warnings (possible issue) and errors (definite bug)
4. Exits with code 1 if any errors found

## Rules

### Category A: Cross-Field Consistency (errors)

These rules flag definite structural mismatches.

| ID | Rule | What it catches |
|----|------|-----------------|
| A1 | `replacement` blocks must not have `trigger` or `actions` | Misclassified replacement effects |
| A2 | `rule_modification` blocks must not have `trigger`, `actions`, `modifiers`, or `prohibitions` | Misclassified rule mods |
| A3 | `permanent` blocks must not have `trigger` or `actions` | Permanent effects with triggers belong in `auto` |
| A4 | `auto`/`activate` blocks must not have `modifiers` or `prohibitions` | Should be in a separate permanent block |
| A5 | First action in a chain must not have `chain` field | Chain connector is only on subsequent actions |
| A6 | `result_ref` must be referenced by a later `target_ref` (and vice versa) | Orphaned refs |
| A7 | `PLAYER_CHOICE`/`OPPONENT_CHOICE` params.options must have 2+ branches | Single-branch choice is not a choice |

### Category B: Duration Correctness (errors)

| ID | Rule | What it catches |
|----|------|-----------------|
| B1 | Instantaneous actions must not have `duration` | DRAW, KO, TRASH_CARD, MILL, RETURN_TO_HAND, RETURN_TO_DECK, PLAY_CARD, TRASH_FROM_HAND, SEARCH_DECK, FULL_DECK_SEARCH, PLAY_SELF are instantaneous |
| B2 | `MODIFY_POWER`, `MODIFY_COST`, `GRANT_KEYWORD`, `APPLY_PROHIBITION` should have `duration` when in `auto`/`activate` blocks | Missing duration defaults to permanent, which is rarely intended in triggered effects |
| B3 | `THIS_BATTLE` duration only valid on actions within battle-scoped triggers (`WHEN_ATTACKING`, `ON_OPPONENT_ATTACK`, `ON_BLOCK`, `COUNTER`, `COUNTER_EVENT`) | THIS_BATTLE outside battle context |

### Category C: Filter Semantics (warnings)

These flag likely encoding errors based on common mistakes.

| ID | Rule | What it catches |
|----|------|-----------------|
| ~~C1~~ | **Retired.** `traits` vs `traits_contains` depends on card text wording (`{X} type` = exact match via `traits`, `type including X` = substring via `traits_contains`). The linter cannot determine the correct choice without card text. | N/A |
| C2 | `base_cost_*` and `cost_*` both set on the same filter | Conflicting cost filters |
| C3 | `base_power_*` and `power_*` both set on the same filter | Conflicting power filters |
| C4 | `exclude_self: true` on a target that is not `CHARACTER` with `controller: "SELF"` or `"EITHER"` | Exclude self is meaningless on opponent-only targets |

### Category D: Trigger/Action Mismatches (warnings)

| ID | Rule | What it catches |
|----|------|-----------------|
| D1 | `ACTIVATE_MAIN` trigger on Event cards (should be `MAIN_EVENT`) | Wrong trigger for card type |
| D2 | `MAIN_EVENT` trigger on non-Event cards (should be `ACTIVATE_MAIN`) | Wrong trigger for card type |
| D3 | `COUNTER_EVENT` trigger on non-Event cards (should be `COUNTER`) | Wrong trigger for card type |
| D4 | `SET_REST` action targeting opponent's Character without `controller: "OPPONENT"` | Missing controller |
| D5 | `KO` action without `target` | KO must have a target |

### Category E: Cost vs Action Confusion (warnings)

| ID | Rule | What it catches |
|----|------|-----------------|
| E1 | `TRASH_FROM_HAND` as an action when it appears first in the chain and the next action has `chain: "IF_DO"` | Likely a cost, not an action |
| E2 | `REST_SELF` as an action (not cost) in an `activate` block | Rest-self before colon is a cost |
| E3 | `DON_MINUS` as an action type (doesn't exist) — check for misspelled cost-as-action | Cost type used where action type expected |

### Category F: Enum Validation (errors)

Validate enums not currently checked by `validateEffectSchema()`.

| ID | Rule | What it catches |
|----|------|-----------------|
| F1 | Trigger `keyword` values must be valid `KeywordTriggerType` | Typos in trigger keywords |
| F2 | Trigger `event` values must be valid `CustomEventType` | Typos in custom events |
| F3 | Cost `type` values must be valid `CostType` | Invalid cost types |
| F4 | Condition `type` values must be valid `SimpleCondition` type discriminants | Invalid condition types |
| F5 | Duration `type` values must be valid | Invalid duration types |
| F6 | Target `type` values must be valid `TargetType` | Invalid target types |
| F7 | `flags.keywords` values must be valid `Keyword` | Invalid keyword values |
| F8 | Prohibition `type` values must be valid `ProhibitionType` | Invalid prohibition types |

## Implementation Notes

### Extracting valid enums

Import or parse `effect-types.ts` to get valid enum values. The drift detector (`check-doc-drift.sh`) already has regex extraction logic for type unions — reuse the `extractUnionMembers()` approach.

### Card type awareness

Rules D1-D3 need to know the card type. The schema has `card_type` as an optional field. If absent, skip those rules rather than false-positive.

### Running against existing schemas

The linter should be runnable against individual files or the whole `schemas/` directory:

```
node lint-schemas.sh                              # lint all schemas
node lint-schemas.sh schemas/op03/red.ts          # lint one file
```

### Output format

```
[ERROR] OP03-013 effect "on_ko_play_from_trash": B2 — PLAY_CARD in auto block missing duration
[WARN]  OP03-080 effect "on_play_ko": C2 — Filter has both base_cost and cost filters on KO
```

### Integration with encoding workflow

Add to the SKILL.md encoding process as a post-encoding validation step:
```
node workers/game/src/engine/schemas/lint-schemas.sh schemas/op03/
```

### What NOT to duplicate

The following are already validated by `validateEffectSchema()` — do not re-implement:
- Block ID uniqueness
- Category field presence and validity
- Category-required fields (trigger+actions for auto, modifiers/prohibitions for permanent, etc.)
- Action type validity (VALID_ACTION_TYPES set)
- Nested action validation in PLAYER_CHOICE/OPPONENT_CHOICE/OPPONENT_ACTION/SCHEDULE_ACTION

## Priority

Rules should be implemented in this order based on impact:
1. **Category F** (enum validation) — catches typos, high confidence, no false positives
2. **Category A** (cross-field) — catches misclassifications, high confidence
3. **Category B** (durations) — catches the most common encoding error
4. **Category D** (trigger/action mismatches) — catches card-type confusion
5. **Category C** (filter semantics) — catches traits/traits_contains, moderate false positive rate
6. **Category E** (cost vs action) — catches subtle errors, higher false positive rate
