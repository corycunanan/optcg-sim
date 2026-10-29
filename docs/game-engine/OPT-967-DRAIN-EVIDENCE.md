# OPT-967 scheduling evidence

Scope: OPT-946, OPT-951, OPT-947, shipped together. Baseline is `a38be3a10cca8138e627fc4b7be23c9717893039`; prerequisite OPT-966 is included. The governing Revision 4 proposal §§4A, 7 Phase 2, and 9 requires one advancement owner, domain timing, saved-state continuity, retained limits, and a truthful inventory. Replacement scanning/rechecking, authoring, visibility, and general runtime frameworks are outside this change.

## Rule clause → independent result → regression

Rules were selected through [RULE-INDEX](../rules/RULE-INDEX.md) and read in [comprehensive rules](../rules/rule_comprehensive.md); expected results below precede any candidate capture. Canonical local card/FAQ sources constrain the authored fixtures.

| Clause/source | Independently expected result | Evidence under `workers/game/src/__tests__/` |
|---|---|---|
| 7-1-1-4, 7-1-2-3, 7-1-3-3 | After the step's effects/children finish, either combatant outside LEADER/CHARACTER skips to aborted End of Battle. No next-step notification, damage or battle-result events | `opt-967-step-end.test.ts`: 3 windows × attacker/target × memory/live/undo =18 cases; F11a/b in `timing-baseline/battle-step-end.test.ts` |
| 7-1-2, 7-1-3; decision debt | Late Blocker/Counter cannot bypass a pending decision or reopen a closed window | Pipeline assertions in the18 step cases and canonical redirect fixture |
| 7-1-3-2-2; [OP02-045](../cards/OP-02.md) | Counter plays a <=3 Character with **no base effect**; it cannot supply a printed On Play | `opt-967-authored-battle.test.ts` OP02-045, memory/live/undo |
| [OP05-018/OP05-011](../cards/OP-05.md), 8-6 | A legal Counter play can generate On Play inside Counter; removal closes the battle before damage | Authored Kuma/Counter case in `opt-967-authored-battle.test.ts` |
| [OP16-080](../cards/OP-16.md), [FAQ](../FAQs/qa_op16.md) | Trigger-card hand cost completes before target choice; redirect target/closed window survive reload | Authored Teach cost→target case in `opt-967-authored-battle.test.ts`; generic `opt-245-blocker-redirect-persistence.test.ts` |
| 10-2-16-1, [OP03-001 FAQ](../FAQs/qa_op03.md) | When Attacking finishes before Opponent Attack; Ace checks its locked target after Blocker choice | Authored Ace/order cases, `opt-246-when-attacked-target-locked.test.ts` |
| [OP06-048/ST03-003 FAQ](../FAQs/qa_op06.md) | Zeff's Blocker mill precedes Crocodile's On Block bottom-deck effect | Actual schemas in authored battle fixture; cost modifier is explicitly fixture setup |
| 8-6-1, 8-6-1-1; [OP07 FAQ](../FAQs/qa_op07.md) | Already pending opponent X or older same-player B resolves before newly fulfilled C: A→X→C, A→B→C | `timing-baseline/nested-trigger-order.test.ts`, full raw traces and independent final gameplay, continuous/prompt/reload |
| 6-6-1-1..4, expiry clauses | Ending-player wave, opponent wave, obligations/expiry by player, during-turn expiry, rule checkpoint, handoff; nested work finishes before the next stage | `opt-962-end-phase-order.test.ts`, `opt-962-expiry-owner.test.ts`, `opt-962-end-phase-persistence.test.ts`, timing F3/F13/F14 |
| [OP15-022 Brook](../cards/OP-15.md) and 6-6-1-4 | Delayed deck loss reaches the End Phase checkpoint before handoff, respecting negation | `opt-229-brook-delayed-deck-loss.test.ts`, `opt-977-brook-negation.test.ts`, timing F4 |
| 1-2-1-1-1; effect/self damage | Zero Life alone does not lose; qualifying damage determination does. Terminal stops remaining work | `opt-949-rule-processing-checkpoint.test.ts`, `opt-963-end-phase-effect-damage.test.ts`, timing damage/zero-Life fixtures |
| 8-3; replaced costs/prohibitions | Payment/replacement effects retain their order and waiting/rejection contract; invalid GIVE_DON recipients do not advance | `opt-869-give-don-attach-prohibition.test.ts`, `opt-824-give-don-cost.test.ts`, `opt-864-decision-10-replaced-cost-rollback.test.ts` |
| 8-6-2; Life exception | Ordinary damage work waits; Life interrupts; attacker effects finish before reveal; both damage points retain existing semantics | `timing-baseline/damage-window-order.test.ts`, `opt-872-battle-ko-replacement-continuation.test.ts`, `opt-239-double-attack-damage-split.test.ts`, `opt-886-double-attack-one-life.test.ts` |
| [OP06-116](../cards/OP-06.md) | Option legality/rejection and Life/damage order retained; option2 at opponent2Life remains inherited OPT-970 ratchet | `timing-baseline/op06-116-reject.test.ts` (expected failure is not counted as a fix) |
| Supported legacy End Phase and current writer | Same choices resume after each live/undo save; exact candidate allocation and propagation expectations are separate from historical inputs | `opt-966-future-phase-reader.test.ts`, `opt-966-final-corpus.test.ts`, `opt-962-v2-shapes.test.ts` |
| Exactly-once event occurrences | Two equal-payload occurrences publish twice; immutable aliases transfer without mutating input; save/load cannot replay them | `opt-967-event-occurrences.test.ts`, `opt-820-accumulated-events-replay.test.ts` |
| Common terminal owner and limits | No next-step debt leaks through terminal; action/stack budgets still stop work atomically | `opt-967-rollback.test.ts`, `opt-467-engine-limits.test.ts`, `opt-966-handler-exits.test.ts` |

