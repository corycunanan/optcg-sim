# Phase 1 ownership close-out (OPT-965: OPT-884, OPT-943)

Baseline: `c4ef36374712139c1afa99f2ce9d3846e595e1fa`. Implementation reviewed across the commits in the PR; `7bf07bff` was an intermediate, unshipped review pin.
This is an in-place consolidation. No new executor, persisted field, schema version,
manual production repair or separate deployment is introduced. Normal merge-triggered worker deployment is expected. Supported saves remain versions 1–4.

## Recovery and publication decisions

An unanswered `CHARACTER_KO_REPLACEMENT` that reaches the top without a prompt
aborts its matching Damage Step through `endBattle({ aborted: true })`. It never
infers a declined replacement and never K.O.s the target. Battle effects expire,
one aborted `END_OF_BATTLE` publishes, and another attack is legal. A stale battle
ID aborts only a stranded Damage Step with no other work after discarding the stale
frame. A newer battle with another live frame, or a battle outside Damage Step,
is preserved. A missing battle merely loses the orphan frame. Recorded resolutions
outside Damage Step cannot K.O. anything. Terminal games cannot accept prompt replies.

**Automatic on-load battle repair is declined.** The affected production-session
count is **unavailable**, not zero: this run has no sanitized production captures or
live-session census. OPT-971 is still the unmet capture gate. A missing continuation
cannot tell us whether a K.O. was declined, whether a substitute happened, or which
watchers already fired. Loading classifies stuck/orphan states without executing
battle effects or writing storage. A completely empty-stack Damage Step is now
included in `legacy.stuck_damage_step`; an unanswered frame is stuck even when its
target remains on the field. Live and undo receive the same policy. Repair requires
an authorized, separately reviewed plan and export, per the compatibility runbook.

Unknown frame IDs are rejected with the state/undo location; completed prompt IDs
cannot execute another top frame. Unknown structural context fields are rejected
instead of being discarded. A historical structural context with an existing stack
is repointed at its already authoritative top frame, matching the old lifecycle's
precedence. With no stack, supported action-choice contexts lift once into a normal
frame. Subsequent loads and writes retain that frame, without a second ID allocation.

`GameSession` concession, abandonment/timeout and engine outcomes already used
`terminateGame` at baseline. Its event-free `clearTerminalPendingWork` contract now
also clears validated historical terminal snapshots on load (prompt, stack, battle,
sub-phase and old root debt), preserving the recorded outcome and event log. Invalid
native v4 terminal shapes rejected by the existing v4 reader remain rejected; this
is not permission to bypass strict validation. No `GAME_OVER` is emitted by loading.

### EB03-001 and rule 8-6

Sources: [comprehensive rules §8-6](../rules/rule_comprehensive.md),
[EB03-001 card text](../cards/EB-03.md), and [EB03 FAQ](../FAQs/qa_eb03.md)
(the local FAQ contains no EB03-001-specific exception).

Vivi's hand trash replaces the Character battle K.O. inside Damage Step. Rule
8-6-3 postpones ordinary auto-effect activation until the current effect finishes;
8-6-1 then gives the turn player's group priority. Section 8-6-2 specifically
addresses damage to a Leader and is not the basis for Character K.O. ordering
(4-6-1 and 7-1-4-1-2 distinguish those consequences). The retained batch also
matches this engine's synchronous substitute completion path. The previous nested-prompt path drained hand-trash watchers before the
battle prefix. That pinned old sequence was evidence of the defect, not a rule.

The existing `BATTLE_DAMAGE` frame retains substitute publication debt in
`accumulatedEvents` and matches produced by the existing scan boundaries in `pendingTriggers`. These
matched watchers retain their source identity and are not rediscovered at battle
completion; this does not promise that every scan precedes later action-chain moves. The existing pipeline executor consumes the combined
queue after the battle ends. No third executor or general Phase 2 ordering policy
is added. The battle prefix need not become another persisted payload: existing
`battleId`, target, attacker and controller fields deterministically reconstruct it.
The resulting batch is `PHASE_CHANGED`, `CHARACTER_BATTLES`, `COMBAT_VICTORY`,
substitute events, `END_OF_BATTLE`, then watcher resolution. Existing propagation
flags prevent duplicate publication/scanning. Continuous, live-load and undo-load
Vivi tests assert turn-player battle watcher before non-turn-player hand-trash watcher.

