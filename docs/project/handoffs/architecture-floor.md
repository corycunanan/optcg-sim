---
linear-project: Architecture Floor
linear-project-url: https://linear.app/optcg-sim/project/architecture-floor-869e59d8e7ce
last-updated: 2026-04-29 (OPT-324 in review)
---

# Architecture Floor — Handoff Doc

Tighten the runtime safety floor around the game engine, the app↔worker boundary, deck legality, CI, board correctness, and worker WebSocket security. Original floor first; audit follow-ups before new features. Full scope: [`docs/project/ARCHITECTURE-FLOOR-SCOPE.md`](../ARCHITECTURE-FLOOR-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-326](https://linear.app/optcg-sim/issue/OPT-326) | Add root `pnpm verify` and align CI with local verification | 2 | — | Done | [#171](https://github.com/corycunanan/optcg-sim/pull/171) | Gate ticket for PR 1. Adds `pnpm verify` running lint + app type-check + worker type-check + app tests + worker tests + build. CI mirrors verify. |
| 2 | [OPT-327](https://linear.app/optcg-sim/issue/OPT-327) | Restore `workers/game` type-check and refresh stale engine test fixtures | 5 | — | Done | [#171](https://github.com/corycunanan/optcg-sim/pull/171) | Real type fixes at `GameSession.ts:856` (`ActiveEffect`/`RuntimeActiveEffect`) and `visibility.test.ts:16`. Add `@types/node` to worker. Build shared test factories module. **No `as any` patches.** |
| 3 | [OPT-328](https://linear.app/optcg-sim/issue/OPT-328) | Normalize worker test/type-check execution from repo root and CI | 2 | — | Done | [#171](https://github.com/corycunanan/optcg-sim/pull/171) | Workspace already declared in `pnpm-workspace.yaml`. Adds root scripts via `pnpm --filter optcg-game ...` and replaces CI's `cd workers/game && npx vitest run`. |
| 4 | [OPT-262](https://linear.app/optcg-sim/issue/OPT-262) | Reconcile Prisma migration drift (`testOrder` column + modified `simplify_lobby_for_m3`) | 3 | OPT-326 (PR 1 first) | Done | [#172](https://github.com/corycunanan/optcg-sim/pull/172) | **Blocks OPT-298** (Solitaire schema). Two issues: undocumented `testOrder` column, modified `simplify_lobby_for_m3`. Add CI drift guard. |
| 5 | [OPT-329](https://linear.app/optcg-sim/issue/OPT-329) | App↔Worker contract tests: game init, tokens, result callback, hidden-zone filtering | 5 | OPT-327 | Done | [#173](https://github.com/corycunanan/optcg-sim/pull/173) | New `src/__tests__/contracts/`. Pin init payload, token verify, result callback (`GameResultSchema`), notify-end fallback, hidden-zone filtering. |
| 6 | [OPT-330](https://linear.app/optcg-sim/issue/OPT-330) | Enforce playable deck legality server-side before lobby/solitaire game start | 5 | OPT-326 (PR 1 first) | Done | [#175](https://github.com/corycunanan/optcg-sim/pull/175) | **Blocks OPT-298**. Extracts `requirePlayableDeck(deckId, userId)` to `src/lib/decks/`. Wires into `lobbies/route.ts` and `lobbies/join/route.ts`. Returns 422 with structured `details`. |
| 7 | [OPT-331](https://linear.app/optcg-sim/issue/OPT-331) | Centralize idempotent game result finalization across worker callback and fallback concede | 3 | OPT-329 | Done | [#174](https://github.com/corycunanan/optcg-sim/pull/174) | New `src/lib/game/finalize.ts` with `finalizeGameResult()`. Conditional update on non-terminal state. Adds `reasonCode` enum. Tests cover three idempotency races. |
| 8 | [OPT-332](https://linear.app/optcg-sim/issue/OPT-332) | Triage React lint warnings; fix board correctness warnings (refs-during-render, set-state-in-effect) | 5 | — | Done | [#176](https://github.com/corycunanan/optcg-sim/pull/176) | Clears all `react-hooks/refs` and `react-hooks/set-state-in-effect` warnings. Lint warning count: 344. |
| 9 | [OPT-333](https://linear.app/optcg-sim/issue/OPT-333) | Worker WebSocket security audit: token replay, action spam, payload limits, reconnect abuse | 3 | OPT-327 | Done | [#178](https://github.com/corycunanan/optcg-sim/pull/178) | Adds `docs/architecture/WORKER-SECURITY-AUDIT.md`, creates OPT-334–OPT-337 follow-ups, and lands an 8 KiB WS payload cap. |
| 10 | [OPT-337](https://linear.app/optcg-sim/issue/OPT-337) | Enforce one active WebSocket per player in each game session | 3 | OPT-333 | Done | [#179](https://github.com/corycunanan/optcg-sim/pull/179) | Newest socket wins; stale same-player sockets no-op for message/close and do not receive prompts or filtered state. |
| 11 | [OPT-334](https://linear.app/optcg-sim/issue/OPT-334) | Bind worker game tokens to gameId and track replay identifiers | 3 | OPT-333 | Done | [#180](https://github.com/corycunanan/optcg-sim/pull/180) | Tokens are game-scoped, include `jti`, and are one-shot through Durable Object storage. |
| 12 | [OPT-335](https://linear.app/optcg-sim/issue/OPT-335) | Add per-player WebSocket action rate limiting in the game worker | 3 | OPT-333 | Done | [#181](https://github.com/corycunanan/optcg-sim/pull/181) | Token bucket per `(gameId, playerIndex)` before expensive action handling. |
| 13 | [OPT-336](https://linear.app/optcg-sim/issue/OPT-336) | Throttle WebSocket upgrade and reconnect attempts per game player | 2 | OPT-333 | Done | [#183](https://github.com/corycunanan/optcg-sim/pull/183) | Per-player upgrade bucket before socket accept, presence writes, alarms, or broadcasts. |
| 14 | [OPT-324](https://linear.app/optcg-sim/issue/OPT-324) | Flaky test: opt-243 Leader-vs-Leader battle termination intermittently emits 0 END_OF_BATTLE | 3 | OPT-328 | In Review | [#184](https://github.com/corycunanan/optcg-sim/pull/184) | **Cross-project: lives in Game Board Reliability.** Tracked here after WS security follow-ups. Root cause: randomized battle-ready fixture life could enter the legitimate pending-trigger branch before END_OF_BATTLE cleanup. |

**Total estimate:** 47 points (44 in Architecture Floor + 3 from cross-project OPT-324).

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** Project complete — no follow-up tickets in the Action Plan.

### PR phasing

| PR | Tickets | Why this batch |
|----|---------|----------------|
| **PR 1** | OPT-326, OPT-327, OPT-328 | CI floor trio. Atomic — verify needs type-check passing; type-check needs scripts; scripts feed verify. **Must land first.** |
| PR 2 | OPT-262 | Migration drift reconciliation + CI drift guard. Independent after PR 1. |
| PR 3 | OPT-329 | App↔worker contract tests. Pure additions. |
| PR 4 | OPT-330 | Server-side deck legality. **Unblocks OPT-298 Solitaire.** |
| PR 5 | OPT-331 | Idempotent finalization. Depends on PR 3. |
| PR 6 | OPT-332 | Board lint correctness. Independent. |
| PR 7 | OPT-333 | WS security audit + quick-win fix. |
| PR 8 | OPT-337 | Single authoritative player socket after WS audit lands. |
| PR 9 | OPT-334 | Game-scoped worker tokens + replay policy. |
| PR 10 | OPT-335 | Per-player WS action rate limiting. |
| PR 11 | OPT-336 | WS upgrade/reconnect throttling. |
| PR 12 | OPT-324 | Engine flake. Cross-project (Game Board Reliability). |

PRs 2–7 can land in any order after their dependencies clear. PRs 8–11 depend on OPT-333 because they implement findings from the audit.

### Pre-merge gate

None — this initiative starts on a clean main. CI is green for app tests; worker type-check fails locally per OPT-327's failure list. PR 1 will surface the full error inventory on first run.

### Cross-project tickets

- **OPT-324** lives in the **Game Board Reliability** project but is part of this initiative's PR 8. Tracked here in the action plan; project assignment intentionally left in Game Board Reliability so that project's view stays accurate.

### Deferred / tech debt

- Domain service layer for lobbies/decks/results — only the two helpers extracted in this initiative.
- Typed `AppResult<T>` / `AppError` — structured error responses are sufficient.
- Card effect support matrix + feature gates — product roadmap.
- Route-aware shell split — lower leverage.
- Testing strategy doc, runtime boundaries doc, solo-dev runbook — defer until floor settles.
- Request IDs / end-to-end observability — defer until after WS security follow-ups.
- Lint cleanup beyond correctness class (~400 remaining warnings) — separate ticket after OPT-332.

See [`docs/project/ARCHITECTURE-FLOOR-SCOPE.md`](../ARCHITECTURE-FLOOR-SCOPE.md) §"Deferred / tech debt" for full detail.

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

<!--
Copy this block when writing a new handoff:

### OPT-XXX → OPT-YYY
**From:** session on YYYY-MM-DD · **Commit:** `<short-sha>` · **PR:** #NN

- **Primer:** <1 sentence — what changed at the system level>
- **Read first:** `path/to/file.ts`, `path/to/other.ts`
- **Gotchas / do NOT touch:** <what to leave alone and why, OR "none">
- **Unresolved:** <follow-ups, open questions, deferred work, tracking IDs — OR "none">
- **Why this matters for OPT-YYY:** <1–2 sentences tying the above to the next ticket's surface>

-->

### OPT-326/327/328 → OPT-262
**From:** session on 2026-04-29 · **Commit:** `fda72a8` · **PR:** #171

- **Primer:** CI now has one root verification ritual (`pnpm verify`) that runs app + worker checks; worker type-check is green and worker tests run from the repo root via pnpm workspace scripts.
- **Read first:** `package.json`, `.github/workflows/ci.yml`, `workers/game/tsconfig.json`, `workers/game/src/__tests__/factories.ts`
- **Gotchas / do NOT touch:** `workers/game/tsconfig.json` intentionally disables TypeScript `noUnused*` so stale test scaffolding does not block structural worker type-check; ESLint still reports unused/no-explicit-any warnings separately.
- **Unresolved:** Lint still reports 410 warnings; OPT-332 owns the correctness-class React warning pass. Worker schema validation logs many known authored-schema warnings during tests, but the suite passes.
- **Why this matters for OPT-262:** Once #171 merges, migration drift work can rely on `pnpm verify` and CI to catch app, worker, and build regressions before schema changes land.

### OPT-262 → OPT-329
**From:** session on 2026-04-29 · **Commit:** `f17a914` · **PR:** #172

- **Primer:** Prisma migration history is reconciled for `decks.testOrder`; CI now has a Postgres-backed `pnpm db:check-migration-drift` guard before the full `pnpm verify` gate.
- **Read first:** `prisma/migrations/20260429054500_add_deck_test_order/migration.sql`, `package.json`, `.github/workflows/ci.yml`, `src/app/api/game/token/route.ts`, `workers/game/src/auth.ts`
- **Gotchas / do NOT touch:** Neon dev already has `20260429054500_add_deck_test_order` marked applied; the old rolled-back `20260321120000_simplify_lobby_for_m3` row had its checksum repaired to match the successful file so `migrate dev` stops reporting history drift.
- **Unresolved:** `prisma migrate dev --create-only` generated an empty migration after repair; it was removed. Trust `pnpm prisma migrate status`, DB-to-schema `migrate diff`, and `pnpm db:check-migration-drift` for this PR's verification.
- **Why this matters for OPT-329:** Contract tests can now add app/worker boundary coverage without also carrying migration uncertainty; the CI floor should catch drift before those tests become the next source of truth.

### OPT-329 → OPT-331
**From:** session on 2026-04-29 · **Commit:** `a48c8ea` · **PR:** #173

- **Primer:** App-built and worker-built boundary payloads now have a plain Vitest contract suite covering game init, WS tokens, result callbacks, notify-end fallback, and hidden-zone filtering.
- **Read first:** `src/__tests__/contracts/app-worker-contracts.test.ts`, `src/lib/game/init-payload.ts`, `src/lib/game/token.ts`, `workers/game/src/util/result.ts`, `src/app/api/game/result/route.ts`
- **Gotchas / do NOT touch:** `verifyGameToken` accepts an optional `expectedGameId`; legacy tokens without `gameId` still pass for compatibility, but tokens with a mismatched `gameId` fail.
- **Unresolved:** Result finalization still lives in multiple routes/paths; OPT-331 owns centralizing the database update and idempotency semantics.
- **Why this matters for OPT-331:** The result callback contract now pins the worker payload shape before finalization moves into a shared helper, so refactors should fail tests if they drift the callback schema.

### OPT-331 → OPT-330
**From:** session on 2026-04-29 · **Commit:** `cf58da3` · **PR:** #174

- **Primer:** Game result finalization now flows through `src/lib/game/finalize.ts`; worker callbacks and fallback concede share a terminal-state guard, and final results can persist nullable `reasonCode`.
- **Read first:** `src/lib/game/finalize.ts`, `src/app/api/game/result/route.ts`, `src/app/api/game/[id]/route.ts`, `src/lib/validators/game.ts`, `prisma/migrations/20260429062000_add_game_result_reason_code/migration.sql`
- **Gotchas / do NOT touch:** `finalizeGameResult` only accepts terminal statuses; `GameResultSchema` still parses `IN_PROGRESS` for compatibility, but `/api/game/result` rejects it.
- **Unresolved:** Worker reason-code inference is text-based for now in `workers/game/src/util/result.ts`; avoid coupling OPT-330 deck legality to finalization behavior.
- **Why this matters for OPT-330:** Deck legality can reject invalid starts before game creation while finalization idempotency now protects the separate post-start end paths.

### OPT-330 → OPT-332
**From:** session on 2026-04-29 · **Commit:** `6a922a5` · **PR:** #175

- **Primer:** Lobby creation and lobby join now call `requirePlayableDeck(deckId, userId)` at the game-start boundary; draft deck saves remain permissive and no cached `Deck.isPlayable` column was added.
- **Read first:** `src/lib/decks/playable.ts`, `src/lib/deck-builder/validation.ts`, `src/app/api/lobbies/route.ts`, `src/app/api/lobbies/join/route.ts`, `src/lib/decks/playable.test.ts`
- **Gotchas / do NOT touch:** `requirePlayableDeck` fetches deck rows and cards separately so missing card IDs can produce structured `DECK_INVALID` details; both guest and host decks are checked before worker init.
- **Unresolved:** OPT-298 should reuse `requirePlayableDeck` for solitaire game start; UI-specific rendering of the structured 422 details is still deferred.
- **Why this matters for OPT-332:** The lint warning baseline is still 410 warnings with 0 errors after `pnpm verify`; OPT-332 can focus on the board correctness warnings without carrying deck legality work.

### OPT-332 → OPT-333
**From:** session on 2026-04-29 · **Commit:** `23ff196` · **PR:** #176

- **Primer:** The React Compiler correctness-class lint warnings are cleared: zero `react-hooks/refs`, zero `react-hooks/set-state-in-effect`, and total lint warnings are down to 344.
- **Read first:** `eslint.config.mjs`, `src/components/game/board-layout/board-layout.tsx`, `src/components/game/board-layout/hand-layer.tsx`, `src/hooks/use-field-arrivals.ts`, `src/hooks/use-card-transitions.ts`
- **Gotchas / do NOT touch:** `workers/game/.wrangler/**` and `workers/game/coverage/**` are now ignored as generated lint artifacts; remaining warnings are mostly worker `any`/unused-var cleanup, not React hook correctness.
- **Unresolved:** Local smoke check was HTTP-only because the in-app browser tool was unavailable; `/sandbox` returned HTTP 200 from the Next dev server.
- **Why this matters for OPT-333:** The WebSocket security audit can focus on worker token/reconnect/payload behavior without being distracted by React Compiler warning debt.

### OPT-333 → OPT-337
**From:** session on 2026-04-29 · **Commit:** `0ae4299` · **PR:** #178

- **Primer:** The worker WebSocket security audit is documented, OPT-334–OPT-337 were created as follow-ups, and OPT-333 landed the narrow 8 KiB inbound message cap.
- **Read first:** `docs/architecture/WORKER-SECURITY-AUDIT.md`, `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-333-message-size.test.ts`, `src/hooks/use-game-ws.ts`
- **Gotchas / do NOT touch:** Keep OPT-337 scoped to authoritative socket semantics; token `gameId`/`jti` work belongs to OPT-334, action buckets to OPT-335, reconnect throttling to OPT-336.
- **Unresolved:** Duplicate player sockets can still desync presence: `getWebSocketForPlayer()` returns the first tagged socket, while `webSocketClose()` marks the player disconnected when any tagged socket closes.
- **Why this matters for OPT-337:** OPT-337 should fix the highest-risk correctness/security overlap from the audit before layering token replay and rate-limit policies on top.

### OPT-337 → OPT-334
**From:** session on 2026-04-29 · **Commit:** `c7c298e` · **PR:** #179

- **Primer:** Player WebSocket policy is now newest-socket-wins; each accepted socket gets hibernation attachment metadata, older same-player sockets are closed as superseded, and stale message/close events cannot flip presence.
- **Read first:** `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-337-authoritative-socket.test.ts`, `docs/architecture/WORKER-SECURITY-AUDIT.md`, `src/lib/game/token.ts`, `src/app/api/game/token/route.ts`, `workers/game/src/util/auth.ts`
- **Gotchas / do NOT touch:** Keep OPT-334 focused on token `gameId`/`jti` semantics; action buckets remain OPT-335 and reconnect/upgrade throttling remains OPT-336.
- **Unresolved:** Tokens can still be replayed during their TTL and legacy tokens without `gameId` still pass expected-game validation; OPT-334 owns that policy decision.
- **Why this matters for OPT-334:** The socket surface now has one authoritative per-player delivery target, so token replay work can bind or reject upgrades without also carrying duplicate-socket presence behavior.

### OPT-334 → OPT-335
**From:** session on 2026-04-29 · **Commit:** `6bb497c` · **PR:** #180

- **Primer:** Worker game tokens are now minted only after app-side game membership checks, must carry `gameId` and `jti`, and are consumed once in Durable Object storage for both WebSocket and card DB access.
- **Read first:** `workers/game/src/GameSession.ts`, `workers/game/src/util/auth.ts`, `workers/game/src/util/token-replay.ts`, `src/app/api/game/token/route.ts`, `src/__tests__/contracts/app-worker-contracts.test.ts`
- **Gotchas / do NOT touch:** Keep OPT-335 scoped to action-message throttling after auth; reconnect/upgrade churn remains OPT-336, and token replay policy is already one-shot.
- **Unresolved:** none for OPT-334. OPT-335 should rate-limit valid authenticated `game:action` messages before expensive turn/prompt/pipeline work.
- **Why this matters for OPT-335:** Action buckets can key on the authenticated `(gameId, playerIndex)` path after token validation without also solving token scoping or replay.

### OPT-335 → OPT-336
**From:** session on 2026-04-29 · **Commit:** `e83d4e9` · **PR:** #181

- **Primer:** Authenticated player actions now spend a Durable Object-local token bucket before validation or engine handling; malformed/unknown envelopes use a smaller abuse bucket, and `game:leave` stays available.
- **Read first:** `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-335-action-rate-limit.test.ts`, `docs/architecture/WORKER-SECURITY-AUDIT.md`, `src/hooks/use-game-ws.ts`
- **Gotchas / do NOT touch:** Keep OPT-336 scoped to upgrade/reconnect churn; action-message throttling, token scoping, replay, and authoritative newest-socket behavior are already covered by OPT-335/334/337.
- **Unresolved:** none for OPT-335. OPT-336 should decide retry-friendly rejection semantics for excessive upgrades without weakening one-shot token replay.
- **Why this matters for OPT-336:** The hot message path is now protected, so the remaining WebSocket abuse surface is repeated valid-token acquisition, upgrade, close, alarm, and presence churn.

### OPT-336 → OPT-324
**From:** session on 2026-04-29 · **Commit:** `37b93b1` · **PR:** #183

- **Primer:** Valid WebSocket reconnect loops now spend a per-game/player Durable Object-local upgrade bucket after one-shot token validation but before socket accept, connected-state writes, alarm churn, or broadcasts.
- **Read first:** `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-336-upgrade-rate-limit.test.ts`, `docs/architecture/WORKER-SECURITY-AUDIT.md`, `workers/game/src/engine/triggers.ts`
- **Gotchas / do NOT touch:** The WebSocket security follow-ups are now covered by OPT-333/337/334/335/336; OPT-324 should stay focused on the intermittent `END_OF_BATTLE` trigger-ordering failure.
- **Unresolved:** none for OPT-336. OPT-324 still needs root-cause work and the requested 20/20 clean-run confidence pass.
- **Why this matters for OPT-324:** With the worker WS security floor finished, the Architecture Floor critical path moves to the cross-project engine flake without carrying reconnect-abuse debt.

### OPT-324 → Project complete
**From:** session on 2026-04-29 · **Commit:** `23018d4` · **PR:** #184

- **Primer:** The Leader-vs-Leader `END_OF_BATTLE` flake was rooted in randomized test fixture life: a shuffled `[Trigger]` life card correctly paused battle cleanup, so the test sometimes observed zero terminal events before trigger resolution.
- **Read first:** `workers/game/src/__tests__/helpers.ts`, `workers/game/src/__tests__/opt-243-battle-termination.test.ts`, `workers/game/src/engine/battle.ts`
- **Gotchas / do NOT touch:** Production battle cleanup was already behaving correctly for pending Trigger windows; keep this as a fixture determinism fix unless a new runtime repro appears.
- **Unresolved:** none. The Architecture Floor action plan has no remaining Backlog/Todo tickets after OPT-324.
- **Why this matters for follow-up:** Future battle tests that need immediate cleanup should pin non-trigger life, while tests that need Trigger timing should assert the pending-trigger branch explicitly.