Ticket shorthand “OP02-045 [On Play]” is corrected by the literal canonical text. Sabo OP15-046 On Play does not authorize Counter outside defending Counter Step ([FAQ](../FAQs/faq_op15-eb04.md)); OP11-012 Franky observes Event activation, not Event Trigger ([FAQ](../FAQs/qa_op11.md)). This PR does not invent extra authored effects to make the shorthand pass.

## Advancement inventory: before → after

The baseline already had one general trigger loop in `advanceTriggerExecution`; the stale historical leg-5 `queue.unshift` example does not describe this base. Consolidation removes domain-specific advancement and recursive facade entries, not a fictitious count of17 executors.

| Route/owner | Before | Candidate |
|---|---|---|
| Trigger generations | General loop in `trigger-executor.ts` | Moved intact into `pending-work-drain.ts`, extended to domain boundaries; selection/reporting remain in trigger-executor |
| Pipeline normal/continuation | Event scanner also invoked trigger executor | Scanner publishes/reports only, then pipeline invokes common drain; invalid/prohibited actions return before execution |
| Pipeline Counter→Damage | PASS executed damage internally | `executePassWork` reports Damage readiness; common drain checks step and enters damage, preserving replacement prefix ownership |
| Resolver direct effect | Public facade was also recursive service dependency | Production `resolveEffectWork`; immutable services use work-only resolver; public `resolveEffect` convenience alone drains |
| Stack response | `advanceHandler` plus session continuation loop | Work-only `resumeFromStackWork` consumes reply; session common drain; events return through pipeline continuation |
| Batch reentry | Handler/resume could recursively drain via facade | Report work; common drain calls one `reenterBatchResume` operation, rechecks children |
| End Phase | `runStages`/`runWave`/scheduled loops advanced children privately | `advancePhaseBoundary` dispatches one stage quantum; common drain finishes children; same phase frame ID reused |
| Battle/effect damage and Life | Internal bounded Life executor plus later session surfacing | Damage frame reports work; common drain owns children, continuation, and Life-reveal surfacing |
| Replacement batch | Session continuation loop completed batch/debt | `advanceReplacementBatch` reports one completion quantum; replacement input handling and matching helpers retained |
| Combatant zone checkpoint | Pre-Damage fallback left Attack/Block prompt debt unguarded | One drain checkpoint at each completed window; conditional transition owned by root until checkpoint |
| Terminal | Common terminal writer, several callers could continue their own loop | Same writer; common drain stops before any further selection, phase or damage work |
| Pregame/start-turn | Session input lifecycle policy | Retained: these bounded input/turn policy routes are not alternate general effect schedulers |
| Compatibility convenience APIs | Tests/direct helper consumers | `advanceTriggerExecution` alias; bounded Life reader wrapper; public phase/resolver/resume boundaries all call same loop. Direct `executePass` performs its bounded damage helper operation; production uses Work variant |

