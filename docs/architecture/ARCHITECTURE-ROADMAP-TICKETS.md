# Architecture Roadmap — Linear Ticket Batch

Date: 2026-04-28
Source: Revised plan after Codex audit (`CODEBASE-AUDIT-ARCHITECTURE-ROADMAP.md`) + Claude critique pass.

Each ticket below is structured to drop directly into Linear:

- **Title** — copy/paste as the issue title
- **Priority / Estimate / Labels** — Linear fields
- **Depends on** — explicit ordering signal
- **Why** — context for future-you / reviewers
- **Files** — concrete code paths verified against current `main` (commit `4c59d77`)
- **Scope** — work to do, in order
- **Acceptance criteria** — definition of done
- **Out of scope** — explicit non-goals where the boundary matters

The first three tickets are a single coherent unit (CI floor) and should land in one PR or a tight series. Tickets 4–10 are independent and can be ordered/parallelized after the floor is in place.

Verified baseline as of audit:

- `pnpm run type-check` — passes (app)
- `pnpm test` — passes (211 tests)
- `pnpm run lint` — passes with **413 warnings**
- `pnpm --dir workers/game run type-check` — **fails** (real type errors + drifted test fixtures)
- CI runs `cd workers/game && npx vitest run` (drifts from local)
- `pnpm-workspace.yaml` declares `workers/*` as a workspace, but root has no `*:worker` scripts

---

## 1. Add root `pnpm verify` and align CI

**Priority:** Critical
**Estimate:** 2 points
**Labels:** `dev-experience`, `ci`, `quality`
**Depends on:** none (but ticket 2 must land before `verify` can be made required)

### Why
There is no single command that tells you whether the repo is safe to ship. CI (`/.github/workflows/ci.yml`) runs lint, app type-check, app tests, worker tests, and build — but **not** worker type-check, and the worker test invocation (`cd workers/game && npx vitest run`) is different from local. A solo-dev professional setup starts with one ritual that works the same locally and in CI.

### Files
- `package.json` (root, scripts block at lines 5–28)
- `.github/workflows/ci.yml`
- `pnpm-workspace.yaml` (already declares `workers/*`)

### Scope
1. Add root scripts:
   - `type-check:worker` → `pnpm --filter optcg-game type-check`
   - `test:worker` → `pnpm --filter optcg-game test`
   - `verify` → `pnpm lint && pnpm type-check && pnpm type-check:worker && pnpm test && pnpm test:worker && pnpm build`
2. Update `ci.yml` to call `pnpm verify` (or mirror it step-by-step for nicer failure output) instead of the current six separate steps with the `cd workers/game` drift.
3. Keep the existing fake-env trick for `pnpm build` in CI.
4. Document the command in `README.md` or a new `docs/development/VERIFY.md` (one paragraph).

### Acceptance criteria
- `pnpm verify` exists at the repo root and runs the full chain end-to-end.
- CI uses the same command (or a step-for-step mirror).
- A failing worker type-check blocks CI **once ticket 2 lands**. Until then, document that `type-check:worker` is currently failing and ticket 2 unblocks the gate.
- Fresh clone + `pnpm install && pnpm verify` works (modulo ticket 2 errors).

### Out of scope
- Pre-commit hooks (separate concern).
- Adding new tests; this is plumbing only.

---

## 2. Restore `workers/game` type-check

**Priority:** Critical
**Estimate:** 5 points
**Labels:** `game-engine`, `type-safety`, `quality`
**Depends on:** none (parallelizable with ticket 1)

### Why
The Cloudflare DO is the authoritative rules engine. `pnpm --dir workers/game run type-check` currently fails with a mix of real type drift and stale test fixtures. The most important component in the system has no type safety net.

### Files (concrete failure sites)
- `workers/game/src/GameSession.ts:856` — `ActiveEffect` vs `RuntimeActiveEffect` mismatch on `stripInactiveEffects` (real production code drift; **fix correctly, do not cast**)
- `workers/game/src/engine/battle.ts:21,893` — unused imports/locals (cleanup)
- `workers/game/src/engine/effect-resolver/target-resolver.ts:181` — unused destructured `distribution`
- `workers/game/src/engine/pipeline.ts:384` — unused parameter
- `workers/game/src/__tests__/replacement-scenarios.test.ts:1539` — string-undefined drift
- `workers/game/src/__tests__/schema-lint-replacements.test.ts` — `node:fs/path/url` not in tsconfig types; fix tsconfig or add `@types/node` to worker dev deps
- `workers/game/src/__tests__/trash-from-hand.test.ts` — many unused imports (drift)
- `workers/game/src/__tests__/visibility.test.ts:16` — `Map<string, CardData>` passed where a phase enum is expected (real fixture drift)
- `workers/game/src/__tests__/unit.test.ts:2,11` — unused imports

