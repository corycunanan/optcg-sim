---
linear-project: Game Engine Correctness
linear-project-url: https://linear.app/optcg-sim/project/game-engine-correctness-c3d337079446
last-updated: 2026-07-12
---

# Game Engine Correctness — Handoff Doc

Correctness fixes for effect resolution, prompt handling, schema validation, costs, and gameplay state transitions.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-423 | Schema validator rejects keyword-only permanent blocks | — | — | Done | [#253](https://github.com/corycunanan/optcg-sim/pull/253) | Restores useful schema-validation signal before the bulk audit. |
| 2 | OPT-447 | Six activate effects omit ACTIVATE_MAIN triggers | — | OPT-423 | Done | [#254](https://github.com/corycunanan/optcg-sim/pull/254) | Newly visible real validation failures; fix while the schema signal context is fresh. |
| 3 | OPT-439 | Rejected SELECT_TARGET drops remaining actions or resumes the wrong frame | — | — | Done | [#255](https://github.com/corycunanan/optcg-sim/pull/255) | Merged 2026-07-10 (`a981358`, reviewed head `fea1188`). Review-driven fixes extended into nested replacement batching and continuation events — see `docs/project/pr-255-workflow-retro.md`. |
| 4 | OPT-427 | Rejected stale choice silently skips the pending effect | — | OPT-439 | Duplicate | — | Verified 2026-07-10: exact scenario re-run through `GameSession.handleAction` passes on main; covered by OPT-438 + OPT-439. Evidence in a Linear comment. |
| 5 | OPT-429 | Chaining selectable costs leaves an orphaned effect-stack frame | — | OPT-439 | Done | [#257](https://github.com/corycunanan/optcg-sim/pull/257) | Merged 2026-07-10 (`740a8fc`, reviewed head `759569c` + docs-only handoff). Symmetric frame retirement + pendingTriggers carry-over. Review re-confirmed OPT-431/OPT-430 as the remaining OP10-026/027 gaps. |
| 6 | OPT-446 | Prompt-guard decline vocabulary and rejected-response error polish | — | OPT-439 | Done | [#258](https://github.com/corycunanan/optcg-sim/pull/258) | Merged 2026-07-10 (`d61f5f5`, reviewed head `ac61c71` + docs). Gate accepts `skip`; replacement paths share the decline predicate; game:error on engine rejections. Delta review surfaced pre-existing OPT-448/OPT-449. |
| 7 | OPT-431 | “This Character” cost can use a different Character | — | OPT-429 | Done | [#261](https://github.com/corycunanan/optcg-sim/pull/261) | Merged 2026-07-10 (`9ef3fb3`). PLACE_SELF_AND_TRASH_TO_DECK compound cost; self half fixed to the source. Review spawned OPT-453/454/455 + OPT-432 scope note. |
| 8 | OPT-430 | Compound cost cannot be reordered | — | OPT-429 | Done | [#261](https://github.com/corycunanan/optcg-sim/pull/261) | Merged 2026-07-10 (`9ef3fb3`). One arrange prompt over the self+trash group (Rule 3-1-7). |
| 9 | OPT-432 | Oars cost can consume its source and play a different copy | — | OPT-431 | Done | [#263](https://github.com/corycunanan/optcg-sim/pull/263) | Merged 2026-07-10 (`9516abb`). Exact trigger identity survives optional cost prompts; source-aware costs enforce `exclude_self`. |
| 10 | OPT-444 | OP10-022 total-character-cost activation predicate | — | — | Done | [#259](https://github.com/corycunanan/optcg-sim/pull/259) | Merged 2026-07-10 (`b7d8ee7`, reviewed heads `46ef531`/`25b8701` + docs). CHARACTER_TOTAL_COST condition on effective *field* cost (getEffectiveFieldCost). Review spawned OPT-450. |
| 11 | OPT-437 | Schema-wide post-colon condition audit | — | OPT-423, OPT-444 | In Review | [#262](https://github.com/corycunanan/optcg-sim/pull/262) | 142 blocks re-encoded onto the new `post_cost_conditions` engine gate (once-after-costs, whole-chain, Rules 8-3-1/4-10-1); lint rule C6; HAND_COUNT ComparativeMetric. Spawned OPT-456/457. |
| 12 | OPT-409 | Remove dead filter code and close controller no-op | — | — | Done | [#260](https://github.com/corycunanan/optcg-sim/pull/260) | Merged 2026-07-10 (`447a0de`, user-approved past the stop condition; residuals in OPT-451/OPT-452). |
| 13 | OPT-448 | Duplicate PASS after prompt resolution advances the battle step | — | — | Done | [#264](https://github.com/corycunanan/optcg-sim/pull/264) | Merged 2026-07-10 (`65f955e`). Prompt-identified actions are rejected after their prompt clears. |
| 14 | OPT-449 | Terminal games still accept prompt responses | — | — | Done | [#267](https://github.com/corycunanan/optcg-sim/pull/267) | Merged 2026-07-10 (`10617c7`). Terminal transitions clear prompt/stack state; action routing and reconnect resend are terminal-guarded. |
| 15 | OPT-450 | On-field cost reads include pending play-time discounts | — | OPT-444 | In Review | [#271](https://github.com/corycunanan/optcg-sim/pull/271) | getEffectiveCostForRead: layers 0-2 in every zone; hand keeps continuous self-reductions; one-time discounts never shift predicate reads (review-hardened for deck/trash). |
| 16 | OPT-451 | Permanent prohibition targets discarded at registration | — | — | In Review | [#268](https://github.com/corycunanan/optcg-sim/pull/268) | RuntimeProhibition carries target+conditions, resolved live at match time; negation gate; OP04-119/OP08-029/OP14-079 schema fixes. Residuals: OPT-458, OPT-459. |
| 17 | OPT-452 | Complete the filter-controller guard (dual_targets, linter walk, prohibition guidance) | — | OPT-451 (item 4 only) | Done | [#265](https://github.com/corycunanan/optcg-sim/pull/265) | Merged 2026-07-10 (`009ada2`). Items 1–3 complete; item 4 remains documented under OPT-451. |
| 18 | OPT-453 | Deck-placement costs bypass the canonical zone transition | — | — | In Review | [#269](https://github.com/corycunanan/optcg-sim/pull/269) | applyCostSelection returns events; fresh instanceId + inline field-exit cleanup (works on resume paths); review fixes: resume trigger scan, snapshot target filters, stage cost.filter. Residuals: OPT-460, OPT-461. |
| 19 | OPT-454 | Four more "this Character" self-costs mis-encoded | — | OPT-453 | In Review | [#270](https://github.com/corycunanan/optcg-sim/pull/270) | PLACE_SELF_TO_DECK auto-pay cost; four cards re-encoded. **Stacked on #269** — merge #269 first. |
| 20 | OPT-455 | ST13-001 cost destination + trash filters read field stats | — | OPT-454 | In Review | [#272](https://github.com/corycunanan/optcg-sim/pull/272) | ADD_OWN_CHARACTER_TO_LIFE cost; non-field power reads = printed; generic cost-selection validation. **Stacked on #270**. Residual: OPT-463. |
| 21 | OPT-456 | Four partial condition encodings deferred from the OPT-437 audit | — | OPT-437 | Done | [#266](https://github.com/corycunanan/optcg-sim/pull/266) | Merged 2026-07-10 (`386af05`). Only OP16-084’s legitimate pre-cost C6 exception remains. |
| 22 | OPT-457 | Migrate the OPT-433/442 cohort (21 blocks) to post_cost_conditions | — | OPT-437 | In Review | [#273](https://github.com/corycunanan/optcg-sim/pull/273) | All 21 re-encoded, tests moved to Rule 4-10-1 semantics, encoding guide updated. Found OPT-462 en route. |
| 23 | OPT-458 | Life-placement removals bypass removal prohibitions | — | — | Done | [#274](https://github.com/corycunanan/optcg-sim/pull/274) | Character-to-Life is now a TO_LIFE removal; static and live-population protections veto it per target. |
| 24 | OPT-459 | Removal handlers run replacements before prohibition filtering | — | — | Done | [#275](https://github.com/corycunanan/optcg-sim/pull/275) | Prohibited targets are removed before replacement discovery; attemptable targets retain batch semantics. |
| 25 | OPT-460 | EB01-030 Loguetown stage+hand cost unpayable | — | OPT-453, OPT-463 | Done | [#277](https://github.com/corycunanan/optcg-sim/pull/277) | Stage + chosen hand card now use a two-step select/arrange payment with canonical Stage exit. |
| 26 | OPT-461 | CHARACTER_REMOVED_FROM_FIELD vs Rule 8-4-5 open-area gate | — | — | Done | [#278](https://github.com/corycunanan/optcg-sim/pull/278) | Rule 8-4-5 gates moved-card autos to open destinations: K.O./field-trash yes; hand/deck no. |
| 27 | OPT-462 | Actions after a prompting OPPONENT_ACTION dropped on resume | — | — | In Review | [#279](https://github.com/corycunanan/optcg-sim/pull/279) | Resume frames separate responder control from the original owner's trailing chain. |
| 28 | OPT-463 | Cost-driven field exits bypass WOULD_LEAVE_FIELD replacements | — | OPT-458, OPT-459 | Done | [#276](https://github.com/corycunanan/optcg-sim/pull/276) | Cost exits now suspend for replacements; substituted payments suppress the post-colon chain per Rule 8-3-1-7. |
| 29 | OPT-470 | Prevent LIFE_SCRIED and hidden-zone event payloads from leaking card identities | — | — | Done | [#282](https://github.com/corycunanan/optcg-sim/pull/282) | Exhaustive event/prompt visibility contract; secret identities and internal continuations removed from client views. |
| 30 | OPT-467 | Make effect-stack overflow and infinite loops terminate with a rules-visible outcome | — | — | Done | [#283](https://github.com/corycunanan/optcg-sim/pull/283) | Typed terminal draw for stack/action exhaustion with replay-visible diagnostics. |
| 31 | OPT-468 | Eliminate in-place mutation of pending events during trigger and resume processing | — | — | Done | [#284](https://github.com/corycunanan/optcg-sim/pull/284) | Immutable propagation metadata with frozen-state and structural-sharing regressions. |
| 32 | OPT-469 | Correct OP03-032, OP04-042, and OP06-026 schemas against official sources | — | — | Done | [#285](https://github.com/corycunanan/optcg-sim/pull/285) | Official text restored; three schemas corrected with full-pipeline regressions. |
| 33 | OPT-471 | Make authored-schema validation fail closed and mandatory in CI | — | OPT-470, OPT-467, OPT-468, OPT-469 | Done | [#290](https://github.com/corycunanan/optcg-sim/pull/290) | Runtime-backed validator, atomic boot rejection, terminal dispatch faults, and CI schema/source/disposition gates. |
| 34 | OPT-473 | Execute and gate every authored action handler, including the six zero-covered handlers | — | OPT-471 | Done | [#291](https://github.com/corycunanan/optcg-sim/pull/291) | 3,549-use inventory; 72/72 handled and executed; global and hotspot coverage ratchets. |
| 35 | OPT-472 | Define and implement true simultaneous semantics for AND action chains | — | OPT-471 | Done | [#292](https://github.com/corycunanan/optcg-sim/pull/292) | All 210 authored connectors migrated to THEN; snapshot-locked AND transactions and validator gate added. |
| 36 | OPT-474 | Establish one authoritative zone-transition and card-identity contract | — | OPT-468 | Done | [#293](https://github.com/corycunanan/optcg-sim/pull/293) | Every cross-zone move creates a fresh identity through one service; exhaustive zone-pair and static guards added. |
| 37 | OPT-475 | Implement the 19 deferred conditional-reveal card effects or exclude them from playable formats | — | OPT-471, OPT-473 | Done | [#295](https://github.com/corycunanan/optcg-sim/pull/295) | Reconciled 20-card cohort; immutable reveal snapshots, CHOOSE_VALUE, prompt continuations, schemas, and execution matrix. |
| 38 | OPT-476 | Execute OP13-079 START_OF_GAME_EFFECT in the pregame state machine | — | OPT-471, OPT-473 | In Review | [#296](https://github.com/corycunanan/optcg-sim/pull/296) | Persisted first-player-ordered Leader effects; Mary Geoise accept/decline, shuffle, visibility, and reconnect coverage. |
| 39 | OPT-477 | Introduce an explicit deterministic EngineExecutionContext for RNG, IDs, and time | — | OPT-467, OPT-468, OPT-472, OPT-474 | Backlog | — | Starts deterministic architecture wave. |
| 40 | OPT-478 | Replace resolver module-global dispatch and decompose the 1,831-line cost handler | — | OPT-471, OPT-477 | Backlog | — | Typed execution dependencies and cost-handler decomposition. |
| 41 | OPT-479 | Decompose GameSession transport, authorization, orchestration, visibility, and persistence | — | OPT-477 | Backlog | — | Thin Durable Object composition boundary. |
| 42 | OPT-480 | Tighten engine runtime types and remove the duplicate unused target resolver | — | OPT-478, OPT-479 | Backlog | — | Exhaustive runtime unions and dead resolver removal. |
| 43 | OPT-481 | Bound event-log, undo-history, and Durable Object persistence growth | — | OPT-479 | Backlog | — | Tested persistence and history bounds. |
| 44 | OPT-482 | Reconcile rules, schema, and architecture docs to executable engine behavior | — | OPT-471–OPT-481 | Backlog | — | Final documentation and closure evidence. |
| 45 | OPT-484 | Triage low-confidence schema findings missing from the disposition ledger | — | — | Backlog | — | Seventeen newly exposed findings; overlaps OPT-475 where conditional reveals are involved. |
| 46 | OPT-485 | Restore missing OP12-112 canonical card-source entry | — | — | Backlog | — | Remove the tracked source-parity exception after official-source verification. |
| 47 | OPT-486 | Align Vitest and coverage provider versions | — | — | Backlog | — | Remove the unsupported 4.1.1/4.1.4 coverage-tool mismatch warning. |
| — | OPT-428 | Prompt responses carry no identity | — | — | Duplicate | [#252](https://github.com/corycunanan/optcg-sim/pull/252) | Superseded by OPT-438, which shipped server-issued prompt identities end to end. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`).

**Next up:** Review/merge PR #296; OPT-477 is ready because OPT-467/468/472/474 are Done.

---

## Handoffs

### OPT-423 → OPT-447
**From:** session on 2026-07-09 · **Commit:** `2db3c4e` · **PR:** [#253](https://github.com/corycunanan/optcg-sim/pull/253)

- **Primer:** Permanent schema blocks now accept non-empty intrinsic keyword flags, eliminating 311 false-positive validation warnings while retaining malformed-block checks.
- **Read first:** `workers/game/src/engine/schema-registry.ts`, `workers/game/src/engine/triggers.ts`, `workers/game/src/engine/execute.ts`, and the affected blocks in `schemas/op07.ts`, `schemas/op12.ts`, `schemas/st13.ts`, and `schemas/st22.ts`.
- **Gotchas / do NOT touch:** Do not suppress the six warnings; they identify unreachable effects. Verify OP12-058 through the established Event Main path instead of assuming Character activation behavior applies unchanged.
- **Unresolved:** Tracked by OPT-447; no additional untracked findings.
- **Why this matters for OPT-447:** Removing the false-positive flood exposed six real missing-trigger failures that should reach zero before the project moves into stack/resume work.

### OPT-447 → OPT-439
**From:** session on 2026-07-09 · **Commit:** `ea5eb02` · **PR:** [#254](https://github.com/corycunanan/optcg-sim/pull/254)

- **Primer:** Every authored activate block now has a production trigger: Characters use `ACTIVATE_MAIN`, while OP12-058 follows the established Event `MAIN_EVENT` path. Catalog validation is back to zero missing-trigger failures.
- **Read first:** `workers/game/src/engine/effect-resolver/resume.ts`, `workers/game/src/engine/effect-resolver/resume/target.ts`, `workers/game/src/engine/effect-stack.ts`, and the OPT-439 Linear reproduction.
- **Gotchas / do NOT touch:** Keep schema cleanup out of the stack-restoration change. Exercise rejection through the production frame path rather than only calling resume handlers with raw contexts.
- **Unresolved:** OPT-439 must preserve the rejected frame's `remainingActions` and `pendingTriggers` for both empty and nested stack cases; include the related DON-return rejection path in the regression matrix.
- **Pointer:** Inspect PR #254 for the trigger-contract tests; the stack/resume implementation remains entirely in OPT-439.

### OPT-439 → OPT-427
**From:** session on 2026-07-09, merged 2026-07-10 · **Commit:** `a981358` (squash of reviewed head `fea1188`; supersedes the pre-review `0f35ac7`) · **PR:** [#255](https://github.com/corycunanan/optcg-sim/pull/255)

- **Primer:** Rejected mid-action responses now restore the exact popped frame when no replacement frame was pushed, preserving nested-stack identity, remaining actions, result refs, and queued triggers.
- **Read first:** `workers/game/src/engine/effect-resolver/resume.ts`, `workers/game/src/__tests__/opt-439-rejected-frame-restoration.test.ts`, and the OPT-427 DON-return reproduction.
- **Gotchas / do NOT touch:** Explicit PASS/`skip` remains a real decline and must not restore a frame. Successful handlers that push a replacement frame must not retain the old frame underneath it.
- **Unresolved:** Re-run OPT-427's exact scenario after PR #255 merges; mark it Duplicate only if the generalized no-prompt rejection regression fully satisfies its acceptance criteria. *(Resolved 2026-07-10: verified covered; OPT-427 closed as Duplicate of OPT-439 with evidence in a Linear comment.)*
- **Pointer:** PR #255 is the system-level frame-restoration change; OPT-427 should be verification-first rather than a parallel implementation.

### OPT-429 → OPT-446
**From:** session on 2026-07-10, merged 2026-07-10 · **Commit:** `740a8fc` (squash of reviewed head `759569c` + docs-only handoff `cc69575`) · **PR:** [#257](https://github.com/corycunanan/optcg-sim/pull/257)

- **Primer:** `handleAwaitingCostSelection` now retires the consumed cost frame *before* paying the next cost (symmetric with `resumeAfterBranchPick`) and carries `costResultRefs` + `pendingTriggers` into the successor frame. Chained selectable costs no longer orphan frames or drop queued triggers.
- **Read first:** `workers/game/src/engine/effect-resolver/resume/cost.ts` (the restructured tail), `workers/game/src/__tests__/opt-429-chained-cost-frames.test.ts`, and for OPT-446 specifically: `GameSession.ts` (OPTIONAL_EFFECT gate) vs `engine/effect-resolver/resume/choice.ts` (engine accepts `skip`).
- **Gotchas / do NOT touch:** Scope freeze re-confirmed by PR #257's adversarial review: the OP10-026/027 self-constraint gap is OPT-431 and the "in any order" ordering gap is OPT-430 — do not fold either into prompt-guard work. The review's rules-fidelity lens independently re-derived both.
- **Unresolved:** Delta review flagged that the unpayable-later-cost test cannot differentiate a revert of the fix — true by construction (that branch's observable behavior didn't change; the test pins invariants). A production-reachable variant (cost 1 consumes cost 2's resource, passing upfront `validateActivateEffect`) should ride along with OPT-431's test work.
- **Pointer:** PR #257. The review also confirmed the pendingTriggers carry-over closed a real trigger-loss path; see the trigger-preservation regression in the OPT-429 test file.

### OPT-446 → OPT-431
**From:** session on 2026-07-10 · **Commit:** `ac61c71` (reviewed head) · **PR:** [#258](https://github.com/corycunanan/optcg-sim/pull/258)

- **Primer:** The prompt gate now accepts the engine's `skip` decline vocabulary, and a shared `isDeclineResponse` predicate (PASS or `skip`) drives replacement-prompt acceptance — the first commit's gate-only change would have *applied* optional replacements on `skip` (75+ schemas); the delta review caught it. Engine-level rejections now emit `game:error` to the sender on both the restore path and the rejected-with-reprompt (OPT-439) path.
- **Read first:** `workers/game/src/GameSession.ts` (`isDeclineResponse`, the OPTIONAL_EFFECT gate, `resumeFromPrompt` rejection flags), `workers/game/src/__tests__/opt-446-prompt-guard-polish.test.ts`.
- **Gotchas / do NOT touch:** Replacement prompts are `OPTIONAL_EFFECT` with no `choices` array — any new decline vocabulary must be added to `isDeclineResponse`, never inferred from `action.type` alone. OPT-448 (duplicate PASS falls through to battle pipeline) and OPT-449 (terminal games accept prompt responses) are pre-existing and tracked — do not fold into compound-cost work.
- **Unresolved:** OPT-431/OPT-430 remain the OP10-026/027 gaps (self-constraint, "in any order"); design them around one source-scoped compound-cost primitive per the plan.
- **Pointer:** PR #258 (`ac61c71`). PR #257 (merged `740a8fc`, OPT-429) is the adjacent cost-frame change OPT-431 builds on.

### OPT-444 → OPT-437
**From:** session on 2026-07-10 · **Commit:** `25b8701` (reviewed head `46ef531` + type-narrowing fixup) · **PR:** [#259](https://github.com/corycunanan/optcg-sim/pull/259)

- **Primer:** New `CHARACTER_TOTAL_COST` condition (controller/operator/value) sums the controller's characters' **field** cost via the new `getEffectiveFieldCost` — base + SET_COST/MODIFY_COST auras, explicitly excluding play-time adjustments (pending one-time "next play" discounts, hand-zone self-reductions). OP10-022 re-encoded onto it; docs sweep confirms it's the only "total cost" card text in all 51 sets.
- **Read first:** `workers/game/src/engine/modifiers.ts` (`getEffectiveCost`'s `playTimeAdjustments` split), `workers/game/src/engine/conditions.ts` (`CHARACTER_TOTAL_COST` case), `workers/game/src/__tests__/opt-444-character-total-cost.test.ts`.
- **Gotchas / do NOT touch:** Pre-existing on-field cost reads (`cost_*` filters, `SELF_COST` in `conditions.ts`) still use play cost — that's OPT-450, deliberately out of scope. Run `pnpm type-check:worker` (or `tsc --noEmit` in `workers/game`) before every PR — root `type-check` does not cover the worker, and a delta review caught a TS2339 the root check missed.
- **Unresolved:** OPT-437's rebaseline should treat CHARACTER_TOTAL_COST as an available predicate when re-auditing post-colon conditions.
- **Pointer:** PR #259.

### OPT-409 → OPT-431 (stop condition recorded)
**From:** session on 2026-07-10 · **Commit:** `cb61e71` (second reviewed head; first was `02ec8a9`) · **PR:** [#260](https://github.com/corycunanan/optcg-sim/pull/260) — open, merge NOT armed

- **Primer:** Dead `matchesCardFilter` deleted; `validateEffectSchema` + lint rule C5 now reject `controller` inside target filters recursively across actions, replacement actions, modifiers, and prohibitions, with a linter-execution regression test.
- **Stop condition:** capped review cycles (full + delta) kept surfacing confirmed majors — each round found another dead `filter.controller` surface. Residuals are ticketed, not folded in: OPT-452 (dual_targets filters, linter walk gaps, prohibition guidance) and OPT-451 (pre-existing **live** bug: permanent prohibition targets discarded at registration — P-084's population prohibition never applies). Per the workflow, the merge decision is the user's: the PR's content is net-positive and CI-green, but it did not reach review-clean within the cap.
- **Read first:** `workers/game/src/engine/schema-registry.ts` (`validateTargetFilterController`), `workers/game/src/engine/schemas/lint-schemas.sh` (rule C5), `workers/game/src/__tests__/opt-409-filter-controller-validation.test.ts`.
- **Gotchas / do NOT touch:** Do not fix OPT-451's registrar inside compound-cost work — it needs its own reproduction-first ticket run. The validator's "use target.controller" advice is wrong for permanent prohibitions until OPT-451 lands.
- **Pointer:** PR #260. For OPT-431/OPT-430: see the OPT-446 → OPT-431 entry above; the compound-cost primitive design starts from `cost-handler.ts` (`computeCostTargets` receives no `sourceCardInstanceId` today) and the OPT-429-restructured `resume/cost.ts`.

### OPT-431/OPT-430 → OPT-437
**From:** session on 2026-07-10 · **Commit:** `f8c4a2b` (second reviewed head; first `a8b9cd9`) · **PR:** [#261](https://github.com/corycunanan/optcg-sim/pull/261)

- **Primer:** New `PLACE_SELF_AND_TRASH_TO_DECK` compound cost (EB01-030 precedent): the self half is fixed to the source card — selection offers matching trash candidates only — and one arrange prompt orders the whole self+trash group (Rule 3-1-7). OP10-026/027 re-encoded. Deck placements now reset `turnPlayed`/`state`/`attachedDon` per canonical `moveCard` semantics in the compound cost AND the sibling `PLACE_OWN_CHARACTER_TO_DECK` (identical latent crash: stale non-null `turnPlayed` broke the freshly-played-instance lookup after redraw).
- **Read first:** `cost-handler.ts` (`PLACE_SELF_AND_TRASH_TO_DECK` branches in `payCostsWithSelection`, `applyCostSelection`, `isCostPayable`), `resume/cost.ts` (the two new SELECT/ARRANGE branches), `opt-430-431-self-and-trash-cost.test.ts`.
- **Gotchas / do NOT touch:** The compound branches still transition manually — no fresh instanceId, no `CARD_RETURNED_TO_DECK` field-exit event — that is OPT-453 (with the direct sibling-reset test + attached-DON coverage folded in); don't half-fix it during audit work. The reviewers' consumer sweep (behaviorNotes) confirmed the canonical reset intentionally changes stored deck-card state for ~10 existing `PLACE_OWN_CHARACTER_TO_DECK` consumers.
- **Unresolved:** Review cycle cap reached with residual systemic findings — all ticketed: OPT-453 (zone-transition completeness), OPT-454 (four more mis-encoded self-costs), OPT-455 (ST13-001 destination; trash filters read field stats), OPT-432 comment (X.Barrels `exclude_self`, same machinery as Oars). Merged under the user's standing session authorization.
- **Pointer:** PR #261. For OPT-437: rebaseline the post-colon audit on current main (CHARACTER_TOTAL_COST now exists per the OPT-444 handoff).

### OPT-437 → OPT-432
**From:** session on 2026-07-10 · **Commits:** `f5985e2` (first pass), `ed0814b` (post_cost_conditions re-encode), `97559fe` (coverage) · **PR:** [#262](https://github.com/corycunanan/optcg-sim/pull/262)

- **Primer:** New engine primitive `EffectBlock.post_cost_conditions` — the post-colon "If" evaluated exactly ONCE after costs are fully paid, at every chain-start site (resolveEffect Step 4, `finishCostsAndRunActions`, the optional-accept path), never on mid-chain resumes; when false, the paid cost stands and the whole chain is skipped (Rules 8-3-1/8-3-3/4-10-1). All 142 audited blocks re-encoded onto it. `HAND_COUNT` added to `ComparativeMetric`. Lint rule C6 rejects new costs+block-conditions encodings (allowlist: 8 verified pre-cost + 4 OPT-456 deferrals).
- **Read first:** `effect-types.ts` (EffectBlock doc comment), `resolver.ts` (`postCostConditionsMet` + Step 4 gate), the two resume gates, `opt-437-post-colon-audit.test.ts`.
- **Gotchas / do NOT touch:** The first pass proved per-action condition placement WRONG (mid-chain re-evaluation; ungated THENs violating 4-10-1) — never encode post-colon Ifs on actions. The OPT-433/442 cohort (21 blocks, marker comment "gates only this action") still uses the wrong pattern — that migration is OPT-457, including fixing tests that assert the old semantics.
- **Unresolved:** OPT-456 (4 partial encodings, C6-allowlisted), OPT-457 (cohort migration + encoding-guide doc). For OPT-432: plumb `sourceCardInstanceId` into `computeCostTargets` and honor `exclude_self` there — one mechanism closes both the Oars candidate bug and X.Barrels (see the OPT-432 Linear comment).
- **Pointer:** PR #262. Both fan-out passes' per-card verdicts are in the session workflow journals.

### OPT-432 → OPT-448
**From:** session on 2026-07-10 · **Commit:** `d687f1d` · **PR:** [#263](https://github.com/corycunanan/optcg-sim/pull/263)

- **Primer:** Trigger identity seeded on an optional-effect frame now survives selectable cost frames and merges with cost-result references before the action chain. OP15-080 targets that exact triggering instance in trash; source-aware cost filters now enforce `exclude_self`.
- **Read first:** `workers/game/src/GameSession.ts` around pending-prompt routing and PASS validation, plus `workers/game/src/__tests__/opt-446-prompt-guard-polish.test.ts` for the adjacent prompt guard contract.
- **Gotchas / do NOT touch:** A deliberate battle PASS has no `promptId`; OPT-448 should reject only prompt-identified actions after their prompt has cleared. Keep terminal-game cleanup in OPT-449.
- **Unresolved:** The untracked `.claude/scheduled_tasks.lock` and `package-lock.json` predate this recovery and were intentionally excluded. No unresolved OPT-432 behavior remains.
- **Pointer:** PR #263; inspect `d687f1d` for the implementation and regression matrix.

### OPT-448 → OPT-452
**From:** session on 2026-07-10 · **Commit:** `d405235` · **PR:** [#264](https://github.com/corycunanan/optcg-sim/pull/264)

- **Primer:** `GameSession.handleAction` now rejects any prompt-identified payload when no prompt is pending, preventing a duplicated decline PASS from falling through as a normal battle PASS.
- **Read first:** `workers/game/src/engine/schema-registry.ts` (`validateTargetFilterController`) and `workers/game/src/engine/schemas/lint-schemas.sh` (C5/walkActions), plus OPT-452's four scoped gaps.
- **Gotchas / do NOT touch:** OPT-452 item 4 depends on OPT-451's permanent-prohibition representation; implement mechanical items 1–3 without inventing that runtime contract.
- **Unresolved:** OPT-449 owns terminal-game prompt cleanup. The preserved untracked Claude/npm files remain intentionally excluded.
- **Pointer:** PR #264; inspect `d405235` for the prompt guard and battle-step regression.

### OPT-452 → OPT-456
**From:** session on 2026-07-10 · **Commit:** `74e42ab` · **PR:** [#265](https://github.com/corycunanan/optcg-sim/pull/265)

- **Primer:** Registry and linter C5 coverage now includes nested dual-target filters; linter traversal reaches action-array choices, singular nested actions, and replacement actions. Prohibition execution coverage is explicit.
- **Read first:** the four allowlisted blocks named in OPT-456 and lint rule C6 in `workers/game/src/engine/schemas/lint-schemas.sh`; use `post_cost_conditions` for post-colon predicates.
- **Gotchas / do NOT touch:** Keep OP16-084's `SELF_COST >= 20` pre-cost while moving only its DON predicate post-cost. OPT-452 item 4 remains owned by OPT-451's eventual representation.
- **Unresolved:** OPT-452 item 4 only, documented on Linear; items 1–3 are complete. Preserved untracked files remain excluded.
- **Pointer:** PR #265; inspect `74e42ab` for traversal and fixture coverage.

### OPT-456 → OPT-449
**From:** session on 2026-07-10 · **Commit:** `a16d863` · **PR:** [#266](https://github.com/corycunanan/optcg-sim/pull/266)

- **Primer:** EB04-015 and OP11-034 now evaluate complete two-trait predicates after costs; OP16-084 retains only its printed SELF_COST qualifier pre-cost and evaluates DON count post-cost. Stale C6 exceptions were removed.
- **Read first:** `workers/game/src/GameSession.ts` (`alarm`, `handleAction`, reconnect prompt resend) and OPT-449's terminal-state reproduction.
- **Gotchas / do NOT touch:** Guard terminal state before pending-prompt routing, and suppress/clear resumable prompt state on termination. Keep ordinary stale-action handling in merged OPT-448 unchanged.
- **Unresolved:** None for OPT-456. OP16-084 remains C6-allowlisted only because its remaining block condition is genuinely pre-cost.
- **Pointer:** PR #266; inspect `a16d863` for the corrected schemas and structural regression tests.

### OPT-449 → OPT-457
**From:** session on 2026-07-10 · **Commit:** `68a0bdf` · **PR:** [#267](https://github.com/corycunanan/optcg-sim/pull/267)

- **Primer:** Alarm and external terminal transitions now discard durable prompt/stack continuations. Terminal sessions reject actions before undo/prompt routing and never re-send prompts on reconnect.
- **Read first:** the 21 marker-comment blocks and the two OPT-433/442 regression files named in OPT-457; use `EffectBlock.post_cost_conditions` as the only post-colon gate.
- **Gotchas / do NOT touch:** Failed post-cost conditions skip the whole action chain after costs remain paid; update tests that currently assert an ungated THEN action. Check predicates that their own chain mutates.
- **Unresolved:** None for OPT-449. Preserved untracked files remain excluded.
- **Pointer:** PR #267; inspect `68a0bdf` for terminal cleanup and alarm regression coverage.

### OPT-457 → backlog sweep (session 2026-07-11)
**From:** session on 2026-07-10/11 · **PRs:** [#268](https://github.com/corycunanan/optcg-sim/pull/268) (OPT-451), [#269](https://github.com/corycunanan/optcg-sim/pull/269) (OPT-453), [#270](https://github.com/corycunanan/optcg-sim/pull/270) (OPT-454, stacked on #269), [#271](https://github.com/corycunanan/optcg-sim/pull/271) (OPT-450), [#272](https://github.com/corycunanan/optcg-sim/pull/272) (OPT-455, stacked on #270), [#273](https://github.com/corycunanan/optcg-sim/pull/273) (OPT-457)

- **Primer:** The six remaining backlog tickets each got a PR, an adversarial multi-lens review, and review-fix commits. Confirmed findings were fixed in-PR when in scope; systemic pre-existing classes were ticketed (OPT-458 through OPT-463).
- **Merge order:** #268 and #271 and #273 are independent of everything; #269 → #270 → #272 are a stack (each PR's base is the previous branch — after merging #269, retarget/merge #270, then #272).
- **Read first:** each PR body lists its review findings and residual tickets. The new engine primitives: dynamic prohibition targets (`RuntimeProhibition.target`/`conditions`), `AppliedCostSelection` events + inline field-exit cleanup (`completeFieldExitToDeck`), `PLACE_SELF_TO_DECK`, `ADD_OWN_CHARACTER_TO_LIFE`, `getEffectiveCostForRead`, non-field printed-power reads.
- **Gotchas / do NOT touch:** the OP10-087 passing-If test pins OPT-462's buggy behavior with an explicit marker — flip it when OPT-462 lands. OP16-084 remains the only legitimate pre-cost C6 allowlist entry. The Rule 8-4-5 question (OPT-461) decides whether Buggy-style watchers should fire on deck exits at all — both trigger paths now behave identically, so the contract change (if any) lands in one place.
- **Unresolved:** OPT-458 (Life-removal prohibition gap, High), OPT-459 (replacements before prohibition filtering), OPT-460 (Loguetown), OPT-461 (8-4-5 research), OPT-462 (OPPONENT_ACTION chain drop), OPT-463 (cost-path replacement bypass). Pre-existing schema-linter errors on main (eb02/op11/op15 — EB02-039 A6, OP11-022 A5, OP15-080 F6) predate this session and are untracked.

### OPT-458 → OPT-459
**From:** session on 2026-07-11 · **Commit:** `60de6b1` · **PR:** [#274](https://github.com/corycunanan/optcg-sim/pull/274)

- **Primer:** Character-to-Life movement is now part of the shared removal taxonomy and checks static or live-population prohibitions per target before mutating the board.
- **Read first:** `workers/game/src/engine/effect-resolver/actions/removal.ts` (`filterProhibitedTargets` ordering), `workers/game/src/engine/replacements.ts`, and the OPT-459 reproduction.
- **Gotchas / do NOT touch:** OPT-458 intentionally does not reorder replacement processing; OPT-459 owns filtering prohibited targets before any `WOULD_*` replacement can be offered or consumed.
- **Unresolved:** Raw cost-driven field exits still bypass replacement interception and remain tracked by OPT-463.
- **Pointer:** PR #274; inspect `60de6b1` for the taxonomy and executor regressions.

### OPT-459 → OPT-460
**From:** session on 2026-07-11 · **Commit:** `fddb080` · **PR:** [#275](https://github.com/corycunanan/optcg-sim/pull/275)

- **Primer:** K.O., return-to-hand, and return-to-deck now filter prohibited targets before replacement discovery, preventing impossible removals from prompting or spending replacement costs.
- **Read first:** `workers/game/src/engine/effect-resolver/cost-handler.ts` branches for `PLACE_SELF_AND_HAND_TO_DECK`, `workers/game/src/engine/effect-resolver/resume/cost.ts`, and EB01-030 in `schemas/eb01.ts`.
- **Gotchas / do NOT touch:** Preserve the single arrange prompt and canonical deck-transition behavior introduced by OPT-453; OPT-460 must add Stage-source and hand-half support without regressing Character-source compound costs.
- **Unresolved:** Cost-driven field exits still need replacement interception under OPT-463.
- **Pointer:** PR #275; inspect `fddb080` for the pre-replacement filter ordering.

### OPT-463 → OPT-460
**From:** session on 2026-07-11 · **Commit:** `e9323b0` · **PR:** [#276](https://github.com/corycunanan/optcg-sim/pull/276)

- **Primer:** Cost-driven field exits now park their cost frame across optional replacement prompts; substituted payments retain earlier partial costs, consume Once Per Turn, and suppress post-colon actions.
- **Read first:** `workers/game/src/engine/effect-resolver/cost-handler.ts` (`PLACE_SELF_AND_HAND_TO_DECK`), `resume/cost.ts` (cost replacement continuation), and EB01-030 in `schemas/eb01.ts`.
- **Gotchas / do NOT touch:** Loguetown's Stage exit must flow through the fixed-source replacement-aware path; preserve canonical fresh identity and cleanup while adding the selected hand half.
- **Unresolved:** None for OPT-463; the live Linear dependency now unblocks OPT-460 after this PR merges.
- **Pointer:** PR #276; inspect `e9323b0` and the production Enel/ST13-001 regression.

### OPT-460 → OPT-461
**From:** session on 2026-07-11 · **Commit:** `ad5b065` · **PR:** [#277](https://github.com/corycunanan/optcg-sim/pull/277)

- **Primer:** Loguetown now pays its printed Stage + chosen hand-card cost through a select-then-arrange flow; both cards reach deck bottom in chosen order and the Stage gets canonical fresh identity/cleanup.
- **Read first:** `workers/game/src/engine/triggers.ts` removed-from-field event matching, `workers/game/src/engine/effect-resolver/card-mutations.ts`, and the OPT-461 Rule 8-4-5 evidence.
- **Gotchas / do NOT touch:** OPT-461 is a rules-contract audit, not another cost rewrite. Establish the open-area gate from official rules and update the single centralized trigger matcher if required.
- **Unresolved:** None for OPT-460.
- **Pointer:** PR #277; inspect `ad5b065` and the full production Loguetown regression.

### OPT-461 → OPT-462
**From:** session on 2026-07-11 · **Commit:** `9374b49` · **PR:** [#278](https://github.com/corycunanan/optcg-sim/pull/278)

- **Primer:** `CHARACTER_REMOVED_FROM_FIELD` now obeys Rule 8-4-5 and matches only open-area destinations (K.O./field-trash), excluding hand/deck secret-area exits across pipeline and resume paths.
- **Read first:** `workers/game/src/engine/effect-resolver/resume.ts`, `resume/opponent.ts`, and the OPT-462 marker in the OPT-442 regression.
- **Gotchas / do NOT touch:** Preserve the effect owner as controller after an `OPPONENT_ACTION` prompt; only the prompted action executes from the opponent's perspective.
- **Unresolved:** None for OPT-461; Bandai's published FAQ index contains no OP16-041 override.
- **Pointer:** PR #278; inspect `9374b49` for the centralized open-area gate.

### OPT-462 → project complete
**From:** session on 2026-07-11 · **Commit:** `ff1aae9` · **PR:** [#279](https://github.com/corycunanan/optcg-sim/pull/279)

- **Primer:** Prompt resume frames now preserve separate controllers for the responder-owned paused action and the original owner’s remaining chain.
- **Read first:** `workers/game/src/engine/effect-resolver/resolver.ts`, `resume.ts`, and the OP10-087 regression in `opt-442-post-colon-conditions.test.ts`.
- **Gotchas / do NOT touch:** Do not collapse the two controller fields; nested `OPPONENT_ACTION` prompts require both roles.
- **Unresolved:** None. This closes the remaining Game Engine Correctness backlog identified in the Action Plan.
- **Pointer:** PR #279; inspect `ff1aae9` for the controller-boundary fix.

### OPT-470 → OPT-467
**From:** session on 2026-07-11 · **Commit:** `0da9264` · **PR:** [#282](https://github.com/corycunanan/optcg-sim/pull/282)

- **Primer:** Client state now passes through one exhaustive event/prompt visibility policy; private reveals declare their viewer, hidden zones use non-correlatable placeholder IDs, and engine continuation data is never serialized.
- **Read first:** `workers/game/src/engine/visibility.ts`, the visibility boundary in `workers/game/src/engine/state.ts`, and `workers/game/src/__tests__/opt-470-hidden-information-visibility.test.ts`.
- **Gotchas / do NOT touch:** Do not restore real hidden-zone instance IDs for UI animation. `CARDS_REVEALED` with `CONTROLLER_ONLY` must carry `visibleTo`; blind selection retains opaque target IDs but never card faces.
- **Unresolved:** None for OPT-470. Keep OPT-467's stack-exhaustion terminal outcome separate from visibility filtering.
- **Pointer:** PR #282; inspect `0da9264` for the implementation and regression matrix.

### OPT-467 → OPT-468
**From:** session on 2026-07-11 · **Commit:** `d94fb8a` · **PR:** [#283](https://github.com/corycunanan/optcg-sim/pull/283)

- **Primer:** Resolver sequences now carry a persisted action count, while every frame push is depth-bounded; either guard atomically ends the game in a draw with a typed `engineOutcome` and `GAME_OVER` diagnostic.
- **Read first:** `workers/game/src/engine/engine-limits.ts`, `effect-stack.ts`, and `workers/game/src/__tests__/opt-467-engine-limits.test.ts`.
- **Gotchas / do NOT touch:** Prompt resume explicitly checks terminal outcomes before stale-response restoration. Keep the action counter persisted across prompts; new player actions reset it at the pipeline boundary.
- **Unresolved:** Player-stoppable loop counting under Rules 11-1-1-2/3 remains documented as a gap; OPT-468 should only change event immutability.
- **Pointer:** PR #283; inspect `d94fb8a` for the limit propagation and session regression.

### OPT-468 → OPT-469
**From:** session on 2026-07-11 · **Commit:** `da2771e` · **PR:** [#284](https://github.com/corycunanan/optcg-sim/pull/284)

- **Primer:** Pending events now carry immutable propagation metadata. Trigger scans and event-log emission return copied events, then replace references only inside caller-owned accumulators.
- **Read first:** `workers/game/src/engine/events.ts`, `trigger-ordering.ts`, and `workers/game/src/__tests__/opt-468-event-immutability.test.ts`.
- **Gotchas / do NOT touch:** Never mutate events held by effect-stack frames or input snapshots. De-duplication metadata must move forward through copied events while preserving event IDs and structural sharing outside the changed path.
- **Unresolved:** None for OPT-468. Keep OPT-469 limited to the three confirmed card-source corrections and their pipeline regressions.
- **Pointer:** PR #284; inspect `da2771e` for the immutable propagation implementation.

### OPT-469 → OPT-471
**From:** session on 2026-07-11 · **Commit:** `852c88f` · **PR:** [#285](https://github.com/corycunanan/optcg-sim/pull/285)

- **Primer:** OP03-032 now filters battle K.O. protection by Slash attackers; OP04-042 boosts an optional Slash Character then mills; OP06-026 readies an optional qualifying Slash Character then installs a target-scoped Leader attack lock for the turn.
- **Read first:** `workers/game/src/__tests__/opt-469-card-schema-corrections.test.ts`, the three authored blocks in `schemas/op03.ts`, `op04.ts`, and `op06.ts`, and the `scope.when_attacking` gate in `prohibitions.ts`.
- **Gotchas / do NOT touch:** `scope.when_attacking` is a positive forbidden-target filter for `CANNOT_ATTACK`; OP06-026 restricts every attacker controlled by the player from targeting a Leader, not only the Character set active. The `THEN` actions remain mandatory when zero targets are chosen.
- **Unresolved:** None for Wave 1. OPT-471 can make authored-schema validation fail closed once PR #285 merges.
- **Pointer:** PR #285; inspect `852c88f` for the schema, source-text, prohibition, and regression changes.

### OPT-471 → OPT-473
**From:** session on 2026-07-12 · **Commit:** `9134129` · **PR:** [#290](https://github.com/corycunanan/optcg-sim/pull/290)

- **Primer:** All authored schemas now pass one runtime-backed validator before atomic installation; invalid runtime dispatch ends in a typed draw instead of warning/no-op behavior. Schema semantics, local source parity, and low-confidence dispositions are explicit CI gates.
- **Read first:** `workers/game/src/engine/schema-registry.ts`, `workers/game/src/__tests__/opt-471-authored-schema-gate.test.ts`, and the shared action-handler manifest in `effect-types.ts`/`resolver.ts`.
- **Gotchas / do NOT touch:** `CHOOSE_VALUE` is intentionally rejected as unhandled until OPT-475 implements it. Keep implicit cost refs in the validator contract, and preserve `TRIGGERING_CARD_IN_TRASH` as a valid target. Do not fold OPT-484/OPT-485 triage into handler execution coverage.
- **Unresolved:** OPT-484 tracks 17 newly surfaced low-confidence findings; OPT-485 tracks missing canonical source text for OP12-112. Neither blocks OPT-473.
- **Pointer:** PR #290; inspect `9134129` for the validator, terminal fault, and gate changes.

### OPT-473 → OPT-472
**From:** session on 2026-07-12 · **Commit:** `85fa7fd` · **PR:** [#291](https://github.com/corycunanan/optcg-sim/pull/291)

- **Primer:** CI now derives 3,549 authored action uses, including action arrays on rule modifications, and requires all 72 used types to have both a registered handler and an execution-test contract. The six previously zero-covered effects handlers execute through resolver paths, and coverage ratchets guard the global worker plus effects, target-resolution, and choice-resume hotspots.
- **Read first:** `workers/game/src/engine/action-coverage-contract.ts`, `workers/game/src/__tests__/opt-473-action-handler-coverage.test.ts`, and `workers/game/vitest.config.ts`.
- **Gotchas / do NOT touch:** `EXECUTED_ACTION_TYPES` is intentionally static so a newly authored type fails CI until its real regression lands. OPT-472 should update this contract only if it introduces a new action type, not for `AND` migrations. Keep Wave 3 `CHOOSE_VALUE` work in OPT-475.
- **Unresolved:** OPT-486 tracks the pre-existing Vitest 4.1.1 / coverage-v8 4.1.4 warning; it does not block the thresholds. No OPT-473 behavior remains open.
- **Pointer:** PR #291; inspect `85fa7fd` for the inventory, execution regressions, and thresholds.

### OPT-472 → OPT-474
**From:** session on 2026-07-12 · **Commits:** `bbf944c` (implementation), `b0e0267` (review hardening) · **PR:** [#292](https://github.com/corycunanan/optcg-sim/pull/292)

- **Primer:** All 210 authored connective `AND` uses now resolve in printed order as `THEN`. Explicit future `AND` groups lock conditions, dynamic values, and targets against one snapshot, collect every target choice before mutation, and commit their events only after the complete group resolves.
- **Read first:** `docs/game-engine/AND-CHAIN-AUDIT.md`, `workers/game/src/engine/effect-resolver/simultaneous.ts`, `resolver.ts`, and `workers/game/src/__tests__/opt-472-simultaneous-and.test.ts`.
- **Gotchas / do NOT touch:** `AND` is not a spelling-level encoding for the word “and.” The simultaneous allowlist intentionally excludes handlers that can open prohibition/replacement, trigger-drain, arrange, or nested-choice continuations; add a handler only with an atomic preflight regression. Same-group result dependencies remain invalid at any nesting depth (target, dynamic amount, condition, or filter), and resume packets must satisfy the target count rather than trusting the client prompt.
- **Unresolved:** The issue estimate said 211 authored connectors; the AST-backed source audit found and migrated 210 across 35 schema files. No unclassified authored `AND` remains. PR #292 has merged.
- **Pointer:** PR #292; inspect `bbf944c` for the transaction planner/migration and `b0e0267` for the review-driven count/ref fail-closed guards.

### OPT-474 → OPT-475
**From:** session on 2026-07-12 · **Commits:** `15cdcac` (implementation), `7cb8b42` (visibility review fix) · **PR:** [#293](https://github.com/corycunanan/optcg-sim/pull/293)

- **Primer:** `zone-transition.ts` is now the single cross-zone mutation boundary. Every legal pair creates a fresh ID, strips transient state, returns attached DON!!, cleans old effect/prohibition/trigger references, remaps trigger staging, and returns explicit old/new movement facts. Actions, costs, resumes, battle, play, draw/search, setup, and mulligan paths use the contract.
- **Read first:** `docs/game-engine/ZONE-TRANSITION-CONTRACT.md`, `workers/game/src/engine/zone-transition.ts`, the movement bridge in `triggers.ts`, and `opt-474-zone-transition-contract.test.ts`.
- **Gotchas / do NOT touch:** Same-zone reorder operations retain identity. Leave-zone callers that need the source's own trigger must preserve its registration only until their old/new-ID event is scanned. Event payloads use the old ID for the leave fact and `newCardInstanceId` for the destination; both identity fields must be redacted from unauthorized owner-only event views. Setup is the only construction-time adapter because no complete `GameState` exists yet.
- **Unresolved:** No OPT-474 behavior remains open. OPT-486 tracks the pre-existing Vitest/coverage-provider version mismatch warning. PRs #291 and #292 have merged, so OPT-475 is ready after the current PR review queue.
- **Pointer:** PR #293; inspect `15cdcac` for the transition implementation and `7cb8b42` for the review-driven hidden-destination-ID redaction.

### OPT-475 → OPT-476
**From:** session on 2026-07-12 · **Commit:** `c84aec2` · **PR:** [#295](https://github.com/corycunanan/optcg-sim/pull/295)

- **Primer:** Conditional reveals now carry immutable card snapshots across zone-identity changes; all 20 reconciled cards execute with chosen-cost, placement, optional play/`IF_DO`, and public deck/Life visibility contracts. Authored handler coverage is 73/73.
- **Read first:** `workers/game/src/engine/pregame.ts`, OP13-079 in `workers/game/src/engine/schemas/op13.ts`, the pregame persistence/routing in `workers/game/src/GameSession.ts`, and `workers/game/src/__tests__/opt-475-conditional-reveal.test.ts` for prompt/result-ref patterns.
- **Gotchas / do NOT touch:** `START_OF_GAME_FX` runs before opening hands and must remain paused while any search/play prompt is unresolved. Persist phase/order/continuation in durable pregame state; do not rely on transient in-memory resume data or expose full-deck identities.
- **Unresolved:** None from OPT-475. OPT-486 still tracks the pre-existing Vitest/coverage-provider version mismatch warning.
- **Pointer:** PR #295; inspect `c84aec2` for the reveal-result and prompt-continuation contracts.

### OPT-476 → OPT-477
**From:** session on 2026-07-12 · **Commit:** `4a08c91` · **PR:** [#296](https://github.com/corycunanan/optcg-sim/pull/296)

- **Primer:** `START_OF_GAME_FX` now executes both Leaders' authored rule actions in first-player order before opening hands. Per-player completion, prompts, and effect frames persist on `GameState`, so reconnects cannot repeat or skip OP13-079.
- **Read first:** `workers/game/src/engine/pregame.ts`, `workers/game/src/__tests__/opt-476-start-of-game-effects.test.ts`, `workers/game/src/engine/effect-resolver/action-utils.ts` (`shuffleArray`), `workers/game/src/util/nanoid.ts`, and `workers/game/src/engine/effect-stack.ts`.
- **Gotchas / do NOT touch:** OPT-477 should centralize the randomness used by both setup and resumed full-deck search; do not special-case pregame with a second RNG contract. PR #296 may overlap `pregame.ts`, so preserve its persisted completion ledger when integrating.
- **Unresolved:** Ambient shuffle/ID/time sources remain intentionally owned by OPT-477. OPT-486 still tracks the separate Vitest/coverage-provider version mismatch warning.
- **Pointer:** PR #296; inspect `4a08c91` for the durable setup-effect boundary and its replay-shaped tests.
