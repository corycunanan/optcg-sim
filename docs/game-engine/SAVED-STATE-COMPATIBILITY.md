# Saved-State Compatibility — Game-State Schema Version, Frame Kinds, Support Window, Rollback Runbook

> Written before the reader code for OPT-940 (PR 1 of the Game Engine Consolidation, parent OPT-959). This is the contract every later consolidation PR writes through. Code of record: `workers/game/src/session/game-state-schema.ts` (version dispatch and conversion), `workers/game/src/session/persisted-game-state.ts` (strict shape), `workers/game/src/session/persistence.ts` (storage boundary).

**Status:** Contract in force from PR 1. Writers are unchanged in PR 1; the reader assigns version 1 to every save that exists today.

**Related:** [Rev 4 proposal snapshot §7, §10](./audits/consolidation-2026-10/proposal-rev4-snapshot.md) · [Handoff doc](../project/handoffs/game-engine-consolidation.md) · [Doc 08](./08-ENGINE-ARCHITECTURE.md)

---

## 1. Three versions, three meanings

| Version | Where | Meaning | Who bumps it |
|---|---|---|---|
| `SESSION_STORAGE_FORMAT_VERSION` (`persistence.ts`, currently `2`) | `session.formatVersion` | How the Durable Object splits one session across storage keys (`session`, `session:card-db`, `session:undo-history`) and which envelope fields exist. Says nothing about the shape of a game state. | Storage layout changes only. |
| `executionContext.version` (`execution-context.ts`, currently `1`) | `state.executionContext.version` | The RNG, id-allocation, clock and budget algorithm. Replays are byte-equivalent only under the same context version. | RNG or id-allocation algorithm changes only. |
| **`GAME_STATE_SCHEMA_VERSION`** (`game-state-schema.ts`, **`1`** from PR 1) | `schemaVersion` key on each persisted game-state object: the live `session.state` and every entry of `session:undo-history` | The shape and semantics of `GameState` itself: turn, battle, effect-stack frames, prompt continuations, phase boundaries, pending damage records. This is the version every consolidation ticket bumps when it adds or changes a persisted shape. | Any PR that adds a persisted field whose meaning a prior reader cannot understand. |

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
| `PHASE_BOUNDARY` | End Phase work parked below a scheduled effect's prompt frame. | `phaseBoundaryContinuation` present (takes precedence over `phase`). | `phase === "INTERRUPTED_BY_TRIGGERS"`; no `batchResumeMarker`, no `triggerOrderingGroup`, empty `costs` (as `parkEndPhaseBelowPrompt` builds it); `phaseBoundaryContinuation.kind === "END_PHASE"`; `turn.phase === "END"`; `endingPlayerIndex === turn.activePlayerIndex` |

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
| `effectStack[i].phaseBoundaryContinuation` | `turn.phase === "END"` and `endingPlayerIndex === turn.activePlayerIndex`. | Either disagrees. Evidence that no engine path writes otherwise: the only writer is `parkEndPhaseBelowPrompt` (`phases.ts:259-290`), reached from `runEndPhase` right after `phase` is set to `END` (`phases.ts:162-164`) with `pi` = the acting player of `ADVANCE_PHASE`, which validation restricts to the active player; `activePlayerIndex` changes only in `completeTurnHandoff`, which runs after the parked frame is drained. Rung 3 walk plus the full-suite probe in the PR body (0 rejections of pipeline-produced states). |

Battle-record coherence is **classified, not rejected**. Review finding A on PR #746 showed (rung 4, `opt-940-synthetic-states.ts` `bothTriggerWindows`) that the engine writes `turn.pendingTriggerFromEffect` and `turn.battle.pendingTriggerLifeCard` together: damage-time auto effects resolve before the coordinator surfaces the battle Trigger, and one of them can deal effect damage that parks a second Trigger. A reader that rejects a real save is worse than one that accepts a loose one, so every check in this family is a logged `session.legacy_shape` and the state loads unchanged:

| Record | Classification | Why not rejected |
|---|---|---|
| `pendingTriggerFromEffect` and `battle.pendingTriggerLifeCard` both set | `legacy.two_trigger_windows` | The engine writes it (above); `surfaceRevealTrigger` (`coordinator.ts:311`) and `battle.ts:423` serve the battle window first, then the effect window. |
| `pendingBattleDamageContinuation` with `turn.battle` null, a different `battleId`, or `battleSubPhase !== "DAMAGE_STEP"` | `legacy.orphan_battle_continuation` | No rung-4 proof that no path persists it, and the engine already treats it defensively: `resumeBattleDamageContinuation` clears the continuation and continues when the battle is missing or differs (`battle.ts:1093-1101`). OPT-884 owns the recovery policy. |
| `battle.pendingTriggerLifeCard` with `battleSubPhase !== "DAMAGE_STEP"` | `legacy.trigger_window_outside_damage_step` | No rung-4 proof that no path persists it; `executeRevealTrigger` consumes the window regardless of sub-phase. |