### Scope
1. **Real type fixes first** — `GameSession.ts:856` and `visibility.test.ts:16`. These point at genuine API drift, not just lint noise. Do not paper over with `as any`; reshape the call site or add a typed adapter.
2. **Test infra** — fix `schema-lint-replacements.test.ts` by adding `@types/node` to `workers/game/package.json` or adjusting `workers/game/tsconfig.json` `compilerOptions.types` to include `"node"`.
3. **Drifted test fixtures** — for `replacement-scenarios.test.ts`, `trash-from-hand.test.ts`, `unit.test.ts`, update fixtures to match current `GameState`/`PlayerState`/`CardInstance` shapes.
4. **Add shared test factories** at `workers/game/src/__tests__/factories.ts` (or extend existing `helpers.ts`) so future fixture drift breaks one place, not 20.
5. **Cleanup unused imports/locals** in `battle.ts`, `target-resolver.ts`, `pipeline.ts` — but only after the real type errors are gone, so the diff stays auditable.

### Acceptance criteria
- `pnpm --dir workers/game run type-check` passes with zero errors.
- `pnpm --dir workers/game test` still passes (no regressions from fixture changes).
- No new `as any` introduced. If a cast is unavoidable, comment it with the root-cause type drift and a follow-up ticket.
- Test factory module exists and is used by at least the three drifted fixtures touched here.

### Out of scope
- Replacing `as any` casts elsewhere in the worker (covered by `OPT-102`/`OPT-193`).
- Refactoring `GameSession` structure.

---

## 3. Normalize worker test/type-check execution

**Priority:** High
**Estimate:** 2 points
**Labels:** `worker`, `dev-experience`, `ci`
**Depends on:** ticket 1 (provides the root scripts to invoke)

### Why
`workers/game` is already a pnpm workspace package (`pnpm-workspace.yaml: workers/*`). But CI runs `cd workers/game && npx vitest run` while local runs `pnpm test` from inside the worker dir. Mostly cosmetic until it isn't — workspace-aware commands respect lockfile resolution and dedupe behavior; the raw `npx vitest` form does not.

### Files
- `package.json` (root)
- `.github/workflows/ci.yml`
- `pnpm-workspace.yaml` (already correct, no change expected)
- `workers/game/package.json` (verify scripts; no change expected)

### Scope
1. Confirm `workers/game/package.json` has `name: "optcg-game"` (it does).
2. Add root scripts in ticket 1: `test:worker`, `type-check:worker` — both via `pnpm --filter optcg-game ...`.
3. Replace the CI `cd workers/game && npx vitest run` with `pnpm test:worker`.
4. Add a "Game Worker" section to `README.md` listing the four root commands (`test`, `test:worker`, `type-check`, `type-check:worker`).

### Acceptance criteria
- A fresh clone can run `pnpm install && pnpm test:worker && pnpm type-check:worker` from the repo root, no `cd`.
- CI uses the same commands.
- No `npx` invocations remain in `ci.yml`.

### Out of scope
- Renaming the worker package or restructuring the workspace.

---

## 4. Reconcile Prisma migration drift (OPT-262)

**Priority:** High (raise from Medium)
**Estimate:** 2–3 points
**Labels:** `database`, `data-integrity`
**Depends on:** none — but should land **before** any new schema work (OPT-298 solitaire mode column, etc.)
**Existing Linear:** **OPT-262**

### Why
Migration drift makes every future schema change a guessing game. The DB is the durable layer for all product data; clean migration history is foundational hygiene. The audit found drift exists; OPT-262 already captures the work but is sized as Medium — escalate.

### Files
- `prisma/schema.prisma`
- `prisma/migrations/` (9 migrations, latest `20260419120000_add_user_is_admin`)
- `prisma/migrations/migration_lock.toml`

### Scope
1. Run `prisma migrate diff` against current dev/prod databases to identify divergences.
2. Decide per-divergence: either backfill a corrective migration or document the intentional drift in `docs/architecture/DATA-INTEGRITY.md` (new file — see ticket spawned later).
3. Verify `pnpm db:migrate deploy` produces a clean state from a fresh DB.
4. Add a CI step (lightweight) that runs `prisma migrate diff` against `schema.prisma` and fails on unexpected drift.

