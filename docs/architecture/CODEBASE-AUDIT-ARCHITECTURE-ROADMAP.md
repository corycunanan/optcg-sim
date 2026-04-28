# Codebase Audit And Architecture Roadmap

Date: April 28, 2026

Scope: read-only audit of the OPTCG Simulator codebase, focused on system architecture, implementation health, testing, maintainability, and the path to a professional-grade architecture for a solo developer.

## Executive Summary

The codebase has a strong foundation: the product is clearly split between a Next.js app, a Cloudflare Durable Object game server, a Prisma-backed product database, and shared game contracts. The highest-value architectural choice is that live gameplay is server-authoritative in the Durable Object. This gives the project a real spine: the UI prepares actions, the worker validates and applies them, and the app persists product lifecycle data around the game.

The main concern is not lack of architecture. It is architectural drift. The game worker is ambitious and heavily tested, but its standalone type-check currently fails. The main app has a working test suite, but CI does not run it. Several validation and documentation layers are partially stale. React lint warnings are numerous enough that they are becoming noise. Those issues are normal in a fast solo-dev codebase, but they should be tightened before the game engine grows much further.

For a solo developer, "professional grade" should not mean enterprise ceremony. It should mean:

- One reliable command that tells you whether the project is safe to ship.
- Clear module boundaries that reduce context loading.
- Thin routes and deep domain modules.
- Server-side enforcement of game/deck/business rules.
- Contract tests around the app-worker boundary.
- Enough observability to debug production issues without guessing.
- Docs that future-you can use to regain context in minutes.

## Current Architecture In Plain English

### Next.js App

The Next.js app owns the normal product surface:

- Authentication via NextAuth v5 in `src/auth.ts`
- Card search, admin editing, decks, lobbies, friends, messages, game status APIs in `src/app/api`
- User-facing pages in `src/app`
- UI components by feature area in `src/components`
- Deck builder logic in `src/lib/deck-builder`
- Prisma access through `src/lib/db.ts`
- Shared API helpers in `src/lib/api-response.ts`

The app is mostly responsible for authenticated product workflows: browsing cards, building decks, starting lobbies, joining games, and rendering the live game client.

### Game Worker

The Cloudflare Worker and Durable Object in `workers/game` own live game state:

- `workers/game/src/index.ts` routes worker requests.
- `workers/game/src/GameSession.ts` manages one game session per Durable Object.
- `workers/game/src/engine/pipeline.ts` is the rules mutation entry point.
- `workers/game/src/engine/effect-resolver` resolves encoded card effects.
- `workers/game/src/engine/schemas` contains card effect schemas.
- Worker storage persists the live game state and card DB for hibernation/reconnect.

The worker validates WebSocket messages, serializes player actions, runs the rules pipeline, sends prompts, handles disconnect/reconnect windows, and writes game results back to the Next.js API.

### Shared Contract

The `shared` directory contains cross-runtime validators and types, especially the WebSocket client message schema. This is one of the most important boundaries in the codebase because it keeps the browser and worker aligned on legal client actions.

### Database

Prisma models cover:

- Users, accounts, sessions
- Cards, art variants, card sets, errata
- Decks and deck cards
- Social relationships and messages
- Lobbies
- Game sessions and game action logs

The database is the durable product record. The Durable Object is the authoritative live-state runtime.

## Verification Baseline

Commands run during audit:

```bash
pnpm run type-check
pnpm run lint
pnpm test
pnpm --dir workers/game run type-check
pnpm --dir workers/game test
```

Results:

- `pnpm run type-check`: passed for the main Next.js app.
- `pnpm test`: passed, 22 files / 211 tests.
- `pnpm run lint`: passed, but with 413 warnings.
- `pnpm --dir workers/game run type-check`: failed.
- `pnpm --dir workers/game test`: failed locally because the nested worker Vitest install could not be resolved.

Interpretation:

The app is in reasonably good static/test shape. The worker has valuable tests, but its local package/test/type-check setup needs consolidation. CI currently does not enforce all the checks that matter.

## High-Level Health Assessment

### Strengths

- The product has clear domains: cards, decks, lobbies, game, social, admin.
- The game server is authoritative, which is the right architecture for a competitive card simulator.
- WebSocket messages are runtime validated with Zod through shared schemas.
- API response helpers provide a consistent starting point.
- Prisma schema is coherent and maps well to the product.
- Deck validation exists as a dedicated domain module.
- The worker has many rule/regression tests around specific gameplay bugs.
- The scaled board and game UI have a documented layout model.
- The design direction is unusually well specified for a solo project.

