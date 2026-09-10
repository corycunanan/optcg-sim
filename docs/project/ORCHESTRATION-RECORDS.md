# Orchestration run records

Use with the [charter](./ORCHESTRATION-CHARTER.md). These are records of observed work and user authorization, not an alternative policy or an executable merge gate.

## Durable ledger

Create `docs/project/handoffs/runs/<date>-<scope-slug>.md` for each run. The coordinator owns this file; parallel implementers do not edit it. Record its absolute workspace path in progress/handoff messages. Keep it locally during the run; include a stable snapshot in an authorized ticket PR only when it can be reviewed before readiness. Do not append a post-review commit and reuse the old receipt. Preserve the live ledger during workspace cleanup even if its final snapshot is not committed; report its path.

```markdown
# Run: <date / scope>

## Scope and permissions
- Issues: <explicit IDs; exclusions and externally blocked dependencies>
- Merge mode: off | on for <issue IDs>
- User grant: <exact instruction and conversation reference, or none>
- Stacking: off | explicitly allowed
- Linear writes: coordinator authorized by standing policy | <user-imposed restriction>
- Runtime/resources: <available agent slots, isolated workspace policy, browser/DB ownership>
- Coordinator ledger path: <absolute path>

## Tracks
| Track | Issue | Dependencies and reasons | Owned surfaces | State | Workspace/branch | PR/base PR | Head/base SHA | Next action/blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Decisions and evidence
- <decision, source, why it changes scheduling or implementation>
- <baseline command, exit/result, tested revision, log/artifact path>
- <readiness receipts or links>

## Recovery and follow-ups
- Active agent/thread IDs and ownership:
- Durable uncommitted/unpushed work:
- Next runnable frontier:
- Deferred findings, by ticket/PR:
- Linear audit trail: <issue, operation, before/after, reason, required comment URL(s), verified/pending>
- Follow-up origins: <new ticket → original ticket → original-ticket comment URL>
- Tracker drift/pending updates or comments:
```

## Dispatch brief

Embed the full resolved ticket and necessary comments/requirements, rather than expecting a network-restricted worker to retrieve them. Include:

- Ticket ID, acceptance criteria, relevant source evidence and any approved interpretation.
- Track, workspace/branch, base branch/full SHA, prerequisites and their verified state.
- Owned surfaces, sibling owners, excluded scope, and existing in-flight work to preserve.
- Relevant rules/scenario packet or design brief; name the one or two safety assumptions to prove.
- Public testing boundary, baseline/check expectations, regression evidence and known environment limitations.
- Deliverables: implementation commits, pushed PR, honest validation baseline/results, Follow-ups and next-ticket handoff; no merge, no Linear writes.

Reviewers receive the same intent and source packet plus the actual head/base diff. They independently examine the code and expected behavior; implementer conclusions are claims to check. Request `clean`, `findings`, or `incomplete`, with commands, results, scenarios, missing coverage, and full reviewed SHA.

## Readiness receipt

Create one per PR. Every field must contain observed evidence, an explicit applicable/non-applicable disposition, or a blocker. Blank/unknown is not a pass.

```markdown
### PR <number> — <ticket>
- Result: stack-ready | merge-ready | blocked | incomplete | merged | verified-no-change
- Head / base: <full SHAs; base branch must be main to merge>
- Assessed at: <timestamp>
- Scope and acceptance: <criterion → hunk/behavior → evidence>
- Coordinator review: <head, outcome, evidence location>
- Independent review: <reviewer, head, required passes and each outcome>
- Findings: <scenario/root cause, severity, evidence, resolution or blocker>
- Baseline/final validation: <commands, exit/results, revisions, logs; carried-forward checks and why>
- Rules / protocol / VQA: <applicable evidence or justified not applicable>
- GitHub checks: <required check inventory, runs/SHAs, successful conclusions>
- Review feedback / approvals: <all feedback dispositioned, unresolved threads, required approvals>
- Integration: <prerequisites, current main, conflict/mergeability assessment>
- Delivery: <handoff, accurate PR body, Follow-ups>
- Merge permission: <scope-matching user grant or off>
- Final recheck: <timestamp, unchanged head/base/checks/reviews, freshness enforcement>
- If merged: <merge SHA, ancestry/landed diff verification, post-merge CI/deploy results>
- Remaining work: <specific next action or none>
```

Never transform `incomplete` into `merge-ready` because no findings were returned. Merge authorization is independent of readiness: an assessed PR can be merge-ready with permission off, and a permitted PR can remain blocked.

For `verified-no-change`, record the acceptance criteria, current code/delivered PR proving each is already satisfied, verification command/results and revision, and any remaining uncertainty. No PR or merge receipt fields need be invented for an issue that needs no change.
