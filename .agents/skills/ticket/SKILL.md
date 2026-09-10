---
name: ticket
description: Implement a single Linear ticket with atomic commits, validation, a PR and a handoff under the track orchestration charter.
disable-model-invocation: true
argument-hint: "OPT-XXX"
---

# Work a Linear ticket

Read `docs/project/ORCHESTRATION-CHARTER.md` for the governing lifecycle, authority, preflight, review and readiness gates. A standalone ticket is a one-issue run. A dispatched implementer follows its coordinator's brief and returns its PR for review; it never merges or writes Linear. A coordinating agent may merge only under an explicit issue-scoped grant and the full charter gate. Codex and Claude coordinators may update issues and create relevant tickets. Document every update in a comment on that issue; document implementation-discovered tickets in a linked explanatory comment on the original ticket. Follow the charter for audit recovery and scope boundaries.

Use `orchestrate` for multi-issue scheduling. Do not block isolated work because unrelated PRs or dirty files exist. Inspect matching in-flight branches/PRs before creating duplicates. Fetch the real issue and necessary context; missing consequential requirements block that issue, not independent work.

## Ticket conventions

- Use the issue's `gitBranchName` when available. Otherwise use the repo convention `corymcunanan/opt-<number>-<title-slug>` from the verified prerequisite base.
- Commit one logical concern at a time, with an imperative subject ending `(OPT-XXX)`. Never amend pushed commits, force-push a reviewed PR, or skip hooks.
- Preserve behavior outside acceptance criteria. Put deferred findings in the PR body's **Follow-ups** section; unsafe changes cannot be excused as follow-ups.
- Measure a baseline, demonstrate the regression before fixing a bug, and run relevant checks plus the current required repository gate. Validation commands come from package scripts/CI, not stale examples.
- Push implementation commits before opening the PR. Describe the concrete problem and resulting behavior, link the issue, record validation baselines/results and limitations, and list follow-ups. Use a file or structured argument for multiline PR bodies.
- Include the next-ticket handoff in the same PR before final readiness assessment. Any subsequent commit renews review/readiness under the charter.

## Handoffs

Read `docs/project/handoffs/<project-slug>.md` when relevant. Reverify stale claims against current code and history. The coordinator owns any shared action-plan edits when parallel tickets would conflict; individual implementers supply their entries for serialized integration before final review.

A handoff contains the system-level change, files to read first, constraints/gotchas, unresolved work, and a PR/commit pointer. Keep it short; the diff already records file-by-file changes. Distinguish implementation, merge-ready and merged states. Report the next runnable ticket and explicit prerequisites; a dependent is blocked until its prerequisite merges unless stacking was enabled.

PR opening is an intermediate deliverable. A coordinator continues through independent review, findings correction, validation, and the readiness receipt. Merge execution and post-merge close-out follow the charter, including scope-matching permission and exact reviewed-head checks. Do not mark Linear status changes as performed unless an authorized actor actually performed them.
