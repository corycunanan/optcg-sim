# Phase 2 trigger-generation reader (OPT-966 precursor)

This is a reader-first prerequisite to OPT-944/945/975, not completion of those issues. Normal gameplay continues to produce schema version 4. This build accepts version 5, retains its native graph, resumes it semantically, and preserves version 5 when saving an unfinished generation scope. No production entry point creates that scope. After it finishes, the remaining state can again be represented as version 4. The next writer release requires this reader deployed and verified as the rollback target. The original PR7 binary cannot read version 5.

No supported version is retired. The missing real captured live/undo corpus remains OPT-971; these tests are constructed fixtures, not production captures. Existing version 1–4 conversion and validation remain in place.

## Contract

An `INTERRUPTED_BY_TRIGGERS` frame with derived kind `TRIGGER_EXECUTION` owns `triggerExecution`:

- `generations`: FIFO array of `{ triggers, orderingGroup? }`, retaining full player-ordering history separately from unresolved triggers. Turn-player effects precede opponent effects within each closed resolution cohort. Newly fulfilled work joins the explicitly open later collector; it cannot enter an older ordering prompt.
- `collectingGenerationIndex?`: index of the one open cohort, after the current generation, with no ordering history. It seals after the current older generation and its suspended children finish, using the user-approved across-sibling grouping policy described below. Without this field all stored generations are closed.
- `selectedTrigger?`: chosen work removed from its generation and cleared before activation. A selected-but-unactivated snapshot is valid only while the owner is topmost. Once activation prompts, the child frame owns progress; the selected trigger is absent and cannot replay.

An empty first generation is valid while its last selected effect is active. Empty later generations, duplicate/missing ordering IDs, inconsistent history, mixed continuation ownership, changed selection payloads, and selection groups from another generation reject with a location-bearing `SessionLoadError`. Both live state and undo snapshots take this path. Validation's flattened v4 projection is never executed; the original v5 generation boundaries remain authoritative.

The executor finishes the active effect's batch/suffix before choosing a sibling (8-6-3), retains all older sibling work before a newly fulfilled generation (8-6-1/8-6-1-1), and returns immediately at a child prompt or terminal outcome. Other continuation families retain their existing outer advancement owner; this prerequisite does not consolidate the PR9 drain loops. Resume services report newly queued work to an existing v5 owner rather than recursively executing it. Without a v5 owner they retain their baseline behavior.

Publication uses existing pending-event propagation flags and ownership transfers. It does not filter the event log. Historical anchors include all generation sources, ordering-history sources, and selected sources; terminal cleanup clears the entire stack as before.

## Evidence

`opt-966-trigger-generation-reader.test.ts` constructs reader inputs and covers A → X → C, exact full event sequences/counts and payload comparison across continuous/prompt/reload paths, A's suffix before X, two separate same-player choice generations for either turn player, selected activation cleared before suspension, terminal stop, malformed generation/selection rejection, and live/undo round trips with equivalent final players. Synthetic pause-mode comparisons normalize only the allocated C instance ID because creating a prompt allocates an additional frame ID; event payload fields are otherwise compared in full. Live/undo tests use a fixed prompt identity and compare player state exactly.

The FIFO append mutation makes A → X → C fail; retaining `selectedTrigger` at activation makes the pre-save no-replay assertion fail. Both mutations were reverted and the suite passed. A suffix publication test was red before publication moved to the executor's next-step boundary, then green.

Rules: `docs/rules/rule_comprehensive.md` 8-6-1, 8-6-1-1, 8-6-3; `docs/FAQs/qa_op07.md` OP07-019 and `docs/FAQs/qa_op10.md` OP10-042. The latter explicitly confirms the older-sibling rule during the non-turn player's resolution.

## Refreshed baseline inventory

Baseline: `bff49202d92a61d876d4e7caf561de1ea5f7c69b` (merged PR7). TypeScript AST call-expression inventory, excluding generated schema data: 34 `processRemainingTriggers` calls, five `processPlayerTriggerGroup` calls, one `processTriggerQueuePipeline` call, four `reenterBatchResume` calls, 18 trigger scans, one internal `resumeEffectChain` call. These are navigation counts, not a claim that responsibilities were consolidated by renaming.

