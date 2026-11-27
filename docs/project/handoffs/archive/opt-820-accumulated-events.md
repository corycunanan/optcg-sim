# OPT-820 — committed events across nested execution and prompt continuations

PR #651, branch `corymcunanan/opt-820-accumulated-events-replay`. Current production correction is `1666617ac24d502172425d120bf08932b9712024`, following `161b4f2e`; current main `caf29b1058dddf3dd26357c708ae42f9743e3426` (OPT-832/833) was integrated normally in `4664b9a2`. Earlier publication-only candidates and gates below are historical evidence, not final readiness. Renewed independent assessment and merge gates remain coordinator-owned. Final required verification results and exact tested head are recorded in the PR body's Validation section and `/private/tmp/opt820-dual-final-verify.log` / `.exit` after this handoff commit.

## Problem and ownership contract

Five Elders' hand payment and allied trash events were lost when its later play prompted. The first fix recovered saved frame events, but a nonoptional replacement could publish its played Character while an earlier outer draw still existed only in a caller accumulator. Retaining that draw after nested execution returned restored completeness but inverted chronology.

Read `effect-resolver/resolver.ts`, `resume/events.ts`, `resume/triggers.ts`, and `resume-core.ts` first. Each synchronous caller now passes scoped resolver services into nested execution before it starts. The scope exposes that caller's **committed** events to existing publication boundaries, in ancestor-first order. Publication replaces entries in the caller-owned array with immutable flagged copies; events remain available for the existing independent trigger scan. No function/callback is serialized, no shared mutable dispatcher is introduced, and no new event IDs or wire fields are required.

If execution pauses before both publication and trigger scanning complete, frames become the durable owner. Initial recursive AND/resource expansion, simultaneous suffixes, nested choices, paid effect actions and resumed chains retain their prefixes on the first successor frame. Frame replay retains events while either `eventLogEmitted` or `triggerScanned` remains false, and deduplicates shared references without conflating equal payloads. Trigger drains detach committed prefixes at publication and restore unfinished work below any subsequent prompt. Resumed rejected responses do not reach publication and preserve their input state.

This does **not** eagerly emit after each action. A terminal replacement draw without a nested drain still returns its pending events to the normal pipeline. `emitEvent` also advances timestamps and records Character K.O.s; its publication boundaries remain unchanged. Existing nested boundaries now see the earlier committed prefix before publishing their own event, as required by chronological ordering. Direct trigger-result loops respect `eventLogEmitted` to avoid re-emitting events published by descendants.

An existing interrupted frame receives detached work when a trigger drain pauses; otherwise an event-only interrupted frame is inserted below the child. Its accumulator uses the same nested-owner exclusion as ordinary continuation transfer, so child-owned events are not duplicated by serialization. Interrupted resumes scan the complete accumulated prefix and suffix even when there are no remaining actions. Pending trigger queues stay separate from events awaiting their first scan.

Unpaid staged costs remain outside committed scopes. Cost accumulators enter the scope only after full payment commits and actions begin; incomplete or abandoned transactions retain the existing rollback behavior. No card movement, trigger-priority, registration, schema, client animation or spectator contract changes are intended.

## Acceptance evidence

| Requirement | Retained verification |
| --- | --- |
| Five Elders logs hand cost, all allied trash and Elder play exactly once | `opt-820-accumulated-events-replay.test.ts` drives `runPipeline` and every `resumePromptLifecycle` response, checking final zones, no K.O. and one Nusjuro registration each |
| Earlier caller event precedes nonoptional nested publication | `opt-820-nested-publication.test.ts`: outer DRAW → replacement PLAY → On Play hand cost/DRAW → outer DRAW; optional/nonoptional pair |
| Real persistence and rejected responses | New nested pair restores through a new `SessionRepository` before every response and rejects wrong-player, stale and duplicate responses; original states stay immutable |
| Recursive initial callers keep prefixes | New DRAW → AND target planning → DRAW and DRAW → up-to resource choice → target → DRAW, with repository round trip before each response |
| Normal terminal behavior remains ordered | Paired optional/nonoptional replacement DRAW; nonoptional path asserts no premature eventLog publication before pipeline continuation |
| Descendant publication is not repeated by its parent | Two nested replacement/On Play Characters produce exactly DRAW0, PLAY1, DRAW1, PLAY1, DRAW1, DRAW0; independent removal of the new trigger-result emission guards reproduces duplicate child events |
| Existing cost and ordering behavior | Full worker coverage includes transactional-cost suites and unchanged OPT-468 event immutability / OPT-757 ordering suites |

Canonical source: OP13-079/080/082 in `docs/cards/OP-13.md`; comprehensive rules v1.2.0 §§3-1-6, 8-3-1-1/3/5, 8-6-1-1; `ZONE-TRANSITION-CONTRACT.md`. The new replacement tests are shared continuation probes, not new authored-card claims. Aggregate hand-cost `CARD_TRASHED {count:1, reason:"cost", from:"HAND"}` is intentionally unchanged; the Five Elders regression also checks actual Hand→Trash state.

## Validation record

