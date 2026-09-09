---
name: orchestrate
description: Run a Linear scope (project, issue list, or single issue) through the Codex orchestration pipeline — Claude PMs/reviews/merges, Codex implements and opens all PRs. Args - a Linear project name (e.g. "VQA Polish"), a comma/space-separated list of issue IDs (e.g. "OPT-501 OPT-502"), or a single issue ID (e.g. "OPT-501").
---

# Orchestrate — Codex implementation pipeline

You are the orchestrator/PM. Codex implements every issue and authors every PR. You never write implementation code. Canonical policy: `docs/project/ORCHESTRATION-CHARTER.md`. Validated gotchas (sandbox, clones, validation, merge, environments): `GOTCHAS.md` beside this file — read the section for the step you are on. Evidence standard for every claim in prompts, reviews, and PR bodies: `.claude/reference/evidence-ladder.md`.

## Runtime

Raw `codex exec` (≥ 0.146) dispatched as a **background Bash task** from the ticket's clone. Dispatch directly, never through the `codex:codex-rescue` forwarder. There is no other backend on this machine.

```bash
codex exec -C <clone> -m gpt-5.6-sol -c model_reasoning_effort="high" \
  --sandbox workspace-write -c sandbox_workspace_write.network_access=true - <<'EOF'
<prompt>
EOF
```

- **Effort is never inherited.** `~/.codex/config.toml` defaults to `low`. Pass `high` for anything that ends in a pushed PR or a review verdict, `low` only for read-only inventories and mechanical sweeps.
- **Session id** (needed for findings loops) is in the first line of the rollout file whose `cwd` is the clone; the newest match is the live thread. Record it in the ledger at dispatch:
  ```bash
  for s in ~/.codex/sessions/$(date +%Y/%m/%d)/*.jsonl; do head -1 "$s" | jq -r 'select(.payload.cwd=="<clone>") | .payload.id'; done
  ```
- **Resume** rejects `-C`: `cd <clone> && codex exec --sandbox workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort="high" resume <id> - <<'EOF'`. Resumed threads pin their creation-time sandbox policy — dispatch fresh after any `~/.codex/config.toml` change.
- **Structured verdicts**: reviews add `--output-schema <schema.json> -o <out.json>`; Codex writes schema-conforming JSON to the `-o` file and the merge gate reads that, not prose.
- Codex may add `[projects."/private/tmp/optcg-opt<NNN>"]` trust entries to `~/.codex/config.toml`; expected, leave them.
- Codex prompts are operator contracts: XML blocks for task, output contract, follow-through policy, verification loop, and action safety. One task per run.

## Run ledger

`/private/tmp/optcg-run-<scope-slug>.md`, created at kickoff, one row per issue: clone, session id, background task id, PR, review round (0 / full / delta), reviewed SHA, Linear state. Every state change in this skill writes its ledger row before the next tool call. The ledger is the source of truth after a context summary, a session restart, or a tmp-reaper kill (GOTCHAS: Dispatch) — read it first, trust it over memory.

## 0. Resolve scope

