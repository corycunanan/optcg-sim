---
name: orchestrate
description: Coordinate 1–N Linear issues in dependency tracks through implementation, independent review, and verified PR readiness, with explicit run-scoped opt-in merging.
argument-hint: "OPT-501 OPT-502 [allow merges for this run]"
---

# Orchestrate ticket tracks

Read and execute `docs/project/ORCHESTRATION-CHARTER.md`, the single lifecycle and authority policy. Read `docs/project/ORCHESTRATION-RECORDS.md` for the run ledger and readiness receipt. For engine, card-schema, protocol or board changes also read `docs/project/ORCHESTRATION-OPTCG.md`.

Accept issue IDs/URLs separated by spaces or commas, a single issue, or a project resolved to an explicit issue list. Publish scope, tracks, readiness blockers and effective permissions, then proceed with determinate work. Missing scope requires a concise question; unrelated PRs do not block the run.

The coordinator declares a risk tier per issue (charter §3), delegates isolated implementation and fresh independent reviews, reads reviewer reports and spot-checks one decisive claim (every hunk only for Large), and owns PR readiness. Implementation agents never merge or write Linear. Merge permission defaults off and requires an explicit scope-matching user grant; historical Claude merge permissions and shell allow rules do not supply that grant. Codex and Claude coordinators may update issues and create relevant tickets under standing user authorization. Document every update in a comment on the affected issue, and implementation-discovered tickets in a linked explanatory comment on the original ticket. Follow the charter for audit recovery and scope boundaries. No repeated approval exchange is needed for already granted work.

Model roles follow charter §4. The implementer is a fresh Claude Opus subagent, launched with the Agent tool as a background agent, and it works in a worktree you create from `origin/main` with dependencies installed. Save the brief as a packet file under the ledger's `packets/` directory. The dispatch prompt names the worktree, the packet path and the reply contents, and nothing else. Send review findings back to the same agent with SendMessage, and send deltas to the same reviewer.

Launch the Claude reviewer with the Agent tool's `model` set to the other Claude model from the implementer (`sonnet` for an Opus implementation, `opus` for a Sonnet one). Use a Sonnet implementer only in a run the user designated as the §4 Sonnet experiment. Delegate the §4 coordinator chores (overlap check, registry regeneration, check polling, consumer inventory, audit read-back) to a background `sonnet` subagent with a brief that names the one chore, its inputs and the structured result to return.

For Large tickets, run both §4 reviewers in parallel. Each works in its own detached worktree at the PR head and gets the same brief. The Codex lens runs as follows; its brief also gets the Codex environment entries from `GOTCHAS.md`:

```sh
codex exec -m gpt-6-astra -c model_reasoning_effort="medium" -C <review-worktree> --sandbox workspace-write -o <out.md> - < <brief.md>
```

Use `GOTCHAS.md` only for relevant historical environment evidence; it does not override the charter or current permissions. If independent review is unavailable, readiness is incomplete.

For frontend work, use the design/VQA supplement in `.claude/skills/orchestrate-frontend/SKILL.md` under the same charter. Existing `.claude/workflows/pr-review.js` results are advisory inputs; complete the charter's gates directly when that runner cannot establish them.
