# Evidence ladder

Shared reference for every review lens, adversarial hunt brief, implementer prompt, and PR body in this repo. Adapted from pstack `blast-radius`. Skills point here; they do not restate the rungs.

A claim that a change is correct, safe, or covered sits on one of five rungs. State the rung next to the claim. A claim with no rung is rung 1.

| Rung | Name | What it takes |
|---|---|---|
| 1 | said so | Prose. Worthless on its own — it reads as convincing whether or not it is true. |
| 2 | pointed at the line | A real `file:line` in this repo, or the dependency's own source at the pinned version. |
| 3 | walked the failure | The bad case traced step by step through real code and shown not to reach. |
| 4 | ran it | A script or test that calls the real code and fails loud if the claim is false. The output is pasted. |
| 5 | reproduced in the app | Observed in the running app, dev server, or deployed preview. |

## Rules

- **Proven means rung 4 or 5.** A rung 1–3 claim is labelled `unproven` — it may still be true, but it does not close a finding, a merge gate, or a coverage matrix.
- **Find the one fact.** Most scary changes are safe because of a single fact ("this handler only runs for Character targets"). Spend the proof budget on that fact, not on a list of maybes.
- **Self-reports are rung 1.** An implementer's mutation matrix, coverage claim, or "all tests pass" is rung 1 until a reviewer re-runs it (memory: `verify-agent-self-reported-validation` — self-reported matrices were provably wrong twice).
- **Passing tests pin behaviour only if they can fail.** A test is rung 4 evidence for a guard only when deleting the guard turns it red. Comment out the guard, run the suite, restore, `git status --porcelain` empty. About a minute per guard.
- **A search that finds nothing is rung 2**, and is still an answer: name the search.
- **Don't round up.** Writing "verified" over a rung 2 claim is the failure mode this ladder exists to stop.

## Where it is used

- `pr-review` workflow lenses and refuters: each finding and each refutation names its rung; refuters treat rung ≤ 3 refutations as non-decisive.
- `/orchestrate` dispatch prompts: the PR body's validation section states a rung per claim.
- `/orchestrate` and `/orchestrate-frontend` hunt briefs: reviewers report CONFIRMED (rung 4–5, ran it) vs REASONED-ONLY (rung ≤ 3) per finding.
