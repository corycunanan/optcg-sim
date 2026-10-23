# OPT-969 / OPT-997 native7 future producers

Base: deployed reader `4858458abb4516c3085543f84c5b20e2364c8ec6`. This amendment preserves ordinary creation/execution/writing at6. It does not enable the paused writer, promote legacy sessions, change authored schemas or alter shared cost feasibility. The coordinator owns assessment, full verification, rollout and the eventual verified rollback floor. Earlier reviews/design checkpoints remain cumulative; this stage does not reset their budgets.

## Problem and three-file ownership

The deployed reader can load a valid native7 DON identity choice and accept its reply, then silently auto-pay a later DON cost and execute DRAW. A semantic reader must reproduce future native7 continuations after load, including cost suffixes, branches, children, triggers, parent resumes, new activations and undo restoration.

| Production source | Change and invariant |
|---|---|
| `workers/game/src/engine/effect-resolver/cost/orchestrator.ts` | Positive native7 DON_MINUS/VARIABLE_DON_RETURN uses the existing identity planner. Execute exactly one semantic group/count plan through real applyCostSelection; otherwise emit the standard COST + PLAYER_CHOICE continuation. Omitted variable amount has min1; numeric0 stays on the existing no-action path. Shared costNeedsPlayerSelection/feasibility is unchanged. |
| `workers/game/src/engine/effect-resolver/cost/targets.ts` | Native7 cost pools intersect positive active/rested flags and exact state; false flags impose no constraint. Restricted pools exclude attached DON; payer/controller owns the pool. The same helper validates live and staged replies. Ordinary6 branch is byte-preserved. |
| `workers/game/src/engine/effect-resolver/resume/cost.ts` | Native7 numeric-zero generic field selection skips the removal scan/canonical replay constructor, then completes normal payment/suffix handling. Empty generic replacement replay remains invalid. Positive field and compound source-only stages retain their closed grammar. |

No changes to setup, schema constants, persistence, GameSession, promotion, action DON executor, replay classifier/guard, optional ownership, outcomes or transaction policy. The production diff is40 insertions/4 deletions in these three files.

## Sources and limits

Rules: printed cost order and complete payment (`8-3-1-1`, `8-3-1-3`), replacement of a cost exit (`8-3-1-7`), and zero repetitions (`1-3-2-2`). Repository rules are v1.2.0; the official comprehensive PDF checked during the preceding writer preflight was v1.2.1, dated2026-08-28. This amendment does not migrate the global ruleset. Synthetic multi-DON/zero reachability is not an authored-card claim. Existing194-node DON consumer audit and printed-domain corrections remain later-stage evidence.

Accepted Decision10 rollback remains a KNOWN RULES DEVIATION: accepting a later replacement can restore an earlier DON payment. `accepted-fixed-don-prefix-rollback` explicitly checks that selected donor returns to the original cost area, no DON_DETACHED event leaks, the substitute resolves once, stack clears and subsequent battle PASS succeeds. OPT-958 stays open. No claim of an official exact multicost replacement ruling.

Deferred OPT-948 feasibility controls include face-up Life→hand→hand-trash and the attached-DON choice preserving the sole active donor for REST_DON. Deterministic default feasibility is unchanged. Forced shuffle replacement, deferred general action target domains, hand-TOP mechanics and authored EB02-061/OP12-070/OP15-069 schema corrections remain outside this amendment. Full OPT-921/948 and ordinary7 writer rollout remain pending.

No UI layout/protocol shape changes. Tests use the existing PLAYER_CHOICE wire shape and public session policy; they do not establish browser geometry, keyboard or visual usability. All evidence is isolated synthetic execution, not production captures/repair/retirement.

## Immutable producer and corpus

Observed isolated producer: `ed6b264be4e38e2d52f4db49429f8efd976f5d45`, parent `7ced33a0930886bac7fc3d16040486d48df774b1`. Paused writer checkout was untouched. Its eight production files were byte-compared with the frozen prototype before capture.

