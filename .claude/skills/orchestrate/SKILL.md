---
name: orchestrate
description: Coordinate 1–N Linear issues in dependency tracks through implementation, independent review, and verified PR readiness, with explicit run-scoped opt-in merging.
argument-hint: "OPT-501 OPT-502 [allow merges for this run]"
---

# Orchestrate ticket tracks

Read and execute `docs/project/ORCHESTRATION-CHARTER.md`, the single lifecycle and authority policy. Read `docs/project/ORCHESTRATION-RECORDS.md` for the run ledger and readiness receipt. For engine, card-schema, protocol or board changes also read `docs/project/ORCHESTRATION-OPTCG.md`.

Accept issue IDs/URLs separated by spaces or commas, a single issue, or a project resolved to an explicit issue list. Publish scope, tracks, readiness blockers and effective permissions, then proceed with determinate work. Missing scope requires a concise question; unrelated PRs do not block the run.

The coordinator delegates isolated implementation and fresh independent reviews, reviews each diff itself, and owns PR readiness. Implementation agents never merge or write Linear. Merge permission defaults off and requires an explicit scope-matching user grant; historical Claude merge permissions and shell allow rules do not supply that grant. Codex and Claude coordinators may update issues and create relevant tickets under standing user authorization. Document every update in a comment on the affected issue, and implementation-discovered tickets in a linked explanatory comment on the original ticket. Follow the charter for audit recovery and scope boundaries. No repeated approval exchange is needed for already granted work.

Use native agent tools where available. If dispatching to Codex CLI, inspect its installed help and runtime configuration, pass full ticket context, capture thread/job IDs, and preserve partial work on failure. Use `GOTCHAS.md` only for relevant historical environment evidence; it does not override the charter or current permissions. Do not hardcode old model slugs or require a particular provider to make progress. If independent review is unavailable, readiness is incomplete.

For frontend work, use the design/VQA supplement in `.claude/skills/orchestrate-frontend/SKILL.md` under the same charter. Existing `.claude/workflows/pr-review.js` results are advisory inputs; complete the charter's gates directly when that runner cannot establish them.
