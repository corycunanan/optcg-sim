# Game Engine Audit — Consolidated Luna Max + Terra Max Review

**Audit date:** 2026-07-11
**Closure review:** 2026-07-14
**Scope:** `workers/game`, shared game types, authored effect schemas, engine documentation, and the Game Engine Correctness Linear project
**Disposition:** Game Engine Correctness scope is closure-ready; documented residual rules-completeness and operational tradeoffs remain
**Linear parent:** [OPT-466 — Game engine audit hardening and correctness closure](https://linear.app/optcg-sim/issue/OPT-466/game-engine-audit-hardening-and-correctness-closure)

## Executive Summary

The two independent audits correctly identified a strong beta / mature prototype
with substantial rules coverage and a set of concrete contracts that still
needed enforcement. The Game Engine Correctness project has now closed every
actionable finding from GE-01 through GE-14 with executable regressions,
fail-closed validation, bounded persistence, and reconciled documentation.

Closure means the audited hardening scope is ready: hidden views are
viewer-scoped, engine-limit failures are atomic draws, disputed schemas match
their sources, every authored action type is handled and executed, simultaneous
chains and zone identity have explicit contracts, recorded-context replay is
byte-equivalent, session responsibilities are decomposed, runtime boundaries
validate unknown data, and durable history is bounded.

It does **not** mean every Comprehensive Rules edge case is implemented. The
remaining risks are explicit below, especially player-stoppable loop semantics,
generic secret-to-secret reveal/order rules, the scoped (not recursively frozen)
snapshot immutability guarantee, and the deliberate one-checkpoint undo/history
retention policy.

## Verification Method

The audit was consolidated and independently checked against the current branch rather than accepting either report at face value.

- Re-read the cited engine, resolver, trigger, visibility, schema, pregame, persistence, and documentation paths.
- Ran the full worker test suite with V8 coverage.
- Ran root and worker TypeScript checks, ESLint, the Next.js production build, and a Wrangler deploy dry-run.
- Ran the semantic schema linter directly with Node.
- Counted authored action and `AND` usage from the current schemas.
- Compared the three disputed card encodings with official Bandai card lists/FAQ.
- Checked the existing Game Engine Correctness project before filing new work, including completed identity work in OPT-453.
- Classified every claim as confirmed, partially confirmed, stale/reconciled, or not reproduced.

## Original Reproduced Baseline — 2026-07-11

This table preserves the measurements that opened the project. It is historical
evidence, not the closure branch's current result.

| Check                     |                       Audit result | Interpretation                                               |
| ------------------------- | ---------------------------------: | ------------------------------------------------------------ |
| Worker tests              |     126 files, 1,410 tests passing | Confirms both audits' test baseline                          |
| All covered worker files  | 74.17% statements, 64.05% branches | Terra's ~74% figure refers to the full coverage set          |
| `src/engine`              | 80.27% statements, 70.44% branches | Luna's 80.3% / 70.4% figure refers to the engine group       |
| Battle                    |                  94.35% statements | Strong core-mechanic coverage                                |
| Pipeline                  |                  89.32% statements | Strong primary mutation-path coverage                        |
| Resolver                  |                  93.12% statements | Strong dispatcher/chain baseline, excluding action modules   |
| Target resolver           | 46.26% statements, 38.81% branches | Material weak spot                                           |
| Effect action module      |  14.03% statements, 9.25% branches | Confirms the uncovered-handler risk                          |
| Root + worker type checks |                               Pass | Strict TypeScript currently compiles                         |
| ESLint                    |             Pass with 369 warnings | No errors; warnings include correctness-critical `any` usage |
| Production build          |                               Pass | App build is healthy                                         |
| Wrangler deploy dry-run   |                               Pass | Worker bundles successfully                                  |
| Semantic schema lint      |     Fail: 3 errors across 53 files | Not release-ready                                            |
| Coverage thresholds       |                    None configured | Coverage can regress without failing CI                      |

The mixed Vitest 4.1.1 / coverage-v8 4.1.4 versions emit a warning during coverage. It did not prevent the run, but aligning versions should accompany coverage-gate work.

The Wrangler dry-run bundled the worker and exited successfully. It also reported that the sandbox prevented writing its optional debug log under `~/Library/Preferences/.wrangler/logs`; that logging warning did not affect the bundle or dry-run result.

## Closure Evidence — 2026-07-14

| Finding | Final status | Executable / machine-checked evidence |
|---|---|---|
| GE-01 hidden information | Resolved by OPT-470 | [`opt-470-hidden-information-visibility.test.ts`](../../workers/game/src/__tests__/opt-470-hidden-information-visibility.test.ts) classifies secret-bearing events/prompts, enforces viewer-scoped reveals, strips continuations, and replaces stable hidden IDs. |
| GE-02 stack/loop fail-open | Resolved by OPT-467 | [`opt-467-engine-limits.test.ts`](../../workers/game/src/__tests__/opt-467-engine-limits.test.ts) proves sequential-budget and nested-stack exhaustion terminate atomically in a persisted draw. |
| GE-03 disputed schemas | Resolved by OPT-469 | [`opt-469-card-schema-corrections.test.ts`](../../workers/game/src/__tests__/opt-469-card-schema-corrections.test.ts) covers source filters, target behavior, prohibitions, and corrected official text. |
| GE-04 unexecuted handlers | Resolved by OPT-473 | [`opt-473-action-handler-coverage.test.ts`](../../workers/game/src/__tests__/opt-473-action-handler-coverage.test.ts) plus the generated inventory gate report 3,574 authored uses, 73 authored types, 73 handled, and 73 executed. |
| GE-05 schema gate fail-open | Resolved by OPT-471 | [`opt-471-authored-schema-gate.test.ts`](../../workers/game/src/__tests__/opt-471-authored-schema-gate.test.ts) validates 2,319 schemas, source/disposition parity, boot-time failure, and terminal unknown-action handling. |
| GE-06 `AND` semantics | Resolved by OPT-472 | [`opt-472-simultaneous-and.test.ts`](../../workers/game/src/__tests__/opt-472-simultaneous-and.test.ts) locks targets from one snapshot and commits grouped actions without exposing partial prompt state. |
| GE-07 event immutability | Resolved by OPT-468 | [`opt-468-event-immutability.test.ts`](../../workers/game/src/__tests__/opt-468-event-immutability.test.ts) runs trigger scan/resume against deeply frozen input events and snapshots. |
| GE-08 zone identity | Resolved by OPT-474 | [`opt-474-zone-transition-contract.test.ts`](../../workers/game/src/__tests__/opt-474-zone-transition-contract.test.ts) enforces the zone-pair identity/cleanup matrix and guards direct zone-array mutation. |
| GE-09 deterministic replay | Resolved by OPT-477 | [`opt-477-engine-execution-context.test.ts`](../../workers/game/src/__tests__/opt-477-engine-execution-context.test.ts) proves byte-equivalent setup, frames, prompts, IDs, timestamps, shuffles, and JSON-restart resume under the same context. |
| GE-10 deferred cards/start-of-game | Resolved by OPT-475/476 | [`opt-475-conditional-reveal.test.ts`](../../workers/game/src/__tests__/opt-475-conditional-reveal.test.ts), [`opt-476-start-of-game-effects.test.ts`](../../workers/game/src/__tests__/opt-476-start-of-game-effects.test.ts), and [the disposition inventory](DEFERRED-CARD-EFFECTS.md) leave zero tracked deferred cards or playable exclusions. |
| GE-11 architecture pressure | Resolved by OPT-478/479 | [`opt-478-resolver-architecture.test.ts`](../../workers/game/src/__tests__/opt-478-resolver-architecture.test.ts) and [`opt-479-session-boundaries.test.ts`](../../workers/game/src/__tests__/opt-479-session-boundaries.test.ts) enforce dependency direction and collaborator contracts. |
| GE-12 runtime boundaries | Resolved by OPT-480 | [`opt-480-runtime-types.test.ts`](../../workers/game/src/__tests__/opt-480-runtime-types.test.ts) enforces mapped discriminated unions, validated unknown-data boundaries, cast limits, and removal of the duplicate resolver. |
| GE-13 unbounded persistence | Resolved by OPT-481 | [`opt-481-persistence-bounds.test.ts`](../../workers/game/src/__tests__/opt-481-persistence-bounds.test.ts) covers event/anchor compaction, one-checkpoint undo, payload budgets, legacy restore, and atomic failure rollback. |
| GE-14 documentation drift | Resolved by OPT-482 | [`check-doc-drift.sh`](../../workers/game/src/engine/schemas/check-doc-drift.sh), now part of `schema:check`, requires all 76 supported action types and 25 target types exactly once and validates rules-map test links. |
| GE-15 test-change metric | Informational | The unreproducible historical ratio remains excluded from closure evidence. |

The full `pnpm verify` gate passes on the closure branch: lint completes with
zero errors, root and worker type checks pass, `schema:check` produces the
counts above, 615 app tests and 1,612 worker tests pass, worker coverage is
79.05% statements / 69.15% branches, and the Next.js production build succeeds.

## Original Findings and Final Dispositions

The sections below preserve the discovery evidence and original reproduction
language. The closure table above is authoritative for current status.

### GE-01 — Hidden-information leak in Life scry events

**Severity:** Critical
**Status:** Confirmed
**Linear:** [OPT-470](https://linear.app/optcg-sim/issue/OPT-470/prevent-life-scried-and-hidden-zone-event-payloads-from-leaking-card)

`executeLifeScry` publishes real `instanceId` and `cardId` values in `LIFE_SCRIED` (`effect-resolver/actions/life.ts:607-627`). `filterStateForPlayer` only redacts `CARD_DRAWN`, `CARD_RETURNED_TO_HAND`, `CARD_ADDED_TO_HAND_FROM_LIFE`, and `DRAW_OUTSIDE_DRAW_PHASE` (`state.ts:582-638`). Because GameSession broadcasts filtered state containing the event log, an opponent can receive identities from face-down Life.

The fix must be broader than adding one string to `SECRET_CARD_EVENTS`: every event and prompt needs an explicit visibility classification and payload redactor, including correlation-safe handling of hidden instance IDs.

### GE-02 — Effect-stack exhaustion fails open

**Severity:** High
**Status:** Confirmed
**Linear:** [OPT-467](https://linear.app/optcg-sim/issue/OPT-467/make-effect-stack-overflow-and-infinite-loops-terminate-with-a-rules)

`pushFrame` logs at depth 100 and returns the unchanged state (`effect-stack.ts:13-19`). Callers receive no typed rejection and may continue with a pending prompt or partially advanced chain after silently discarding required execution state. The rules map separately records loop handling and the unstoppable-loop outcome as gaps.

The engine needs a typed, terminal, replay-visible outcome and tests proving that no prompt or partial chain survives it.

### GE-03 — Three source-to-schema card discrepancies

**Severity:** High
**Status:** Confirmed against official sources
**Linear:** [OPT-469](https://linear.app/optcg-sim/issue/OPT-469/correct-op03-032-op04-042-and-op06-026-schemas-against-official)

- `OP03-032` currently applies `CANNOT_BE_KO` to every battle source (`op03.ts:1147-1153`). The official card limits protection to Slash-attribute attackers; the engine already supports `scope.source_filter.attribute`. The official card-list text loses the icon in plain-text extraction, but the source-filter form is corroborated by Bandai's attribute rulings and parallel official printings. [Official OP03 card list](https://en.onepiece-cardgame.com/cardlist/?series=569103)
- `OP04-042` is skipped because the local source is truncated (`op04.ts:1460-1462`). The official effect gives one of the player's attribute Characters +3000 power for the turn, then trashes the top card of the deck. [Official OP04 card list](https://en.onepiece-cardgame.com/cardlist/?series=569104)
- `OP06-026` is explicitly marked as a best guess and readies DON!! (`op06.ts:909-929`). The official FAQ says to set up to one Slash Character with cost 4 or less active, then prevent attacks on a Leader for the turn. [Official OP06 FAQ](https://asia-en.onepiece-cardgame.com/pdf/qa_op06.pdf?20240126=)

All three require pipeline-level regression tests, not schema-shape assertions alone.

### GE-04 — Authored handlers are present but not executed by tests

**Severity:** High
**Status:** Confirmed; current authored-use count is 128
**Linear:** [OPT-473](https://linear.app/optcg-sim/issue/OPT-473/execute-and-gate-every-authored-action-handler-including-the-six-zero)

Six functions in `effect-resolver/actions/effects.ts` have zero execution coverage:

| Handler               | Current authored uses |
| --------------------- | --------------------: |
| `APPLY_PROHIBITION`   |                   105 |
| `SCHEDULE_ACTION`     |                    19 |
| `SET_COST` action     |                     1 |
| `WIN_GAME`            |                     1 |
| `NEGATE_TRIGGER_TYPE` |                     1 |
| `EXTRA_TURN`          |                     1 |

Some tests mention `SET_COST`, `SCHEDULE_ACTION`, or `NEGATE_TRIGGER_TYPE`, but those references exercise modifier behavior, lint validation, or downstream prohibition behavior rather than the six action handlers. Green tests therefore do not demonstrate that all affected authored cards work end to end.

The prior audit counted 127 uses; the current schemas contain 128. CI should derive this inventory and require a registered and executed handler for every authored action type.

### GE-05 — Schema QA and runtime dispatch fail open

**Severity:** High
**Status:** Confirmed, with the linter findings reconciled
**Linear:** [OPT-471](https://linear.app/optcg-sim/issue/OPT-471/make-authored-schema-validation-fail-closed-and-mandatory-in-ci)

Running `node workers/game/src/engine/schemas/lint-schemas.sh` reports:

1. `EB02-039`: implicit `__cost_cards_trashed` reference reported as missing — validator drift/false positive because cost results are populated by the resolver.
2. `OP11-022`: the first action carries `chain: "AND"` — a real authored-schema error.
3. `OP15-080`: `TRIGGERING_CARD_IN_TRASH` reported invalid — validator drift/false positive because the runtime supports the source-identity target.

The file is a Node script despite its `.sh` suffix, is not in the normal `verify` path, and uses source-oriented checks that have drifted from runtime semantics. `injectSchemasIntoCardDb` logs validation errors and installs the schema anyway (`schema-registry.ts:144-158`). Unknown action dispatch warns and returns a failed/no-op result (`resolver.ts:563-570`), while missing replacement dispatch can skip the substitute action (`replacements.ts:605-620`).

The authoritative validator should share typed runtime definitions, run in CI, resolve all three current errors, and prevent invalid schemas/dispatch graphs from starting a game.

### GE-06 — `AND` semantics silently degrade to `THEN`

**Severity:** High
**Status:** Confirmed
**Linear:** [OPT-472](https://linear.app/optcg-sim/issue/OPT-472/define-and-implement-true-simultaneous-semantics-for-and-action-chains)

`executeActionChain` states that `AND` is simultaneous but treats it as `THEN` (`resolver.ts:378-386`). The current schemas contain 211 `chain: "AND"` occurrences. Because the first sequential action can change target legality, hidden information, replacement availability, or trigger timing for the second, this is a substantive semantic gap rather than cosmetic syntax.

The work needs a rules-level transaction model and a classification of all 211 authored occurrences; uses that mean ordinary sequencing should be migrated to `THEN`.

### GE-07 — Event processing mutates immutable snapshots

**Severity:** High
**Status:** Confirmed
**Linear:** [OPT-468](https://linear.app/optcg-sim/issue/OPT-468/eliminate-in-place-mutation-of-pending-events-during-trigger-and)

`trigger-ordering.ts:52-84` writes `event.__scannedForTriggers = true`, and `resume/triggers.ts:73-126` writes `event.__alreadyEmitted = true`. Pending events can also be referenced from effect-stack frames held inside `GameState`, so copying the outer state object does not protect older snapshots, undo history, or persisted shared references.

The de-duplication markers should become immutable propagation metadata or processed-event IDs. Deep-frozen nested-trigger and resume tests should enforce the documented snapshot contract.

### GE-08 — Zone identity is not governed by one transition primitive

**Severity:** High
**Status:** Partially confirmed; narrower prior fixes exist
**Linear:** [OPT-474](https://linear.app/optcg-sim/issue/OPT-474/establish-one-authoritative-zone-transition-and-card-identity-contract)

`moveCard` correctly creates a new instance ID, clears attached DON!!, and resets transient state (`state.ts:93-121`). However, Life, draw/search, resume, and cost paths still rebuild zone arrays manually; several preserve old IDs while others allocate new IDs ad hoc. Completed issue [OPT-453](https://linear.app/optcg-sim/issue/OPT-453/deck-placement-costs-bypass-the-canonical-zone-transition-stale) fixed a deck-placement cost subset, so the original audit's examples are not all still present, but the systemic contract remains incomplete.

The remaining work is a zone-pair identity matrix and one transition service that returns old/new identity mapping, cleanup effects, and movement facts, with explicit trigger/source-reference exceptions.

### GE-09 — Exact replay is not deterministic

**Severity:** Medium
**Status:** Fixed by OPT-477
**Linear:** [OPT-477](https://linear.app/optcg-sim/issue/OPT-477/introduce-an-explicit-deterministic-engineexecutioncontext-for-rng-ids)

`GameState.executionContext` now persists seeded RNG state, a monotonic ID allocator, a logical clock, resolver action-budget accounting, and trace metadata. `GameSession` creates the production context from cryptographic entropy once; setup, pregame, the pipeline, battle, triggers, modifiers, zone transitions, effect frames, and resume paths consume and persist it. Regression coverage proves byte-equivalent execution before and after JSON serialization and rejects ambient entropy/time usage outside the adapter.

### GE-10 — Deferred card and start-of-game cohort

**Severity:** Medium
**Status:** Resolved by OPT-475 and OPT-476
**Linear:** [OPT-475](https://linear.app/optcg-sim/issue/OPT-475/implement-the-19-deferred-conditional-reveal-card-effects-or-exclude) and [OPT-476](https://linear.app/optcg-sim/issue/OPT-476/execute-op13-079-start_of_game_effect-in-the-pregame-state-machine)

The original 19-card conditional-reveal count omitted partially encoded
OP08-049; the reconciled cohort is 20. All 20 have complete schemas and
pipeline regressions. OP13-079 now executes in the persisted pregame state
machine in first-player order, including play, decline, zero-match, shuffle,
reconnect, and resume paths. The current disposition inventory has zero tracked
deferred cards and zero playable exclusions.

### GE-11 — Modularity has correctness-sensitive pressure points

**Severity:** Medium
**Status:** Resolved — OPT-478 and OPT-479 complete
**Linear:** [OPT-478](https://linear.app/optcg-sim/issue/OPT-478/replace-resolver-module-global-dispatch-and-decompose-the-1831-line) and [OPT-479](https://linear.app/optcg-sim/issue/OPT-479/decompose-gamesession-transport-authorization-orchestration-visibility)

- OPT-478 reduced `cost-handler.ts` to a stable façade and split payability, target selection, prompting, payment mutation, and resume preparation into six acyclic modules guarded by architecture tests.
- Resolver/replacement integration now requires an immutable, typed runtime service bundle; replacement execution has no nullable dispatcher or terminal fallback.
- `GameSession.ts` is now a sub-1,000-line Durable Object composition root over typed authorization, rate-limit, transport, visibility, persistence, command-coordination, and prompt-lifecycle modules.

The defensive behavior is preserved by collaborator contracts for reconnect authority, stale prompts, alarms, filtered state, storage restoration, and token replay. Persisted deterministic data stays in `GameState.executionContext`; executable dependencies remain outside state in resolver services and session coordinators.

### GE-12 — Runtime type boundaries are weak in critical paths

**Severity:** Medium
**Status:** Resolved by OPT-480
**Linear:** [OPT-480](https://linear.app/optcg-sim/issue/OPT-480/tighten-engine-runtime-types-and-remove-the-duplicate-unused-target)

Actions, events, prompts, persisted state, and session messages now cross
unknown-data boundaries through runtime validation and remain mapped
discriminated unions inside correctness-critical code. Resolver handlers are
exhaustive over exact action variants, intentional boundary assertions are
localized and regression-counted, and the duplicate unused target resolver and
export are removed.

### GE-13 — Persistence and history grow without an explicit bound

**Severity:** Medium
**Status:** Resolved by OPT-481
**Linear:** [OPT-481](https://linear.app/optcg-sim/issue/OPT-481/bound-event-log-undo-history-and-durable-object-persistence-growth)

The current `GameState` is the authoritative restore checkpoint. Persistence
and broadcasts retain 256 recent events plus at most 128 condition-critical
anchors, fold older events into bounded diagnostic counters, keep one safe undo
checkpoint, and store the immutable card DB separately. Approximate payload
budgets warn at 1 MB and reject before mutation at 1.5 MB; legacy restore and
failed writes compact or roll back atomically.

### GE-14 — Rules and schema documentation are stale

**Severity:** Low
**Status:** Resolved by OPT-482
**Linear:** [OPT-482](https://linear.app/optcg-sim/issue/OPT-482/reconcile-rules-schema-and-architecture-docs-to-executable-engine)

The rules map now derives the reconciled first/second, overflow, battle-abort,
loop-limit, start-of-game, and hidden-view statuses from named executable tests.
The schema README catalogs all 76 supported action types and 25 target types
exactly once. Deferred and low-confidence inventories match the fail-closed
playability gates, and architecture prose scopes immutability to copy-on-write
transition contracts and determinism to a recorded execution context.

The prior “nine missing action types” count was stale: the exact catalog defect
was one missing `ADD_TO_LIFE` row plus a duplicated `SET_POWER_TO_ZERO` row.
`check-doc-drift.sh`, now in `schema:check`, verifies exact runtime-catalog
parity and that rules-map executable-test links resolve.

### GE-15 — Test-change discipline metric is not reproducible as stated

**Severity:** Informational
**Status:** Not reproduced under the current definition; no Linear issue needed

Terra reported that 72 of 75 recent engine-changing commits also changed tests. On the current history, the last 75 non-merge commits touching `workers/game/src/engine` yield 69 with worker test changes and 6 without. Including merge commits yields 62/75. The discrepancy may reflect a different audit cutoff or path/filter definition. It does not change the substantive finding that recent development usually includes tests, but the exact 72/75 figure should not be used as closure evidence without a documented query.

## Positive Findings to Preserve

- The seven pipeline stages are separated and readable in `pipeline.ts`.
- Battle, pipeline, and resolver coverage are strong relative to the rest of the engine.
- Resolver boot-time ActionType/handler drift detection is an effective safeguard.
- Cost, prompt, trigger, replacement, battle, and resume concerns are already split into recognizable modules even though two hotspots remain oversized.
- GameSession serializes actions and contains substantial protection for auth, stale/duplicate prompts, reconnects, visibility, rate limiting, persistence, and timeouts.
- The rules map links current first/second choice, player-selected overflow, and mid-battle abort behavior directly to executable regressions.
- Strict root and worker TypeScript checks, the production build, and the worker bundle all pass.

## Project Plan and Linear Sequence

The plan is tracked under [OPT-466](https://linear.app/optcg-sim/issue/OPT-466/game-engine-audit-hardening-and-correctness-closure). Blocker relations in Linear encode the sequence below. Issues within the same wave can proceed in parallel unless a blocker says otherwise.

### Wave 1 — Immediate correctness and information safety

| Order | Issue                                                                                                                      | Priority | Outcome                                                                            |
| ----: | -------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
|   1.1 | [OPT-470](https://linear.app/optcg-sim/issue/OPT-470/prevent-life-scried-and-hidden-zone-event-payloads-from-leaking-card) | Urgent   | Close the confirmed hidden-information leak and classify all secret-bearing events |
|   1.2 | [OPT-467](https://linear.app/optcg-sim/issue/OPT-467/make-effect-stack-overflow-and-infinite-loops-terminate-with-a-rules) | Urgent   | Replace silent frame loss with a terminal rules-visible loop outcome               |
|   1.3 | [OPT-468](https://linear.app/optcg-sim/issue/OPT-468/eliminate-in-place-mutation-of-pending-events-during-trigger-and)     | High     | Restore the immutable snapshot contract for event propagation                      |
|   1.4 | [OPT-469](https://linear.app/optcg-sim/issue/OPT-469/correct-op03-032-op04-042-and-op06-026-schemas-against-official)      | High     | Correct the three confirmed card schemas with pipeline regressions                 |

### Wave 2 — Enforce semantic and verification contracts

| Order | Issue                                                                                                                        | Priority | Blocked by | Outcome                                                                     |
| ----: | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------- |
|   2.1 | [OPT-471](https://linear.app/optcg-sim/issue/OPT-471/make-authored-schema-validation-fail-closed-and-mandatory-in-ci)        | High     | Wave 1     | One authoritative fail-closed schema/handler gate in CI and runtime startup |
|   2.2 | [OPT-473](https://linear.app/optcg-sim/issue/OPT-473/execute-and-gate-every-authored-action-handler-including-the-six-zero)  | High     | OPT-471    | Execute every authored handler and enforce coverage/inventory thresholds    |
|   2.3 | [OPT-472](https://linear.app/optcg-sim/issue/OPT-472/define-and-implement-true-simultaneous-semantics-for-and-action-chains) | High     | OPT-471    | Implement real simultaneous `AND` semantics and classify all 211 uses       |
|   2.4 | [OPT-474](https://linear.app/optcg-sim/issue/OPT-474/establish-one-authoritative-zone-transition-and-card-identity-contract) | High     | OPT-468    | Centralize zone movement and identity cleanup across every zone pair        |

### Wave 3 — Close playable-card gaps

| Order | Issue                                                                                                                      | Priority | Blocked by       | Outcome                                                                      |
| ----: | -------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- | ---------------------------------------------------------------------------- |
|   3.1 | [OPT-475](https://linear.app/optcg-sim/issue/OPT-475/implement-the-19-deferred-conditional-reveal-card-effects-or-exclude) | Medium   | OPT-471, OPT-473 | Implement 19 conditional-reveal effects or reject them from playable formats |
|   3.2 | [OPT-476](https://linear.app/optcg-sim/issue/OPT-476/execute-op13-079-start_of_game_effect-in-the-pregame-state-machine)   | Medium   | OPT-471, OPT-473 | Execute OP13-079 in the persisted pregame state machine                      |

### Wave 4 — Deterministic architecture and operational hardening

| Order | Issue                                                                                                                        | Priority | Blocked by                         | Outcome                                                                |
| ----: | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------- | ---------------------------------------------------------------------- |
|   4.1 | [OPT-477](https://linear.app/optcg-sim/issue/OPT-477/introduce-an-explicit-deterministic-engineexecutioncontext-for-rng-ids) | Medium   | OPT-467, OPT-468, OPT-472, OPT-474 | Explicit RNG/time/ID/action-budget context and exact replay            |
|   4.2 | [OPT-478](https://linear.app/optcg-sim/issue/OPT-478/replace-resolver-module-global-dispatch-and-decompose-the-1831-line)    | Medium   | OPT-471, OPT-477                   | Remove global dispatch and split cost handling behind stable contracts |
|   4.3 | [OPT-479](https://linear.app/optcg-sim/issue/OPT-479/decompose-gamesession-transport-authorization-orchestration-visibility) | Medium   | OPT-477                            | Make GameSession a thin Durable Object composition boundary            |
|   4.4 | [OPT-480](https://linear.app/optcg-sim/issue/OPT-480/tighten-engine-runtime-types-and-remove-the-duplicate-unused-target)    | Medium   | OPT-478, OPT-479                   | Tighten runtime types and remove the dead duplicate resolver           |
|   4.5 | [OPT-481](https://linear.app/optcg-sim/issue/OPT-481/bound-event-log-undo-history-and-durable-object-persistence-growth)     | Medium   | OPT-479                            | Bound persistence/event/undo growth with tested compaction             |
|   4.6 | [OPT-482](https://linear.app/optcg-sim/issue/OPT-482/reconcile-rules-schema-and-architecture-docs-to-executable-engine)      | Low      | Substantive waves                  | Reconcile documentation to executable tests and closure evidence       |

## Closure Criteria

The audited Game Engine Correctness scope is correctness-closure-ready because:

1. Every urgent/high issue above is complete with pipeline-level regressions.
2. No hidden-zone identity reaches an unauthorized state, event, or prompt view.
3. Stack/loop/schema/dispatch failures are typed, atomic, and fail closed.
4. Every authored action type is handled, semantically validated, and executed in tests.
5. `AND`, event immutability, and zone identity have explicit executable contracts.
6. Deferred cards are complete or rejected from playable formats.
7. A recorded game replays exactly under a recorded execution context.
8. Persistence has a measured bound for a maximum-length legal game.
9. Rules and schema documentation are generated from or linked directly to executable evidence.

All nine criteria are satisfied by the closure evidence above. This conclusion
closes the audited hardening project; it does not claim exhaustive
Comprehensive Rules coverage or eliminate the residual risks below.

## Final Residual Risk

1. **Player-stoppable loops remain a rules-completeness gap.** Stack-depth and
   action-budget exhaustion terminate atomically in a draw, but the engine does
   not hash repeated states or ask eligible players to declare loop counts under
   §11-1-1-2/3.
2. **Hidden-zone confidentiality is stronger than generic reveal semantics.**
   Viewer-specific events, prompts, faces, stable IDs, and continuation data are
   protected. A universal secret-to-secret transition contract for required
   reveals and owner-chosen hidden order is still partial.
3. **Snapshot immutability is a transition contract, not a runtime deep freeze.**
   Deep-frozen regressions cover the prior trigger/resume defect, and transition
   APIs use copy-on-write updates. Future paths can still violate the convention
   unless focused tests or broader static enforcement are added.
4. **Determinism is contextual.** Byte-equivalent replay requires the same
   initial state, action/response sequence, and recorded
   `EngineExecutionContext`. Production contexts intentionally start from fresh
   cryptographic entropy.
5. **Bounded history is a deliberate product tradeoff.** The worker retains 256
   recent events, at most 128 live causal anchors, bounded summaries, and one
   undo checkpoint. It does not provide an unbounded user-visible history or
   multi-step undo; long-term archival would be a separate system.
6. **The documentation gate verifies structure, not every prose claim.** Runtime
   action/target catalog parity and executable-test links are machine-checked.
   Rule interpretation and narrative architecture changes still require review
   against executable behavior.

The appropriate release description is **audited correctness-hardening scope
closed, with explicit residual rules-platform gaps**.
