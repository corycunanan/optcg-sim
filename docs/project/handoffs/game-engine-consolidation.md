---
linear-project: Game Engine Consolidation
linear-project-url: https://linear.app/optcg-sim/project/game-engine-consolidation-34e20fb682af
last-updated: 2026-10-12
---

# Game Engine Consolidation — Handoff Doc

Consolidate the engine in place so pending work has one owner and execution order has one scheduler. Planning is complete: the proposal is at Revision 4 (2026-10-11) in Linear, the eleven audit decisions are resolved, and 22 tickets sit in five milestones. Implementation has not started and is not authorized by this doc.

Implementation contract: [Final proposal, Revision 4](https://linear.app/optcg-sim/document/game-engine-consolidation-final-proposal-revision-4-0405d57abd84) (snapshot: `docs/game-engine/audits/consolidation-2026-10/proposal-rev4-snapshot.md`). Evidence: `docs/game-engine/CONSOLIDATION-PROPOSAL-AUDIT-2026-10.md`. Baseline: `origin/main` at `4fe26c6a`; recheck at every ticket start.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies (each ticket's `## Prerequisites` section and `blockedBy` relations) → milestone → priority. No ticket carries a Linear estimate; the project estimate is 14–23 PRs, mostly Large.

| Order | Ticket | Title | Milestone | Depends on | Status | PR | Notes |
|-------|--------|-------|-----------|------------|--------|----|-------|
| 1 | OPT-940 | Version saved game state; reader-first live/undo compatibility | 0A | — | Backlog | — | First runtime-changing PR. Readers ship before any writer. |
| 2 | OPT-939 | Capture engine timing fixtures; correct the architecture baseline | 0A | — | Backlog | — | Tests and docs only; runs alongside OPT-940. Carries the Decision 2 and 7 fixtures. |
| 3 | OPT-925 | Effect damage at 0 Life never defeats; common terminal path | 0B | 940, 939 | Todo | — | Owns `terminateGame`. Dispatch together with OPT-949 (same files). |
| 4 | OPT-949 | Joint rule-processing checkpoint and one terminal writer (§9-2-1) | 0B | 940 | Backlog | — | Decisions 3 and 5. Zero Life alone is not defeat; budget overflow gets its own label. |
| 5 | OPT-862 | Deck-out not checked mid-resolution | 0B | 940, 939, 925 | Backlog | — | Uses the checkpoint from 949/925. |
| 6 | OPT-864 | Sequential cost availability; prohibitions as feasibility input | 0B | 940, 939 | Backlog | — | Decisions 10 and 11. The mid-payment rollback fixture is labeled a rules deviation (OPT-958). |
| 7 | OPT-922 | Batch replacement feasibility recheck between prompts | 0B | 940, 939 | Todo | — | Local recheck only; the shared helper is Phase 3. |
| 8 | OPT-924 | Full End Phase order (three expiry steps) | 0B | 940, 939, 862 | Todo | — | Decision 9. Last in 0B; touches phase continuation. |
| 9 | OPT-941 | Replacement continuations into typed frames | 1 | 924, 864, 922 | Backlog | — | First Phase 1 frame migration. |
| 10 | OPT-926 | Effect multi-damage continuation after a Life Trigger | 1 | 941 | Todo | — | Owns the damage frames and the OP06-116 fixture (Decision 2). |
| 11 | OPT-937 | Identity-only source snapshot at trigger enqueue | 1 | 941 | Backlog | — | Decision 1. Parallel with OPT-926. |
| 12 | OPT-950 | Battle sub-phase state and omitted pending work | 1 | 940, 941 | Backlog | — | Decision 6. Adds state; schema version bumps. Parallel with 926/937. |
| 13 | OPT-884 | Battle continuation hardening; stuck DAMAGE_STEP repair | 1 | 926, 941, 925 | Backlog | — | |
| 14 | OPT-942 | Deferred event activation as owned frames | 1 | 926 | Backlog | — | |
| 15 | OPT-943 | Complete pending-work ownership; retire legacy storage | 1 | 942, 937, 884 | Backlog | — | Wide-surface; runs alone, last in Phase 1. |
| 16 | OPT-944 | Explicit resume-handler results | 2 | 943 | Backlog | — | |
| 17 | OPT-945 | One trigger executor, rules-based nested ordering | 2 | 944 | Backlog | — | Highest-risk ticket. A → X → C and A → B → C fixtures gate it. |
| 18 | OPT-946 | One pending-work drain | 2 | 945 | Backlog | — | |
| 19 | OPT-951 | Battle step-end zone checkpoints in the drain | 2 | 950, 946 | Backlog | — | Decision 6. `blockedBy` OPT-950 in Linear. |
| 20 | OPT-947 | Retire alternate scheduling paths; document the engine | 2 | 946, 951 | Backlog | — | Wide-surface; runs alone, last in Phase 2. |
| 21 | OPT-883 | Shared replacement scan/recheck; decline-then-next (§8-1-3-4-2) | 3 | 947 | Backlog | — | Decision 7 (assumed precedence). |
| 22 | OPT-921 | RETURN_DON_TO_DECK includes attached DON!! | 3 | 947 | Todo | — | Parallel with OPT-883. May be pulled forward if it avoids the migration overlap. |
| 23 | OPT-923 | Replacement feasibility gaps; per-action substitute feasibility | 3 | 883 | Todo | — | Decision 8 batch semantics as acceptance. |
| 24 | OPT-948 | Replacement-aware cost feasibility | 3 | 923, 921, 864 | Backlog | — | Last. Reassess OPT-958 before closing. |

Outside the milestones, not dispatched by this project: OPT-952 (declared-count loop protocol, non-goal), OPT-953 (value layers), OPT-954 (negation scope), OPT-955 (batch and distribution semantics), OPT-956 (Doc 08 and rules map), OPT-957 (rules v1.2.1), OPT-958 (retained mid-payment rollback, reassessed at OPT-948 acceptance).

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** the highest-ordered row that isn't `In Review` or `Done`.

---

## Orchestration notes for this project

Read before kickoff. These are the places where the generic `/orchestrate` pipeline is not enough.

1. **Merge order is rollout order.** Merging to `main` auto-deploys the game worker (`.github/workflows/deploy-workers.yml`). OPT-940 and every later ticket that adds a persisted shape ship a reader first and a writer later. Do not merge a writer PR until the reader's deploy is confirmed live (`gh api repos/<owner>/<repo>/commits/<sha>/status`). The original strict-reader binary is not a rollback target once new shapes are written.
2. **Captured sessions are an orchestrator deliverable.** OPT-940 and OPT-939 need sanitized real paused sessions from the Durable Object as fixtures. Codex has no network and no Cloudflare access. Pull them before dispatch, or record the missing fixture as an unmet rollout gate as the ticket requires.
3. **Prerequisites live in a `## Prerequisites` section**, not only in `blockedBy`. Only OPT-951 has a Linear relation. Read the section before building waves.
4. **No ticket carries `Ready for agent`.** Every ticket needs the readiness pass in `/orchestrate` §0 before dispatch. The audit's Decision table and Revision 4 §§4–8 are the source for determinate acceptance.
5. **Every ticket is an engine ticket.** Run the saved lens workflow (`.claude/workflows/pr-review.js`) for each PR, not only the generic adversarial review. The rules-fidelity lens reads `docs/rules/` and `docs/FAQs/`.
6. **Known-wrong tests are explicit.** Revision 4 §8 lists the ratchets. Two green tests the audit first called wrong are correct (Double Attack into 1 Life, Koby OP11-001); keep them. The mid-payment rollback fixture is a labeled deviation, not a bug.
7. **Combine OPT-925 and OPT-949.** They rewrite the same terminal path. One PR with both IDs in the title avoids a merge conflict between two Codex clones.

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

<!--
Copy this block when writing a new handoff:

### OPT-XXX → OPT-YYY
**From:** session on YYYY-MM-DD · **Commit:** `<short-sha>` · **PR:** #NN

- **Primer:** <1 sentence — what changed at the system level>
- **Read first:** `path/to/file.ts`, `path/to/other.ts`
- **Gotchas / do NOT touch:** <what to leave alone and why, OR "none">
- **Unresolved:** <follow-ups, open questions, deferred work, tracking IDs — OR "none">
- **Why this matters for OPT-YYY:** <1–2 sentences tying the above to the next ticket's surface>

-->