The seven `resume/*.ts` files plus `resume-core.ts` total 5,619 lines: cost 1,545; choice 1,180; core 739; target 691; deck 661; batch 404; triggers 261; events 138. Domain groups are cost selection/replaced-cost abort; optional/block/action choice and trigger ordering; redistribution/target/overflow; deck/search/arrangement/Life arrangement; batch dispatch; trigger execution/publication; and interrupted-event ownership. Outer advancement also exists in prompt lifecycle, battle/effect damage, scheduled phase work, and pipeline continuation. The writer PR must remove domain scheduling while preserving those specialized handlers.

Authored consumer inventory uses `getAllAuthoredSchemas()` and `collectAuthoredActionCounts()` (recursive nested-action traversal), not textual matches: 2,474 schemas; 261 PLAY_CARD, 23 SEARCH_AND_PLAY, 129 PLAY_SELF, 325 KO, 40 PLAYER_CHOICE, 19 SCHEDULE_ACTION, two DEAL_DAMAGE, one SELF_TAKE_DAMAGE, and one WIN_GAME authored action uses. Trigger-block consumers include 889 ON_PLAY, 230 WHEN_ATTACKING, 57 ON_OPPONENT_ATTACK, 162 ON_KO, 502 TRIGGER, and 52 END_OF_YOUR_TURN. These include all authored registry entries, not claims of pipeline test coverage for every card.

OPT-975's old duplicate publishers are baseline `engine/trigger-queue.ts:178` (unconditional emission of resolver results) and `engine/effect-resolver/resume/triggers.ts:71` (already publishes the accumulated committed prefix, setting emission flags). The pipeline ignores that flag at the former site. Closing OPT-975 still belongs to the writer/executor migration with the real F1 pipeline fixtures.

## Validation baseline and follow-ups

Before edits, timing fixtures: seven files, 31 passing and nine expected failures. Full `pnpm verify` passed lint, both type checks, worker bundle/schema gates, root/pipeline tests, and worker coverage. The final Next build failed fetching Geist Mono from `fonts.googleapis.com` with sandbox DNS `ENOTFOUND`; this is recorded separately from source validation.

Follow-ups remain within OPT-966: enable the normal writer after deployment, finish every domain's explicit result contract, retire the alternate trigger executors, promote F1/F2 ratchets with full actual-pipeline traces, and run the authored End Phase/damage/substitute cases. PR9 drain consolidation, new event runtimes, card authoring, and retiring historical readers remain outside this prerequisite.

### Reader review fixes and final validation

The first review found two reader-only defects: automatic activation of the final sibling removed it from the queue without marking its ordering history, so reloading its prompt rejected; a loaded topmost owner could lose `accumulatedEvents` when removed. Both are covered by tests that failed before the fixes. Automatic activation now marks its history before executing. The executor transfers, scans, and publishes the owner's pending prefix before activating further work. Regression coverage includes the final sibling's target prompt under either active player and exact prefix publication order.

Full `pnpm verify` on initial reader commit `484eba97` passed, including the network-enabled Next build (exit 0). After review fixes, the focused reader suite has 15 passing tests. The corrected head is subject to a fresh full verification and independent delta review before release.


### Collector correction after rules reassessment

The initial reader incorrectly treated each scan/report as a new generation. A single effect with two PLAY_CARD instructions could report C and D separately and force C before D. OP06-086 and OP10-058 FAQs require a choice between the On Play effects fulfilled during that same resolution; OP04-058 likewise permits ordering the DON-return watcher and the played Character's On Play. The user separately approved grouping C raised by older sibling A with D raised by older sibling B at the next resolution gate. That across-sibling boundary is the user-approved interpretation, not a claim that those FAQ answers directly rule on separate older siblings.

`triggerExecution.collectingGenerationIndex?` explicitly identifies one open later generation. Reports append there while the entire current older generation (including every suspended child) finishes. At that gate the collector seals and becomes ordinary closed work. Missing metadata means all stored generations are closed; no tail inference changes earlier v5 snapshots. Existing explicit ordering histories remain closed. New occurrence IDs are allocated against the collector's existing identities, including when independently scanned reports already carry colliding IDs. Ordering choices retain collector metadata. Each nested owner has its own collector; this patch does not change damage/Life entry or deferral policy.