### Acceptance criteria
- `prisma migrate dev` produces no new migration on a freshly-applied DB (no drift).
- All historical migrations apply cleanly to an empty DB.
- A CI guard catches future drift.

### Out of scope
- The full data integrity policy doc (write a stub now; flesh out in a follow-up).

---

## 5. Fix engine flake — Leader-vs-Leader battle termination (OPT-324)

**Priority:** High (raise from Medium)
**Estimate:** 2–3 points
**Labels:** `game-engine`, `tests`, `flaky`
**Depends on:** ticket 2 (worker tests must reliably run from root)
**Existing Linear:** **OPT-324**

### Why
Flaky tests destroy CI trust. This one is in battle termination ordering — exactly the area where determinism matters most. Existing ticket already documents the symptom; just escalate priority and pair it with the test infra cleanup from ticket 2.

### Files
- `workers/game/src/__tests__/` — the OPT-243 Leader-vs-Leader battle test (filename per OPT-324)
- `workers/game/src/engine/battle.ts`
- `workers/game/src/engine/triggers.ts`

### Scope
Per existing OPT-324 acceptance:
1. Reproduce locally; identify the ordering nondeterminism (likely trigger ordering or async resolution).
2. Pin the determinism explicitly (sort key, deterministic queue, explicit `END_OF_BATTLE` emission).
3. Add 20 sequential test runs to verify no flake.

### Acceptance criteria
- 20/20 clean runs of the affected test locally.
- 5 consecutive green CI runs of the worker test job.
- Root cause documented in the PR description (not a flaky-retry workaround).

### Out of scope
- Broader battle-system refactor.

---

## 6. App↔Worker contract tests

**Priority:** High
**Estimate:** 5 points
**Labels:** `tests`, `worker`, `api`, `integration`
**Depends on:** ticket 2 (worker package must type-check)

### Why
The app↔worker boundary is the highest-risk integration. Today the contract is implicit: `src/lib/validators/game.ts` defines the `GameResultSchema`; the worker constructs the matching payload at `workers/game/src/GameSession.ts:800`. There is no test that fails when those drift. Same problem for the init payload, the game token, and the `/notify-end` fallback.

### Files (boundaries to pin)
- **Game init**: `src/app/api/lobbies/join/route.ts` constructs init payload → `workers/game/src/index.ts:27-41` (`/init`) → `workers/game/src/GameSession.ts` validation
- **Game token**: `src/app/api/game/token/route.ts` mints → `workers/game/src/util/auth.ts` `verifyGameToken` consumes (`GameSession.ts:32`)
- **Result callback**: `workers/game/src/GameSession.ts:800` posts → `src/app/api/game/result/route.ts` validates with `GameResultSchema` (`src/lib/validators/game.ts`)
- **Notify-end fallback**: `src/app/api/game/[id]/route.ts:188` posts → `workers/game/src/GameSession.ts:74-75` handles
- **Hidden-zone filtering**: opponent state shaping (find via `grep "redact\|hide\|filter.*opponent" workers/game/src/`)

### Scope
1. Create `src/__tests__/contracts/` (or `tests/contracts/` at root if you want it shared with worker tests).
2. **Init payload contract**: build the payload exactly as `lobbies/join/route.ts` does, run it through the worker's init validator. Snapshot the shape.
3. **Token contract**: mint a token via app code, verify with `verifyGameToken` directly. Cover expired, wrong-secret, wrong-game-id cases.
4. **Result callback contract**: build a worker-style result object, parse with `GameResultSchema` to confirm the round-trip.
5. **Notify-end contract**: build the request body the app sends, parse it on the worker side.
6. **Hidden-zone filtering**: regression test — given a mid-game state, verify opponent's hand, deck, and face-down life are stripped before broadcast. (This is the OPT-116 class of bug.)

### Acceptance criteria
- A new `pnpm test:contracts` script (or folder convention) runs cleanly.
- Drift between app validator and worker construction (or vice versa) causes a contract test to fail with a clear message.
- Hidden-zone filtering has at least three regression tests (opponent hand, opponent deck, face-down life).

### Out of scope
- Cloudflare runtime simulation. Tests run in plain Vitest with imported modules — no `wrangler dev` requirement.
- Solitaire-specific init contracts (those land with OPT-298, but they should reuse this harness).

