---
name: orchestrate
description: Coordinate 1–N Linear issues in dependency tracks through implementation, independent review, and verified PR readiness. Supports explicit run-scoped opt-in merging. Use for ticket batches, tracks, or end-to-end orchestration.
---

# Orchestrate ticket tracks

Read and execute [the orchestration charter](../../../docs/project/ORCHESTRATION-CHARTER.md), the single authority for this workflow. Paths in that document are repository-root-relative unless linked otherwise.

Accept one or more Linear issue IDs or URLs, separated by spaces or commas. A project request resolves to an explicit issue list before dispatch. No issues supplied: ask for the scope; do not infer a backlog to work.

Examples:

- `$orchestrate OPT-501 OPT-502 OPT-503` — deliver verified merge-ready PRs.
- `$orchestrate OPT-501 OPT-502; allow merges for this run when all readiness gates pass` — coordinator may merge only these issues' fully assessed PRs.
- `$orchestrate OPT-501 OPT-502; allow stacking; stop at merge-ready` — dependent branches may start before their parents merge.

This skill is the fallback coordinator; the default entry is `/orchestrate` in Claude, which coordinates and reviews on Fable and dispatches implementation to Codex. Use this skill when that session is unavailable or out of budget, and record the fallback in the ledger.

It authorizes delegation to isolated implementation agents and independent reviewers. The coordinator declares a risk tier per issue (charter §3), owns scheduling, findings adjudication, readiness to the tier's depth, and any explicitly authorized merges. Implementers never merge or write Linear. Coordinators may update issues and create relevant tickets under standing user authorization. Document every update in a comment on the affected issue, and implementation-discovered tickets in a linked explanatory comment on the original ticket. Follow the charter for audit recovery and scope boundaries.

Model roles here: implementers are native Codex agents at `low` effort for Small and `medium` otherwise, given the dispatch brief only. Reviewers should stay cross-family: dispatch `claude -p` when the Claude CLI is available; otherwise use a native agent, record the lost diversity, and add a mutation check on each decisive guard. Small and Medium tickets cite CI for `pnpm verify` rather than rerunning it. Do not copy historical machine assumptions into dispatches.

Start by publishing the resolved scope, dependency tracks, readiness blockers, and effective permissions. Proceed on determinate issues without another approval exchange. Asking to create this workflow, discussing merge permission, or invoking the skill without an explicit grant does not authorize merging.

Read [OPTCG verification](../../../docs/project/ORCHESTRATION-OPTCG.md) for engine, card-schema, game-protocol, or board changes. Use [run records](../../../docs/project/ORCHESTRATION-RECORDS.md) for the durable ledger, dispatch brief, and readiness receipt. Follow existing ticket conventions for commits and handoffs; this charter supersedes conflicting ticket lifecycle, approval, and role instructions.
