# Codebase Audit Report

**Scope:** Full codebase (src/, workers/, shared/, pipeline/)
**Focus:** Security, Performance, Scalability, Modularity, Agentic Readiness
**Date:** 2026-04-03
**Baseline:** 160 TS/TSX files in src/ (20,877 lines), 282 files in workers/, 8 in pipeline/. 26 deps, 14 devDeps.

---

## Executive Summary

- **Total issues:** 70 (3 critical, 16 high, 33 medium, 18 low/informational)
- **Top 3 issues:**
  1. **SEC-1:** Admin API routes (POST/PATCH cards) missing authorization checks — any authenticated user can modify card data
  2. **SCALE-1:** N+1 query in conversations endpoint — loops individual `prisma.message.count()` per conversation
  3. **TYPE-10:** All API routes accept request bodies without runtime validation (no Zod/schema validation)
- **Overall health:** **Needs Attention** — solid foundation with good patterns, but critical security gaps, missing runtime validation, and significant agentic documentation gaps
- **Recommended immediate actions:**
  1. Add auth checks to admin card endpoints (SEC-1)
  2. Introduce Zod for API request validation (TYPE-10, CONS-4, AGENT-3)
  3. Expand CLAUDE.md and .cursor/rules/ for agentic readiness (AGENT-1, AGENT-2, AGENT-11)

---

## Findings by Severity

### Critical (3)

| ID | Dimension | Location | Description |
|----|-----------|----------|-------------|
| **SEC-1** | Security | `src/app/api/cards/route.ts:131` (POST), `src/app/api/cards/[id]/route.ts:41` (PATCH) | Admin card endpoints have **no auth check**. Any authenticated user can create/modify cards. |
| **SCALE-1** | Scalability | `src/app/api/messages/conversations/route.ts:40-57` | N+1 query: `prisma.message.count()` called in a loop per conversation. 100 conversations = 101 DB calls. |
| **TYPE-10** | Type Safety | All `src/app/api/*/route.ts` POST handlers | Request bodies are destructured with `as { ... }` type assertions — no runtime validation. Malformed requests reach Prisma directly. |

### High (16)

| ID | Dimension | Location | Description |
|----|-----------|----------|-------------|
| **SEC-2** | Security | `src/app/api/cards/route.ts:27-50` | `parseInt()` on untrusted input without NaN validation; filter bypass risk |
| **SEC-4** | Security | All API routes | No rate limiting anywhere — brute-force, spam, DoS exposure |
| **MOD-1/2** | Modularity | `src/components/deck-builder/deck-builder-list.tsx:7`, `deck-builder-search.tsx:6` | Cross-feature import: deck-builder imports admin's `CardDetailModal` |
| **MOD-3** | Modularity | `src/components/game/board-layout/board-layout.tsx` (699 lines) | Monolithic component mixing zone positioning, drag-and-drop, modals, animations |
| **MOD-4** | Modularity | `src/components/ui/sidebar.tsx` (702 lines) | Oversized UI component; likely multiple components bundled |
| **MOD-5** | Modularity | `src/components/lobbies/lobbies-shell.tsx` (666 lines) | Large shell mixing data fetching, filtering, pagination, modals |
| **MOD-6** | Modularity | `src/components/deck-builder/deck-builder-shell.tsx` (331 lines) | Mixes data loading, validation, save ops, and tab layout |
| **REUSE-5** | Reusability | `src/hooks/use-game-session.ts:26-65` | Hook returns 23 values — violates single responsibility |
| **REUSE-12** | Reusability | Entire src/ | No centralized fetch wrapper despite 18+ direct fetch() calls |
| **CONC-1** | Concurrency | `src/app/api/lobbies/join/route.ts:122-145` | Race condition: lobby join uses 3 sequential writes with no transaction/mutex |
| **ERR-2** | Error Handling | `src/app/api/lobbies/join/route.ts:198-218` | Worker init failure leaves LobbyGuest + Lobby status inconsistent (partial rollback) |
| **SCALE-2** | Scalability | `src/app/api/decks/route.ts:17-25` | Unbounded DeckCard query with includes, no `take` limit |
| **TYPE-6** | Type Safety | `workers/game/src/engine/effect-resolver/actions/effects.ts` | Action params cast `as any` 50+ times across effect resolver |
| **CONS-1** | Consistency | `src/app/api/` | Success response shapes inconsistent: `{ data: T }` vs direct object vs raw array |
| **CONS-5** | Consistency | `src/app/api/` | Same error types use different HTTP status codes (404 vs 422 for not-found) |
| **CONS-9** | Consistency | Multiple components | Inline `style={{}}` for CSS variables, violating CLAUDE.md Rule #1 |

