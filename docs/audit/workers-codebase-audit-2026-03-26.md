# Codebase Audit Report: `workers/`

**Scope:** `workers/game/` and `workers/images/`
**Date:** 2026-03-26
**Baseline:** 32 source files (~9,800 lines engine + 800 lines GameSession + 132 test cases), 4 dev dependencies

---

## Executive Summary

- **Total issues:** 18 (1 critical, 4 high, 8 medium, 5 low)
- **Top 3 issues:**
  1. `effect-resolver.ts` is 3,843 lines — a god file handling 50+ action types in one switch statement
  2. 80 `as any` / `: any` casts across 10 files erode type safety
  3. `op02.ts` (3,603 lines of authored schemas) was orphaned — not registered in the schema registry
- **Overall health:** **Minor concerns** — Clean architecture with strong foundations, but the effect resolver is a scaling bottleneck
- **Immediate actions taken:** Items 1-5 resolved in this session (see Resolved Items below)

---

## Resolved Items

The following issues were fixed as part of this audit session:

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | OP02 schemas orphaned from runtime registry | Added `OP02_SCHEMAS` export to `op02.ts`, imported in `schema-registry.ts` (98 cards) |
| 2 | 8 debug `console.log` statements in production engine | Removed from `pipeline.ts` (6) and `effect-resolver.ts` (2); kept `console.warn` in schema-registry |
| 3 | `findCardInstance` duplicated in 4 files | Extracted to `state.ts`; replaced local copies in `triggers.ts`, `replacements.ts`, `effect-resolver.ts`, `pipeline.ts` |
| 4 | `Env` interface duplicated in `index.ts` and `GameSession.ts` | Moved to `types.ts`; both files now import |
| 5 | Auth utilities mixed into GameSession.ts | Extracted `verifyGameToken` + `base64urlDecode` to `util/auth.ts` |

---

## Remaining Findings by Severity

### Critical

**MOD-1 | `effect-resolver.ts` is 3,843 lines (12x the C-1-1 limit)**
- **Location:** `workers/game/src/engine/effect-resolver.ts`
- **Rule:** C-1-1 (files should stay under ~300 lines)
- **Impact:** Adding any new action type requires modifying a single massive file. `executeEffectAction` is a ~2,500-line switch with 50+ cases — untestable in isolation, high merge-conflict risk, slow to navigate.
- **Recommendation:** Decompose into:
  - `action-executor/` directory with one file per action category (draw-actions.ts, power-actions.ts, don-actions.ts, life-actions.ts, etc.)
  - `cost-resolver.ts` — cost payment + target computation (~400 lines)
  - `effect-resolver.ts` — slim orchestrator that dispatches to action handlers (~300 lines)

### High

**TYPE-1 | 80 `as any` / `: any` casts across production and test code**
- **Location:** `effect-resolver.ts` (34), `modifiers.ts` (8), `duration-tracker.ts` (7), `triggers.ts` (3), `effect-engine.test.ts` (21), 5 other files
- **Rule:** E-2 (immutability implies type correctness)
- **Impact:** Silently bypasses the type checker at runtime boundaries. The casts in `modifiers.ts` (filter property access via `as any`) and `triggers.ts` (registry insertion via `as any`) are particularly dangerous — they could mask breaking changes in the shared type layer.
- **Evidence:** `(filter as any).costMax`, `(filter as any).traits`, `...newEffects as any`, `...newTriggers as any`
- **Recommendation:** Create typed helper functions and proper type guards. For the shared/worker type boundary (EffectStackFrame, RegisteredTrigger), create explicit conversion functions instead of casting through `unknown`.

### Medium

**MOD-3 | `GameSession.ts` is 755 lines mixing transport, auth, and orchestration**
- **Location:** `workers/game/src/GameSession.ts`
- **Rule:** C-1-1
- **Impact:** The Durable Object class handles WebSocket routing, alarm scheduling, state persistence, prompt routing, and game orchestration. Any change to one concern risks touching others.
- **Recommendation:** Consider extracting prompt routing into a separate module.

**TYPE-2 | 7 `as unknown as` double-casts at shared/worker type boundary**
- **Location:** `GameSession.ts:444,454,473`, `effect-stack.ts:32`, `effect-resolver.ts:3689`, `replacements.ts:165,453`
- **Impact:** Double-casting (`as unknown as X`) is the most dangerous cast pattern — it tells TypeScript "trust me completely." These occur at the boundary between the shared `unknown`-typed EffectStackFrame and the worker's fully-typed version. A structural change in either side won't produce a type error.
- **Recommendation:** Create explicit conversion functions: `toWorkerFrame(shared: SharedEffectStackFrame): EffectStackFrame` with runtime field checks.

**MOD-4 | `conditions.ts` at 560 lines — large but cohesive**
- **Location:** `workers/game/src/engine/conditions.ts`
- **Rule:** C-1-1
- **Impact:** Lower risk than effect-resolver because the file has clear internal structure (one function per condition type). But at nearly 2x the recommended limit, it will become harder to navigate as new condition types are added.
- **Recommendation:** Monitor. If it crosses ~700 lines, consider splitting by condition category (numeric conditions, zone conditions, state conditions).

