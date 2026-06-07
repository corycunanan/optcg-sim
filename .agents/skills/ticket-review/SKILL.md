---
name: ticket-review
description: Adversarial code review for an open ticket PR. Accepts a GitHub PR number or OPT ticket ID, loads Linear, handoff docs, project docs, PR metadata, git history, and diffs, then produces prioritized review findings tied to file/line references.
disable-model-invocation: true
argument-hint: "OPT-XXX | PR #"
allowed-tools: Bash Read Grep Glob Agent mcp__linear-server__get_issue mcp__linear-server__list_issue_statuses mcp__linear-server__get_project mcp__linear-server__list_projects
---

# Review a Ticket PR

Perform an adversarial code review on an open PR created through the `ticket` workflow. The review should answer: "Does this PR actually satisfy the ticket without introducing regressions, hidden scope creep, weak tests, or handoff/documentation drift?"

## Argument

`$ARGUMENTS` may be:
- A Linear issue ID: `OPT-123`
- A loose ticket form: `OPT 123` or `OPT#123` (normalize to `OPT-123`)
- A GitHub PR number: `123`, `#123`, `PR 123`, or `PR #123`

If missing or ambiguous, stop and ask for either a valid `OPT-XXX` ticket ID or PR number. Do not guess.

---

## Phase 1 - Resolve the Target

1. Verify GitHub CLI is reachable:
   ```bash
   gh auth status
   ```

2. If given a PR number, load it:
   ```bash
   gh pr view <number> --json number,title,body,state,isDraft,author,headRefName,baseRefName,url,mergeStateStatus,reviewDecision,commits,files,labels,closingIssuesReferences
   ```

3. If given a ticket ID, find the open PR:
   ```bash
   gh pr list --state open --search "OPT-123 in:title,body,head" --json number,title,body,state,isDraft,author,headRefName,baseRefName,url,closingIssuesReferences
   ```
   - If exactly one PR matches, use it.
   - If none match, search recent open PRs by branch/body manually before stopping.
   - If multiple match, list them and ask which one to review.

4. Extract the ticket ID from the PR title, body, branch name, or linked closing issue reference.
   - If the PR number was provided and no ticket ID can be found, continue the PR review but note that Linear/handoff context is unavailable.
   - If the PR is closed or merged, stop unless the user explicitly asked for a post-merge review.

---

## Phase 2 - Load Ticket Workflow Context

Run independent reads in parallel where possible.

### Linear

If a ticket ID is known, fetch it with `mcp__linear-server__get_issue`.

Extract:
- `title`, `description`, `state`, `priority`, `estimate`, `labels`, `project`, `assignee`, `url`
- acceptance criteria
- linked, blocking, blocked-by, or related issues
- comments/attachments if exposed by the tool

If Linear cannot be reached, stop and surface the error. Do not pretend the ticket was reviewed against requirements.

### Handoff Docs

If the ticket has a Linear project:
1. Slugify the project name as `lowercase-kebab-case`.
2. Read `docs/project/handoffs/<project-slug>.md` if it exists.
3. Pull:
   - the Action Plan row for this ticket
   - inbound handoff entries targeting this ticket
   - the handoff entry added by this PR, if present
   - any next-ticket handoff that the PR claims to create

Flag as review risks:
- Action Plan status/PR/date not updated for the reviewed ticket.
- Handoff points at the wrong next ticket.
- Handoff recaps the diff instead of preserving system-level context.
- Latest relevant handoff is older than 7 days and the PR relies on it without re-verification.

### Project Docs

Read only docs that are directly relevant to the ticket or changed files:
- paths explicitly referenced by Linear, PR body, handoff docs, or code comments
- `docs/design/BRANDING-GUIDELINES.md` for UI/design changes
- `docs/game-engine/` and `docs/rules/` for game engine or rules changes
- `docs/architecture/` for system, API, data pipeline, auth, worker, or deployment changes
- `docs/project/` planning docs when the ticket belongs to a larger milestone

Do not bulk-load the whole docs tree. Use `rg` to locate specific claims.

### Git History

Establish the PR base and changed surface:
```bash
git fetch origin main
gh pr diff <number> --patch
gh pr view <number> --json commits,files
git log --oneline --decorate --max-count=20
```

For suspicious or high-risk files, inspect recent history:
```bash
git log --oneline -- <path>
git blame -L <start>,<end> -- <path>
```

Use history to test assumptions from handoff docs and to identify whether the PR reintroduces recently fixed bugs.