- Previous code baseline `9210ee3f`: retained paired replacement test is RED, one failed/one passed, exit 1; observed `play1,draw0,trash1,draw1,draw0`, expected `draw0,play1,trash1,draw1,draw0`. `/private/tmp/opt820-redesign-red.log`.
- Candidate `f23b7bce`: focused new/existing ownership plus resolver-service architecture suites, **19 passed, exit 0**; worker type-check **exit 0**. `/private/tmp/opt820-redesign-focused.log`, `/private/tmp/opt820-redesign-types.log`.
- First broader worker check: 2,397 passed / five existing skips and one services-shape expectation failure. The new service methods were added to the architecture contract test; its focused rerun passes. This earlier run is not the final gate.
- Sandbox full verify skipped database tests despite the correct URL and was stopped; its result is **incomplete**. A database-enabled pre-integration rerun was also stopped when main advanced. Neither is claimed as final verification.
- Final required `TEST_DATABASE_URL=postgresql://optcg_run@127.0.0.1:55439/postgres pnpm verify` at integrated head `58f3562d25fd2f02f563ef8e544ac9fae28db744`: **exit 0**, app 260 files / **2,367 passed, no skips**, pipeline 7 files / **48 passed**, worker coverage 224 files / **2,402 passed, five existing skips**; lint, both typechecks, bundle capacity, schema/parity/inventory gates and production build all passed. The existing harness created/migrated/dropped its isolated database; no production data was used. `/private/tmp/opt820-redesign-final-verify.log`, numeric `/private/tmp/opt820-redesign-final-verify.exit`.
- After that gate, a test-only descendant guard regression and this evidence update were added. Production and build inputs are unchanged, so full-gate evidence carries forward; worker type-check **exit 0** and the full worker suite **224 files / 2,403 passed, five existing skips, exit 0** validate the final test delta. `/private/tmp/opt820-redesign-final-types.log`, `/private/tmp/opt820-redesign-final-worker.log`.

Generated registry plus recursive `getNestedActions` inventory was rerun using `node --import tsx`: 2,472 schemas / 3,606 blocks; DRAW 398, PLAY_CARD 261, KO 324, RETURN_TO_DECK 74, PLAYER_CHOICE 36, OPPONENT_CHOICE 8, OPPONENT_ACTION 54. Artifact `/private/tmp/opt820-redesign-inventory.json`; canonical schema inventory also runs in `pnpm verify`. Affected consumers include replacement actions, normal/recursive chains, simultaneous groups, cost-completed actions, target/choice/arrangement resumes, batch reentry, trigger ordering, and session persistence. OPT-818/819 prerequisites are merged; current-main OPT-821 field-to-Life continuation is retained.

## Renewed trigger-scan finding and bounded correction

The review at `482a9b34` exposed a second independent obligation: an earlier draw could be published, then filtered out before trigger matching. A real registered SELF draw watcher fired only once for two outer draws. Preserving emitted-but-unscanned events fixed the nonoptional path; the optional path also required restoring detached scan work when the trigger drain returned another prompt.

- Retained RED at integrated baseline `4664b9a2`: optional/nonoptional registered watcher, one activation instead of two; exact movement chronology already passed. `/private/tmp/opt820-scan-obligation-red.log`, exit 1.
- Candidate `161b4f2e` fixed watcher retention but a proactively added fallback probe exposed duplicate ownership of the child's own draw prefix across persistence (two owners rather than one, and reviewer confirmed final draws `[0,1,1]`). `/private/tmp/opt820-scan-child-ownership-red.log`, exit 1. Its successful full verify is supporting historical evidence, not proof this alias defect was resolved.
- Candidate `1666617a` applies the existing nested-owner filter to newly created event-only owners. Retained paired watcher/cost matrix and fallback probes: **24 passed, exit 0**; worker type-check **exit 0**. `/private/tmp/opt820-scan-obligation-focused.log`, `/private/tmp/opt820-scan-obligation-types.log`.
- Six natural replacement scenarios cover optional/nonoptional × single child, two paid sibling costs, and two declined sibling costs. Each prompt is restored through `SessionRepository`; tests assert two watcher activations, actual effective power +2,000, exact event chronology, invalid-target rejection and wrong/stale/duplicate response handling. Production persistence assigns the next prompt ID before duplicate routing.
- Additional direct real trigger-drain probes construct no stack frames: event-only ownership through paid/declined child cost, staged DON/hand-cost isolation, and child DRAW→target prompt with unique ownership before/after persistence and final draws `[0,1]`.

The previous full worker run (before the final alias-only correction) passed 228 files / 2,485 tests / five existing skips, exit 0. Required final full verification is renewed after this handoff at the corrected integrated tree; consult the PR body and final log/exit artifacts for actual results. No new schema, wire or persistence format field was introduced.

## Follow-ups

No new out-of-scope findings. Both the earlier chronology finding and later trigger-scan/alias findings have retained regressions at the corrected candidate; renewed independent review must validate the complete correction before the coordinator dispositions feedback or merges. No production repair, migration, separate deployment, Linear mutation or merge was performed by the implementer.