### Main Risks

- Worker type safety is not currently enforceable.
- CI does not run the main app test suite.
- The app-worker boundary needs more explicit contract tests.
- Deck legality is validated client-side but not fully enforced server-side before persistence.
- Public query validation is permissive and relies on downstream casts.
- Documentation has drifted from implementation reality.
- React lint warnings are numerous enough to hide meaningful warnings.
- The root layout locks all routes into a viewport shell that is better suited to the game board than document-like pages.

## Priority Roadmap

The sections below are written so each can become one or more Linear tickets.

---

## Initiative 1: Create A Single Root Verification Command

Priority: Critical

Estimate: 1-2 days

Suggested Linear labels: `dev-experience`, `ci`, `quality`

### Context

The project currently has separate commands for app checks and worker checks. The main app type-check passes, the main app tests pass, lint passes with warnings, and worker type-check fails. CI runs lint, app type-check, worker tests, and build, but it does not run the main app test suite.

For a solo developer, the most important professional-grade workflow is a single reliable command that answers: "Can I ship this?"

### Problem

There is no single root command that runs all meaningful checks. CI does not match local confidence. Worker checks are split from app checks. This increases the chance that a change looks fine locally but fails elsewhere, or worse, passes CI without running relevant app tests.

### Proposed Scope

Add a root `verify` script that runs:

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm --dir workers/game type-check
pnpm --dir workers/game test
pnpm build
```

Then update CI to call the same script or mirror it exactly.

### Acceptance Criteria

- `pnpm verify` exists at the repo root.
- CI runs the app test suite.
- CI runs worker type-check, not just worker tests.
- Local and CI verification are aligned.
- The command fails if any major subsystem is broken.

### Risks And Notes

- Worker type-check currently fails, so this may need to land after or alongside Initiative 2.
- Build may require fake database env vars in CI.
- The script should stay boring. Avoid complex custom shell logic unless necessary.

---

## Initiative 2: Restore Worker Type Safety

Priority: Critical

Estimate: 3-5 days

Suggested Linear labels: `game-engine`, `type-safety`, `quality`

### Context

The game worker is the most rules-critical part of the codebase. It owns live state, effect resolution, prompts, reconnects, and game-end reporting.

`pnpm --dir workers/game run type-check` currently fails with many errors. Many are stale test fixtures, but at least one production-code error appears in `workers/game/src/GameSession.ts`, where active effects are passed to `isEffectConditionMet` with an incompatible type.

### Problem

When the worker cannot type-check, the project loses one of its strongest safeguards around rule logic. Stale fixtures also make tests harder to trust because they encode old state shapes.

### Proposed Scope

- Fix production-code worker type errors first.
- Update stale test fixtures to match current `GameState`, `TurnState`, `LifeCard`, `BattleContext`, and `GameEvent` shapes.
- Prefer central test builders over copy-pasted object literals.
- Add or improve helper factories for:
  - `createTestGameState`
  - `createTestPlayer`
  - `createTestTurn`
  - `createGameEvent`
  - `createLifeCard`
  - `createBattleContext`
- Make worker type-check a CI gate.

### Acceptance Criteria

- `pnpm --dir workers/game run type-check` passes.
- Worker tests still pass after fixture cleanup.
- Common test state construction goes through helpers.
- Production code no longer relies on type mismatches in the broadcast/filter path.

### Risks And Notes

- Do not paper over errors with broad `as any` casts.
- Some tests may intentionally exercise old edge cases; preserve behavior while updating fixture shapes.
- This is not just cleanup. It protects the project’s core rules engine.

---

## Initiative 3: Normalize Worker Package And Test Execution

Priority: High

Estimate: 1-2 days

Suggested Linear labels: `dev-experience`, `worker`, `ci`

### Context

The worker has its own `package.json` with `vitest`, `typescript`, and `wrangler`. Locally, `pnpm --dir workers/game test` failed because Vitest could not be resolved from `workers/game/node_modules`.

CI currently uses `cd workers/game && npx vitest run`, which differs from the package script and may hide local setup problems.

### Problem

The worker behaves like a subproject, but dependency/test execution is not cleanly normalized. This increases setup friction and makes CI/local results diverge.

### Proposed Scope

Choose one standard execution model:

Option A: workspace root controls worker commands.

```json
{
  "scripts": {
    "test:worker": "pnpm --dir workers/game test",
    "type-check:worker": "pnpm --dir workers/game type-check"
  }
}
```

Option B: make `workers/game` a formal pnpm workspace package and ensure installs create the expected package environment.

### Acceptance Criteria

- Worker test command works locally from a fresh install.
- Worker type-check command works locally.
- CI uses the same command as local development.
- Documentation says exactly how to run worker checks.

### Risks And Notes

- Avoid introducing a complex monorepo system unless needed.
- The goal is boring repeatability, not infrastructure sophistication.

---

## Initiative 4: Make The Game Engine A Deep, Pure Module

Priority: High

Estimate: 1-2 weeks

Suggested Linear labels: `architecture`, `game-engine`, `refactor`

### Context

The game engine is the highest-value domain module in the repo. It should be the deepest module: small public interface, large hidden implementation.

Currently the engine lives under `workers/game/src/engine`, while the Next app imports worker engine code for sandbox/playground flows through path aliases. This is useful, but it blurs the line between worker runtime code and pure engine code.

### Problem

The app should not need to know worker internals. The worker should be an adapter around a pure engine. The sandbox should consume the same engine through a clear public boundary.

### Proposed Scope

Move toward this conceptual structure:

```text
shared/
  validators/
  game-contracts/

