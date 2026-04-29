---
name: issues
description: Show outstanding Linear issues sorted by urgency, organized by domain
disable-model-invocation: true
argument-hint: "[filter: all | engine | ui | infra | bugs]"
allowed-tools: mcp__linear-server__list_issues mcp__linear-server__list_issue_statuses
---

# Linear Issues Dashboard

Fetch and display all outstanding Linear issues for the OPTCG Simulator project, organized for prioritization.

## Instructions

1. Fetch issues in three batches (in parallel):
   - `list_issues` with `state: "started"`, `includeArchived: false`
   - `list_issues` with `state: "unstarted"`, `includeArchived: false`
   - `list_issues` with `state: "backlog"`, `includeArchived: false`

2. Exclude default Linear onboarding issues (OPT-1 through OPT-4).

3. If the user passed a filter argument (`$ARGUMENTS`), filter results:
   - `engine` — labels containing "Game Engine" or issues in `workers/game/`
   - `ui` — labels containing "Design", "Feature", or "Improvement"
   - `infra` — labels containing "Tech Debt", "Documentation", or "Testing"
   - `bugs` — labels containing "Bug"
   - `all` or empty — show everything

4. Organize the output into sections:

   **In Progress** — issues currently being worked on

   **Gameplay-Critical** — bugs/issues that actively break game correctness (wrong mechanics, card effects not working, data leaks). These should be worked on first.

   **High Priority Backlog** — urgent + high priority issues not yet started

   **Medium/Low Backlog** — remaining issues grouped by domain:
   - Game Engine (effect resolver, triggers, schemas)
   - Game Board UI (components, animations, modals)
   - Infrastructure (API, auth, performance, tests, docs)

5. For each issue, show: `ID | Title | Priority | Labels | Estimate (if set)`

6. End with a one-line summary: total count, how many are gameplay-critical, and the suggested next issue to tackle.

Keep the output concise — use tables, not prose.
