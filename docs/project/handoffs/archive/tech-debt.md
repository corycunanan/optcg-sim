# Tech Debt Handoff — Project Complete

Last updated: 2026-07-15

## Final status

The Tech Debt project is complete. All 15 scoped issues merged to `main` on 2026-07-15 through PRs #323–#337; PR #322 was not part of this close-out sequence. No project issue remains blocked, in review, or awaiting implementation.

| Issue | Merged PR | Outcome |
| --- | --- | --- |
| OPT-101 | [#326](https://github.com/corycunanan/optcg-sim/pull/326) | Centralized runtime-neutral card parsing in `shared/`, retained app compatibility re-exports, and moved the pipeline to the shared implementation. |
| OPT-102 | [#330](https://github.com/corycunanan/optcg-sim/pull/330) | Replaced the remaining scoped resolver cast with typed storage, event, JSON, and versioned-state adapters and rejected unknown action/filter fields at ingest. |
| OPT-106 | [#336](https://github.com/corycunanan/optcg-sim/pull/336) | Added `useAsyncOperation` with last-call-wins safety and adopted it for three lobby mutations without absorbing domain-owned UX. |
| OPT-193 | [#324](https://github.com/corycunanan/optcg-sim/pull/324) | Made `Cost` an exhaustive discriminated union and removed action/cost type escapes through typed Life-card and persisted-modifier adapters. |
| OPT-194 | [#337](https://github.com/corycunanan/optcg-sim/pull/337) | Replaced 85 risky production assertions with runtime validation or typed adapters; retained 114 documented compile-time-only framework/literal assertions. |
| OPT-198 | [#335](https://github.com/corycunanan/optcg-sim/pull/335) | Standardized partial deck updates on PATCH, migrated the deck builder, and retained an observable temporary PUT compatibility alias. |
| OPT-201 | [#325](https://github.com/corycunanan/optcg-sim/pull/325) | Reduced the Durable Object bundle by 17% gzip with a deterministic generated schema registry and a CI-enforced 1 MiB capacity budget. |
| OPT-205 | [#327](https://github.com/corycunanan/optcg-sim/pull/327) | Replaced admin card-color inline styles with semantic CSS state selectors and WCAG AA foregrounds for all six colors. |
| OPT-207 | [#328](https://github.com/corycunanan/optcg-sim/pull/328) | Standardized all 36 API `console.error` sites with searchable `[domain:action]` prefixes while preserving error objects and response behavior. |
| OPT-264 | [#333](https://github.com/corycunanan/optcg-sim/pull/333) | Extracted BoardLayout drag, prompt/modal, and DON redistribution state, reducing the root from 740 to 576 lines with focused behavior contracts. |
| OPT-265 | [#334](https://github.com/corycunanan/optcg-sim/pull/334) | Documented the abstain decision after verifying the current composition seams with seven behavior-level session, transport, and finalization tests. |
| OPT-377 | [#323](https://github.com/corycunanan/optcg-sim/pull/323) | Removed all three engine circular SCCs through pure query leaves and a frozen resolver-services boundary, with production re-entry coverage. |
| OPT-383 | [#329](https://github.com/corycunanan/optcg-sim/pull/329) | Routed every remaining in-scope app request through the shared API client with Zod-validated envelopes and cache/credentials support. |
| OPT-384 | [#331](https://github.com/corycunanan/optcg-sim/pull/331) | Removed architecture layer inversions and duplicate exports, shared the worker-init wire contract, and deleted the dormant `GameActionLog` model. |
| OPT-412 | [#332](https://github.com/corycunanan/optcg-sim/pull/332) | Shared TargetFilter matching across app and worker runtimes with a self-maintaining CI vocabulary guard and production-pipeline coverage. |

## Resolved handoff state

The former action-plan rows marked Backlog or In Review are all resolved: OPT-412, OPT-102, and OPT-383 merged from review; OPT-193, OPT-194, and OPT-106 subsequently merged from backlog. The OPT-377 network-only production-build caveat was also cleared by later full `pnpm verify` runs in this sequence. OPT-193's request for a broader structural-assertion inventory was completed by OPT-102 and OPT-194.

## Residual follow-ups

These items were deliberately left outside the merged project scope and should be scheduled only when their owning area is revisited:

- Remove the deprecated `PUT /api/decks/[id]` delegation and `[decks:update]` warning after the next release, once pre-deploy browser tabs have aged out (OPT-198).
- Deduplicate the local `assertNever` helpers introduced in the OPT-193 cost and modifier paths.
- Keep persistence/storage-blob sizing with OPT-379, and handle the Wrangler v4 migration separately from schema-bundle work (OPT-201).
- Keep game-Worker transport fetch migration with OPT-376 (OPT-383).
- Define a real durable event source before reviving the M6 replay proposal; `GameActionLog` no longer exists, while the M3 milestone remains historical (OPT-384).
- Address the pre-existing `hand-layer.tsx` effect-state lint warning separately (OPT-264), along with the repo-wide 269-warning baseline and the load-sensitive OPT-242 coverage timing assertion observed by multiple PRs.
- Move remaining shallow `useGameSession` composition cases into the behavior harness when they next change; extract a pure `useGameWs` transition only if message growth creates a concrete maintenance problem (OPT-265).
- Consider further `useAsyncOperation` adoption only where admin or lobby-room UX converges on the hook's contract (OPT-106).
- Promote `ActiveEffect` and the game-server message core into exhaustive shared app/worker schemas; treat Motion's 66 safe assertions and reusable typed bridges as separate focused migrations (OPT-194).

No residual item blocks project completion.