packages/
  game-engine/
    src/
      pipeline.ts
      state.ts
      effects/
      schemas/
      testing/

workers/game/
  src/
    index.ts
    GameSession.ts
    adapters around game-engine

src/
  app/
  components/
  server/
  sandbox adapter around game-engine
```

This does not need to happen all at once. Start by defining a public engine entrypoint and making both worker and sandbox import through it.

### Acceptance Criteria

- Pure engine modules do not import Cloudflare Worker APIs.
- Durable Object code is an adapter around engine entrypoints.
- Sandbox imports from the engine public API, not arbitrary worker internals.
- Engine test helpers live near the engine and are reused by worker tests.
- Public engine API is documented.

### Risks And Notes

- Avoid moving files just for aesthetics. Start with imports and boundaries.
- The most valuable goal is hiding engine complexity behind stable functions.
- A formal package can come later if path aliases are enough for now.

---

## Initiative 5: Add App-Worker Contract Tests

Priority: High

Estimate: 3-5 days

Suggested Linear labels: `tests`, `worker`, `api`, `integration`

### Context

The sharpest runtime boundary is between the Next.js API and the Cloudflare Durable Object. Lobby join builds an init payload for the worker. The app mints game tokens. The worker reports results back to the app. The worker filters game state before broadcasting it to each player.

### Problem

Most bugs at this boundary will not be caught by isolated unit tests. They happen when both sides evolve but the contract between them drifts.

### Proposed Scope

Add contract tests for:

- `/api/lobbies/join` payload shape matches worker `validateGameInitPayload`.
- `/api/game/token` minted token verifies with worker `verifyGameToken`.
- Worker `writeResultToDb` body matches `/api/game/result` schema.
- `filterStateForPlayer` never leaks opponent hand, deck, or face-down life.
- `notify-end` flow is idempotent and keeps DB/DO state aligned.
- Worker init rejects malformed deck/card payloads cleanly.

### Acceptance Criteria

- Contract tests run in CI.
- Tests fail when app and worker payload schemas diverge.
- Hidden-zone filtering has explicit regression coverage.
- Token compatibility is tested without requiring live Cloudflare infrastructure.

### Risks And Notes

- Keep these tests focused. They should not become full E2E browser tests.
- Prefer importing schema/validator functions directly over mocking entire frameworks.

---

## Initiative 6: Move Deck Legality Enforcement Server-Side

Priority: High

Estimate: 3-5 days

Suggested Linear labels: `decks`, `api`, `domain-logic`, `integrity`

### Context

The deck builder has a dedicated validation engine in `src/lib/deck-builder/validation.ts`. It checks leader presence, 50-card deck size, max 4 copies, color affinity, banned cards, restricted cards, and no leaders in the main deck.

The deck API input schema validates card shape and quantity bounds, but server routes do not appear to enforce full deck legality before writes or lobby start.

### Problem

Client-side validation is helpful UX, but server-side validation is the actual product rule boundary. Without server enforcement, invalid decks can be persisted through direct API calls or future UI bugs.

### Proposed Scope

- Create a server-side deck domain service.
- Reuse or adapt the existing `validateDeck` logic on the server.
- Validate on:
  - deck create
  - deck update
  - lobby create
  - lobby join
- Decide whether incomplete decks are allowed to be saved as drafts.
- If drafts are allowed, enforce legality only when entering a game.

### Suggested Design

```text
src/server/decks/
  deck-service.ts
  deck-validation-service.ts
  deck-repository.ts
  deck-policy.ts
