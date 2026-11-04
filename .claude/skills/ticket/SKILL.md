---
name: ticket
description: Implement a single Linear ticket with atomic commits, validation, a PR and a handoff under the track orchestration charter.
disable-model-invocation: true
argument-hint: "OPT-XXX"
---

# Work a Linear ticket

A dispatched implementer works from its coordinator's brief, which is its complete policy: do not read `docs/project/ORCHESTRATION-CHARTER.md` or the run record unless the brief points at a section. Deliver the implementation, validation evidence at a stated rung, and a pushed PR with its handoff; never merge or write Linear. A standalone ticket with no coordinator is a one-issue run: follow the charter for authority, tier, review and readiness.

Use `orchestrate` for multi-issue scheduling. Do not block isolated work because unrelated PRs or dirty files exist. Inspect matching in-flight branches/PRs before creating duplicates. Fetch the real issue and necessary context; missing consequential requirements block that issue, not independent work.

## Ticket conventions

- Use the issue's `gitBranchName` when available. Otherwise use the repo convention `corymcunanan/opt-<number>-<title-slug>` from the verified prerequisite base.
- Commit one logical concern at a time, with an imperative subject ending `(OPT-XXX)`. Never amend pushed commits, force-push a reviewed PR, or skip hooks.
- Preserve behavior outside acceptance criteria. Put deferred findings in the PR body's **Follow-ups** section; unsafe changes cannot be excused as follow-ups.
- Measure a baseline, demonstrate the regression before fixing a bug, and run relevant checks plus the current required repository gate. Validation commands come from package scripts/CI, not stale examples.
- Push implementation commits before opening the PR. Describe the concrete problem and resulting behavior, link the issue, record validation baselines/results and limitations, and list follow-ups. Use a file or structured argument for multiline PR bodies.
- Write the handoff in the PR body (see Handoffs), not in a committed file. Editing the PR body does not change the head, so it does not renew review; any new commit still does.

## Handoffs

Put the handoff in the PR body under a **Handoff** heading: the system-level change, files to read first, constraints/gotchas, unresolved work, and the next runnable ticket with its prerequisites. Keep it short; the diff already records file-by-file changes. Distinguish implementation, merge-ready and merged states; a dependent is blocked until its prerequisite merges unless stacking was enabled.

Linear is the plan: roll-up parent issues set PR boundaries, `blockedBy` sets order, and issue comments carry context between sessions. When a later ticket depends on a handoff, the coordinator copies the relevant points into a comment on that issue or its parent, because implementers do not write Linear. Lessons that outlive one ticket go into GOTCHAS.md, CLAUDE.md/AGENTS.md or the engine docs through the PR.

Do not create or edit files under `docs/project/handoffs/`; it is a read-only archive. Older entries there, and engine docs that link to them, can still be useful context: reverify their claims against current code before relying on them.

PR opening is an intermediate deliverable. A coordinator continues through independent review, findings correction, validation, and the readiness receipt. Merge execution and post-merge close-out follow the charter, including scope-matching permission and exact reviewed-head checks. Do not mark Linear status changes as performed unless an authorized actor actually performed them.
