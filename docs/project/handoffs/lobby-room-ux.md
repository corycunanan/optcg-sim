---
linear-project: Lobby Room UX
linear-project-url: https://linear.app/optcg-sim/project/lobby-room-ux-7accc6912db3
last-updated: 2026-04-29 (project created; OPT-338 ready to start)
---

# Lobby Room UX — Handoff Doc

Replace the auto-start-on-join lobby with a real pre-game room: three match-type tabs (PVP / Solitaire / PVComputer-disabled), per-player deck pickers, ready-up, and a host-driven Start button. Subsumes most of OPT-298 and all of OPT-299. Full scope: [`docs/project/LOBBY-ROOM-UX-SCOPE.md`](../LOBBY-ROOM-UX-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-338](https://linear.app/optcg-sim/issue/OPT-338) | Schema: `Lobby.mode`, ready flags, mutable deck slots, `game_sessions.mode` snapshot | 3 | — | Backlog | — | Gate ticket. Pure additive migration; existing rows backfill to `PVP`/`STANDARD`. No behavior change yet. |
| 2 | [OPT-339](https://linear.app/optcg-sim/issue/OPT-339) | Refactor `POST /api/lobbies/join` to enter-room only (strip start logic) | 2 | OPT-338 | Backlog | — | Adds temporary `?autoStart=true` shim so existing UI keeps working until OPT-342 ships. Drops `requirePlayableDeck` from join (moves to start). |
| 3 | [OPT-340](https://linear.app/optcg-sim/issue/OPT-340) | `PATCH /api/lobbies/[id]`: mode/deck/ready mutations + guest-eject behavior | 3 | OPT-338 | Backlog | — | Single endpoint with permission-gated fields. PVP→Solitaire with guest present returns 409 unless `?force=true`. Mode change auto-clears `hostReady`. |
| 4 | [OPT-341](https://linear.app/optcg-sim/issue/OPT-341) | `POST /api/lobbies/[id]/start`: host-only, mode-aware, runs deck legality + DO init | 3 | OPT-338 | Backlog | — | Migrates the GameSession + DO init transaction from join route. Reuses `requirePlayableDeck` (OPT-330) and `buildGameInitPayload`. Idempotent via `Lobby.status` lock. |
| 5 | [OPT-342](https://linear.app/optcg-sim/issue/OPT-342) | Lobby room UI with three tabs (PVP/Solitaire/PVComputer-disabled), deck pickers, ready, host Start button | 5 | OPT-339, OPT-340, OPT-341 | Backlog | — | New `/lobbies/[id]` page. Polling MVP via `useLobbyRoom` hook — designed as the future swap point for OPT-88. Removes the `?autoStart=true` shim. |
| 6 | [OPT-343](https://linear.app/optcg-sim/issue/OPT-343) | Solitaire mode wire-through: `playerIndex` JWT claim + DO trust gate (subsumes most of OPT-298) | 3 | OPT-341 | Backlog | — | DO refuses `playerIndex` claim unless `gameSession.mode === "SOLITAIRE"`. Negative test required. Verify replay-tracker keys per `(jti)` not `(gameId, sub)`. |
| 7 | [OPT-344](https://linear.app/optcg-sim/issue/OPT-344) | Migration backfill + e2e smoke + close out OPT-298/OPT-299 | 2 | OPT-342, OPT-343 | Backlog | — | Manual smoke: PVP + Solitaire + mode-switch eviction. Closes OPT-298/OPT-299 with cross-links; refreshes OPT-300/301/302/303 descriptions. |

**Total estimate:** 21 points.

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** **OPT-338** — schema gate ticket. Ready now; no upstream dependencies.

### PR phasing

| PR | Tickets | Why this batch |
|----|---------|----------------|
| **PR 1** | OPT-338 | Schema migration. Pure additive — no behavior change. **Must land first.** |
| **PR 2** | OPT-339 + OPT-340 + OPT-341 | API surface change. Atomic — `/start` must exist before `/join` stops starting games. The `?autoStart=true` shim on `/join` keeps existing UI working. Server-only, no UI changes. |
| **PR 3** | OPT-342 | Lobby room UI. Flips users to the new flow. Removes the temporary auto-start shim from PR 2. |
| **PR 4** | OPT-343 | Solitaire wire-up. Token claim + DO trust gate. Updates contract tests. |
| **PR 5** | OPT-344 | Cleanup, backfill verification, e2e smoke. Closes OPT-298/OPT-299. |

PR 4 depends on PR 2 (specifically OPT-341 — the `/start` endpoint snapshots `mode`). PR 5 depends on PR 3 and PR 4.

### Pre-merge gate

Architecture Floor substantially complete:

- ✅ OPT-330 (`requirePlayableDeck`) — Done
- ✅ OPT-331 (`finalizeGameResult`) — Done
- ✅ OPT-329 (app↔worker contract tests) — Done
- ✅ OPT-262 (migration drift CI guard) — Done
- 🔵 OPT-336 (WS upgrade/reconnect throttling) — In Progress; **does not block this project**

### Cross-project tickets

- **OPT-298** (Solitaire backend) — bulk subsumed by OPT-338/341/343. Closed at OPT-344 with cross-link.
- **OPT-299** (Solitaire entry page) — fully subsumed by OPT-342. Closed at OPT-344 with cross-link.
- **OPT-300/301/302/303** (Solitaire in-game UX) — unchanged scope, but build on top of the lobby room flow this project ships. OPT-344 refreshes their descriptions to note the dependency.
- **OPT-88** (replace polling with push) — the new `useLobbyRoom` hook is the cleanest first migration surface. Out of scope here; designed to be swap-friendly.

### Deferred / tech debt

- Lobby browser / public lobby list — invite-only via code for now.
- Spectator mode — `mode` enum can grow `SPECTATE` later without schema rework.
- Match history / replays surfaced from the room.
- Friend-invite integration ("challenge friend → auto-join lobby").
- Custom game rules beyond format selection (banlist toggle, alternate win conditions).
- PVComputer implementation — disabled tab here; separate project later.
- Polling → push migration — OPT-88's job.

See [`docs/project/LOBBY-ROOM-UX-SCOPE.md`](../LOBBY-ROOM-UX-SCOPE.md) §"Deferred / tech debt" for full detail.

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
