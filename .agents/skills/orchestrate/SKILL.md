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

This skill authorizes delegation to isolated implementation agents and independent reviewers. The coordinator owns scheduling, findings adjudication, readiness, and any explicitly authorized merges. Implementers never merge or write Linear. Coordinators may update issues and create relevant tickets under standing user authorization. Document every update in a comment on the affected issue, and implementation-discovered tickets in a linked explanatory comment on the original ticket. Follow the charter for audit recovery and scope boundaries. The default runtime is native agent tools; use an available CLI backend only when necessary. Do not copy historical model identifiers or machine assumptions into dispatches.

Start by publishing the resolved scope, dependency tracks, readiness blockers, and effective permissions. Proceed on determinate issues without another approval exchange. Asking to create this workflow, discussing merge permission, or invoking the skill without an explicit grant does not authorize merging.

Read [OPTCG verification](../../../docs/project/ORCHESTRATION-OPTCG.md) for engine, card-schema, game-protocol, or board changes. Use [run records](../../../docs/project/ORCHESTRATION-RECORDS.md) for the durable ledger, dispatch brief, and readiness receipt. Follow existing ticket conventions for commits and handoffs; this charter supersedes conflicting ticket lifecycle, approval, and role instructions.
