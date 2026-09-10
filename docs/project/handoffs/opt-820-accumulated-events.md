# OPT-820 — committed events across nested execution and prompt continuations

PR #651, branch `corymcunanan/opt-820-accumulated-events-replay`. The resumed implementation is `f23b7bce5c960b3016b501be9b05f93067456707`; current main `9087d2b1` was integrated normally in `05335ff598e6498e8d2d3d6b3969416d9d5ee2a6`. Fresh independent review and readiness remain coordinator-owned. PR stays draft until all gates pass.

## Problem and ownership contract

Five Elders' hand payment and allied trash events were lost when its later play prompted. The first fix recovered saved frame events, but a nonoptional replacement could publish its played Character while an earlier outer draw still existed only in a caller accumulator. Retaining that draw after nested execution returned restored completeness but inverted chronology.

Read `effect-resolver/resolver.ts`, `resume/events.ts`, `resume/triggers.ts`, and `resume-core.ts` first. Each synchronous caller now passes scoped resolver services into nested execution before it starts. The scope exposes that caller's **committed** events to existing publication boundaries, in ancestor-first order. Publication replaces entries in the caller-owned array with immutable flagged copies; events remain available for the existing independent trigger scan. No function/callback is serialized, no shared mutable dispatcher is introduced, and no new event IDs or wire fields are required.

If execution pauses before publication, existing frames become the durable owner. Initial recursive AND/resource expansion, simultaneous suffixes, nested choices, paid effect actions and resumed chains retain their prefixes on the first successor frame. Frame replay filters published events, deduplicates shared references without conflating equal payloads, and clears interrupted/batch prefixes at publication. Resumed rejected responses do not reach publication and preserve their input state.

This does **not** eagerly emit after each action. A terminal replacement draw without a nested drain still returns its pending events to the normal pipeline. `emitEvent` also advances timestamps and records Character K.O.s; its publication boundaries remain unchanged. Existing nested boundaries now see the earlier committed prefix before publishing their own event, as required by chronological ordering. Direct trigger-result loops respect `eventLogEmitted` to avoid re-emitting events published by descendants.

Unpaid staged costs remain outside committed scopes. Cost accumulators enter the scope only after full payment commits and actions begin; incomplete or abandoned transactions retain the existing rollback behavior. No card movement, trigger-priority, registration, schema, client animation or spectator contract changes are intended.

## Acceptance evidence

| Requirement | Retained verification |
| --- | --- |
| Five Elders logs hand cost, all allied trash and Elder play exactly once | `opt-820-accumulated-events-replay.test.ts` drives `runPipeline` and every `resumePromptLifecycle` response, checking final zones, no K.O. and one Nusjuro registration each |
| Earlier caller event precedes nonoptional nested publication | `opt-820-nested-publication.test.ts`: outer DRAW → replacement PLAY → On Play hand cost/DRAW → outer DRAW; optional/nonoptional pair |
| Real persistence and rejected responses | New nested pair restores through a new `SessionRepository` before every response and rejects wrong-player, stale and duplicate responses; original states stay immutable |
| Recursive initial callers keep prefixes | New DRAW → AND target planning → DRAW and DRAW → up-to resource choice → target → DRAW, with repository round trip before each response |
| Normal terminal behavior remains ordered | Paired optional/nonoptional replacement DRAW; nonoptional path asserts no premature eventLog publication before pipeline continuation |
| Existing cost and ordering behavior | Full worker coverage includes transactional-cost suites and unchanged OPT-468 event immutability / OPT-757 ordering suites |

Canonical source: OP13-079/080/082 in `docs/cards/OP-13.md`; comprehensive rules v1.2.0 §§3-1-6, 8-3-1-1/3/5, 8-6-1-1; `ZONE-TRANSITION-CONTRACT.md`. The new replacement tests are shared continuation probes, not new authored-card claims. Aggregate hand-cost `CARD_TRASHED {count:1, reason:"cost", from:"HAND"}` is intentionally unchanged; the Five Elders regression also checks actual Hand→Trash state.

## Validation record

- Previous code baseline `9210ee3f`: retained paired replacement test is RED, one failed/one passed, exit 1; observed `play1,draw0,trash1,draw1,draw0`, expected `draw0,play1,trash1,draw1,draw0`. `/private/tmp/opt820-redesign-red.log`.
- Candidate `f23b7bce`: focused new/existing ownership plus resolver-service architecture suites, **19 passed, exit 0**; worker type-check **exit 0**. `/private/tmp/opt820-redesign-focused.log`, `/private/tmp/opt820-redesign-types.log`.
- First broader worker check: 2,397 passed / five existing skips and one services-shape expectation failure. The new service methods were added to the architecture contract test; its focused rerun passes. This earlier run is not the final gate.
- Sandbox full verify skipped database tests despite the correct URL and was stopped; its result is **incomplete**. A database-enabled pre-integration rerun was also stopped when main advanced. Neither is claimed as final verification.
- Final required `pnpm verify` will run against integrated main using the coordinator's disposable PostgreSQL server at port 55439. Record actual counts, numeric exit and tested head in this handoff/PR body after completion.

Generated registry plus recursive `getNestedActions` inventory was rerun using `node --import tsx`: 2,472 schemas / 3,606 blocks; DRAW 398, PLAY_CARD 261, KO 324, RETURN_TO_DECK 74, PLAYER_CHOICE 36, OPPONENT_CHOICE 8, OPPONENT_ACTION 54. Artifact `/private/tmp/opt820-redesign-inventory.json`; canonical schema inventory also runs in `pnpm verify`. Affected consumers include replacement actions, normal/recursive chains, simultaneous groups, cost-completed actions, target/choice/arrangement resumes, batch reentry, trigger ordering, and session persistence. OPT-818/819 prerequisites are merged; current-main OPT-821 field-to-Life continuation is retained.

## Follow-ups

No new out-of-scope findings. The prior confirmed nonoptional chronology finding has a retained passing regression at the implementation candidate; fresh independent review must validate the correction before the coordinator dispositions feedback or merges. No production repair, migration, separate deployment, Linear mutation or merge was performed by the implementer.
