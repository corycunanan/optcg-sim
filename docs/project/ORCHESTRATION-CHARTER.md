# Track-based orchestration charter

Canonical workflow for coordinating 1–N Linear issues in this repository. Applies to Codex and Claude coordinators. Updated 2026-09-09; replaces the earlier Claude-only charter and lifecycle rules. Correctness precedes throughput and cost.

## 1. Scope and authority

A run accepts explicit Linear issue IDs/URLs, or a project expanded to an explicit list of non-completed issues. Fetch full descriptions, acceptance criteria, comments, attachments, dependencies, relevant project notes, and existing PRs through available connectors or authenticated tools. Paginate lists. Deduplicate IDs. Read linked requirements needed to implement the issue. Never silently add external blockers to scope.

Publish the issue list, proposed tracks, unresolved decisions, and effective permissions before dispatch. Proceed with determinate authorized work; ask only for consequential missing decisions. A readiness label is a hint: verify its claims against current code. A missing label alone does not block a fully specified issue. Missing requirements block only affected work; never fabricate unavailable Linear content.

| Role | Responsibility | Authority |
| --- | --- | --- |
| Coordinator | Resolve scope, schedule, review every diff, adjudicate findings, maintain ledger and readiness | Linear maintenance and ticket creation with required comments; merge only with explicit run-scoped authorization |
| Implementer | One bounded ticket, implementation, validation, commits, push, PR, handoff | Never merges or writes Linear |
| Independent reviewer | Challenge spec fidelity, correctness, regressions and evidence at a recorded commit | No implementation edits, merges, or Linear writes |

Merge mode defaults to **off**. An explicit instruction such as “allow merges for OPT-501 and OPT-502 in this run after all readiness gates pass” grants the coordinator authority for that scope. Record the user's exact grant and issue list. A feature request for opt-in support is not a grant. Adding issues does not extend existing merge authorization. A revocation applies immediately to unmerged PRs. No repeated confirmation is needed inside a valid grant. The coordinator must not silently become its own sole implementer/reviewer to bypass role separation.

Codex and Claude coordinators have standing user authorization to update Linear issues and create tickets relevant to the work, unless the user restricts a run. Implementers and independent reviewers remain read-only in Linear. This authorization includes the documentation comments required below; do not ask again for routine issue maintenance or follow-up creation. Merge permission remains separate. It does not authorize unrelated messages, GitHub review approvals, production data repair, or bypassing repository protections. PR creation/body updates and implementation pushes remain part of authorized ticket delivery. Never post a self-approval verdict.

**Linear audit trail:**

- Every issue update (status, description/acceptance criteria, labels, priority, assignee, dependencies or PR attachments) requires a comment on that issue stating what changed, meaningful before/after values, why, and relevant evidence/PR links. One comment may cover a coherent batch; an audit comment itself does not require another comment.
- New tickets discovered while implementing an existing ticket must link back to the original. Also comment on the original ticket with each new ticket's ID/link, the discovery/evidence, why it is separate work, and its dependency or impact on the original. Include rationale and acceptance criteria in the new ticket. PR-body Follow-ups and ledger notes do not replace the original-ticket comment.
- Read current state and existing comments before mutation; preserve unrelated user edits. Apply the update/create operation, immediately post required audit comments, and verify both the operation and comment links. If a comment fails or work is interrupted, record the successful mutation and pending comment in the ledger, repair that audit trail before further mutations on the issue, and check for existing tickets/comments before retrying. Never report an operation fully documented while its comment is missing.
- Creating a ticket does not automatically authorize implementing or merging it in the run. Keep follow-ups queued unless within already authorized implementation scope. Preserve original acceptance criteria; material product decisions still require resolution rather than silent scope changes.
- Keep status aligned with evidence using actual team status names: active implementation is In Progress, PR assessment/merge-ready is In Review, and Done requires verified delivery or an evidence-backed no-change disposition. Comment on every transition, including close-out, and recheck integration-driven status drift.

Authorization persists through a continuation of the same run when supported by conversation history. A ledger records authority; it cannot manufacture it. If a new session cannot establish the grant, continue read-only assessment and implementation with merging off until the user supplies it. Ordinary tool approval and sandbox boundaries still apply.