---

## 7. Server-side playable deck legality enforcement

**Priority:** High
**Estimate:** 5 points
**Labels:** `decks`, `api`, `domain-logic`, `integrity`
**Depends on:** none — but **blocks OPT-298** (solitaire backend)

### Why
`src/lib/deck-builder/validation.ts:103` (`validateDeck`) implements the OPTCG legality rules. It's only called client-side. `src/app/api/lobbies/route.ts` only checks `deck.userId === userId` (ownership) — a malformed/illegal deck passes through. `src/app/api/lobbies/join/route.ts` does the same for the guest deck. Solitaire will add a third entry point.

### Files
- `src/lib/deck-builder/validation.ts:103` — `validateDeck` (current source of truth, client-side)
- `src/app/api/lobbies/route.ts:30-35` — host deck check (ownership only)
- `src/app/api/lobbies/join/route.ts:53-58` — guest deck check (ownership only)
- Future: `src/app/api/game/solitaire/...` (OPT-298)
- `src/lib/validators/lobbies.ts` — schemas; may need a `playable: true` invariant
- `prisma/schema.prisma` — possibly add a `Deck.isPlayable` cached column (decide as part of this work)

### Scope
1. Define the **draft vs. playable** policy:
   - Draft: any deck the user is editing. Saves freely.
   - Playable: 50 cards, exactly one leader, color affinity, no banned cards, no leaders in main deck, all card IDs resolve.
2. Decide where playability is computed. Options:
   - **(a)** On every save (sync `Deck.isPlayable` cached boolean) — fast read, but write coupling.
   - **(b)** On lobby/game start (compute once at the boundary) — simpler, slightly slower start.
   - Recommend **(b)** unless you want a "playable" badge in the deck list UI.
3. Extract `validateDeck` so it can be called server-side without DOM types. If it's already pure (it should be), import it directly into the lobby/solitaire routes.
4. Add a `requirePlayableDeck(deckId, userId)` helper in `src/lib/decks/` (new module — this is the *one* extraction worth doing now per the revised plan; do **not** generalize into a full service layer).
5. Wire into `lobbies/route.ts` (host deck) and `lobbies/join/route.ts` (guest deck).
6. Return structured 422 with `{ code: "DECK_INVALID", details: [...] }` so the UI can render specific failures.

### Acceptance criteria
- An illegal deck (49 cards, 2 leaders, banned card, etc.) cannot be used to create or join a lobby.
- 422 responses include structured `details` matching `validateDeck`'s output shape.
- Tests cover: 49 vs 50 vs 51 card count, leader missing, two leaders, banned card present, color affinity violation, leader-in-main-deck, non-existent card ID.
- Draft saves still work (no regression on `POST /api/decks`).
- OPT-298 solitaire backend can call `requirePlayableDeck` directly.

### Out of scope
- Cached `isPlayable` column on `Deck` (defer unless 2b proves slow).
- Deck builder UI changes (already covered by OPT-14).
- Generalized deck/lobby/result service layer (intentionally **not** doing this per the revised plan).

---

## 8. Centralize idempotent game result finalization

**Priority:** High
**Estimate:** 3 points
**Labels:** `game`, `api`, `worker`, `data-integrity`
**Depends on:** ticket 6 (contract tests cover the shape this refactor moves)

### Why
There are at least four entry points into "this game is over":

- Engine reaches a terminal state → `workers/game/src/GameSession.ts:800` posts to `/api/game/result`
- Player concedes → flows through the same path
- Disconnect timeout → same path
- API fallback concede → `src/app/api/game/[id]/route.ts:188` POSTs `/notify-end` to the worker, which calls back via `/notify-end` handler at `GameSession.ts:74-75`

Today, `src/app/api/game/result/route.ts` does a flat `prisma.gameSession.update` with no idempotency or terminal-state guard. A second callback (network retry, replay attempt) silently overwrites `endedAt` and could overwrite a winner. Rate limit at `apiLimiter.check("game-result:${gameId}")` (line 28) is defense-in-depth, not idempotency.

### Files
- `src/app/api/game/result/route.ts` — the convergence point
- `src/app/api/game/[id]/route.ts:188` — fallback concede
- `workers/game/src/GameSession.ts:74-75, 800` — both end paths
- `prisma/schema.prisma` — `GameSession` model (verify `status` enum has terminal states)
- `src/lib/validators/game.ts` — `GameResultSchema`; consider adding `reasonCode` enum

