# Orchestration run records

Use with the [charter](./ORCHESTRATION-CHARTER.md). These are records of observed work and user authorization, not an alternative policy or an executable merge gate.

## Current checkpoint and durable ledger

Keep one readable current-state checkpoint at the top, aiming for roughly 500 words plus references. Replace it at state transitions; move superseded checkpoints and chronological detail into a linked history file. Retain normal spacing and prose; shorten by linking evidence, not by compressing words together. Workers receive only their bounded stage packet and necessary source evidence, never the entire ledger or coordinator conversation. Reuse source packets by reference and send changed facts for deltas.

The checkpoint names scope/permissions, workspaces and owners, current head/base, unresolved findings, completed evidence, active job IDs, and the exact next action. Raw logs belong in artifacts rather than repeated ledger entries.

Create `docs/project/handoffs/runs/<date>-<scope-slug>.md` for each run. The coordinator owns this file; parallel implementers do not edit it. Record its absolute workspace path in progress/handoff messages. Keep it locally during the run; include a stable snapshot in an authorized ticket PR only when it can be reviewed before readiness. Do not append a post-review commit and reuse the old receipt. Preserve the live ledger during workspace cleanup even if its final snapshot is not committed; report its path.

```markdown
# Run: <date / scope>

## Current checkpoint
<Current scope/permissions, owners, head/base, findings, evidence, active jobs and next action; replace in place.>
- History: <linked chronological artifact; retrieve only as needed>

## Scope and permissions
- Issues: <explicit IDs; exclusions and externally blocked dependencies>
- Merge mode: off | on for <issue IDs>
- User grant: <exact instruction and conversation reference, or none>
- Stacking: off | explicitly allowed
- Linear writes: coordinator authorized by standing policy | <user-imposed restriction>
- Runtime/resources: <available agent slots, isolated workspace policy, browser/DB ownership>
- Coordinator ledger path: <absolute path>
- External evidence: <required source, acquisition owner, access/result, affected gate, pending decision or explicitly approved exception and limitation>

## Tracks
| Track | Issue | Dependencies and reasons | Owned surfaces | State | Workspace/branch | PR/base PR | Head/base SHA | Next action/blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Decisions and evidence
- <decision, source, why it changes scheduling or implementation>
- <evidence ID, command/environment, exit/result, tested revision, affected surfaces, log/artifact path; reuse assessment against current delta>
- <parent issue/stage; actual models/efforts; full/delta reviews, diagnostic probes and repair cycles; finding → detecting reviewer; design checkpoint and bounded exit criterion>
- <readiness receipts or links>

## Recovery and follow-ups
- Active agent/thread IDs and ownership:
- Durable uncommitted/unpushed work:
- Next runnable frontier:
- Usage/outcomes: <elapsed time to verified delivery; observed approval, capacity and CI waits distinguished from active work where timestamps permit; token/usage source and parent/child coverage if available, otherwise unavailable>
- Deferred findings, by ticket/PR:
- Linear audit trail: <issue, operation, before/after, reason, required comment URL(s), verified/pending>
- Follow-up origins: <new ticket → original ticket → original-ticket comment URL>
- Tracker drift/pending updates or comments: <include integration-set Done with merged/verification-pending state, merge SHA, active check/monitor IDs; reconcile failures or interrupted monitoring>
```

## Dispatch brief

Embed the full resolved ticket and necessary comments/requirements, rather than expecting a network-restricted worker to retrieve them. Include:

- Ticket ID, acceptance criteria, relevant source evidence and any approved interpretation.
- Track, workspace/branch, base branch/full SHA, prerequisites and their verified state.
- Owned surfaces, sibling owners, excluded scope, and existing in-flight work to preserve.
- Relevant rules/scenario packet or design brief; name the one or two safety assumptions to prove.
- Public testing boundary, exact commands and working directory, explicit test paths/selectors and expected collected files/cases, regression evidence and known environment limitations.
- For broad execution-ownership refactors: short before/after reporting, advancement, wait/completion/terminal and cleanup contract, plus the representative handoff to prove before sweeping callers.
- Deliverables: implementation commits, pushed PR, honest validation baseline/results, Follow-ups and next-ticket handoff; no merge, no Linear writes.

Dispatches name the selected model/effort, bounded responsibility, stopping condition and expected output. Reviewers receive the same intent and source packet plus the actual head/base diff, with distinct spec and high-risk correctness hunt briefs when both are required. They independently examine the code and expected behavior; implementer conclusions are claims to check. Request `clean`, `findings`, or `incomplete`, with commands, results, scenarios, missing coverage, and full reviewed SHA.

Chore replies use a short decision-relevant summary (aim for 300 words or less), blockers/uncertainty, revision and evidence path. Store detailed inventories/tables in the artifact rather than returning them inline. Never truncate a material finding to fit the summary.

## Readiness receipt

Create one per PR. Every field must contain observed evidence, an explicit applicable/non-applicable disposition, or a blocker. Blank/unknown is not a pass.

```markdown
### PR <number> — <ticket>
- Result: stack-ready | merge-ready | blocked | incomplete | merged | verified-no-change
- Head / base: <full SHAs; base branch must be main to merge>
- Assessed at: <timestamp>
- Scope and acceptance: <criterion → hunk/behavior → evidence>
- Coordinator review: <head, outcome, evidence location>
- Models: <actual coordinator, implementer, spec/correctness reviewer models and efforts; provider diversity and fallback reasons>
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

## Artifact provenance

Derive scenario, pause, test and inventory totals from the source manifest or test report with a command; distinguish scenarios, starting pauses, later replay pauses and test executions. Reuse that result in the PR body, ledger and tracker. Pin corpus producer/reader SHAs and artifact hashes. When only metadata changes, verify payload identity before carrying evidence forward. Correct reporting errors explicitly without treating a corrected count as missing coverage or regenerating historical evidence.
