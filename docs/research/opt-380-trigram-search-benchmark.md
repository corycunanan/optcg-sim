# OPT-380 Trigram Search Benchmark

Date: 2026-07-15

## Search contract

Username and card-name substring search require at least three trimmed
characters. Empty card queries remain valid so users can browse with filters;
non-empty one- or two-character queries return `400 SEARCH_QUERY_TOO_SHORT`.
The social sidebar, deck builder, and admin card browser enforce the same floor
before sending or navigating to a search request.

This avoids the PostgreSQL `pg_trgm` short-query fallback: one- and
two-character patterns often contain no extractable trigram and can still
require a sequential scan.

## Environment and method

- PostgreSQL 16.13 in a disposable local cluster.
- The complete migration history was applied with `prisma migrate deploy`.
- Synthetic realistic scale: 100,000 users and 25,000 cards.
- Representative selective query: `ILIKE '%luf%'`.
- Before plans were captured after dropping only the two OPT-380 indexes.
- After plans were captured after recreating the exact migration indexes and
  running `ANALYZE`.
- Every plan used `EXPLAIN (ANALYZE, BUFFERS)` with default planner settings.

## Results

| Query            | Before plan                          |                   Before | After plan                                     |                 After | Improvement |
| ---------------- | ------------------------------------ | -----------------------: | ---------------------------------------------- | --------------------: | ----------: |
| `users.username` | Sequential scan, 99,900 rows removed | 10.937 ms, 1,225 buffers | Bitmap index scan on `users_username_trgm_idx` | 0.104 ms, 103 buffers |      105.2× |
| `cards.name`     | Sequential scan, 24,875 rows removed |    3.382 ms, 625 buffers | Bitmap index scan on `cards_name_trgm_idx`     | 0.087 ms, 128 buffers |       38.9× |

Representative post-migration plan nodes:

```text
Bitmap Index Scan on users_username_trgm_idx
  Index Cond: (username ~~* '%luf%'::text)

Bitmap Index Scan on cards_name_trgm_idx
  Index Cond: (name ~~* '%luf%'::text)
```

## Migration verification

`prisma migrate deploy` applied all 24 migrations cleanly to a fresh database,
including `20260715020000_add_trigram_search_indexes`. Both post-migration
plans selected their GIN trigram indexes when the search was selective.