## Ownership inventory

An **owner** is a durable location containing enough data to resume one unfinished
operation, together with the executor entitled to consume it. References, derived
presentation, transient handler results and compatibility converters are not owners.
Counts below describe supported runtime representations, not textual occurrences.

| Work | Classification and authoritative location | Consumers / disposition |
|---|---|---|
| Ordinary action continuation | Authoritative frame; **2 supported representations → 1** (structural prompt or frame → frame) | Resolver and stack resume; historical structural context lifts at storage boundary. Session structural executor branches **1 → 0**. |
| Cost/payment progress | Authoritative frame with costs, refs and optional staged transaction | Cost handler and cost resume. Historical committed-payment frames retained; see gate below. |
| Prompt context | Reference to owning frame; options are derived presentation/validation | Lifecycle checks live top-frame ID before execution. Prefill/transient `ResumeContext` remains a handler-result adapter, never a second session scheduler. |
| Replacement offer/batch | Authoritative `REPLACEMENT` / `REPLACEMENT_BATCH` frame | Replacement resume; separate child operation from the battle or action it replaces. Old prompt objects/batch riders are converter input only. |
| Battle damage | Authoritative `BATTLE_DAMAGE` frame, **1 → 1** | Battle/lifecycle; repaired recovery and scoped substitute debt/queue transfer. Publication boundaries **2 → 1** is a behavioral count, not another owner reduction. |
| Effect damage | Authoritative `EFFECT_DAMAGE` frame; parent ID is reference | Damage resume and lifecycle. Ordinary deferred watchers remain on that frame. |
| Event activation | Authoritative `EVENT_ACTIVATION` frame | Pipeline/resume completion. Root debt and old nested rider have **0 active writers before and after**; retained compatibility types/readers are not runtime producers. |
| Play overflow / distribution | Authoritative frame `playOverflow`, `stateDistributionForPlay`, batch marker | Play, target/choice resume, batch reentry. `ResumeContext.ruleTrashForPlay` is transient; old frame rider is converter input. |
| Trigger work | Authoritative frame queues, simultaneous groups and ordering progress | Pipeline and resume executors; Phase 2 owns general policy unification. |
| End Phase | Authoritative phase-boundary stage and collected actions | Phase continuation. Root `scheduledActions` owns obligations not yet collected, not duplicate collected work. |
| Pregame suspended Leader effect | Authoritative `PREGAME` boundary; child ID reference | Stack unwind and pregame continuation. |
| Pregame priority/mulligan/phase ledgers | Explicit out-of-game lifecycle | Pregame machine and two pregame context tags. They do not schedule competing gameplay effects; suspended engine actions use the PREGAME/frame contract. |
| Battle step, locks, redirect window | Authoritative battle lifecycle state; sub-phase mirrors step | Battle, guards and redirect reply. |
| Source snapshot / activated source ref | Immutable identity, reference metadata | Enqueue and activation consumers. No frozen dynamic power/cost/DON state. |
| Once-per-turn, trigger staging, deck-hit-zero, performed actions | Lifecycle ledgers | Turn/rule consumers; not executable continuations. |
| Event propagation flags / kind | Derived bookkeeping/discriminator | Publication/scanning and frame dispatch; do not count as separate work owners. |

### Retirement and remaining compatibility

Removed runtime path: `resumePromptLifecycle`'s empty-stack structural
`resumeEffectChain` executor and its structural-context discriminator. Loaded
structural contexts are now frame references, so re-saving them writes no structural
continuation. There is no new production structural writer to delete: action
handlers already hand their transient contexts to frame builders. Synthetic tests
may still deliberately construct historical payloads for reader input.

