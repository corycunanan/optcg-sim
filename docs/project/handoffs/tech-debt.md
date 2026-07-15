# Tech Debt Handoff

Last updated: 2026-07-14

## Action Plan

| Order | Ticket | Scope | Depends on | Status | PR / branch | Last activity |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | OPT-101 | Move shared utilities out of game engine worker | — | In Progress | — | — |
| 2 | OPT-384 | Architecture hygiene follow-up | OPT-101 | Backlog | — | — |
| 3 | OPT-412 | Share target-filter primitives | OPT-384 | Backlog | — | — |
| 4 | OPT-377 | Break engine effect-resolver import cycles | — | In Review | [PR #323](https://github.com/corycunanan/optcg-sim/pull/323) / `fc8614f` | 2026-07-14 |
| 5 | OPT-193 | Remove worker action/cost `as any` escapes | OPT-377 | Backlog | — | — |
| 6 | OPT-102 | Continue worker type-safety cleanup | OPT-193 | Backlog | — | — |
| 7 | OPT-194 | Complete downstream type cleanup | OPT-102 | Backlog | — | — |
| 8 | OPT-201 | Shrink Durable Object bundle by lazy-loading set schemas | — | Backlog | — | — |
| 9 | OPT-383 | Durable Object bundle follow-up | OPT-201 | Backlog | — | — |
| 10 | OPT-106 | Complete bundle-size follow-up | OPT-383 | Backlog | — | — |

## Current milestone

OPT-377 removes all current engine import cycles. Its implementation is ready for review in PR #323. The next critical-path ticket is OPT-193, followed by OPT-102 and OPT-194.

## Handoff to OPT-193

### Primer

- Condition evaluation now lives in a pure query core with immutable services supplied by `conditions.ts` and `modifiers.ts`.
- Recursive resolver/resume/batch/trigger control flow now crosses a frozen `EffectResolverServices` composition boundary.
- Shared damage and effective-keyword queries are leaf modules, leaving the engine graph with zero circular SCCs.

### Read first

- `workers/game/src/engine/effect-resolver/types.ts`
- `workers/game/src/engine/effect-resolver/resume-core.ts`
- `workers/game/src/engine/condition-queries.ts`
- `workers/game/src/engine/modifiers.ts`

### Gotchas

- Preserve the complete, frozen resolver service object; do not replace it with mutable module-global dispatch.
- Keep resume re-entry behavior covered through the public production action path.
- Run `node workers/game/scripts/analyze-import-cycles.mjs` after import changes.

### Deliberately deferred

- Unrelated `as any` and broader worker type cleanup belong to OPT-193 / OPT-102 and were intentionally excluded from OPT-377.
- The final Next.js build needs a network-enabled environment because local verification could not resolve Google Fonts.

### Why this matters

The acyclic query and resume boundaries give OPT-193 stable interfaces for replacing unsafe action/cost casts without reopening resolver dependency cycles.
