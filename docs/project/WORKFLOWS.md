# Workflows — Autonomous Linear Ticket Pipeline

> The canonical description of how tickets get implemented, reviewed, and merged in this repo.
> Executable instructions live in the skills; this doc is the map. If a skill and this doc
> disagree, fix the disagreement — don't fork a third description.
>
> Priorities, in order: **correctness > speed > cost.**

---

## The pipeline at a glance

```
Pick ticket (Linear Todo, priority order)
  → Preflight (clean tree, main synced, gh + Linear reachable, gh NETWORK verified)
  → Branch corymcunanan/opt-###-<slug>  → Linear: In Progress
  → Load handoff context (docs/project/handoffs/<project-slug>.md)
  → Implement + tests (engine changes: production-path coverage required)
  → PR (gh pr create)  → Linear: In Review
  → Adversarial lens review (pr-review workflow) — max 1 full + 1 delta cycle
  → Handoff entry committed on the branch
  → gh pr merge --auto --squash --match-head-commit <final-sha>
  → Babysit CI (/loop)
  → Close-out checklist (merge tree verified, Linear Done, handoff refreshed)
```

**Executable pieces:**

| Piece | Location | Role |
|---|---|---|
| `ticket` skill | `.claude/skills/ticket/SKILL.md` | The end-to-end driver: preflight → implement → review → merge → close-out |
| `pr-review` workflow | `.claude/workflows/pr-review.js` | Multi-model lens review; invoke via `scriptPath`, never `name:` (stale cache) |
| Handoff docs | `docs/project/handoffs/<project-slug>.md` | Cross-session context transfer, Action Plan state |
| Merge gate | GitHub `main-ci-gate` ruleset | Requires `ci` check; no bypass actors; auto-merge + auto-branch-delete enabled |

---

## Review: lenses and model routing

The `pr-review` workflow selects lenses by diff area and routes each to the cheapest model
that can do that job. Rationale and tuning history: the lenses come from this repo's actual
bug classes, not generic review categories.

| Lens | Model | Catches |
|---|---|---|
| rules-fidelity | GPT-5.6 Sol | Divergence from official rules/card text (docs/rules/, docs/cards/) — biggest bug class |
| ordering | GPT-5.6 Sol | Out-of-order/duplicate/stale prompt responses, disconnect mid-prompt — second biggest |
| adversarial | GPT-5.6 Sol | Decorrelated generalist pass, always runs |
| test-adequacy | GPT-5.6 Luna | Would tests fail on revert; production-path (GameSession.handleAction) coverage |
| api-boundary | GPT-5.6 Luna | Zod validation + authz on client-supplied payloads |
| blast-radius | GPT-5.6 Terra | Other consumers of touched handlers across 51 schema sets (informational, skips verify) |

**Verification is two gates, cheapest first:** (1) Codex cross-model refutation (Sol findings
refuted by Luna and vice versa, refute-by-default) kills most false positives at ~zero Claude
cost; (2) Claude Sonnet cross-family gate, majors only, batched one agent per file. Cross-family
matters because same-family reviewers share blind spots — Codex is the decorrelation play,
Claude verifies. False positives are the main tax in an unattended loop, hence refute-by-default.

Design-system rules are deliberately NOT a lens — mechanically checkable rules belong in
ESLint/CI, not in model reviews.

**Tuning:** lens prompts live in `pr-review.js` and are versioned in git. When a lens misses a
real bug or gets noisy, edit its prompt there and note why in the commit message.

---

## Rules that keep the loop safe (learned from PR #255)

The full retro: `docs/project/pr-255-workflow-retro.md`.

1. **Exact-head merges.** Auto-merge is always armed with `--match-head-commit` on the SHA that
   was reviewed (plus, at most, a docs-only handoff commit). If anything else lands on the
   branch, GitHub refuses the merge rather than merging unreviewed code. Never `--admin`.
2. **Review cycles are capped.** One full review + one delta review (`args: {base: <sha>}`) of
   the fix commits. Findings that survive the cap are a stop condition, not a third loop —
   repeated full re-reviews were the biggest latency and cost sink in PR #255.
3. **Scope freeze.** When review findings implicate a new subsystem or behavior family, the PR
   does not expand. File a follow-up Linear ticket with the finding evidence and keep the PR
   bounded. This is the autonomous analog of "stop and ask" — PR #255 tripled in scope without
   a checkpoint.
4. **Review before broad CI.** Establish a review-clean candidate first; CI/Vercel confirm it.
   CodeRabbit is advisory only — never a merge gate, never a reason to wait.
5. **Production-path tests for engine changes.** At least one test through
   `GameSession.handleAction` / the action pipeline. Helper-only coverage hid real integration
   bugs in PR #255.
6. **Close-out is a checklist, not a vibe.** Merge SHA + reviewed tree verified, `main` synced,
   Linear Done (re-verified at session end — a second linked PR can flip it back), handoff doc
   refreshed **including rows the merge made stale**, local branch deleted, tree clean.
7. **Preflight the network.** Run a real `gh` metadata call at preflight with the approved
   elevated commands; discovering sandbox network limits at merge time slows everything.
8. **Stop conditions are explicit and recorded in the handoff:** surviving critical/major
   findings after the capped cycles; unresolvable cross-family reviewer disagreement; a flaky
   required check (max 2 reruns); any scope decision only the user can make. On stop: disarm
   auto-merge, leave the PR open, write the handoff, surface.

---

## Tooling notes

- **Codex exec is sandboxed without network.** PR-mode diffs are materialized by the
  unsandboxed scope agent to `/private/tmp/pr-review-<pr>.diff`; branch mode uses local git.
- **GPT-5.6 model IDs** valid on this account: `gpt-5.6-sol` (frontier), `gpt-5.6-luna` (mid),
  `gpt-5.6-terra` (fast). Plain `gpt-5.6` is not valid. Reasoning effort: none/low/medium/high/xhigh
  (`minimal` is rejected).
- **Lint/typecheck scope:** `.claude/**` is excluded from ESLint and tsconfig — agent worktrees
  under `.claude/worktrees/` are full repo copies and traversing them is runaway duplicate work.
- **Empty diffs hard-stop the review.** Without that, lenses improvise ranges or read a
  reversed diff.

---

_Last updated: 2026-07-10 (PR #255 retro applied; supersedes the GSD-era guide — see git history for the old content)._