**Legacy committed-cost handling is retained deliberately.** Frames written before
OPT-614 can have earlier costs already committed to root state, without a staged
rollback snapshot. Their abandon branch must publish retained paid events; inventing
a staged snapshot would falsely imply those payments can roll back. They have one
frame owner and no current writer, not a competing side-channel. This compatibility
consumer cannot be retired under the current support window and missing OPT-971
captures. Likewise old root/turn/battle/rider readers and declaration types stay.
Schema version 1 is not retired. No unsupported global owner-count reduction is
claimed. Phase 2 (OPT-966 / OPT-944 / OPT-945) still owns handler contracts and the
general pipeline-versus-resume trigger ordering policy.

## Consumers and reproducible counts

Recursive authored-registry traversal (including nested choices, substitute actions
and compound triggers) finds **2,474 cards**, **21 battle-eligible replacement
blocks/cards**, and **2,420 auto blocks on 1,922 cards** in the broader scanner
population. These are static candidate counts, not claims that every card activates
in every battle. Predicate: replacement event is WOULD_BE_KO,
WOULD_BE_REMOVED_FROM_FIELD or WOULD_LEAVE_FIELD, and cause is absent/ANY/BATTLE.

| Authored consumer family | Cards / paths |
|---|---|
| Vivi nested hand selection | EB03-001 `effects[0].replacement_actions[0]` |
| Other battle-eligible substitutions | OP04-082, OP05-001, OP05-030, OP05-032, OP05-100, OP08-045, OP10-034, OP11-110, OP12-061, OP14-092, OP15-003, OP15-014, OP16-018, OP16-033, OP17-023, OP17-043, ST09-010, EB04-030, EB04-031, EB04-044 |
| Hand-trash watcher candidates | OP12-040, OP14-045, OP14-049, OP14-056 |
| Life-add/remove watcher candidates | OP05-107; OP08-105, OP11-041, OP12-099 |
| Battle/combat-victory watcher candidates | ST02-010, ST05-010; OP02-094, OP04-086 |
| End-of-battle watcher candidates | OP04-047, ST08-013 |
| Other substitute watcher families | DON returned: 19 cards; Character rested: 10; Character removed: 7 |
| Authored effect damage | OP06-116 `effects[0].actions[0].params.options[1][0]`, amount 1; EB03-055 `effects[1].actions[0]`, default amount 1 |

Only ordinary prompt ownership changes from two representations to one. All other
listed families retain their existing authoritative location. Some old runtime
writers were removed in PRs 5/6, not this PR; claiming those removals again would
misstate the baseline.

Textual footprint audit, engine/session `.ts` files only; cells are occurrences/files.
These count comments as well as code, and are **not owner or authored-consumer counts**.

| Pattern | Engine before → after | Session before → after |
|---|---|---|
| `pendingEventActivationEvents` | 2/2 → 2/2 | 9/5 → 9/5 |
| `eventActivationCompletion` | 0/0 → 0/0 | 11/4 → 11/4 |
| `ruleTrashForPlay` | 10/5 → 10/5 | 9/4 → 11/5 |
| `ResumeContext` | 75/16 → 75/16 | 6/1 → 2/1 |
| `batchResumeMarker` | 5/2 → 5/2 | 7/4 → 10/5 |
| `triggerOrderingGroup` | 59/8 → 59/8 | 22/5 → 22/5 |
| `phaseBoundaryContinuation` | 6/2 → 6/2 | 22/5 → 22/5 |
| `redirectWindow|blockerLocked|targetLocked` | 16/3 → 16/3 | 13/2 → 13/2 |
| `pregameContinuation` | 4/2 → 4/2 | 12/2 → 12/2 |
| exact `eventActivation` | 10/4 → 10/4 | 17/2 → 17/2 |
| `playOverflow` | 7/4 → 7/4 | 18/2 → 19/3 |
| Four retired v2 records/riders combined | 0/0 → 0/0 | 31/1 → 31/1 |

Reproduce footprint rows with `rg -n 'PATTERN' workers/game/src/engine workers/game/src/session -g '*.ts'`;
count regex matches and distinct files. Use `git show c4ef3637:PATH` for baseline text.
The four v2 patterns are `pendingTriggerFromEffect|pendingBattleDamageContinuation|pendingTriggerLifeCard|replacementBatchContinuation`.
Reproduce authored traversal:

