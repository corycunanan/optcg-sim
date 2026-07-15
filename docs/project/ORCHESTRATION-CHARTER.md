# Orchestration Charter — Agent-Run Project Pipeline

Standing agreement for projects run by the orchestrator (Claude) with Codex as implementer. Ratified by Cory 2026-07-15 after the Tech Debt project retro. Reconfirm the **per-project decisions** (§7) at each project kickoff; everything else is standing policy.

Kickoff driver: the `/orchestrate` skill (`.claude/skills/orchestrate/SKILL.md`) accepts a Linear project, an issue list, or a single issue.

## 1. Roles

- **Claude (orchestrator/PM):** sequencing, dispatch, Linear state, code review, merge execution, close-out. Never authors implementation code.
- **Codex (implementer):** all implementation, commits, pushes, and PR authorship. Never merges, never updates Linear.
- **Cory (owner):** authorization grants, policy decisions, tie-breaks surfaced by either agent.

## 2. Merge policy

- Triple gate before any merge: **CI green + Codex adversarial review (no unresolved material findings) + orchestrator review (no blocking findings)**.
- Squash merges only, pinned with `--match-head-commit <reviewed-sha>` — merged tree must equal reviewed tree.
- Merge authority: Claude, under the standing `Bash(gh pr merge:*)` allow rule. Approval *verdicts* are never posted to GitHub by the orchestrator (self-approval); review evidence lives in session reports and PR comments limited to findings.
- Review cycle cap: 1 full + 1 delta per PR; unresolved survivors stop the merge and surface to Cory.

## 3. Git history policy

- No force-push and no rebase on open PR branches. Conflicts are repaired by merging `origin/main` into the branch (squash flattens it).
- Exception: a branch may be rebased+force-pushed **before** its first review round if main moved during implementation.

## 4. Workspace & sandbox posture

- One standalone clone per ticket under `/private/tmp/optcg-opt<NNN>` (never git worktrees — worktree metadata lives outside the Codex sandbox).
- Codex sandbox: `workspace-write` with `network_access = true` and `/private/tmp` writable (user-ratified in `~/.codex/config.toml`). The CLI's `.git`-directory write protection stands; no engineered bypasses (e.g. `--separate-git-dir`) without explicit owner authorization.
- After any Codex config change: dispatch **fresh** tasks; resumed threads pin their creation-time sandbox policy. If thread creation fails with "failed to load configuration", move the workspace's companion state dir aside and re-dispatch.
- Classifier denials are surfaced to Cory, never worked around.

## 5. Wave discipline

- Preflight probe before wave 1 of every project: one throwaway Codex task validating git write, push, `gh auth status`, and package-registry access from a project clone. For projects needing extra capabilities (browser/computer-use, DB, deploy), extend the probe accordingly.
- One issue per dependency track in parallel; dependents dispatch on merge.
- Every parallel task's prompt carries scope fences naming what sibling tickets own.
- Wide-surface tickets (sweeps, mass migrations) run **alone, last**.
- Discovery-gated tickets may resolve as documented abstains — but the abstain must carry verification evidence, not just prose.

## 6. Prompts & repo policy

- Ticket prompts embed: full ticket text, fresh-inventory instruction, behavior-preservation and scope-freeze rules, validation expectations (baseline + post-change in PR body), deliverable spec (ready-for-review PR, no draft, no merge, no Linear writes).
- Repo `AGENTS.md` carries standing Codex policy: unrelated open PRs do not block ticket work; never merge PRs; never write Linear; record deferred findings as PR-body Follow-ups.
- Adversarial reviews use targeted hunt briefs naming the failure classes to refute; diffs containing generated mega-line files are reviewed via read-only task with `:(exclude)` instructions.

## 7. Per-project decisions (reconfirm at kickoff)

| Decision | Tech Debt (2026-07-15) | Next project |
| --- | --- | --- |
| Model routing | Sol for all tickets ending in a pushed PR (Terra blocked by `.git` protection) | TBD |
| Clerical-git delegation to orchestrator | Not authorized | TBD |
| Merge authority | Claude, standing rule | TBD |
| Extra capabilities in preflight | None | Browser/computer-use for VQA |