The error names the reference (`pendingPrompt.resumeContext`, `effectStack[2].triggerOrderingGroup.resolvedTriggerIds[0]`, …) so an operator can locate it in the stored JSON.

---

## 3. Support window

**Supported input versions in this build: `{1}`.** Version 1 is the shape at `origin/main` `03071b6914c36349d0e81930a6f80bb530c713d9`, the base of PR 1.

Policy, not a date:

1. A reader for version N+1 keeps reading version N. Retiring a reader for version N requires (a) a recorded disposition for every v-N live and undo shape (lossless conversion, recovery path, or rejection, all with fixtures), (b) the project owner's decision recorded in this file's §3 history, and (c) at least one deployed release in which no writer emits version N. There is no automatic retention deadline; "no in-flight games can still hold it" is demonstrated, not assumed.
2. Within a supported version, every legacy shape listed in §4 keeps its disposition until the owning ticket changes it.
3. `UNDO_HISTORY_LIMIT` is 1 (`history.ts`), so a session holds at most one undo snapshot. That snapshot can be one version older than the live state after a reader-capable deploy. The reader must therefore support at least the two most recent versions at every deploy that enables a new writer.

History:

| Date | Change | Supported set |
|---|---|---|
| 2026-10-12 (PR 1) | Version 1 defined; assigned to all legacy saves. | `{1}` |

---

## 4. Legacy shape dispositions (OPT-940 list and rev4 §10)

"Live and undo" below means the same rule applies to `session.state` and to each `session:undo-history[i]`, through the same conversion call.

| Shape | How the reader recognizes it | Disposition in PR 1 | Owner of the next change | Fixture |
|---|---|---|---|---|
| **Stage-less `PhaseBoundaryContinuation`** (End Phase parked below a prompt; may hold a currently suspended scheduled action plus a nonempty `remainingScheduledActions`). | Frame with `phaseBoundaryContinuation.kind === "END_PHASE"` and no `stage` field. | **Lossless conversion, legacy semantics preserved.** v1 has no stage. Its meaning is fixed: *end-of-turn expiry has already run, the normal end-turn effect waves never ran, the scheduled-action list is partially drained, hand-off has not happened.* The reader validates `endingPlayerIndex === turn.activePlayerIndex` and `turn.phase === "END"`, then loads it unchanged; `resumePhaseBoundary` continues the remaining scheduled actions and hands off exactly as the base build does. Nothing is replayed, no wave is started, no expiry is invented. | OPT-924 (PR 4, OPT-962) adds `stage`. Its converter must map a stage-less frame to a dedicated legacy stage (name it `LEGACY_SCHEDULED_ACTIONS` or equivalent) that resumes at "continue remaining scheduled actions, then hand off" and never to the first stage of the new End Phase. If OPT-924's new order needs information the v1 frame erased (which wave an action belonged to), the legacy stage keeps the v1 order for that frame only. | `opt-940-legacy-shapes.test.ts` (synthetic, produced by the real engine at base) |
| **Structural `ResumeContext`** (object with `effectSourceInstanceId`, `remainingActions`, `resultRefs`, `validTargets` on `pendingPrompt.resumeContext`, with an empty effect stack). | `isResumeContext` shape; `hasValidPrompt` already checks its fields. | **Supported as-is.** `resumeEffectChain` still executes it. The reader validates it (actions known, refs well-formed) and classifies it `legacy.structural_resume_context`. | OPT-943 (PR 7, OPT-965) legacy retirement sweep. Retirement requires a captured-session inventory showing none in flight, or a converter to a frame. | `opt-940-legacy-shapes.test.ts` |
| **Legacy cost-transaction frame** (`isLegacyCostTransactionFrame`: `costTransactionState` absent while `currentCostIndex > 0`, or `accumulatedEvents` nonempty, or any `costResultRefs` count > 0). | Same predicate as `resume/cost.ts`. | **Supported as-is.** Earlier costs were committed to the root before OPT-614 and cannot be reconstructed; abandon publishes retained events instead of rolling back. The reader classifies it `legacy.cost_transaction_frame` and loads it unchanged. | OPT-943 (PR 7). | `opt-940-legacy-shapes.test.ts` |
| **Orphan or incompatible frame references** (string `resumeContext` naming no frame on the stack or a `PHASE_BOUNDARY` frame; duplicate frame ids; `resolvedTriggerIds` outside the group; explicit `kind` that disagrees with content; a parked End Phase whose `endingPlayerIndex` or `turn.phase` disagrees with the turn). A string naming any existing non-boundary frame is accepted, top or not (§2.4). | §2.4 table. | **Rejected.** The base build accepted any string; this build rejects with the reference name. The game is not loadable and the operator follows the runbook (§5). | None; this is the permanent policy. | `opt-940-reference-integrity.test.ts` |
| **Stuck `DAMAGE_STEP` (OPT-884)**: `turn.battleSubPhase === "DAMAGE_STEP"` with a `pendingBattleDamageContinuation` of stage `CHARACTER_KO_REPLACEMENT` whose `resolution` is undefined, no `pendingPrompt`, an empty effect stack, and the continuation's `targetInstanceId` no longer on the field. | The predicate just stated. | **Loaded as-is and classified `legacy.stuck_damage_step`.** The state is structurally valid and today's engine already holds it; converting a stuck game into a load error would turn a paused game into an unreachable one. The orphan-continuation variants (`battle` null, `battleId` mismatch, wrong sub-phase) load too, classified `legacy.orphan_battle_continuation` (§2.4). | OPT-884 (PR 7, OPT-965) chooses the recovery policy (end the battle, or reject with repair). Its converter runs through this hook. | `opt-940-legacy-shapes.test.ts` |
| **Pending damage, replacement and event-activation records whose ownership moves in Phase 1** (`turn.pendingTriggerFromEffect`, `turn.battle.pendingTriggerLifeCard`, `turn.pendingBattleDamageContinuation`, `REPLACEMENT` and `REPLACEMENT_BATCH` resume contexts, `pendingEventActivationEvents`, frame `replacementBatchContinuation`). | Existing strict schema. | **Supported as-is** under version 1; both Trigger windows open at once is a real engine state and loads (`legacy.two_trigger_windows`). | OPT-941/OPT-926 (PR 5, OPT-963) and OPT-937/OPT-942/OPT-950 (PR 6, OPT-964) move each into typed frames and bump the version; each ships a converter from the v1 record to its frame, through this hook, reader first. | `opt-940-legacy-shapes.test.ts` |


