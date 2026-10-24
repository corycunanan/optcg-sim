# Native schema 8 End-of-Battle completion (OPT-1007 reader, OPT-1003 writer)

Rules source: Comprehensive Rules v1.2.0, `rule_comprehensive.md` §§7-1-5-2 through 7-1-5-5. End-of-Battle effects finish before the turn player's and then the non-turn player's during-this-battle effects become invalid. Card sources: ST08-013 (`docs/cards/ST-08.md:64`), OP02-118 (`docs/cards/OP-02.md:736`), ST01-002 (`docs/cards/ST-01.md`); existing removal-cause interpretation remains unchanged.

## Runtime contract

OPT-1007 deployed the reader before writer activation. At its main785 delivery, OPT-1003 created new games as schema 8 with cost mode 6 and activated strictly validated historical sessions at production repository load/save and historical typed coordinator ingress. That delivery promoted historical schema 6 to schema 8 with cost mode 6 and historical schema 7 to schema 8 with cost mode 7; historical schema 8 retained its exact mode. Older supported versions first passed their existing conversion hooks and retained legacy costs as mode 6. The source<=6 policy is superseded by the approved OPT969 composition below; this paragraph records the delivered main785 policy. Live and every embedded/separate undo input validate before retention or promotion. The low-level converter/parser and explicit historical serializer envelopes remain available to test historical reader semantics independently. Rejected coordinator actions return their original live/undo state, including references.

Native schema 8 requires `costSemanticsVersion: 6 | 7`. No inference/default applies. Mode6 preserves deployed schema 6 costs, including known legacy replacement debt; mode 7 preserves native schema 7 identity choices, outcome replay and expected-root evidence. Stable completed schema 8 states retain their exact envelope and mode after their last completion frame disappears. Versions below schema 8 reject the provenance field and new continuation. Mode6 rejects native schema 7 only cost outcomes, expected-root evidence and DON identity picker metadata. The shared capability helper replaces exact7 cost predicates together, including session/coordinator publication and prompt evidence guards; main785 production promotion added only the explicit envelope/mode metadata, never payment evidence or outcomes. The bounded historical migration proof below supersedes that metadata-only source<=6 policy.

`BATTLE_COMPLETION` is one canonical root continuation boundary. Its metadata records exact battle ID, combatants, turn player, turn number and abort disposition. It owns no prompt, action suffix, cost state, trigger work or accumulated event debt. It must be unique, below the whole reused trigger execution owner and all descendants, with the live battle already cleared. This preserves payload-based combatant filters and prevents Damage Step replay. Strict validation applies independently to live state and every separate/embedded undo entry before retention; cost modes are preserved independently.

End-of-Battle event publication and trigger reporting happen once while battle durations remain visible. Existing battle-result bookkeeping still records the completed attack at battle end; aborted battles do not gain ATTACKED history. The completion boundary waits until all generations, both players' effects and every nested child have finished. It then detaches itself, expires the exact battle's turn-player effects/prohibitions followed by the opponent's, and reports BATTLE_RESOLVED and DAMAGE_STEP→MAIN once. Prohibition ownership follows the existing ownerController fallback. Legacy prohibitions lacking an expiry stamp use the boundary's exact battle ID during cleanup. New THIS_BATTLE modifiers/prohibitions created by End-of-Battle children use the boundary as their duration context after `turn.battle` clears.

BATTLE_RESOLVED and return-to-Main are uncommitted completion obligations, not early events retained in the generic publication accumulator. A terminal effect or engine-limit failure cancels them. Existing terminal handling clears all continuations and publishes committed prefixes before the single GAME_OVER. A missing/duplicate/stale owner or wrong turn fails clearly; no owner or outcome is reconstructed. Stack-limit failure during insertion cannot leave a partial owner.

## Acceptance and evidence