Production consumer inventory was resolved from TypeScript import bindings and call expressions, including aliases in `execute.ts` and prompt-lifecycle. This identifies **18** scanner call expressions (not18 schedulers): the original17 consist of play2, removal1, replaced-cost1, resume-core2, batch2, choice3, cost2, target2, and general executor2. Executor2 moved into the drain; the new central reporter adds1. The first15 remain bounded collectors returning `pendingBatchTriggers` or `services.reportTriggers`; none imports the draining facade. The drain's2 scans advance reported work in its own loop; reporter1 only enqueues. End Phase keyword matching and damage's specialized fulfilled-trigger collection are separately domain-owned reporting sites.

Durable roles remain: ordinary continuation/result references; trigger generation/selection owner; batch reentry marker; phase stage/ordered obligations; battle/effect damage debt and Life decision; replacement offer/batch; Event activation publication. Legacy `pendingTriggers` is normalized into current ownership on resume, excluding domain release boundaries. No duplicate queue is newly persisted.

## Deliberate changed expectations

Historical inputs and OPT-966 expected artifacts remain frozen. Separate `opt-967-candidate-expectations.json.gz` contains exact values for the current producer/reader; `opt-967-candidate-deltas.json` enumerates every changed field (no identity or timestamp normalization). Capture script and manifest record base, source diff hash, and expectation hash. Replays use every original input and same-seed reply stream through subsequent saves, live and undo.

| Test/family | Exact change | Disposition |
|---|---|---|
| F11a/b | Premature next-step notification removed when combatant leaves; End of Battle occurs at completed window | Rules7-1-1-4/7-1-2-3 timing correction; ratchets become regular tests, F11a strengthened to forbid Attack→Block |
| F1 complete traces | Attack→Block moves from event2 to after A→X→C. Intervening logical timestamps shift -2; active modifier and prompted action-history timestamps follow those operations | Same timing correction. All payload identities and A/X/C gameplay assertions retained. Original entire snapshot file preserved verbatim as `fixtures/opt-966-nested-trigger-order.historical.snap`; six F1 snapshots change, all F2 snapshots unchanged |
| `opt-439` accepted nested completion/overflow | Completed interrupted outer frame is now absent | Public resume drains to quiescence. Rejection restores original graph; hand/card/draw assertions retained |
| `opt-966-handler-exits` legacy parent | Previously queued older-B now completed; one draw and empty stack | Public boundary advances ready parent exactly once; not counted as a gameplay bug fix |
| `opt-966-battle-reader` direct progress probes | Damage frame no longer remains after child owner completes | Same drain completes ready debt; full session battle/event assertions unchanged |
| `opt-966-legacy-lift` direct result | Battle debt completes;2 earlier draws plus1 after-battle draw returned instead of partial2 | Existing full lifecycle order retained:2 draws before battle end,1 after |
| `opt-854` raw domain helper | Returned frames may be trigger scope/Event-activation completion rather than empty | Work-only services deliberately return obligations; raw activation counts and hand result unchanged |
| Current-writer End Phase/golden | Reused stage frame IDs and resulting prompt/frame/card IDs; legacy allocation counter differs | Stable phase-frame reuse removes allocation on each repark. Every corresponding card/trigger/result/event identity is pinned in exact delta; no new action-history entry accepted |
| Historical End Phase replay | Subsequent allocated card/registry/prompt/event payload identities follow reused frame; some historical start-pause handoff timestamps differ by2 | Complete final state and each later pause separately pinned by original start index; semantic payload identity linkage retained |
| Scheduled watcher | Reused phase frame's scaffolding source can be `draw-source` instead of `WATCHER-0-CHARACTER-1`; frame/ID counter changes | Phase dispatcher reads the continuation, not this scaffold as an effect source. Scheduled entry source/controller and queued trigger sourceSnapshot are unchanged; full field diff checks them |
| Battle-immediate intermediate prompt | Triggering-event payload carries emitted+scanned propagation flags | Independent occurrence obligations are now transferred through report boundary; event payload/gameplay unchanged |
| Counter intermediate prompt | Completed POWER_MODIFIED removed from ancestor accumulatedEvents; logical clock+1 | Already published+scanned prefix no longer retained as future debt; final event order and full state remain pinned |