A classification is logged as `session.legacy_shape` with `{ gameId, location, shape, frameId? }` and never changes state.

---

## 5. Rollback, repair, rejection runbook

### 5.1 Rollback target

* **Before any writer emits a shape the base build cannot parse**, the base build (`03071b69`) remains a valid rollback target because this PR writes identical bytes.
* **After PR 1 deploys and is verified**, the PR 1 build is the **reader-capable rollback baseline**. Every later PR that enables a writer for version N must have the version-N reader already deployed and verified live, and must name the oldest build that can read N in its PR body. Rolling back past that build is not a rollback; it is data loss for every in-flight game written at N.
* The strict base build is **never** a rollback target once a version-2 writer has run in production.

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

## 6. End Phase stage: compatibility plan written before the stage exists

OPT-924 (PR 4) will add `stage` to `PhaseBoundaryContinuation` and bump the schema version to 2. This section is the plan that PR must implement; it is written now so the reader side of that PR is not designed under pressure.

* **v1 → v2 converter:** a stage-less frame becomes `stage: "LEGACY_SCHEDULED_ACTIONS"` (final name chosen by OPT-924, meaning fixed here). Semantics: expiry done, waves skipped, resume = drain `remainingScheduledActions` then hand off. The converter does not add a wave, does not re-run expiry, does not reorder actions.
* **Reader for v2 ships in a PR that does not write v2.** That PR is verified live. Only then does the writer PR flip `GAME_STATE_SCHEMA_VERSION` to 2 and start emitting `schemaVersion: 2` and `stage`.
* **Mixed undo:** a v2 live state with a v1 undo snapshot (and the reverse during rollback within the supported set) loads; `opt-940-reader.test.ts` already covers mixed `[absent, 1]` today and OPT-924 extends it to `[1, 2]`.
* **The v1 reader keeps its current meaning for a stage-less frame forever** (§1.1). A later build that drops v1 support follows §3.

---

## 7. Unmet rollout gate: captured sessions

OPT-940 requires sanitized real Durable Object sessions as fixtures. None are available: wrangler is logged out on the coordinator's machine, no Cloudflare token exists, and `GameSession` exposes no export route. Every fixture in PR 1 is **synthetic**: real game states produced by the engine and serialized through the base-commit writer, plus constructed malformed states. None is a capture. The gate stays open until a capture covers live + undo, paused costs, paused replacements, paused damage, and a mid-End-Phase session. The PR body and the handoff entry carry the same statement.
