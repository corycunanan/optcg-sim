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

Tickets in execution order, grouped into the eleven PRs the project owner chose on 2026-10-12. Each PR has a roll-up parent issue in Linear (OPT-959 through OPT-969) that states the PR boundary, order, and deploy gate; the sub-issues keep their own acceptance criteria. Parents are chained with `blockedBy` in PR order; PR 3 runs parallel to PR 2. Ordering criteria: dependencies (each ticket's `## Prerequisites` section) → milestone → priority. No ticket carries a Linear estimate; every PR is Large tier.

| PR | Parent | Milestone | Tickets | Depends on | Status | PR link | Notes |
|----|--------|-----------|---------|------------|--------|---------|-------|
| 1 | OPT-959 | 0A | OPT-940, OPT-939 | — | Backlog | — | Readers and fixtures only. Reader-capable rollback baseline; its deploy must be verified before any writer PR merges. |
| 2 | OPT-960 | 0B | OPT-949, OPT-925, OPT-862 | PR 1 deploy | Backlog | — | Joint rule-processing checkpoint and one terminal writer (Decisions 3, 5). `engineOutcome` type is a new persisted shape. |
| 3 | OPT-961 | 0B | OPT-864, OPT-922 | PR 1 deploy | Backlog | — | Sequential availability, prohibitions as feasibility input, local batch recheck (Decisions 10, 11). Parallel with PR 2. Needs the hot-path scale test. |
| 4 | OPT-962 | 0B | OPT-924 | PR 2, PR 1 deploy | Todo | — | Three-step End Phase (Decision 9). Kept alone: the phase continuation stage is a persisted field. Last in 0B. |
| 5 | OPT-963 | 1 | OPT-941, OPT-926 | PR 4, PR 3 | Backlog | — | Replacement and damage continuations as typed frames; OP06-116 fixture (Decision 2). Readers ship here; deploy verified before PR 6. |
| 6 | OPT-964 | 1 | OPT-937, OPT-942, OPT-950 | PR 5 deploy | Backlog | — | Source snapshots (Decision 1), event-activation debt, battle sub-phase inventory (Decision 6). One schema version bump. |
| 7 | OPT-965 | 1 | OPT-884, OPT-943 | PR 6 | Backlog | — | Battle recovery policy plus legacy retirement sweep. Runs alone, last in Phase 1. |
| 8 | OPT-966 | 2 | OPT-944, OPT-945 | PR 7 | Backlog | — | Handler result contracts and one trigger executor. Highest-risk PR; A → X → C and A → B → C fixtures gate it. |
| 9 | OPT-967 | 2 | OPT-946, OPT-951, OPT-947 | PR 8 | Backlog | — | One drain, battle step-end checkpoints (Decision 6), retirement of alternate paths. Runs alone, last in Phase 2. |
| 10 | OPT-968 | 3 | OPT-883, OPT-923 | PR 9 | Backlog | — | Shared replacement scan/recheck (Decision 7), per-action substitute feasibility and batch semantics (Decision 8). |
| 11 | OPT-969 | 3 | OPT-921, OPT-948 | PR 10, PR 3 | Backlog | — | Attached DON!! domain and replacement-aware feasibility. Last PR; reassess OPT-958 before closing. |

Outside the milestones, not dispatched by this project: OPT-952 (declared-count loop protocol, non-goal), OPT-953 (value layers), OPT-954 (negation scope), OPT-955 (batch and distribution semantics), OPT-956 (Doc 08 and rules map), OPT-957 (rules v1.2.1), OPT-958 (retained mid-payment rollback, reassessed at OPT-948 acceptance).

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent. A PR row's status is the least-advanced status among its tickets.

**Next up:** the lowest-numbered PR row that isn't `In Review` or `Done`.

---

## Orchestration notes for this project

Read before kickoff. These are the places where `docs/project/ORCHESTRATION-CHARTER.md` and `ORCHESTRATION-OPTCG.md` need project-specific input.

1. **Merge order is rollout order.** Merging to `main` auto-deploys the game worker (`.github/workflows/deploy-workers.yml`). OPT-940 and every later ticket that adds a persisted shape ship a reader first and a writer later. Do not merge a writer PR until the reader's deploy is confirmed live (`gh api repos/<owner>/<repo>/commits/<sha>/status`). The original strict-reader binary is not a rollback target once new shapes are written.
2. **Captured sessions are an orchestrator deliverable.** OPT-940 and OPT-939 need sanitized real paused sessions from the Durable Object as fixtures. Codex has no network and no Cloudflare access. Pull them before dispatch, or record the missing fixture as an unmet rollout gate as the ticket requires.
3. **Prerequisites live in a `## Prerequisites` section**, not only in `blockedBy`. Only OPT-951 has a Linear relation. Read the section before building waves.
4. **No ticket carries `Ready for agent`.** Under charter §1 a missing label does not block a fully specified issue, but every ticket's acceptance must be verified against current code at dispatch. Revision 4 §§4–8 and the audit's decision table are the source for what "fully specified" means here.
5. **Every ticket is Large tier** (charter §3: shared engine mechanics, continuations, `GameSession` protocol). That means the coordinator reads every hunk, a Claude reviewer plus the Codex lens run on each PR, `pnpm verify` runs locally, and each ticket starts with the OPTCG rules packet. The FAQ corpus under `docs/FAQs/` is part of that packet; the audit's leg reports name the rulings per ticket.
6. **Known-wrong tests are explicit.** Revision 4 §8 lists the ratchets. Two green tests the audit first called wrong are correct (Double Attack into 1 Life, Koby OP11-001); keep them. The mid-payment rollback fixture is a labeled deviation, not a bug.
7. **Dispatch by parent, not by ticket.** Each PR's branch is cut from the parent's `gitBranchName`; the brief embeds every sub-issue's full text; the PR title names the parent and every sub-issue ID so the GitHub integration moves all of them. The parent closes when its sub-issues' acceptance criteria pass on the one merged head.

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
