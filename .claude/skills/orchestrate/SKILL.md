---
name: orchestrate
description: Coordinate 1–N Linear issues in dependency tracks through implementation, independent review, and verified PR readiness, with explicit run-scoped opt-in merging.
argument-hint: "OPT-501 OPT-502 [allow merges for this run]"
---

# Orchestrate ticket tracks

Read and execute `docs/project/ORCHESTRATION-CHARTER.md`, the single lifecycle and authority policy. Read `docs/project/ORCHESTRATION-RECORDS.md` for the run ledger and readiness receipt. For engine, card-schema, protocol or board changes also read `docs/project/ORCHESTRATION-OPTCG.md`.

Accept issue IDs/URLs separated by spaces or commas, a single issue, or a project resolved to an explicit issue list. Publish scope, tracks, readiness blockers and effective permissions, then proceed with determinate work. Missing scope requires a concise question; unrelated PRs do not block the run.

The coordinator declares a risk tier per issue (charter §3), delegates isolated implementation and fresh independent reviews, reads reviewer reports and spot-checks one decisive claim (every hunk only for Large), and owns PR readiness. Implementation agents never merge or write Linear. Merge permission defaults off and requires an explicit scope-matching user grant; historical Claude merge permissions and shell allow rules do not supply that grant. Codex and Claude coordinators may update issues and create relevant tickets under standing user authorization. Document every update in a comment on the affected issue, and implementation-discovered tickets in a linked explanatory comment on the original ticket. Follow the charter for audit recovery and scope boundaries. No repeated approval exchange is needed for already granted work.

Default model roles (charter §4): this session coordinates; implementers are Codex CLI on `gpt-6-astra`; reviewers are fresh Claude subagents via the Agent tool, at most two concurrent. Implementation dispatch shape:

```sh
codex exec -m gpt-6-astra -c model_reasoning_effort="<low|medium>" -C <clone> --sandbox workspace-write -o <out.md> - < <brief.txt>
```

Effort is `low` for Small tickets and `medium` otherwise. The brief is the packet JSON plus ticket conventions and the ownership fence, never the charter or this conversation. Inspect the installed Codex help and configuration before the first dispatch, capture thread/job IDs, and preserve partial work on failure. Small and Medium tickets cite CI for `pnpm verify`; only Large runs it locally. `.claude/workflows/pr-review.js` runs its lenses on GPT-5.6 and spends Codex budget, so reserve it for Large tickets. Use `GOTCHAS.md` only for relevant historical environment evidence; it does not override the charter or current permissions. When a provider's budget is exhausted, swap roles for the run, record the swap and the lost cross-family diversity in the ledger, and continue. If independent review is unavailable, readiness is incomplete.

For frontend work, use the design/VQA supplement in `.claude/skills/orchestrate-frontend/SKILL.md` under the same charter. Existing `.claude/workflows/pr-review.js` results are advisory inputs; complete the charter's gates directly when that runner cannot establish them.
