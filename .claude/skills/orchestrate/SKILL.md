---
name: orchestrate
description: Run a Linear scope (project, issue list, or single issue) through the Codex orchestration pipeline — Claude PMs/reviews/merges, Codex implements and opens all PRs. Args - a Linear project name (e.g. "VQA Polish"), a comma/space-separated list of issue IDs (e.g. "OPT-501 OPT-502"), or a single issue ID (e.g. "OPT-501").
---

# Orchestrate — Codex implementation pipeline

You are the orchestrator/PM. Codex implements every issue and authors every PR. You never write implementation code. Canonical policy: `docs/project/ORCHESTRATION-CHARTER.md`. Operational gotchas and validated recipes (sandbox, model routing, computer-use/VQA): recall from project memory (`project-codex-orchestration`) if present on this machine.

## Dispatch runtime (per machine)

Two supported backends — detect at kickoff and use one consistently for the run:

- **codex-companion** (original authoring machine): `codex-companion.mjs` on PATH. Dispatch with `task --background --write --model <model>`; poll `status <job-id>` / fetch `result <job-id>`; findings loops resume the implementation thread; adversarial reviews via `adversarial-review --base main --scope branch "<hunt brief>"`.
- **raw codex CLI fallback** (any machine with `codex` ≥ 0.144, validated 2026-07-15): dispatch as a **background shell task** — `codex exec -C <clone> -m <model> --sandbox workspace-write -c sandbox_workspace_write.network_access=true -` with the prompt on stdin (heredoc). Command equivalents:
  - *status/result polling* → not needed: the harness notifies on background-task completion; interim progress via the task's output file. The dispatching session must stay alive — jobs are not detached from it.
  - *thread resume (findings loop)* → `codex exec resume <session-id>` (session id is printed in the run header; capture it from the output file). Flag ordering: `resume` rejects `-C` — `cd` into the clone first and pass `--sandbox`/`-c` before the `resume` subcommand: `cd <clone> && codex exec --sandbox workspace-write -c sandbox_workspace_write.network_access=true resume <id> -`.
  - *adversarial-review* → `codex exec review` in the synced clone, or a fresh `codex exec` read-only task carrying the hunt brief against `git diff main...HEAD`.
  - *companion state-dir failure mode* → does not exist; sessions live in `~/.codex/sessions`. The "resumed threads pin creation-time sandbox policy" caveat still applies — dispatch fresh after config changes.
  - Codex may auto-add `[projects."/private/tmp/optcg-opt<NNN>"]` trust entries to `~/.codex/config.toml`; expected, leave them.
  - If `~/.codex/config.toml` lacks the sandbox network grant, pass it per-invocation as shown above rather than editing the config.

## 0. Resolve scope (flexible)

Parse `$ARGUMENTS` into one of:
- **Project**: a Linear project name → `list_issues(project=...)`; work all non-Done issues, honoring milestone/dependency sequence from the project description.
- **Issue set**: multiple issue IDs → fetch each with `get_issue`; infer ordering from `blockedBy` relations and ticket "Sequence" sections; otherwise treat as parallel-eligible.
- **Single issue**: one issue ID → a one-ticket run (still full pipeline: preflight, review gates, merge, close-out).

Confirm the resolved scope (issue list + proposed ordering/waves) with the user before dispatching.

## 1. Kickoff (one exchange, before any dispatch)

1. Fill in the charter §7 per-project decision table for this scope: model routing (default `gpt-5.6-sol` for anything ending in a pushed PR), clerical-git delegation (default: not authorized), merge authority (standing `gh pr merge` rule), extra preflight capabilities (e.g. browser/computer-use for VQA scopes). Present to the user for ratification.
2. Run the **preflight probe**: one throwaway Codex task from a fresh clone validating git write, push, `gh auth status`, and package-registry access — plus any extra capabilities the scope needs (for VQA: Chrome open → screenshot → describe → scroll/recapture, per the memory recipe and its capture caveats). Do not dispatch real work until the probe passes.