Phase-history behavior was explicitly restored at the pipeline boundary; the initial candidate's newly visible `ADVANCE_PHASE` history entry was rejected as unintended. Do not classify condition-visible history or a phase source identity change as mere IDs.

## Compatibility and rollout

The reachable producer change uses **existing** root frame `accumulatedEvents` to hold an unlogged/unscanned Attack→Block or Block→Counter event. It is a new durable semantic despite no new field/version. Every generic publication/scan/prefix/terminal path excludes the conditional occurrence until its exact root quiesces. Nested completion does not release it; rejection preserves it; terminal discards it.

`opt-967-rollback.test.ts` creates actual pipeline prompts and actual SessionRepository stored dictionaries. Two synthetic scenarios (Attack and Block) exercise4 current live/undo executions,2 baseline old-writer controls,4 old-reader/new-writer live/undo executions, and4 subsequent old-reader closures. Rejection, nested-owner completion, and terminal controls are additional candidate assertions. `OPT967_BASELINE_ROOT` selects the pinned baseline engine; it is not required for normal single-build CI.

Current live/undo equals uninterrupted corrected execution. Baseline parse/load/resume succeeds. Baseline exposes its existing premature Block/Counter state; subsequent PASS closes with one battle end and no damage/result event, duplicate, deadlock, or lost decision. Exact rollback deltas: Attack eventLog[2] timestamp2→7 and DECLARE_ATTACK history6→4; Block eventLog[2]2→4, eventLog[6]10→16, CARD_TRASHED eventLog[7].newCardInstanceId `card_00000043`→`card_00000044` and corresponding trash identity, idCounter147→148, blocker history15→13. Every other field is exact; live equals undo on both builds.

Disposition: baseline-equivalent **degraded rollback**, not corrected step semantics on the old build. No reader/version retirement or production repair. OPT-971 production captures/support-window evidence remain unmet as documented in SAVED-STATE-COMPATIBILITY.md; synthetic actual-writer corpora do not satisfy that retirement gate.

## Measurements and verification

Baseline pristine suite:370 files passed/1 skipped;5,573 passed+12 expected failures+20 skipped. Original9 step-end regressions failed9/9 on baseline before implementation. Early convergence had111 failures across35 files; grouped causes were recursive boundary ownership, immutable event-alias transfer, tagged waiting admission, damage prefix retention, and structural expectations. These intermediate counts are not the final result and structural assertion changes are not gameplay fixes.

Focused convergence: common barrier/prefix controls121 passed+1 inherited expected failure; strengthened step/rollback edges20 passed; extended matrix24 files265 passed+2 inherited expected failures+1 skipped. GE-11/12 retains original protections and adds production work-only routing/existing-shape parsing guards. The occurrence-control regression covers separate equal payloads, immutability, and live/undo prompt replay.

Empirical `scripts/measure-opt967.ts` measures16 synthetic SessionRepository scenarios on pinned baseline and candidate: maximum stored value22,937 bytes on both (soft budget1,000,000; hard budget1,500,000 bytes unchanged); maximum observed stack depth4 and consumed actions3 on both. Local one-sample-per-scenario save ranges0.153–0.353ms baseline/0.154–0.393ms candidate; load0.301–2.332ms/0.333–3.462ms. These are descriptive measurements, not production latency guarantees. The unchanged hard limits100 stack/1,000 actions are exercised by the engine-limit suite; measured small fixtures do not prove worst-case storage capacity.

