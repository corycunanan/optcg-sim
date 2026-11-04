# Orchestration charter

The policy for coordinating 1–N Linear issues in this repository. Correctness comes before throughput; the risk tier in §3 sets how much process a ticket pays for it. Updated 2026-11-03 (trimmed; see the PR that introduced this revision for what moved and why).

Companion documents: the `orchestrate` skill (models and dispatch mechanics), [OPTCG verification](./ORCHESTRATION-OPTCG.md) (game changes), [run records](./ORCHESTRATION-RECORDS.md) (checkpoint and readiness receipt), and `.claude/skills/orchestrate/GOTCHAS.md` (environment lessons, read as needed).

## 1. Roles and authority

| Role | Does | May not |
| --- | --- | --- |
| Coordinator | Resolves scope, declares tiers, schedules, adjudicates findings, owns readiness, maintains Linear | Merge without an explicit grant; act as its own implementer and reviewer |
| Implementer | One bounded ticket: code, validation, commits, push, PR | Merge; write to Linear |
| Reviewer | Independently challenges one PR at a recorded head | Edit tracked files; merge; write to Linear |

**Merging is off by default.** A user instruction that names the issues, such as "allow merges for OPT-501 and OPT-502 in this run", grants merge authority for those issues only. Record the grant verbatim. Adding issues does not extend it; a revocation applies immediately. A request to discuss or build merge support is not a grant. A new session that cannot show the grant runs with merging off.

**Linear.** The coordinator may update issues and create relevant tickets without asking. Comment when the change carries information a reader needs: changed scope or acceptance criteria, a status change the coordinator makes by hand, close-out, and every follow-up ticket discovered during the work (link it back and comment on the original with the evidence and why it is separate). Routine metadata changes, such as labels, parents, priority and relations, rely on Linear's activity history. Read current state before mutating and preserve the user's edits. Creating a ticket does not authorize implementing it in this run.

Status follows evidence: In Progress while implementing, In Review once a PR is under assessment, Done only on verified delivery or an evidence-backed no-change disposition. The GitHub integration marks issues Done on merge; that is fine while post-merge checks are being watched, and must be reconciled if they fail.

Nothing here authorizes unrelated messages, GitHub review approvals, production data changes, or bypassing repository protections.

## 2. Scope and preflight

Accept explicit issue IDs, or a project resolved to an explicit list of open issues. Fetch each issue in full, with comments, parent, blockers and existing PRs. Publish the scope, tracks, unresolved decisions and effective permissions, then proceed with determinate work; ask only for consequential missing decisions. Treat labels and Done statuses as claims to verify against current code. Missing requirements block only the affected issue.

Inspect existing work before starting: reuse a matching in-flight branch or PR instead of duplicating it, and never stash, discard or overwrite someone else's changes. Unrelated dirty files and open PRs do not block isolated work.

Preflight only what the scope needs: GitHub and Linear access, a fresh fetch, dependency install, and test-runner writes; a browser, preview or database only when used. Identify required external evidence (for example production session captures) and who will get it, early. Missing evidence blocks only its own gate and never silently becomes optional.

Use one isolated workspace per active ticket. Keep the run record in a local scratch file as described in [run records](./ORCHESTRATION-RECORDS.md); it is never committed.

## 3. Tiers and scheduling

Declare one tier per issue from the surfaces it touches. A reviewer or the coordinator raises the tier when the diff exceeds the declared surface; a tier is never lowered after dispatch.

| Tier | Surfaces | Review | Local validation | Records |
| --- | --- | --- | --- | --- |
| Small | Docs; schema encodings using established semantics; test-only changes; single-component copy or token fixes | One combined spec-and-correctness pass | Focused checks; CI is the full gate | Short receipt |
| Medium | App features, API routes, deck builder, board components, non-shared engine handlers, single-card semantics | Full review plus one delta; coordinator spot-checks one decisive claim | Focused checks; CI is the full gate | Short receipt |
| Large | Shared engine mechanics (triggers, targets, costs, continuations, zone transitions), `GameSession` protocol, auth, migrations, pipeline data, shared design tokens | Separate spec and correctness reviewers plus OPTCG verification; coordinator reads every hunk; mutation-check decisive guards | Focused checks plus `pnpm verify`, then CI | Full receipt with consumer inventory |

A track is a sequence of tickets that share a dependency or an implementation surface. Run one implementation per track at a time and independent tracks in parallel, within the capacity you can actually review. Every brief names sibling-owned files and out-of-scope behavior. Land Small tickets first within a wave.

Successors start after their prerequisites merge. **Stacking is opt-in**: the child branches from the parent's pushed head and targets it; after the parent merges, retarget to main without force-pushing reviewed work and renew validation. Never merge a child into its parent.

Put shared support first, prove one representative card end to end, then broaden. Run wide sweeps alone after prerequisites settle. When a change moves scheduling, publication or cleanup responsibility across engine boundaries, agree a short before/after ownership contract and prove one prompted or nested handoff before converting callers.

## 4. Implementation

