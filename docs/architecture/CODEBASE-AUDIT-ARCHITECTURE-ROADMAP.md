# Codebase Audit, Architecture Roadmap, And Linear Priority Review

Date: April 28, 2026

Scope: read-only codebase audit plus Linear audit. This document is intended to be ticket-ready: each section has context, priority, rough estimates, and notes about whether matching Linear issues already exist.

## Executive Summary

The OPTCG Simulator codebase has a strong foundation: a Next.js app owns product workflows, a Cloudflare Durable Object owns live gameplay, Prisma owns durable product data, and `shared/` carries cross-runtime contracts. The biggest architectural asset is the server-authoritative game worker. The biggest risk is that the game worker and its tests have grown faster than the surrounding verification, CI, and boundary contracts.

For a solo developer, "professional-grade architecture" should mean:

- One command that tells you whether the app is safe to ship.
- Clear boundaries between app, worker, shared contracts, and pure game engine.
- Server-side enforcement of product rules.
- Contract tests at the app-worker boundary.
- Domain services for high-risk workflows.
- Structured debugging for live games.
- Docs that help future-you reload the system quickly.

## Audit Baseline

Commands run during the audit:

```bash
pnpm run type-check
pnpm run lint
pnpm test
pnpm --dir workers/game run type-check
pnpm --dir workers/game test
```

Observed results:

- `pnpm run type-check`: passed for the main Next.js app.
- `pnpm test`: passed, 22 files / 211 tests.
- `pnpm run lint`: passed, but with 413 warnings.
- `pnpm --dir workers/game run type-check`: failed.
- `pnpm --dir workers/game test`: failed locally because nested worker Vitest resolution was broken in this checkout.

## Linear Audit Summary

Linear already captures a lot of UI/game-board work and some older architecture debt. The strongest existing overlap with this audit is:

- Worker typing debt: `OPT-102`, `OPT-193`, and completed `OPT-130`.
- API extraction/validation: completed `OPT-133`, completed `OPT-195`, existing `OPT-197`.
- Worker observability/deploy: completed `OPT-204`, completed `OPT-279`.
- Data integrity: open `OPT-262`; completed `OPT-96`, `OPT-127`.
- Game reliability: open `OPT-324`, `OPT-151`, `OPT-162`.
- Documentation: open `OPT-97`, `OPT-104`, `OPT-105`.

The gaps are that the highest-leverage architecture items are not yet represented as explicit Linear issues:

- Root `pnpm verify` and CI alignment.
- Worker type-check restoration as a focused, current ticket.
- Worker package/test execution normalization.
- App-worker contract test suite.
- Server-side deck legality enforcement.
- Typed domain errors.
- Domain service layer for decks/lobbies/game results.
- Game result finalization service.
- Data integrity policy doc.
- Request IDs and app-side observability.
- Feature/support flags.
- Card effect support matrix.
- Route-aware shell split.
- Testing strategy doc.
- Solo-dev runbook.

## Highest Priority Linear Recommendations

This is my recommended priority order, combining existing Linear issues and not-yet-created issues from the architecture roadmap.

### P0-1: Create Root Verification Command And Align CI

Status in Linear: not yet created.

Priority: Critical

Estimate: 2 points

Suggested labels: `dev-experience`, `ci`, `quality`

Why this is first: solo-dev professional-grade architecture starts with one reliable shipping ritual. Right now app tests pass locally but are not enforced by CI, worker type-check fails locally, and worker test execution is inconsistent.

Suggested Linear title:

> Add root `pnpm verify` and align CI with local verification

Scope:

- Add root `pnpm verify`.
- Ensure CI runs app tests.
- Ensure CI runs worker type-check.
- Ensure CI uses the same worker test command as local.
- Keep build using required fake env vars.

Acceptance criteria:

- `pnpm verify` runs lint, app type-check, app tests, worker type-check, worker tests, and build.
- CI either calls `pnpm verify` or mirrors it exactly.
- Any failing worker type-check blocks CI once P0-2 lands.