Final full verification and immutable candidate provenance are recorded with the PR/handoff; the candidate-expectation manifest separately pins its producer revision and immutable input hashes. Raw experiment, consumer inventory, source hashes, exact field deltas and measurement JSON are retained in run-owned OPT-967 evidence; committed scripts/tests reproduce the synthetic evidence.

## Full parent Doc08 audit disposition

This closes the full leg-5 checklist rather than its earlier four-example subset. The historical audit remains a historical record, not current runtime proof.

| Audited claim | Current disposition / owner |
|---|---|
| Universal seven-step mutation route | Corrected: player pipeline, work-only resolver/reply boundaries, one drain |
| Operative generic Step3 replacement | Corrected: stub plus consequence-site checks; shared scan/recheck OPT-968/883/923 |
| Zero-power K.O. | Removed false guarantee; power may be negative and does not itself trash (1-3-6-1-1) |
| TURN_ENDED after all processing/custom event | Corrected: modern stage waves before handoff, legacy mapping retained; keyword not runtime event |
| Exact End Phase steps | Rewritten from stage implementation and order/expiry/reload regressions, assumptions retained in rules map |
| Defeat after every action/deck-count mutation | Narrowed to actual defined checkpoints and context |
| Life-out on every damage path | Qualified lethal determination; battle/effect damage evidence mapped separately |
| State-hash/player-declared loops | Removed false guarantee; engine limits distinct; OPT-952 remains |
| Nested opponent/turn-player order | Rewritten to FIFO generations/cohorts and independent A/X/C, A/B/C expectations |
| Events sole scheduling interface | Corrected: explicit queue, phase-wave and durable domain work also report |
| Costs enter player pipeline | Corrected: cost orchestrator/resume contract |
| AND/IF_DO | Preserved preflight allowlist/atomic result contract, no generalized claim added |
| Replacement next eligible/feasible/action routing | Qualified as consequence-site behavior; Phase3 owners preserved |
| Rest/activate always resting wins | Removed unsupported general conflict resolver guarantee |
| Scheduled source departure always discards | Corrected to entry snapshot/source contract; no broad discard rule |
| Prohibitions always override | Preserved rule with activation/resolution classification and test scope |
| Modifier layers/set-zero | Scoped to supported implementation; no universal hypothetical guarantee |
| Scheduled priority queue | Corrected to ordered list and phase cursor |
| Copy-on-write | Preserved as update convention; no runtime deep-freeze promise |
| Persisted deterministic context | Preserved, plus explicit new conditional semantic and rollback disposition |
| Single undo checkpoint | Preserved session ownership |
| Thin cost facade | Preserved acyclic cost modules; production resolver work-only boundary guarded |
| GE-11/12 | Deliberate added checks; immutable services, cast/type parsing and session boundaries retained |

Unrelated partial/gap rows in the rules map (hidden-zone ordering, generic action feasibility, loop counts, unsupported event activation restrictions) are not upgraded by scheduling consolidation.

## Review repair design checkpoint — Life staging

Independent review of `cf88ad4` found that work-only resolver returns are not the old bounded Life boundary: SET_REST can return runnable batch work before a later trash-selection suffix constructs its candidates. Immediate baseline-array restoration exposes the just-revealed source to that suffix. Both battle and effect-damage routes require the same correction.

The prepatch checkpoint required exact ownership through arbitrary zone remaps, cleanup before every genuine wait/stable save, and preservation of unrelated outer markers. The first proposed retained-event lineage was rejected before implementation because existing aggregate movement events do not encode all identity edges. No private executor, new persisted field, event payload change, closure-only baseline snapshot, or Damage Step rewrite was accepted. The final transient contract below was approved at the bounded design checkpoint before runtime edits.

### Settled checkpoint and bounded repair

The proposed generic retained-event lineage was rejected before runtime edits: aggregate hand trash and draw do not carry complete instance edges. The authorized repair instead passes an explicit invocation-only `lifeTriggerStaging` result/argument context from reveal to pipeline/common drain. Each cursor is registered before the first Work quantum and names its damage frame plus exact staging slot. Zone moves map that slot in place; pushes append. Central cleanup validates ownership before removing only known slots and adjusts surviving nested slots. It clears all active scoped entries after genuine prompt candidates are constructed, or one scope when its damage owner becomes top. No cursor is reconstructed from saved frames after a wait, and no context enters GameState, frame or event payload. Terminal cleanup explicitly clears the staging list. This is exact cursor ownership, not whole-array baseline restoration.

