---
linear-project: Game Board Reliability
linear-project-url: https://linear.app/optcg-sim/project/game-board-reliability-dff1375ce5d6
last-updated: 2026-05-01
---

# Game Board Reliability — Handoff Doc

Bugs and performance issues affecting game board stability under load — WebSocket drops, race conditions, render throttling. Currently winding down: OPT-350 closes the disconnect-flicker storyline, leaving OPT-162 (memoization + action throttle) as the only remaining active ticket.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket  | Title                                                            | Estimate | Depends on | Status      | PR | Notes |
|-------|---------|------------------------------------------------------------------|----------|------------|-------------|----|-------|
| 1     | OPT-350 | Fix runaway WebSocket reconnect loop (Solitaire OPPONENT AWAY)   | 2        | —          | In Review   | [#204](https://github.com/corycunanan/optcg-sim/pull/204) | Both layers — client orphan-onclose guard + server DISCONNECTED debounce. |
| 2     | OPT-162 | Add React.memo to field components and throttle game actions     | 3        | —          | Backlog     | —  | Pure perf hardening; independent of OPT-350. |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** the highest-ordered row that isn't `In Review` or `Done`.

---

## Handoffs

Append new entries at the bottom. Each entry is written *by* the agent who just finished a ticket, *for* the agent who picks up the next ticket.

### OPT-350 → OPT-162
**From:** session on 2026-05-01 · **Commit:** `37d809a` (server) + `e29e4c4` (client) · **PR:** #204

- **Primer:** Two-layer fix for the Solitaire OPPONENT AWAY flicker. Client (`src/hooks/use-game-ws.ts`) now ignores `ws.onclose` events for orphan sockets — a Strict Mode supersede no longer nulls the live `wsRef` and triggers a runaway reconnect loop. Server (`workers/game/src/GameSession.ts`) debounces the `game:player_disconnected` broadcast by 500ms via per-player timers in `pendingDisconnectTimers`; `acceptAuthoritativePlayerSocket` cancels any pending timer so a fast reconnect swallows the flicker entirely.
- **Read first:** `src/hooks/use-game-ws.ts:158-185` (orphan guard), `workers/game/src/GameSession.ts:478-528` (`webSocketClose` + `scheduleDisconnectBroadcast` + `cancelPendingDisconnect`), `workers/game/src/GameSession.ts:1147-1157` (cancel-on-accept).
- **Gotchas / do NOT touch:** Only `DISCONNECTED` is debounced. `LEFT` (explicit `game:leave`) still fires `handlePlayerAway` immediately — keep it that way; debouncing intentional leaves would defer concedes. The new `pendingDisconnectTimers` map is a plain in-memory Map, intentionally unpersisted: a disconnect that survives 500ms is the only real disconnect we care about, and the `rejoinDeadlineAt` alarm path takes over from there.
- **Unresolved:** Manual Solitaire 5-turn QA (AC item 2) and PVP refresh regression check (AC item 5) remain — verifiable in dev once PR is merged. No follow-up tickets opened.
- **Why this matters for OPT-162:** OPT-162 also touches the websocket message → render path (memoizing `OpponentField`/`PlayerField` and throttling actions). Render throughput is now the only remaining choke; with the reconnect storm fixed, any flicker observed during memoization work is genuinely a render issue rather than masked ws churn.