Related existing Linear issues:

- `OPT-59` M4.5 integration tests and CI pipeline, likely historical/completed.
- `OPT-105` testing patterns, related but not the same.
- `OPT-324` demonstrates why CI reliability matters.

### P0-2: Restore Worker Type-Check

Status in Linear: partially represented, but needs a new focused ticket.

Priority: Critical

Estimate: 5 points

Suggested labels: `game-engine`, `type-safety`, `quality`

Why this is second: the worker is the authoritative rules engine. If it cannot type-check, the most important part of the system has a weak safety net.

Suggested Linear title:

> Restore `workers/game` type-check and refresh stale engine test fixtures

Scope:

- Fix production type mismatch around `GameSession.stripInactiveEffects`.
- Update stale test fixtures for current `GameState`, `TurnState`, `LifeCard`, `BattleContext`, and `GameEvent` shapes.
- Add shared test factories to prevent fixture drift.
- Avoid broad `as any` patches.

Acceptance criteria:

- `pnpm --dir workers/game run type-check` passes.
- Worker tests still pass.
- Fixture construction goes through helpers for common game state objects.

Related existing Linear issues:

- `OPT-102` Replace `as any` casts in effect resolver with typed helpers.
- `OPT-193` TYPE-1: `as any` escapes in worker action/cost code.
- `OPT-130` Fix shared/worker type boundary, completed but current audit shows type drift remains.

Recommendation: keep `OPT-102` and `OPT-193`, but create this new ticket as the immediate unblocker. Do not bury the current type-check failure inside broad type-debt cleanup.

### P0-3: Normalize Worker Package And Test Execution

Status in Linear: not yet created.

Priority: High

Estimate: 2 points

Suggested labels: `worker`, `dev-experience`, `ci`

Why this matters: local worker tests failed because Vitest resolution was broken in the nested worker package. CI uses a different command than local. That is exactly the kind of drift that wastes solo-dev time.

Suggested Linear title:

> Normalize worker test/type-check commands from repo root and CI

Scope:

- Decide whether `workers/game` is a formal pnpm workspace package.
- Add root scripts such as `test:worker` and `type-check:worker`.
- Update CI to use the same commands.
- Document the commands.

Acceptance criteria:

- Fresh install can run worker tests from root.
- Fresh install can run worker type-check from root.
- CI does not use a one-off `cd workers/game && npx vitest run` if local uses something else.

Related existing Linear issues:

- `OPT-279` fixed deploy drift, same class of problem but for deployment.

### P1-1: Fix Current Engine Flake

Status in Linear: existing issue `OPT-324`.

Priority: High

Estimate: existing issue has no estimate; suggest 2-3 points.

Why this matters: flaky tests destroy trust in CI. This one is especially important because it touches battle termination ordering and surfaced on unrelated PRs.

Existing Linear:

- `OPT-324` Flaky test: opt-243 Leader-vs-Leader battle termination intermittently emits 0 END_OF_BATTLE.

Recommendation:

- Raise priority from Medium to High.
- Do this after or alongside worker test command normalization.
- Keep the acceptance criterion of 20/20 clean worker test runs.

### P1-2: Add App-Worker Contract Tests

Status in Linear: not yet created.

Priority: High

Estimate: 5 points

Suggested labels: `tests`, `worker`, `api`, `integration`

Why this matters: the app-worker boundary is where many production failures will happen. Existing issues cover pieces like `GameInitPayload` validation, token validation, and secret validation, but there is no explicit contract-test suite that proves both sides remain compatible.

Suggested Linear title:

> Add app-worker contract tests for game init, tokens, result callback, and hidden-zone filtering

Scope:

- Test lobby/solitaire game init payload against worker validation.
- Test app-minted game tokens against worker verification.
- Test worker result callback body against `/api/game/result`.
- Test hidden-zone filtering never leaks opponent hand, deck, or face-down life.
- Test `notify-end` compatibility if possible without Cloudflare runtime.

