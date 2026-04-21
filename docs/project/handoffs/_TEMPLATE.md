---
linear-project: <Project Name>
linear-project-url: https://linear.app/optcg-sim/project/<project-slug>
last-updated: YYYY-MM-DD
---

# <Project Name> — Handoff Doc

One-line summary of the project's goal and current state.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-XXX | <title> | <pts> | — | Todo | — | <1-line why-first> |
| 2 | OPT-YYY | <title> | <pts> | OPT-XXX | Todo | — | |
| 3 | OPT-ZZZ | <title> | <pts> | — | Todo | — | |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** the highest-ordered row that isn't `In Review` or `Done`.

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

<!--
Copy this block when writing a new handoff:

### OPT-XXX → OPT-YYY
**From:** session on YYYY-MM-DD · **Commit:** `<short-sha>` · **PR:** #NN

- **Primer:** <1 sentence — what changed at the system level>
- **Read first:** `path/to/file.ts`, `path/to/other.ts`
- **Gotchas / do NOT touch:** <what to leave alone and why, OR "none">
- **Unresolved:** <follow-ups, open questions, deferred work, tracking IDs — OR "none">
- **Why this matters for OPT-YYY:** <1–2 sentences tying the above to the next ticket's surface>

-->