| Clause | Evaluation time / chooser | Observable result | Evidence |
| --- | --- | --- | --- |
| OP02-118 / ST08-013 | Defender pays counter hand cost, attacker accepts EOB option | Both Characters survive; failed protected KO skips IF_DO; protection expires after the option | Authored pipeline test through memory/live/undo; protected producer families |
| Battle power and keyword duration | EOB conditions and nested target/On-KO child prompts | Existing battle buff satisfies EOB power condition; EOB-created power/Blocker grants carry exact battle ID and remain through children, then disappear | Valid object-condition 6000 positive / 7000 negative controls in `opt-1003-power-visibility.test.ts`, both modes through the strict loaded8 reader; nested producer family for child-created durations |
| Turn-player then opponent expiry | After child stack quiesces | Seat-specific helper retains opponent effects until its step and preserves another battle's effects | Independent helper assertions plus completion implementation order |
| Battle completion | Character/Leader damage, Life Trigger, battle KO replacement, aborted Attack/Block/Counter | One EOB and one completion; no damage replay; abortion retains its flag | Writer corpus and session replay |
| Owner and publication | Source leaves, reused execution owner, nested/both-player children, terminal and stack limit | Completion remains below owner; no early BATTLE_RESOLVED; terminal cancels ordinary advancement | Writer corpus and strict/terminal unit tests |
| Cost provenance | EOB ordinary payment and replacement child in both modes | Mode6 stays legacy; mode 7 expected-root evidence survives later prompts; Decision 10 replacement commits substitute and abandons staged costs | Cost families, legacy baseline probe and unchanged native7 suites |

Evidence correction: the frozen OPT-1007 `power-condition-mode 6` and `power-condition-mode 7` generator uses an unsupported array condition. Those two cases prove exact replay/ownership only, not threshold evaluation. Their payloads, hashes and corpus totals remain unchanged; the valid positive/negative controls above supply threshold visibility proof. The original draft OPT-1003 Refresh regression had the same invalid shape; the corrected object condition was re-proven red on base `864bee2b` before its green writer run.

The corpus README/manifest pins the actual isolated writer commit, complete source patch, generator and JSON payload hashes, and derives all totals from its payloads. It is synthetic evidence, not production capture. Every action is routed through SessionCoordinator/prompt lifecycle and persisted/reloaded before its successor. Replay starts at every captured boundary, including later pauses and completion, through live storage, separate undo and embedded undo, preserving exact IDs, counters, events and state. JSON fixture encoding omits undefined properties only; no identity normalization is used. Stack-exhaustion input deliberately seeds a canonical full stack and calls the existing public battle facade plus pipeline continuation; it is an adversarial capacity case, not a naturally reached production capture.

One mode 6 replacement family is diagnostic: existing REST_DON→TRASH_SELF→DON_MINUS payment with a prompted self-removal substitute leaves a checked COST owner with no outcome and no prompt. The same controlled scenario on base69125276 exhibits that debt. Native schema 8 with cost mode 6 preserves it losslessly and keeps completion parked; this is not a completion pass or an inferred payment outcome. Mode7 preserves existing Decision 10: replacement child effects commit, staged costs roll back, remaining costs/post-colon effect do not execute, then EOB completes. This PR does not resolve the separately documented Decision 10 rules deviation.

## Rollout and rollback

Reader prerequisite PR #782 landed at `864bee2b` and its deployment completed before this writer branch. The user approved a synthetic-only evidence exception for this run. Production captures remain absent; neither the reader corpus nor the new writer golden is a captured session. Writer review, final verification and exact-head CI remain separate gates.

Promotion preserves the historical meaning of already-started continuations. A legacy EOB prompt whose effects already expired has no completion obligation to invent; only subsequently ending battles create new boundaries. OPT-966 frozen late EOB pauses explicitly retain their old complete outputs. `SessionRepository.save` returns the activated runtime, matching storage before its next action. Source wire validation precedes promotion and prompt-ID allocation; the serializer continues to derive runtime frame kinds as before. Persisted malformed kinds still reject on actual production load. End Phase stage bytes are unchanged.

Refresh expiry now runs on the incoming handoff state before TURN_STARTED publication/scanning (6-2-1 before 6-2-2). Existing REFRESH expiry remains an idempotent fallback for old paused snapshots. Start effects still precede DON return/set-active (OP11-040); Decision 3 scanning/ordering is unchanged. Memory/live/undo prompted controls assert expired power is absent while DON remains attached and cards rested.

After native8 is written, the semantic rollback floor is this native8 reader; a7-only reader rejects8 and must not reinterpret it. No reader retirement, production repair, general cost migration or automatic outcome reconstruction is authorized here.


## Authored duration inventory and limits

Current authored registry: 226 THIS_BATTLE action uses across 214 cards: 211 MODIFY_POWER, 10 APPLY_PROHIBITION, 4 GRANT_KEYWORD, 1 SWAP_BASE_POWER. These create activeEffects or prohibitions consumed by modifier power/base-power/keyword queries, prohibition/removal checks, and exact-battle expiry. The 10 prohibitions occur on OP01-120, OP02-061, OP02-101, OP02-118, OP03-002, OP05-016, OP06-055, OP08-111, ST01-002 and ST01-012. Only two authored EOB triggers currently exist: OP04-047 reads the opposing battled Character's cost/filter; ST08-013 attempts mutual KO. The real OP02-118→ST08-013 path proves the protection remains visible and failed KO skips IF_DO. Synthetic valid power and nested keyword/base-power families test query categories beyond those current authored consumers.