Acceptance criteria:

- Tests fail when app and worker payloads drift.
- Token compatibility is covered.
- Hidden-zone filtering has regression coverage.

Related existing Linear issues:

- `OPT-132` Validate GameInitPayload in Durable Object, likely completed or historical.
- `OPT-187` Validate WebSocket action params with Zod, likely completed.
- `OPT-116` secret-zone leak, likely completed or historical but conceptually related.
- `OPT-298` solitaire backend will make this even more important.

### P1-3: Server-Side Deck Legality Enforcement

Status in Linear: not yet created.

Priority: High

Estimate: 5 points

Suggested labels: `decks`, `api`, `domain-logic`, `integrity`

Why this matters: the deck builder has validation logic, but server routes should enforce whether a deck is playable before it can enter a game. This becomes more urgent with `OPT-298` Solitaire Mode because a new game creation path will mirror lobby join and could duplicate validation gaps.

Suggested Linear title:

> Enforce playable deck legality server-side before lobby and solitaire game start

Scope:

- Define draft vs playable deck policy.
- Reuse/adapt existing deck validation server-side.
- Validate before lobby create/join.
- Validate before solitaire start.
- Return structured validation details.

Acceptance criteria:

- Invalid decks cannot start games.
- Draft saves remain possible if desired.
- Tests cover 50-card count, leader type, color affinity, banned cards, restricted cards, leaders in main deck, missing card IDs.

Related existing Linear issues:

- `OPT-14` deck editor with real-time rule validation, likely product/UI-level.
- `OPT-298` solitaire backend should block on this or include it.
- `OPT-21` lobby system, historical.

Recommendation:

- Create this before implementing `OPT-298`, or make it a blocking dependency of `OPT-298`.

### P1-4: Reconcile Prisma Migration Drift

Status in Linear: existing issue `OPT-262`.

Priority: High

Estimate: suggest 2-3 points.

Why this matters: migration drift blocks clean DB evolution and undermines confidence in deploys. This is foundational data hygiene.

Existing Linear:

- `OPT-262` Reconcile Prisma migration drift.

Recommendation:

- Raise from Medium to High.
- Do before adding new schema work like `OPT-298` mode column or any new domain models.

### P1-5: Introduce Domain Services For Decks, Lobbies, And Game Results

Status in Linear: partially represented by completed `OPT-133`; not yet created for the deeper service layer.

Priority: High

Estimate: 8 points, ideally split into 3 tickets.

Suggested labels: `architecture`, `api`, `refactor`

Why this matters: completed `OPT-133` extracted some helpers, which was good. The next step is deeper: routes should call domain services that own transactions, policies, and domain errors.

Suggested Linear tickets:

1. `Create deck service with draft/playable validation policy`
2. `Create lobby service for create/join/cancel transaction boundaries`
3. `Create game result finalization service`

Acceptance criteria:

- Route handlers become auth/parse/call/respond.
- Services can be tested without Next.js `Request`.
- Transactions live inside services.
- Ownership checks are centralized.

Related existing Linear:

- `OPT-133` completed helper extraction.
- `OPT-96` completed lobby join transaction fix.
- `OPT-127` completed deck card transaction fix.
- `OPT-298` should reuse this shape if possible.

### P1-6: Add Game Result Finalization Service

Status in Linear: not yet created.

Priority: High

Estimate: 3 points

Suggested labels: `game`, `api`, `worker`, `data-integrity`

Why this matters: games can end from engine defeat, concede, disconnect timeout, fallback concede, or client finalize. That is a lot of entry points into one state transition.

Suggested Linear title:

> Centralize idempotent game result finalization across worker callback and fallback concede

Scope:

- Centralize finalization in one service.
- Enforce terminal-state idempotency.
- Add reason codes in addition to freeform reason text.
- Test first-writer-wins behavior.

Acceptance criteria:

- Repeated worker callbacks are harmless.
- Fallback concede and worker result callback share finalization logic.
- Terminal states cannot be overwritten.

