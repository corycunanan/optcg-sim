# Saved-State Compatibility — Game-State Schema Version, Frame Kinds, Support Window, Rollback Runbook

> Written before the reader code for OPT-940 (PR 1 of the Game Engine Consolidation, parent OPT-959). This is the contract every later consolidation PR writes through. Code of record: `workers/game/src/session/game-state-schema.ts` (version dispatch and conversion), `workers/game/src/session/persisted-game-state.ts` (strict shape), `workers/game/src/session/persistence.ts` (storage boundary).

**Status:** Contract in force from PR 1. Writers are unchanged in PR 1; the reader assigns version 1 to every save that exists today. From PR 4a (OPT-980) the reader also reads version 2 (the End Phase stage, §6); from PR 4b (OPT-924) the writer writes version 2 (§1.6). From PR 5a (OPT-963) the reader also reads version 3 (typed replacement and damage continuation frames, §8) and lowers it to the version 2 runtime (§1.7); PR 5b raises the runtime and the writer to version 3 (§1.8). PR 6a reads version 4 by strict lowering while runtime and writer remain version 3 (§9). PR 6b executes and writes version 4 after the verified 6a deployment (§10).

**Related:** [Rev 4 proposal snapshot §7, §10](./audits/consolidation-2026-10/proposal-rev4-snapshot.md) · [Handoff doc](../project/handoffs/game-engine-consolidation.md) · [Doc 08](./08-ENGINE-ARCHITECTURE.md)

---

## 1. Three versions, three meanings

| Version | Where | Meaning | Who bumps it |
|---|---|---|---|
| `SESSION_STORAGE_FORMAT_VERSION` (`persistence.ts`, currently `2`) | `session.formatVersion` | How the Durable Object splits one session across storage keys (`session`, `session:card-db`, `session:undo-history`) and which envelope fields exist. Says nothing about the shape of a game state. | Storage layout changes only. |
| `executionContext.version` (`execution-context.ts`, currently `1`) | `state.executionContext.version` | The RNG, id-allocation, clock and budget algorithm. Replays are byte-equivalent only under the same context version. | RNG or id-allocation algorithm changes only. |
| **`GAME_STATE_SCHEMA_VERSION`** (`game-state-schema.ts`, **`1`** from PR 1, **`2`** from PR 4b; the writer's version. PR 4a adds `LATEST_READABLE_GAME_STATE_SCHEMA_VERSION = 2`, the reader's; PR 5a raises it to `3` and adds `RUNTIME_GAME_STATE_SCHEMA_VERSION = 2`, the shape the engine executes) | `schemaVersion` key on each persisted game-state object: the live `session.state` and every entry of `session:undo-history` | The shape and semantics of `GameState` itself: turn, battle, effect-stack frames, prompt continuations, phase boundaries, pending damage records. This is the version every consolidation ticket bumps when it adds or changes a persisted shape. | Any PR that adds a persisted field whose meaning a prior reader cannot understand. |

The three are independent. A game-state bump never implies a session-format bump and vice versa.

### 1.1 Version assigned to legacy saves

Every save written before PR 1 has no `schemaVersion` key. The reader assigns **version 1** to a persisted game-state object whose `schemaVersion` is absent. An explicit `schemaVersion: 1` means the same thing. This rule is permanent: a missing key always means 1, never "latest".

The version lives on each game-state object, not on the session envelope, because undo snapshots are stored and loaded separately and a session can legitimately hold a live state and an undo snapshot written by different builds (a reader-capable build persists an undo entry written by the previous build). Mixed-version undo history is a supported, tested input.

### 1.2 What the reader does with each version

The reader is one function, `convertPersistedGameState(raw, location)`, and it is the only path from storage bytes to a runtime `GameState`. `parseStoredSession` calls it once for `session.state` (`location = "state"`) and once per undo snapshot (`location = "undoHistory[i]"`). There is no second parser.

Order of operations, fixed by this contract:

1. **Read the version.** Absent → 1. A non-integer, a negative number, or `0` → reject. An integer above `LATEST_READABLE_GAME_STATE_SCHEMA_VERSION` → reject as unsupported (a newer writer wrote it; this build cannot interpret it). An integer below the oldest supported version → reject as retired (see §3).
2. **Convert.** The converter for that input version produces an object in the current runtime shape. Converters are a chain: `v1 → v2 → … → current`. A converter never discards an unknown field to make validation pass; it maps fields it understands and leaves the rest for strict validation to reject.
3. **Strictly validate the converted object.** `validatePersistedGameStateCore` (Zod `strictObject`) plus the action, event, effect-block and frame checks in `parseStoredGameState`. Unknown keys fail here.
4. **Validate continuation references and semantic invariants.** The converted state must be internally coherent: every frame reference resolves, every frame's `kind` (if present) agrees with its content, battle and phase-boundary records agree with turn state. See §2.3 and §4.
5. **Apply load-time legacy migrations** that are content rewrites rather than shape changes (today: `migrateLegacyTriggerRegistry`, OPT-796).
6. **Classify legacy shapes** that are loadable but owned by a later ticket (§4), and log the classification. Classification never mutates state.

After the hook, `SessionRepository.load()` applies two pure, write-free normalizations that predate it and are not part of the conversion contract: `ensureExecutionContext` (fills a missing execution context) and `restoreIdCounterInvariant` (OPT-891, raises a low id counter and logs). "One entry point" means one path from stored bytes to a validated runtime shape, not that nothing runs after it.

A failure at any step throws `SessionLoadError` carrying `location` and `reason`. Storage is never written during a load, and the repository's in-memory bookkeeping is only updated after every snapshot converts, so a failed load leaves the three storage values byte-identical and the repository unchanged.

### 1.3 Writer policy for PR 1

Writers do not change. Persisted output for every state the current engine can produce is byte-identical before and after PR 1, proven by a golden test (`opt-940-writer-golden.test.ts`) against a fixture captured through the pre-change writer at the base commit. The `schemaVersion` key is **not** written in PR 1. The first writer that emits it is the first PR that bumps the version to 2.

### 1.4 Values PR 2 writes without a version bump (OPT-960)

PR 2 (OPT-949/OPT-925/OPT-862) writes new values into existing v1 fields only: `engineOutcome.type: "ENGINE_LIMIT"` (the v1 schema parses `engineOutcome` as `z.unknown().nullable().optional()`), new `winReason` strings (a free string), and terminal states whose `turn.battle`/`battleSubPhase` are `null` and whose `pendingTriggerFromEffect`/`pendingBattleDamageContinuation` are absent (all optional or nullable in v1). The `GAME_OVER` payload keeps its strict v1 keys (`winner`, `reason`, `diagnostic`). No new key, frame kind, or field is written, so the version stays 1 and the PR 1 build (`1b3f6a50`) remains the rollback target; the PR body carries the rung-4 proof that the PR 1 reader loads a live state and an undo snapshot holding every new terminal value. Only terminal states change; the writer golden is byte-identical.

### 1.5 Writer policy for PR 4a (OPT-980)

PR 4a reads versions 1 and 2 and writes version 1. `toPersistedGameState` (`game-state-schema.ts`) is the writer side of the hook; `SessionRepository.save` applies it to the live state and to every undo snapshot.

* A state with no End Phase frame is returned unchanged (the same object), so the writer golden stays byte-identical.
* A frame at `LEGACY_SCHEDULED_ACTIONS` is written stage-less. That is the same meaning in version 1 (§4), so a converted legacy session that the PR 4a engine re-saves, or re-parks, is written with the base writer's bytes and the base build (`6e6347de`) still loads it (PR body, rung 4).
* A state holding any other stage can exist in a PR 4a process only after it loaded a version 2 save, that is, after a rollback from the PR 4b writer. Version 1 cannot express the stage, so that object is written with `schemaVersion: 2` and reloads with the meaning it was read with. No state the PR 4a engine creates from version 1 input is written as version 2.

### 1.6 Writer policy for PR 4b (OPT-924)

