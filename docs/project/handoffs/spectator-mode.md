---
linear-project: Spectator Mode
linear-project-url: https://linear.app/optcg-sim/project/spectator-mode-192cfdb2b208
last-updated: 2026-07-25
---

# Spectator Mode — Handoff Doc

Opt-in lobby spectators with a privacy-preserving, read-only live game view.

---

## Action Plan

Tickets on the current worker/visibility critical path plus the urgent revocation gate. Ordering follows the project dependency map.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-555 | Transport: spectator socket class, attachment, and hibernation identity | — | OPT-554 | In Review | [#427](https://github.com/corycunanan/optcg-sim/pull/427) | Spectator admission is default-deny for delivery. |
| 2 | OPT-552 | Broadcast wiring for the spectator view + third-filtered-state cost | — | OPT-551, OPT-555 | In Progress | — | Immediate cross-track successor. |
| 3 | OPT-557 | Broadcast allowlist: audit which ServerMessages reach spectator sockets | — | OPT-555 | Backlog | — | Resume Track B after OPT-552. |
| 4 | OPT-556 | Receive-only enforcement + spectator connection and message budgets | — | OPT-557 | Backlog | — | |
| 5 | OPT-574 | Spectator socket revocation: removed spectators stream indefinitely once connected | — | — | Backlog | — | Urgent parallel gate before watch-through completion. |
| 6 | OPT-558 | Spectator connection lifecycle: connect snapshot, join/leave events, close at game end | — | OPT-552, OPT-556 | Backlog | — | |
| 7 | OPT-565 | Spectator chrome: banner, Stop spectating, player toasts, game-end routing | — | OPT-558, OPT-543, OPT-564 | Todo | — | |
| 8 | OPT-566 | Watch-through integration coverage for a full spectated game | — | OPT-565, OPT-574, OPT-545 | Backlog | — | Final integration gate. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-552.

---

## Handoffs

### OPT-555 → OPT-552
**From:** session on 2026-07-25 · **Commit:** `60d9747` · **PR:** [#427](https://github.com/corycunanan/optcg-sim/pull/427)

- **Primer:** Spectators now have tagged, hibernation-safe, newest-authoritative sockets, but all plain transport broadcasts deny them by default.
- **Read first:** `workers/game/src/session/transport.ts`, `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-555-spectator-transport.test.ts`.
- **Gotchas / do NOT touch:** Keep plain `broadcast()` default-deny and preserve player delivery if spectator view building throws; OPT-557 owns the message allowlist and OPT-556 owns inbound enforcement/budgets.
- **Unresolved:** OPT-574 owns established-socket revocation and expiry rechecks; no comment or behavior should imply token TTL bounds an accepted socket.
- **Why this matters for OPT-552:** Use `spectatorSocket`/spectator tags for lazy merged-view delivery, and add explicit spectator state delivery without routing player-filtered or action-bearing frames through the plain broadcast path.

