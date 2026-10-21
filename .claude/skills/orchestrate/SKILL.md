---
name: orchestrate
description: Coordinate 1–N Linear issues in dependency tracks through implementation, independent review, and verified PR readiness, with explicit run-scoped opt-in merging.
argument-hint: "OPT-501 OPT-502 [allow merges for this run]"
---

# Orchestrate ticket tracks

Read and execute `docs/project/ORCHESTRATION-CHARTER.md`, the single lifecycle and authority policy. Read `docs/project/ORCHESTRATION-RECORDS.md` for the run ledger and readiness receipt. For engine, card-schema, protocol or board changes also read `docs/project/ORCHESTRATION-OPTCG.md`.

Accept issue IDs/URLs separated by spaces or commas, a single issue, or a project resolved to an explicit issue list. Publish scope, tracks, readiness blockers and effective permissions, then proceed with determinate work. Missing scope requires a concise question; unrelated PRs do not block the run.

The coordinator declares a risk tier per issue (charter §3), delegates isolated implementation and fresh independent reviews, reads reviewer reports and spot-checks one decisive claim (every hunk only for Large), and owns PR readiness. Implementation agents never merge or write Linear. Merge permission defaults off and requires an explicit scope-matching user grant; historical Claude merge permissions and shell allow rules do not supply that grant. Codex and Claude coordinators may update issues and create relevant tickets under standing user authorization. Document every update in a comment on the affected issue, and implementation-discovered tickets in a linked explanatory comment on the original ticket. Follow the charter for audit recovery and scope boundaries. No repeated approval exchange is needed for already granted work.

Model roles and effort follow charter §4: Sol 6.1 for ordinary coordination and implementation, Luna 6 for bounded chores, and Astra for high-risk correctness review. Keep the current Claude coordinator when its runtime cannot switch; record that fact and route workers explicitly. Use native tools when they support the selected model, otherwise an available Codex CLI backend. Do not silently substitute Opus/Sonnet or inherit session defaults. Save one bounded packet per stage with scope, workspace, pinned revisions, evidence references and expected result. Continue fixes in the same implementer and deltas in the same reviewer; use separate spec/correctness briefs for Large work.

For a CLI worker, select the model and effort from the charter and use an isolated writable workspace:

```sh
codex exec -m <model-from-charter> -c model_reasoning_effort="<effort-from-charter>" -C <workspace> --sandbox workspace-write -o <out.md> - < <brief.md>
```

Review briefs prohibit tracked edits and permit isolated scratch tests. Respect host test capacity even when reviews run concurrently. Use deterministic monitoring for mechanical checks; delegate bounded interpretation to Luna. Keep final readiness and merge decisions with the coordinator.

Use `GOTCHAS.md` only for relevant historical environment evidence; it does not override the charter or current permissions. If independent review is unavailable, readiness is incomplete.

For frontend work, use the design/VQA supplement in `.claude/skills/orchestrate-frontend/SKILL.md` under the same charter. Existing `.claude/workflows/pr-review.js` results are advisory inputs; complete the charter's gates directly when that runner cannot establish them.
