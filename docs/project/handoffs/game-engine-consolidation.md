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
| 1 | OPT-959 | 0A | OPT-940, OPT-939 | — | In Review | [#746](https://github.com/corycunanan/optcg-sim/pull/746) | Readers and fixtures only. Reader-capable rollback baseline; its deploy must be verified before any writer PR merges. |
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

### OPT-959 → OPT-960 / OPT-961
**From:** session on 2026-10-12 · **Commit:** `dfe0fd1b` (round-2 review head) · **PR:** #746

- **Primer:** Every persisted game state (live and each undo snapshot) now loads through one conversion entry point, `convertPersistedGameState` in `workers/game/src/session/persistence.ts`: version dispatch (`schemaVersion`, absent = 1) → convert → strict validation → continuation-reference integrity → content migrations → legacy-shape classification. Writers are byte-identical to base `03071b69` (golden test). The frame `kind` contract (`EFFECT`, `COST`, `TRIGGER_ORDER`, `TRIGGER_DRAIN`, `BATCH_RESUME`, `PHASE_BOUNDARY`) is readable and validated but not yet written. 32 timing fixtures under `workers/game/src/__tests__/timing-baseline/` pin the rules order; 24 are `it.fails` ratchets linked to their owner PRs (F12d is OPT-970) and 8 are regression guards (three of them positive controls). Battle-record coherence (both Trigger windows open, orphan damage continuation, Trigger window outside the Damage Step) is classified and logged, never rejected, because the engine writes the first (golden case `both-trigger-windows`).
- **Read first:** `docs/game-engine/SAVED-STATE-COMPATIBILITY.md` (the contract: §1 versions, §2 kinds and references, §3 support window, §4 dispositions, §5 runbook, §6 the End Phase stage plan), `workers/game/src/session/game-state-schema.ts`, `workers/game/src/session/persistence.ts` (`convertPersistedGameState`), `workers/game/src/__tests__/timing-baseline/README.md` (every expected order with rule/FAQ line and the status table).
- **Gotchas / do NOT touch:** (1) Do not emit `schemaVersion` or `kind` from a writer until the reader that understands the new version is deployed and verified live (`gh api repos/<owner>/<repo>/commits/<sha>/status`); the first writer to emit `schemaVersion` must set it to 2 and re-capture `workers/game/src/__tests__/fixtures/opt-940-writer-golden.synthetic.json` with `node --import tsx scripts/capture-writer-golden.ts` from `workers/game` in that same PR, never in a reader-only PR. (2) `opt-940-writer-golden.test.ts` fails on any writer byte change; that is the point. (3) A stage-less `PhaseBoundaryContinuation` means "expiry done, waves never ran, scheduled list partially drained, no hand-off"; OPT-924's converter must map it to a legacy stage that resumes there, never to the first stage of the new End Phase (§6). (4) The reader enforces only invariants the engine guarantees (§2.2 table) and rejects only frame-reference and phase-boundary contradictions (§2.4); do not promote a classification to a rejection without a rung-4 proof that no engine path persists the state (PR #746 round-2 finding A is the cautionary case). (5) Ratchets flip from `it.fails` to `it` in the owning PR; do not weaken their assertions.
- **Unresolved:** Captured Durable Object sessions are an unmet rollout gate (no wrangler login, no token, no export route); every fixture is synthetic. Follow-ups in the PR body: capture path (sanitizing export route or wrangler dump); OP13-002's `DAMAGE_TAKEN` + `filter.controller: "SELF"` never matches on battle damage (`triggers.ts:955-958`, rung 4); OP06-116's `THEN`-chained `LIFE_TO_HAND` runs after a failed `DEAL_DAMAGE` condition (F12d, FAQ qa_op06.md:367-371, rung 4, no ticket); F1a logs `CARD_PLAYED`/`POWER_MODIFIED` twice on the continuous path (rung 4, no ticket); Double Attack drops the defender's `DAMAGE_TAKEN` effect entirely while a single hit fires it once (F17, rung 4, for the OPT-963 owner); a `THEN` instruction after a deck-out manufactures a draw (F16b, rung 4, OPT-960's acceptance case); `ADD_TO_LIFE_FROM_DECK` emits no event.
- **Why this matters for OPT-960 / OPT-961:** PR 2's `engineOutcome` is a new persisted shape and PR 4's End Phase stage is a persisted field: both bump `GAME_STATE_SCHEMA_VERSION` to 2, add a converter in `game-state-schema.ts` `CONVERTERS`, extend the strict schema, and ship the reader before the writer. PR 3 adds no persisted shape but its hot-path scale test should load through `SessionRepository.load` so the reference checks are in the measured path. The PR 1 deploy must be verified live before either merges (handoff table row 1).