Reconstruct from reachable485 using `workers/game/src/__tests__/fixtures/opt-969-native7-producers/producer/production-from-485.patch`. Metadata pins base, observed local commits, full production patch SHA256, the parent-relative patch hash `9d0cc4810e7cf9df01e979db4810429c62804fa830d7f994ef767716aa1e8858` and all8 source hashes. This patch is a non-deployable producer artifact, not extra amendment production changes. The manifest pins five generator/support source hashes and every payload hash. Initial bytes contain the actual writer-saved source schemas/card database; replies and independently asserted expected counts are in the manifest acceptance map. No old corpus or golden was rewritten.

New corpus directory: `workers/game/src/__tests__/fixtures/opt-969-native7-producers/`.

- 82 unique synthetic scenarios.
- 171 produced pending boundaries, plus82 initial loaded states =253 distinct starting boundaries.
- Four storage contexts: live, separate first undo, separate later-input undo and embedded undo. Real repository retention remains1: the later-input target is supplied after a prior snapshot, validated before retention and restored through real coordinator UNDO. This does not claim retention of multiple undo entries.
- 2264 serialized continuation action executions over all starting boundaries/contexts. Additional coordinator UNDO and post-completion DECLARE_ATTACK/PASS commands are not counted as corpus continuation actions.
- 328 scenario/context tests, plus one decisive second-pause regression, one integrity test and10 illegal/stale/live-staged controls. Counts are executions, not extra scenarios.

One opt-in generator serially captures the eight cost-pair cases and the remaining matrix, then writes one manifest. It dynamically imports the frozen producer's rig, repository, coordinator and prompt lifecycle; no engine mock or persisted frame/prompt fabrication is involved.

```sh
OPT969_CAPTURE=1 OPT969_PRODUCER_ROOT=/path/to/rebuilt-frozen-writer pnpm --filter optcg-game exec vitest run src/__tests__/opt-969-native7-producer-matrix.test.ts
```

Generation overwrites only this new corpus, never historical artifacts. Generate in an isolated review checkout and compare all payload bytes/hashes. Default CI does not capture.

For cross-build replay set `OPT969_REPLAY_ROOT` to the immutable producer root (or original485 for diagnostics); absent that variable uses the amendment. Both sides load with real SessionRepository, route every reply through SessionCoordinator and resumePromptLifecycle, save/reload every resulting boundary, and compare complete stored state/card-db/history without ID/event/prompt normalization. Recorded prompt IDs are preserved; capture binds an ID only when the raw action has none. Stale/wrong-player controls call the unassisted route. Every starting boundary resumes to completion. Independent assertions check source retention versus exact trash/deck/Life destination, count/filter legality, no premature DRAW on the decisive pair, exact chosen donor identity, Leader→Character detach and derived power, two held-duration donor cleanup, event counts, terminal dominance, empty COST stack, rollback and later PASS.

## Acceptance map

