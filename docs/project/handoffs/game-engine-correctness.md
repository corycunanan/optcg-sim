---
linear-project: Game Engine Correctness
linear-project-url: https://linear.app/optcg-sim/project/game-engine-correctness-c3d337079446
last-updated: 2026-07-09
---

# Game Engine Correctness — Handoff Doc

Correctness fixes for effect resolution, prompt handling, schema validation, costs, and gameplay state transitions.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-423 | Schema validator rejects keyword-only permanent blocks | — | — | In Review | [#253](https://github.com/corycunanan/optcg-sim/pull/253) | Restores useful schema-validation signal before the bulk audit. |
| 2 | OPT-439 | Rejected SELECT_TARGET drops remaining actions or resumes the wrong frame | — | — | Todo | — | Generalize frame validation/restoration; include the OPT-427 DON-choice path in the regression matrix. |
| 3 | OPT-427 | Rejected stale choice silently skips the pending effect | — | OPT-439 | Backlog | — | Re-verify after OPT-439; close as covered/duplicate if the generalized fix and tests fully satisfy it. |
| 4 | OPT-429 | Chaining selectable costs leaves an orphaned effect-stack frame | — | OPT-439 | Backlog | — | Establish symmetric stack handling before compound-cost work. |
| 5 | OPT-446 | Prompt-guard decline vocabulary and rejected-response error polish | — | OPT-439 | Todo | — | Finish prompt rejection semantics after the frame fix. |
| 6 | OPT-431 | “This Character” cost can use a different Character | — | OPT-429 | Backlog | — | Design jointly with OPT-430 around one source-scoped compound-cost primitive. |
| 7 | OPT-430 | Compound cost cannot be reordered | — | OPT-429 | Backlog | — | Keep adjacent to OPT-431; one shared root implementation may close both. |
| 8 | OPT-432 | Oars cost can consume its source and play a different copy | — | OPT-431 | Backlog | — | Reuse source-instance identity conventions from the compound-cost work. |
| 9 | OPT-444 | OP10-022 total-character-cost activation predicate | — | — | Todo | — | Add the missing metric before the schema-wide condition audit. |
| 10 | OPT-437 | Schema-wide post-colon condition audit | — | OPT-423, OPT-444 | Backlog | — | Rebaseline after OPT-442, then split into lint/tooling plus set-family batches. |
| 11 | OPT-409 | Remove dead filter code and close controller no-op | — | OPT-437 | Backlog | — | Low-risk cleanup after shared schema/filter surfaces settle. |
| — | OPT-428 | Prompt responses carry no identity | — | — | Duplicate | [#252](https://github.com/corycunanan/optcg-sim/pull/252) | Superseded by OPT-438, which shipped server-issued prompt identities end to end. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`).

**Next up:** OPT-439 after PR #253 completes review.

---

## Handoffs

### OPT-423 → OPT-439
**From:** session on 2026-07-09 · **Commit:** `2db3c4e` · **PR:** [#253](https://github.com/corycunanan/optcg-sim/pull/253)

- **Primer:** Permanent schema blocks now accept non-empty intrinsic keyword flags, eliminating 311 false-positive validation warnings while retaining malformed-block checks.
- **Read first:** `workers/game/src/engine/effect-resolver/resume.ts`, `workers/game/src/engine/effect-resolver/resume/target.ts`, `workers/game/src/engine/effect-resolver/resume/choice.ts`, `workers/game/src/GameSession.ts`.
- **Gotchas / do NOT touch:** OPT-438 now rejects stale prompt IDs at the WebSocket boundary, but OPT-439 must still make engine-level resume handling safe for direct callers and defense in depth.
- **Unresolved:** Six unrelated authored schemas still warn for `activate` blocks without triggers: OP07-048, OP12-058, ST13-007, ST13-010, ST13-014, and ST22-007. Triage separately; do not fold them into OPT-439.
- **Why this matters for OPT-439:** Validation output is now quiet enough for new engine regressions to remain visible during the high-risk stack/resume work.
