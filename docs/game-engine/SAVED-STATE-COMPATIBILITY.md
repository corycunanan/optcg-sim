# Saved-State Compatibility — Game-State Schema Version, Frame Kinds, Support Window, Rollback Runbook

> Written before the reader code for OPT-940 (PR 1 of the Game Engine Consolidation, parent OPT-959). This is the contract every later consolidation PR writes through. Code of record: `workers/game/src/session/game-state-schema.ts` (version dispatch and conversion), `workers/game/src/session/persisted-game-state.ts` (strict shape), `workers/game/src/session/persistence.ts` (storage boundary).

**Status:** Contract in force from PR 1. Writers are unchanged in PR 1; the reader assigns version 1 to every save that exists today. From PR 4a (OPT-980) the reader also reads version 2 (the End Phase stage, §6); from PR 4b (OPT-924) the writer writes version 2 (§1.6). From PR 5a (OPT-963) the reader also reads version 3 (typed replacement and damage continuation frames, §8) and lowers it to the version 2 runtime (§1.7); PR 5b raises the runtime and the writer to version 3 (§1.8).

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

1. **Read the version.** Absent → 1. A non-integer, a negative number, or `0` → reject. An integer above `GAME_STATE_SCHEMA_VERSION` → reject as unsupported (a newer writer wrote it; this build cannot interpret it). An integer below the oldest supported version → reject as retired (see §3).
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

1. `convertFromV2` rejects v3 fields and phases in a v2 object. `convertFromV3` strips the envelope and rejects retired v2 continuation records, riders, and replacement prompt contexts beside v3 frames. Strict validation rejects non-damage frames at `AWAITING_TRIGGER_REVEAL`, and replacement offers without their owning prompt. No 5b engine path persists those offers separately; the review's 286 captured states contain no unnamed batch offer.
2. `lowerVersion3Frames` lowers live state and every undo snapshot to the v2 runtime. Replacement offers become prompt contexts; a suspended replacement batch rides on the **top surviving frame above it**, where the v2 lifecycle resumes it. `CHARACTER_KO_REPLACEMENT` preserves every field, including `replacementEffectId` and `resolution`. Battle `TRIGGER_EFFECT` maps an unscanned Life removal to `LIFE_REMOVAL`, otherwise `DAMAGE`. Effect `TRIGGER_EFFECT` transfers retained unpublished/unscanned events to the surviving Trigger-effect frame above, so its resolution publishes and scans them exactly once. This event transfer is lossless; remaining damage is not.
3. Degraded parts are logged as `session.legacy_shape` with `lowered.*_dropped`: deferred `pendingTriggers` (including `DAMAGE_DEALT` and `LIFE_COUNT_BECOMES_ZERO` watchers) **have not fired in 5b and never fire after rollback**; the parent chain of an effect `TRIGGER_WINDOW` loses its suffix and retained events; remaining effect damage at `TRIGGER_EFFECT` is abandoned (OPT-926); the outer of two open effect windows is lost because v2 has one slot; an orphan battle window is dropped. A transient batch without a surviving frame to carry its rider is classified `lowered.replacement_batch_dropped`. Retained effect events without any surviving carrier are classified `lowered.effect_damage_events_dropped` (if a parent survives, it carries them).
4. Two open Trigger windows retain both v2 records but **deadlock after rollback (OPT-974)**. The coordinator expects the effect player, while `executeRevealTrigger` consumes the battle window first. Routing to the effect player incorrectly applies their choice to the defender's card, and leaves the effect continuation stranded in the captured nested state (the simpler golden can complete, but in the wrong window order); routing to the battle defender rejects both players' replies. The fallback prompt is rebuilt from the battle defender's own Life card, preventing the information leak. The state remains classified `legacy.two_trigger_windows`; this reader does not fix the v2 engine.
5. At effect `TRIGGER_WINDOW`, `remainingDamages` itself lowers losslessly, but the v2 reply subsequently abandons remaining points (OPT-926). A synthetic End Phase parked below such a pipeline-routed reveal can remain parked without a prompt in v2; fixture execution pins this limitation rather than claiming it drains.

