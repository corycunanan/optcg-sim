# Leg 5 — Rules map, prior audit, Doc 08, baseline drift

**OPT-967 closure:** this remains the historical audit. The full Doc08/rules-map claim checklist is reconciled against the implemented runtime in [OPT-967 evidence](../../OPT-967-DRAIN-EVIDENCE.md#full-parent-doc08-audit-disposition); [Doc08](../../08-ENGINE-ARCHITECTURE.md) now describes current scheduling. Deferred replacement, loop, visibility, and capture gates remain explicit.


ORCHESTRATOR CORRECTION: this leg read local HEAD 41f12cd0 (104 commits behind origin/main). Orchestrator re-verified against origin/main = 4fe26c6a (the proposal's baseline). All §3 friction claims still hold on main (phases.ts:182 M4 comment, :186 expire before :189 scheduled; validation.ts:361 costs.every; replacements.ts:168 stub; pipeline.ts:181 zero-power comment). The CANNOT_DRAW finding is STALE: prohibitions.ts:860+ on main enforces it (OPT-876). Engine commits since baseline: 0.

## Verdict
The proposal covers End Phase order, deck-out/termination, sequential costs, replacement recheck. It leaves unowned: player-declared loop counts (§11-1-1-2/3), replaced Life-to-hand suppressing a Trigger (§4-6-3-1), card vs effect activation (§8-5), simultaneous placement order (§3-1-7), multi-card deck moves without per-card events (§3-2-3). No High/Critical 2026-07 audit finding is open, but the proposal never names AND semantics (GE-06), event immutability (GE-07), or architecture guard tests (GE-11/12), so Phases 1–2 can regress them silently. Doc 08 has 14+ false/at-risk guarantees; §10 lists only four.

## Unimplemented/partial rules not owned by the proposal
| Rule § | Doc source | Status per doc | Proposal disposition | In-scope? |
|---|---|---|---|---|
| 11-1-1-2/3 player-declared loop count | RULES map §11 line 500; REQ 12.1; Audit residual 1 | GAP | unmentioned | Yes |
| 11-1-1 repeated-state recognition | RULES map 498 | PARTIAL | unmentioned | Yes |
| 4-6-3-1 Trigger cannot activate when life-to-hand replaced | RULES map 213 | PARTIAL | unmentioned (Phase 1 covers Life Trigger state, not suppression) | Yes |
| 8-5-1..4 card activation vs effect activation | RULES map 427 | PARTIAL | unmentioned | Yes (trigger matching) |
| 3-2-3 multi-card deck moves emit no per-card events | RULES map 168 | PARTIAL | unmentioned | Yes (triggers) |
| 3-1-7 owner orders simultaneous placements | RULES map 160; REQ 3.7 | PARTIAL | generic mention only (line 341) | Yes |
| 1-2-5 card effects that win/lose | RULES map 89 | PARTIAL, untested | partial: Phase 0 terminateGame | Yes |
| 9-1-2 rule processing mid-action | RULES map 445 | PARTIAL | Phase 0 item 2 | Owned |
| 8-3-1-3-1 partial payment → effect does not resolve | REQ 8.4; map 408 says IMPL (overstated) | | partial: §4B | Partly owned |
| 8-3-1-7 replaced activation costs | not in map | | Phase 3 + §10 | Owned |
| 11-2-1 secret-to-secret reveal | RULES map 501 | GAP | §4E generic | Separate workstream |
| 11-2-2 reveal ends after effect | RULES map 502 | PARTIAL | §4E generic | Separate |
| 3-1-8 hidden order on secret moves | RULES map 161 | PARTIAL | §4E | Separate |
| 8-2-1..4 invalidation, no retroactive | RULES map 402 | PARTIAL | §4E / OPT-910 | Provenance |
| 8-4-4-2 secret-area decline | RULES map 421 | PARTIAL | unmentioned | Borderline (prompt lifecycle) |
| 1-3-8 rest vs activate conflict | RULES map 107; Doc 08:344 says resting wins | PARTIAL | unmentioned | Borderline |
| 1-3-2 / 1-3-2-2 impossible actions, repetition counts | RULES map 96, 98 | PARTIAL | unmentioned | Borderline |
| REQ 12.4 "If" vs "Then" parsing | REQ | | §4D does not name | Borderline (IF_DO chains) |
| 4-4-2 attached DON state | RULES map 195 | GAP | | No |
| 1-3-5 / 5-1-2 deck validation | RULES map 101, 246–249 | PARTIAL/GAP | | No |

Map statuses that overstate (correct during baseline): 6-6-1-1-2..6-6-1-4 (lines 314–318) marked IMPL but OPT-924 says otherwise; 8-6-1, 8-6-1-1, 8-6-2 (433–435) marked IMPL but nested order depends on prompt boundary; 7-1-4-1-1-1 and 1-2-2-1 marked IMPL but effect damage at zero Life (OPT-925) not covered; 1-2-1-1-2 / 1-2-2-2 (83, 86) marked IMPL but mid-resolution deck-out (OPT-862) not covered. RULES-TO-ENGINE-MAP.md line 52 calls effect-stack.ts a "LIFO stack"; proposal §4A says timing is not generic LIFO.

## 2026-07 audit findings mapping (all closed per 2026-07-14 table)
| Gap | Sev | Summary | Disposition |
|---|---|---|---|
| GE-01 | Critical | Hidden-info leak | §4E |
| GE-02 | High | Stack exhaustion fails open (OPT-467) | Phase 0 item 2 generalizes terminateForEngineLimit; keep atomic clearing |
| GE-03 | High | Wrong schemas | §4D |
| GE-04 | High | Six handlers unexecuted (OPT-473) | unnamed; keep coverage gate through Phase 2 |
| GE-05 | High | Schema gate fails open | §4D partly; CI gate must stay |
| GE-06 | High | AND degrades to THEN (OPT-472) | unnamed; Doc 08:548 commit contract at risk in Phase 2 |
| GE-07 | High | Event mutation breaks snapshots (OPT-468) | unnamed; Phase 1 frames carry events/snapshots — regression risk |
| GE-08 | High | Zone identity primitive | preserved via §5 |
| GE-09 | Med | Replay determinism | §8 + §4B |
| GE-11 | Med | Architecture pressure (OPT-478/479) | unnamed; opt-478-resolver-architecture and opt-479-session-boundaries guard tests will break in Phases 1–2 unless updated |
| GE-12 | Med | Runtime type boundaries (OPT-480) | unnamed; cast-count regression must survive frame union |
| GE-13 | Med | Unbounded persistence (OPT-481) | partly via Phase 0; 1.5 MB reject-before-mutate budget unnamed |
| GE-14 | Low | Doc drift (OPT-482) | check-doc-drift.sh must stay green through Doc 08 edits |
Residual risks unnamed: player-stoppable loops; snapshot immutability is convention not runtime freeze (new frames need same contract).

## Doc 08 claims to correct (beyond the four in §10/§11)
| Claim | Doc 08 line | Why stale |
|---|---|---|
| "Every game mutation flows through the seven-step pipeline. No backdoor/exceptions." | 13, 269 | Step 3 stub (replacements.ts:168); overflow/consequence sites bypass |
| Step 3 replacement interception operative | 115, 321 | checkReplacements returns no match; real checks at consequence sites (checkReplacementForKO) |
| Zero-power K.O. | 367, 899–903 | no code; pipeline.ts:181 comment only |
| TURN_ENDED "after End Phase processing" | 462 | emitted at handoff; no end-turn effect window |
| End Phase exact order steps 1–7 | 785–792 | expiry (:186) runs before scheduled actions (:189); steps 1–2 comment only |
| Defeat checker after every action / deck-count action | 109, 363, 881, 895–896 | OPT-862 |
| Life-out for every damage path | 885–887 | OPT-925 |
| Infinite loop state-hash detection; player declares count | 371, 913–916 | no hashing; counts are GAP |
| Nested-trigger order "non-turn first then new turn-player effect" | 502, 508–540, 859–862 | pipeline.ts queue.unshift front-inserts (LIFO comment 305–307); resume path regroups differently |
| "Events are the sole interface between pipeline and trigger system" | 377 | resume path calls scanEventsForTriggers/processRemainingTriggers directly; Phase 1 adds REVEAL_TRIGGER route |
| "Pay costs (enters pipeline)" | 530, 544 | cost path runs through cost/orchestrator.ts |
| AND commit contract; IF_DO result | 547–548 | depends on handler return contracts Phase 2 aligns |
| Replacement unpayable → next eligible; replacement actions enter pipeline | 333, 671 | §10 changes §8-3-1-7 semantics; orchestration moves above zone-transition |
| Rest vs activate: resting wins | 344 | no conflict code |
| Bound scheduled action discarded if card left field | 832 | conflicts with OPT-937 source snapshots |
| Prohibitions always override | 13, 19, 315 | (now enforced for draw on main; keep claim but verify per prohibition) |
| Modifier layers / set-to-zero | 15, 562–599 | §4E hypotheses, unverified |
| Scheduled Action Queue "priority queue" | 117 | ordered list (remainingScheduledActions) |
Preserve (not correct): Principle 1 copy-on-write (11), Principle 6 persisted context (21), undo single checkpoint (104), cost façade (111).

## Baseline drift (verified by leg on stale HEAD; re-verified by orchestrator on origin/main)
| Claim | Location | Status |
|---|---|---|
| pipeline.ts continuation + trigger draining | pipeline.ts:276 continuePipelineFromExecution; :309 processTriggerQueuePipeline; :352 queue.unshift; :608 processPlayerTriggerGroup | holds |
| resume/triggers.ts second path | resume/triggers.ts:23 processRemainingTriggers; resume.ts:39 same-named wrapper; resume/batch.ts:41 reenterBatchResume | holds; name collision |
| prompt-lifecycle.ts six families | :65–66 pregame; :84 REPLACEMENT; :94–108 cost replacement; :136 REPLACEMENT_BATCH; :171–203 effect-stack; :250–253 battle damage; :220–223/:274 legacy | holds |
| EffectStackFrame optional fields; ResumeContext dup | types.ts:220, :129, :69 | holds |
| validation costs.every(isCostPayable) | validation.ts:361 (main) | holds; validation never calls sequential evaluator |
| isCostSequencePayable | feasibility.ts:74; callers cost/orchestrator.ts:121,184,249 | holds; already used on orchestrator path |
| runEndPhase placeholder | phases.ts:182 (main) comment; :186 expire; :189 scheduled; :323 TURN_ENDED | holds |
| replacement feasibility mirrors | replacements.ts:510–557 | holds |
Engine commits since 4fe26c6a on origin/main: 0. Local branch feat/shared-effect-prompt-frame is 104 commits behind origin/main.