Related existing Linear:

- `OPT-188` rate-limit `/api/game/result`, likely completed.
- `OPT-279` noted `/notify-end` drift.
- `OPT-298` solitaire backend will add another game creation path.

### P2-1: Tighten Public API Validation

Status in Linear: partially represented.

Priority: Medium-High

Estimate: 3 points

Suggested labels: `api`, `validation`, `security`

Why this matters: `OPT-195` wired `CardSearchParamsSchema`, but the schema remains permissive. The audit found arbitrary strings that are later cast or parsed. That should become stricter normalized input.

Suggested Linear title:

> Tighten API query/body schemas with typed normalized inputs

Scope:

- Card search enum validation for type, ban status, sort, order.
- Numeric bounds for page, limit, cost, power, block.
- Message ID format validation.
- Deck/lobby format validation.
- Max lengths for text fields.

Acceptance criteria:

- Invalid query values return clear 400s.
- Route code no longer casts arbitrary strings into enums.
- Tests cover bad enum values and numeric edge cases.

Related existing Linear:

- `OPT-195` completed schema wiring.
- `OPT-197` validate messageId in `/api/messages/read`, still open.
- `OPT-92` introduce Zod validation, likely historical/completed.
- `OPT-142` client-side API response validation.

### P2-2: Typed Domain Error Pattern

Status in Linear: not yet created.

Priority: Medium

Estimate: 3 points

Suggested labels: `api`, `architecture`, `developer-experience`

Why this matters: once services exist, they need structured errors for deck validation, conflicts, auth, not found, and worker failures.

Suggested Linear title:

> Introduce typed AppResult/AppError pattern for API domain services

Scope:

- Define typed `AppResult<T>` and `AppError`.
- Add API mapper.
- Use first in deck service.
- Return structured deck validation details.

Acceptance criteria:

- Services do not return raw `NextResponse`.
- UI can distinguish validation errors from generic failures.
- Route error mapping is consistent.

Related existing Linear:

- `OPT-95` standardize API response shapes.
- `OPT-139` standardize API response helpers, likely completed.

### P2-3: Data Integrity Policy Doc

Status in Linear: not yet created.

Priority: Medium

Estimate: 2 points

Suggested labels: `data-integrity`, `docs`, `architecture`

Why this matters: transaction usage is improving, but the policy is implicit. A solo dev benefits from writing down when transactions and optimistic locking are mandatory.

Suggested Linear title:

> Document database transaction and idempotency policy

Scope:

- Create `docs/architecture/DATA-INTEGRITY.md`.
- Cover lobby joins, deck updates, friend accepts, game finalization, worker callbacks, admin imports.
- Link follow-up issues for violations.

Acceptance criteria:

- High-risk multi-row writes are listed.
- Policy states when to use transactions and optimistic locking.
- Future schema/service tickets can reference it.

Related existing Linear:

- `OPT-96`, `OPT-127`, `OPT-262`.

### P2-4: Observability Baseline Beyond Worker Logs

Status in Linear: partially represented by completed `OPT-204`.

Priority: Medium

Estimate: 5 points

Suggested labels: `observability`, `production`, `debugging`

Why this matters: `OPT-204` added worker structured logging. The next step is end-to-end game debugging: request IDs, app logs, worker callback status, and a way to inspect a failed game.

Suggested Linear title:

> Add end-to-end game observability with request IDs and result-callback tracing

Scope:

- Add request IDs to API logs.
- Standardize API error log shape.
- Include safe `gameId`, `lobbyId`, route, action type.
- Log worker result callback success/failure.
- Add debug checklist or script for a game ID.

Acceptance criteria:

- A failed game can be traced by `gameId`.
- API and worker logs correlate.
- Hidden/private card data is not logged.

Related existing Linear:

- `OPT-204` completed worker logging.
- `OPT-207` standardize console.error prefixes.
- `OPT-157` completed WebSocket logging/action throttle.

### P2-5: Card Effect Support Matrix

