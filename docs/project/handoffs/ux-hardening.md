---
linear-project: UX Hardening
linear-project-url: https://linear.app/optcg-sim/project/ux-hardening-10f1af9ff4a5
last-updated: 2026-07-06
---

# UX Hardening - Handoff Doc

Make failure states visible and destructive actions deliberate across the app's highest-risk UX surfaces.

---

## Action Plan

Tickets in execution order. Ordering criteria: user harm -> blast radius -> priority -> dependency.

| Order | Ticket  | Title                                         | Estimate | Depends on | Status    | PR   | Notes                                                      |
| ----- | ------- | --------------------------------------------- | -------- | ---------- | --------- | ---- | ---------------------------------------------------------- |
| 1     | OPT-385 | Confirm in-game Concede                       | N/A      | None       | In Review | #230 | Highest-risk misclick; one focused menu/dialog change.     |
| 2     | OPT-386 | Deck builder loud failures + work-loss guards | N/A      | None       | Backlog   | N/A  | Broadest high-priority work-loss surface.                  |
| 3     | OPT-387 | First-session traps                           | N/A      | None       | Backlog   | N/A  | Small fixes, but verify `/decks` scroll at runtime.        |
| 4     | OPT-388 | Social failures + route skeletons             | N/A      | None       | Backlog   | N/A  | Several async failure states plus route loading skeletons. |
| 5     | OPT-391 | Leave Lobby / Close Lobby actions             | N/A      | None       | Backlog   | N/A  | Clarifies guest seat release and host close flow.          |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-386.

---

## Handoffs

Append new entries at the bottom. Each entry is written by the agent who just finished a ticket, for the agent who picks up the next ticket.

### OPT-385 -> OPT-386

**From:** session on 2026-07-06 - **Commit:** `57ed201` - **PR:** #230

- **Primer:** In-game Concede now opens a destructive AlertDialog before dispatching the `CONCEDE` game action.
- **Read first:** `src/components/game/board-layout/nav-menu.tsx`, `src/components/lobbies/lobbies-shell.tsx`, `src/components/deck-builder/deck-builder-shell.tsx`, `src/components/deck-builder/deck-builder-header.tsx`
- **Gotchas / do NOT touch:** Keep deck-builder failure handling scoped to OPT-386; do not fold social/sidebar failures from OPT-388 into that PR.
- **Unresolved:** Browser click-through for the game-board menu is listed as a manual PR check; automated `pnpm verify` passed.
- **Why this matters for OPT-386:** The confirmed concede dialog establishes the destructive-action pattern to mirror for deck Clear while OPT-386 wires toast/error feedback and work-loss guards.