Review observation S1 is tracked as [OPT-1000](https://linear.app/optcg-sim/issue/OPT-1000): direct `runPipeline(PASS)` during an outstanding decision is accepted on both baseline and candidate; production SessionCoordinator rejects it before dispatch. Pending-decision guarantees here cover admitted session actions and explicitly guarded Blocker/Counter commands, not unrestricted helper PASS. No runtime expansion was included for this inherited policy in OPT-967. Subsequent OPT-1000 closes the direct PASS gap with shared pending-decision validation; see [the current boundary contract and caller inventory](./08-ENGINE-ARCHITECTURE.md#direct-action-admission-and-caller-inventory-opt-1000).

### Independent findings and repair evidence

| Finding | Final correction | Independent regression / focused controls |
|---|---|---|
| F1 stale cached battle power after synchronous When Attacking | Refresh battle powers after common drain on normal, continuation and early-prompt boundaries; preserve the existing before-Damage calculation | `opt-967-battle-power`: actual EB01-003 5,000→7,000; On Block defender boost; prompted debuff with memory/live/undo and second prompt |
| F2 premature Life staging cleanup at internal Work boundary | Invocation-only exact owner/slot cursor, installed before first quantum and handed to the same drain; centralized cleanup at scoped completion or genuine wait | `opt-967-life-staging` and comparison: battle/effect internal suffix, direct handoff, PLAY_SELF→self-K.O. and return-to-hand→aggregate trash, nested same-card scopes, unrelated outer marker, ordering/target/reveal waits, memory/live/undo, rejection/duplicate, terminal; helper-only lost owner/slot controls labeled separately |
| F3 public phase facade duplicates already reported events | Drain the marked reporter result rather than the original unmarked events | `opt-967-phase-facade`: MAIN→END, refresh/draw, supported historical legacy live/undo resume |

Original three reviewer reproductions failed before repair. Separate exact-cf88 staging comparison fails both battle/effect cases; exact-a38 baseline comparison passes all three controls. The repaired comparison passes all three. Expanded repair tests pass **40/40**. The combined affected suite passes **61 files: 841 passed, 2 inherited expected failures, 3 skipped**, with zero unexpected failures. Type checking passes. Raw logs, exact command and capture comparison are retained in run-owned evidence; the final full gate and independent delta review are recorded with the repaired immutable revision.

The first expanded synthetic test draft produced 16 failures in 25 tests; its raw log is preserved. These were fixture expectations, not repaired by another runtime patch: (1) a field-registered Life TRIGGER was re-registered by PLAY_SELF and ALL_YOUR rest created genuine multi-watcher ordering; isolated lineage fixtures use a hand-scoped manual Life trigger and one watcher per player; the unadjusted ordering case is separately proved on exact baseline and candidate; (2) nested damage uses supported DEAL_DAMAGE rather than SELF_TAKE_DAMAGE, whose historical implementation does not open Life trigger decisions; (3) duplicate admission is asserted at SessionCoordinator rather than the unrestricted raw lifecycle helper; (4) WIN_GAME uses supported empty parameters and power targeting uses LEADER_OR_CHARACTER; (5) ordering assertions follow independently observed candidate construction before later ordinary watcher ordering. Target exclusion, full exact state/trace comparisons, marker cleanup and terminal assertions remain explicit. Helper-only cursor controls do not count as production-path proof.

The repaired producer's independently generated 220 compatibility values are byte-identical to the frozen prior candidate artifact: gzip SHA-256 `cff8b1982d7eec635ca19610c053cbc4014ca1865c9a2a77463131d1cfbf710f`; changed keys: none. Historical inputs, snapshots, candidate payload and delta artifacts were not regenerated. The capture script now accepts an output directory so comparison runs cannot overwrite committed expectations. Only producer provenance is advanced after this equality check. No reader/version retirement or new persisted staging contract is introduced.