Status in Linear: not yet created.

Priority: Medium

Estimate: 5 points

Suggested labels: `game-engine`, `card-data`, `admin`, `quality`

Why this matters: the simulator needs a trustworthy answer to which cards are fully supported, low confidence, unsupported, or covered by tests.

Suggested Linear title:

> Generate card effect support matrix from schemas, card data, and tests

Scope:

- Generate JSON or markdown matrix.
- Include card ID, set, schema presence, confidence, known gaps, test coverage, live eligibility.
- Surface in admin or dev report.
- Use as future gate for live games if needed.

Acceptance criteria:

- Unsupported/low-confidence cards are identifiable.
- Matrix can be regenerated.
- Admin/dev view can consume it.

Related existing Linear:

- Many schema-specific tickets, such as `OPT-184`, `OPT-117`.
- `OPT-107` audit effect resolver for unimplemented schema features.

### P2-6: Feature Flags And Support Gates

Status in Linear: not yet created.

Priority: Medium

Estimate: 3 points

Suggested labels: `release-safety`, `admin`, `game-engine`

Why this matters: a card simulator will always have partial support. You need a safe way to allow unsupported cards in dev/sandbox while blocking or warning in live games.

Suggested Linear title:

> Add support gates for unsupported and low-confidence card effects

Scope:

- Define support flag model.
- Gate live lobby/solitaire games.
- Allow sandbox/dev override.
- Surface unsupported cards in deck builder.

Acceptance criteria:

- Unsupported cards cannot surprise users in live games.
- Dev/admin can still test them.
- Gate reads from support matrix or card metadata.

Related existing Linear:

- P2-5 support matrix should probably land first.

### P2-7: Split Route-Aware Shells

Status in Linear: not yet created as a root-layout concern; related board shell work is mostly done.

Priority: Medium

Estimate: 3 points

Suggested labels: `frontend`, `layout`, `accessibility`

Why this matters: the global root shell uses a viewport-locked layout that is good for game routes but less ideal for normal pages.

Suggested Linear title:

> Split game viewport shell from normal app document shell

Scope:

- Keep scaled game board viewport behavior.
- Allow admin/decks/lobbies/home pages to scroll naturally.
- Make SocialShell behavior explicit per route group.

Acceptance criteria:

- Game board still works.
- Non-game pages are not trapped by root `overflow-hidden`.
- Mobile/zoom behavior improves on non-game pages.

Related existing Linear:

- `OPT-314`, `OPT-315`, `OPT-320`, `OPT-321` are related board-shell tickets and are completed.

### P2-8: React Lint Warning Reduction

Status in Linear: partially represented by board/refactor issues.

Priority: Medium

Estimate: 5 points, split by area.

Suggested labels: `frontend`, `react`, `performance`, `quality`

Why this matters: lint passes with 413 warnings. Warnings around refs during render and synchronous state updates in effects should not be allowed to become background noise.

Suggested Linear title:

> Reduce React lint warnings in board, modals, and data-fetching components

Scope:

- Triage warnings by category.
- Fix game-board ref/render warnings first.
- Fix modal/data-fetch effect warnings next.
- Remove unused variables and stale disables.

Acceptance criteria:

- Warning count is substantially lower.
- Game-board `react-hooks/refs` warnings are resolved.
- Remaining warnings are intentional.

Related existing Linear:

- `OPT-264` Decompose BoardLayout god component.
- `OPT-265` Split `useGameSession`.
- `OPT-162` memoization/throttle.
- `OPT-103` older duplicate of hook split.

### P2-9: Game Board Accessibility

Status in Linear: existing issue `OPT-151`.

Priority: Medium-High

Estimate: existing 5 points.

Why this matters: not directly part of my architecture recommendations, but it is a professional-grade requirement and already has a detailed ticket.

Existing Linear:

- `OPT-151` Game board WCAG AA accessibility.

Recommendation:

- Keep as High priority, but schedule after the verification/worker foundation unless accessibility is a near-term launch requirement.

