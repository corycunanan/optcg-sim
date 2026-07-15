---
linear-project: API Scale & Hardening
linear-project-url: https://linear.app/optcg-sim/project/api-scale-and-hardening-61c480ee38db
last-updated: 2026-07-15
---

# API Scale & Hardening — Handoff Doc

Targeted data-layer correctness and scale fixes from the 2026-07-02 audit.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-378 | Enforce reciprocal friend-request uniqueness and idempotent accept | — | — | Done | [#317](https://github.com/corycunanan/optcg-sim/pull/317) | Establishes the partial-index and P2002-handling pattern. |
| 2 | OPT-381 | Index active-lobby lookup and enforce one WAITING lobby per host | — | OPT-378 | Done | [#318](https://github.com/corycunanan/optcg-sim/pull/318) | Reuses the same partial-index and dedup-migration pattern. |
| 3 | OPT-380 | Add pg_trgm indexes and measurable search-query acceptance criteria | — | — | Done | [#319](https://github.com/corycunanan/optcg-sim/pull/319) | Final raw-SQL migration ticket. |
| 4 | OPT-489 | Validate message-history cursor timestamps before Prisma queries | — | OPT-375 | In Review | [#320](https://github.com/corycunanan/optcg-sim/pull/320) | Closes the remaining malformed-date 500 path. |
| 5 | OPT-382 | Trim /api/cards search payload without weakening deck legality | — | OPT-374 | Backlog | — | Separate list/detail contract while preserving legality data. |
| 6 | OPT-488 | Define and automate retention for CLOSED lobbies without game sessions | — | OPT-381 | Backlog | — | Requires an explicit retention policy and scheduler. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-382; its OPT-374 dependency is complete. OPT-488 is ready in parallel.

---

## Handoffs

### OPT-378 → OPT-381
**From:** session on 2026-07-14 · **Commit:** `0fa9c9f` · **PR:** [#317](https://github.com/corycunanan/optcg-sim/pull/317)

- **Primer:** Friend requests now rely on a PostgreSQL partial unique expression index for the unordered pending-pair invariant; route-level P2002 handling preserves stable API and realtime semantics.
- **Read first:** `prisma/migrations/20260714215000_friend_request_unordered_pending_unique/migration.sql`, `src/app/api/friends/requests/route.ts`, `src/app/api/friends/requests/[id]/route.ts`.
- **Gotchas / do NOT touch:** Keep raw partial-expression indexes in migrations rather than Prisma schema declarations; Prisma cannot model this invariant directly.
- **Unresolved:** none — `pnpm test:db:friends` passed against the approved non-production migrated database on 2026-07-14.
- **Why this matters for OPT-381:** Its WAITING-lobby invariant follows the same sequence: deterministically deduplicate existing rows, add a partial unique index, then translate the winning database constraint into the route’s expected conflict response.

### OPT-381 → OPT-380
**From:** session on 2026-07-15 · **Commit:** `3862ece` · **PR:** [#318](https://github.com/corycunanan/optcg-sim/pull/318)

- **Primer:** WAITING lobbies now have a raw PostgreSQL partial unique index, with migration cleanup that preserves the newest lobby per host and closes older duplicates; `POST /api/lobbies` distinguishes that P2002 from join-code collisions.
- **Read first:** `prisma/migrations/20260714220000_lobby_waiting_host_unique/migration.sql`, `src/app/api/lobbies/route.ts`, `scripts/test-lobby-concurrency.ts`.
- **Gotchas / do NOT touch:** Keep partial indexes in raw migrations—Prisma schema declarations cannot express their predicates. The database-backed concurrency script needs a disposable migrated database and was not run in this session.
- **Unresolved:** none for OPT-381; OPT-380 still needs a product decision and benchmark evidence for 1–2 character substring searches.
- **Pointer:** commit `3862ece` / PR #318; run `git show 3862ece` for the implementation diff.

### OPT-380 → OPT-489
**From:** session on 2026-07-15 · **Commit:** `431641b` · **PR:** [#319](https://github.com/corycunanan/optcg-sim/pull/319)

- **Primer:** Username and card-name substring search now share a three-character floor, backed by GIN trigram indexes; benchmark evidence records index selection and 38–105× lower execution time at synthetic scale.
- **Read first:** `src/app/api/messages/[userId]/route.ts`, `src/app/api/messages/[userId]/route.test.ts`, `src/lib/validators/messages.ts`.
- **Gotchas / do NOT touch:** Preserve OPT-375's 200-row polling cap, `more` flag, and composite `createdAt + id` ordering while adding timestamp validation.
- **Unresolved:** none for OPT-380; OPT-489 must define whether `afterId` without `after` is rejected or ignored, then encode that decision in the shared query schema.
- **Pointer:** commit `431641b` / PR #319; run `git show 431641b` for the implementation diff.

### OPT-489 → OPT-382
**From:** session on 2026-07-15 · **Commit:** `6ef5b40` · **PR:** [#320](https://github.com/corycunanan/optcg-sim/pull/320)

- **Primer:** Message polling and history pagination now validate ISO timestamps before constructing Prisma dates; orphaned `afterId` tie-breakers fail with 400 while `after`-only polling remains compatible.
- **Read first:** `src/app/api/cards/route.ts`, `src/lib/validators/cards.ts`, `src/lib/cards/search.ts`, and the deck-builder card-add flow that consumes list results.
- **Gotchas / do NOT touch:** OPT-382 must preserve deck-legality inputs when splitting list/detail payloads; keep leader restriction behavior from OPT-374 intact.
- **Unresolved:** none for OPT-489; malformed timestamps and composite cursor boundaries are covered without changing OPT-375's cap, `more` flag, or ordering.
- **Pointer:** commit `6ef5b40` / PR #320; run `git show 6ef5b40` for the implementation diff.