Writer goldens remain byte-identical (`opt-940-writer-golden.test.ts`). `opt-963-v3-reader.test.ts` covers live/undo lowering, ownership, rejections and 5b-written nested batch/event resumes. `opt-963-fix-round.test.ts` drives every synthetic lowering fixture through this build's coordinator/lifecycle, explicitly pinning the OPT-974 and parked End Phase limitations. Fixtures include synthetic lifted goldens and `opt-963-5b-written-states.json`, captured from 5b `8823ad05` by the independent review. The lifter is a structural aid, not evidence that every possible 5b state resumes losslessly.

### 1.8 Writer policy for PR 5b (OPT-963)

PR 5b writes version 3. The runtime shape is version 3 (`RUNTIME_GAME_STATE_SCHEMA_VERSION = 3`): the engine executes the four typed continuation frames and the version 2 records (`turn.pendingTriggerFromEffect`, `turn.pendingBattleDamageContinuation`, `turn.battle.pendingTriggerLifeCard`, frame `replacementBatchContinuation`, the object `REPLACEMENT` / `REPLACEMENT_BATCH` prompt contexts) no longer exist in the runtime types or the strict schema. `convertFromV2` lifts every version 2 record into its frame, live and undo, through the one hook (§8.3); a version 3 object that still carries one of the retired records is rejected by the strict schema, and one carrying an executable replacement prompt context is rejected by name (`validateContinuationReferences`). `toPersistedGameState` puts `schemaVersion: 3` first on the live state and on every undo snapshot and writes the frames as they are; the End Phase stage rules of §1.6 are unchanged. The writer golden is `opt-963-writer-golden.synthetic.json` (re-captured with `node --import tsx scripts/capture-writer-golden.ts`); `opt-940-writer-golden.test.ts` pins that every case outside the six frame cases is the version 2 bytes plus the version key, and that the six frame cases hold frames and none of the retired records. The version 1 and version 2 goldens stay frozen as reader input. Rollback target after PR 5b deploys: the PR 5a merge commit (pending 5a merge; the coordinator fills the SHA), the oldest build that reads version 3 (by lowering, §1.7 as amended by the 5a fix round: batch rider on the top surviving frame, effect `TRIGGER_EFFECT` events re-homed, nested windows lowered leak-free, the three unwritten shapes rejected). This build rejects the same three shapes (§2.4). The PR 4a and 4b builds are no longer rollback targets once a version 3 writer has run (§5.1).

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
| `pendingPrompt.resumeContext` as a string | A frame on `effectStack` with that `id`. Every resolver site that writes a string writes the frame it just pushed (`resolver.ts`, `cost/prompts.ts`, `resume-core.ts`, `trigger-ordering.ts`, `resume/batch.ts`); the prompt lifecycle resumes the top frame. The reader requires existence, not top position, so a nested frame pushed above the prompt owner is not rejected. | No frame has that id (including an empty stack). |
| `pendingPrompt.resumeContext` as a string naming a `PHASE_BOUNDARY` frame | Never valid: the phase-boundary frame is always parked **below** its prompt frame. | The referenced frame's kind is `PHASE_BOUNDARY`. |
| `effectStack[*].id` | Unique within the stack. | Two frames share an id. |
| `effectStack[i].triggerOrderingGroup.resolvedTriggerIds[*]` | An `orderingId` of a trigger in `triggerOrderingGroup.triggers`. | Any id not in the group. |
| `effectStack[i].phaseBoundaryContinuation` | `turn.phase === "END"` and `endingPlayerIndex === turn.activePlayerIndex`; from PR 4a, a stage whose entries and fields agree with §6.2. | Either disagrees, or a §6.2 stage rule fails (the error names the stage and the entry index). Evidence that no engine path writes otherwise: the only writer is `parkEndPhaseBelowPrompt` (`phases.ts:259-290`), reached from `runEndPhase` right after `phase` is set to `END` (`phases.ts:162-164`) with `pi = getActivePlayerIndex(state)` taken at `phases.ts:55`; `activePlayerIndex` changes only in `completeTurnHandoff`, which runs after the parked frame is drained. Rung 3 walk plus the full-suite probe in the PR body (0 rejections of pipeline-produced states). |
| `pendingPrompt.resumeContext` naming a version 3 frame (from PR 5a, §8) | A `REVEAL_TRIGGER` prompt names a `BATTLE_DAMAGE` or `EFFECT_DAMAGE` frame at `AWAITING_TRIGGER_REVEAL`; an `OPTIONAL_EFFECT` prompt naming a `REPLACEMENT` / `REPLACEMENT_BATCH` frame finds it at `AWAITING_OPTIONAL_RESPONSE`; a `REPLACEMENT` frame is the top frame. | Any other pairing (a `REVEAL_TRIGGER` naming a non-damage frame, a damage frame owning another prompt type or at another phase, a replacement frame owning a non-offer prompt, a `REPLACEMENT` frame below another frame, or one no prompt names). |
| `effectStack[i].effectDamage.parentFrameId` (from PR 5a, §8) | `effectStack[i-1].id`, a `TRIGGER_DRAIN` frame with `pausedAction.type === "DEAL_DAMAGE"` (the chain the damage paused). | The id is not the frame directly below, or that frame is not a chain paused on `DEAL_DAMAGE`. |
| `effectStack[i]` carrying two continuation families (from PR 5a) | Exactly one of `replacement`, `replacementBatch`, `battleDamage`, `effectDamage`, `phaseBoundaryContinuation`. | Two or more present. |
| `effectStack[i].phase === "AWAITING_TRIGGER_REVEAL"` (from PR 5a fix round 1) | A `BATTLE_DAMAGE` or `EFFECT_DAMAGE` frame at `TRIGGER_WINDOW` (the only writers: `engine/damage-frames.ts`, `engine/effect-damage.ts`). | Any other kind at that phase (0 of 286 engine-written states). |
| A `REPLACEMENT_BATCH` frame at `AWAITING_OPTIONAL_RESPONSE` (from PR 5a fix round 1) | Named by `pendingPrompt.resumeContext`: the offer frame and its prompt are one step (`engine/replacements.ts` `stepBatch`). | No prompt names it (0 of 286 engine-written states). |
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