The brief is the implementer's complete policy. It contains the full ticket text and acceptance criteria, the base SHA and prerequisites, owned and forbidden files, exact validation commands with their working directory and test paths, and the deliverables. Do not send the charter or the coordinator's conversation.

Dispatch with an explicit model for the role (implementer, reviewer, chore worker); the `orchestrate` skill holds the current choices. Record which model actually ran each role. Prefer a script over an agent for mechanical work such as polling checks or counting files.

For a bug fix, show red before green through a public boundary that owns the behavior; if no automated reproduction is practical, record the live reproduction and say so. Expected values come from card text, rules and the spec, never from running the implementation. Preserve behavior outside the acceptance criteria. Findings outside scope go in the PR body's **Follow-ups**; a defect that makes the change unsafe cannot be deferred.

Run focused checks locally on every tier, and confirm the runner collected the tests you meant to run. Large tickets also run `pnpm verify` locally; Small and Medium cite CI on the exact head. Record each command and the SHA it ran against, and carry an unchanged result forward only with a stated reason.

Deliver atomic commits with an `(OPT-NNN)` suffix and a pushed PR. The PR body covers the problem, the resulting behavior, validation results and limitations, Follow-ups, and a short **Handoff**. Do not commit handoff or action-plan documents; `docs/project/handoffs/` is a read-only archive. When a later ticket needs a handoff point, the coordinator copies it into a comment on that issue or its parent. Open the PR as a draft if the work is genuinely incomplete.

## 5. Review

A fresh reviewer, independent of the implementer, reviews an immutable head. Give it the intent, the full diff between recorded base and head SHAs, the relevant source context and a targeted hunt brief. Reviewers may write scratch files and run tests but leave tracked files unchanged. An empty or mismatched diff is an incomplete review. Use [OPTCG verification](./ORCHESTRATION-OPTCG.md) for game-related changes.

Each pass maps every acceptance criterion to implementation and evidence, and every changed hunk back to a criterion. It returns `clean`, `findings` or `incomplete`. A tool failure or missing source is `incomplete`, never clean. The lack of a reproduction does not refute a plausible defect, and an implementer's claim that a case is unreachable is something to check, not evidence. Weigh evidence with the [evidence ladder](../../.claude/reference/evidence-ladder.md). `.claude/workflows/pr-review.js` output is advisory.

Send findings back to the same implementer and the delta to the same reviewer. The budget is one full review plus one delta, counted across all PRs for the same parent issue. When the budget runs out with material findings, a new failure family appears, or reviewers disagree, stop patching: consolidate the root causes, change the approach, and choose a bounded next stage with an exit criterion. If that stage fails on the same mechanism, surface the blocker. Never waive a finding to fit the budget.

## 6. Readiness and merge

**Merge-ready** requires all of:

1. Acceptance criteria satisfied and relevant rules ambiguities resolved.
2. Every required review pass clean at the final head, with the coordinator's own review done to the tier's depth.
3. Required local checks and required GitHub checks green on that head. Investigate a flaky required check; at most two justified reruns.
4. All review feedback dispositioned, including automated reviewer comments.
5. PR non-draft, mergeable, based on main, with prerequisites merged.
6. PR body accurate about validation, Follow-ups and the handoff.

Any new commit invalidates readiness; editing the PR body does not. When main moves, intersect the PR's changed files with the files changed on main since review (Large: add consumers of any changed shared contract). No overlap plus green checks carries the review forward; overlap needs a delta review of those files. Post the readiness receipt as a PR comment.

With a grant, re-fetch head, base, checks, reviews and the grant immediately before merging, then:

```sh
gh pr merge <number> --squash --match-head-commit <full-reviewed-head-sha>
```

Never use `--admin`, unattended `--auto`, or any protection bypass. Merging to main deploys the game worker and runs production migrations, so merge order is rollout order: a reader ships and deploys before its writer. A merge grant covers that normal deployment, not separate production commands. After merging, confirm the merge SHA and watch post-merge checks; never report a deployment from the merge alone, and do not revert or repair production without authorization.

## 7. Monitoring, recovery and close-out

Prefer completion notifications to polling; when polling, back off while nothing changes. Watchers never merge. Before declaring an agent hung, inspect its output, process and working tree, and preserve partial work.

Update the run checkpoint at each state transition. On pickup after an interruption, reconcile it against GitHub, Linear and git before dispatching or merging; an old receipt never authorizes anything.

An issue is delivered when its PR is merge-ready (no grant), when it is verified merged with post-merge checks observed (grant), or with an evidence-backed no-change disposition. Blocked dependents and stack-ready candidates keep a run open. At close-out, report each issue's outcome, PR, evidence and blockers, plus the next runnable work. Clean up only run-owned workspaces whose work is delivered. Record a repeated failure as a GOTCHAS entry or a script, not a new charter rule.

## Sources

Adapted from the earlier Claude orchestration pipeline, [pstack](https://github.com/cursor/plugins/tree/main/pstack) (blast radius, independent challenge, verified delivery) and [Matt Pocock's skills](https://github.com/mattpocock/skills) (vertical slices, public-boundary tests, precise domain vocabulary).
