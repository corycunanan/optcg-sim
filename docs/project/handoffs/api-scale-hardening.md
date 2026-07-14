---
linear-project: API Scale & Hardening
linear-project-url: https://linear.app/optcg-sim/project/api-scale-and-hardening-61c480ee38db
last-updated: 2026-07-14
---

# API Scale & Hardening — Handoff Doc

Targeted data-layer correctness and scale fixes from the 2026-07-02 audit.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-378 | Enforce reciprocal friend-request uniqueness and idempotent accept | — | — | In Review | [#317](https://github.com/corycunanan/optcg-sim/pull/317) | Establishes the partial-index and P2002-handling pattern. |
| 2 | OPT-381 | Index active-lobby lookup and enforce one WAITING lobby per host | — | OPT-378 | Backlog | — | Reuses the same partial-index and dedup-migration pattern. |
| 3 | OPT-380 | Add pg_trgm indexes and measurable search-query acceptance criteria | — | — | Backlog | — | Final raw-SQL migration ticket. |
| 4 | OPT-489 | Validate message-history cursor timestamps before Prisma queries | — | OPT-375 | Backlog | — | Closes the remaining malformed-date 500 path. |
| 5 | OPT-382 | Trim /api/cards search payload without weakening deck legality | — | OPT-374 | Backlog | — | Separate list/detail contract while preserving legality data. |
| 6 | OPT-488 | Define and automate retention for CLOSED lobbies without game sessions | — | OPT-381 | Backlog | — | Requires an explicit retention policy and scheduler. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-381 after OPT-378 merges.

---

## Handoffs

### OPT-378 → OPT-381
**From:** session on 2026-07-14 · **Commit:** `0fa9c9f` · **PR:** [#317](https://github.com/corycunanan/optcg-sim/pull/317)

- **Primer:** Friend requests now rely on a PostgreSQL partial unique expression index for the unordered pending-pair invariant; route-level P2002 handling preserves stable API and realtime semantics.
- **Read first:** `prisma/migrations/20260714215000_friend_request_unordered_pending_unique/migration.sql`, `src/app/api/friends/requests/route.ts`, `src/app/api/friends/requests/[id]/route.ts`.
- **Gotchas / do NOT touch:** Keep raw partial-expression indexes in migrations rather than Prisma schema declarations; Prisma cannot model this invariant directly.
- **Unresolved:** none — `pnpm test:db:friends` passed against the approved non-production migrated database on 2026-07-14.
- **Why this matters for OPT-381:** Its WAITING-lobby invariant follows the same sequence: deterministically deduplicate existing rows, add a partial unique index, then translate the winning database constraint into the route’s expected conflict response.
