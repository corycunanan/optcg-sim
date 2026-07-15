# Tech Debt Project Retro (2026-07-15)

**Outcome:** All 15 scoped issues merged in one day (PRs #323–#337, plus #338 handoff close-out). Every merge passed a triple gate — CI, Codex adversarial review, orchestrator review — pinned to the reviewed commit (`--match-head-commit`). Two discovery-gated tickets resolved as judgment calls with evidence: OPT-106 (adopt, 3 qualifying consumers) and OPT-265 (abstain, backed by 7 new behavior tests). Orchestration by Claude (PM/review), implementation and PR authorship by Codex (GPT-5.6).

## What went well

1. **Adversarial review was the MVP.** Six substantive pre-merge catches that CI and implementer validation missed: an all-or-nothing Zod parse that would blank every active-effect tooltip when a dynamic (`PER_COUNT`) modifier was in play (OPT-194); a concede flow that validated the POST response with the GET schema and stranded users post-concession (OPT-383); OPT-412 dropping the CI vocabulary guard its own ticket said to keep; an abstain decision whose claimed test evidence didn't exist in the diff (OPT-265); stale-completion guards that protected state but not caller outcomes (OPT-106); and a PUT removal that would 405 stale browser tabs (OPT-198). Every late-wave PR had at least one real finding — the layer never rubber-stamped.
2. **Targeted hunt briefs beat generic review prompts.** Telling the reviewer which failure class to refute (semantic parity, schema strictness, auth drift, coverage-vs-claims) is what surfaced the findings above.
3. **Dependency-aware wave scheduling.** One issue per milestone track in parallel; dependents dispatched on merge. Critical path (OPT-101 → 384 → 412) never stalled on unrelated work; peak 5 concurrent implementation jobs.
4. **Scope fences in prompts.** Each parallel task was told what its siblings owned. Four simultaneous app-side PRs produced only one conflict.
5. **Evidence-gated discovery tickets.** The system resisted both failure modes: forcing an abstraction (OPT-265 abstained) and rubber-stamping inaction (the abstain had to earn its evidence in review).
6. **Model-routing sanity check up front.** The initial Sol/Terra routing table had the tiers inverted vs. the repo's own pr-review definitions; correcting before dispatch put the strongest model on the hardest tickets from wave 1.

## What to improve

1. **Front-load an environment preflight.** ~2 hours of wave 1 went to serially discovering Codex sandbox constraints (worktrees unusable → network off → resumed threads pin stale sandbox policy → stale state dirs break thread creation → `.git`-named dirs are write-protected regardless of config). A 60-second probe task (git write, push, `gh auth`, npm) before wave 1 of any project catches these up front.
2. **Terra economy never materialized.** All tickets ultimately shipped on Sol — only Sol works around the `.git` protection (it builds secondary git-dirs in writable tmp to commit/push from). Decide per project: accept Sol-only, or delegate clerical git/PR steps to the orchestrator so cheap tickets can run on the fast tier.
3. **Front-load authorization.** Merge policy, history-rewrite policy, and sandbox posture each stalled the pipeline mid-flight when the harness classifier (correctly) demanded explicit human grants. The orchestration charter (see `ORCHESTRATION-CHARTER.md`) settles these before dispatch.
4. **Serialize wide-surface tickets last.** Both conflict repairs involved sweep-style tickets (api-client adoption, cast sweep) that touch everything; the repair round-trips cost more than the parallelism saved.
5. **Standing agent policy in the repo.** Codex's ticket-skill preflight paused three times on an unrelated open PR; the fix is a repo `AGENTS.md` policy line, not per-prompt boilerplate.
6. **Tooling quirks (documented in orchestration memory):** companion `--background` inconsistently honored; `adversarial-review` hits `ENOBUFS` on generated mega-line files (fallback: read-only task with `:(exclude)` diff instructions); one CI run silently failed to trigger on push (close/reopen re-triggers).

## Deferred follow-ups

- Remove the OPT-198 PUT compatibility shim after the next release.
- Deduplicate the `assertNever` helpers introduced across OPT-193 cost modules.

See `docs/project/handoffs/tech-debt.md` for per-issue outcomes.