### Scope
1. Create `src/lib/game/finalize.ts` with one function:
   ```ts
   finalizeGameResult({ gameId, status, winnerId, winReason, reasonCode? }): Promise<{ finalized: boolean; alreadyFinal: boolean }>
   ```
2. Inside, use a conditional Prisma update: `where: { id: gameId, status: { notIn: TERMINAL_STATUSES } }`. If `count === 0`, the game was already finalized → return `alreadyFinal: true`, do not error.
3. Add a `reasonCode` enum (e.g., `LEADER_KO`, `DECK_OUT`, `LIFE_LOSS`, `CONCEDE`, `DISCONNECT_TIMEOUT`, `FALLBACK_CONCEDE`) alongside the existing freeform `winReason`. Worker emits the code; UI keeps using `winReason` for display.
4. Refactor `/api/game/result` to call `finalizeGameResult`.
5. Refactor the fallback path at `game/[id]/route.ts:188` to also flow through `finalizeGameResult` (after the `notify-end` round-trip, or in place of the round-trip if the DO is unreachable).
6. Add tests:
   - Two concurrent worker callbacks for the same game → only one finalization, no error.
   - Worker callback after fallback concede → no-op.
   - Fallback concede after worker callback → no-op.

### Acceptance criteria
- `prisma.gameSession` for a finalized game cannot be overwritten by a second callback.
- Both callback paths share `finalizeGameResult`.
- Reason code enum exists; worker emits it for at least the engine-defeat path.
- New tests cover the three idempotency cases.

### Out of scope
- A general "domain service layer" — only this one extraction (per revised plan).
- Adding a typed `AppResult<T>` pattern — return shape stays a plain object.

---

## 9. Triage React lint warnings; fix board correctness ones first

**Priority:** High (raise from P2)
**Estimate:** 5 points (split by area if needed)
**Labels:** `frontend`, `react`, `correctness`, `quality`
**Depends on:** none

### Why
413 lint warnings is a smell, but most are typing/`unused-vars` noise. **Some are correctness-class** and should not be allowed to compound:

- `react-hooks/refs` — "Cannot access refs during render" can produce stale reads, double renders, or torn UI.
- `react-hooks/set-state-in-effect` — synchronous `setState` in `useEffect` body causes cascading renders and is the React Compiler's #1 anti-pattern.

These are concentrated in the game board, which is also the most performance-sensitive surface.

### Files (verified correctness-class warnings)
- `src/components/game/board-layout/board-layout.tsx:127, 137, 330` — `set-state-in-effect`
- `src/components/game/board-layout/hand-layer.tsx:157` — `Cannot access refs during render`
- `src/components/cards/card-detail-modal.tsx:100` — `set-state-in-effect`
- Two others at `:84` and `:52` (find via `pnpm lint | grep -B5 "set-state-in-effect"`)

### Scope
1. **Triage pass (1 hour)**: dump warnings to a file; group by rule. Confirm the correctness-class set above and identify any others.
2. **Fix board correctness warnings first**:
   - `board-layout.tsx` set-state-in-effect: convert to derived state, `useMemo`, or event handler. Each instance probably needs a different fix.
   - `hand-layer.tsx:157` ref-during-render: move ref read to `useEffect` or `useLayoutEffect`.
3. **Fix modal/data-fetch warnings** in `card-detail-modal.tsx` and the `:84`/`:52` sites.
4. **Sweep `unused-vars` and `no-explicit-any`** in the same files touched, since they're already open.
5. **Bulk cleanup of unrelated unused-vars** is allowed if quick (`pnpm lint --fix` for the 23 auto-fixable warnings); otherwise leave for a follow-up.

### Acceptance criteria
- Zero `react-hooks/refs` warnings in the codebase.
- Zero `react-hooks/set-state-in-effect` warnings in `src/components/game/board-layout/` and `src/components/cards/`.
- Total warning count drops below 350 (from 413).
- No behavior regressions on the game board (manual spot-check).

### Out of scope
- Hitting zero warnings overall — that's a separate cleanup ticket.
- Refactoring `BoardLayout` or `useGameSession` (covered by OPT-264 / OPT-265 / OPT-103).

---

## 10. Worker WebSocket security audit

**Priority:** High
**Estimate:** 3 points (audit + triage; fixes spawn follow-up tickets)
**Labels:** `worker`, `security`, `audit`
**Depends on:** ticket 2 (worker must type-check before security changes land)

