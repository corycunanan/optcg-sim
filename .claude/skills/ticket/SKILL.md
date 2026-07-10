---
name: ticket
description: End-to-end Linear ticket workflow — pre-flight, branch, implement, atomic commits, PR, adversarial lens review, exact-head auto-merge, Linear status transitions, and cross-session handoff docs.
disable-model-invocation: true
argument-hint: "OPT-XXX"
allowed-tools: Bash Read Write Edit Grep Glob mcp__linear-server__get_issue mcp__linear-server__save_issue mcp__linear-server__list_issue_statuses mcp__linear-server__get_issue_status mcp__linear-server__get_project mcp__linear-server__list_projects
---

# Work a Linear Ticket

End-to-end workflow for taking a Linear ticket from "I'm starting this" through adversarial review, auto-merge, and close-out, with a cross-session handoff trail. Priorities, in order: **correctness** (exact-head merges, capped-but-mandatory review, production-path tests), **speed** (review before CI babysitting, delta reviews, preflight network checks), **cost** (cycle caps, Codex-first lens routing, docs-only deltas skip re-review).

## Argument

`$ARGUMENTS` is expected to be a Linear issue ID like `OPT-123`.
- If missing or not matching `^OPT-\d+$`, stop and ask the user for a valid ID. Do not guess.

---

## Phase 1 — Pre-flight

Do not begin any work until all of these pass. Run them in parallel where possible.

1. **Working tree is clean.** `git status --porcelain` must return empty. If dirty, stop and surface the changes — do not stash or discard without confirmation.
2. **No open PRs by the user.** `gh pr list --author @me --state open` must be empty. If any are open, list them and confirm before continuing (they may be abandoned work or in-review work the user forgot about).
3. **`main` is current and reachable.**
   - `git fetch origin main`
   - `git rev-parse HEAD` on local `main` matches `origin/main`. If not, check out `main` and pull fast-forward. If local `main` has diverged, stop and surface.
