# Set Encoding Prompt

> Replace `{SET}` with the set code (e.g., `OP05`) and `{set}` with lowercase (e.g., `op05`).

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

## Phase 3: Encode by color group (parallel)

Create per-color files under `workers/game/src/engine/schemas/{set}/`:

```
{set}/red.ts
{set}/green.ts
{set}/blue.ts
{set}/purple.ts
{set}/black.ts
{set}/yellow.ts
{set}/index.ts    — barrel: imports color arrays, exports {SET}_SCHEMAS record
```

Each color file:

- `import type { EffectSchema } from "../../effect-types.js";`
- Export individual card constants: `export const {SET}_001_NAME: EffectSchema = { ... };`
- Export color array: `export const {SET}_RED_SCHEMAS: EffectSchema[] = [...];`
- Each card gets a comment header with card name + effect text
- Skip vanilla cards (no effect text)

**Launch one agent per color group in parallel.** Each writes to its own file — no collisions.

### Encoding rules

**Traits — match the card text exactly:**

- `{Whitebeard Pirates} type` (curly braces) → `traits: ["Whitebeard Pirates"]` — **exact match** per trait
- `type including "CP"` / `type includes "CP"` → `traits_contains: ["CP"]` — **substring match**
- Same for LEADER_PROPERTY: `{X} type` → `trait: "X"`, `type includes "X"` → `trait_contains: "X"`
- **Never use `traits_contains` for `{X} type` card text.**

**Triggers — match card type:**

- Characters/Leaders with `[Activate: Main]` → `ACTIVATE_MAIN`
- Events with `[Main]` → `MAIN_EVENT`, category `"auto"`
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

1. Create the barrel `{set}/index.ts` following the pattern in `op03/index.ts`
2. Update `workers/game/src/engine/schema-registry.ts`:
   - Add import: `import { {SET}_SCHEMAS } from "./schemas/{set}/index.js";`
   - Add to AUTHORED_SCHEMAS: `...{SET}_SCHEMAS,`
3. Type-check: `cd workers/game && npx tsc --noEmit`
4. Lint: `node workers/game/src/engine/schemas/lint-schemas.sh workers/game/src/engine/schemas/{set}/`
5. Fix any errors from tsc or linter. Warnings are acceptable if justified.

## Phase 5: Summary

Report:

- Total cards encoded per color group
- Cards skipped (vanilla)
- Cards deferred (from pre-scan)
- Linter results (errors fixed, warnings accepted with reason)
