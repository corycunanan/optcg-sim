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
| 5 | OPT-429 | Chaining selectable costs leaves an orphaned effect-stack frame | — | OPT-439 | In Review | [#257](https://github.com/corycunanan/optcg-sim/pull/257) | Symmetric frame retirement + pendingTriggers carry-over. Review re-confirmed OPT-431/OPT-430 as the remaining OP10-026/027 gaps. |
| 6 | OPT-446 | Prompt-guard decline vocabulary and rejected-response error polish | — | OPT-439 | In Review | [#258](https://github.com/corycunanan/optcg-sim/pull/258) | Gate accepts `skip`; replacement paths share the decline predicate; game:error on engine rejections. Delta review surfaced pre-existing OPT-448/OPT-449. |
| 7 | OPT-431 | “This Character” cost can use a different Character | — | OPT-429 | Backlog | — | Design jointly with OPT-430 around one source-scoped compound-cost primitive. |
| 8 | OPT-430 | Compound cost cannot be reordered | — | OPT-429 | Backlog | — | Keep adjacent to OPT-431; one shared root implementation may close both. |
| 9 | OPT-432 | Oars cost can consume its source and play a different copy | — | OPT-431 | Backlog | — | Reuse source-instance identity conventions from the compound-cost work. |
| 10 | OPT-444 | OP10-022 total-character-cost activation predicate | — | — | Todo | — | Add the missing metric before the schema-wide condition audit. |
| 11 | OPT-437 | Schema-wide post-colon condition audit | — | OPT-423, OPT-444 | Backlog | — | Rebaseline after OPT-442, then split into lint/tooling plus set-family batches. |
| 12 | OPT-409 | Remove dead filter code and close controller no-op | — | — | Backlog | — | Low-risk cleanup scheduled after shared schema/filter surfaces settle. |
| 13 | OPT-448 | Duplicate PASS after prompt resolution advances the battle step | — | — | Backlog | — | Pre-existing; surfaced by PR #258's delta review. Reject prompt-identified actions when no prompt is pending. |
| 14 | OPT-449 | Terminal games still accept prompt responses | — | — | Backlog | — | Pre-existing; surfaced by PR #258's delta review. Clear prompt/stack on terminal transition; status-guard the prompt route. |
| — | OPT-428 | Prompt responses carry no identity | — | — | Duplicate | [#252](https://github.com/corycunanan/optcg-sim/pull/252) | Superseded by OPT-438, which shipped server-issued prompt identities end to end. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`).

**Next up:** OPT-444 (ready now, independent); OPT-431 + OPT-430 jointly once PR #257 merges.

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
- **Unresolved:** Re-run OPT-427's exact scenario after PR #255 merges; mark it Duplicate only if the generalized no-prompt rejection regression fully satisfies its acceptance criteria. *(Resolved 2026-07-10: verified covered; OPT-427 closed as Duplicate of OPT-439.)*
- **Pointer:** PR #255 is the system-level frame-restoration change; OPT-427 should be verification-first rather than a parallel implementation.

### OPT-446 → OPT-431
**From:** session on 2026-07-10 · **Commit:** `ac61c71` (reviewed head) · **PR:** [#258](https://github.com/corycunanan/optcg-sim/pull/258)

- **Primer:** The prompt gate now accepts the engine's `skip` decline vocabulary, and a shared `isDeclineResponse` predicate (PASS or `skip`) drives replacement-prompt acceptance — the first commit's gate-only change would have *applied* optional replacements on `skip` (75+ schemas); the delta review caught it. Engine-level rejections now emit `game:error` to the sender on both the restore path and the rejected-with-reprompt (OPT-439) path.
- **Read first:** `workers/game/src/GameSession.ts` (`isDeclineResponse`, the OPTIONAL_EFFECT gate, `resumeFromPrompt` rejection flags), `workers/game/src/__tests__/opt-446-prompt-guard-polish.test.ts`.
- **Gotchas / do NOT touch:** Replacement prompts are `OPTIONAL_EFFECT` with no `choices` array — any new decline vocabulary must be added to `isDeclineResponse`, never inferred from `action.type` alone. OPT-448 (duplicate PASS falls through to battle pipeline) and OPT-449 (terminal games accept prompt responses) are pre-existing and tracked — do not fold into compound-cost work.
- **Unresolved:** OPT-431/OPT-430 remain the OP10-026/027 gaps (self-constraint, "in any order"); design them around one source-scoped compound-cost primitive per the plan. This branch and PR #257 both edit this handoff doc — resolve the trivial docs conflict at merge time by keeping both sections.
- **Pointer:** PR #258 (`ac61c71`). PR #257 (`cc69575`, OPT-429) is the adjacent cost-frame change OPT-431 builds on.
