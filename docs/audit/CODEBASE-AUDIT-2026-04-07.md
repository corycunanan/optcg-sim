# Codebase Audit Report

**Scope:** Full codebase (`src/`, `workers/`, `pipeline/`, `shared/`, `docs/`)
**Date:** 2026-04-07
**Baseline:** 173 files / 21,496 lines in `src/`, 285 files in `workers/`, 8 files in `pipeline/` | 27 deps, 12 devDeps | TypeScript strict mode ON

---

## Executive Summary

- **Total issues:** 97 (3 critical, 12 high, 46 medium, 31 low, 5 informational)
- **Overall health: Minor concerns — trending toward Needs Attention in the engine type layer**
- **Top 3 systemic issues:**
  1. **Shared/worker type boundary** — `GameState` uses `unknown[]` for effect arrays, forcing 80+ `as any` casts across the entire engine (TYPE-1, TYPE-2, TYPE-3)
  2. **Oversized components without extraction** — 11 files exceed 300 lines, 3 exceed 600 lines (MOD-3, MOD-5, CON-10)
  3. **Documentation debt post-M4** — RULES-TO-ENGINE-MAP.md has ~40 stale status tags; TECH-STACK.md lists wrong version targets (DOC-7, DOC-13)

---

## Scores by Dimension

| Dimension | Score | Summary |
|-----------|-------|---------|
| **Modularity** | 3.5/5 | Clean dependency direction, good feature isolation. Dragged down by 3 monolithic shell components and business logic in API routes. |
| **Reusability** | 3/5 | Good hook architecture, but notable duplication in deck-preview modals, card rotation, and constants. Unused api-response helpers suggest an abandoned abstraction. |
| **Scalability** | 2.5/5 | Unbounded queries, no dynamic imports, missing transactions, no fetch timeouts. The game worker accepts unvalidated payloads. Needs the most attention. |
| **Type Safety** | 2/5 | The shared/worker `unknown[]` boundary is a systemic problem causing 80+ `as any` casts. The client API layer is also faith-based. Strict mode is ON but undermined by casts. |
| **Dead Code** | 4/5 | Very clean — only 3 orphaned files, 1 unused utility file, no commented-out code. One TODO in a card schema is the only high-severity item. |
| **Consistency** | 3.5/5 | API routes are remarkably consistent for 24 endpoints. Engine immutability discipline is excellent. Missing error boundaries and oversized files are the main gaps. Styling rule compliance is good with minor violations. |
| **Documentation** | 2.5/5 | Significant staleness post-M4. RULES-TO-ENGINE-MAP is unreliable for planning. TECH-STACK has wrong versions. CLAUDE.md is missing major directories. README index has 11+ missing entries. |

---

## Positive Findings