```python
import json
from pathlib import Path
text = Path("workers/game/src/engine/authored-schemas.generated.ts").read_text()
registry = json.loads(text[text.index(" = ") + 3:].strip().removesuffix(";"))
def walk(value, path="$"):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items(): yield from walk(child, path + "." + key)
    elif isinstance(value, list):
        for index, child in enumerate(value): yield from walk(child, path + f"[{index}]")
for card, schema in registry.items():
    for path, node in walk(schema):
        replacement = node.get("replaces", {})
        if (node.get("category") == "replacement"
            and replacement.get("event") in {"WOULD_BE_KO", "WOULD_BE_REMOVED_FROM_FIELD", "WOULD_LEAVE_FIELD"}
            and replacement.get("cause_filter", {}).get("by") in {None, "ANY", "BATTLE"}):
            print("replacement", card, path)
        if node.get("type") == "DEAL_DAMAGE": print("damage", card, path, node)
        if node.get("category") == "auto" and node.get("trigger"):
            print("auto", card, path)
            for _, trigger in walk(node["trigger"]):
                if "event" in trigger: print("watcher", trigger["event"], card)
```

## Evidence and limits

All committed fixtures remain **synthetic**, including real engine-driven games.
None is a captured production Durable Object session. OP06-116 is an authored/current
card witness; OPT-926 DEAL_DAMAGE 2 remains synthetic/latent (the two authored damage
cards deal one). Constructed dual watchers isolate rule ordering; the Vivi substitute
itself uses the production registry.

Baseline: 12 relevant files, 411 passed and 1 expected failure. Missing dependencies
were installed from the unchanged lockfile before that baseline. Recovery and
structural-ownership regressions were observed red before the fixes. Final full
worker suite at scan-propagation fix `80c084f3`: 361 files, 5,349 passed, 19 expected failures,
5 skipped. `pnpm verify` results and exact reviewed head belong in the PR/receipt.

Behavior evidence: OPT-872 continuous/load/replay, next-attack recovery and
continuous/live/undo watcher priority; OPT-940 structural conversion, deterministic
reload/re-save, strict unknown reference/payload rejection and terminal normalization;
OPT-963 typed replacement/damage/End Phase and OPT-964 v4 reader/fixture suites;
`timing-baseline/op06-116-reject.test.ts` authored witness; existing terminal suites
cover concession/abandonment and engine outcomes. Full worker verification reruns all.
No completed frame or stale prompt can execute through the session lifecycle.


### Guard mutation evidence

Mutations ran in an isolated `git archive 7bf07bff` tree with dependency links,
never in the reviewer checkout. Each edit was restored before the next run. The
command was `pnpm --dir <archive>/workers/game exec vitest run src/__tests__/<test> -t <filter>`.
All five mutations were killed by behavioral assertions, not import/type failures:

| Mutation | Test / filter |
|---|---|
| Replace unanswered `endBattle(...aborted)` result with `popFrame` and no events | OPT-872 / `an unmatched or unanswered` |
| Disable lifecycle top-frame reference guard | OPT-872 / `a stale prompt reference` |
| Disable both battle queue transfer and top battle substitute drain deferral | OPT-872 / `watchers wait for damage` (continuous/live/undo) |
| Return unchanged state instead of newly lifted structural frame | OPT-940 legacy shapes / `lifted structural work` (live/undo) |
| Return migrated terminal state without common cleanup | OPT-940 legacy shapes / `terminal cleanup discards` (live/undo) |

Disabling only the scanner transfer survived: the top-of-substitute drain is a
second transfer site for already queued triggers. Disabling both paths exposes the
premature watcher execution and kills the test. This redundancy is recorded rather
than claiming the single-site mutation detected a regression.

### Actual deployed-reader replay