### P3: Documentation And Runbooks

Status in Linear: partially represented.

Priority: Medium

Estimate: 5-8 points total, split.

Suggested labels: `docs`, `architecture`, `developer-experience`

Recommended tickets:

1. `Write testing strategy doc and map it to CI`
2. `Write runtime boundaries doc for app / worker / shared / engine`
3. `Write solo-dev operational runbook`
4. `Refresh API docs to match current auth and response shapes`

Related existing Linear:

- `OPT-97` Expand CLAUDE.md and cursor rules.
- `OPT-104` Add README files and architectural documentation.
- `OPT-105` Create example test files.

Recommendation:

- Do not do all docs before the architecture work. Write the testing strategy and runbook early; refresh broader docs after service/boundary decisions settle.

## Existing Linear Issues I Would Reprioritize

### Raise Priority

- `OPT-324`: Medium -> High. Flaky engine tests weaken all CI trust.
- `OPT-262`: Medium -> High. Migration drift should be fixed before new schema work.
- `OPT-193`: Medium -> High if not folded into P0-2. Worker typing is core architecture, not ordinary cleanup.
- `OPT-151`: keep High if accessibility is launch-relevant; otherwise Medium-High.

### Keep But Do Later

- `OPT-323`, `OPT-283`, `OPT-284`, `OPT-263`, `OPT-74`: good product polish, but lower architecture priority than verification, worker type-check, deck legality, and data integrity.
- Solitaire sequence `OPT-298` through `OPT-303`: valuable product feature, but I would block or precede it with server-side deck legality and migration drift cleanup.
- `OPT-264`, `OPT-265`, `OPT-103`: real tech debt, but less urgent than current verification and worker safety.

### Consider Closing Or Merging

- `OPT-103` and `OPT-265` overlap heavily. Keep the newer/more accurate one and close/duplicate the older.
- `OPT-102`, `OPT-193`, and the new worker type-check restoration ticket should be related. The new ticket should be the immediate unblocker; the others can remain broader typed-helper cleanup.

## Not-Yet-Created Issues From This Roadmap

Create these if you want Linear to fully reflect the architecture roadmap:

1. Add root `pnpm verify` and align CI with local verification.
2. Restore `workers/game` type-check and refresh stale engine test fixtures.
3. Normalize worker test/type-check commands from repo root and CI.
4. Add app-worker contract tests for init, token, result callback, and hidden-zone filtering.
5. Enforce playable deck legality server-side before lobby and solitaire start.
6. Create deck service with draft/playable validation policy.
7. Create lobby service for transaction and ownership boundaries.
8. Centralize idempotent game result finalization.
9. Introduce typed `AppResult` / `AppError` for API domain services.
10. Tighten API query/body schemas with normalized typed inputs.
11. Document database transaction and idempotency policy.
12. Add end-to-end game observability with request IDs.
13. Generate card effect support matrix.
14. Add support gates for unsupported and low-confidence card effects.
15. Split game viewport shell from normal app document shell.
16. Reduce React lint warnings in board, modal, and data-fetching code.
17. Write testing strategy doc and map it to CI.
18. Write runtime boundaries doc.
19. Write solo-dev operational runbook.
20. Refresh API docs to match current auth and response shapes.

## Suggested Next 10 Tickets To Work

My opinionated top 10:

1. New: Add root `pnpm verify` and align CI.
2. New: Restore worker type-check.
3. New: Normalize worker package/test execution.
4. Existing: `OPT-324` engine flake.
5. Existing: `OPT-262` Prisma migration drift.
6. New: Server-side playable deck legality.
7. New: App-worker contract tests.
8. New: Game result finalization service.
9. Existing/new hybrid: `OPT-193` plus worker typed fixture cleanup.
10. New: Deck/lobby domain service extraction.

This ordering tightens the floor before adding more feature surface. It is not glamorous, but it is the fastest path to a codebase that lets a solo dev move faster without feeling haunted by invisible breakage.