PR 4b writes version 2. `toPersistedGameState` puts `schemaVersion: 2` first on the live state and on every undo snapshot and keeps every End Phase frame's stage. A runtime frame without a stage can only be a version 1 frame; it is written with `LEGACY_SCHEDULED_ACTIONS`, its version 1 meaning, because the PR 4a reader rejects a version 2 frame without a stage. The writer golden is `opt-962-writer-golden.synthetic.json`; it equals the frozen version 1 golden plus the version key on every game-state object, except `end-phase-parked`, whose state the new engine builds with a staged frame (`opt-940-writer-golden.test.ts` pins both facts). The version 1 golden stays as base-writer reader input. A drift test (`opt-962-v2-shapes.test.ts`) fails if the engine writes an End Phase shape that the PR 4a reader's fixtures do not cover. PR 4b also writes one optional key on prohibitions, `ownerController` (only NEGATE_TRIGGER_TYPE writes it: the player whose 6-6-1-2 step ends the negation, while `controller` keeps the affected player). The PR 4a reader parses `prohibitions` as `z.array(z.unknown())`, so it loads and keeps the key (rung 4 against `9da8ba17`, live and undo, PR 4b body); the drift test pins the prohibition key set. A prohibition saved without the key falls back deterministically (`prohibitionOwner`, `duration-tracker.ts`): a row with `scope.triggerType` (written only by NEGATE_TRIGGER_TYPE, whose one authored use, OP09-081, negates the opponent's effects) belongs to the other player; every other row belongs to `controller`.

### 1.7 Reader policy for PR 5a (OPT-963)

PR 5a reads versions 1, 2 and 3 and writes version 2. Version 3 (§8) moves the replacement and damage continuations into four new frame kinds and adds the `AWAITING_TRIGGER_REVEAL` phase. The PR 5a engine is the version 2 engine: it cannot resume a frame of a new kind. So that 5a is a real rollback target for in-flight games written by 5b, its reader does not lift version 2 into version 3; it goes the other way:

1. `convertFromV2` rejects v3 fields and phases in a v2 object. `convertFromV3` strips the envelope and rejects retired v2 continuation records, riders, and replacement prompt contexts beside v3 frames. Strict validation rejects non-damage frames at `AWAITING_TRIGGER_REVEAL`, and replacement offers without their owning prompt. No 5b engine path persists those offers separately; 0 of the 4 committed engine-written states contain an unnamed batch offer (`opt-963-5b-written-states.json`, all loaded by the N4 test).
2. `lowerVersion3Frames` lowers live state and every undo snapshot to the v2 runtime. Replacement offers become prompt contexts; a suspended replacement batch rides on the **top surviving frame above it**, where the v2 lifecycle resumes it. `CHARACTER_KO_REPLACEMENT` preserves every field, including `replacementEffectId` and `resolution`. Battle `TRIGGER_EFFECT` maps an unscanned Life removal to `LIFE_REMOVAL`, otherwise `DAMAGE`. Effect `TRIGGER_EFFECT` retained unpublished/unscanned events, and battle `TRIGGER_EFFECT` non-removal events, transfer to the first publishing frame above or the nearest publishing parent below. Eligible phases are `AWAITING_TARGET_SELECTION`, `AWAITING_ARRANGE_CARDS`, `AWAITING_PLAYER_CHOICE`, `INTERRUPTED_BY_TRIGGERS`, action-level `AWAITING_OPTIONAL_RESPONSE` (`pausedAction.optional === true`), and `AWAITING_BATCH_RESUME` with a batch marker. These shapes preserve event publication and scanning. Block-level optional, cost-selection, trigger-order-selection, and other phases are not carriers: their handlers discard the accumulator, stage rollbackable costs, or do not consume it. Corpus #174 uses its interrupted parent on both accept and decline. Without a publishing carrier, the event loss is classified `lowered.effect_damage_events_dropped`; remaining damage is independently degraded.
3. Degraded parts are logged as `session.legacy_shape` with `lowered.*_dropped`: deferred `pendingTriggers` (including `DAMAGE_DEALT` and `LIFE_COUNT_BECOMES_ZERO` watchers) **have not fired in 5b and never fire after rollback**; the parent chain of an effect `TRIGGER_WINDOW` loses its suffix and retained events; remaining effect damage at `TRIGGER_EFFECT` is abandoned (OPT-926); the outer of two open effect windows is lost because v2 has one slot; an orphan battle window is dropped. A transient batch without a surviving frame to carry its rider is classified `lowered.replacement_batch_dropped`. Retained damage events without any surviving publishing carrier are classified `lowered.effect_damage_events_dropped` (only a publishing parent can carry them).
4. Two open Trigger windows retain both v2 records but **deadlock after rollback (OPT-974)**. The coordinator expects the effect player, while `executeRevealTrigger` consumes the battle window first. Routing to the effect player incorrectly applies their choice to the defender's card, and leaves the effect continuation stranded in the captured nested state (the simpler golden can complete, but in the wrong window order); routing to the battle defender rejects both players' replies. The fallback prompt is rebuilt from the battle defender's own Life card, preventing the information leak. The state remains classified `legacy.two_trigger_windows`; this reader does not fix the v2 engine.
5. At effect `TRIGGER_WINDOW`, `remainingDamages` itself lowers losslessly, but the v2 reply subsequently abandons remaining points (OPT-926). A synthetic End Phase parked below such a pipeline-routed reveal can remain parked without a prompt in v2; fixture execution pins this limitation rather than claiming it drains.

Writer goldens remain byte-identical (`opt-940-writer-golden.test.ts`). `opt-963-v3-reader.test.ts` covers live/undo lowering, ownership, rejections and 5b-written nested batch/event resumes. `opt-963-fix-round.test.ts` drives every synthetic lowering fixture through this build's coordinator/lifecycle, explicitly pinning the OPT-974 and parked End Phase limitations. Fixtures include synthetic lifted goldens and `opt-963-5b-written-states.json`, captured from 5b `8823ad05` by the independent review. The lifter is a structural aid, not evidence that every possible 5b state resumes losslessly.

### 1.8 Writer policy for PR 5b (OPT-963)

PR 5b writes version 3. The runtime shape is version 3 (`RUNTIME_GAME_STATE_SCHEMA_VERSION = 3`): the engine executes the four typed continuation frames and the version 2 records (`turn.pendingTriggerFromEffect`, `turn.pendingBattleDamageContinuation`, `turn.battle.pendingTriggerLifeCard`, frame `replacementBatchContinuation`, the object `REPLACEMENT` / `REPLACEMENT_BATCH` prompt contexts) no longer exist in the runtime types or the strict schema. `convertFromV2` lifts every version 2 record into its frame, live and undo, through the one hook (§8.3); a version 3 object that still carries one of the retired records is rejected by the strict schema, and one carrying an executable replacement prompt context is rejected by name (`validateContinuationReferences`). `toPersistedGameState` puts `schemaVersion: 3` first on the live state and on every undo snapshot and writes the frames as they are; the End Phase stage rules of §1.6 are unchanged. The writer golden is `opt-963-writer-golden.synthetic.json` (re-captured with `node --import tsx scripts/capture-writer-golden.ts`); `opt-940-writer-golden.test.ts` pins that every case outside the six frame cases is the version 2 bytes plus the version key, and that the six frame cases hold frames and none of the retired records. The version 1 and version 2 goldens stay frozen as reader input. Rollback target after PR 5b deploys: the PR 5a squash merge `c972f14e2a34e701d319806974c5c3868b3eae66` (merged and deployed 2026-10-18), the oldest build that reads version 3 (by lowering, §1.7 as amended by the 5a fix round: batch rider on the top surviving frame, effect `TRIGGER_EFFECT` events re-homed, nested windows lowered leak-free, the three unwritten shapes rejected). This build rejects the same three shapes (§2.4). The PR 4a and 4b builds are no longer rollback targets once a version 3 writer has run (§5.1).

---

## 2. Frame-kind contract

### 2.1 Why `kind` and why `phase` stays

`EffectStackFrame.phase` says *what input the frame is waiting for* (`AWAITING_TARGET_SELECTION`, `INTERRUPTED_BY_TRIGGERS`, …). It does not say *what family of paused work the frame represents*. Today that family is implied by which optional fields are set (`phaseBoundaryContinuation`, `batchResumeMarker`, `triggerOrderingGroup`, `costs`/`currentCostIndex`, …). Every consumer re-derives the family from the optional fields, which is the duplicated-ownership problem the consolidation exists to remove.

`kind` names the family explicitly. `phase` is retained unchanged: a frame has both a kind (what it is) and a phase (what it waits for).

### 2.2 Kind values in version 1

The reader in PR 1 understands these kinds. The values are the v1 contract; later PRs add values by bumping the schema version and shipping a reader first.

| `kind` | Family | Derived from | Invariants the reader enforces |
|---|---|---|---|
| `EFFECT` | An effect's action chain, paused mid-chain for input or by nested triggers. | Any `phase` not listed below, with no `phaseBoundaryContinuation`. | none beyond strict validation |
| `COST` | The same frame while its activation costs are being paid. | `phase === "AWAITING_COST_SELECTION"`. | `costs.length > 0` |
| `TRIGGER_ORDER` | A prompt asking one player to order 2+ simultaneous triggers. | `phase === "AWAITING_TRIGGER_ORDER_SELECTION"`. | `triggerOrderingGroup.resolvedTriggerIds` ⊆ the group's `orderingId`s (also enforced on every other kind that carries a group, since a chosen trigger's nested prompt frame retains it) |
| `TRIGGER_DRAIN` | A frame interrupted so queued triggers can resolve before it continues. | `phase === "INTERRUPTED_BY_TRIGGERS"` with no `phaseBoundaryContinuation`. | none beyond strict validation |
| `BATCH_RESUME` | A multi-target action paused between targets so each target's triggers resolve first (rule 6-2, OPT-172). | `phase === "AWAITING_BATCH_RESUME"`. | `batchResumeMarker` present |
| `PHASE_BOUNDARY` | End Phase work parked below every frame its current stage pushed (from PR 4b; in version 1, below a scheduled effect's prompt frame). | `phaseBoundaryContinuation` present (takes precedence over `phase`). | `phase === "INTERRUPTED_BY_TRIGGERS"`; no `batchResumeMarker`, no `triggerOrderingGroup`, empty `costs` (as `parkEndPhaseBelowPrompt` builds it); `phaseBoundaryContinuation.kind === "END_PHASE"`; `turn.phase === "END"`; `endingPlayerIndex === turn.activePlayerIndex`; from PR 4a, the stage rules of §6.2 |
| `REPLACEMENT` (v3, §8) | One optional replacement offer, pending. | `replacement` present (the four version 3 fields take precedence over `phaseBoundaryContinuation` and `phase`; a frame carrying two of them is rejected). | `phase === "AWAITING_OPTIONAL_RESPONSE"`; it is the top frame and `pendingPrompt` names it (it is pushed together with its prompt and pops when answered) |
| `REPLACEMENT_BATCH` (v3, §8) | The batch replacement state machine (OPT-219), offering a match or waiting for an accepted substitute in the frames above. | `replacementBatch` present. | `phase` is `AWAITING_OPTIONAL_RESPONSE` (offer pending; `pendingMatches[currentMatchIndex]` exists) or `INTERRUPTED_BY_TRIGGERS`; `currentMatchIndex ≤ pendingMatches.length` |
| `BATTLE_DAMAGE` (v3, §8) | A battle's Damage Step paused: on the defender's Life [Trigger] choice, on the accepted Trigger's effect, or on the losing Character's K.O. replacement (OPT-872). | `battleDamage` present. | stage `TRIGGER_WINDOW` ⇔ `phase === "AWAITING_TRIGGER_REVEAL"`; the other stages ⇔ `INTERRUPTED_BY_TRIGGERS`. Battle coherence (`battleId`, sub-phase, target on field) is classified, not rejected (§2.4, OPT-884) |
| `EFFECT_DAMAGE` (v3, §8) | A `DEAL_DAMAGE` instruction paused on a Life [Trigger] choice or on the accepted Trigger's effect, with its remaining points. | `effectDamage` present. | same stage ⇔ phase rule; `parentFrameId`, when present, names the frame directly below, a `TRIGGER_DRAIN` frame whose `pausedAction.type === "DEAL_DAMAGE"` |

Invariants were chosen by reading every site that builds each frame (`effect-resolver/cost/orchestrator.ts`, `trigger-ordering.ts`, `phases.ts`, `effect-resolver/resume/batch.ts`). An invariant the engine does not guarantee for a frame it writes is not enforced, because a reader that rejects a real save is worse than one that accepts a loose one.

Derivation: `frameKindOf(frame)` in `game-state-schema.ts` computes the kind from content using exactly the table above. It is a pure projection and is the single definition.

### 2.3 Reader semantics for `kind`

* A v1 frame **without** `kind` is valid. Its kind is `frameKindOf(frame)`. The reader does not attach the derived value to the runtime frame in PR 1, so re-saving an old state writes the same bytes.
* A frame **with** `kind` is accepted only if `kind === frameKindOf(frame)`. A mismatch is rejected with a message naming the frame id, the stored kind and the derived kind. The reader therefore understands the field semantically; it does not accept an arbitrary string.
* `kind` is an optional member of the strict schema from PR 1 so that a future writer's output is already parseable by this build (reader before writer).

### 2.4 References that must resolve

A prompt or frame may point at a frame by id. From PR 1 the reader resolves every such reference and rejects the load when it dangles or lands on an incompatible kind:

| Reference | Must resolve to | Rejected when |
|---|---|---|
| `pendingPrompt.resumeContext` as a string | A frame on `effectStack` with that `id`. Every resolver site that writes a string writes the frame it just pushed (`resolver.ts`, `cost/prompts.ts`, `resume-core.ts`, `trigger-ordering.ts`, `resume/batch.ts`); the prompt lifecycle resumes the top frame. The reader requires the authoritative top frame; no known writer emits a prompt naming an older frame below a newer child. Such malformed references are rejected without changing storage, rather than repointed to a different executor. | No frame has that id (including an empty stack), or the named frame is not the top frame. |
| `pendingPrompt.resumeContext` as a string naming a `PHASE_BOUNDARY` frame | Never valid: the phase-boundary frame is always parked **below** its prompt frame. | The referenced frame's kind is `PHASE_BOUNDARY`. |
| `effectStack[*].id` | Unique within the stack. | Two frames share an id. |
| `effectStack[i].triggerOrderingGroup.resolvedTriggerIds[*]` | An `orderingId` of a trigger in `triggerOrderingGroup.triggers`. | Any id not in the group. |
| `effectStack[i].phaseBoundaryContinuation` | `turn.phase === "END"` and `endingPlayerIndex === turn.activePlayerIndex`; from PR 4a, a stage whose entries and fields agree with §6.2. | Either disagrees, or a §6.2 stage rule fails (the error names the stage and the entry index). Evidence that no engine path writes otherwise: the only writer is `parkEndPhaseBelowPrompt` (`phases.ts:259-290`), reached from `runEndPhase` right after `phase` is set to `END` (`phases.ts:162-164`) with `pi = getActivePlayerIndex(state)` taken at `phases.ts:55`; `activePlayerIndex` changes only in `completeTurnHandoff`, which runs after the parked frame is drained. Rung 3 walk plus the full-suite probe in the PR body (0 rejections of pipeline-produced states). |
| `pendingPrompt.resumeContext` naming a version 3 frame (from PR 5a, §8) | A `REVEAL_TRIGGER` prompt names a `BATTLE_DAMAGE` or `EFFECT_DAMAGE` frame at `AWAITING_TRIGGER_REVEAL`; an `OPTIONAL_EFFECT` prompt naming a `REPLACEMENT` / `REPLACEMENT_BATCH` frame finds it at `AWAITING_OPTIONAL_RESPONSE`; a `REPLACEMENT` frame is the top frame. | Any other pairing (a `REVEAL_TRIGGER` naming a non-damage frame, a damage frame owning another prompt type or at another phase, a replacement frame owning a non-offer prompt, a `REPLACEMENT` frame below another frame, or one no prompt names). |
| `effectStack[i].effectDamage.parentFrameId` (from PR 5a, §8) | `effectStack[i-1].id`, a `TRIGGER_DRAIN` frame with `pausedAction.type === "DEAL_DAMAGE"` (the chain the damage paused). | The id is not the frame directly below, or that frame is not a chain paused on `DEAL_DAMAGE`. |
| `effectStack[i]` carrying two continuation families (from PR 5a) | Exactly one of `replacement`, `replacementBatch`, `battleDamage`, `effectDamage`, `phaseBoundaryContinuation`. | Two or more present. |
| `effectStack[i].phase === "AWAITING_TRIGGER_REVEAL"` (from PR 5a fix round 1) | A `BATTLE_DAMAGE` or `EFFECT_DAMAGE` frame at `TRIGGER_WINDOW` (the only writers: `engine/damage-frames.ts`, `engine/effect-damage.ts`). | Any other kind at that phase (0 of the 4 committed engine-written states). |
| A `REPLACEMENT_BATCH` frame at `AWAITING_OPTIONAL_RESPONSE` (from PR 5a fix round 1) | Named by `pendingPrompt.resumeContext`: the offer frame and its prompt are one step (`engine/replacements.ts` `stepBatch`). | No prompt names it (0 of the 4 committed engine-written states). |
| A version 3 object beside a version 2 record (from PR 5a fix round 1) | Never: the version 3 writer lifts `turn.pendingTriggerFromEffect`, `turn.pendingBattleDamageContinuation`, `turn.battle.pendingTriggerLifeCard`, frame `replacementBatchContinuation` and object replacement prompt contexts into frames (§8.3). | Any of them present on a `schemaVersion: 3` object (the error names the field). |

Battle-record coherence is **classified, not rejected**. Review finding A on PR #746 showed (rung 4, `opt-940-synthetic-states.ts` `bothTriggerWindows`) that the engine writes `turn.pendingTriggerFromEffect` and `turn.battle.pendingTriggerLifeCard` together: damage-time auto effects resolve before the coordinator surfaces the battle Trigger, and one of them can deal effect damage that parks a second Trigger. A reader that rejects a real save is worse than one that accepts a loose one, so every check in this family is a logged `session.legacy_shape` and the state loads unchanged:

| Record | Classification | Why not rejected |
|---|---|---|
| `pendingTriggerFromEffect` and `battle.pendingTriggerLifeCard` both set | `legacy.two_trigger_windows` | The engine writes it (above). The state loads and is classified. The base coordinator cannot currently answer either window: the surfaced prompt is the defender's battle `REVEAL_TRIGGER`, but `coordinator.ts:231-236` overrides the expected responder to `pendingTriggerFromEffect.damagedPlayerIndex`, so the defender's reply is rejected "Not your turn" and the other player's "Waiting for opponent to respond to prompt" (rung 4, reviewer repro and `opt-940-synthetic-states.ts` `bothTriggerWindows` driven through `executeAction`). Loading it matches base behavior; rejecting it would turn a stuck game into an unloadable one. The deadlock itself is OPT-963's (Phase 1 damage frame). |
| `pendingBattleDamageContinuation` with `turn.battle` null, a different `battleId`, or `battleSubPhase !== "DAMAGE_STEP"` | `legacy.orphan_battle_continuation` | No rung-4 proof that no path persists it, and the engine already treats it defensively: `resumeBattleDamageContinuation` clears the continuation and continues when the battle is missing or differs (`battle.ts:1093-1101`). OPT-884 owns the recovery policy. |
| `battle.pendingTriggerLifeCard` with `battleSubPhase !== "DAMAGE_STEP"` | `legacy.trigger_window_outside_damage_step` | No rung-4 proof that no path persists it; `executeRevealTrigger` consumes the window regardless of sub-phase. |

The error names the reference (`pendingPrompt.resumeContext`, `effectStack[2].triggerOrderingGroup.resolvedTriggerIds[0]`, …) so an operator can locate it in the stored JSON.

---

## 3. Support window

**Supported input versions in this build: `{1, 2, 3, 4}`.** Version 1 is the shape at `origin/main` `03071b6914c36349d0e81930a6f80bb530c713d9`, the base of PR 1. Version 2 adds the End Phase stage (§6) and is read from PR 4a (OPT-980). Version 3 adds the typed replacement and damage continuation frames (§8) and is read from PR 5a (OPT-963). Version 4 adds the PR6 ownership records and battle bookkeeping (§9), read from PR6a by lowering to the v3 runtime and executed natively from PR6b.

Policy, not a date:

1. A reader for version N+1 keeps reading version N. Retiring a reader for version N requires (a) a recorded disposition for every v-N live and undo shape (lossless conversion, recovery path, or rejection, all with fixtures), (b) the project owner's decision recorded in this file's §3 history, and (c) at least one deployed release in which no writer emits version N. There is no automatic retention deadline; "no in-flight games can still hold it" is demonstrated, not assumed.
2. Within a supported version, every legacy shape listed in §4 keeps its disposition until the owning ticket changes it.
3. `UNDO_HISTORY_LIMIT` is 1 (`history.ts`), so a session holds at most one undo snapshot. That snapshot can be one version older than the live state after a reader-capable deploy. The reader must therefore support at least the two most recent versions at every deploy that enables a new writer.

History:

| Date | Change | Supported set |
|---|---|---|
| 2026-10-12 (PR 1) | Version 1 defined; assigned to all legacy saves. | `{1}` |
| 2026-10-12 (PR 4a, OPT-980) | Version 2 reader and v1 → v2 converter; writer still writes 1 (§1.5). | `{1, 2}` |
| 2026-10-12 (PR 4b, OPT-924) | Writer emits version 2 (§1.6). | `{1, 2}` |
| 2026-10-16 (PR 5a, OPT-963) | Version 3 reader (§8) lowering to the version 2 runtime (§1.7); writer still writes 2. | `{1, 2, 3}` |
| 2026-10-17 (PR 5a fix round 1, OPT-963) | Lowering: batch rider on the top surviving frame, effect `TRIGGER_EFFECT` events re-homed, nested windows lowered leak-free (§1.7 items 2–4); three unwritten shapes rejected by name (§1.7 item 1, §2.4); proof against 5b-written states. | `{1, 2, 3}` |
| 2026-10-17 (PR 5b, OPT-963) | Runtime and writer at version 3; `convertFromV2` lifts the version 2 records into frames (§1.8, §8.3). | `{1, 2, 3}` |
| 2026-10-18 (PR 5b fix rounds 1–2, OPT-963) | Lift rebuilds a re-pointed window prompt from that window's own card (L5); the actions after a choice branch live on their own continuation under the effect's controller, below a handler-owned frame (F1, D-F1b), and a continuation frame carrying `remainingActions` is rejected; the effect window logs its point before prompting (F2; writer golden re-captured for `both-trigger-windows` only). Rollback target: PR 5a squash `c972f14e`. | `{1, 2, 3}` |
| 2026-10-20 (PR 6a, OPT-964) | Version 4 reader lowers the new owners into the v3 runtime (§9); runtime and writer remain 3. No input version retired. | `{1, 2, 3, 4}` |
| 2026-10-20 (PR 6b, OPT-964) | Native version 4 runtime and writer after verified PR760 deployment; historical states lift to new owners (§10). | `{1, 2, 3, 4}` |

---

## 4. Legacy shape dispositions (OPT-940 list and rev4 §10)

"Live and undo" below means the same rule applies to `session.state` and to each `session:undo-history[i]`, through the same conversion call.

| Shape | How the reader recognizes it | Disposition in PR 1 | Owner of the next change | Fixture |
|---|---|---|---|---|
| **Stage-less `PhaseBoundaryContinuation`** (End Phase parked below a prompt; may hold a currently suspended scheduled action plus a nonempty `remainingScheduledActions`). | A version 1 frame with `phaseBoundaryContinuation.kind === "END_PHASE"` and no `stage` field; after conversion, `stage === "LEGACY_SCHEDULED_ACTIONS"`. | **Lossless conversion, legacy semantics preserved.** v1 has no stage. Its meaning is fixed: *end-of-turn expiry has already run, the normal end-turn effect waves never ran, the scheduled-action list is partially drained, hand-off has not happened.* From PR 4a the v1 → v2 converter gives the frame `stage: "LEGACY_SCHEDULED_ACTIONS"` and changes nothing else (live and every undo snapshot, same hook). The reader validates `endingPlayerIndex === turn.activePlayerIndex`, `turn.phase === "END"`, and the §6.2 legacy rules; `resumePhaseBoundary` continues the remaining scheduled actions and hands off exactly as the base build does (rung 4, PR 4a body), with one scoped difference from PR 4b on: when a Leader carries OP15-022's `DELAYED_LOSS` and the deck-zero flag is set, the end-of-turn checkpoint now runs before the hand-off (OP15-022 text), so the game can end where the base build handed off (`opt-940-legacy-shapes.test.ts`, "pending OP15-022 Brook delayed loss"). Without a `DELAYED_LOSS` Leader the legacy resume is identical to base. Nothing is replayed, no wave is started, no expiry is invented. Classified `legacy.stage_less_phase_boundary`. | OPT-924 (PR 4b) keeps the legacy stage's resume path as the version 1 resume path (identical to base without a `DELAYED_LOSS` Leader). | `opt-940-legacy-shapes.test.ts`, `opt-980-end-phase-stage-reader.test.ts` (synthetic) |
| **Structural `ResumeContext`** (object with `effectSourceInstanceId`, `remainingActions`, `resultRefs`, `validTargets` on `pendingPrompt.resumeContext`, with an empty effect stack). | `isResumeContext` shape; `hasValidPrompt` already checks its fields. | **Lifted since OPT-965.** The reader validates actions/refs, rejects unknown structural fields, and converts supported action-choice contexts to ordinary frames; the session fallback executor is retired (§11). | OPT-943 delivered the converter; historical input remains supported. | `opt-940-legacy-shapes.test.ts` |
| **Legacy cost-transaction frame** (`isLegacyCostTransactionFrame`: `costTransactionState` absent while `currentCostIndex > 0`, or `accumulatedEvents` nonempty, or any `costResultRefs` count > 0). | Same predicate as `resume/cost.ts`. | **Supported as-is.** Earlier costs were committed to the root before OPT-614 and cannot be reconstructed; abandon publishes retained events instead of rolling back. The reader classifies it `legacy.cost_transaction_frame` and loads it unchanged. | OPT-943 (PR 7). | `opt-940-legacy-shapes.test.ts` |
| **Orphan or incompatible frame references** (string `resumeContext` naming no frame on the stack or a `PHASE_BOUNDARY` frame; duplicate frame ids; `resolvedTriggerIds` outside the group; explicit `kind` that disagrees with content; a parked End Phase whose `endingPlayerIndex` or `turn.phase` disagrees with the turn). A string must name the top non-boundary frame (§2.4). | §2.4 table. | **Rejected.** The base build accepted any string; this build rejects with the reference name. The game is not loadable and the operator follows the runbook (§5). | None; this is the permanent policy. | `opt-940-reference-integrity.test.ts` |
| **Stuck `DAMAGE_STEP` (OPT-884)**: `turn.battleSubPhase === "DAMAGE_STEP"` with a `pendingBattleDamageContinuation` of stage `CHARACTER_KO_REPLACEMENT` whose `resolution` is undefined, no `pendingPrompt`, an empty effect stack, and the continuation's `targetInstanceId` no longer on the field. | The predicate just stated. | **Loaded as-is and classified `legacy.stuck_damage_step`.** A stuck state now also includes an empty stack with no continuation, or a lone unanswered K.O. frame whose target remains on field. Converting it into a load error would turn a paused game into an unreachable one. The orphan-continuation variants (`battle` null, `battleId` mismatch, wrong sub-phase) load too, classified `legacy.orphan_battle_continuation` (§2.4). | OPT-884 declines automatic on-load battle repair: affected live-session count unavailable, no captures; runtime recovery aborts safely (§11). | `opt-940-legacy-shapes.test.ts` |
| **Pending damage and replacement records** (`turn.pendingTriggerFromEffect`, `turn.battle.pendingTriggerLifeCard`, `turn.pendingBattleDamageContinuation`, `REPLACEMENT` and `REPLACEMENT_BATCH` resume contexts, frame `replacementBatchContinuation`). | Version 1 / 2 records. | **Lifted** into the version 3 frames by `convertFromV2` (OPT-963 PR 5b, §8.3), live and undo; both Trigger windows open at once lifts to two nested frames (recovered, OPT-974). `legacy.stuck_damage_step` and `legacy.orphan_battle_continuation` read the lifted frame. | OPT-884 (PR 7) owns the stuck-step recovery policy. | `opt-963-v3-reader.test.ts`, `opt-940-legacy-shapes.test.ts` |
| **Event-activation debt** (`pendingEventActivationEvents`, frame `eventActivationCompletion`). | Existing strict schema. | **Supported as-is.** | OPT-937/OPT-942/OPT-950 (PR 6, OPT-964). | `opt-940-legacy-shapes.test.ts` |


### 4.1 Paused-work inventory at base `03071b69` (OPT-939 acceptance 1)

Each record of paused work, who owns it, who else reads or writes it, and the executor that drains it. Line numbers are at the base commit; locate by name.

| Record | Authoritative owner | Duplicate or mirrored owners | Drain / executor entry point | Reader call sites | Writer call sites |
|---|---|---|---|---|---|
| Effect action chain (`pausedAction`, `remainingActions`, `resultRefs`, `validTargets`) | `EffectStackFrame` (`types.ts:248`) | legacy structural `ResumeContext` on `pendingPrompt.resumeContext` (`types.ts:145`) duplicates the same fields | `resumeFromStack` (`resume-core.ts:367`) for frames; `resumeEffectChain` (`resume-core.ts:83`) for the legacy context; dispatched by `resumePromptLifecycle` (`prompt-lifecycle.ts:64`) | `prompt-lifecycle.ts` (frame branch and legacy branch), `visibility.ts`, `history.ts` anchors | `resolver.ts:451,719,1217,1325`, `resume-core.ts:423,545,588`, `resume/choice.ts:922` |
| Cost payment (`costs`, `currentCostIndex`, `costsPaid`, `costResultRefs`, `costTransactionState`, `costReplacementAction`) | the same frame (`COST` kind) | legacy frames before OPT-614 keep paid costs on the root (`isLegacyCostTransactionFrame`, `resume/cost.ts:111`) | `resume/cost.ts` handlers via `resumeFromStack`; `abortReplacedCost` (`resume/cost.ts:128`) | `prompt-lifecycle.ts` REPLACEMENT branch (`costFrame.costReplacementAction`) | `cost/orchestrator.ts:158-658` (ten push sites), `cost/prompts.ts:54` |
| Queued triggers waiting on a frame (`pendingTriggers`, `simultaneousTriggers`, `triggerOrderingGroup`) | the same frame (`TRIGGER_DRAIN` / `TRIGGER_ORDER`) | a chosen trigger's nested prompt frame retains `triggerOrderingGroup` (`resume/choice.ts:807`) | pipeline side: `processPlayerTriggerGroup` (`pipeline.ts:597`) → `processTriggerQueuePipeline` (`pipeline.ts:314`); resume side: `processRemainingTriggers` (`resume/triggers.ts:25`) → `buildTriggerSelectionPrompt` (`trigger-ordering.ts:106`); rescans by `scanEventsForTriggers` (`trigger-ordering.ts:33`) from both | `history.ts` anchors, `visibility.ts` | `pipeline.ts:338,560`, `trigger-ordering.ts:160`, `resume/choice.ts` |
| Batch pause between targets (`batchResumeMarker`, `ruleTrashForPlay.batch`, `stateDistributionForPlay`) | the same frame (`BATCH_RESUME`) | `ResumeContext.batchResumeMarker` mirror (`types.ts:230`) | `reenterBatchResume` (`resume/batch.ts:42`), called at the end of `processRemainingTriggers` | `prompt-lifecycle.ts` via `resumeFromStack` | `resume/batch.ts:161`, `actions/play.ts` |
| Phase boundary (`phaseBoundaryContinuation`: End Phase scheduled actions) | a `PHASE_BOUNDARY` frame parked below the prompt frame | `state.scheduledActions` holds the not-yet-collected entries; `remainingScheduledActions` holds the collected remainder | `resumePhaseBoundary` (`phases.ts:203`) → `continueEndPhase` (`phases.ts:217`, the scheduled-action loop) from `resumeInterruptedEffectContinuations` (`prompt-lifecycle.ts:560`); entry at `runEndPhase` (`phases.ts:176`) | `prompt-lifecycle.ts:560-575` | `parkEndPhaseBelowPrompt` (`phases.ts:259`) |
| Battle Life damage: Trigger window and remaining points (`turn.battle.pendingTriggerLifeCard`, `turn.battle.damagesRemaining`) | `turn.battle` | the surfaced `REVEAL_TRIGGER` prompt (`pendingPrompt`, `resumeContext: null`) is derived, not stored work | `executeRevealTrigger` (`battle.ts:414`) → `continueLeaderDamageSequence` (`battle.ts:980`), entered through `runPipeline` with `REVEAL_TRIGGER`; surfaced by `surfaceRevealTrigger` (`coordinator.ts:311`, called at `coordinator.ts:275` and `GameSession.ts:822`) | `coordinator.ts:275-340`, `visibility.ts`, `validation.ts:335` | `battle.ts:948` (park), `:517,591` (consume) |
| Battle damage continuation (`turn.pendingBattleDamageContinuation`: `LIFE_REMOVAL` / `DAMAGE` / `CHARACTER_KO_REPLACEMENT`) | `turn` | the K.O. replacement prompt's `REPLACEMENT` context names the same effect and target (`prompt-lifecycle.ts:139-150`) | `resumeBattleDamageContinuation` (`battle.ts:1081`) from the `while` loop in `prompt-lifecycle.ts:380-395` and the REPLACEMENT branch (`:188-200`) | `prompt-lifecycle.ts`, `engine-limits.ts:34,66`, `state.ts:612` | `battle.ts:525,1128,1357` |
| Effect Life damage: Trigger window and remaining points (`turn.pendingTriggerFromEffect`) | `turn` | `battle.ts:423` prefers the battle window when both exist; the effect chain that dealt the damage continues on the stack (OP06-116 gap) | `executeRevealEffectDamageTrigger` (`battle.ts:621`) → `continueEffectDamageSequence` (`battle.ts:779`), entered through `runPipeline` with `REVEAL_TRIGGER`; surfaced by `surfaceRevealTrigger` | `coordinator.ts:231-236,327`, `validation.ts:335`, `state.ts:605` | `battle.ts:634,779-800`, `actions/battle-actions.ts:108-125` |
| Replacement prompt (`REPLACEMENT` / `REPLACEMENT_BATCH` resume contexts; frame `replacementBatchContinuation`) | `pendingPrompt.resumeContext` (executable context, not a frame) | `replacementBatchContinuation` on the top frame re-attaches the batch after a nested substitute prompt (`prompt-lifecycle.ts:262,502`) | `resumeReplacement` (`replacements.ts:935`), `resumeReplacementBatch` (`:1168`), `continueReplacementBatchAfterSubstitute` (`:1218`) from `prompt-lifecycle.ts:133-257` | `prompt-lifecycle.ts`, `battle.ts:1340-1366` | `replacements.ts:893`, `battle.ts:1357`, `resume-core.ts:588` |
| Event-activation debt (`pendingEventActivationEvents` root; frame `eventActivationCompletion`) | `GameState.pendingEventActivationEvents` for the outer Event; the frame field for a nested Event Main | the same events also sit in `execResult.events` / frame `accumulatedEvents` with `propagation` flags | `prompt-lifecycle.ts:355-368` (scan after the stack empties); `pipeline.ts:125-136` (record at activation); `updateEffectContinuation` (`event-activation.ts`) | `pipeline.ts:525,560` (cleared on terminal), `prompt-lifecycle.ts:359` | `pipeline.ts:131`, `event-activation.ts` |
| Pregame work (`state.pregame`: priority rolls, first-player choice, start-of-game effects, mulligans, Life placement; `PREGAME_PRIORITY_CHOICE` / `PREGAME_MULLIGAN` contexts) | `GameState.pregame` | `pendingPrompt.resumeContext` of the two pregame kinds names no frame | `resumePregameFromPrompt` (`pregame.ts:181`) → `advancePregame` (`pregame.ts:106`) via `services.drainPregame` (`GameSession.ts:217`, `prompt-lifecycle.ts:118-124`); `START_OF_GAME_FX` drains after the stack empties (`prompt-lifecycle.ts:371-377`) | `GameSession.ts:201,217`, `prompt-lifecycle.ts:118,371` | `pregame.ts:51-180` |
| Scheduled obligations (`state.scheduledActions`, `END_OF_THIS_TURN` / `END_OF_THIS_BATTLE` / next-Main timings) | `GameState.scheduledActions` | `remainingScheduledActions` inside a parked phase frame (above) | `processScheduledActions` (`duration-tracker.ts:≈196`) from `runEndPhase` (`phases.ts:189`), `endBattle`, and the Main Phase entry | `duration-tracker.ts`, `history.ts` anchors | `actions/effects.ts:133` |
| Once-per-turn use, Trigger staging ids, deck-hit-zero flag, performed actions (`turn.oncePerTurnUsed`, `turn.triggerStagingInstanceIds`, `turn.deckHitZeroThisTurn`, `turn.actionsPerformedThisTurn`) | `turn` | none (counters, not instructions) | consumed in place by `triggers.ts`, `battle.ts`, `pipeline.ts` `finishPipeline`, reset by `completeTurnHandoff` (`phases.ts:309`) | many | many |

Duplicate drain owners the consolidation must merge (rev4 §7 Phase 2): `processTriggerQueuePipeline` versus `processRemainingTriggers` (two trigger executors with different nesting policy, the cause of the F1/F2 ratchets); `resumeInterruptedEffectContinuations` versus the pipeline's own continuation; `surfaceRevealTrigger` in the coordinator versus the two damage sequencers in `battle.ts`.

A classification is logged as `session.legacy_shape` with `{ gameId, location, shape, frameId? }` and never changes state.

---

## 5. Rollback, repair, rejection runbook

### 5.1 Rollback target

* **Before any writer emits a shape the base build cannot parse**, the base build (`03071b69`) remains a valid rollback target because this PR writes identical bytes.
* **After PR 1 deploys and is verified**, the PR 1 build is the **reader-capable rollback baseline**. Every later PR that enables a writer for version N must have the version-N reader already deployed and verified live, and must name the oldest build that can read N in its PR body. Rolling back past that build is not a rollback; it is data loss for every in-flight game written at N.
* The strict base build is **never** a rollback target once a version-2 writer has run in production; the PR 4a / 4b builds are never rollback targets once a version-3 writer has run (PR 5b). The PR 5a squash merge `c972f14e2a34e701d319806974c5c3868b3eae66` (deployed 2026-10-18) is the oldest build that reads version 3 (by lowering to version 2 semantics, §1.7: a degraded but loadable resume for games paused inside a Trigger window or a replacement offer at the moment of rollback, every other state lossless).

Deploy verification: merging to `main` auto-deploys the game worker (`.github/workflows/deploy-workers.yml`). Confirm with `gh api repos/<owner>/<repo>/commits/<sha>/status` before merging the next writer PR.

### 5.2 When a session fails to load

A failed load surfaces as `SessionLoadError` from `SessionRepository.load()`. The Durable Object request that triggered the load fails (WebSocket upgrade, `/status`, `/cards`, `/notify-end`), and the three storage values are untouched. The message has the form `Stored session <location> <reason>`; `location` is `state` or `undoHistory[i]`; `reason` names the field or reference.

1. **Capture first.** Dump the three keys (`session`, `session:card-db`, `session:undo-history`) before any repair. There is no sanitizing export route yet (see the unmet gate in the PR 1 body); use a wrangler-based dump until one exists.
2. **Classify the failure** from `reason`:
   * `unsupported game-state schema version N` → a newer build wrote the session. Roll **forward** to a build that reads N. Do not edit the data.
   * `invalid core shape at …`, `unknown … variant` → the bytes are not a shape any supported build wrote. Treat as corruption. Recovery is manual (§5.3).
   * A §2.4 reference error → either corruption or a writer bug. File it with the dump attached; recovery is manual.
3. **Undo-only failures** (`location` starts with `undoHistory`): the live state may be perfectly loadable. The sanctioned repair is to delete the `session:undo-history` value (the player loses one undo step, nothing else). This is an operator action with the dump attached to the ticket, never an automatic reset.

### 5.3 What is never done

* No silent state reset. A game is never replaced with a fresh state or marked `ABANDONED` by the loader.
* No guessing at lost work. A stage-less End Phase frame is not restarted; a missing reference is not re-pointed at "the most likely frame".
* No automatic production repair. Every repair is a human action on a captured dump, recorded on the ticket.
* No deploy of a writer whose reader is not already live.

---

## 6. End Phase stage (OPT-962: PR 4a OPT-980 reader, PR 4b OPT-924 writer)

OPT-924 adds `stage` to `PhaseBoundaryContinuation` and bumps the schema version to 2. The plan below was written before the stage existed (PR 1); §6.1 to §6.4 record the final contract, shipped by PR 4a (reader) before PR 4b (writer).

* **v1 → v2 converter:** a stage-less frame becomes `stage: "LEGACY_SCHEDULED_ACTIONS"`. Semantics: expiry done, waves skipped, resume = drain `remainingScheduledActions` then hand off. The converter does not add a wave, does not re-run expiry, does not reorder or tag actions.
* **Reader for v2 ships in a PR that does not write v2.** That PR is verified live. Only then does the writer PR flip `GAME_STATE_SCHEMA_VERSION` to 2 and start emitting `schemaVersion: 2` and `stage`.
* **Mixed undo:** a v2 live state with a v1 undo snapshot (and the reverse during rollback within the supported set) loads; `opt-980-end-phase-stage-reader.test.ts` covers `[1, 2]` and `[2, 1]`, and `opt-940-reader.test.ts` keeps `[absent, 1]`.
* **The v1 reader keeps its current meaning for a stage-less frame forever** (§1.1). A later build that drops v1 support follows §3.

### 6.1 Persisted fields (version 2)

| Field | Values | Written by PR 4b when |
|---|---|---|
| `phaseBoundaryContinuation.stage` | `END_OF_YOUR_TURN_WAVE`, `END_OF_OPPONENT_TURN_WAVE`, `TURN_PLAYER_END_OF_TURN`, `NON_TURN_PLAYER_END_OF_TURN`, `LEGACY_SCHEDULED_ACTIONS` | Always, on every End Phase frame. The four rule stages are where a prompt can park the End Phase: rule 6-6-1-1 (the ending player's [End of Your Turn] wave), 6-6-1-1-2 (the non-turn player's [End of Your Opponent's Turn] wave), 6-6-1-2 step 1 and step 2. `LEGACY_SCHEDULED_ACTIONS` is the converter's stage, and the stage a converted frame keeps if its legacy resume re-parks. 6-6-1-3 and 6-6-1-4 never park, so they have no stage. |
| `phaseBoundaryContinuation.activatedWaveEffects` | string array of `sourceCardInstanceId:effectBlockId` | On every frame with a rule stage (possibly empty); never on a legacy frame. The [End of Your Turn] / [End of Your Opponent's Turn] effects already activated in this End Phase (6-6-1-1-1: each activates once), so a resumed wave collects only newly fulfilled effects. |
| `remainingScheduledActions[i].step` | `TURN_PLAYER` (6-6-1-2 step 1), `NON_TURN_PLAYER` (step 2) | On every entry of a frame with a rule stage; never on a legacy entry. The rules have no "scheduled action": a `SCHEDULE_ACTION` with timing `END_OF_THIS_TURN` is "at the end of this turn" processing of its controller, so its step is the controller's seat relative to the ending player. PR 4b collects each step's entries when the step starts. |

Every other part of a version 2 state is the version 1 shape. The frames above a parked End Phase frame are existing kinds; a wave trigger's `triggeringEvent` is `{ type: "TURN_ENDED", playerIndex, payload: {} }`, a version 1 event. The fixtures are `opt-962-v2-states.json`, produced from the PR 4b prototype's real engine (`producedAtCommit` in the file).

### 6.2 Stage rules the reader enforces

Applied after strict validation, with the frame's index and id in the error (`game-state-schema.ts` `endPhaseStageViolation`):

* `LEGACY_SCHEDULED_ACTIONS`: no `activatedWaveEffects`; no entry has `step`.
* Every rule stage: `activatedWaveEffects` present; every entry has `step`.
* `END_OF_YOUR_TURN_WAVE`, `END_OF_OPPONENT_TURN_WAVE`: `remainingScheduledActions` is empty (obligations are collected only after both waves).
* `TURN_PLAYER_END_OF_TURN`: every entry is step `TURN_PLAYER` and its controller is `endingPlayerIndex`.
* `NON_TURN_PLAYER_END_OF_TURN`: every entry is step `NON_TURN_PLAYER` and its controller is the other player.
* All stages: `turn.phase === "END"` and `endingPlayerIndex === turn.activePlayerIndex` (§2.4).
* An unknown stage or step is rejected by the strict schema. A version 1 object (no `schemaVersion` or `1`) that carries `stage`, `activatedWaveEffects` or an entry `step` is rejected by the converter: no version 1 writer wrote it.

### 6.3 Writers

* PR 4a writes version 1 (§1.5).
* PR 4b writes `schemaVersion: 2` on every live state and undo snapshot, with the §6.1 fields (§1.6). Rollback target after PR 4b deploys: the PR 4a merge commit `9da8ba17c29fb73c767c6a4918952f6a4a84c082`, the oldest build that reads version 2. The base build `6e6347de` and the PR 2 build are no longer rollback targets (§5.1).

### 6.4 Rolling back from PR 4b to PR 4a

A PR 4b save loads on PR 4a (`9da8ba17`): every stage, live and as an undo snapshot, plus the Refresh Phase prompt and terminal End Phase states (rung 4, PR 4b body, run against a `git archive` of `9da8ba17`). The PR 4a engine is the version 1 engine, so a game parked at a rule stage resumes with version 1 semantics. The PR 4b body records one run per stage of the full five-stage scenario on the `9da8ba17` engine (rung 4). What that run showed:

* Every resumed game reaches the hand-off with no prompt left and an empty stack.
* [End of Your Opponent's Turn] effects fire again after the hand-off from `TURN_ENDED`, including one that already resolved in wave 2 of the same End Phase.
* Obligations the PR 4b End Phase had not collected yet stay in `scheduledActions`; obligations already collected into the parked frame run before the hand-off.
* That turn's expiry does not run before the hand-off: a "during this turn" effect was still present afterwards. Unproven: that it expires at the next End Phase (the version 1 `shouldExpire` compares turn slots with `>=`).

This is a degraded but loadable resume, limited to games paused inside an End Phase at the moment of rollback.

## 7. Unmet rollout gate: captured sessions

OPT-940 requires sanitized real Durable Object sessions as fixtures. None are available: wrangler is logged out on the coordinator's machine, no Cloudflare token exists, and `GameSession` exposes no export route. Every fixture in PR 1 is **synthetic**: real game states produced by the engine and serialized through the base-commit writer, plus constructed malformed states. None is a capture. The gate stays open until a capture covers live + undo, paused costs, paused replacements, paused damage, and a mid-End-Phase session. The PR body and the handoff entry carry the same statement.

## 8. Typed replacement and damage continuations (OPT-963: PR 5a reader, PR 5b writer)

Version 3 gives the replacement and damage continuations one owner each: a frame on `effectStack` of one of four new kinds (§2.2). The design note in the PR 5a body records the rationale; this section is the shape contract.

### 8.1 Persisted fields (version 3)

| Frame field | Kind | Fields | Replaces (version 2) |
|---|---|---|---|
| `replacement` | `REPLACEMENT` | `effectId`, `targetInstanceId`, `event` | the object `REPLACEMENT` prompt context |
| `replacementBatch` | `REPLACEMENT_BATCH` | `actionKind`, `event`, `allTargetIds`, `protectedIds`, `pendingMatches[]`, `currentMatchIndex`, `causingController`, `causingSource?`, `returnToDeckPosition?` | the object `REPLACEMENT_BATCH` prompt context and the frame rider `replacementBatchContinuation` |
| `battleDamage` | `BATTLE_DAMAGE` | `stage` `TRIGGER_WINDOW { battleId, damagedPlayerIndex, lifeCard }`, `TRIGGER_EFFECT { battleId, damagedPlayerIndex, lifeCardInstanceId }`, `CHARACTER_KO_REPLACEMENT { battleId, targetInstanceId, replacementEffectId?, causingPlayerIndex, attackerIsCharacter, resolution? }` | `turn.battle.pendingTriggerLifeCard`; `turn.pendingBattleDamageContinuation` (`LIFE_REMOVAL` → `TRIGGER_EFFECT` with the Life removal retained unscanned on `accumulatedEvents`, `DAMAGE` → `TRIGGER_EFFECT` with it scanned, `CHARACTER_KO_REPLACEMENT` field for field) |
| `effectDamage` | `EFFECT_DAMAGE` | `damagedPlayerIndex`, `remainingDamages`, `dealt`, `sourceCardInstanceId`, `controllerIndex`, `parentFrameId?`, and `stage` `TRIGGER_WINDOW { lifeCard }` or `TRIGGER_EFFECT { lifeCardInstanceId }` | `turn.pendingTriggerFromEffect` (which had no `dealt`, no parent and no `TRIGGER_EFFECT` stage: version 2 abandoned the remaining points, OPT-926) |

`EffectStackPhase` gains `AWAITING_TRIGGER_REVEAL` (a damage frame waiting for the `REVEAL_TRIGGER` answer). `turn.battle.damagesRemaining` stays on the battle (the count locked at Damage Step entry, rule 7-1-4-1-1-3). The `REVEAL_TRIGGER` and replacement `OPTIONAL_EFFECT` prompts carry only player-facing options and `resumeContext` = the owning frame's id (§2.4).

### 8.2 Stack positions the engine (PR 5b) guarantees

* A `REPLACEMENT` frame is the top frame while its offer is pending and pops when answered; the caller it reports to is the frame directly below (a `BATTLE_DAMAGE` frame at `CHARACTER_KO_REPLACEMENT`, a `COST` frame with `costReplacementAction`, or the chain's `TRIGGER_DRAIN` continuation).
* A `REPLACEMENT_BATCH` frame at `AWAITING_OPTIONAL_RESPONSE` is the top frame; at `INTERRUPTED_BY_TRIGGERS` an accepted substitute resolves in the frames above it.
* A damage frame at `TRIGGER_WINDOW` may sit below the attacker's "when this attack deals damage" effect frames (those resolve before the Trigger choice, FAQ qa_op03.md:92-96) and gets its prompt once they unwind; at `TRIGGER_EFFECT` the accepted Trigger's frames sit above it. An `EFFECT_DAMAGE` frame sits directly above its parent chain frame.
* Two Trigger windows are nested frames, never two records (the base coordinator deadlock, OPT-974).

### 8.3 Converters

* **PR 5a** (this build): version 3 is validated as written and lowered to version 2 (§1.7). `liftToVersion3` in `fixtures/opt-963-v3-states.ts` states the lift the 5b converter performs, so the 5a fixtures are the shape 5b writes.
* **PR 5b** (this build): `convertFromV2` lifts, live and undo: `pendingTriggerLifeCard` and `pendingBattleDamageContinuation` become one `BATTLE_DAMAGE` frame and `pendingTriggerFromEffect` an `EFFECT_DAMAGE` frame, inserted at the bottom of the stack in the order they opened (version 2 surfaced them only once the stack emptied); a replacement prompt context becomes a frame on top owning the prompt; a frame's `replacementBatchContinuation` becomes a `REPLACEMENT_BATCH` frame at `INTERRUPTED_BY_TRIGGERS` directly below it. With both windows open the prompt is re-pointed at the top (effect) frame's responder and rebuilt from that window's own Life card (`revealTriggerPromptOptions`, the engine's own prompt builder, with its generic reveal text: the converter is deterministic and has no card data): a player is never shown another player's Life card, and a version 2 prompt written without its card keeps its text and gets the card (PR #758 L5). `both-trigger-windows` is **recovered**, not rejected. `legacy.stuck_damage_step` and `legacy.orphan_battle_continuation` read the lifted frame (OPT-884's evidence kept); `legacy.two_trigger_windows` is retired by the lift.

## 9. PR 6a: version 4 reader, version 3 runtime and writer (OPT-964)

PR 6 requires a reader/writer split under §5.1. **The PR6a build reads 1–4 and continues to execute and write version 3.** It introduces no engine scheduling, source eligibility, battle-window, overflow, or pregame behavior change. PR 6b may enable the v4 writer only after the reviewed 6a reader has merged and its worker deployment is verified. At the time of PR6a preparation there was no deployed v4 rollback target; §10 records the verified target used by PR6b. The version 3 writer golden remains byte-identical.

### 9.1 Version 4 contract

The persisted-only schema and lowerer are in `session/version4-reader.ts`. Every frame has an explicit `kind`. Existing v3 frame content and phases keep their meanings. The reader validates the complete v4 shape **before** removing any named field, then passes the lowered object through the existing action/event validation and continuation-reference checks. Embedded overflow/state-distribution queues and staged cost-transaction actions, effects and overrides are checked with the same existing executable-payload validators as their root counterparts; this additional check applies only to v4 input. All live and undo entries use the same conversion hook. No load writes storage.

| Owner | Version 4 fields and invariants | Lowering to version 3 |
|---|---|---|
| Queued trigger | Optional `sourceSnapshot: { instanceId, cardId, controller, effectBlockId }`; instance/controller/effect reference agree with the enclosing trigger. Identity only: power, cost, modifiers and DON!! are rejected. The optional case is for queues inherited from older saves whose departed source cannot be reconstructed. Applies to `pendingTriggers`, `simultaneousTriggers`, ordering groups, overflow batches and state-distribution queues. | Remove snapshot; retain every existing queued field. Log `lowered.v4_source_snapshot`. This runtime cannot enforce PR6b's activation-time zone check or use the snapshot for cause attribution after a source disappears. It retains v3 behavior; this is explicitly **degraded**. Already-activated resolution is not restarted. |
| `EVENT_ACTIVATION` frame | `eventActivation: { publication: "AFTER_STACK" | "AFTER_EFFECT", sourceZone: "HAND" | "TRASH", sourceClass: "EVENT", events }`. Exactly one activation notification, with zone/type, source instance and controller agreement. `EVENT_TRIGGER_RESOLVED` cannot stand in for an Event activation. | `AFTER_STACK` must be the bottom hand-activation boundary. Remove that boundary and put its entire ordered event array, including prefixes and propagation flags, in `pendingEventActivationEvents`. `AFTER_EFFECT` requires one event and becomes the existing `eventActivationCompletion` rider at the same stack position. |
| `PLAY_OVERFLOW` frame | `playOverflow` has the existing `ruleTrashForPlay` fields: `playTargetId`, optional `batch { remainingTargetIds, remaining {ACTIVE, RESTED}, playedSoFar, forcedFirstState?, queuedTriggers? }`. Requires `pausedAction.type === "PLAY_CARD"`, the instruction replayed after rule-trash; null and other known actions are rejected. Owns an `AWAITING_TARGET_SELECTION` / `SELECT_TARGET` prompt for its controller. | Rename to `ruleTrashForPlay`, use kind `EFFECT`, preserve the full action continuation and neighboring frames. |
| `PREGAME` frame | `pregameContinuation: { phase: "START_OF_GAME_FX", effectFrameId, controller }`. Bottom boundary; the immediate nested child belongs to that controller's Leader, the pregame phase matches, that player's start-effect ledger is marked, and the pending prompt names a nested child. | Remove boundary; existing nested effect frames and the pregame machine/ledger continue unchanged. The old machine advances after the child stack drains. |
| `turn.battle` | Required `step` (the existing five battle-sub-phase values), `redirectWindow`, `blockerLocked`, `targetLocked`. `step` agrees with the retained `battleSubPhase`; an activated Blocker requires its lock. The redirect boolean does not imply Block Step: Counter redirects exist. The same schema applies to staged cost-transaction turn state. | Remove four named fields and retain the old battle state and `battleSubPhase`. Log `lowered.v4_battle_locks`. Extra redirect/target-lock semantics are **degraded** to the old engine's checks. No step-end checkpoint is added. |
| Scheduled obligations | Strict `id`, `timing`, `action`, `boundToInstanceId`, `sourceEffectId`, `controller`; existing four timing values. Action DSL `target_ref` remains inside the validated action. | Preserve unchanged. The existing runtime no-ops an obligation whose bound instance has left. |

`AFTER_STACK` retains all publication debt, not merely the activation notification: the current Main/Counter pipeline may retain already-logged but unscanned prefixes. It must not become an accumulator on a child whose early resume would scan it before Event completion. The two activation lifecycles remain distinct. Two frames cannot own the same activation notification, and v4 cannot also carry the retired root debt or either old rider.

Event and pregame boundaries contain only the sentinel effect block (`__engine_continuation__`, category `auto`), empty action/cost/trigger/ref/event arrays, a null paused action, and completed cost/once-per-turn bookkeeping. Unknown or executable metadata on a removed wrapper is rejected. All raw frame IDs are unique before lowering; prompts and damage parents cannot reference a removed boundary. A terminal v4 state cannot retain any of the three new pending-work kinds.

### 9.2 Existing strict state and loss rules

`turn.oncePerTurnUsed`, `turn.triggerStagingInstanceIds`, `turn.deckHitZeroThisTurn`, and pregame phase/mulligan/start-effect ledgers already have strict schemas. Version 4 retains them rather than duplicating them. `LOSS_CONDITION_MOD` is an authored Leader rule (`WIN_INSTEAD` or `DELAYED_LOSS`), not another pending-work record; its deferred state is `deckHitZeroThisTurn`. Card schemas live in the separately persisted card database. Reader work does not move loss evaluation or change Nami/Brook rules.

### 9.3 Release and evidence limits

Fixtures are synthetic: some are structural v4 projections of real v3 pipeline states, some are constructed invalid inputs. They are **not** captures from a v4 writer or production sessions. The 6b writer must prove its actual produced states fit this contract and run them through the deployed 6a reader, live and undo. If actual writer states need a broader contract, ship/deploy the reader amendment first.

Rollback limitations are explicit: queued identity snapshots and additional battle locks do not gain their new semantics in the v3 runtime. The reader logs those lowerings only after successful shape and reference validation. Event-publication debt, overflow action chains, pregame child chains, ledgers and scheduled obligations lower to existing owners. Byte-identical source/runtime comparisons and real prompt resumes are the relevant proof; accepting a constructed record alone is not proof of resumed behavior. PR6b still owns Sugar/Senor Pink activation semantics, the On K.O. exception, and any new pregame shuffle or battle target-rematch behavior. PR6a does not close OPT-964 or its children.


## 10. PR 6b: native version 4 runtime and writer (OPT-964)

PR760 merged as `6b394da6538d317eca314d9a6ef47553cb16c3d1`; game worker deployment run `39470617459` succeeded on 2026-10-20 at 17:58:42 UTC. That exact deployed reader is the rollback target for version 4. Its tracked source was archived independently before writer work. The writer and runtime now use version 4 for live and undo states; supported input remains 1–4. No legacy reader is retired.

### 10.1 Native validation and historical lifting

Native v4 validates the complete §9 contract and all executable payloads through a v3 compatibility projection, then retains the original validated graph for execution. It never executes the lowered projection, so source identities, battle locks and owned continuations survive loading. Activated `sourceIdentity` result refs use the same strict identity-only schema as queued snapshots, including cost and simultaneous-group refs. Historical full-card source refs remain readable.

Versions 1–3 first use their existing converters, executable validation and reference checks. `version4-lift.ts` then replaces root Event debt with a bottom `AFTER_STACK` frame, renames nested completion and overflow riders in place, and wraps a suspended start-of-game child with a `PREGAME` boundary. New wrapper IDs come from the saved execution context; existing child IDs and prompt references are preserved. Battle bookkeeping derives from the saved sub-phase and consumed blocker choice. Recoverable queued sources acquire identity records; an absent historical source is not invented. Staged cost transaction battle state receives the same lift. Loading remains nonmutating and never writes storage.

### 10.2 Runtime owners and consumers

| Record | Producers and consumers | Behavioral boundary |
|---|---|---|
| Queued source identity | `trigger-queue.ts`, `trigger-ordering.ts`, `damage-frames.ts`, `phases.ts`; resolver and trigger/order resume drains | Capture instance/card/controller/effect identity at enqueue. Immediately before activation, a departed exact instance skips. No eligibility recheck during an activated effect's resume. Existing On K.O. matching supplies the fresh Trash identity. |
| Activated source identity | Resolver result refs; action controller, hand-trash cause, play/cost cause, prohibition consumers | `OPPONENT_ACTION` changes the acting player without changing effect causation. A departed source's immutable card class can satisfy the authored rest-protection `source_filter`; no dynamic power, cost or DON snapshot is fabricated. |
| Event activation debt | Pipeline bottom `AFTER_STACK`; nested Event `AFTER_EFFECT`; resume-core completion | Preserve every ordered pending event and propagation metadata, not just the activation notice. Publication occurs once when the owning continuation completes. Terminal cleanup drops all pending work. |
| Play overflow | Resolver/batch frame builders; resume-core adapter and existing rule-trash target handler | `PLAY_OVERFLOW` owns the paused `PLAY_CARD`, remaining batch and queued triggers. Rule-trash and fresh replay use existing removal semantics; the internal handler adapter is not persisted as another owner. |
| Pregame | `pregame.ts` bottom wrapper; ordinary stack unwind and session pregame continuation | The wrapper owns the suspended Leader child. Imu's existing `SEARCH_AND_PLAY` action persists `shuffle_after: true`; selection or decline shuffles once through the saved RNG before normal setup continues. No second shuffle or hidden dirty-deck marker is introduced. |
| Battle | Battle constructor/step transitions; redirect action and reply; blocker validation | Step mirrors sub-phase. Closing Block consumes the blocker opportunity and locks the final target for normal battle progression. Explicit Counter redirect remains legal. Final-target `WHEN_ATTACKED` matching occurs at Block closure after Teach's cost/selection; Counter redirect does not reopen that timing. |

The original OPT937 moved-source witness is reconciled with Decision 1: a normal source removed before activation must skip. The separate cause-attribution proof removes an already activated source before an opponent action; the On K.O. proof uses its explicit Trash exception. Senor Pink's paid, already activated scheduled effect survives source departure.

Existing strict once-per-turn, trigger-staging, pregame and loss ledgers remain authoritative. Scheduled obligations stay instance-bound. Nami/Brook loss rules and checkpoint placement are unchanged. No step-end zone checkpoint or scheduling-order rewrite is included. Imu is the authored pregame deck-changing case proved here; this does not promise a generic future shuffle policy for unrelated setup actions.

### 10.3 Writer evidence and rollback limits

The frozen v1/v2/v3 synthetic goldens remain unchanged. A separate v4 golden records the actual current writer. Actual engine-produced suspension states cover queued source ordering, activated source departure, mid-batch overflow, Imu search, Teach cost/redirect, Counter redirect, and root/nested hand/nested Trash Event debt. Each has fixed public replies and live/undo replay expectations. These are synthetic games driven through the real pipeline and session writer, not production Durable Object captures; the §7 production-capture gate remains open.

The independent deployed-reader replay uses the original `6b394da6` parser and runtime, not copied conversion code. Event debt checks compare full event order/payload/propagation, players, prompts, stack completion and execution context. Overflow checks fresh cards and completed batch; pregame checks deterministic shuffle and unchanged RNG on repeated polling; redirects check paid cost once and final-target timing. Source identity and new battle lock semantics can degrade on rollback as documented in §9.3; parse success is not claimed as semantic parity for those changes. New native v4 input retains the fields and does not emit lowering diagnostics.

## 11. PR7a retained battle-substitute reader (OPT-965)

PR7's event-order work can park matched substitute watchers on a
`BATTLE_DAMAGE` frame at `CHARACTER_KO_REPLACEMENT` before a later substitute
prompt. A concrete engine-produced **synthetic** witness extends EB03-001's
substitute to K.O. a cost-1 Character with a surviving ANY_CHARACTER_KO draw watcher, then asks for a hand
trash. The pending hand choice has one retained watcher on the battle frame.
Both deployed reader `6b394da6` and pre-PR7 main `c4ef3637` load that state but
silently drop the watcher when completing the battle (zero draws instead of one).
This is lost work, not merely the old event ordering. The writer must not ship
until the amended reader has merged and its worker deployment is verified.

This reader-only amendment consumes existing `accumulatedEvents` and
`pendingTriggers` when the matching answered battle frame completes. Child
publication boundaries leave that battle debt with its owner. No scanner,
substitute, or session path starts writing debt; version 4 writer goldens remain
byte-identical. Ordinary pre-PR7 publication and ordering behavior is preserved.
The actual writer-produced fixture is labelled synthetic with source commit
`80c084f3d2b6b22adeb65801b34d66372f8f3633`; it is not a production capture.
A constructed event-debt variant separately tests unpublished event consumption.
Both are checked live and as undo, with deterministic reads and no repeat resume.

After PR7 enables these writes, **the deployed PR7a reader is the minimum rollback
build**. The older version-4 builds above are unsafe rollback targets despite
accepting the syntax. The PR7 writer receipt must pin PR7a's merged SHA and successful
worker deployment before enabling the writer. Until then this reader remains the
old writer. Versions 1–4 and all converters remain supported; the OPT-971 captured
session gate is still unmet and no automatic production repair is authorized.

## 12. Phase 1 close-out (OPT-965)

See [ownership, recovery, consumer inventory and evidence](./PHASE-1-OWNERSHIP-CLOSEOUT.md).
Supported versions remain 1–4; no reader or schema version is retired. Historical
structural action-choice prompt contexts now lift to the existing frame contract
before execution (native v4 and historical converted inputs, live and undo). Unknown
context fields are rejected; an existing top frame remains authoritative. The
session's structural fallback executor is removed. Transient handler contexts and
historical committed-cost compatibility remain necessary and are documented there.

Automatic on-load battle repair is declined: the affected live-session count is
unavailable and OPT-971 captures are still missing. Stuck/orphan battle records are
classified on load, without invoking gameplay or writing storage. Runtime orphan
recovery aborts only the stranded Damage Step without guessing a K.O. Validated
terminal snapshots share the terminal writer's event-free pending-work cleanup;
strict-invalid native v4 shapes still reject. Outcomes/event logs are preserved.

Structural lifting also corrects the old fallback dropping accepted action events: the common stack pipeline publishes/scans the committed action once. A surviving external K.O. watcher regression proves one event and one draw, with duplicate replies rejected. Historical OPTIONAL_EFFECT acceptance and skip/PASS rejection remain supported. Non-top string references are malformed and rejected with both IDs and load location, without altering persisted input.


PR7a reader deployed at `958fce9ddc729d3d571473ed7bb013dde62bda0b`: [successful Worker deployment](https://github.com/corycunanan/optcg-sim/actions/runs/39486222062). This is the minimum rollback build after PR7b activation.

## Version 5 trigger-generation reader prerequisite (OPT-966)

The Phase 2 prerequisite accepts and executes `TRIGGER_EXECUTION` frames with explicit FIFO generations, retained ordering histories, and selected-but-not-activated work. Normal producers and their writer remain version 4. Saving a loaded unfinished version 5 scope preserves version 5, including undo snapshots; once no such scope remains the state is representable as version 4. This native semantic reader does not execute a flattened/lowered queue. Strict generation, selection, and frame ownership checks apply before resume. See [Phase 2 trigger reader](PHASE-2-TRIGGER-READER.md) for the complete contract, evidence, and rollout boundary.

Deploy and verify this prerequisite before enabling a version 5 producer. The older PR7 binary is not a supported rollback after version 5 writes. Versions 1–4 remain supported; no production capture or retirement gate is claimed complete, and OPT-971 remains open.

## Phase 3 version-6 writer and semantic rollback floor (OPT-968)

Every live state and undo snapshot now serializes as version 6. Source version
properties cannot override that label. Batch replacement pauses always emit the
complete validated action event family, including imported pauses saved before
answering; legacy runtime inference and explicit emitted bytes agree through
subsequent pauses. Versions 1–5 and all converters remain supported. No format
retirement or production repair is part of this rollout.

The deployed semantic reader `eaa0917cc04def95cb4225e3f2c94cfbf3ff903a` is the
rollback floor for this writer. It understands declared alternative predicates
of one printed replacement ability, including Thatch's retained KO/removal
blocks. The earlier 4e reader accepts version-6 syntax but ignores that identity
and can recreate the erroneous ordering prompt. The catalog is a pure,
nonserialized compatibility view of saved CardData: no group fields are added to
schemas, active effects or continuation frames. This writer removes the temporary
legacy producer module and flag. See [replacement scan contract](REPLACEMENT-SCAN-V6.md).

The user explicitly approved synthetic-only evidence for this reader/writer
rollout. Pinned actual writer/session outputs replay on the deployed semantic
reader, including live and restored undo, all later prompts and allocator IDs.
This exception does not claim captured production sessions or completion of the
capture-dependent retirement gate.

## OPT-997 semantic version 7 reader prerequisite

Ordinary producers still write version 6. Native version 7 is retained through
live state, every action and every undo save. Source versions 1–6 (including an
absent version) reject `costReplacementResolution` and `donIdentityReturn`
before conversion. Every incoming undo entry is validated before retention is
bounded; mixed live/undo versions do not upgrade one another.

Native7 accepts optional `costReplacementResolution: "REPLACED" |
"NOT_REPLACED"` only on a checked `COST`/`AWAITING_COST_SELECTION` frame with its
validated replay action and current cost. Replay families are `SELECT_TARGET`,
`PLAYER_CHOICE` (fixed sentinel and destination choices), and
`ARRANGE_TOP_CARDS`. Native7 answers capture the exact owner before substitute
execution and record the final outcome on that owner, even below children.
Mandatory payment inserts the owner below its actual child. A committed substitute
prefix and its use marker remain on the live root during suspension; earlier
staged payment remains only in the COST transaction for a no-replacement replay.
The shared drain
settles only a topmost owner with no pending prompt. Children retain prompt,
action, trigger and event ownership; their events are not published again.

`REPLACED` uses existing Decision10 policy: substitute stands, earlier staged
costs roll back, post-colon effects do not run and activation use is unconsumed.
`NOT_REPLACED` removes its outcome and replay marker before checked payment.
Native7 executable replay data uses the shared strict GameAction schema and cost
grammar, including fixed sentinel, bound Life destination and exact arrangement
selection. Capture at all five payment sites constructs canonical semantic
input before substitute execution; arrangements save computed full order and
the printed destination, while Life choices preserve their actual chosen end.
Every parked replay or checked replacement marker is validated before any
outcome exists, and the exact caller is checked again before optional answer
execution. A checked marker without its replay is invalid. Malformed payloads
and wrong cost/action pairings are rejected on live and every embedded/separate
undo ingress before retention. Pairing an accepted Stage exit uses its
saved cost, since the substitute may already have moved the Stage. Ordinary6
permissive legacy replay data remains non-executable without an explicit outcome.
Terminal state dominates every insertion/update/rollback. An ordinary legal
Main action after cleanup, followed by a legal Block-Step PASS, is tested; bare
Main-phase PASS is not a valid acceptance probe.

### Native7 parked COST stage/action contract

The replay parser classifies saved payment evidence before inspecting the action:
current cost, `costArrangeStage`, offered `validTargets`, source ID and the saved
`effectBlock` shuffle policy. It does not inspect a live board that a substitute
may already have changed. Every unlisted combination is rejected at repository
load (including every embedded/separate undo entry before retention) and again
before an optional replacement answer can execute a substitute.

The runtime check recognizes retained COST replay metadata and explicit COST
kind as well as phase-derived COST kind. A corrupted in-memory phase must not
hide the caller from validation before either accept or decline. Persisted
ingress already rejects that phase mismatch; this guard covers the independent
in-memory answer boundary, without changing legitimate non-COST callers or
ordinary6 behavior.

| Saved family/stage | Domain and canonical replay |
| --- | --- |
| TRASH_SELF, PLACE_SELF_TO_DECK, TRASH_OWN_STAGE, PLACE_STAGE_TO_DECK; no arrange flag | Empty domain; only PLAYER_CHOICE `__PAY_FIXED_COST__` |
| Generic field exit, including named hand-or-Stage and fixed/default Life destination; no arrange flag | Unique nonempty candidate IDs; SELECT_TARGET of exactly the printed positive count, all offered |
| Opponent Life TOP_OR_BOTTOM; no arrange flag | Exactly TOP and BOTTOM choices bound to the same ordered positive-count unique IDs; exact offered PLAYER_CHOICE |
| Either self+hand/trash compound; no arrange flag, block shuffles | Unique secondary candidate IDs excluding source, more candidates than printed count; SELECT_TARGET of exactly the printed count, allowing zero |
| Either compound; arrange flag, block does not shuffle | Unique group of source plus printed count; ARRANGE_TOP_CARDS exact permutation, empty singular kept ID, absent plural kept IDs, printed TOP as top and otherwise bottom |

Compound selection without shuffle is intermediate, and arrangement with shuffle
is unreachable; neither can own a captured replacement replay. Compound hand is
never a fixed-sentinel family, even for amount zero. The legacy
`fixedCostExitTarget` helper keeps its old membership because ordinary6 uses it;
only native replay uses the four-family fixed set. All five capture sites pass
saved producer evidence to this same parser. No new persisted field is required.

This checks stage/action compatibility and domain structure. It does not
authenticate coordinated identity rewrites against the saved payment snapshot or
the replacement offer target, nor prove that a named candidate is the Stage
rather than an identically named hand card. The actual named Stage/hand control
is retained. Snapshot/offer target and zone binding are outside this revision.
Numeric-zero activation feasibility with empty candidates, forced-candidate
shuffle payment bypassing replacement capture, and compound-hand TOP payment
mechanics also remain separate issues. Accepted Decision10 rollback is unchanged.
Ordinary producers remain version6; historical corpora are preserved, with no
production repair, capture campaign or reader retirement implied.

Native7 amount DON returns intersect positive `is_active`, positive `is_rested`
and exact `state` selectors. False flags impose no restriction. State-restricted
or explicit DON_IN_COST_AREA pools exclude attached donors; unfiltered field
returns retain their attached domain. The executor supplies both identity choices
and replacement feasibility, so insufficient restricted pools cannot admit a
replacement by counting active or attached donors. The general target resolver's
separate exact-state handling is outside this native7 correction.

Native7 also generates subsequent RETURN_DON amount identity prompts through a
shared grouped planner and real mutation executor. That semantic capability is
needed when loading a still-unanswered offer whose substitute returns DON.
Ordinary6 amount and legacy `until_count` bucket behavior stay unchanged.
Native7 optional `donIdentityReturn` metadata has positive fixed/variable
bounds and nonoverlapping labeled identity groups. Generic offered choices
remain authoritative: older clients ignore metadata and use readable generic
choices; newer clients confirm only an offered enabled exact-ID choice. Readable labels identify duplicate-name Character board slots and meaningful
hold source/duration. Source names come only from public field/trash zones; a
source absent there receives a neutral prior-effect label. Old
`donReturn` metadata/grammar is unchanged. Frontend sandbox producers are
non-authoritative preview fixtures.

Absent outcome is unresolved or legacy unknown, never inferred acceptance.
A checked parked cost without an outcome or an offer above it is diagnosed as
`legacy.cost_replacement_outcome_unknown`, with recoverable bytes preserved.
The canonical-stage isolated candidate proves actual repository first-load6
promotion before the first answer, across live and all mixed undo entries.
Only a demonstrably unanswered old offer can have its payment payload
canonicalized with the same constructor. Outcomes stay absent until a real
final answer. Valid accepted/orphan unknown outcomes remain diagnostic; no
accept/decline history is inferred. Unprovable payloads, including missing
checked replay metadata beyond the undo retention limit, fail atomically with
an explicit legacy-debt SessionLoadError: original storage is unchanged, no
partially promoted runtime is returned, and no undo entry is silently dropped.
This is isolated evidence, not delivered writer conversion or production repair;
ordinary reader6 remains the recovery floor for unprovable old data. The future
ordinary writer must implement this boundary before routing any first action.
Historical v6 corpus payloads are unchanged; the separate v7 corpus distinguishes
supported completion from diagnostic legacy debt.

Reader deployment must precede the ordinary writer7 flip. After writer7 emits
native7, the rollback floor is a semantic version7 reader; a version6-only build
must reject rather than reinterpret those sessions. No reader retirement or
production repair is claimed. See the checked-in OPT997 v7 corpus README for
actual producer SHA, source patch, full hashes, commands and coverage matrix.
The separate corrected corpus retains all original-v7 inputs unchanged and
adds mandatory committed-prefix and distinct-label cases. The separate
`opt-997-v7-canonical` corpus preserves both earlier corpora, adds all five
capture variants and actual first-load promotion, and separates supported
completion, legacy unknown, and atomic rejection dispositions. Its ordering →
optional decline → reoffer control exposed a historical transient `type`
discriminator leaking into persisted offers. Native7 constructs only explicit
persisted offer keys; ordinary6 retains the historical diagnostic failure.
No scan, outcome, event scheduler or rollback policy changes follow.

The user authorized synthetic-only evidence for the DON choice rollout and then
explicitly included the bounded OPT997 prerequisite under the same gates. This
scope permits actual candidate-generated live/undo replay evidence, not
production capture, retirement, old-session repair or broader OPT1006 changes.
OPT958 remains open: the accepted rollback policy and its labeled deviation
fixture remain; the next review condition is a policy decision backed by an
applicable authoritative multi-cost ruling, not this owner-lifecycle correction.

### Native7 future cost producers (OPT-969 / OPT-997 amendment)

Loading a native7 prompt also commits the reader to its future native7 producers: a later cost, branch, nested child, trigger, parent resume, new activation or restored undo must preserve meaningful donor choices. The original485 reader could accept the first DON identity reply then silently auto-pay a second DON cost and DRAW. Initial prompt parsing was insufficient compatibility evidence.

The bounded amendment keeps ordinary creation/execution/writing at6. Only explicit7 cost orchestration uses identity plans for positive DON_MINUS/VARIABLE_DON_RETURN: execute a proven sole semantic plan through the real identity executor, otherwise emit the existing COST/PLAYER_CHOICE shape. Positive active/rested flags and exact state intersect; false flags are unrestricted, and state restrictions exclude attached donors. Numeric0 emits no positive-bound DON picker. Generic zero field payment skips removal scanning/capture rather than broadening the closed replay grammar. Setup, legacy promotion, writer constants, ordinary6 semantics and shared feasibility remain separate rollout work.

The separately named `opt-969-native7-producers` corpus pins the isolated actual producer, a complete eight-file production patch from reachable485, source/generator/payload hashes,82 synthetic scenarios and every later pause. Mock-free public replay covers live/undo, suffix/branch/nested continuation and completion, including independent identity/power/events/terminal/rollback assertions. It is not a production capture or proof of authored multi-DON/zero prevalence. Historical corpora remain immutable. See [the source/acceptance handoff](../project/handoffs/opt969-native7-producers.md) for counts, negative controls and scope limits.

After ordinary7 rollout, the verified amendment is the semantic rollback floor;485 is known unsafe for these future producers. Decision10 rollback remains an explicit known rules deviation. Deferred feasibility, forced-shuffle replacement, hand-TOP and authored DON-domain corrections are not resolved by this amendment.

### PR778 optional COST expected-root evidence (OPT-969)

Newly created native7 COST owners persist optional `costExpectedRoot`: an immutable
snapshot of exactly the existing `CostTransactionState` projection (`players`,
`turn`, `activeEffects`, `prohibitions`, `scheduledActions`, `oneTimeModifiers`,
`triggerRegistry`). Strict shape and embedded executable validation cover the
live state and every separate or embedded undo entry before retention. Evidence
requires a staged COST owner; versions below7 reject it.

Before any external prompt continuation, all evidence-bearing COST owners must
match the published root structurally. Object property order is incidental;
array order is retained. A mismatch rejects without events or prompt/frame
consumption, before staged overlay or replacement processing. Matching owners
use staged DON legality. Frames lacking evidence keep the previous conservative
live-and-staged DON guard: the known REST_DON-prefix/rested-filter rejection
remains for historical frames. Resuspending the same historical owner preserves
field absence, including when its selection opens a replacement prompt. A new
successor COST owner may capture evidence at its own sanctioned suspension.
No historical baseline is reconstructed.

Capture occurs after restoring the committed root at suspension. Initial
SessionCoordinator publication finalizes newly created owners after pipeline
cleanup. Successful, prevalidated prompt lifecycle transitions refresh surviving
evidence owners after rule processing and moved-DON cleanup, so committed
mandatory/optional replacement children survive while Decision10 abandonment
still discards staged payment. Child prompts also validate ancestor evidence.
This touches the shared prompt-lifecycle boundary; it does not change prompt,
player, frame, count, exact-identity, or replacement-outcome guards.

Player presence is an explicit sanctioned transport delta within `players`.
`setPlayerPresence` updates only `connected`, `awayReason`, and
`rejoinDeadlineAt` in both evidence and staged snapshots, and only when all
existing evidence owners match before the presence change. If gameplay already
diverged, normal presence updates continue but evidence stays invalid. This
preserves reconnect behavior and prevents an overlay from restoring old presence.

Ordinary default and explicit6 producers remain6. Only native7 producers emit
new evidence, including the transitive continuations of already loaded7 work.
Thus this amendment is both the evidence-aware reader prerequisite and part of
that native7 producer closure; it is not an independently deployable ordinary7
writer release. Deploy/verify this reader before any future ordinary7 rollout.
PR778 supplies expected-root eligibility, but its deployed691 reader loses the
published Counter history in the later frozen f19 writer witness. That writer
requires the bounded history reader below to be deployed and verified before
its ordinary7 promotion can resume. Original485 remains unsafe: accepting the optional shape alone
cannot reproduce the new staged eligibility semantics. Rolling back to older
readers is unsupported once evidence-bearing7 snapshots are written.

Historical corpus bytes and manifests remain unchanged. Current replay tests
independently assert each new field equals the exact published projection,
then omit only that field from a comparison copy before comparing all historical
fields. This intentional metadata assertion is not the sole gameplay proof:
new tests cover real persistence, staged prefix success, stale mutations,
multiple pauses, replacement committed/decline paths, and reconnects. The
self-pinned historical source `opt-969-native7-producers.test.ts` is archived
byte-for-byte at
`workers/game/src/__tests__/fixtures/opt-969-native7-producers/producer/opt-969-native7-producers.historical.test-source`.
Its unchanged manifest entry resolves to that archive; reconstruct the original
capture source by copying it back to its original test path. Other generator
and payload hashes still resolve to their original files.

The evidence rejects unexplained divergence across the entire overlay boundary;
it does not authenticate arbitrary corruption of staged state or reconstruct
changes that lead back to an identical snapshot. Snapshot cloning adds one
projection per COST owner, with serialization cost proportional to that
projection. Bounded regression measured 11,210 evidence bytes in a 36,943-byte published
state (JSON string length, ASCII fixture);
no production workload or broad performance claim follows.

### Bounded staged-entry history ownership reader (OPT-969)

`applyCostTransactionState` remains an exact projection overlay, including for
baseline rollback and Decision10 abandonment. A separate staged-entry helper is
used only after all expected roots match, and only reconciles history for native
cost capability7 (envelope7 or8/mode7) with both expected-root and staged evidence.
If either history is an exact structural prefix of the other, entry retains the
longer history with unchanged records, order and timestamps. Ambiguous historical
divergence rejects conservatively. Missing historical evidence stays missing;
no root or replacement outcome is inferred. Legacy6 and8/mode6 retain their exact
overlay behavior.

At sanctioned publication, retain old expected root B before publishing live L.
For append-only B→L history, preserve staged S while making committed L the
prefix: when B prefixes both divergent streams, use `L + S.slice(B.length)`.
This retains the relative order and exact bytes of every record in each stream;
transaction-only facts follow committed publication until commit. An existing
exact L prefix in S is the explicit already-carried check. Repeated publication
inserts each proven new committed suffix before the remaining staged-only facts.
No sorting, timestamp deduplication, arbitrary union or persisted field is added.
Other projected fields remain staged-owned during payment and baseline-owned on
rollback. Rollback excludes transaction-only history.

Public `runPipeline` and Coordinator publication finalize only new evidence-owner
IDs; successful prompt continuations refresh surviving evidence only after root
prevalidation and cleanup. Existing stale history/resources reject before any
merge or consumption. A valid current producer that cannot satisfy this contract
requires design adjudication rather than a broader merge or silent rejection.

The new `opt-969-history-reader` fixtures pin actual frozen writer
`f19da7bb59aa4ef30185ed1d0f029a87c7fe3a3c`, source and capture hashes. Authored
ST04-016 records exactly one Counter activation and keeps the real
`ACTIVATED_EVENT` query true through DON/target replies, persistence, undo readers
and GameSession recreation. Its base cost1 does not prove natural reachability
of OP15-002's base-cost3 condition. Twelve additional synthetic producer recipes
cover first/subsequent pauses and reader-generated successor completion. These
are synthetic compatibility evidence, with independent resource/history checks;
no production capture, UI geometry, rules migration or parent closure is claimed.
See [the bounded handoff](../project/handoffs/opt969-history-reader.md).

## Native8 battle completion reader (OPT-1007)

The reader accepts8 while ordinary writers remain6 and existing loaded6/7
retain their deployed semantics. Native8 requires explicit
`costSemanticsVersion: 6 | 7`; it does not imply a native7 cost migration.
The exact-battle BATTLE_COMPLETION owner sits below all End-of-Battle work,
then expires turn-player and opponent battle durations before returning to Main.
Stable8 states preserve both envelope and mode after that owner disappears.
Older envelopes reject the new field/owner; mode6 rejects native7-only cost data.

See [the complete ownership, publication, support and rollback contract](./NATIVE8-BATTLE-COMPLETION.md)
and [the synthetic isolated-writer corpus](../../workers/game/src/__tests__/fixtures/opt-1007-native8/README.md).
This release does not promote existing sessions, enable the ordinary8 writer,
change End Phase stage bytes, infer old replacement outcomes, or claim production
capture evidence. Deploy and verify this semantic8 reader before writer rollout.


### Writer activation after deployed native8 reader (OPT-1003 delivery history)

The OPT-1007 reader above shipped first. At the OPT-1003/main785 delivery, production new games started as schema 8 with cost mode 6;
repository load/save activates validated historical live and all undo snapshots
before gameplay, preserving6→8.mode 6 and7→8.mode 7. Older supported envelopes
first use their existing conversion hooks and then mode 6. Explicit schema 8 mode is
required and preserved; invalid/missing mode never defaults. No payment outcome,
expected-root evidence or battle completion is reconstructed. Already-started
legacy EOB prompts retain their committed events and expired effects.

The repository save return is the activated runtime, matching stored semantics.
Low-level `convertPersistedGameState` / `parseStoredSession` and explicitly
versioned serializer inputs preserve historical reader contracts. Historical typed
coordinator actions activate before accepted gameplay; rejected commands retain
original live/undo state. Current writer 16-case golden is separately named
`opt-1003-writer-golden.synthetic.json`, pinned to source `6469e366`; every older
golden/prototype input stays frozen. Its delta from the ordinary6 golden is only
the8 envelope and mode 6 provenance. Synthetic-only evidence was explicitly approved
for this run; no production capture claim follows. The semantic rollback floor
is the deployed combined reader at `c50b1d03`, including schema 8 completion and
COST publication-history ownership for cost mode 7. The earlier 864 receipt covers
the unchanged mode 6 corpus only. See [the completion and Refresh contract](./NATIVE8-BATTLE-COMPLETION.md).


### Native cost writer rollout in schema8 (OPT-969)

Ordinary setup now owns explicit8/costSemanticsVersion7 before its first action/save. SessionRepository
validates runtime provenance before shape encoding and validates/promotes the
live state and every undo snapshot atomically before history retention or any
storage write. The low-level encoder preserves explicit6 for historical/direct
controls. Unprovable continuation or unsupported provenance fails without input
or storage mutation; no historical expected root or replacement outcome is
invented. Valid legacy unknown debt stays diagnostic after promotion.

The rollback floor is verified deployed PR784 history reader
`c50b1d037ea38c004aa3d29b6b2ee5b90b45574e`. Original485 and69125276 are known
unsafe for published Counter history. The writer preserves the deployed
`publishCostOwnerRoots` contract: new-owner publication carries proven committed
history into staged payment before refreshing expected evidence. Existing
mismatches and historical evidence absence remain conservative. Current writer
first/subsequent pauses, history queries, all storage contexts and real
GameSession messages execute on that actual reader; equality is supplemental.

Historical corpus bytes remain immutable. Evidence is synthetic under the
explicit accepted exception; no production capture, repair or retirement is
claimed. Final OPT921/948 domains/feasibility and the
Decision10 policy decision are outside this rollout. See
[the writer handoff](../project/handoffs/opt969-native7-writer.md) for ownership,
reader selection, validation and remaining parent work. Earlier ordinary6
statements above describe the prerequisite releases, superseded by this rollout.

### Source-aware schema8/mode7 composition (OPT-969)

The OPT-1003 activation and golden notes above remain delivery history. Its
source6→8/mode6 policy is superseded only for historical sources not yet8; already
activated8/mode6 sessions keep that explicit mode. The frozen16-case main785
golden and39already8/mode6 battle replay cases remain immutable historical
controls; current mode7 producer proof is separate.

The user-approved schema8/mode7 composition supersedes the prerequisite writer
policies above. New setup is8/mode7; historical source<=6 must prove the original
native7 continuation migration before8 activation, and source7 activates8/mode7.
Already loaded8 live/undo retain explicit costSemanticsVersion6|7, without downgrade
or cost migration. Their strict validated wire view is not returned as runtime
normalization: valid original8 objects retain identity, including absent derived
kinds. All live/all-undo proof occurs before retention, prompt IDs or side effects.

The repaired c50 reader floor applies to this schema8/mode7 rollout and preserved
native8 inputs. No7-only rollback or envelope/mode downgrade of8 is supported.
The original f19 writer full reviews returned P1 FINDINGS and stopped at the
publication design checkpoint; the deployed reader repair permits writer
resumption. Its968 full/delta CLEAN remains historical; the user-approved main785
composition has one full and one delta per same reviewer, without erasing prior
findings or design stops.
Historical82/13 payloads and manifests are immutable; original c50 generator
sources are archived non-executably before current writer assertions change.

### Explicit mode8 cost capability reader (OPT-969)

The new reader accepts schema8/costSemanticsVersion8 while retaining ordinary setup8/7 and every existing6/7 promotion/behavior. Mode8 governs the entire effect graph, including fresh triggers after resumed work; the unsuccessful continuation-only mode7 split is not included. Unknown/misdeclared modes reject atomically. c50/2ca cannot read8 and are not a future mode8 rollback floor. See [the mode8 contract](MODE8-COST-SEMANTICS.md) for shared runtime ownership, immutable forward producer evidence, saved-definition preservation and the separate future new-game writer gate.

### New-game mode8 writer after verified reader floor (OPT-969)

New setup now chooses schema8/mode8 before its first action/save. Historical promotions remain7 and existing explicit6/7/8 retain their mode and stored cardDb. Reader PR786 at `e14af35bad3a7189a40294f5d4ab3db5b5602f0e` is the verified deployed minimum rollback floor (deployment40139694972, post-CI40139694988); c50/2ca reject8 and cannot be rollback targets. The prior reader-stage paragraph records its historical setup7 behavior. See [the current cost contract](MODE8-COST-SEMANTICS.md#new-game-writer-enablement) for the three new-game authored corrections, historical fixture preservation, carried source-equivalent corpus and retained OPT-958 debt. No active-session migration or production repair is included.

### Superseded scheduled-origin draft9 evidence (OPT-1004)

The following describes the immutable pre-integration draft. It is obsolete for
current compatibility: deployed9 belongs exclusively to OPT-1006. Scheduled
origin now requires10 and an independent field-trash capability (see below).

This reader accepts schema9 while ordinary setup and the default writer remain
schema8. Schema9 adds optional `sourceCardSnapshot` to scheduled obligations and
parked End Phase queue entries. It reuses the strict full CardInstance snapshot
already carried by effect result refs; only instance/card/controller identity is
used as origin provenance. Rested state, power and attached DON at capture are
not queried as current characteristics. Both scheduled collectors preserve the
snapshot. Already-activated scheduled execution seeds the existing source ref,
including across a prompt, without bypassing departed-source rejection for a
trigger that has not activated yet.

Top-level obligations, parked queues, transaction/expected roots and resumed
refs validate snapshots strictly. Scheduled snapshot instance identity must
match `sourceEffectId`. Schema1–8 reject the new scheduled field. Native9
requires explicit costSemanticsVersion6|7|8, and retains that independent mode;
resaving loaded9 and its undo entries retains9. Ordinary schema8 scheduling does
not capture or emit the new field. Continuing loaded9 does capture origin for
new obligations, including full pre-cost origin before a queued TRASH_SELF;
a rollback reader must preserve this future producer behavior. A future writer must promote the owning
state to9 before saving newly captured origin, including scheduling from an
existing8 game. Cost semantics are not promoted by scheduled provenance.

Historical obligations without origin use exact live-instance lookup. If the
source has departed, its card category is unknown: classification
`legacy.scheduled_origin_unknown` diagnoses this absence. The old obligation
still executes and can incorrectly activate DON under a Character-effect
restriction; no card/category is inferred, no obligation is dropped, and no
historical fixture is rewritten. This bounded limitation applies to pre-writer
obligations, not newly captured work after stage2.

The user explicitly approved “Approve scoped synthetic-only evidence and legacy
limitation” for this run. Compatibility evidence therefore uses real-pipeline
synthetic states and isolated actual-writer output; production DO capture stays
unmet. This exception does not waive reader-first deployment, writer-output
replay, strict validation, or a verified reader-capable rollback floor. Stage2
must remain disabled until the coordinator records the deployed stage1 commit
and names that reader as the rollback floor. A build that reads only1–8 cannot
be a rollback target after a schema9 writer runs.

The isolated writer candidate is
`71bb66df105a763ac2ab2cf1f5f3f4ccc286eabc`, based on reader draft
`66df1d56f4768790c8f8f9eaaab0623c33abd251`. Its immutable corpus is
`workers/game/src/__tests__/fixtures/opt-1004-scheduled-writer/`: the manifest
pins fourteen scenarios and 103 actual GameSession/repository saved boundaries,
complete candidate source hashes, compressed payload, archived generator and
full writer patch (zero-context diff; apply with `git apply --unidiff-zero`). Cases include ST24-005 before/after source departure, both
restrictions imposed after scheduling, an End Phase park and reply, allowed
Leader/Event origins, existing8 queued On Play/TRASH_SELF/scheduling, COST
transaction/expected roots and mixed8/9 undo. The reader suite loads all boundaries
write-free and replays the suffix from the first actual schema9 saved boundary, including
pre-obligation cost pauses and subsequent scheduling from loaded9 through GameSession against the writer's exact saved output. Reader
activation of schema9 from schema8 is deliberately disabled in this release;
continued scheduling from an already-loaded9 state preserves origin.

Regenerate only from that isolated candidate using
`OPT1004_WRITER_CAPTURE_DIR=/absolute/new/output-dir pnpm --filter optcg-game exec vitest run src/__tests__/opt-1004-writer-producer.test.ts`.
The frozen compressed payload SHA256 is
`46c642c96ea6b145f14675890a11e74d64c479f6358ae4e6918d21838c254c2b`;
the candidate manifest SHA256 is
`5583144b186bbd1e600b254a2fc83dbb7463def2c0b457aec45d1bfeba9345d4`.
The generator/source archives are non-executable evidence. They do not enable
the future writer on the reader branch.

The isolated writer promotes only scheduling-capable effects (recursively via
getNestedActions) before optional/cost handling, preserving the existing cost
mode. Three added actual GameSession cases prove existing8→queued On Play→
TRASH_SELF→later hand-cost prompt→save/load→schedule for modes6/7/8. Native costs
may keep the departure staged until commit; the captured payment root has
already removed the source while immutable origin remains. The prior eleven
case objects remain byte-equivalent in the expanded corpus. This early shape
promotion is archived future-writer code, not enabled for ordinary8 here.
### Field-trash batch reader9 (OPT-1006)

The reader now accepts retained schema9 graphs with explicit cost mode6|7|8 and
`replacementBatch.actionKind: TRASH_CARD`. Ordinary setup/default writer/ingress
remain8; only loaded9 uses the new route in this reader release. Versions<=8
reject the discriminator by name. The new route reuses batch ownership and
non-K.O. trash finalization; no session-format/execution-context bump or cost
migration occurs. The future writer must activate9 immutably only at an eligible
field-trash producer and wait for this reader's verified deployment. Source9 is
retained after completion and executes later trash/cost/battle work; rolling back
to05d after9 writes is unsupported. The future writer PR must pin the actual
verified reader SHA as its rollback floor. See the [field-trash reader contract](FIELD-TRASH-READER-V9.md)
for ownership, producer corpus, original writer-byte comparison, strict source
validation, synthetic-evidence exception and retained OPT-958 policy.

### Scheduled-origin schema10 with independent field-trash capability (OPT-1004)

Main deployed9 is exclusively the FIELD-TRASH reader contract above. Scheduled
origin requires10. Every native10 envelope requires explicit
`fieldTrashSemanticsVersion: 8 | 9` as well as independent cost mode6|7|8. Mode8
records legacy trash until an eligible field-Character consequence activates
mode9 at the delivered producer boundary; mode9 retains native replacement
behavior. Loading/restoring10/8 alone never activates that capability.
Source<=9 rejects the new capability and scheduled metadata. COST roots inherit
the enclosing capabilities; they are partial state snapshots, not new envelopes.
Default setup/runtime/writer remain8. Loaded9 does not emit scheduled origin;
loaded10 preserves future scheduling, queued pre-cost snapshots, parked work,
strict dual identity, and live/undo envelopes without mode drift.

The future scheduling writer promotes8→10/field8 and9→10/field9 before optional
or cost pauses for recursively scheduling-capable blocks, preserving cost mode.
Earlier obsolete candidates chose new-game10/field8/cost8. The current
scheduling candidate retains new-game/default8 and activates10 only at accepted
scheduling producers, including COST/ACTION resumes; it is isolated evidence,
not production scheduling enablement. Main PR789 delivered the field-trash
producer; integration supports10/field8→10/field9 at its eligible consequence
boundary while retaining scheduled metadata, envelope10 and explicit cost mode.
Explicit native8 upgrades to9 there as on main; raw historical callers and
hand-only/zero-selection actions retain their previous boundary.

The original draft9 14-case/103-boundary archive is retained byte-for-byte as
obsolete development evidence; it cannot establish compatibility with deployed9.
The first21/153 schema10 reader-only prototype is also retained unchanged as
obsolete runtime-parity evidence after the delivered trash producer. Current
schema10 writer output and sources are archived separately against that merged
producer and the resolved-modifier correction.
Reader deployment and a named verified reader rollback floor still precede
writer enablement. The accepted synthetic-only capture exception and historical
missing-origin limitation remain: no production repair or migration is claimed.

### Field-trash producer9 after verified reader (OPT-1006 / OPT-1001)

The final writer enables the existing9 field-Character trash route from explicit
native8/costSemanticsVersion6|7|8 only, with an immutable scalar promotion before
its replacement scan. Source9 remains9 after completion; synchronous/no-match
field consequences also promote. Hand-only/zero-selection actions and ordinary
setup stay8; setup retains mode8. Raw historical direct engine callers are not
migrated at the trash site. Repository/Coordinator shared validated ingress still
owns historical6/7→8/mode7 before gameplay, and existing explicit modes are retained.

Minimum rollback floor: deployed PR788 merge
`d8309e70fef64a133ce19d8a2bd327bb625e56fb`, worker
`bd251100-440e-40f8-b381-302f0a3db6f2`. Actual final writer output is loaded and
completed by that floor through Repository/Coordinator/GameSession, with exact
state/event/ID comparisons. The historical reader corpus stays immutable; new
canonical writer output has a separate manifest. See the updated
[field-trash contract](FIELD-TRASH-READER-V9.md) for the six non-contiguous old8
choice scripts,22 exact native9 suffixes, producer policy and retained OPT-958 debt.

### Historical activated resume provenance (OPT-1004 checkpoint correction)

Schema10 scheduled and parked entries also accept strict optional identity4
`sourceIdentity` (instanceId/cardId/controller/effectBlockId). It is provenance
of an already-activated effect, never a queued-source eligibility snapshot.
Source<=9 rejects it. Identity instance binds to sourceEffectId; full and typed
carriers must agree on instance/card/controller. The proven origin controller
may differ from the scheduled execution controller or prompt responder. Generic
engine-continuation frames retain their original authored block identity; they
do not require that block to equal the generated continuation block.

Loaded10 COST resume captures an exact matching live full source before entering
its staged payment view, preserving an existing full ref first. Controller
changes retain identity alone; no full card is fabricated. Historical ACTION
pauses may have identity4 after the original full instance has gone: scheduling,
both collectors, parked refs and activated resolution retain that typed origin.
The unknown-origin classification applies only when no full/typed/live evidence
exists. Queued triggers still require their exact original source to be live.

Preparation is local until accepted continuation progress. Rejected/unsupported
waiting, no-op and explicit optional/cost abandonment do not publish tentative
refs or schema changes, even if prior-payment event debt is reported. Existing
event scans remain intact. A committed schedule remains10 if a later action
terminates; an independent committed field-trash upgrade also survives.

The current isolated writer `046324c4bf2aa2072c3ba253b9a04c9c9ab0893c`
(base reader `ab15a965dcda19cf609a6c169abe7b867037c59f`) keeps defaults8
and activates10 at new scheduling activation or accepted scheduling-capable
COST/ACTION continuation boundaries. Explicit8/9 must carry recorded cost6|7|8;
raw callers without that evidence do not invent a mode or promote.
It preserves field/cost modes and activates before later pauses or destructive
payment can erase the original. Reader8/9 does not activate this metadata. The
unchanged actual67cbb COST6/7/8 and ACTION pause artifacts are archived separately
with producer source hashes. The current archive is
`workers/game/src/__tests__/fixtures/opt-1004-scheduled-resume-writer10/`:
41 real-pipeline synthetic families and217 actual saved boundaries, including
20 unchanged historical producer inputs. Reader replay completes every174 saved10
start plus3 pure8 skip controls (425 actions), checking complete storage, events,
prompts and IDs. Every217 boundary also loads write-free and resaves exactly.
Payload SHA256: `61edf23feb3d4bfc916fcb32bbec5e9af510e86a95c158ce1a2acb541158e3d6`;
manifest SHA256: `72056960286393cdaf522c5a1b09dbce8f76394ff568031bb77b337bc523ec7e`.
Independent coordinator regeneration matches both files byte-for-byte. The
archived two-file activation patch and source/generator hashes pin this actual
producer; they do not enable it on the reader branch.

The sole bounded C3 correction preserves8/9 and exact legacy outcomes when
ANY_NUMBER cost or an optional action is declined without body work, including
fully disabled conditional/simultaneous suffixes. Retained payment events alone
do not prove acceptance. A real THEN DRAW or THEN SCHEDULE suffix is accepted
progress, as is fully paid progress whose post-cost condition fails. Committed
scheduling followed by terminal DRAW retains10. The internal execution signal
is neither saved nor used to alter event scan/publication ownership.

The original14/103 draft9 archive, first21/153 reader-only10 prototype and
21/156 full-only10 candidate remain byte-for-byte historical evidence; the last
candidate's new-game10 policy and incomplete historical-resume coverage are
obsolete. The provisional36/205 resume candidate is separately preserved as
pre-C3 evidence and does not establish current writer purity. No older archive
is retagged as current output. Regenerate only at the exact current isolated
candidate with `OPT1004_WRITER_CAPTURE_DIR=/absolute/new/output-dir pnpm --filter
optcg-game exec vitest run src/__tests__/opt-1004-writer-producer.test.ts`;
replay on the reader with `pnpm --filter optcg-game exec vitest run
src/__tests__/opt-1004-resume-writer-corpus.test.ts`.

The synthetic-only exception remains explicit; production capture, repair,
retirement and broad historical migration are unclaimed. The accepted unknown
origin limitation covers absence of full, typed and exact-live evidence; it does
not cover a known identity4 merely missing a full CardInstance. Scheduling
enablement still requires verified deployed reader and a named rollback floor.
New-game/default8 remains unchanged in that future producer-only writer.

### Resolved prohibition lifetime prerequisite (OPT-910)

The common prohibition condition reader now recognizes the existing exact
`sourceEffectBlockId: ""` action-output signature from APPLY_PROHIBITION and
NEGATE_TRIGGER_TYPE. Later source negation cannot revoke that resolved result
(rule8-2-3), including Kalgara's turn-long draw restriction after Roger enters.
Registered continuous rows retain authored block IDs and pause with their source;
missing, null, numeric and other unproven block metadata retain the prior source
gate. No duration inference, persistence field, shape tightening or row rewrite
is introduced. The earlier DON-only exception now delegates this same gate.
Conditions, WHILE_CONDITION, expiry, uses, overrides, ownership and targets keep
their existing behavior. The direct trigger-type reader's existing bypass is
inventoried and preserved rather than expanded to new condition semantics.

See the [producer/consumer inventory and acceptance map](evidence/opt-910/prohibition-lifetime-inventory.md).
All prior payload/source archives remain immutable. The actual04641-family/
217-boundary corpus replays unchanged on this correction, including its existing
non-DON protection rows. A future enabled writer must inherit this common gate
correction in addition to the reviewed two-file activation delta; the earlier046
source remains an archive, not the final enablement commit. Defaults8,
producer-only scheduling activation and verified deployed reader rollback-floor
requirements are unchanged. OPT-954 and unrelated prohibition debt remain out of
scope under the user's bounded OPT-910 prerequisite approval.

### Producer-only scheduled-origin writer after verified reader (OPT-1004)

The enabled scheduling writer retains new-game/default schema8 and explicit
cost mode8. It activates schema10 only at a new scheduling-capable effect
activation or accepted scheduling-capable COST/ACTION continuation, before
later destructive payment or pauses can erase proven source evidence. Explicit8
and9 require recorded costSemanticsVersion6|7|8 and become10/field8 or10/field9
respectively; existing10 retains its recorded capabilities. Raw engine callers
without that provenance do not invent it. Delivered field-trash advancement
10/field8→10/field9 retains10 and scheduled origin. No load-time scheduling
promotion or cost migration is introduced.

Rejected, waiting/no-op and abandoned work do not publish tentative promotion
or origin refs. A genuine advancing THEN suffix, fully paid progress, or
committed scheduling followed by terminal DRAW retains its accepted result.
Exact full source/typed identity fallback, queued departure eligibility,
conditions/expiry, resolved modifier/prohibition lifetime (including OPT-910),
legacy unknown-obligation behavior and the synthetic-only exception are the
verified reader contracts above, unchanged by this two-file activation delta.

The minimum rollback floor after any10 write is the deployed reader PR790 merge
`127631dc1c67411e04062d45803c7bf2a0b680b0`, whose complete tree equals reviewed
`432061c101a691772d446189852cafff9e9123e0`. Workers deployment40162744972,
game job121077670523, deployed version
`8c3509d3-7407-4ea7-8665-ad68cc3813b1`; post-CI40162744953 and both schema
sync jobs succeeded. Earlier readers without the complete schema10 provenance
and resolved-output fixes are not rollback targets. The coordinator verified
this floor before writer assembly; final writer CI/deployment gates remain
separate from these reader receipts. No production capture or historical repair
is claimed. The reviewed046 archives and all earlier producer bytes remain
immutable; this delivery inherits the landed reader and exact reviewed activation
and test-policy patches rather than changing their semantic contract.