The strict reader rejects a collector index that is noninteger, not after the current generation, out of range, empty, or attached to ordering history. Metadata references the existing generation and duplicates no executable queue. Normal producer paths remain disabled, so only loaded v5 scopes exercise the corrected reader executor. This updated reader must be deployed before a writer emits collector metadata; the earlier reader candidate is not a rollback target for it.

Four decisive new regressions failed on `6684201a` before the correction: unprompted and prompted same-effect reports, older siblings raising C/D, and repeated source/effect reports. Coverage also includes full event payload/count/order and players across reload, repository live/undo saves containing an open collector, metadata through older ordering choices, historical closed generations, inner-owner isolation, malformed metadata and the authored Moria active/rested ordering positive guard. The actual Rebecca full-card probe currently hits an independent hand-REVEAL/deck-source discrepancy, and the Crocodile/All Sunday probe hits an auto-cost DON_DETACHED versus watcher-event discrepancy; neither is claimed fixed or used as false passing evidence here. Supported synthetic same-effect action sequences isolate the collector defect without card authoring changes.


Collector validation before fresh full review: 77 focused reader tests pass. A mutation that ignored `collectingGenerationIndex` and allocated a generation for every report fails six tests; it was reverted. Cross-mode traces normalize only the two played identities and the one drawn identity allocated after prompt frames; every event field, multiplicity, prompt option/controller and gameplay value otherwise compares exactly. Live/undo repository tests supply the same fixed prompt identity so only live prompt-ID allocation cannot skew engine identity counters. The open collector seals when the current older generation is removed; metadata is removed at that point rather than decremented through subsequent already-closed generations. Full verification of this substantive correction is recorded separately after it completes.


Evidence limits: the historical three-plus-generation test checks preservation, append and round-trip, not complete draining of every historical cohort. The nested-owner test proves report routing and saved ownership, not a new damage/Life full trace. Repository live/undo collector paths compare through the next C/D ordering prompt; separate tests select C/D and compare final complete traces. The first full verification attempt at `39fe9a85` stopped in app type-check because stale generated `.next/types/routes.d 2.ts` duplicated `LayoutProps`; generated types were preserved outside the repo before rerunning. No source change was needed for that environment failure.


### Life interruption review correction

Fresh review reproduced an additional reader defect: an accepted Life Trigger with PLAY_CARD followed by DRAW could return queued work without a prompt, causing the damage driver to advance to its next point before that Trigger's own batch suffix. Both battle and effect damage now enter the same executor with the exact existing damage frame as the stop boundary. It advances the Life Trigger's children, preserves outer owner event debt, and returns at the damage boundary without selecting an older outer sibling. Newly fulfilled ordinary On Play work remains in the outer collector until damage finishes (8-6-2); this is not a new nested ordinary-trigger execution policy. Any retained child without input parks the existing TRIGGER_EFFECT continuation for the session dispatcher. No new persisted field or normal trigger-scope producer is added. A missing stop boundary terminates as an engine contract error instead of running unrelated outer work.

The original effect-damage reproducer failed before the fix. Added effect/battle two-point fixtures cover an immediate or prompted Life play, exact full event and final gameplay equality across reload, Life suffix before the second point, older outer sibling and On Play after that point, single CARD_PLAYED and two Life removals, and terminal suffix stopping further damage/ordinary work. Battle's existing early publication of the accepted Life removal during a prompted Trigger remains unchanged; cross-reload comparisons do not pretend that the baseline prompted/unprompted battle removal publication is identical.

## Followup: future End Phase entries after a loaded v5 scope

The incomplete writer checkpoint `dfe08838` exposed a rollback replay gap in
reader `f3924a47`: the current loaded scope resumed correctly, but later End
Phase waves and scheduled effects entered the old execution path after that
scope drained. Exact event logs matched in the first witness, while future card
IDs diverged because five new writer scopes consumed IDs that the reader did
not allocate. This was not normalized away. A second witness with a scheduled
draw and prompted ordinary watcher identified the same gap at
`fireEndPhaseEvents` after the scheduled effect's scope drained.