An independent archive of deployed reader `6b394da6538d317eca314d9a6ef47553cb16c3d1`
loaded and executed the newly lifted structural frame and the supported historical
optional suffix, live and undo, with matching players, events, execution-context
RNG/IDs, final prompt and stack. Historical optional skip/PASS remains rejected.

A stronger synthetic substitute fixture generated by `80c084f3` K.O.s a Character,
retains a surviving external watcher's draw, then asks for hand trash. Both
`6b394da6` and `c4ef3637` parse it but drop the retained watcher (zero draws instead
of one). Syntax compatibility is insufficient: **those builds are unsafe rollback
targets once this writer activates**. Reader prerequisite PR #762 consumes existing
battle-frame event/watcher debt without introducing writers. This writer cannot
merge until that reader is merged and successfully deployed. The coordinator
receipt pins the deployed minimum rollback SHA. No intermediate writer was shipped.
All these states are synthetic, not captured sessions; OPT-971 remains unmet.

### Review corrections and consumer coverage

The scanner can return no immediate triggers after transferring matches onto the
battle owner. K.O., SET_REST and PLAY_CARD consumers now always preserve its scanned
event copies. The rule-trash last-known-board path transfers the retained battle
queue as well as execution context. Surviving external K.O./rest watchers followed
by another substitute prompt exercise continuous/live/undo replay: each child event
is marked scanned, the watcher remains queued, and exactly one draw occurs.

Structural lifting intentionally fixes another old fallback defect: accepted
structural actions previously changed zones while dropping their event publication
and scan obligations. The common stack path now publishes one CARD_KO and activates
one surviving external watcher; repeating the response rejects without extra events.
This is a correctness change, not an assertion of byte parity with that broken path.

Known string prompt references must name the top frame. No inventoried writer emits
a prompt pointing below a newer child. Such malformed input is rejected at load
with location, referenced ID and top ID, without mutating storage; it is not silently
repointed to another executor. Live/undo regressions cover this disposition. Supported
structural OPTIONAL_EFFECT inputs lift to the ordinary action-choice frame, including
acceptance and the historical skip/PASS rejection. Modern optional offers keep their
existing semantics.

### Mandatory entry and synchronous queue contract

The bounded mandatory probe found the same missing-owner-at-substitute-entry root:
`checkReplacementForKO` executed a mandatory chain before its caller created the
battle frame. Six synthetic mandatory K.O./rest cases failed before the fix. The
battle caller now wraps only the existing replacement execution service to insert
the same resolved battle owner before that first chain action. Optional/no-match
paths do not allocate this extra ID. A prompted chain keeps it; synchronous completion
consumes it once; terminal completion keeps the shared terminal cleanup contract.

The synchronous regression also exposed an accumulator adapter boundary: `executePass`
formerly used only the outer events array. It now forwards the actual damage result
and its transient `queuedTriggers` to the existing pipeline's deferred-queue argument.
`ExecuteResult.queuedTriggers` is an in-memory result, not new stored state. The two
production pipeline entry points consume it: normal `execute` dispatch and
`continuePipelineFromExecution` (defaulting to this queue unless the caller explicitly
provides its merged queue). Prompt lifecycle's damage adapter already passes the same
queue explicitly. `fireScheduledEventsAndTriggers` builds an event-only result and
has no retained owner queue; terminal paths intentionally discard pending work.
Inventory commands: `rg -n 'fireEventsAndTriggers\(' workers/game/src --glob
'!**/__tests__/**'` and `rg -n 'executePass\(|continueBattleDamageFrame\('
workers/game/src --glob '!**/__tests__/**'`.

Twenty-four bounded cases cover optional/mandatory × K.O./SET_REST × one/two targets
× continuous/live/undo. They preserve scanned child events, retain all matched
external watchers through a later hand prompt and fire each once. Synchronous
mandatory SET_REST→hand-trash proves one watcher after END_OF_BATTLE; a mandatory
draw-to-deck-out proves one GAME_OVER and no resurrected battle/frame/prompt. These
are synthetic mechanics coverage, not claims of authored mandatory prompting cards
or a general rule-6-2 scheduler rewrite. Existing unrelated multi-target batch suites
remain the broader interleaving regression gate.
