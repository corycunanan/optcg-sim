# Set Encoding Prompt

> Replace `{SET}` with the set code (e.g., `OP05`) and `{set}` with lowercase (e.g., `op05`).

> Ex prompt: Follow the instructions in docs/encoding/ENCODING-PROMPT.md. The set is OP05.

---

Encode all {SET} card effects. Follow this workflow exactly.

## Phase 1: Pre-checks

Run all three checks and share results before proceeding:

```
node workers/game/src/engine/schemas/check-card-text.sh docs/cards/{SET}.md
node workers/game/src/engine/schemas/pre-scan.sh docs/cards/{SET}.md
node workers/game/src/engine/schemas/check-doc-drift.sh
```

- **check-card-text**: If it flags truncated text, encode those cards with a `_comment` field noting the gap.
- **pre-scan**: If it flags deferred patterns, skip those cards and append them to `docs/game-engine/DEFERRED-CARD-EFFECTS.md`.
- **check-doc-drift**: If drift detected, fix the README before encoding.

## Phase 2: Context loading

Read these files before encoding any card:

1. `workers/game/src/engine/effect-types.ts` — **source of truth** for all valid enum values
2. `workers/game/src/engine/schemas/README.md` — authoring guide with catalogs and examples
3. `docs/game-engine/11-ENCODING-GUIDE.md` — pattern-matching tables
4. `docs/game-engine/09-EXAMPLE-ENCODINGS.md` — annotated reference encodings
5. `docs/cards/{SET}.md` — the card text to encode

### Card text source

**`docs/cards/{SET}.md` is the encoding source of truth for card effect text.** These files contain cleaned, human-readable effect text derived from the official card data. Do not query the PostgreSQL database for card text — the markdown files are authoritative for encoding and are validated by the pre-check scripts in Phase 1. The database `Card.effectText` field contains the same text but lacks the structured format (card name, ID grouping) that the pre-check tooling and encoding workflow depend on.

## Phase 3: Encode by color group (parallel) → merge into single file

Output is a **single file** per set: `workers/game/src/engine/schemas/{set}.ts`

**Parallel workflow:** Launch one agent per color group. Each agent encodes its color's cards and returns a block of schema constants. After all agents complete, merge all blocks into a single `{set}.ts` file **ordered by card ID** (ascending numeric).

### Single-file structure

```ts
/**
 * {SET} Effect Schemas
 *
 * Red ({Theme}): {SET}-001 to {SET}-0XX
 * Green ({Theme}): {SET}-0XX to {SET}-0XX
 * Blue ({Theme}): {SET}-0XX to {SET}-0XX
 * Purple ({Theme}): {SET}-0XX to {SET}-0XX
 * Black ({Theme}): {SET}-0XX to {SET}-0XX
 * Yellow ({Theme}): {SET}-0XX to {SET}-0XX
 */

import type { EffectSchema } from "../effect-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RED — {Theme} ({SET}-001 to {SET}-0XX)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── {SET}-001 Card Name (Type) — brief description
// Full effect text from docs/cards/{SET}.md

export const {SET}_001_CARD_NAME: EffectSchema = {
  card_id: "{SET}-001",
  card_name: "Card Name",
  card_type: "Leader",      // "Leader" | "Character" | "Event" | "Stage"
  effects: [ ... ],
};

// ... cards continue in card ID order through all colors ...

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const {SET}_SCHEMAS: Record<string, EffectSchema> = {
  "{SET}-001": {SET}_001_CARD_NAME,
  // ... all non-vanilla cards, keyed by card_id
};
```

### Per-card requirements

- `import type { EffectSchema } from "../effect-types.js";` — single import at top of file
- Export individual card constants: `export const {SET}_001_NAME: EffectSchema = { ... };`
- Each card gets a comment header: color section divider, card name + full effect text
- Skip vanilla cards (no effect text)
- Cards within each color section are ordered by card ID
- Color sections appear in order: Red → Green → Blue → Purple → Black → Yellow
- Multi-color cards go under their **first listed color** (e.g., Red/Green → Red section)

### Registry record

The file ends with a single `{SET}_SCHEMAS: Record<string, EffectSchema>` that maps every card ID to its constant. This is what `schema-registry.ts` imports.

### Critical requirements

- Every `EffectSchema` must have `card_id`, `card_name`, and `card_type` — the registry keys on `card_id`
- The `{SET}_SCHEMAS` record must be `Record<string, EffectSchema>` keyed by card ID
- Import uses `.js` extension (ESM resolution in the Cloudflare Worker)
- Constant names follow `{SET}_NNN_CARD_NAME` — set prefix, three-digit number, uppercase snake_case name
- Use `op01.ts`, `op02.ts`, or `op04.ts` as reference implementations for the single-file layout

### Encoding rules

**Traits — match the card text exactly:**

- `{Whitebeard Pirates} type` (curly braces) → `traits: ["Whitebeard Pirates"]` — **exact match** per trait
- `type including "CP"` / `type includes "CP"` → `traits_contains: ["CP"]` — **substring match**
- Same for LEADER_PROPERTY: `{X} type` → `trait: "X"`, `type includes "X"` → `trait_contains: "X"`
- **Never use `traits_contains` for `{X} type` card text.**

**Triggers — match card type:**

- Characters/Leaders with `[Activate: Main]` → `ACTIVATE_MAIN`
- Events with `[Main]` → `MAIN_EVENT`, category `"activate"`
- Characters with `[Counter]` → `COUNTER`
- Events with `[Counter]` → `COUNTER_EVENT`

**Costs vs actions:**

- Text before `:` is a cost, after is an action
- `[Blocker]`/`[Rush]`/`[Double Attack]`/`[Banish]` → permanent block with `flags.keywords` (NOT action blocks)

**Common patterns:**

- `[Trigger] Play this card` → `PLAY_SELF` action
- `Activate this card's [Main] effect` → `REUSE_EFFECT` with `target_effect: "MAIN_EVENT"`
- `trash N from top of deck` → `MILL` (not `TRASH_CARD`)
- Chain connectors: `THEN` for "Then,", `IF_DO` for "If you do,", `AND` for simultaneous
- `"base cost of N"` → `base_cost_*` filters; `"cost of N"` → `cost_*` filters

**Durations:**

- Instantaneous actions (DRAW, KO, MILL, PLAY_CARD, etc.) must NOT have duration
- MODIFY_POWER, MODIFY_COST, GRANT_KEYWORD in auto/activate blocks SHOULD have duration
- `THIS_BATTLE` only valid with battle-scoped triggers (WHEN_ATTACKING, ON_OPPONENT_ATTACK, ON_BLOCK, COUNTER, COUNTER_EVENT)

**Verify all enum values against effect-types.ts** — not the docs.

## Phase 4: Register and validate

1. Update `workers/game/src/engine/schema-registry.ts`:
   - Add import: `import { {SET}_SCHEMAS } from "./schemas/{set}.js";`
   - Add to AUTHORED_SCHEMAS: `...{SET}_SCHEMAS,`
2. Type-check: `cd workers/game && npx tsc --noEmit`
3. Lint: `node workers/game/src/engine/schemas/lint-schemas.sh workers/game/src/engine/schemas/{set}.ts`
4. Fix any errors from tsc or linter. Warnings are acceptable if justified.

## Phase 5: Summary

Report:

- Total cards encoded per color group
- Cards skipped (vanilla)
- Cards deferred (from pre-scan)
- Linter results (errors fixed, warnings accepted with reason)