Inventory scope is authored THIS_BATTLE activeEffects/prohibitions. Symbol-counter power is held in `BattleContext.counterPowerAdded`, whose ordinary power-query model is a separate source-only caveat, not a confirmed gameplay defect here. OP02-064 schedules END_OF_THIS_BATTLE, for which no shared scheduler consumer was identified; this adjacent source-only scheduling gap is outside expiry-ordering/completion coverage.


## Integrated COST history reader floor

The writer also incorporates the bounded COST publication-history reader from PR #784, deployed at `c50b1d037ea38c004aa3d29b6b2ee5b90b45574e`. For schema 8 with cost mode 7, sanctioned publication preserves the committed history prefix in staged payment and rejects ambiguous evidence; mode 6 keeps its existing exact overlay behavior. This adds no persisted field. The combined writer's semantic rollback floor is this deployed c50 reader, which includes both schema 8 completion and COST history ownership. The earlier 864 reader receipt remains valid for the immutable mode 6 corpus, not for the combined mode 7 contract.

`opt-1003-cost-history-integration.test.ts` drives authored ST04-016 through its DON and target replies, then a synthetic EOB effect conditioned on the real ACTIVATED_EVENT query with another DON payment. Live, separate undo and embedded undo preserve the exact single Counter activation, expected-root and staged history, selected DON identities, and raw emitted state. The battle buff stays visible through the EOB payment, its draw precedes completion, and the buff expires afterward. The same writer emissions replay through the isolated exact c50 reader with identical final IDs, counters and events.


## Approved native cost mode7 composition (OPT-969)

The user-approved composition on deployed main785
`067b216982675dde568ceeb3da69e155f67e080e` creates new games as schema8 with
costSemanticsVersion7 before first action or save. Historical source<=6 first
validates and proves the original native7 continuation migration, then activates
schema8/mode7; source7 activates8/mode7. Existing8 always retains its explicit
mode6|7, with no inference of older provenance and no8→7 helper downgrade.
Main785 battle completion and Refresh expiry behavior remain intact. Its frozen
16-case golden and39already8/mode6 replay cases remain historical controls;
their payloads, manifests and source pins are unchanged.

Repository load/save and direct typed Coordinator share source-aware ingress.
Provenance validates before encoding; native replay and End Phase stage guards
run before wire parsing. All live and ALL undo inputs prove before retention,
prompt ID allocation, storage or metrics. Explicit8 has no validation bypass:
strict validation of its wire view is proof, then its ORIGINAL runtime object
returns without derived-kind normalization. Persisted malformed kinds still
reject independently in live, separate undo and embedded undo. Save may later
compact history or allocate prompt IDs. Direct rejected Coordinator commands
retain original live/undo references. A separately invoked prompt lifecycle
operates on its already activated8 routed input; no historical7 rollback across
two public calls is promised.

No missing root, outcome or completion obligation is reconstructed. Bounded
legacy unanswered-offer syntax canonicalization requires the existing exact
native7 proof; historical evidence-free owners remain conservative. Already8
mode6 retains its known debt and exact rollback behavior. Main785's delivery
inventory, evidence correction, positive/negative condition controls, source-only
caveats, Refresh receipts and integratedc50 floor above remain valid.

Fresh final producer proof begins with actualnewsetup8/mode7 rather than a retagged
historical7 capture. Authored Counter→real ACTIVATED_EVENT query→subsequent EOB
DON prompt crosses exact deployedc50 through live/separate/embedded undo,
retaining exact IDs/history/resources/events, visible9000buff until completion,
then5000power after expiry. A separately labeled already8/mode6 control remains.
Executed receipts record6mode/storage combinations and21boundary reloads; current
recipe proof separately records12recipes,41steps,205restored contexts and475actions.
Equality supplements independently asserted outcomes. The combined rollback
floor remains exactc50; original485/691 are known-negative history controls.

Synthetic-only evidence remains explicitly approved; production captures remain
absent. No production repair/retirement, blanket existing8/mode6 migration,
final921/948 feasibility/domain work or Decision10/958policy resolution is claimed.
Earlier failed writer reviews/design stops and subsequent968full/delta CLEAN are
cumulative. This newly approved composition has one full and one delta per same
SPEC/correctness reviewer; coordinator owns final review, full verification,
exact-head CI, merge and deployment.
