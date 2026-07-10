# PR #255 Workflow Record and Retrospective

**Ticket:** OPT-439  
**Pull request:** [#255](https://github.com/corycunanan/optcg-sim/pull/255)  
**Outcome:** Squash-merged and verified on 2026-07-10

## Executive summary

PR #255 began as a fix for rejected prompt-response frame restoration. During review, testing exposed adjacent correctness issues in nested replacement effects and continuation-event processing. Those issues were fixed on the PR branch, reviewed again, and merged only after the exact reviewed head passed required checks.

The final reviewed head was `fea1188271bd598ede0eec69521f94c622cdd9b0`. The squash merge commit was `a981358999fbe2d3c3be5fbb72a3baba518bb559`. `main` was then synchronized to that merge commit and OPT-439 was confirmed Done in Linear.

## What was done

1. Re-read repository instructions and project workflow documentation.
2. Re-fetched PR metadata, the Linear ticket, local git state, commit history, and check status.
3. Inspected unresolved GitHub review comments and reviewed the PR diff in context.
4. Ran independent adversarial reviews against exact PR heads, using schema-contract, regression-breadth, and CI-signal lenses.
5. Implemented and tested fixes for the review findings:
   - preserved outer `remainingActions` through accepted nested `PLAYER_CHOICE` responses;
   - merged pending triggers instead of overwriting them;
   - preserved rejected-response markers;
   - kept replacement prompt contexts typed and distinct from resume contexts;
   - added production `GameSession.handleAction` coverage;
   - prevented accepted replacements from executing an `IF_DO` suffix;
   - resumed unmatched targets in nested replacement batches;
   - propagated continuation events and trigger prompt context through the pipeline;
   - prevented already-scanned continuation events from being matched twice.
6. Added focused regression coverage and ran the worker suite and typecheck.
7. Addressed the GitHub connection issue by using approved elevated `gh` commands when the sandbox could not reach GitHub. CodeRabbit was treated as advisory, per the user’s instruction, and was not a merge gate.
8. Merged with squash and `--match-head-commit`; never used `--admin` and did not delete the remote branch.
9. Verified the merge tree, synced `main`, and confirmed Linear status.

## Verification performed

- Focused prompt-response regression tests: 26 passing.
- Full worker test suite: 109 files, 1,155 tests passing.
- Worker typecheck passing.
- Touched-file lint: zero errors (existing warnings remained).
- GitHub CI and Vercel checks passed on the merged head.
- Reviewed-head tree matched `HEAD^{tree}` after synchronization.
- Working tree was clean after closeout.

## Workflow and skills used

The workflow combined the repository’s ticket process with the adversarial ticket-review process:

- `ticket`: Linear preflight, branch/PR lifecycle, status transitions, and handoff expectations.
- `ticket-review`: PR metadata and diff loading, Linear and handoff context, prioritized findings, and exact-head review.
- `github:gh-address-comments`: inspection of actionable review comments and thread state.
- `github:github`: PR metadata and check inspection.
- `linear:linear`: ticket status and project context verification.
- `openai-docs`: verification of the available OpenAI developer-docs connector and documented model routing; no model ID was invented or silently substituted.
- `codex exec review --model gpt-5.6-sol --ephemeral`: context-isolated review of the exact candidate head.

The project’s existing Claude and Codex workflow documentation was also consulted. The process followed the documented preflight → implement → verify → review → merge → handoff pattern, with additional exact-SHA merge controls from the project’s authorized policy.

## Retrospective

### What worked

- Exact-head reviews caught real correctness regressions that ordinary unit tests and green CI did not initially expose.
- Production-path tests in `GameSession` prevented the review from being limited to helper-level behavior.
- The reviewed-head merge policy made the final merge auditable.
- Elevated GitHub commands resolved the connection problem without weakening merge protections.
- The final full-suite run gave useful breadth confidence after several nested-state changes.

### What did not work

- The task expanded from a narrow rejected-frame fix into nested replacement batching and event-pipeline behavior without an explicit scope checkpoint.
- Multiple review/fix cycles repeated expensive context loading and made the closeout feel like a loop.
- GitHub sandbox networking was discovered late, slowing metadata and comment operations.
- Repository lint traversed `.claude/worktrees`, creating unrelated noise and runaway work.
- The game-engine handoff remained stale after merge, including its old commit and status.
- CodeRabbit rate limiting created uncertainty even though it was not required for authorization.

## Proposed workflow changes

1. **Add a scope-expansion checkpoint.** If review reveals a new subsystem or behavior family, stop and ask whether to expand the ticket or create a follow-up issue.
2. **Cap review cycles.** Allow one full review and one targeted delta review after fixes. Stop and request a decision after that instead of looping.
3. **Review before broad CI.** Establish a review-clean candidate first, then watch CI/Vercel. Treat CodeRabbit as advisory unless explicitly required.
4. **Use elevated GitHub access at preflight.** Run the approved `gh` metadata/check commands with the known network allowance from the start.
5. **Make lint scope explicit.** Exclude `.claude/worktrees/**` and other generated worktrees from repository-wide lint and typecheck discovery.
6. **Require a post-merge closeout checklist.** Verify merge SHA, reviewed SHA/tree, `main` synchronization, Linear Done status, handoff update, and branch-retention policy.
7. **Keep one canonical workflow document.** Consolidate Claude’s historical example and Codex’s current ticket/review skills into `docs/project/WORKFLOWS.md`, while keeping skills as executable instructions.
8. **Record stop conditions in the handoff.** Document reviewer disagreement, flaky checks, unresolved P0/P1/in-scope P2 findings, and user-required scope decisions as explicit stop conditions.

## Follow-up documentation gap

At closeout, `docs/project/handoffs/game-engine-correctness.md` still described OPT-439 as In Review and referenced an older commit. It should be refreshed in the next documentation pass, along with the Action Plan’s next-ticket state.

