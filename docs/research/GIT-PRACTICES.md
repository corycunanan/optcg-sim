# Git Practices for AI-Assisted Development

> Lessons and conventions for managing a medium-scale TypeScript monorepo (Next.js + Cloudflare Workers) where most code is written by AI agents in Cursor.

---

## The Core Problem

AI agents accumulate changes across an entire session and commit everything at once unless explicitly told otherwise. A single session might produce a bug fix, a refactor, new tests, documentation, and a data model change — all landing as one 5,000-line commit. This makes the git history useless for debugging, reverting, or understanding what changed when.

The solution is behavioral (instruct agents via Cursor rules) and structural (branching strategy, tagging, gitignore hygiene).

---

## 1. Atomic Commits

### Principle

One commit = one logical unit of work. A "unit" is the smallest change that makes sense on its own.

### What counts as one commit

| Scope | Example |
|-------|---------|
| Bug fix + its test | Fix life-out defeat bug + 2 regression tests |
| New utility function + its test | `returnDonToDeck()` + unit tests |
| Refactor of one module | Split `execute.ts` into `phases.ts` + `battle.ts` |
| Documentation about work just committed | Update M3.5 milestone doc after completing a task |
| Dependency change | Add vitest to `workers/game/package.json` |

### What does NOT belong in one commit

- A bug fix and an unrelated refactor
- Code changes and a documentation update about a *different* topic
- Multiple independent tasks from a multi-task session

### Enforcing with AI agents

Add a Cursor rule (`.cursor/rules/atomic-commits.mdc`) with `alwaysApply: true` that instructs agents to commit after each task. Key directives:

- Commit after completing each discrete task, not at the end of the session
- Include tests with their implementation in the same commit
- Include documentation about the code change in the same commit
- Do not push unless explicitly asked

Without this rule, agents will reliably accumulate all changes and ask "should I commit?" only at the end.

---

## 2. Commit Message Convention

### Format

```
<phase>: <concise description>
```

The phase prefix ties the commit to the project milestone, making `git log --oneline` scannable.

### Examples

```
M3.5: Fix blocker once-per-battle validation (§7-1-2-1)
M3.5: Add returnDonToDeck() and drawCards() utilities
M3.5: Migrate game board inline styles to Tailwind
M4: Effect parser — keyword auto-effects
M4: Auto-trigger system for [On Play] and [When Attacking]
```

### Multi-line messages

For larger changes, use a summary line + body:

```
M3.5: Fix life-out defeat bug (§7-1-4-1-1-1)

Restructured the damage loop so damagedPlayerIndex is only set when
life is already 0 at the start of a damage instance. Added 2 regression
tests: normal damage to 0 life (survive) and Double Attack with 1 life
(defeat on second damage point).
```

---

## 3. Branching Strategy

### For small, safe changes (M3.5-style)

Commit directly to `main`. Bug fixes, one-line validation patches, documentation updates, and utility functions are low-risk and don't benefit from branch isolation.

### For large features (M4-style)

Use a feature branch:

```bash
git checkout -b feature/m4-effect-engine
```

The effect engine will be in a half-working state for days or weeks as the parser, trigger system, and modifier layers are built incrementally. A branch keeps `main` deployable while allowing frequent commits of incomplete work.

Merge to `main` at meaningful checkpoints — not "the whole feature is done," but at stable intermediate states:

- Effect parser handles all keyword effects
- Auto-trigger system fires for [On Play]
- Modifier layers compute power/cost from active effects

### For parallel experiments

If testing two approaches to the same problem (e.g., different effect resolution strategies), use short-lived branches:

```bash
git checkout -b experiment/effect-resolution-queue
git checkout -b experiment/effect-resolution-stack
```

Pick the winner, merge it, delete the other.

---

## 4. Tagging Milestones

Lightweight tags mark completion of each project phase:

```bash
git tag m3.5-complete
git tag m4-complete
```

This provides instant reference points without digging through commit messages. Useful for:

- "What did the engine look like before M4?" → `git diff m3.5-complete..HEAD`
- "What changed in M4?" → `git log m3.5-complete..m4-complete --oneline`
- Rolling back to a known-good state if a milestone introduces regressions

---

## 5. .gitignore Hygiene

### What to exclude

| Pattern | Reason |
|---------|--------|
| `workers/game/.wrangler/` | Wrangler dev server state — SQLite DBs, temp bundles |
| `node_modules/` | Dependencies — installed from lockfile |
| `.next/` | Next.js build output |
| `data/` | Large pipeline source data (JSON, images) |
| `.env*` | Secrets |
| `*.tsbuildinfo` | TypeScript incremental build cache |

### When untracked files appear in `git status`

Before committing, always check for unexpected untracked files. Build artifacts, editor state, and temp files showing up in `git status` means `.gitignore` needs an update — fix the ignore rule before committing, not after.

---

## 6. Working with AI Agents

### Problem patterns

| Pattern | Consequence | Prevention |
|---------|-------------|------------|
| Agent makes 6 changes, commits once at end | Monolith commit, impossible to bisect | Cursor rule: commit after each task |
| Agent commits build artifacts | Bloated repo, noisy diffs | Cursor rule: never commit files in `.gitignore` |
| Agent pushes without asking | Half-done work on remote | Cursor rule: commit only, push on request |
| Agent amends a pushed commit | Force-push required, breaks collaborators | Cursor rule: never amend pushed commits |
| Agent commits `.env` or credentials | Security risk | Cursor rule + `.gitignore` |

### Agent instructions that work

Vague instructions like "use good git practices" don't change behavior. Specific directives do:

- "Commit this fix before moving to the next task"
- "Do not include the documentation update in this commit — I want it separate"
- "Push when all three tasks are done"

The Cursor rule handles the default case; explicit instructions override for specific situations.

### Reviewing agent commits

Agents write reasonable commit messages but may:

- Over-describe obvious changes ("Update the file to fix the bug that was causing...")
- Under-scope what changed (commit message says "fix X" but also refactored Y)
- Miss files (staged some changes but not all)

Run `git diff --cached --stat` before confirming a commit to verify scope matches intent.

---

## 7. Useful Commands

```bash
# See what would be committed
git diff --cached --stat

# Interactive stage — pick which changes to include
git add -p

# Verify nothing unexpected is staged
git status

# View recent history, compact
git log --oneline -10

# Compare current state to a milestone tag
git diff m3.5-complete..HEAD --stat

# Find which commit introduced a bug
git bisect start
git bisect bad HEAD
git bisect good m3.5-complete

# See all tags
git tag -l

# Undo the last commit (keep changes staged)
git reset --soft HEAD~1
```

---

## Summary

| Practice | Why |
|----------|-----|
| Atomic commits | Debuggable, revertible, readable history |
| Phase-prefixed messages | Scannable `git log`, ties commits to milestones |
| Feature branches for large work | `main` stays deployable |
| Milestone tags | Instant reference points for diffing and rollback |
| `.gitignore` hygiene | No build artifacts in the repo |
| Cursor rule for agents | Agents commit per-task by default |

The goal isn't git perfection — it's a history that's useful when something breaks and you need to understand what changed, when, and why.