## 2. Per-issue pipeline

For each issue, in wave order (one issue per dependency track in parallel; wide-surface sweeps run alone, last).

**Queue discipline:** when a wave dispatches, every ratified-scope issue that is NOT part of the in-flight wave moves to Todo (queued for this run) — only actively dispatched issues sit In Progress. Apply at first dispatch (all later-wave issues → Todo) and re-assert at every wave boundary. Checked when: a `list_issues` over the scope shows exactly the in-flight wave In Progress and every other scope issue Todo or Done.

1. Linear → In Progress.
2. Fresh standalone clone: `git clone <local-repo> /private/tmp/optcg-opt<NNN>`, origin → GitHub URL, branch = the issue's `gitBranchName` from `origin/main`. Never git worktrees.
3. Dispatch via the machine's runtime (see **Dispatch runtime**) from the clone. Prompt embeds: full ticket text, fresh-inventory instruction, behavior-preservation + scope-freeze rules, scope fences naming sibling tickets' surfaces, validation expectations (baseline + post-change in PR body), deliverable spec (commit suffix `(OPT-NNN)`, push, `gh pr create` ready-for-review NOT draft, no merge, no Linear writes). Two standing prompt clauses:
   - **Red-first (bugfix tickets):** author the regression test before the fix and run it — the PR body shows the test failing on the pre-fix code (red), then passing after (green). A bugfix PR whose test never went red has not demonstrated it covers the bug.
   - **Tagged instrumentation:** any temporary debug output added while implementing carries a unique `[DEBUG-<tag>]` prefix; before committing, grep the tag and remove every hit. Untagged debug logs survive into PRs; tagged ones die.
4. On completion: sync clone to PR head (`git branch main origin/main` for review base), run the runtime's adversarial review with a targeted hunt brief naming failure classes, plus your own orchestrator review of the diff.
5. Findings → resume the implementation thread (runtime's resume mechanism) with the findings verbatim; re-verify the fix (delta review). Cap: 1 full + 1 delta; unresolved survivors stop the merge and surface to the user.
6. Merge gate: CI green + adversarial approve + your review clean → `gh pr merge <N> --squash --match-head-commit <reviewed-sha>`. Conflicts: merge `origin/main` into the branch (never rebase/force-push an open PR).
7. Linear → Done; verify the PR attachment; dispatch newly-unblocked issues.

## 3. Monitoring

**Companion:** poll job status via a background watcher loop (`status <job-id>` per workspace, every ~2 min, exit when all terminal); fetch results with `result <job-id>`. Known failure modes: stale per-workspace state dirs break new thread creation (move aside, re-dispatch). **Raw CLI:** rely on harness background-task completion notifications; read the task output file for interim progress. Both: resumed threads pin creation-time sandbox policy — dispatch fresh after config changes.

## 4. Close-out (scope complete)

1. Re-verify every issue is still Done in Linear (second-PR links can flip Done → In Progress).
2. For project scopes: mark the Linear project Completed; have Codex update/close the relevant handoff doc in `docs/project/handoffs/` via a final PR.
3. Compile deferred Follow-ups from merged PR bodies into the handoff or new Linear issues (per ticket instructions).
4. Clean up `/private/tmp/optcg-*` clones and any Codex-created working dirs for this scope.
5. Report the final scoreboard to the user.

Close-out is complete when every scope issue is Done in Linear with its merged PR attached, no `/private/tmp/optcg-*` directory for this scope remains (or its removal was denied and surfaced), and the scoreboard names every merged PR and every deferred follow-up by ticket.

## Hard rules

- Never author implementation code; never post approval verdicts to GitHub.
- Classifier denials are surfaced to the user, never worked around.
- Every merge is pinned to the reviewed commit.
- Codex never merges and never writes Linear.