**SCALE-3 | `injectSchemasIntoCardDb` mutates the input Map**
- **Location:** `schema-registry.ts:38-51`
- **Rule:** E-1-1 (all engine functions are pure)
- **Impact:** `cardDb.set(cardId, ...)` mutates the Map in place. While this is called during init (not mid-game), it breaks the immutability contract that the rest of the engine follows.
- **Recommendation:** Either return a new Map or document this as an intentional init-time exception to E-1.

**TYPE-3 | `action.params` is `Record<string, any>` — root cause of most casts**
- **Location:** `effect-types.ts:484-493` (Action interface)
- **Impact:** Every action handler in `effect-resolver.ts` must cast `action.params` to access typed fields. This is the upstream cause of ~30 of the 80 `as any` casts.
- **Recommendation:** Use discriminated union for params: `type Action = DrawAction | ModifyPowerAction | ...` where each variant has strongly-typed params. This is a larger refactor but eliminates the most casts.

**CONS-1 | `broadcastExcept` is defined but used only once**
- **Location:** `GameSession.ts:646-654`, called at lines 700-701
- **Impact:** Minor — method exists for a single use case.

### Low

**HYGI-1 | No TODO/FIXME/HACK comments**
- **Impact:** Positive signal — code is clean.

**HYGI-2 | No commented-out code blocks**
- **Impact:** Positive — git is used for history, not comments.

**CONS-2 | `void code; void reason;` in `webSocketClose`**
- **Location:** `GameSession.ts:254-255`
- **Impact:** Cosmetic — consider using `_code`/`_reason` prefix convention instead.

**MOD-5 | `nanoid` dependency vendored instead of imported**
- **Location:** `workers/game/src/util/nanoid.ts`
- **Impact:** The vendored version uses modulo bias (`b % chars.length`), which slightly reduces randomness uniformity. Low risk for non-security IDs.

**REUSE-2 | Schema files don't share validation/construction helpers**
- **Location:** `schemas/op01.ts` (2,862 lines), `schemas/op02.ts` (3,603 lines), `schemas/ace-deck.ts` (705 lines), `schemas/nami-deck.ts` (614 lines)
- **Impact:** Common patterns (e.g., BLOCKER permanent blocks, basic DRAW actions) could use shared builder functions to reduce verbosity.
- **Recommendation:** Optional — builder helpers would reduce schema file sizes by ~30% but add indirection.

---

## Findings by Dimension

### Modularity — 4/5

**Strengths:** Clean DAG dependency graph with no circular imports. Well-layered: types -> pure functions -> orchestrator. Worker/app boundary fully isolated.

**Issues:** effect-resolver.ts god file (MOD-1), GameSession mixing concerns (MOD-3).

### Reusability — 4/5 (improved from 3.5)

**Strengths:** Shared types package works well. Test helpers are comprehensive and all actively used. State mutation helpers in `state.ts` are a clean reusable API. `findCardInstance` now consolidated (was duplicated 4x).

**Remaining issues:** Schema files could share builders (REUSE-2).

### Scalability — 4/5 (improved from 3.5)

**Strengths:** Immutable state architecture scales well. Pipeline's 7-step design is extensible. Schema validation catches errors at init. OP02 schemas now registered (was orphaned).

**Remaining issues:** Mutable cardDb injection (SCALE-3).

### Type Safety — 3/5

**Strengths:** `tsconfig.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`. Shared types use `unknown` instead of `any`. Zero `any` in shared layer.

**Issues:** 80 `as any` casts in worker code (TYPE-1). 7 `as unknown as` double-casts (TYPE-2). `Action.params` is `Record<string, any>` — root cause (TYPE-3).

### Dead Code — 5/5 (improved from 4.5)

**Strengths:** No commented-out code. No TODO/FIXME. All test helpers used. No orphaned source files. OP02 schemas now registered.

### Consistency — 4.5/5

**Strengths:** Uniform immutable state pattern across all engine files. Consistent function signatures (`state -> newState`). Test organization follows T-3 rules. No naming convention violations. `Env` interface now single-sourced.

---

## Positive Findings

1. **Zero circular dependencies** — The engine has a clean, layered DAG. This is rare for a codebase of this complexity.
2. **Immutability discipline** — Every state mutation goes through spread operators. `moveCard()` is the single choke point for zone transitions, exactly as E-4 requires.
3. **132 well-organized tests** — Unit, pipeline, effect-engine, and new-actions tests are properly separated per T-3. All test helpers are actively used.
4. **Shared type boundary** — The `shared/game-types.ts` -> `workers/game/src/types.ts` layering is clean. No boundary violations.
5. **Schema validation at init** — `validateEffectSchema` catches malformed card schemas before runtime.
6. **Worker isolation** — No imports from `src/` into `workers/`. No imports from `workers/` into `src/`.

---

## Recommendations by Priority

### Medium-term (next sprint)
1. **Decompose `effect-resolver.ts`** — Split into action executor directory with category-based files. Highest-leverage refactor for developer velocity.
2. **Type the Action params** — Convert `Action.params: Record<string, any>` to a discriminated union. Eliminates ~30 of 80 `as any` casts.

### Long-term (roadmap)
3. **Type the shared/worker boundary** — Create explicit conversion functions for EffectStackFrame and RegisteredTrigger instead of `as unknown as` casts.
4. **Schema builder helpers** — Optional DX improvement for authoring new card schemas.
