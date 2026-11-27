---
linear-project: Spectator Mode
linear-project-url: https://linear.app/optcg-sim/project/spectator-mode-192cfdb2b208
last-updated: 2026-07-26
---

# Spectator Mode — Handoff Doc

Opt-in lobby spectators with a privacy-preserving, read-only live game view.

---

## Action Plan

Tickets on the current worker/visibility critical path plus the urgent revocation gate. Ordering follows the project dependency map.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | OPT-555 | Transport: spectator socket class, attachment, and hibernation identity | — | OPT-554 | Done | [#427](https://github.com/corycunanan/optcg-sim/pull/427) | Socket scaffolding only; spectator upgrades remain fail-closed. |
| 2 | OPT-552 | Broadcast wiring for the spectator view + third-filtered-state cost | — | OPT-551, OPT-555 | Done | [#433](https://github.com/corycunanan/optcg-sim/pull/433) | Merged-view delivery is wired; admission remains closed. |
| 3 | OPT-557 | Broadcast allowlist: audit which ServerMessages reach spectator sockets | — | OPT-555 | Done | [#431](https://github.com/corycunanan/optcg-sim/pull/431) | Explicit default-deny policy; admission remains closed. |
| 4 | OPT-556 | Receive-only enforcement + spectator connection and message budgets | — | OPT-557 | Done | [#430](https://github.com/corycunanan/optcg-sim/pull/430) | Merged before OPT-557; admission remains fail-closed. |
| 5 | OPT-574 | Spectator socket revocation: removed spectators stream indefinitely once connected | — | — | Done | [#434](https://github.com/corycunanan/optcg-sim/pull/434) | Revision-protected push closes promptly; exp synchronously bounds delivery. |
| 6 | OPT-558 | Spectator connection lifecycle: connect snapshot, join/leave events, close at game end | — | OPT-552, OPT-556 | Done | [#437](https://github.com/corycunanan/optcg-sim/pull/437) | Player-only lifecycle visibility and terminal spectator close are live. |
| 7 | OPT-565 | Spectator chrome: banner, Stop spectating, player toasts, game-end routing | — | OPT-558, OPT-543, OPT-564 | In Review | [#442](https://github.com/corycunanan/optcg-sim/pull/442) | App chrome, lifecycle toasts, safe exit, and reconnect UX. |
| 8 | OPT-566 | Watch-through integration coverage for a full spectated game | — | OPT-565, OPT-574, OPT-545 | Backlog | — | Final integration gate. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** OPT-566 after PR #442 merges; it is the full watch-through integration gate.

---

## Handoffs

### OPT-555 → OPT-552
**From:** session on 2026-07-25 · **Commit:** `60d9747` · **PR:** [#427](https://github.com/corycunanan/optcg-sim/pull/427)

- **Primer:** The spectator socket class is implemented and hibernation-safe, but GameSession still rejects every spectator upgrade with 401, so the class is not live yet.
- **Read first:** `workers/game/src/session/transport.ts`, `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-555-spectator-transport.test.ts`.
- **Gotchas / do NOT touch:** Do not admit spectator upgrades until OPT-556 rejects frames before the shared coordinator and adds connection/message budgets; keep plain `broadcast()` default-deny, and land OPT-552/557 before sending any spectator payload.
- **Unresolved:** OPT-574 is in review in PR #434. Its lease bounds delivery at token expiry; alarm-driven physical close has no numeric timing bound.
- **Why this matters for OPT-552:** The unreachable transport scaffold is ready for lazy merged-view wiring, but no payload is live and the 401 must remain until the OPT-556 admission preconditions are satisfied.

### OPT-557 → OPT-574
**From:** session on 2026-07-25 · **Commit:** `da77b3e` · **PR:** [#431](https://github.com/corycunanan/optcg-sim/pull/431)

- **Primer:** Plain broadcasts now require an explicit exhaustive spectator-visible classification; terminal and presence events are allowed, while undo and every state-bearing type are denied.
- **Read first:** `workers/game/src/session/transport.ts`, `workers/game/src/session/spectator-policy.ts`, `workers/game/src/GameSession.ts`.
- **Gotchas / do NOT touch:** Spectator admission still returns 401. Do not couple revocation to the allowlist; token TTL bounds delivery, while alarm-driven physical close is not punctual.
- **Unresolved:** OPT-552 owns merged-view state wiring, OPT-558 owns connection lifecycle, and OPT-565 owns spectator chrome/game-end routing.
- **Pointer:** Implementation commit `da77b3e`; PR #431 contains the complete call-site and mutation audit.

### OPT-574 → OPT-558
**From:** session on 2026-07-25 · **PR:** [#434](https://github.com/corycunanan/optcg-sim/pull/434)

- **Primer:** Every spectator removal path pushes a monotonic lobby revision to the game DO; stale/replayed revisions are rejected, and a hibernation-stable exp lease synchronously denies delivery at expiry.
- **Read first:** `workers/game/src/session/spectator-revocation.ts`, `workers/game/src/session/transport.ts`, `src/lib/realtime/revoke-spectators.ts`.
- **Gotchas / do NOT touch:** Keep the 401 closed until separately approved. OPT-558 must not route spectator closes through seated-player presence handling or replace the shared alarm's earliest-deadline composition.
- **Unresolved:** Alarm delivery requests physical close but provides no numeric close-time bound; per-send enforcement is the exact 300-second delivery bound.
- **Pointer:** PR #434 contains replay, hibernation/alarm, and four removal-path end-to-end server-close proofs.

### OPT-565 → OPT-566
**From:** session on 2026-07-26 · **PR:** [#442](https://github.com/corycunanan/optcg-sim/pull/442)

- **Primer:** Spectator sockets now have explicit read-only chrome, player-visible validated join/leave toasts, endpoint-backed Stop spectating, reconnect-only disconnect UX, and a non-Dialog terminal exit that preserves party membership.
- **Read first:** `src/hooks/use-game-session.ts`, `src/hooks/use-game-ws.ts`, `src/components/game/live-game-shell.tsx`, `src/components/game/pregame/game-overlay-gate.tsx`.
- **Gotchas / do NOT touch:** Keep spectators out of `useGameFinalizer` and fallback concede; preserve the worker's player-only lifecycle event delivery and the passive overlay's no-focus-trap policy.
- **Unresolved:** OPT-566 owns production-boundary watch-through integration across connect, player toast visibility, reconnect, stop, and game-over return.
- **Pointer:** Implementation commit `a8c9d4f`; PR #442 includes the full guard mutation audit.