## 2. Preflight and durable state

Create a run record using [ORCHESTRATION-RECORDS.md](./ORCHESTRATION-RECORDS.md) before dispatch. Record actual branch/PR state rather than copying Linear status. Distinguish queued, implementing, reviewing, fixing, stack-ready (reviewed against an unmerged parent), merge-ready, blocked, merged, and verified-no-change. Stack-ready is not eligible for merge.

Inspect current work without stashing, discarding, or overwriting it. Unrelated dirty files and open PRs never block isolated work. Reuse matching in-flight work after inspecting its diff, owner, commits, and previous handoff; do not start a duplicate implementation or PR. Establish exclusive ownership before editing an existing branch.

Preflight the actual runtime: authenticated GitHub and Linear reads, repository fetch, package manager/lockfile, dependency access, git write capability in the task workspace, and the test runner's temporary/cache writes. Probe only capabilities the scope requires (browser, preview, database, etc.). Do not publish a throwaway branch just to test access; establish push access with a dry run where useful and handle the first real push explicitly. A dry run is not proof that a later push will pass all policies.

Use one isolated workspace per active ticket. Prefer standalone clones under a writable temporary root when worktree metadata is outside the sandbox; otherwise worktrees are acceptable. Record paths and ownership. Inspect disk/dependency requirements before wide dispatch. Validate machine assumptions instead of copying historical sandbox/network/model recipes. Surface automatic-review denials; do not engineer bypasses.

## 3. Build and work the dependency graph

Classify each issue: determinate, decision-blocked, externally blocked, already delivered, or recoverable in-flight work. Detect dependency cycles and contradictory acceptance criteria. Record each edge's reason; label inferred dependencies as such. Validate completed prerequisites against actual delivered code/merged PRs, not just a Done label.

A track is a sequence of tickets sharing a dependency or implementation surface. Prefer narrow complete behaviors over separate schema/handler/test tickets. Coordinators may clarify or split issues under the standing Linear authorization, preserving acceptance criteria and documenting updates and originating-ticket follow-ups as required above. Creating a subdivision does not automatically authorize implementing it. Implementation support required by a card ticket must precede parallel card batches. First prove one representative card end to end, then broaden the family.

Dispatch the ready frontier: one active implementation per track, concurrent across independent tracks within available agent/resource capacity. Every dispatch names sibling-owned files, shared contracts, and out-of-scope behavior. Serialize overlapping edits and shared browser/database resources. Reserve coordinator capacity; limit in-flight PRs to what can actually be reviewed. An unrelated blocked track does not stop the others.

Wide sweeps run alone after prerequisites stabilize. A necessary foundational refactor runs first; broad cleanup runs last. For unavoidable migrations, use a bounded expand/migrate/contract sequence with an explicit deletion ticket and independently verifiable stages. Do not invent compatibility layers for hypothetical callers.

Default dependency mode is **merged**: successors start after verified prerequisite merges. With merge mode off, report dependent tickets as blocked on merge and continue independent work. Never call that whole scope complete.

**Stacking is opt-in**, independent of merge permission. Each child branches from the parent's latest pushed head and targets the parent branch. Record the base PR/SHA; review only the child's delta but test the combined tree. Never merge a child into its parent branch. After the parent merges, retarget the child to main, reconcile the squash ancestry without force-pushing an already reviewed PR, inspect the new diff, and renew validation/readiness against main. If this cannot be done safely, pause that track. A stack delivers merge-ready candidates bottom-up; parent changes invalidate affected child evidence.

## 4. Implement complete, bounded behavior

Dispatch full ticket content, source references, acceptance criteria, dependency/base SHAs, ownership fences, validation expectations and deliverables using the run-record reference. Give the implementer a concrete failure-class brief, not merely “be careful.” Use available models suited to the work; do not depend on a historical model name.

Measure relevant validation baselines before edits. For bug fixes, reproduce the defect with a failing regression through a meaningful public boundary, then fix it. If no practical automated reproduction exists, record the live reproduction and limitation; do not claim a red test. Work one behavioral slice at a time. Expected values come from the specification or independent worked examples, not recomputation of the implementation.