| Obligation | Actual producer cases / supporting tests |
|---|---|
| All four fixed/variable ordered pairs and first active/rested branches | Eight `DON_MINUS-*` / `VARIABLE_DON_RETURN-*` pair captures; decisive test begins at first saved prompt and preserves the next meaningful prompt/hand0. |
| Index2+, selected/fixed prefix, branch re-entry | `later-index2`, `fixed-prefix`, `choose-one-don`, `branch-don`, `any-rest-before-don`. |
| Fixed>1, omitted variable count, both payers | `fixed-count2-payer1`, `variable-count-after-fixed`; filter cases exercise both types/payers. |
| Sole semantic plan vs multiple states/hosts/durations/counts | `sole-equivalent`, `forced-all`, pairs, `attached-hosts`, `held-duration-groups`, variable count. Equivalent multiplicity alone is never used as a choice criterion. |
| Exact donor movement/power/held cleanup | `attached-hosts` selects Leader donor then source Character donor; exact appended DON IDs, host attachment0, cost area/opponent unchanged and power formula checked. `held-duration-groups` actually selects both held donors and removes their prohibitions. |
| Active/rested/exact/false/conjunction legality |20 `*-filter-*` cases plus `active-held-filter`; independent offer oracle avoids production target/planner helpers; guards mutate live and staged eligibility separately. |
| Numeric-zero DON first/later | `zero-don-fixed`, `zero-don-variable-suffix`, `zero-variable-initial`, `zero-fixed-suffix`. |
| KO/TRASH0 initially/after pause, replacement present/absent | Eight `*-zero-{initial,after}-{plain,replacement}` cases; `positive-ko-decline` and field-decline positive controls. |
| Compound secondary0 shuffle/arrangement | Four `compound-{HAND,TRASH}-zero-{shuffle,arrange}` captures. Source moves remain real payment; no arbitrary empty field replay. |
| Five captured cost stages then DON, accept/decline/terminal |15 `{fixed,field,shuffle,arrange,life}-{decline,accept,terminal}-then-don` captures. Decline pays suffix; acceptance abandons; terminal forbids suffix/DRAW. Canonical stage/optional ingress suites remain unchanged. |
| Nested child→parent, later action producer, until_count | `nested-trigger-parent`, `selected-prefix-trigger-don`, `action-after-don`, `opponent-action-after-pause`, `replacement-action-amount`, `insufficient-replacement-amount`, `until-count-after-pause`. |
| Prefix rollback / terminal payment | `accepted-fixed-don-prefix-rollback`, `declined-field-don-prefix`, `terminal-cost-suppresses-don`; existing opt864 and owner-terminal controls retained. |
| Invalid/stale/foreign/duplicate/under/over/wrong payer |10 new public producer guard cases, including original live/staged input unchanged assertions; no automatic fixture payer. |
| Provenance and all undo validation | Every corpus storage context uses real repo/UNDO; unchanged opt997-v7-provenance and replay-stage cover mixed versions and invalid embedded/separate entries beyond retention; opt379/481 cover storage size/split boundaries. |
| Ordinary6 unchanged | Unmodified opt940 writer goldens, opt968 current writer, opt997 provenance, old opt969 corpus; no legacy harness/adapters or expected-version edits in this amendment. |

The historical opt969/opt997 corpora remain supporting evidence. Mock-based older opt969 DON reader tests are retained but are not counted as mock-free producer proof. None of the paused writer's incomplete test adapters is included here.

## Validation record and negative controls

Commands use package `optcg-game`; every selection was listed before running. Complete25-file final selection: [checked-in selection](opt969-native7-producers-selection.json) and `/private/tmp/opt969-20261023-reader-producers-selection.json`; commands are `pnpm --filter optcg-game exec vitest list` / `run` followed by that exact path array; logs `reader-producers-final-{list,run}.log`. Full local gate intentionally reserved for coordinator freeze. Final focused result:1501 passed,2 opt-in tools skipped (25 files:23 passed,2 skipped). Frozen-producer replay:340 passed,1 capture tool skipped. Worker tsc passes. Affected ESLint passes with0 errors and2 unchanged unused-symbol warnings in resume/cost.ts (`transitionCards`, `_consumed`); separate final logs preserve these rather than calling the output warning-free.

Original supplied failure is red through both public coordinator routes: exact485 first saved prompt + active donor reply loses second prompt and draws; amendment retains prompt/hand0. Initial representative capture/replay8 red→8 green is retained separately. Mutation controls restore one production file at a time to485: orchestrator1 failure, target pool4 failures, zero scan4 failures. All three original candidate byte hashes were verified after restoration (`producer-mutations.json`).

The original-reader broad negative run had241 failures/99 passes/2 opt-in skips under the then-current test layout; these are expected diagnostic results, not readiness failures or241 independent defects. Its early test failure did not visit every later start. The separate read-only boundary enumerator therefore visits all253 starts on exact485:136 diverge,117 match. That enumerator passes only by asserting coverage and the known divergence; it is explicitly a negative-control diagnostic. Logs/JSON are `producer-pinned-boundaries.*`. The frozen-producer and amendment replay results are recorded separately from these diagnostics.

## Follow-ups

Deploy/verify this amendment before ordinary7 writer integration. Once ordinary7 is enabled,485 is unsafe for demonstrated future native7 producer continuations; the verified amendment becomes the semantic rollback floor. Disabling emission does not erase live/undo7 debt. No downconversion, outcome inference or production repair is proposed.

Resume the preserved writer by normal merge, never rebase/force push, then revalidate setup/promotion/first-action/consumer changes and capture its final writer evidence separately. Final writer PR, full OPT-921/948 behavior, authored schemas, OPT-958 policy and parent completion remain pending.