### Why
The Codex audit covered API-side validation/rate limiting but not the WebSocket surface. The DO has a long-lived authenticated session per player and accepts arbitrary client actions. Risks:

- **Token replay** — JWT validated at upgrade; is there a same-game token reuse window?
- **Action spam** — a client can flood `webSocketMessage` and exhaust DO CPU.
- **Payload size** — no documented cap on action body size.
- **Reconnect abuse** — repeated upgrade/disconnect cycles bypass per-action rate limits.

### Files
- `workers/game/src/GameSession.ts:181-217` — token validation + WebSocket upgrade
- `workers/game/src/GameSession.ts:251-282` — `webSocketMessage` handler
- `workers/game/src/GameSession.ts:283-350` — `webSocketClose`
- `workers/game/src/util/auth.ts` — `verifyGameToken`
- `src/app/api/game/token/route.ts` — token issuance (jti? exp?)

### Scope (audit, then ticket follow-ups)
1. **Token replay**: confirm the token has `exp` and ideally `jti`; check whether the same token can be reused across multiple WebSocket upgrades. If yes, decide: bind to a single connection (one-shot) or accept reuse with a short TTL.
2. **Action rate limiting**: count actions per WS, per second. Action types vary in cost; consider a token-bucket per `(gameId, playerIndex)` with carve-outs for legitimate bursts (chained effects, prompt responses).
3. **Payload size**: cap incoming message size (e.g., 8 KB). Anything bigger is closed with code 1009 (message too big).
4. **Reconnect abuse**: cap upgrade attempts per `(gameId, playerIndex)` per minute.
5. **Output**: a written audit doc at `docs/architecture/WORKER-SECURITY-AUDIT.md` with findings + per-finding follow-up Linear tickets (each scoped at 2–3 points).

### Acceptance criteria
- Audit doc exists with findings and severity.
- 3–5 follow-up tickets created (one per finding).
- At least one quick-win fix lands with this ticket (likely payload size cap — small change, real protection).

### Out of scope
- Implementing all the fixes — those are follow-up tickets.
- API-side rate limiting (already covered by `@upstash/ratelimit` usage in current routes).

---

## Ordering & dependencies summary

```
1. pnpm verify ──────────┐
2. worker type-check ────┼─→ (CI floor)
3. normalize worker ─────┘
                          │
4. OPT-262 migration drift  (parallel, blocks future schema work)
                          │
5. OPT-324 engine flake ──┐ (depends on 2)
                          │
6. contract tests ───────┐│ (depends on 2)
                         ││
7. server-side deck ─────┼┤ (independent; blocks OPT-298)
                         ││
8. finalization service ─┘│ (depends on 6)
                          │
9. lint correctness ──────┘ (independent)
                          │
10. WS security audit ────┘ (depends on 2)
```

Suggested PR sequencing:

- **PR 1**: tickets 1 + 2 + 3 together (the floor — they're tightly coupled).
- **PR 2**: ticket 4 (alone, low-risk DB hygiene).
- **PR 3**: ticket 6 (contract tests — pure additions).
- **PR 4**: ticket 7 (server-side deck legality — must precede OPT-298).
- **PR 5**: ticket 8 (finalization service).
- **PR 6**: ticket 9 (lint correctness).
- **PR 7**: ticket 10 (WS audit).
- **PR 8**: ticket 5 (engine flake — can land any time after PR 1).

After this batch, revisit:
- Card effect support matrix + feature gates (Codex P2-5/P2-6) — product roadmap items, schedule when solitaire stabilizes.
- Route-aware shell split (Codex P2-7) — lower-leverage; defer.
- Docs/runbook (Codex P3) — write the data integrity stub now, defer the rest.

## What this batch deliberately omits

Per the revised plan from the Claude/Codex critique pass:

- **No generalized "domain service layer"**. Ticket 7 extracts `requirePlayableDeck`; ticket 8 extracts `finalizeGameResult`. That is two helpers, not a layer. Add more only when concrete duplication shows up.
- **No `AppResult<T>` / `AppError` discriminated union**. Use structured error responses (`{ error: { code, message, details } }`) where it helps and stop there.
- **No documentation marathon up front**. The data integrity stub gets written as part of ticket 4. Everything else (testing strategy doc, runbook, runtime boundaries doc) is deferred until the architecture work above settles.
