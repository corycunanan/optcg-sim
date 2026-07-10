---
linear-project: Game Engine Correctness
linear-project-url: https://linear.app/optcg-sim/project/game-engine-correctness-c3d337079446
last-updated: 2026-07-10
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
| 14 | OPT-449 | Terminal games still accept prompt responses | — | — | Backlog | — | Pre-existing; surfaced by PR #258's delta review. Clear prompt/stack on terminal transition; status-guard the prompt route. |
| 15 | OPT-450 | On-field cost reads include pending play-time discounts | — | OPT-444 | Backlog | — | Pre-existing; surfaced by PR #259's review. Route cost_* filters and SELF_COST through getEffectiveFieldCost. |
| 16 | OPT-451 | Permanent prohibition targets discarded at registration | — | — | Backlog | — | Pre-existing, **live** (P-084 Buggy's population prohibition never applies); surfaced by PR #260's delta review. High priority. |
| 17 | OPT-452 | Complete the filter-controller guard (dual_targets, linter walk, prohibition guidance) | — | OPT-451 (item 4 only) | Done | [#265](https://github.com/corycunanan/optcg-sim/pull/265) | Merged 2026-07-10 (`009ada2`). Items 1–3 complete; item 4 remains documented under OPT-451. |
| 18 | OPT-453 | Deck-placement costs bypass the canonical zone transition | — | — | Backlog | — | Pre-existing + inherited by the compound cost; stale permanent effects (OP15-041+OP16-003 live), retained instanceId. From PR #261's delta review. |
| 19 | OPT-454 | Four more "this Character" self-costs mis-encoded | — | OPT-453 | Backlog | — | OP06-016/OP09-008/P-013/P-033 need a self-scoped PLACE_SELF_TO_DECK. From PR #261's delta review. |
| 20 | OPT-455 | ST13-001 cost destination + trash filters read field stats | — | — | Backlog | — | Batched encoding/read-surface corrections. From PR #261's delta review. |
| 18 | OPT-453 | Deck-placement costs bypass the canonical zone transition | — | — | Backlog | — | Pre-existing + inherited by the compound cost; stale permanent effects (OP15-041+OP16-003 live), retained instanceId. From PR #261's delta review. |
| 19 | OPT-454 | Four more "this Character" self-costs mis-encoded | — | OPT-453 | Backlog | — | OP06-016/OP09-008/P-013/P-033 need a self-scoped PLACE_SELF_TO_DECK. From PR #261's delta review. |
| 20 | OPT-455 | ST13-001 cost destination + trash filters read field stats | — | — | Backlog | — | Batched encoding/read-surface corrections. From PR #261's delta review. |
| 21 | OPT-456 | Four partial condition encodings deferred from the OPT-437 audit | — | OPT-437 | In Review | [#266](https://github.com/corycunanan/optcg-sim/pull/266) | Trait alternatives and pre/post-cost split corrected; only OP16-084’s legitimate pre-cost C6 exception remains. |
| 22 | OPT-457 | Migrate the OPT-433/442 cohort (21 blocks) to post_cost_conditions | — | OPT-437 | Backlog | — | Same latent per-action classes as PR #262's review proved; includes the 09-EXAMPLE-ENCODINGS doc update. |
| — | OPT-428 | Prompt responses carry no identity | — | — | Duplicate | [#252](https://github.com/corycunanan/optcg-sim/pull/252) | Superseded by OPT-438, which shipped server-issued prompt identities end to end. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`).

**Next up:** OPT-432 (ready now — PR #261 merged; includes the X.Barrels scope note); then the review-spawned backlog by value: OPT-451 (live prohibition bug), OPT-453, OPT-457.

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