---

## Phase 3 - Inspect the PR Locally

Prefer reviewing on the PR branch when the working tree is clean:

1. Check local state:
   ```bash
   git status --short --branch
   ```
2. If clean, check out the PR branch:
   ```bash
   gh pr checkout <number>
   ```
3. If dirty, do not stash or overwrite. Continue with `gh pr diff`, `gh pr view`, and direct file reads where possible, and tell the user local checkout/tests were skipped because the worktree was dirty.

After checkout, inspect:
- full diff against base: `git diff origin/main...HEAD`
- changed file list: `git diff --name-status origin/main...HEAD`
- commit messages: `git log --oneline origin/main..HEAD`
- PR body test plan vs actual available scripts in `package.json`

---

## Phase 4 - Adversarial Review Passes

Review for defects, not style preferences. Findings must be actionable and grounded in exact code locations.

### Requirements Fit

- Does the implementation satisfy every Linear acceptance criterion?
- Did it implement behavior outside the ticket scope?
- Are linked/blocking issues respected?
- Does the PR body accurately describe the change and test plan?
- Does the handoff doc reflect the ticket workflow contract?

### Correctness

- Trace changed code from public entry points to state/data mutations.
- Check error paths, loading states, nullability, auth boundaries, stale closures, concurrency, ordering, race conditions, and rollback behavior.
- For API/database work, verify validation, authorization, query bounds, indexes, migrations, and backwards compatibility.
- For worker/game-engine work, verify action pipeline invariants, trigger ordering, effect schema compatibility, deterministic state transitions, and replay/resume behavior.
- For UI work, verify accessibility, keyboard/focus states, responsive behavior, text overflow, design token compliance, and no inline design styles.

### Regression Surface

- Search for all call sites of changed functions/types/components.
- Check whether tests cover old behavior that might have shifted.
- Compare against recent commits touching the same files.
- Look for data contract changes across `src/`, `workers/`, `pipeline/`, and Prisma boundaries.

### Tests and Verification

- Identify the narrowest meaningful checks for the changed surface.
- If checked out locally and dependencies are present, run focused tests first, then the repo's expected gate when feasible:
  ```bash
  pnpm verify
  ```
- If checks fail, include the failure as a review finding only when it reflects a PR problem; otherwise list it as a test environment limitation.
- Never mark a test plan item as verified unless you actually ran it or can cite CI status.

### Security and Data Safety

- Review auth/session checks for protected routes.
- Check trust boundaries on API input, WebSocket messages, worker actions, card data imports, and admin mutations.
- Look for secret leakage, unsafe logging, unbounded writes, destructive migrations, or tenant/user data exposure.

---

## Phase 5 - Findings Format

Lead with findings, ordered by severity. This skill uses the normal code-review stance.

Each finding should include:
- severity: `[P0]`, `[P1]`, `[P2]`, or `[P3]`
- exact file and line range
- why it is a bug or meaningful risk
- a concise fix direction
- the requirement, doc, test, or code path that proves it matters

Use inline review directives when supported:

```
::code-comment{title="[P1] Missing auth check" body="This endpoint now returns another user's deck when called with an arbitrary id. The ticket only authorizes deck owner access, so this needs to filter by session user or return 404." file="/absolute/path/src/app/api/decks/[id]/route.ts" start=42 end=47 priority=1 confidence=0.86}
```

If no defects are found, say that clearly and list residual risks or test gaps.

Do not fill the review with nits. Mention style only when it creates a maintainability, accessibility, product, or workflow risk.

---

## Phase 6 - Optional GitHub Review

Default: report findings in chat only.

Post to GitHub only when the user explicitly asks to post or submit the review.

When posting:
- Use `gh pr review <number> --comment` for informational reviews.
- Use `gh pr review <number> --request-changes` if there is any `[P0]` or `[P1]` finding.
- Do not approve a PR unless explicitly asked and no blocking findings exist.

---

## Final Response

Use this structure:

```
Findings
- [P1] <title> - <file:line>
  <one paragraph explanation and fix direction>

Open Questions
- <only if needed>

Verification
- <commands run and result, or why not run>

Context Checked
- PR #<number>, <ticket ID if known>, Linear issue, handoff doc, relevant docs, git diff/history
```

If no issues:

```
Findings
- No blocking findings.

Verification
- <commands run and result>

Residual Risk
- <untested paths, CI not checked, dirty worktree, missing Linear context, etc.>
```

Keep the response concise, but do not omit high-severity evidence.