```

Possible policy:

- Draft deck: can be incomplete.
- Playable deck: must pass all legality rules.
- Lobby deck: must be playable.

### Acceptance Criteria

- Invalid decks cannot enter lobbies.
- API responses return structured validation details, not just generic 400s.
- Deck builder UI can display server validation results.
- Tests cover invalid deck size, leader in main deck, off-color cards, banned cards, restricted cards, missing card IDs, and invalid leader IDs.

### Risks And Notes

- Do not make deck editing painful by preventing draft saves unless that is an explicit product decision.
- Separate "can save" from "can play".

---

## Initiative 7: Tighten Public API Validation

Priority: Medium-High

Estimate: 2-4 days

Suggested Linear labels: `api`, `validation`, `security`

### Context

Some public schemas accept arbitrary strings and later cast them into narrower Prisma or domain types. `CardSearchParamsSchema` accepts string values for `type`, `ban`, `block`, `sort`, and `order`, and `buildCardWhereClause` casts some values into Prisma enum filters.

### Problem

Loose validation can produce inconsistent behavior: database errors, confusing empty results, or accidental acceptance of unsupported filters. It also makes API behavior harder to document.

### Proposed Scope

Tighten Zod schemas for:

- Card search params:
  - enum values for card type
  - enum values for ban status
  - numeric bounds for cost, power, block, page, limit
  - enum values for sort and order
  - max length for search query
- Deck inputs:
  - max deck name length
  - stricter format enum or known format table
  - selected art URL validation or ownership checks
- Lobby inputs:
  - format enum
  - join code normalization and length
- Message inputs:
  - body length and whitespace handling

### Acceptance Criteria

- Invalid card search filters return clear 400 responses.
- Query parsing returns normalized typed values instead of raw strings.
- Route code no longer casts arbitrary strings into Prisma enums.
- Tests cover invalid enum values, invalid numbers, huge limits, and unsupported sort fields.

### Risks And Notes

- Be careful not to break existing UI filter query strings.
- Add compatibility handling where users may have bookmarked old URLs.

---

## Initiative 8: Create Server-Side Domain Services

Priority: Medium-High

Estimate: 1-2 weeks, incremental

Suggested Linear labels: `architecture`, `api`, `refactor`

### Context

Many route files directly perform auth, validation, Prisma queries, business checks, transactions, and response shaping. This is fine early, but as the product grows it makes behavior harder to test and reuse.

### Problem

Route handlers become shallow orchestration mixed with domain logic. Bugs hide in repeated ownership checks, transaction boundaries, and inconsistent error handling.

### Proposed Scope

Incrementally introduce domain services:

```text
src/server/cards/
src/server/decks/
src/server/lobbies/
src/server/game-results/
src/server/social/
```

Routes should become thin:

```ts
const auth = await requireAuth();
const input = await parseBody(request, Schema);
const result = await deckService.updateDeck(auth.userId, deckId, input);
return toApiResponse(result);
```

### Good First Candidates

1. Deck service: high product importance, clear validation rules.
2. Lobby service: important transaction boundary.
3. Game result service: app-worker consistency boundary.
4. Friend request service: repeated social relationship checks.

### Acceptance Criteria

- Route handlers are mostly auth, parse, call service, return response.
- Business logic is testable without constructing Next.js `Request` objects.
- Ownership checks are centralized.
- Transactions live inside service methods.
- Service methods return typed success/error results.

### Risks And Notes

- Avoid abstract repositories everywhere by default.
- Extract where behavior is duplicated or transactionally important.
- Keep Prisma as an implementation detail only when it improves testability.

---

## Initiative 9: Introduce A Typed Domain Error Pattern

Priority: Medium

Estimate: 2-3 days

Suggested Linear labels: `api`, `architecture`, `developer-experience`

### Context

Routes currently return `apiError("message", status)` and often catch unknown errors with generic 500s. This is simple and understandable, but it does not scale well when domain services need to explain structured failures.

### Problem

Without typed domain errors, the project duplicates error mapping logic and loses useful details, especially for validation-heavy flows like deck legality, lobby join failures, and game finalization conflicts.

### Proposed Scope

Define a common app error/result model:

```ts
type AppResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

