# Phase 2 trigger-generation reader (OPT-966 precursor)

This is a reader-first prerequisite to OPT-944/945/975, not completion of those issues. Normal gameplay continues to produce schema version 4. This build accepts version 5, retains its native graph, resumes it semantically, and preserves version 5 when saving an unfinished generation scope. No production entry point creates that scope. After it finishes, the remaining state can again be represented as version 4. The next writer release requires this reader deployed and verified as the rollback target. The original PR7 binary cannot read version 5.

No supported version is retired. The missing real captured live/undo corpus remains OPT-971; these tests are constructed fixtures, not production captures. Existing version 1–4 conversion and validation remain in place.

## Contract

An `INTERRUPTED_BY_TRIGGERS` frame with derived kind `TRIGGER_EXECUTION` owns `triggerExecution`:

- `generations`: FIFO array of `{ triggers, orderingGroup? }`. A generation represents one activation timing, retaining the full player-ordering history separately from unresolved triggers. Turn-player effects precede opponent effects within that generation. Newly fulfilled work appends a generation; it cannot enter an older ordering prompt.
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