1. **Engine immutability is excellent** — Zero mutations of state objects. All `.push()` operates on local arrays. Spread patterns are consistent. `moveCard()` used for all zone transitions.
2. **Dependency direction is clean** — lib/ never imports components/, types/ has no internal imports, workers/ is fully isolated, shared/ is a proper bridge.
3. **Zod validation on all POST routes** — Every POST endpoint uses `parseBody()` with Zod schemas. This is above average.
4. **No commented-out code** — The codebase is remarkably clean of dead comment blocks (schema doc comments are intentional).
5. **Atomic commit discipline** — Recent git history shows focused, well-scoped commits with rule references.
6. **Feature isolation** — Only one cross-feature import violation (deck-builder -> admin's CardDetailModal).

---

## Findings by Severity

### Critical (3)

| ID | Dimension | Location | Description |
|----|-----------|----------|-------------|
| **TYPE-1** | Type Safety | `workers/game/src/engine/effect-resolver/actions/effects.ts` | Pervasive `as any` casts in effect engine action handlers — nearly every state mutation is untyped |
| **TYPE-2** | Type Safety | `workers/game/src/engine/duration-tracker.ts`, `triggers.ts`, `replacements.ts` | Same `as any` pattern across the entire effect lifecycle (creation, tracking, expiry, cleanup) |
| **SCALE-1** | Scalability | `src/app/api/messages/conversations/route.ts:21-29` | Conversations endpoint fetches ALL messages without limit — will timeout as volume grows |

### High (12)

| ID | Dimension | Description |
|----|-----------|-------------|
| **TYPE-3** | Type Safety | `as any` to access undeclared properties (`source_zone`, `is_active`, `ref`, etc.) on schema objects across 7 engine files |
| **TYPE-4** | Type Safety | `attachedDon: [] as any[]` in GameSession and cost-handler — proper type is `DonCard[]` |
| **SCALE-11** | Scalability | Zero `next/dynamic` imports — game board, dnd-kit, motion library all statically loaded, inflating initial bundle |
| **SCALE-13** | Scalability | `handleInit` in GameSession.ts casts init payload without validation — malformed payload crashes the DO |
| **SCALE-18** | Scalability | Deck card update (deleteMany + createMany) not wrapped in `$transaction` — data loss risk on partial failure |
| **MOD-3** | Modularity | `board-layout.tsx` at 702 lines with 4 components — orchestrates layout, DnD, battle, animation in one file |
| **MOD-5** | Modularity | `lobbies-shell.tsx` at 666 lines — 15+ state vars, 6 fetch calls, polling, clipboard, join flow all in one file |
| **MOD-10** | Modularity | Lobby join route has 224 lines of inlined business logic (deck validation, payload construction, rollback) |
| **CON-10** | Consistency | 11 component files exceed the 300-line C-1 rule limit |
| **CON-11** | Consistency | No Next.js `error.tsx` route error boundaries anywhere — unhandled errors crash the entire app |
| **REUSE-1** | Reusability | `cardRotation()` function copy-pasted identically in 4 files |
| **REUSE-2** | Reusability | Two independent deck-preview modals with substantial structural duplication |
| **DOC-7** | Documentation | TECH-STACK.md version targets say Next 14, React 18, Tailwind 3.4, Prisma 5 — actual is 16, 19, 4, 6 |
| **DOC-13** | Documentation | RULES-TO-ENGINE-MAP.md has ~40+ stale STUB/GAP tags for features implemented in M4 |
| **DEAD-12** | Dead Code | TODO in eb02 schema: missing "same card name" filter — incomplete game rule enforcement |

### Medium (46)

#### Scalability (10)
- **SCALE-2** — Unbounded message polling (`after` param has no `take` limit)
- **SCALE-5** — Deck list endpoint has no pagination
- **SCALE-7** — Missing trigram index on `users.username` for search
- **SCALE-8** — Dual sources of truth for `activePrompt` state
- **SCALE-10** — UI barrel export pulls ~100+ components into module graph
- **SCALE-12** — `@dnd-kit/core` and `motion/react` imported statically in board layout
- **SCALE-14** — WebSocket `clientMsg` parsed without schema validation
- **SCALE-15** — `writeResultToDb` fetch has no timeout (DO can hang)
- **SCALE-16** — Lobby join fetch to game worker has no timeout
- **SCALE-19** — Username uniqueness check-then-set without transaction
- **SCALE-20** — Registration email/username check-then-create without transaction
- **SCALE-21** — Game finalize check-then-update without optimistic locking

#### Type Safety (10)
- **TYPE-5** — `resumeContext: null as any` (should be `null`)
- **TYPE-6** — `apiGet<{ data: any }>` in deck-builder-shell discards type info
- **TYPE-7** — 4x `as unknown as RuntimeEffect` double-casts
- **TYPE-8** — Raw user strings cast to Prisma enum arrays without validation
- **TYPE-9** — `(d: any)` callback parameters in cost-handler
- **TYPE-10** — `(c: any)` callback in conditions.ts life card access
- **TYPE-11** — `Record<string, any>` used where `TargetFilter` type exists
- **TYPE-16** — `SimpleCondition` 28-member switch without exhaustiveness guard
- **TYPE-17** — `EffectStackFrame` has 5 fields typed `unknown` in shared layer
- **TYPE-19** — GET query parameters bypass Zod validation
- **TYPE-20** — `apiGet<T>` trusts callers without runtime validation

#### Modularity (7)
- **MOD-1** — Type-only circular dependency: admin/card-grid <-> card-browser
- **MOD-2** — deck-builder imports admin's `CardDetailModal` directly
- **MOD-6** — `field-card.tsx` has 5 exported components (405 lines)
- **MOD-9** — Admin new-card page duplicates card edit form logic
- **MOD-11** — `parseDeckList` (78-line parser) trapped in API route file
- **MOD-12** — 130-line Prisma query builder inlined in cards route
- **MOD-13** — Social sidebar mixes 5 API calls with rendering logic

#### Reusability (7)
- **REUSE-3** — Auth guard 3-line block repeated 28x across API routes
- **REUSE-4** — `api-response.ts` exports 4 helpers used by zero routes
- **REUSE-5** — `lobbies-shell.tsx` uses 10+ raw `fetch()` instead of `api-client`
- **REUSE-7** — `BoardLayoutProps` has 16 props, mostly pass-through
- **REUSE-8** — `useGameSession` returns 30 values in a flat object
- **REUSE-12** — Card aspect ratio `aspect-[600/838]` repeated in 12 locations
- **REUSE-13** — `w-[100px]` card thumbnail size scattered across 5 files

#### Consistency (9)
- **CON-1** — Deck import response shape differs from all other endpoints
- **CON-3** — `game/active` returns 200 with `{data: null}` instead of 401 when unauth
- **CON-4** — Game routes missing try/catch around Prisma calls
- **CON-6** — 8 endpoints return `{success: true}` instead of `{data: ...}` pattern
- **CON-8** — 3 home components use PascalCase filenames (all others kebab-case)
- **CON-9** — Singular `user/` vs plural `users/` API path naming
- **CON-12** — `text-[11px]` banned font size in sign-out-button
- **CON-13** — 90+ inline `style={{}}` in game board (some static values could be Tailwind)
- **CON-15** — 5 instances use template literal class concatenation instead of `cn()`

#### Dead Code (5)
- **DEAD-1** — Entire `src/lib/api-response.ts` file is unused
- **DEAD-6** — Types in `src/types/index.ts` primarily serve pipeline, not app
- **DEAD-7** — `CardFlip.tsx` component never imported (orphaned)
- **DEAD-8** — `CardRings.tsx` component never imported (orphaned)
- **DEAD-9** — `sign-out-button.tsx` component never imported (orphaned)

#### Documentation (10)
- **DOC-1/2/3** — M1-M3 milestone checkboxes all unchecked despite completion
- **DOC-6** — README milestone table has wrong M6 title and missing M5 sub-milestones
- **DOC-8** — TECH-STACK planned libraries still listed as speculative
- **DOC-9** — Auth section missing email/password provider
- **DOC-10** — Architecture doc shows Railway/Fly.io instead of Cloudflare Workers
- **DOC-14** — Engine file index lists 11 files vs actual 23+
- **DOC-15** — "Functions needed for M4" section lists completed items as needed
- **DOC-16** — CLAUDE.md missing game/, lobbies/, validators/, workers/ directories
- **DOC-21** — README index missing 11+ doc entries

### Low (31)

- **DEAD-2** — `detectVariantType` and `sanitizeEffectText` unused in src/lib/utils.ts
- **DEAD-3** — 15 validator `*Input` type aliases never imported
- **DEAD-4** — `CustomizationOption` interface exported but never imported
- **DEAD-5** — `UseGameSessionReturn` and `UseGameWsReturn` exported but never imported externally
- **TYPE-12** — Widespread `as any` in test files (~49 instances)
- **TYPE-13** — Non-null assertions (`!.`) in engine code (60+ instances)
- **TYPE-14** — `GameAction` switch lacks `default: never` exhaustiveness guard
- **TYPE-15** — `ServerMessage` switch in use-game-ws.ts lacks exhaustiveness
- **TYPE-21** — Unconstrained `<T>` in api-client functions
- **TYPE-22** — `getActionParams` exists but is not used in most callsites
- **REUSE-6** — `game:state` and `game:update` handlers share near-identical logic
- **REUSE-9** — `CardDetailModalProps` dual-mode interface (manageable)
- **REUSE-10** — Missing barrel exports for most component directories
- **REUSE-14** — Z-index values scattered as magic numbers
- **REUSE-16** — `useBattleState` returns 12 values (borderline)
- **REUSE-17** — `useDragTilt`, `useHandAnimationState` each used by only one component
- **REUSE-11** — `CARD_W=80`/`CARD_H=112` independently defined in 4 game modals
- **SCALE-3** — Friends list endpoint has no pagination
- **SCALE-4** — Friend requests endpoint has no limit
- **SCALE-6** — Sets endpoint has no cache headers for static data
- **SCALE-9** — Game status polled every 2s regardless of WS connection state
- **SCALE-17** — Card detail endpoint has no auth check (likely intentional)
- **SCALE-22** — In-memory rate limiter ineffective in multi-instance serverless
- **CON-2** — Auth error message "Not authenticated" vs "Unauthorized" inconsistency
- **CON-5** — Rate limiting applied to only 5 of 24 route files
- **CON-7** — Error logging does not leak to clients (positive)
- **CON-14** — Hardcoded oklch value in homepage gradient
- **CON-16** — `rounded-xl` in shadcn components (may be exempt)
- **CON-17** — Inline styles in auth components for CSS variable references
- **DOC-4** — M5 parent doc checkboxes unchecked
- **DOC-11** — Architecture doc describes WS messaging; actual uses REST polling
- **DOC-17** — CLAUDE.md says lobby UI in social/ but it's in lobbies/
- **DOC-18** — CLAUDE.md says 25 endpoints across 8 domains; actual is 24 across 9
- **DOC-19** — CLAUDE.md key files table has no game engine or worker references
- **DOC-20** — CLAUDE.md says hooks/ "to be populated in M3+" — it now has 5 hooks

---

## Recommendations by Priority

### Immediate (this session)
1. **Fix SCALE-18** — Wrap deck card update in `$transaction` (data loss risk)
2. **Fix SCALE-1** — Add pagination/aggregation to conversations endpoint
3. **Add error boundaries** (CON-11) — `error.tsx` for `/game/[id]`, `/decks`, `/lobbies`, `/admin`

### Short-term (this sprint)
4. **Fix the shared/worker type boundary** (TYPE-1/2/3/17) — Create `TypedGameState` in workers that narrows `unknown[]` to concrete types. This eliminates 80+ `as any` casts.
5. **Add `next/dynamic`** (SCALE-11) — Dynamic import for game board, admin editor, deck builder heavy components
6. **Validate game init payload** (SCALE-13) — Zod schema for `GameInitPayload` in the Durable Object
7. **Extract business logic from routes** (MOD-10/11/12) — Move `toCardData`, `parseDeckList`, card query builder to `src/lib/`
8. **Decompose large components** (MOD-3/5) — Split board-layout into sections, extract `useLobbySession` hook

### Medium-term (next sprint)
9. **Update documentation** — Refresh RULES-TO-ENGINE-MAP.md, TECH-STACK.md, CLAUDE.md directory map, README index
10. **Consolidate duplicated UI** — Merge deck-preview modals, extract `cardRotation`, centralize card dimension constants
11. **Add fetch timeouts** (SCALE-15/16) — AbortController on all cross-service fetch calls
12. **Handle Prisma P2002** (SCALE-19/20) — Catch unique constraint violations for clean 409 responses
13. **Standardize API responses** — Adopt `api-response.ts` helpers or delete them; normalize response shapes

### Long-term (roadmap)
14. **Distributed rate limiting** — Migrate from in-memory to Upstash Redis
15. **Client-side response validation** — Pass Zod schemas to `apiGet<T>` for runtime type checking
16. **WebSocket message validation** — Schema-validate all client messages before engine processing
17. **Delete dead code** — Remove orphaned components, unused exports, vestigial types