type AppError =
  | { code: "UNAUTHORIZED"; status: 401; message: string }
  | { code: "FORBIDDEN"; status: 403; message: string }
  | { code: "NOT_FOUND"; status: 404; message: string }
  | { code: "CONFLICT"; status: 409; message: string }
  | { code: "DECK_INVALID"; status: 400; message: string; details: unknown }
  | { code: "RATE_LIMITED"; status: 429; message: string }
  | { code: "INTERNAL"; status: 500; message: string };
```

Add a mapper:

```ts
return apiResult(result);
```

### Acceptance Criteria

- Domain services return typed results.
- API routes map results consistently.
- Deck validation can return structured details.
- UI can distinguish validation errors from generic failures.

### Risks And Notes

- Keep the pattern small. Do not introduce a heavy framework.
- Start with one domain service and expand only after it feels useful.

---

## Initiative 10: Formalize Database Transaction Policies

Priority: Medium

Estimate: 1-2 days for docs, 3-5 days for follow-up fixes

Suggested Linear labels: `data-integrity`, `architecture`, `docs`

### Context

The code already uses transactions in important places such as lobby join and deck update. This is good. The next professional step is to document when transactions are required and then audit routes against that policy.

### Problem

Without a written policy, transactional integrity depends on memory. Solo developers benefit from writing down the rules once so future changes can be reviewed against them.

### Proposed Scope

Create `docs/architecture/DATA-INTEGRITY.md` covering:

- When to use transactions.
- How to handle optimistic locking.
- How to handle idempotent worker callbacks.
- How to prevent orphan records.
- How to handle ownership checks.
- How to handle unique constraints and race conditions.

Audit these flows:

- Lobby create
- Lobby join
- Lobby cancel
- Deck update
- Friend request accept/decline
- Game result finalize
- Fallback concede
- Admin card import/update

### Acceptance Criteria

- Data integrity policy doc exists.
- High-risk multi-row writes are listed.
- Follow-up tickets exist for any flow that violates the policy.
- Tests cover at least lobby join race/idempotency and game finalize first-writer-wins behavior.

### Risks And Notes

- This is a small document with high leverage.
- Do not overcomplicate with patterns that Prisma transactions already solve.

---

## Initiative 11: Add Production Observability

Priority: Medium

Estimate: 3-5 days for baseline

Suggested Linear labels: `observability`, `production`, `debugging`

### Context

The worker has logging hooks and important console errors. The app also logs server failures. But there is no clear end-to-end observability story for debugging real games.

### Problem

When a live game fails, the key question is: "What happened to game X?" Without structured logs and correlation IDs, debugging depends on scattered logs and user reports.

### Proposed Scope

Add a lightweight observability baseline:

- Request IDs for API routes.
- Structured logs for API failures.
- Structured logs for worker lifecycle events:
  - init
  - WebSocket connect/disconnect
  - invalid action
  - prompt created/resumed
  - game over
  - result callback success/failure
- Include safe identifiers:
  - gameId
  - userId where appropriate
  - lobbyId
  - route/action type
- Frontend error boundary reporting for game UI failures.
- A debug/admin endpoint or script to inspect a game session record and related lobby/decks.

### Acceptance Criteria

- A game failure can be traced by `gameId`.
- Worker result callback failures are visible.
- API errors include route and request ID in logs.
- Client game UI errors are captured with gameId/user context where safe.

### Risks And Notes

- Avoid logging hidden card contents or private message bodies.
- Keep logs structured but minimal.
- This does not require a full observability platform at first.

---

## Initiative 12: Add Feature Flags And Support Gates

Priority: Medium

Estimate: 3-5 days

Suggested Linear labels: `release-safety`, `admin`, `game-engine`

### Context

Card simulators often ship partial support: some cards are fully encoded, some are unsupported, some have low-confidence effect schemas, and some interactions are still being hardened.

### Problem

Without support gates, releases become all-or-nothing. Users may encounter partially supported cards as if they were production-ready.

### Proposed Scope

Introduce feature/support flags for:

- Sandbox route availability.
- Specific card set availability.
- Low-confidence effect schema availability.
- Manual effect fallback mode.
- Experimental rules behavior.
- Ranked/competitive lobby availability, if applicable later.

### Acceptance Criteria

- The app can prevent unsupported cards from entering live games.
- Admin/dev mode can allow unsupported cards for testing.
- Low-confidence schemas can be surfaced in admin views.
- Flags are documented and easy to set per environment.

### Risks And Notes

- Start with environment-based flags or database fields; avoid a complex flag service.
- User trust matters: unsupported should be explicit, not surprising.

---

## Initiative 13: Build A Card Effect Support Matrix

Priority: Medium

Estimate: 1 week

Suggested Linear labels: `game-engine`, `card-data`, `admin`, `quality`

### Context

The worker has many effect schema files and schema linting scripts. This is a strong base. The next step is to turn support status into a product/developer artifact.

### Problem

It is hard to answer:

- Which cards are fully supported?
- Which cards have no schema?
- Which schemas are low confidence?
- Which cards have regression tests?
- Which cards drift from official card text?

### Proposed Scope

Generate a support matrix from schema files and card data:

```text
cardId
name
set
hasEffectSchema
schemaConfidence
knownGaps
hasRegressionTest
lastDocDriftCheck
liveEligible
```

Use it in:

- Admin card browser.
- Developer reports.
- Lobby/deck legality gate.
- Release notes or internal QA.

### Acceptance Criteria

- A generated JSON or markdown support matrix exists.
- Unsupported/low-confidence cards are identifiable.
- CI or a script can fail on doc drift for supported cards.
- Admin UI can show support status.

### Risks And Notes

- Do not require perfect coverage before generating the matrix.
- A partial matrix is already useful if it is honest.

---

## Initiative 14: Reduce React Lint Warning Noise

Priority: Medium

Estimate: 3-7 days, incremental

Suggested Linear labels: `frontend`, `react`, `performance`, `quality`

### Context

`pnpm run lint` exits successfully but emits 413 warnings. Some are simple unused variables. Others are React warnings around synchronous `setState` in effects and reading/updating refs during render.

### Problem

Warning noise trains you to ignore warnings. React 19 and compiler-era lint rules also point toward patterns that can become real rendering or performance issues.

### Proposed Scope

Triage warnings into categories:

- Unused variables/imports.
- Legitimate React state/effect refactors.
- Intentional patterns that deserve local comments or different structure.
- Test-only looseness.
- Worker `any` debt.

Prioritize:

- Game board render/ref warnings.
- Modals and data-fetching components with effect-driven state.
- Warnings in frequently touched files.

### Acceptance Criteria

- Warning count is reduced substantially.
- React `refs` warnings in board rendering are resolved.
- Common data-fetching patterns are standardized.
- Remaining warnings are intentional and documented.

### Risks And Notes

- Do not blindly rewrite working board behavior.
- Some animation state logic may need careful regression testing.
- This is best done in small tickets by component area.

---

## Initiative 15: Split Viewport-Locked Game Shell From Normal App Layout

Priority: Medium

Estimate: 3-5 days

Suggested Linear labels: `frontend`, `layout`, `accessibility`

### Context

The root layout uses `h-screen w-full overflow-hidden` around the entire app. This is appropriate for the game board but less ideal for normal pages like admin, decks, login, onboarding, and documentation-like content.

### Problem

A global viewport lock can create accessibility and responsive issues:

- Long content may be trapped in nested scroll areas.
- Mobile browser chrome can reduce usable height.
- Zoomed text may overflow.
- Non-game pages inherit game-like layout constraints.

### Proposed Scope

Introduce route-aware shells:

```text
AppShell
  normal document/product pages