4. **Last merged PR is actually on `main`.** `gh pr list --state merged --limit 1 --json mergeCommit,number` — the merge commit should be reachable from `origin/main`.
5. **Linear and GitHub CLI are reachable.** If `gh auth status` fails or the `mcp__linear-server__*` tools error, stop and surface; do not fall back to guessing.
6. **Verify GitHub API reachability from this environment now, not later.** Run one real metadata call (e.g. `gh pr list --limit 1`). If the sandbox blocks network, use the approved elevated `gh` commands from the start — discovering this at merge time slows every metadata/comment operation (PR #255 lesson).

---

## Phase 2 — Fetch ticket + load handoff context

Run in parallel:
- `mcp__linear-server__get_issue` with the ticket ID.
- `mcp__linear-server__list_issue_statuses` for the team (needed for status transitions — never hard-code status names).

From the issue, extract: `title`, `description`, `state`, `priority`, `estimate`, `labels`, `project`, `assignee`, `url`, and any linked/blocking issues.

**Load the project handoff doc if it exists:**
- If the issue has a Linear project, slugify the project name (`lowercase-kebab-case`) and read `docs/project/handoffs/<slug>.md`.
- If it exists, surface the Action Plan row for this ticket and any inbound handoff prompt targeting this ticket.
- If the most recent handoff entry is more than **7 days old**, note it as potentially stale — re-verify against `git log` before trusting specific file/function claims.
- If the ticket has unresolved blockers (still Todo/In Progress in Linear), list them and ask the user whether to proceed.

---

## Phase 3 — Branch

Branch name format (match existing repo convention from `git log`):

```
corymcunanan/opt-<num>-<slug>
```

- `<num>` is the issue number.
- `<slug>` is the issue title, lowercased, non-alphanumerics → `-`, collapsed, trimmed, max ~60 chars. Do **not** hand-edit — slug from the Linear title verbatim so it's recognizable.

Create and check out:

```
git checkout -b corymcunanan/opt-<num>-<slug>
```

If the branch already exists, stop and ask — may be recovery work from a prior session.

**Update Linear to "In Progress"** via `mcp__linear-server__save_issue` (resolve the exact status name from `list_issue_statuses`). Set assignee to the current user if unset.

---

## Phase 4 — Understand before touching

Before edits:

1. Re-read the issue description closely. Note acceptance criteria, linked docs/PRs, and specific file mentions.
2. Audit the codebase for entry points relevant to the issue — use Grep/Glob, not guesswork. If the surface is wide or cross-cutting, spawn an `Explore` agent with a specific question.
3. If the ticket is ambiguous (multiple reasonable interpretations, wrong one wastes hours), **ask** rather than pick. Auto mode is not a license to guess on scope.
4. If the work needs a plan (>~3 files, new abstractions, new deps), write a short plan in chat first and proceed.

---

## Phase 5 — Implement with atomic commits

- Commit at **meaningful checkpoints**, not arbitrary line counts. A single logical concern = a single commit is fine. Two separable concerns (e.g., "add schema" + "consume schema") = two commits.
- Commit message format matches repo convention: **imperative sentence, ending with `(OPT-XXX)`**, optional body.
  ```
  Rate-limit /api/game/result and document secret rotation (OPT-188)
  ```
- Do **not** batch unrelated refactors, formatting passes, or tangential fixes into the ticket commit. Raise them as follow-ups in the handoff doc.
- **Engine changes need production-path coverage.** At least one test must exercise the change through the production entry point (`GameSession.handleAction` / the engine action pipeline), not only helper functions. Helper-only coverage has hidden real integration bugs before (PR #255).
- Never `--amend` a pushed commit. Never `--no-verify`. If a hook fails, fix the root cause.
- Run project checks before the final commit: `npm run type-check`, `npm run lint`, `npm test`. If any fail, fix before PR.

**Always create a final commit before opening the PR** — do not let uncommitted work get stranded.

---

## Phase 6 — Open the PR

1. `git push -u origin <branch>`.
2. Title: same shape as the last commit — `<Imperative description> (OPT-XXX)`. Keep under 70 chars.
3. Body: use the repo's existing format (see recent merged PRs via `gh pr view <N> --json body`). Structure:

   ```
   ## Summary
   - <1-3 bullets — the "why," not a line-by-line diff recap>
   - Link to the Linear issue: https://linear.app/optcg-sim/issue/OPT-XXX

   ## Test plan
   - [x] npm run type-check
   - [x] npm run lint
   - [x] npm test
   - [ ] <manual verification steps if UI/UX changed>
   ```

4. Create via `gh pr create` with HEREDOC body.
5. **Update Linear to "In Review"** and attach the PR URL to the issue (via `save_issue` comment or attachment).

---

## Phase 7 — Adversarial review

Review happens BEFORE babysitting broad CI. Establish a review-clean candidate first; CI/Vercel are cheap confirmation on top, not the other way around. CodeRabbit is advisory — never a merge gate, never a reason to wait.

1. **Record the candidate head:** `REVIEWED_SHA=$(git rev-parse HEAD)`.
2. **Run the lens review** (Codex lenses + cross-family Claude verification):
   `Workflow({scriptPath: '.claude/workflows/pr-review.js', args: {pr: <N>}})`.
   Always invoke via `scriptPath` — `name:` resolution has served stale cached copies after edits.
3. **Triage confirmed findings:**
   - Critical/major findings **within the ticket's subsystem** → fix on the branch, commit, push.
   - Findings that implicate a **new subsystem or behavior family** → **scope freeze**: do NOT expand the PR. File a follow-up Linear ticket (same project, link the finding evidence) and note it in the handoff. PR #255 grew from a narrow frame fix into nested-replacement batching and event-pipeline work with no checkpoint — in an unattended loop, the checkpoint is "file a ticket, keep the PR bounded."
   - Minors / `codexOnlyConfirmed` → fix if trivial, otherwise fold into the follow-up ticket.
4. **Cycle cap: one full review + one delta review.** After fixes, re-review only the delta: `args: {base: '<REVIEWED_SHA>'}` (branch mode diffs `base...HEAD`). Update `REVIEWED_SHA` to the new head. If confirmed critical/major in-scope findings still remain after the delta review, that is a **stop condition** — do not loop a third time. Repeated full re-reviews are the main cost and latency sink; the delta review exists so fixes don't pay for a second full pass.

**Stop conditions — halt and surface instead of looping.** Record the triggered condition in the handoff entry:
- Confirmed critical/major in-scope findings survive the capped review cycles.
- Cross-family reviewer disagreement you cannot resolve with a targeted test.
- A required check is flaky or infrastructure is failing (don't rerun more than twice).
- A finding forces a scope decision only the user can make (expand ticket vs. follow-up).

On stop: disarm auto-merge (`gh pr merge <N> --disable-auto`), leave the PR open, write the handoff entry with the stop condition, and surface to the user.

---

## Phase 8 — Write the handoff entry

For cross-session context transfer. See the `Handoff Docs` section below.

1. Ensure `docs/project/handoffs/<project-slug>.md` exists. If not, create from `docs/project/handoffs/_TEMPLATE.md` and fill the Action Plan from the Linear project's issues (ordered by dependencies → estimate → priority).
2. Update the Action Plan row for this ticket: status → **In Review**, PR link, date.
3. Append a new handoff section at the bottom keyed to the **next ticket** in the action plan (not the one just finished). Keep it tight — see the template.
4. Commit the handoff doc update **on the same branch** as the ticket work (single commit, message: `Add OPT-XXX → OPT-YYY handoff (OPT-XXX)`) and push. This keeps the handoff bundled with the PR so reviewers see it.
5. **Surface what's next** (see `Conclusion — surface what's next` below).

---

## Phase 9 — Arm the merge and babysit CI

1. **Pin the head.** `FINAL_SHA=$(git rev-parse HEAD)`. Verify the only commits between `REVIEWED_SHA` and `FINAL_SHA` are docs-only (the handoff commit): `git diff --name-only $REVIEWED_SHA $FINAL_SHA` — if anything outside `docs/` changed, go back to Phase 7 for a delta review first.
2. **Arm auto-merge pinned to that exact head:**
   `gh pr merge <N> --auto --squash --match-head-commit "$FINAL_SHA"`.
   This guarantees the merged tree is exactly the reviewed tree — if anything else lands on the branch, GitHub refuses the merge instead of merging unreviewed code. Never `--admin`. Branch deletion is repo-automatic; don't delete manually.
3. **Babysit CI** (`/loop` or Monitor): required `ci` check + Vercel. If a push is ever needed after arming, disarm (`gh pr merge <N> --disable-auto`), fix, delta-review (Phase 7 step 4), re-arm on the new head. Rerun a flaky check at most twice, then treat it as a stop condition.

---

## Phase 10 — After merge (close-out)

Run the full checklist — every item, every time. PR #255's handoff went stale because close-out was treated as "merge happened, done":
1. Verify the PR is merged: `gh pr view <N> --json state,mergeCommit,headRefOid`.
2. **Verify the merged tree matches the reviewed tree:** `headRefOid` must equal `FINAL_SHA`, and `git rev-parse <mergeCommit>^{tree}` must equal `git rev-parse $FINAL_SHA^{tree}` (squash merge preserves the tree).
3. Sync local `main`: checkout, fast-forward pull, confirm the merge commit is `HEAD`.
4. Update Linear status → **Done**. Re-verify at the very end of the session — Linear can flip Done → In Progress when a second PR links the ticket.
5. Refresh the handoff doc: this ticket's Action Plan row → Done with date and merge SHA, AND fix any other rows or commit pointers in the doc that this merge made stale (successor tickets referencing the pre-merge SHA, "Next up" lines, etc.). Updating only your own row is how docs rot.
6. Delete the local branch (`git branch -d`). The remote branch is auto-deleted on merge.
7. Confirm the working tree is clean.
8. **Surface what's next** (see `Conclusion — surface what's next` below).

---

## Conclusion — surface what's next

At the end of Phase 8 **and** Phase 10, end your reply with a short "Next up" line drawn from the Action Plan in the handoff doc. This runs unconditionally — even if the user didn't ask. The point is the user always knows what to pick up next.

Format:
```
Next up:
- OPT-YYY — <title> (critical path, <ready now | blocked on this PR merging | blocked on OPT-ZZZ>)
- OPT-WWW — <title> (parallel, <ready now | blocked on …>)
```

Rules:
- **Critical path** = the immediate successor whose dependencies satisfied by this ticket (or whose deps were already satisfied and is next by Order in the Action Plan).
- **Parallel** = any other Backlog/Todo ticket in the project whose deps are also now satisfied and can be picked up alongside the critical-path one. Skip this line if there's nothing parallel.
- After Phase 8, a successor strictly dependent on this ticket is "blocked on this PR merging" — say so. After Phase 10, that gate is gone — say "ready now."
- If the project has no remaining Backlog/Todo tickets, say "Project complete — no follow-up tickets in the Action Plan."
- Pull titles and statuses from the handoff doc's Action Plan table, not from memory.

---

## Handoff Docs

**Location:** `docs/project/handoffs/<linear-project-slug>.md` (one doc per Linear project).

**Purpose:** Carry context between agent sessions that work on different tickets in the same project. The goal is that a fresh session can read the doc + the ticket and be productive, without re-deriving the last session's findings from `git log`.

**What goes in a handoff entry (3–5 bullets, not an essay):**
- **Primer** — what changed at the system level (not file-by-file).
- **Files to read first** — paths the next agent should touch before editing.
- **Gotchas / do NOT touch** — areas the next agent should leave alone, and why.
- **Unresolved** — questions or deferred work, with tracking (another OPT-ID, a TODO, or "none").
- **Pointer** — commit SHA or PR number. The next agent runs `git show <sha>` for the diff; don't re-describe it.

**What does NOT go in a handoff:**
- A recap of the diff. That's what the commit/PR is for.
- Generic codebase knowledge — that belongs in `CLAUDE.md` or feature docs.
- Anything that would be obvious from reading the Linear ticket.

**Stale handoffs:** a handoff older than 7 days is a hint, not a source of truth. Re-verify claims against current code before acting on them.

---

## Failure modes — what to do

- **`gh` not authed** → stop, tell the user to run `gh auth login`. Do not proceed.
- **Linear MCP tool errors** → stop, surface the error. Do not silently skip status updates.
- **Branch already exists** → stop, ask whether this is recovery work or a naming collision.
- **Ticket has open blockers** → list them, confirm with user before branching.
- **Tests fail after implementation** → do not open the PR. Fix or escalate.
- **User interrupts mid-implementation** → commit WIP only if they ask; otherwise leave the tree as-is and surface state.

---

## Notes

- Status transitions use names **resolved at runtime** from `list_issue_statuses` (e.g., "In Progress," "In Review," "Done"). Team workflows vary; don't hard-code.
- Atomic commits are a guideline, not a quota. One cohesive change = one commit.
- This skill never force-pushes, never amends pushed commits, never uses `--no-verify`. Escalate instead.