**Supported input versions in this build: `{1, 2, 3}`.** Version 1 is the shape at `origin/main` `03071b6914c36349d0e81930a6f80bb530c713d9`, the base of PR 1. Version 2 adds the End Phase stage (§6) and is read from PR 4a (OPT-980). Version 3 adds the typed replacement and damage continuation frames (§8) and is read from PR 5a (OPT-963).

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

---

## 4. Legacy shape dispositions (OPT-940 list and rev4 §10)

"Live and undo" below means the same rule applies to `session.state` and to each `session:undo-history[i]`, through the same conversion call.

| Shape | How the reader recognizes it | Disposition in PR 1 | Owner of the next change | Fixture |
|---|---|---|---|---|
| **Stage-less `PhaseBoundaryContinuation`** (End Phase parked below a prompt; may hold a currently suspended scheduled action plus a nonempty `remainingScheduledActions`). | A version 1 frame with `phaseBoundaryContinuation.kind === "END_PHASE"` and no `stage` field; after conversion, `stage === "LEGACY_SCHEDULED_ACTIONS"`. | **Lossless conversion, legacy semantics preserved.** v1 has no stage. Its meaning is fixed: *end-of-turn expiry has already run, the normal end-turn effect waves never ran, the scheduled-action list is partially drained, hand-off has not happened.* From PR 4a the v1 → v2 converter gives the frame `stage: "LEGACY_SCHEDULED_ACTIONS"` and changes nothing else (live and every undo snapshot, same hook). The reader validates `endingPlayerIndex === turn.activePlayerIndex`, `turn.phase === "END"`, and the §6.2 legacy rules; `resumePhaseBoundary` continues the remaining scheduled actions and hands off exactly as the base build does (rung 4, PR 4a body), with one scoped difference from PR 4b on: when a Leader carries OP15-022's `DELAYED_LOSS` and the deck-zero flag is set, the end-of-turn checkpoint now runs before the hand-off (OP15-022 text), so the game can end where the base build handed off (`opt-940-legacy-shapes.test.ts`, "pending OP15-022 Brook delayed loss"). Without a `DELAYED_LOSS` Leader the legacy resume is identical to base. Nothing is replayed, no wave is started, no expiry is invented. Classified `legacy.stage_less_phase_boundary`. | OPT-924 (PR 4b) keeps the legacy stage's resume path as the version 1 resume path (identical to base without a `DELAYED_LOSS` Leader). | `opt-940-legacy-shapes.test.ts`, `opt-980-end-phase-stage-reader.test.ts` (synthetic) |
| **Structural `ResumeContext`** (object with `effectSourceInstanceId`, `remainingActions`, `resultRefs`, `validTargets` on `pendingPrompt.resumeContext`, with an empty effect stack). | `isResumeContext` shape; `hasValidPrompt` already checks its fields. | **Supported as-is.** `resumeEffectChain` still executes it. The reader validates it (actions known, refs well-formed) and classifies it `legacy.structural_resume_context`. | OPT-943 (PR 7, OPT-965) legacy retirement sweep. Retirement requires a captured-session inventory showing none in flight, or a converter to a frame. | `opt-940-legacy-shapes.test.ts` |
| **Legacy cost-transaction frame** (`isLegacyCostTransactionFrame`: `costTransactionState` absent while `currentCostIndex > 0`, or `accumulatedEvents` nonempty, or any `costResultRefs` count > 0). | Same predicate as `resume/cost.ts`. | **Supported as-is.** Earlier costs were committed to the root before OPT-614 and cannot be reconstructed; abandon publishes retained events instead of rolling back. The reader classifies it `legacy.cost_transaction_frame` and loads it unchanged. | OPT-943 (PR 7). | `opt-940-legacy-shapes.test.ts` |
| **Orphan or incompatible frame references** (string `resumeContext` naming no frame on the stack or a `PHASE_BOUNDARY` frame; duplicate frame ids; `resolvedTriggerIds` outside the group; explicit `kind` that disagrees with content; a parked End Phase whose `endingPlayerIndex` or `turn.phase` disagrees with the turn). A string naming any existing non-boundary frame is accepted, top or not (§2.4). | §2.4 table. | **Rejected.** The base build accepted any string; this build rejects with the reference name. The game is not loadable and the operator follows the runbook (§5). | None; this is the permanent policy. | `opt-940-reference-integrity.test.ts` |
| **Stuck `DAMAGE_STEP` (OPT-884)**: `turn.battleSubPhase === "DAMAGE_STEP"` with a `pendingBattleDamageContinuation` of stage `CHARACTER_KO_REPLACEMENT` whose `resolution` is undefined, no `pendingPrompt`, an empty effect stack, and the continuation's `targetInstanceId` no longer on the field. | The predicate just stated. | **Loaded as-is and classified `legacy.stuck_damage_step`.** The state is structurally valid and today's engine already holds it; converting a stuck game into a load error would turn a paused game into an unreachable one. The orphan-continuation variants (`battle` null, `battleId` mismatch, wrong sub-phase) load too, classified `legacy.orphan_battle_continuation` (§2.4). | OPT-884 (PR 7, OPT-965) chooses the recovery policy (end the battle, or reject with repair). Its converter runs through this hook. | `opt-940-legacy-shapes.test.ts` |
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
* The strict base build is **never** a rollback target once a version-2 writer has run in production; the PR 4a / 4b builds are never rollback targets once a version-3 writer has run (PR 5b). The PR 5a merge commit is the oldest build that reads version 3 (by lowering to version 2 semantics, §1.7: a degraded but loadable resume for games paused inside a Trigger window or a replacement offer at the moment of rollback, every other state lossless).

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
* **PR 5b** (this build): `convertFromV2` lifts, live and undo: `pendingTriggerLifeCard` and `pendingBattleDamageContinuation` become one `BATTLE_DAMAGE` frame and `pendingTriggerFromEffect` an `EFFECT_DAMAGE` frame, inserted at the bottom of the stack in the order they opened (version 2 surfaced them only once the stack emptied); a replacement prompt context becomes a frame on top owning the prompt; a frame's `replacementBatchContinuation` becomes a `REPLACEMENT_BATCH` frame at `INTERRUPTED_BY_TRIGGERS` directly below it. With both windows open the prompt is re-pointed at the top (effect) frame's responder: `both-trigger-windows` is **recovered**, not rejected. `legacy.stuck_damage_step` and `legacy.orphan_battle_continuation` read the lifted frame (OPT-884's evidence kept); `legacy.two_trigger_windows` is retired by the lift.