GameShell
  viewport-locked scaled board

AdminShell
  dense tool layout if needed
```

Keep the scaled board viewport lock where it belongs: game routes.

### Acceptance Criteria

- Game board still has stable viewport behavior.
- Non-game pages can scroll naturally.
- Mobile and zoom behavior improve on normal pages.
- Social sidebar behavior is explicit per shell.

### Risks And Notes

- This touches layout assumptions across the app.
- Verify admin, decks, lobbies, and game pages after the split.

---

## Initiative 16: Refresh Architecture Documentation

Priority: Medium

Estimate: 2-4 days

Suggested Linear labels: `docs`, `architecture`, `maintenance`

### Context

The project already has architecture docs, milestone docs, design docs, and API docs. Some are stale. For example, the API README still says card mutations do not have admin auth, while the code uses `requireAdmin`. The instructions mention `src/lib/proxy.ts`, but the actual route protection file is `src/proxy.ts`.

### Problem

Stale docs create drag. They make it harder for a solo developer to re-enter the project after a break, and harder for AI/collaborators to work accurately.

### Proposed Scope

Create or refresh a small set of living docs:

```text
docs/architecture/RUNTIME-BOUNDARIES.md
docs/architecture/GAME-STATE-LIFECYCLE.md
docs/architecture/DATA-INTEGRITY.md
docs/architecture/TESTING-STRATEGY.md
docs/game-engine/EFFECT-SCHEMA-AUTHORING.md
```

Update existing docs where they directly contradict code.

### Acceptance Criteria

- API auth docs match implementation.
- Route protection docs reference `src/proxy.ts`.
- App-worker boundary is documented.
- Testing strategy says which commands CI runs.
- Effect schema authoring has a clear workflow.

### Risks And Notes

- Keep docs short and operational.
- Long docs are less useful than accurate docs.

---

## Initiative 17: Define A Testing Strategy By Layer

Priority: Medium

Estimate: 2-3 days for doc and initial gaps

Suggested Linear labels: `tests`, `quality`, `architecture`

### Context

The repo has many tests, especially around the worker engine and sandbox helpers. The main app test suite passes. There is less clarity on which tests belong where and which tests are required before shipping.

### Problem

Without a layer-by-layer testing strategy, tests can become uneven: many rule tests, fewer API contract tests, unclear frontend interaction coverage, and CI gaps.

### Proposed Scope

Document test layers:

- Unit tests:
  - pure utilities
  - deck validation
  - engine helpers
- Domain service tests:
  - deck service
  - lobby service
  - game result service
- Contract tests:
  - app-worker payloads
  - shared validators
- Component tests:
  - critical UI state machines
  - board/sandbox interaction gates
- E2E smoke tests:
  - login/register if feasible
  - create deck
  - create/join lobby
  - connect to game

### Acceptance Criteria

- Testing strategy doc exists.
- CI maps to the testing strategy.
- New feature PRs know which test type is expected.
- Critical product flows have at least smoke coverage or contract coverage.

### Risks And Notes

- For a solo dev, avoid an enormous Playwright suite early.
- Contract tests may give better value than broad browser E2E tests.

---

## Initiative 18: Strengthen Admin Boundaries

Priority: Low-Medium

Estimate: 2-4 days

Suggested Linear labels: `admin`, `security`, `api`

### Context

Card create/update routes now use `requireAdmin`, which is good. Admin pages are protected by proxy route protection, but route protection and API authorization should remain separate.

### Problem

Admin tooling is a high-trust surface. It can mutate card data, which affects the whole simulator. The API needs clear authorization, auditability, and validation.

### Proposed Scope

- Ensure all admin mutation APIs use `requireAdmin`.
- Add admin mutation logging:
  - userId
  - entity
  - action
  - timestamp
- Consider an `AdminActionLog` model if admin editing becomes frequent.
- Add tests for non-admin rejection on all admin mutation routes.
- Add stricter schemas for card update inputs.

### Acceptance Criteria

- All admin mutation APIs have authorization tests.
- Admin docs match code.
- Card mutations are auditable at least in logs.

### Risks And Notes

- Do not overbuild admin audit tables unless needed.
- Logs may be enough at this stage.

---

## Initiative 19: Make Game Result Finalization More Explicit

Priority: Medium

Estimate: 3-5 days

Suggested Linear labels: `game`, `api`, `worker`, `data-integrity`

### Context

Games can end through engine defeat, concede, disconnect timeout, fallback concede, or client finalize. The worker writes results to the Next API. The API also has fallback finalization paths.

### Problem

Multiple end paths are necessary, but they increase the risk of double writes, stale active-game status, or DO/DB disagreement.

### Proposed Scope

- Centralize game result finalization in a service.
- Make all result writes idempotent.
- Add explicit state transition rules:
  - `IN_PROGRESS -> FINISHED`
  - `IN_PROGRESS -> ABANDONED`
  - terminal states cannot change
- Add structured reason codes in addition to human-readable `winReason`.
- Add contract tests for worker result callback and fallback concede.

### Acceptance Criteria

- First writer wins for game finalization.
- Repeated worker callbacks are harmless.
- Fallback concede and worker result callback share the same finalization service.
- Tests cover double-finalize races.

### Risks And Notes

- Avoid user-visible confusion between draw, abandoned, and no-winner finished games.
- Reason codes make future analytics easier.

---

## Initiative 20: Create A Solo-Dev Operational Runbook

Priority: Low-Medium

Estimate: 1-2 days

Suggested Linear labels: `docs`, `operations`, `developer-experience`

### Context

This project has enough moving parts that future-you will benefit from a concise runbook.

### Problem

Without a runbook, common tasks require rediscovering commands and assumptions:

- How to verify before shipping.
- How to deploy workers.
- How to debug a failed game.
- How to import cards.
- How to promote an admin.
- How to recover from a stuck lobby.

### Proposed Scope

Create `docs/project/RUNBOOK.md`.

Include:

- Local setup.
- Required environment variables.
- Verification commands.
- Deploy commands.
- Common failure modes.
- Game debugging checklist.
- Database maintenance checklist.

### Acceptance Criteria

- A fresh session can use the runbook to get oriented.
- Debugging a failed game has a checklist.
- Deploy steps are documented.

### Risks And Notes

- Keep it practical. A runbook is not a tutorial.

---

## Suggested Linear Epic Breakdown

### Epic A: Make The Codebase Trustworthy To Ship

Goal: one-command confidence and CI alignment.

Tickets:

- Add root `pnpm verify`.
- Add app tests to CI.
- Add worker type-check to CI.
- Normalize worker test execution.
- Fix worker type-check errors.

### Epic B: Stabilize The Game Engine Boundary

Goal: make the engine a deep pure module and protect app-worker contracts.

Tickets:

- Define public game engine entrypoint.
- Stop sandbox imports from arbitrary worker internals.
- Add app-worker init payload contract test.
- Add game token compatibility test.
- Add result callback contract test.
- Add hidden-zone filtering tests.

### Epic C: Server-Enforce Product Rules

Goal: server-side domain services and rule enforcement.

Tickets:

- Create deck service.
- Add playable/draft deck policy.
- Enforce deck legality before lobby create/join.
- Tighten card search validation.
- Tighten lobby/deck/message schemas.
- Introduce typed domain error results.

### Epic D: Improve Production Debuggability

Goal: know what happened when a live game fails.

Tickets:

- Add structured API logs.
- Add request IDs.
- Add worker lifecycle logs.
- Add game result finalization service.
- Add game debug runbook.

### Epic E: Reduce Frontend And Documentation Drift

Goal: keep UI/layout/docs maintainable.

Tickets:

- Split game viewport shell from normal app shell.
- Resolve high-priority React lint warnings in board code.
- Reduce unused/noisy lint warnings.
- Refresh API docs.
- Write testing strategy.
- Write data integrity policy.

## Recommended Sequencing

1. Restore worker type-check.
2. Normalize local/CI verification.
3. Add app-worker contract tests.
4. Move deck legality enforcement server-side.
5. Introduce domain services for decks and lobbies.
6. Add game result finalization service.
7. Add observability baseline.
8. Split layout shells.
9. Clean high-value React lint warnings.
10. Refresh docs and runbook.

## Professional-Grade North Star

The game engine should be the deepest module in the repo. Everything else should either:

- prepare valid inputs for it,
- render outputs from it,
- persist lifecycle events around it,
- or help developers/admins understand its support status.

For a solo developer, that is the architecture that matters most. It keeps the hardest domain concept in one strong place, reduces context-switching, and makes future changes safer.

## Appendix: Audit Notes Worth Preserving

### Commands And Outcomes

```text
pnpm run type-check
  Passed for main app.