Parse `$ARGUMENTS` into one of:
- **Project**: a Linear project name → `list_issues(project=...)`; work all non-Done issues, honoring milestone/dependency sequence from the project description.
- **Issue set**: multiple issue IDs → fetch each with `get_issue`; infer ordering from `blockedBy` relations, ticket "Sequence" sections, shared files, and behavioral dependencies (a guard or allowlist that encodes what another ticket's code will do runs after that ticket); otherwise treat as parallel-eligible.
- **Single issue**: one issue ID → a one-ticket run (still full pipeline: preflight, review gates, merge, close-out).

**Readiness gate.** An issue is dispatchable when it carries the `Ready for agent` label (applied by `/triage-feedback`, `/investigate`, or the user after a decision pass). For every scope issue without it, read the description and classify: determinate (every acceptance criterion checkable, no 🟡/❓ items, premises cite `file:line`) or not. List the non-determinate ones with the open question each carries. Dispatching one encodes a guess that only surfaces at review time.

## 1. Kickoff (one AskUserQuestion, then one probe, before any dispatch)

1. **Ratify in a single `AskUserQuestion` call** (recommended option first, labelled `(Recommended)`):
   - *Scope and waves* — the issue list with proposed ordering and readiness verdicts.
   - *Routing and charter §7* — model (default `gpt-5.6-sol`), clerical-git delegation (default: not authorized), extra preflight capabilities (browser/computer-use for VQA scopes).
   - *Merge consent* — the option label carries the consent in plain words: **"Yes — merge Codex-authored PRs with no human review of the diffs, pinned to the reviewed commit"** versus "No — pause before each merge". The classifier requires this exact in-session consent; a generic "authorize merges?" has been ruled insufficient and then blocked every later dispatch.
   - *Non-determinate issues* (multiSelect) — which ones to wave through; apply `Ready for agent` to those.
   These are the decisions that block. Everything later proceeds under a stated assumption written to the ledger, except the two stops named in §2.5 and Hard rules.
2. **Preflight probe**: `codex --version`, `gh auth status`, `df -h /private/tmp` (≥ 3 GB free per parallel clone), then one throwaway Codex task from a fresh clone validating git write, push, and package-registry access — plus any extra capability the scope needs (VQA: Chrome open → screenshot → describe → scroll/recapture, GOTCHAS: Environments). Do not dispatch real work until the probe passes.
3. Create the run ledger.

## 2. Per-issue pipeline

For each issue, in wave order (one issue per dependency track in parallel; wide-surface sweeps run alone, last).

**Queue discipline:** when a wave dispatches, every ratified-scope issue that is NOT part of the in-flight wave moves to Todo (queued for this run) — only actively dispatched issues sit In Progress. Apply at first dispatch and re-assert at every wave boundary. Checked when: a `list_issues` over the scope shows exactly the in-flight wave In Progress and every other scope issue Todo or Done.

1. Linear → In Progress.
2. Fresh standalone clone: `git clone <local-repo> /private/tmp/optcg-opt<NNN>`, origin → GitHub URL, branch = the issue's `gitBranchName` from `origin/main`, `pnpm install --frozen-lockfile`. Never git worktrees.
3. **Dispatch** (Runtime) from the clone. Prompt embeds: full ticket text (re-fetched with `get_issue` at dispatch time — descriptions change after kickoff), fresh-inventory instruction, behavior-preservation + scope-freeze rules, scope fences naming sibling tickets' surfaces (fences admit mechanical consequences such as fixtures needing a new schema field), validation expectations (baseline + post-change in PR body; full vitest suite before push), deliverable spec (commit suffix `(OPT-NNN)`, push, `gh pr create` ready-for-review NOT draft, no merge, no Linear writes). Standing prompt clauses:
   - **Red-first (bugfix tickets):** author the regression test before the fix and run it — the PR body shows the test failing on the pre-fix code (red), then passing after (green). A bugfix PR whose test never went red has not demonstrated it covers the bug.
   - **Tagged instrumentation:** any temporary debug output carries a unique `[DEBUG-<tag>]` prefix; before committing, grep the tag and remove every hit.
   - **PR prose style:** lead with the outcome, ~20-word sentences, active voice with a named actor, one name per thing used verbatim throughout, exact `file:line` for every claim.
   - **Evidence rung per claim:** the PR body's validation section names the evidence-ladder rung (1 said so … 4 ran it, 5 reproduced in the app) next to every "covered", "preserved", or "safe" claim, and labels rung ≤ 3 claims `unproven`. An accurate report of partial coverage beats an inaccurate claim of full coverage. Paste the rung table from `.claude/reference/evidence-ladder.md` into the prompt.
   - **Environment facts:** deps are installed, do not run any install command (EPERM there is a sandbox artifact); no network and no Linear — missing external access is not grounds to stop.
   Dispatched when: the ledger row holds clone, session id, and background task id, and the scope shows exactly the in-flight wave In Progress.
4. **Review** on completion. Sync the clone (`git fetch origin && git branch -f main origin/main`), then run two reviews:
   - *Codex adversarial review*: a fresh `codex exec --sandbox workspace-write` at `high` with a hunt brief naming the failure classes to refute and `--output-schema` for findings `{file, line, title, detail, severity: critical|major|minor, rung: 1-5, verdict: CONFIRMED|REASONED-ONLY}`. CONFIRMED means rung 4–5 (ran it); the brief requires re-running every mutation or coverage matrix the PR body reports rather than trusting it. Embed the full ticket text; "do NOT use Linear/MCP/network — missing external access is not grounds to withhold a verdict". For engine tickets touching rules fidelity or prompt ordering, run the saved lens workflow instead: `Workflow({scriptPath: '.claude/workflows/pr-review.js', args: {pr: <N>}})` (always `scriptPath`, never `name`); delta via `args: {base: '<reviewed-sha>'}`.
   - *Orchestrator spec pass* in a **fork** (`subagent_type: "fork"`): map every ticket acceptance criterion to a hunk and every hunk to a criterion; unmapped hunks are scope creep to question; return the mapping table, not the diff. Any mutation the fork re-runs happens in an isolated clone of the clone with `node_modules` symlinked (GOTCHAS: Review), never in the tree the Codex reviewer is using. Consumer sweeps (who else uses a touched handler, prop, or token) go to an `Explore` agent. Verify any reachability claim a reviewer makes before it decides a merge.
   Reviewed when: every finding carries severity, rung, and verdict; every acceptance criterion maps to a hunk; the ledger holds the reviewed SHA and round.
5. **Findings loop**: resume the implementation thread with the findings JSON verbatim; re-verify with a delta review. Cap: 1 full + 1 delta. A survivor after the cap stops the merge and goes to the user via `AskUserQuestion` with the recommendation first — merge plus a follow-up ticket when no authored card exercises the shape; one bounded extra delta when the survivor refines an already-triaged finding.
6. **Merge gate**: CI green + adversarial verdict clean + spec pass clean. Wait for CI with `gh pr checks <N> --watch --fail-fast` as a background task (the harness notifies on exit); before reading silence as "slow CI", check `gh pr view <N> --json mergeable,isDraft` — conflicting PRs get no check suite and Codex sometimes converts to draft. Resolve the full 40-char SHA via `gh pr view <N> --json headRefOid`, then `gh pr merge <N> --squash --match-head-commit <sha>`. Conflicts: merge `origin/main` into the branch (never rebase/force-push an open PR).
7. Linear → Done; verify the PR attachment; re-check every open sibling PR's mergeability; dispatch newly-unblocked issues; write the ledger row.

## 3. Monitoring

- The harness re-invokes you when a background task exits. Never poll with `sleep` loops; foreground sleep is blocked.
- Interim progress, when needed: `Monitor` on the task's output file with a filter that matches progress **and** failure signatures (`error|EPERM|ENOSPC|approval|Killed`), timeout ≤ 1 h. Silence is not success.
- A task whose output file has not grown in 1 h is hung: `TaskStop` it, re-dispatch fresh with a priority-ordered prompt.
- Runs that span days: push WIP before stopping for the day (GOTCHAS: Dispatch, tmp reaper). Another session may merge to `main` mid-run — re-sync before each dispatch and before final validation.

## 4. Close-out (scope complete)

1. Re-verify every issue is still Done in Linear with `get_issue` per id (`list_issues` with a `query` matches titles, not identifiers; second-PR links can flip Done → In Progress).
2. For project scopes: mark the Linear project Completed; have Codex update/close the relevant handoff doc in `docs/project/handoffs/` via a final PR.
3. Compile deferred Follow-ups from merged PR bodies into the handoff or new Linear issues (per ticket instructions).
4. Remove this scope's clones one at a time (`rm -rf /private/tmp/optcg-opt<NNN>`, never the `optcg-*` wildcard — sibling clones belong to other runs) and the ledger.
5. Report the final scoreboard to the user.

Close-out is complete when every scope issue is Done in Linear with its merged PR attached, no clone for this scope remains (or its removal was denied and surfaced), and the scoreboard names every merged PR and every deferred follow-up by ticket.

## Hard rules

- Never author implementation code; never post approval verdicts to GitHub.
- Classifier denials are surfaced to the user, never worked around.
- Every merge is pinned to the reviewed commit.
- Codex never merges and never writes Linear.
- Only three things block on the user: kickoff ratification, a review-cap survivor, and a classifier denial. Everything else proceeds under an assumption written to the ledger.
