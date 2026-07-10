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
| 4 | OPT-427 | Rejected stale choice silently skips the pending effect | — | OPT-439 | Backlog | — | Re-verify after OPT-439; close as covered/duplicate if the generalized fix and tests fully satisfy it. |
| 5 | OPT-429 | Chaining selectable costs leaves an orphaned effect-stack frame | — | OPT-439 | Backlog | — | Establish symmetric stack handling before compound-cost work. |
| 6 | OPT-446 | Prompt-guard decline vocabulary and rejected-response error polish | — | OPT-439 | Todo | — | Finish prompt rejection semantics after the frame fix. |
| 7 | OPT-431 | “This Character” cost can use a different Character | — | OPT-429 | Backlog | — | Design jointly with OPT-430 around one source-scoped compound-cost primitive. |
| 8 | OPT-430 | Compound cost cannot be reordered | — | OPT-429 | Backlog | — | Keep adjacent to OPT-431; one shared root implementation may close both. |
| 9 | OPT-432 | Oars cost can consume its source and play a different copy | — | OPT-431 | Backlog | — | Reuse source-instance identity conventions from the compound-cost work. |
| 10 | OPT-444 | OP10-022 total-character-cost activation predicate | — | — | Todo | — | Add the missing metric before the schema-wide condition audit. |
| 11 | OPT-437 | Schema-wide post-colon condition audit | — | OPT-423, OPT-444 | Backlog | — | Rebaseline after OPT-442, then split into lint/tooling plus set-family batches. |
| 12 | OPT-409 | Remove dead filter code and close controller no-op | — | — | Backlog | — | Low-risk cleanup scheduled after shared schema/filter surfaces settle. |
| — | OPT-428 | Prompt responses carry no identity | — | — | Duplicate | [#252](https://github.com/corycunanan/optcg-sim/pull/252) | Superseded by OPT-438, which shipped server-issued prompt identities end to end. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`).

**Next up:** OPT-427 (ready now — PR #255 merged); verification-first, re-verify whether OPT-439 fully covers it.

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
- **Unresolved:** Re-run OPT-427's exact scenario after PR #255 merges; mark it Duplicate only if the generalized no-prompt rejection regression fully satisfies its acceptance criteria.
- **Pointer:** PR #255 is the system-level frame-restoration change; OPT-427 should be verification-first rather than a parallel implementation.