### Medium (33)

| ID | Dimension | Description |
|----|-----------|-------------|
| **SEC-3** | Security | Message body: no max-length validation (unbounded storage) |
| **SEC-5** | Security | CORS absent on Next.js API routes (defense-in-depth gap) |
| **SEC-6** | Security | Game result endpoint: Bearer token only, no replay protection |
| **MOD-7** | Modularity | `CardDetailModal` serves admin and deck-builder with brittle prop branching |
| **MOD-8** | Modularity | `card-browser.tsx` mixes filter state, pagination, navigation, data fetching |
| **MOD-9** | Modularity | `board-card.tsx` (304 lines) mixes card rendering with effect calculations |
| **MOD-10** | Modularity | `deck-builder-list.tsx` defines 3+ components + helpers in one file |
| **MOD-11** | Modularity | `use-game-session.ts` (384 lines) mixes WebSocket, card DB, player state, navigation |
| **MOD-12** | Modularity | `field-card.tsx` (405 lines) bundles multiple droppable zone components |
| **MOD-13** | Modularity | `deck-builder-search.tsx` mixes search logic with fetching and state |
| **MOD-14** | Modularity | `card-edit-form.tsx` (419 lines) mixes form state, validation, submission |
| **REUSE-1/2** | Reusability | `decodeHtmlEntities`, `stripVariantSuffix`, `cardIdToOriginSet` duplicated between src/lib/utils.ts and pipeline/transform.ts |
| **REUSE-3** | Reusability | 18 instances of inline fetch + error handling with different patterns |
| **REUSE-4** | Reusability | Animation/timing magic numbers hardcoded at point of use |
| **REUSE-6** | Reusability | useGameWs returns 7 values; pattern of oversized hook returns |
| **REUSE-7** | Reusability | Repeated (loading, error, submitting) state tuple across many components |
| **REUSE-8** | Reusability | Barrel export curation inconsistent (ui/ exports 40+, admin/ exports 8) |
| **REUSE-10** | Reusability | WebSocket reconnection logic not extractable/reusable |
| **SCALE-3** | Scalability | Admin dashboard runs `groupBy` on full Card table without caching |
| **SCALE-4** | Scalability | Lobby GET polls leader cards on every request (no caching) |
| **SCALE-5** | Scalability | Card search always includes artVariants + cardSets (over-fetching) |
| **CONC-2** | Concurrency | GameSession upsert blindly overwrites status on duplicate join |
| **TYPE-1** | Type Safety | 4x `as unknown as RuntimeEffect` casts in active-effects-context |
| **TYPE-3** | Type Safety | `(filter as any).prop` pattern repeated 10+ times in modifiers.ts |
| **TYPE-4** | Type Safety | Array filter results cast `as any` in duration-tracker (5 instances) |
| **TYPE-5** | Type Safety | GameSession/pipeline cast battle/frame state `as any` |
| **TYPE-7** | Type Safety | `GameEvent.payload` is `Record<string, unknown>` — should be discriminated union |
| **TYPE-8** | Type Safety | `PromptOptions` mixes 10+ unrelated optional fields (should be discriminated) |
| **TYPE-9** | Type Safety | `ActionType` (90+ string literals) lacks exhaustive switch checking |
| **TYPE-11** | Type Safety | WebSocket `ServerMessage` parsed from JSON without runtime validation |
| **TYPE-12** | Type Safety | `effectSchema` cast without runtime guard in triggers.ts |
| **CONS-7** | Consistency | 3 files in `src/components/home/` use PascalCase instead of kebab-case |
| **CONS-10** | Consistency | `text-[11px]` violates minimum text-xs rule (CLAUDE.md Rule #3) |

### Low / Informational (18)

| ID | Description |
|----|-------------|
| **MOD-15/16** | Context file mixes pure helpers; API route has inline data transformation |
| **REUSE-9/11/13** | Type duplication in API routes; validation messages hardcoded; constant naming inconsistent |
| **DEAD-1/2/3** | Unused exports in utils.ts; duplicate utils between src/ and pipeline/ |
| **DEAD-4** | 2 HACK schema implementations (OP10-051, OP12-089) in game engine |
| **DEAD-5** | 1 TODO without issue tracker reference |
| **DEAD-6** | 2 orphaned script files in scripts/ |
| **DEAD-9** | `cn` re-exported from ui/index.ts (redundant path) |
| **DEAD-10** | @aws-sdk/client-s3 devDependency only used in one pipeline script |
| **ERR-1** | console.error logs full stack in production (info disclosure via logs) |
| **MISC-1** | Environment variables not validated at startup |
| **Positive** | No console.log pollution; only 1 stale TODO in entire codebase; clean git hygiene |

---

## Findings by Dimension

### Modularity — 2/5

**Key issues:** 7 components exceed 300 lines (3 exceed 600). Cross-feature coupling between deck-builder and admin via shared `CardDetailModal`. Hooks (useGameSession at 384 lines, 23 return values) are monolithic. Utility functions live in component files instead of lib/.

**Systemic pattern:** Components grow organically without extraction. Data fetching, state management, and rendering are interleaved in the same files. No clear boundary between orchestration (shell) and presentation (leaf) components.

**What's working:** Feature directories are well-organized. Shared types live in `shared/game-types.ts` and `src/types/index.ts`. The reducer pattern in deck-builder state machine is clean.

### Reusability — 2.5/5

**Key issues:** No centralized fetch wrapper despite 18+ fetch calls. Identical utility functions duplicated between src/ and pipeline/. Hooks return too many values. Async operation state (loading/error/submitting) is reimplemented per component.

**Systemic pattern:** Missing "shared infrastructure" layer — no fetch wrapper, no async state helper, no centralized config for timing constants.

**What's working:** Design tokens are centralized in globals.css. Deck builder validation is well-extracted. UI component library (shadcn-based) is clean.

### Scalability & Security — 2/5

**Key issues:** Admin card endpoints have **no auth checks** (critical). N+1 query in conversations. No rate limiting. No runtime input validation (Zod). Race condition in lobby join. Unbounded queries without pagination limits.

**Systemic pattern:** Security and validation are handled ad-hoc per route rather than through middleware or shared patterns. No defense-in-depth layers.

**What's working:** Auth is properly checked on most routes. Error responses don't leak stack traces. Password hashing uses bcrypt. Worker-to-app communication uses shared secret.

### Type Safety — 2.5/5

**Key issues:** 50+ `as any` casts in the game engine effect resolver. No runtime validation at API boundaries. `GameEvent.payload` and `PromptOptions` should be discriminated unions. `effectSchema` JSON is cast without validation.

**Systemic pattern:** Type assertions are used as shortcuts when the type system is inconvenient, especially in the game engine's effect system. Runtime boundaries (API, WebSocket, JSON) lack validation.

**What's working:** TypeScript strict mode is enabled. Prisma generates strong types. Shared game types are well-defined. Most component props are properly typed.

### Dead Code & Hygiene — 4/5

**Key issues:** Minor — 2-3 unused exports, 2 HACK schemas, 2 orphaned scripts, 1 stale TODO. Duplicate utilities between src/ and pipeline/.

**What's working:** Remarkably clean. No console.log pollution. Only 1 TODO in entire codebase. No large blocks of commented-out code. Dependencies are lean and intentional.

### Consistency & Agentic Readiness — 2.5/5

**Key issues:** API response shapes are inconsistent (wrapped vs unwrapped). Error status codes vary for same error types. 3 files break naming conventions. Inline styles violate design system rules.

**Agentic gaps (critical):**
- CLAUDE.md missing API contracts, error conventions, auth patterns, naming conventions
- .cursor/rules/ has only 6 files (236 lines) — needs ~15-20 files covering API patterns, styling enforcement, error handling, async patterns
- No step-by-step checklists for common tasks (adding API endpoints, components, game effects)
- No centralized validation schemas (agents must reverse-engineer validation per route)
- Subdirectories lack README files
- shared/ package boundary undocumented
- No testing examples to demonstrate patterns

---

## Systemic Patterns

1. **Missing middleware layer:** Auth, validation, rate limiting, and error handling are reimplemented per route instead of shared through middleware or utility wrappers. This creates inconsistency and security gaps.

2. **Component growth without extraction:** Components start small, grow to 400-700 lines as features are added, with no triggering mechanism to decompose. Needs a "200-line checkpoint" discipline.

3. **Type safety shortcuts in game engine:** The effect system uses `as any` extensively because effect schemas come from JSON with complex, dynamic shapes. A Zod validation layer at the deserialization boundary would eliminate most of these.

4. **Documentation optimized for humans, not agents:** CLAUDE.md is good for developer orientation but lacks the machine-actionable patterns (checklists, schemas, strict conventions) that AI agents need to work independently.

---

## Positive Findings

- **Clean git hygiene:** All branches merged to main. Atomic commit discipline visible in history.
- **Zero console.log pollution:** Only `console.error` in error handlers.
- **Strong design token system:** globals.css with comprehensive CSS custom properties.
- **Well-structured Prisma schema:** Proper indexes, relations, and enum usage. 14 models, all with appropriate indexes.
- **Good auth foundation:** NextAuth v5 with JWT/session callbacks, bcrypt for passwords, session checks on most routes.
- **Shared game types:** `shared/game-types.ts` provides a clean contract between worker and app.
- **Lean dependency tree:** Only 26 runtime deps — no bloat.
- **Comprehensive game engine docs:** 12k+ lines in `docs/game-engine/` with rules mapping.

---

## Recommendations by Priority

### P0 — Immediate (this session)

1. **SEC-1:** Add `await auth()` + admin role check to `/api/cards` POST and PATCH endpoints
2. **SEC-2:** Add NaN validation to all `parseInt()` calls on query params
3. **SCALE-1:** Refactor conversations endpoint to batch unread counts with `groupBy`

### P1 — Short-term (this sprint)

4. **TYPE-10 + CONS-4 + AGENT-3:** Introduce Zod. Create `src/lib/validators/` with schemas for all POST/PATCH request bodies. Validate at API boundaries.
5. **REUSE-12:** Create `src/lib/api-client.ts` with `apiGet<T>()`, `apiPost<T>()` wrappers for consistent fetch handling
6. **SEC-4:** Add rate limiting middleware on auth endpoints, social endpoints, and search
7. **CONS-1 + CONS-5:** Standardize API response shapes to `{ data: T }` for success, consistent HTTP status codes
8. **CONC-1:** Add database constraint or transaction for lobby join atomicity

### P2 — Medium-term (next sprint)

9. **AGENT-1 + AGENT-2 + AGENT-11:** Expand CLAUDE.md with API contracts, error conventions, auth patterns. Create 8-10 additional .cursor/rules/ files. Add step-by-step checklists for common tasks.
10. **MOD-3/4/5:** Decompose the three 600+ line components (board-layout, sidebar, lobbies-shell)
11. **MOD-1/2 + MOD-7:** Extract `CardDetailModal` into a shared component, eliminating cross-feature coupling
12. **TYPE-7/8:** Convert `GameEvent.payload` and `PromptOptions` to discriminated unions
13. **REUSE-1/2:** Move shared utilities (card ID parsing, HTML entities) to `shared/` package

### P3 — Long-term (roadmap)

14. **TYPE-6:** Systematically replace `as any` casts in effect resolver with typed helpers and Zod validation for effect schemas
15. **MOD-11 + REUSE-5:** Split useGameSession into 4-5 focused hooks
16. **AGENT-5/6/7/12/14/15:** Add README files to key directories, document DB patterns, module dependencies, design token usage guide
17. **AGENT-13:** Create example test files in src/ to validate testing patterns
18. **REUSE-7:** Create `useAsyncOperation()` hook for standardized loading/error/submit state management
