# Game Engine Audit — Consolidated Luna Max + Terra Max Review

**Audit date:** 2026-07-11
**Scope:** `workers/game`, shared game types, authored effect schemas, engine documentation, and the Game Engine Correctness Linear project
**Disposition:** Conditionally sound beta; not correctness-closure-ready
**Linear parent:** [OPT-466 — Game engine audit hardening and correctness closure](https://linear.app/optcg-sim/issue/OPT-466/game-engine-audit-hardening-and-correctness-closure)

## Executive Summary

The two independent audits agree on the important conclusion: this is a strong beta / mature prototype with substantial rules coverage, not a rewrite candidate, but several documented engine contracts are not yet enforced strongly enough to certify it as a production rules platform.

The current branch has a healthy core: 126 worker test files and 1,410 passing tests, strict worker and root type checks, a passing production build, a passing Wrangler dry-run, an explicit seven-stage pipeline, and good coverage in battle, pipeline, and resolver code. The resolver also has a boot-time ActionType/handler drift guard, and GameSession contains meaningful defenses for authentication, reconnects, prompt identity, stale responses, visibility filtering, rate limits, persistence, and timeouts.

The audit nevertheless confirms two immediate correctness/security defects and six other high-severity contract gaps:

1. `LIFE_SCRIED` exposes face-down Life identities to the opponent through the event log.
2. Effect-stack exhaustion silently drops the next frame and permits partially resolved state to continue.
3. Three named card schemas disagree with official card sources.
4. Six live action handlers have no execution coverage despite 128 authored uses.
5. Schema validation is not a trustworthy release gate and malformed schemas are still injected at runtime.
6. `AND` is documented as simultaneous but implemented as `THEN` across 211 authored occurrences.
7. Trigger/resume processing mutates event objects held inside immutable game snapshots.
8. Zone-transition identity rules are only partially centralized.

The remaining findings concern deferred playable cards, deterministic replay, type safety, unbounded persistence growth, documentation drift, and concentration of responsibilities in `GameSession.ts`. OPT-478 replaced resolver module-global dispatch and decomposed cost handling behind stable contracts.

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

## Reproduced Baseline

| Check                     |                     Current result | Interpretation                                               |
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

## Consolidated Findings

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

### GE-10 — Twenty card effects remain deferred

**Severity:** Medium
**Status:** Confirmed
**Linear:** [OPT-475](https://linear.app/optcg-sim/issue/OPT-475/implement-the-19-deferred-conditional-reveal-card-effects-or-exclude) and [OPT-476](https://linear.app/optcg-sim/issue/OPT-476/execute-op13-079-start_of_game_effect-in-the-pregame-state-machine)

`DEFERRED-CARD-EFFECTS.md` currently identifies 19 conditional-reveal effects plus OP13-079's start-of-game effect. The OP13-079 schema is authored, but `pregame.ts:84-90` intentionally treats `START_OF_GAME_FX` as a pass-through. Until implemented, these cards must either be rejected from playable formats or clearly marked partial; silently loading a partial card is a correctness failure.

### GE-11 — Modularity has correctness-sensitive pressure points

**Severity:** Medium
**Status:** Partially resolved — OPT-478 complete; OPT-479 remains
**Linear:** [OPT-478](https://linear.app/optcg-sim/issue/OPT-478/replace-resolver-module-global-dispatch-and-decompose-the-1831-line) and [OPT-479](https://linear.app/optcg-sim/issue/OPT-479/decompose-gamesession-transport-authorization-orchestration-visibility)

- OPT-478 reduced `cost-handler.ts` to a stable façade and split payability, target selection, prompting, payment mutation, and resume preparation into six acyclic modules guarded by architecture tests.
- Resolver/replacement integration now requires an immutable, typed runtime service bundle; replacement execution has no nullable dispatcher or terminal fallback.
- `GameSession.ts` is 1,774 lines and combines transport, authorization, rate limits, prompt orchestration, engine lifecycle, visibility, undo, persistence, and reconnect/timeout behavior.

GameSession's defensive controls remain a strength, but its concentration still gives future correctness changes a large blast radius. OPT-479 owns that remaining decomposition. Persisted deterministic data stays in `GameState.executionContext`; executable dependencies remain outside state in resolver services.

### GE-12 — Runtime type boundaries are weak in critical paths

**Severity:** Medium
**Status:** Confirmed; current count differs slightly from the original audit
**Linear:** [OPT-480](https://linear.app/optcg-sim/issue/OPT-480/tighten-engine-runtime-types-and-remove-the-duplicate-unused-target)

The current engine + GameSession paths contain 83 `as any` casts and 84 `unknown` occurrences. Some are reasonable at external boundaries, but action parameters, runtime prohibitions/effects, target filters, stored state, and dispatcher internals also rely on them. The duplicate `resolveTargetInstances` implementation at `target-resolver.ts:591-805` has no call sites and duplicates the active `computeAllValidTargets` surface.

Boundary data should be validated once, with exhaustive discriminated unions inside the engine. The unused resolver should be removed.

### GE-13 — Persistence and history grow without an explicit bound

**Severity:** Medium
**Status:** Confirmed as a scalability risk
**Linear:** [OPT-481](https://linear.app/optcg-sim/issue/OPT-481/bound-event-log-undo-history-and-durable-object-persistence-growth)

Every event appends to `GameState.eventLog` (`events.ts:39`). `GameSession.persist` writes full state, card DB, and undo history on each persistence cycle (`GameSession.ts:1479-1497`). No cap, checkpoint/compaction scheme, or storage-size budget is evident.

The risk is not demonstrated data loss today; it is unbounded serialization and Durable Object storage growth over long games. Retention, replay, diagnostics, and undo requirements need an explicit bounded design.

### GE-14 — Rules and schema documentation are stale

**Severity:** Low
**Status:** Confirmed, but one reported count is stale
**Linear:** [OPT-482](https://linear.app/optcg-sim/issue/OPT-482/reconcile-rules-schema-and-architecture-docs-to-executable-engine)

`RULES-TO-ENGINE-MAP.md` still marks first/second choice, player-selected Character overflow, and mid-battle abort behavior as gaps/partials even though current code and tests implement them. Architecture documents promise immutable deterministic snapshots more strongly than the implementation warrants.

The Luna report said the schema README was missing nine current action types. A current ActionType-to-README comparison finds one missing catalog entry: `ADD_TO_LIFE`. The finding is still valid as documentation drift, but the count of nine is stale.

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
- Current first/second choice, player-selected overflow, and mid-battle abort behavior are stronger than the stale rules map suggests.
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

The engine can be considered correctness-closure-ready when:

1. Every urgent/high issue above is complete with pipeline-level regressions.
2. No hidden-zone identity reaches an unauthorized state, event, or prompt view.
3. Stack/loop/schema/dispatch failures are typed, atomic, and fail closed.
4. Every authored action type is handled, semantically validated, and executed in tests.
5. `AND`, event immutability, and zone identity have explicit executable contracts.
6. Deferred cards are complete or rejected from playable formats.
7. A recorded game replays exactly under a recorded execution context.
8. Persistence has a measured bound for a maximum-length legal game.
9. Rules and schema documentation are generated from or linked directly to executable evidence.

Until those criteria are met, the appropriate release description is **healthy core, conditionally sound, not rules-platform closure-ready**.
