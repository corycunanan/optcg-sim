# Project Handoffs

Cross-session context for agents working on different tickets within the same Linear project.

## Why this exists

Each Claude Code session starts with a blank context window. Commits and PR descriptions cover *what changed*, but not *what the previous agent wished the next agent had known before touching the code*. Handoff docs fill that gap.

## One doc per Linear project

- File name: `<linear-project-slug>.md` (lowercase, kebab-case, derived from the Linear project title).
- One doc per Linear project, not per ticket. Multiple tickets in a project share one doc.
- Templates: see [`_TEMPLATE.md`](./_TEMPLATE.md).

## Document shape

Every project handoff doc has two sections:

### 1. Action Plan (top)

A table of all tickets in the Linear project, in **execution order**. Order is determined by:
1. **Dependencies** (blockers resolved first)
2. **Estimate** (small tickets first when otherwise tied — keeps momentum)
3. **Priority** (from Linear)
4. **Risk** (unknowns earlier, so later tickets can rely on them)

The table's `Status` column is updated as tickets close:
- Pulled from Linear at the moment of update — don't invent names.
- When a ticket moves to Done in Linear, mark it Done in the table and move the row visually to the bottom (keep chronological "in play" ordering at the top).

The Action Plan is how agents decide what to start next — *not* the Linear backlog view, which may not reflect dependency order.

### 2. Handoffs (below the Action Plan)

Append-only sections — one per completed ticket, targeting the *next* ticket in the Action Plan.

Each handoff is short: primer, files to read, gotchas, unresolved work, and a commit/PR pointer. See the template.

## Workflow

Handoff docs are maintained by the [`/ticket`](../../../.claude/skills/ticket/SKILL.md) skill:
- **On ticket start:** skill reads the doc, surfaces any inbound handoff.
- **On ticket close (PR open):** skill appends a new handoff entry and updates the Action Plan row.
- **On ticket merge:** skill moves the row to Done.

Manual edits are fine — the skill is idempotent on the fields it updates.

## What NOT to put here

- Architecture or feature documentation (that's `docs/architecture/` or feature-specific folders).
- Diff recaps — use the commit/PR.
- Generic codebase knowledge — that's `CLAUDE.md`.

Keep entries tight. If a handoff is longer than ~20 lines, something belongs elsewhere.
