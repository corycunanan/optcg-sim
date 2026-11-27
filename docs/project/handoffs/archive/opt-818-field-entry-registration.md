# OPT-818 — idempotent field-entry registration

Implementation complete; independent review and merge gates remain coordinator-owned.

Read `workers/game/src/engine/triggers.ts`, `pipeline.ts`, and
`workers/game/src/__tests__/opt-818-field-entry-registration.test.ts` first.
Repeated scans now preserve one registration per field instance / effect block;
`registerCardEnteredField` performs triggers → replacements → permanent effects.
Only the pipeline uses the helper in this ticket. Prohibition-only permanent
blocks participate in the same identity through the prohibition registry.
Duplicate registration does not allocate IDs or timestamps. Fresh identities
from `transitionCard` register separately, including a returning physical card.

## Rules and observable behavior

Sources: `docs/cards/OP-13.md` OP13-080/082; supported Comprehensive Rules v1.2.0
`docs/rules/rule_comprehensive.md` §§3-1-6, 8-1-3-1, 8-1-3-3, 8-6-1-1;
`docs/game-engine/RULES-TO-ENGINE-MAP.md` trigger/permanent rows and
`docs/game-engine/ZONE-TRANSITION-CONTRACT.md`. No schema/rules migration.

| Clause | Evaluation / cost / choice | Observable result / evidence |
| --- | --- | --- |
| Five Elders Activate Main with Imu | Rest one DON and trash one hand card; trash own Characters; select Nusjuro alone | Actual `runPipeline` activation and every prompt through `resumePromptLifecycle`; fresh Nusjuro field identity |
| Nusjuro permanent with 7+ trash | Continuous self Rush/protection | Exactly one active effect and one prohibition after registration; registrars retain both together |
| Nusjuro When Attacking with 10+ trash | One attack; controller chooses up to one opponent Character | Direct target prompt, no effect-order prompt, exactly one −2000 modifier targeting the selected Character |
| Auto effect activates once per event (§8-1-3-1) | Repeated scans of one field entry | RED reproduces three registrations and ordering choice; GREEN has one |
| New identity after zone movement (§3-1-6) | Actual Character → trash → Character transitions | Returning card registers all block families afresh; second same-card instance also independent |

## Validation evidence

Base: `50331c89f742b4a0a04a6e6d8465b97e7999317f`. First commit
`a993d66` contains RED regression only: 2 failing tests (three rows instead of
one; PLAYER_CHOICE instead of SELECT_TARGET). Baseline OPT-739/757: 17 tests
pass. Logs under `/private/tmp/opt818-{baseline,red}.log`.

Final focused regression: 8 pass. Guard-removal mutation: 7 fail, 1 passes;
restoration: all 8 pass. `/private/tmp/opt818-{mutation,restored}.log`.
Full worker suite: 218 files, 2344 pass, 5 pre-existing skips. Includes unchanged
OPT-114/172/173/739/757 suites. Worker type-check passes. Schema checks pass
(including source parity, lint, drift, 33 gate tests, action inventory 3821 uses /
73 types handled and executed). Logs: `/private/tmp/opt818-{worker,types,schema}.log`.

First `pnpm verify` attempt passed lint then failed app type-check because reused
node_modules had a stale generated Prisma client. Replaced dependency symlinks
with owned `pnpm install --frozen-lockfile`, which generated the current client.
Final required gate result recorded in PR body; log `/private/tmp/opt818-verify-final.log`.

Shared-consumer inventory uses `getAllAuthoredSchemas()` and visits the effect
blocks consumed by these registrars (nested actions are not registration units):
2472 authored schemas; auto 2379 blocks / 1895 cards; activate 491 / 471;
permanent 650 / 605 (57 prohibition-only blocks); replacement 71 / 71.
`/private/tmp/opt818-inventory.log`. The existing recursive action inventory also
runs in `schema:check` to cover nested authored actions.

## Follow-ups and next ticket

OPT-819 must switch `scanEventsForTriggers` to the new helper to register
permanent effects at early field entry, after OPT-818 merges. OPT-820 separately
owns replaying pre-prompt accumulated events. Neither behavior is changed here.
No production migration, protocol, UI or schema changes.
