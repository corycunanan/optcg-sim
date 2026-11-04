---
name: orchestrate
description: Coordinate 1–N Linear issues in dependency tracks through implementation, independent review, and verified PR readiness, with explicit run-scoped opt-in merging.
argument-hint: "OPT-501 OPT-502 [allow merges for this run]"
---

# Orchestrate ticket tracks

Execute `docs/project/ORCHESTRATION-CHARTER.md`; it is the only source of policy (authority, tiers, review, readiness, merge). Use `docs/project/ORCHESTRATION-RECORDS.md` for the run checkpoint and readiness receipt. For engine, card-schema, protocol or board changes, also read `docs/project/ORCHESTRATION-OPTCG.md`. For frontend work, add `.claude/skills/orchestrate-frontend/SKILL.md`.

Accept issue IDs or URLs separated by spaces or commas, or a project resolved to an explicit issue list. With no scope, ask for it; do not infer a backlog to work.

## Models

Dispatch every agent with an explicit `model`; never let a child inherit the coordinator's model by default. Current choices (update here when models change, not in the charter):

| Role | Model | Notes |
| --- | --- | --- |
| Implementer, Small | `sonnet` | |
| Implementer, Medium/Large | `opus` | Continue fixes in the same agent |
| Reviewer, Small/Medium | `opus`, fresh agent | One combined pass for Small |
| Reviewers, Large | `opus` for spec; `fable` for correctness | Separate briefs; at most two concurrent |
| Chores (inventories, log triage, overlap reports) | `haiku` | Facts and uncertainty only; never adjudicates |

Explicit user model choices override this table. With one provider, review independence comes from a fresh context and a distinct hunt brief, not a different vendor.

## Dispatch

Use the native Agent tool with a fresh, bounded brief (never a full-history fork), an isolated worktree or clone, and the deliverables the charter requires. Review briefs forbid tracked edits and allow scratch tests. Keep host test capacity in mind when reviews run concurrently. Keep readiness and merge decisions with the coordinator.

Linear holds the plan and cross-session context: roll-up parents and `blockedBy` for order, issue comments for handoff points a later ticket needs. Handoffs go in PR bodies; `docs/project/handoffs/` is a read-only archive, and the run checkpoint is a local scratch file. Do not commit action plans or run ledgers.

Read the relevant section of `GOTCHAS.md` before a step it covers (worktrees, validation, CI, merge, environments). It records past environment failures; it does not override the charter or current permissions.
