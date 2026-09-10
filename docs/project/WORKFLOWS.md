# Ticket workflows

The [track-based orchestration charter](./ORCHESTRATION-CHARTER.md) is the single lifecycle and authority policy for 1–N Linear issues. It applies to both Codex and Claude. Read it before dispatch, review, readiness assessment or merge; historical ticket skills and runtime notes do not override it.

## Entry points

| Workflow | Entry point | Outcome |
| --- | --- | --- |
| Codex orchestration | `.agents/skills/orchestrate/SKILL.md` | Dependency tracks through verified PR readiness; merging only with an explicit run-scoped grant |
| Claude orchestration | `.claude/skills/orchestrate/SKILL.md` | Same charter, using available Claude/CLI runtime |
| Frontend orchestration | `.claude/skills/orchestrate-frontend/SKILL.md` | Charter plus design briefs and live VQA |
| Single-ticket implementation | `.agents/skills/ticket/SKILL.md`, `.claude/skills/ticket/SKILL.md` | Ticket conventions; charter controls authority and lifecycle |
| Standalone review | `.agents/skills/ticket-review/SKILL.md` | Findings; does not independently grant merge permission |
| Legacy lens runner | `.claude/workflows/pr-review.js` | Advisory review evidence; coordinator must establish complete charter gates |

## Use

```text
$orchestrate OPT-501 OPT-502 OPT-503
$orchestrate OPT-501 OPT-502; allow merges for these issues in this run after all readiness gates pass
$orchestrate OPT-501 OPT-502; allow stacking; stop at merge-ready
```

Claude uses `/orchestrate` with the same arguments. Project names may resolve to an explicit issue list. Default: merged prerequisites, merge permission off, coordinator Linear updates/ticket creation with mandatory audit comments. Unrelated work never blocks an isolated track. A coordinator can merge only within an explicit grant; implementers never merge.

## Supporting references

- [Run records](./ORCHESTRATION-RECORDS.md): durable ledger, dispatch brief, readiness receipt.
- [OPTCG verification](./ORCHESTRATION-OPTCG.md): rule sources, card scenarios, public testing boundaries and shared-handler impact.
- [Evidence ladder](../../.claude/reference/evidence-ladder.md): distinguish observations from claims; the charter governs adjudication and incomplete outcomes.
- [Preview VQA](./PREVIEW-VQA-RUNBOOK.md): environment-specific browser verification.
- [Historical gotchas](../../.claude/skills/orchestrate/GOTCHAS.md): evidence to recheck against the current machine, not permission to bypass controls.

The old assumption that Claude always merges is retired. No auto-merge arming, inferred grants, or docs-only exceptions to final-head review. GitHub branch protections, tool permissions and current check requirements remain authoritative. The legacy lens runner's empty findings, informational outputs, or missing reviewers cannot establish readiness on their own.