pnpm test
  Passed: 22 files, 211 tests.

pnpm run lint
  Passed with 413 warnings.

pnpm --dir workers/game run type-check
  Failed with stale test fixture errors and production-code type mismatch.

pnpm --dir workers/game test
  Failed locally due to missing nested Vitest module.
```

### Representative Files

- `src/auth.ts`: NextAuth v5 config.
- `src/lib/api-response.ts`: common API auth/response helpers.
- `src/app/api`: product API surface.
- `src/lib/deck-builder/validation.ts`: client/domain deck validation rules.
- `workers/game/src/GameSession.ts`: Durable Object game session lifecycle.
- `workers/game/src/engine/pipeline.ts`: game mutation pipeline.
- `workers/game/src/engine/effect-resolver`: effect resolution system.
- `shared/validators/client-message.ts`: shared WebSocket message validation.
- `prisma/schema.prisma`: durable product model.
- `.github/workflows/ci.yml`: current CI checks.

### Architecture Smell Index

These are not all bugs, but they are signals to watch:

- Worker code and tests no longer type-check together.
- CI omits passing app tests.
- Public schemas accept strings that are later cast to enums.
- Docs mention behavior that code has already changed.
- Route handlers contain direct business logic and transactions.
- Main layout globally applies game-like viewport constraints.
- Lint warnings are numerous enough to become background noise.
- App imports worker/engine code directly for sandbox use.

### Things To Keep

- Server-authoritative game state.
- Shared Zod validation for WebSocket messages.
- Dedicated deck validation engine.
- Durable Object storage for reconnect/hibernation.
- Game rule regression tests.
- Design token discipline.
- Feature-domain component organization.
- Prisma ownership checks in API routes.

