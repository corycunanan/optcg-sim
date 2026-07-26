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
| 1 | OPT-555 | Transport: spectator socket class, attachment, and hibernation identity | — | OPT-554 | Done | [#427](https://github.com/corycunanan/optcg-sim/pull/427) | Socket scaffolding only; spectator upgrades remain fail-closed. |
| 2 | OPT-552 | Broadcast wiring for the spectator view + third-filtered-state cost | — | OPT-551, OPT-555 | In Progress | — | Immediate cross-track successor. |
| 3 | OPT-557 | Broadcast allowlist: audit which ServerMessages reach spectator sockets | — | OPT-555 | In Review | [#431](https://github.com/corycunanan/optcg-sim/pull/431) | Explicit default-deny policy; admission remains closed. |
| 4 | OPT-556 | Receive-only enforcement + spectator connection and message budgets | — | OPT-557 | Done | [#430](https://github.com/corycunanan/optcg-sim/pull/430) | Merged before OPT-557; admission remains fail-closed. |
| 5 | OPT-574 | Spectator socket revocation: removed spectators stream indefinitely once connected | — | — | Backlog | — | Urgent parallel gate before watch-through completion. |
| 6 | OPT-558 | Spectator connection lifecycle: connect snapshot, join/leave events, close at game end | — | OPT-552, OPT-556 | Backlog | — | |
| 7 | OPT-565 | Spectator chrome: banner, Stop spectating, player toasts, game-end routing | — | OPT-558, OPT-543, OPT-564 | Todo | — | |
| 8 | OPT-566 | Watch-through integration coverage for a full spectated game | — | OPT-565, OPT-574, OPT-545 | Backlog | — | Final integration gate. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-574; OPT-558 remains blocked on OPT-552.

---

## Handoffs

### OPT-555 → OPT-552
**From:** session on 2026-07-25 · **Commit:** `60d9747` · **PR:** [#427](https://github.com/corycunanan/optcg-sim/pull/427)

- **Primer:** The spectator socket class is implemented and hibernation-safe, but GameSession still rejects every spectator upgrade with 401, so the class is not live yet.
- **Read first:** `workers/game/src/session/transport.ts`, `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-555-spectator-transport.test.ts`.
- **Gotchas / do NOT touch:** Do not admit spectator upgrades until OPT-556 rejects frames before the shared coordinator and adds connection/message budgets; keep plain `broadcast()` default-deny, and land OPT-552/557 before sending any spectator payload.
- **Unresolved:** OPT-574 owns established-socket revocation and expiry rechecks; no comment or behavior should imply token TTL bounds an accepted socket.
- **Why this matters for OPT-552:** The unreachable transport scaffold is ready for lazy merged-view wiring, but no payload is live and the 401 must remain until the OPT-556 admission preconditions are satisfied.

### OPT-557 → OPT-574
**From:** session on 2026-07-25 · **Commit:** `da77b3e` · **PR:** [#431](https://github.com/corycunanan/optcg-sim/pull/431)

- **Primer:** Plain broadcasts now require an explicit exhaustive spectator-visible classification; terminal and presence events are allowed, while undo and every state-bearing type are denied.
- **Read first:** `workers/game/src/session/transport.ts`, `workers/game/src/session/spectator-policy.ts`, `workers/game/src/GameSession.ts`.
- **Gotchas / do NOT touch:** Spectator admission still returns 401 pending OPT-552; do not couple revocation to the allowlist or imply token TTL bounds an established socket.
- **Unresolved:** OPT-552 owns merged-view state wiring, OPT-558 owns connection lifecycle, and OPT-565 owns spectator chrome/game-end routing.
- **Pointer:** Implementation commit `da77b3e`; PR #431 contains the complete call-site and mutation audit.
