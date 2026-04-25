---
linear-project: Solitaire Mode
linear-project-url: https://linear.app/optcg-sim/project/solitaire-mode-da74ba26f65a
last-updated: 2026-04-24 (project created — all 6 tickets in Backlog except OPT-298 which is the gate ticket in Todo)
---

# Solitaire Mode — Handoff Doc

Single-player mode where one user picks two decks and plays both sides, with perspective auto-flipping on turn handoff. Full scope: [`docs/project/SOLITAIRE-SCOPE.md`](../SOLITAIRE-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-298](https://linear.app/optcg-sim/issue/OPT-298) | Solitaire backend: init endpoint + token playerIndex claim + mode column | 3 | — | Todo | — | Gate ticket — blocks OPT-299 and OPT-300. Adds `mode` column, `POST /api/solitaire/start`, `playerIndex` JWT claim, DO-side trust gate. |
| 2 | [OPT-300](https://linear.app/optcg-sim/issue/OPT-300) | Refactor use-game-session to support multiple instances per tab | 2 | OPT-298 | Backlog | — | Pure refactor — no behavior change for 2P games. Adds dual-instance contract test. Picked up before OPT-299 because it unblocks the larger phase 3 chain; OPT-299 is independent surface area. |
| 3 | [OPT-299](https://linear.app/optcg-sim/issue/OPT-299) | Solitaire entry page: /solitaire route + dual deck picker | 2 | OPT-298 | Backlog | — | Entry surface. Independent of phase 3 hook work — can be done in parallel after OPT-298 if anyone wants to split. Blocks OPT-303 dogfood. |
| 4 | [OPT-301](https://linear.app/optcg-sim/issue/OPT-301) | useSolitaireSession composite hook + perspective state machine | 3 | OPT-300 | Backlog | — | The brain of solitaire. Composes two `useGameSession` instances, owns perspective state, routes actions, handles auto-flip on turn end + reactive prompts. |
| 5 | [OPT-302](https://linear.app/optcg-sim/issue/OPT-302) | Wire game board to perspective + Flip button + fade-to-black transition | 3 | OPT-301 | Backlog | — | Visible work: header badge + Flip button, fade-to-black transition (~350ms total, no 3D rotation), side-turn banner. |
| 6 | [OPT-303](https://linear.app/optcg-sim/issue/OPT-303) | Solitaire polish: history filter, lobby/feed exclusion, refresh QA | 2 | OPT-302, OPT-299 | Backlog | — | Closeout — exclude solitaire from social surfaces, validate refresh behavior, end-to-end dogfood. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-298 — the gate ticket. Everything else is blocked on it.

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