The reader followup retains an invocation-local execution-mode argument from
the session resume's original stack. Only an existing v5 `triggerExecution`
owner enables it. It follows the existing continuation dispatcher into later
End Phase waves, scheduled effects, and their event publication boundary. Those
entries, including the turn-handoff events passed through the existing pipeline
continuation, create the already-supported owner shape and use the existing shared
executor. No extra drain loop, persisted flag, global mode, or new schema is
introduced. Normal v4 entry points keep their old path and serialization. The
loader removes schemaVersion, so runtime routing uses the explicit owner at
resume ingress, before that owner can drain.

The synthetic writer corpus in `workers/game/src/__tests__/fixtures/opt-966-*-writer.json`
records its producer commit and actual SessionRepository saves. Producer commit
`02054efe` contains the capture tests; runtime is the incomplete writer checkpoint
`dfe08838`. Both sides save/load at every pause with the same fixed prompt IDs.
The reader tests replay both live and undo snapshots, save/load again at every
subsequent pause, require a retained execution owner at each re-park, compare
prompt options/controllers, and compare complete final events, players, turn,
and execution context without card-ID, RNG, or timestamp normalization.

The bounded corpus comprises twelve starting pauses across five scenarios: five
End Phase stages, Life reveal and a prompted Trigger child, one replacement
offer, an initial End Phase wave followed by a scheduled-draw watcher, and an
initial wave followed by a prompted Start of Turn watcher during the same resume.
The handoff corpus producer is `7b8bd6d6`; the reader formerly omitted its new
scope too (writer card_00000047 versus reader card_00000046). The
producer independently asserts the intended prompt families and final outcomes
for these scenarios. This is not evidence for every possible future
v5 continuation graph, nor a production capture corpus. OPT-971's inherited
missing production-capture evidence and the prohibition on retiring supported
readers remain unchanged. Final writer snapshots must be replayed again after
its remaining migration work is complete.

Focused validation before the handoff delta: 152 tests passed, including the unchanged v4 writer golden,
legacy shape fixtures, End Phase persistence, and owner semantic tests. Disabling
mode propagation at `resumePhaseBoundary` kills six of the original ten corpus cases;
the mutation is restored. Full verification and independent reviews are still
pending at this checkpoint.

### Reassessment: legacy phase topology

External review comment 4339971127 identified a separate `LEGACY_TOPOLOGY`
failure family after the first full gate: the legacy scheduled-action re-park
assumed that only the prompt had been pushed. With a v5 owner it placed the
phase between owner and prompt, allowing later scheduled work and handoff
before the current owner's ordinary child effects. The passing staged corpus
did not exercise this graph; the earlier readiness claim was withdrawn.

The fix records the original stack depth and inserts the legacy phase below
all children created by that resolution. It applies universally, including the
writer; the unused pop/reinsert shortcut is removed. Existing single-child v4
writer goldens remain byte-identical. No converter or reader is retired.

Two additional synthetic corpus families start with a supported mixed graph:
a legacy phase (stage absent, or explicit LEGACY_SCHEDULED_ACTIONS) beneath an
actual pipeline-produced v5 owner. The bootstrap wave registration is omitted
from this historical fixture to isolate the legacy list from a second wave at
its original handoff window. Actual writer commit `a578d8a6` then produces a
prompted scheduled play, its optional On Play child, and later scheduled draw.
Saving canonicalizes an absent stage to the explicit legacy stage. The missing-
stage reader variant therefore removes that field from live and undo inputs
before loading, without modifying the immutable corpus. Each of the three
starting pauses is saved/reloaded through the session API
and replayed from live and undo. These are six additional pauses (18 total),
not production captures or a claim that ordinary new writers create legacy
phase frames. Independent assertions require phase below owner, ending player
still active at every prompt, and child work before the later draw/handoff.

Both writer cases failed before the fix on phase index 1 versus owner index 0.
Reintroducing the wrong insertion depth kills both initial legacy corpus cases
(2/18), and the restored corpus plus v4 goldens/persistence suites pass 66 tests.
This substantive reassessment requires fresh independent review and full
verification; the earlier 4d406814 gate does not establish readiness of this
correction.