Use current domain terminology and deepen existing module boundaries where needed. Preserve behavior outside acceptance criteria. Remove tagged temporary debug instrumentation before committing. Scope-expanding findings become PR-body **Follow-ups**, with evidence; a defect that makes this change unsafe cannot be deferred to make the PR pass.

Run focused checks and the repository-required gate from current package scripts/CI (currently `pnpm verify`). Existing baseline failures are not automatically attributable to the PR, but required failed or unrun checks still prevent full readiness. Record commands, outputs, environment and tested SHA. Re-run relevant checks after fixes; do not rerun unchanged checks without cause.

Deliver atomic commits with `(OPT-NNN)` suffix, a pushed PR and a concise handoff in that same PR. Open ready-for-review only when the implementation is ready for review; if genuinely incomplete, use a draft and record the blocker. Neither an open PR nor successful local compilation completes the ticket.

## 5. Review and evidence

Review the actual PR head and base, including handoff commits. Capture full SHAs before review. An empty or mismatched diff is an incomplete review, never a reason to improvise another range. The coordinator reads every diff. A fresh independent reviewer receives the intent, full diff, relevant context, and targeted hunt brief; implementation self-review cannot replace this pass. Prefer available cross-model/family diversity when useful; consensus is not proof.

Required passes are spec fidelity and correctness/regression review; add domain, ordering, trust-boundary, or visual passes according to changed behavior. Map each acceptance criterion to implementation plus verification, and each changed hunk back to a criterion or necessary support. Account for shared consumers and data/wire contracts beyond direct call sites. Use [OPTCG verification](./ORCHESTRATION-OPTCG.md) for game-related changes.

Use the [evidence ladder](../../.claude/reference/evidence-ladder.md), with these governing distinctions:

- Record **severity**, **evidence**, and **disposition** independently. A plausible material defect is unresolved until adjudicated; lack of a reproduction is not a refutation.
- A test establishes observed behavior; its expected result still needs an independent rules/specification basis. Mutation checks are useful for critical guards, not a blanket requirement for every assertion.
- Rerun decisive safety checks and claimed mutation/coverage matrices rather than trusting implementation prose. Cite CI for checks actually run there; do not describe them as independently rerun locally.
- Deduplicate by root cause and scenario, retaining independent evidence. Different bugs on the same line remain separate.
- Reviewer/test tool failures and missing required sources yield **incomplete**, not clean. Record which passes succeeded, failed or were skipped.

Classify each pass as `clean`, `findings`, or `incomplete`. Record concrete scenarios, locations, evidence, commands/results, and dispositions. Treat the existing `.claude/workflows/pr-review.js` as advisory evidence only: its output does not implement this complete gate. In particular, inspect caveats, informational blast-radius results, skipped refuters, and same-line dedup losses. If its aggregation cannot establish completeness, run fresh independent passes directly. Reviewers need scratch/cache write access to execute tests; tracked content must remain unchanged, with any experiments restored and verified.

Send actionable findings back to the same implementer and independently verify the correction. Budget one full review plus one delta review. Persistent material findings, a new major failure family, or irreconcilable reviewer disagreement triggers reassessment and a recorded blocker, not endless patching. Routine CI fixes and conflict repair are still owned by the coordinator/implementer; any new substantive fixes require fresh evidence. Continue other tracks while surfacing a need for scope/approach decisions. Never waive a finding merely to fit the review budget.

## 6. Readiness and optional merge

Write a readiness receipt from [ORCHESTRATION-RECORDS.md](./ORCHESTRATION-RECORDS.md). **Merge-ready** requires all of:

1. Acceptance criteria satisfied, scope accounted for, and relevant source/rules ambiguities resolved.
2. Coordinator diff review and independent required passes complete at the final head, with no unresolved material findings or required verification gaps.
3. Required local/project checks and current required GitHub checks successful, including relevant app/preview verification. Discover branch rules/check requirements through available GitHub tools; unknown, absent expected, queued, failing, or inconclusive required checks block readiness. Optional checks may be omitted only with the reason recorded. A flaky required check is investigated, with at most two justified reruns; no repeated reruns until green.
4. All review feedback read and dispositioned; blocking requests/threads resolved and required human/repository approvals satisfied. Do not mark external threads resolved or post replies without communication authorization; surface the remaining action instead. Automated advisory feedback is assessed for real defects, not treated as mandatory approval unless repository rules require it.
5. PR non-draft, mergeable, intended base main, prerequisites merged, and latest main integrated and validated. Repair conflicts by merging main into the branch, not rebasing/force-pushing an open reviewed PR.
6. Final handoff and PR body present, honest about validation and follow-ups; head and base SHAs match the receipt.

Every head change invalidates readiness, including docs/handoff commits. Assess the new delta and renew affected evidence; safe unchanged test results may be carried forward with justification. A changed base requires integration assessment and required checks again. An administrative refresh with no substantive code change is not another full adversarial review cycle. Serialize final integration/merge gates across tracks so one merge cannot silently invalidate another's assessment.

With merging off, deliver the receipt and leave the PR open. With a valid grant, re-fetch head, base, mergeability, required checks, review state and authorization immediately before merging. If anything changed, return to assessment. Use synchronous squash merge pinned to the full reviewed head:

```sh
gh pr merge <number> --squash --match-head-commit <full-reviewed-head-sha>
```

Never use `--admin`, bypass protections, or arm unattended `--auto` as a substitute for assessment. Head pinning does not pin main: if main moves before merge, revalidate; if required repository up-to-date checks or merge queues cannot enforce freshness across the final race, leave merge execution blocked rather than claim that head pinning solves it. Do not enable/change repository rules as part of a run.

Merge permission covers normal merge-triggered CI/deployment for the assessed changes. Identify migrations/deploy effects in the readiness review. It does not authorize separate production commands, destructive data operations or manual repairs. Tool-level approval failures remain blockers.

Verify GitHub reports merged, record the merge SHA, fetch main, establish ancestry and inspect the landed change against the reviewed result. Observe required post-merge CI/deploy checks; report failures and pause affected downstream delivery. Never claim a deployed result from a successful merge alone. Do not automatically revert or repair production without authorization.

## 7. Monitoring, recovery and close-out

Respond to completion notifications; poll running jobs/checks at sensible intervals while keeping user updates responsive. Record progress and blockers at state transitions. A silent agent is inspected for output, process and working-tree progress before declaring it hung. Preserve partial edits when recovering a failed worker. Resume a valid implementation thread for findings; use fresh reviewers and fresh sessions after runtime/policy changes.

On interruption, checkpoint the run ledger with workspace paths, branch/PR SHAs, completed evidence, active agents, permissions and the exact next step. Cancel this run's pending merge execution if permission is revoked. On pickup, reconcile all recorded state against GitHub, Linear and git before dispatching or merging; outdated receipts never authorize action.

Close-out is per issue: an issue without merge authorization is delivered when its PR is merge-ready; an issue with merge authorization is delivered only when verified merged and required post-merge outcomes are checked. An evidence-backed no-change disposition also counts as delivered. A mixed-permission run can finish when each issue reaches its authorized outcome. Blocked dependents and stack-ready candidates remain outstanding, so a run containing them is not complete. Update scoped issues to reflect verified delivery and document each update in a comment under §1. Do not close unrelated parents/projects. If writes or required comments fail, record pending audit work and report close-out as incomplete until repaired; preserve any user-imposed read-only restriction.

Clean up only run-owned workspaces whose work is durably delivered and no longer needed. Preserve unmerged, unpushed, dirty or active work. Compile all PR-body Follow-ups into the handoff without silently expanding scope. Report every issue's result, PR, readiness/merge evidence, outstanding blockers and next runnable frontier. Capture repeated failure lessons in focused checks or skill changes; avoid accumulating speculative rules.

## Sources of the practice

Adapted for this repo from the previous Claude orchestration pipeline, [pstack](https://github.com/cursor/plugins/tree/main/pstack) (blast radius, independent challenge, verified delivery), and [Matt Pocock's skills](https://github.com/mattpocock/skills) (vertical ticket slices, public-boundary tests, precise domain vocabulary). External skills are references, not runtime dependencies or authority grants.
