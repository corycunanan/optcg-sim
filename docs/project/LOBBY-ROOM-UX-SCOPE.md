---
status: Ready to start
created: 2026-04-29
owner: Cory Cunanan
linear-project: Lobby Room UX
linear-project-url: https://linear.app/optcg-sim/project/lobby-room-ux-7accc6912db3
handoff-doc: docs/project/handoffs/lobby-room-ux.md
---

# Lobby Room UX — Scope & Plan

> This doc is the **architectural source of truth**. Ticket descriptions reference it; the handoff doc tracks ticket-by-ticket execution. Use [`/ticket OPT-XXX`](../../.claude/skills/ticket/SKILL.md) to start any of the tickets below.
>
> **Predecessor:** Architecture Floor ([`docs/project/ARCHITECTURE-FLOOR-SCOPE.md`](./ARCHITECTURE-FLOOR-SCOPE.md)) — server-side deck legality (OPT-330), idempotent finalization (OPT-331), app↔worker contract tests (OPT-329) all land before this initiative.
> **Downstream:** Solitaire Mode — OPT-298 and OPT-299 are subsumed by this project; OPT-300/301/302/303 build on top of the lobby room.

---

## Summary

Today, joining a lobby atomically creates the `GameSession`, inits the Durable Object, and redirects both players into the game (`src/app/api/lobbies/join/route.ts:87-133`). **Joining = starting.** There is no "room" state to live in.

This project replaces that with a real **pre-game room**:

- One unified lobby surface with **three match-type tabs**: `PVP`, `Solitaire`, `PVComputer` (last disabled until separately scoped).
- The host's deck slot is owned by them and persists across mode toggles.
- Side B's deck slot is rendered per mode: PVP shows "waiting for opponent" + invite code; Solitaire shows a deck picker the host fills in; PVComputer is disabled.
- Per-player ready flags. Host clicks **Start** when prerequisites are met.

This isn't just a 2P UX upgrade. **Solitaire is a lobby with one seat the host controls.** Once the room exists, Solitaire is a configuration of it, not a parallel code path. That insight collapses the original Solitaire backend (OPT-298) and entry-page (OPT-299) tickets into the unified lobby flow.

---

## Goals

- Joining a lobby admits the user to a room. It never starts a game.
- Host explicitly starts the game with a Start button, gated on per-mode prerequisites.
- The same lobby room renders PVP and Solitaire flows behind a tab toggle, with no parallel routes or endpoints.
- `requirePlayableDeck` runs at start time for both seats (PVP: each player's own deck; Solitaire: both decks the host chose).
- Existing 2P UX is no worse than today (same or fewer round-trips to start a game).
- `Lobby.mode` is mutable while the lobby is open; snapshotted onto `game_sessions.mode` at start.

## Non-goals (this initiative)

- **Real-time push.** Lobby room ships on polling (1-2s, visibility-gated). Push migration is OPT-88's separate project. The new `useLobbyRoom` hook is designed as the cleanest first surface to swap, but the swap itself is out of scope.
- **PVComputer implementation.** Disabled tab only — no AI opponent, no bot adapter.
- **Solitaire perspective state machine + flip-on-handoff.** Stays in Solitaire project (OPT-301/302). This project ends when a Solitaire game can *start*; the in-game perspective UX is downstream.
- **Two-WebSocket-per-tab refactor.** OPT-300 still owns that.
- **New auth/account changes.** Reuses the existing session and `requirePlayableDeck` boundary.
- **Lobby browser/discovery features.** Out of scope.

---

## Locked design decisions

These were resolved in conversation on 2026-04-29 before tickets were cut. Don't relitigate without strong cause.

| # | Decision |
|---|---|
| 1 | **Both players choose decks in the room together**, not at lobby creation. The host can pick their deck even with no opponent in the room. |
| 2 | **Mode is a tab inside the lobby room**, not a creation-time choice. New lobbies default to `PVP`. |
| 3 | **Switching `PVP → SOLITAIRE` while a guest is present** shows a confirmation dialog ("This will remove [guest] from the lobby"). On confirm, eject the guest with a friendly notice. Server enforces with 409 + `?force=true` retry. |
| 4 | **Join code is mode-gated.** Trying to join via code when the lobby is in Solitaire mode → 409 ("This lobby is in solo mode and cannot be joined"). |
| 5 | **PVCOMPUTER tab is rendered disabled** with a "Coming soon" tooltip. Visible but `aria-disabled`. |
| 6 | **Host's deck slot persists across tab switches.** Side B's deck is cleared on `SOLITAIRE → PVP` (since the slot becomes "waiting for opponent"). |
| 7 | **Solitaire's "side B" reuses the `LobbyGuest` row with `userId = host.userId`.** This matches OPT-298's `player1Id === player2Id` invariant and keeps one path through the code. |

---

## Architecture decisions

Why this set, in this order:

| # | Decision |
|---|---|
| 1 | **Schema first, atomic.** OPT-338 lands `Lobby.mode`, ready flags, mutable deck slots, and `game_sessions.mode` in a single migration. Backwards-compatible: existing rows backfill to `PVP`/`STANDARD`. No behavior change yet. |
| 2 | **Decouple "enter room" from "start game" before any UI work.** OPT-339/340/341 reshape the API: join admits to room; PATCH mutates configuration; new `/start` runs the existing transaction. UI work (OPT-342) flips users to the new flow only after all three endpoints exist. |
| 3 | **Backwards-compat shim during transition.** OPT-339 adds a temporary `?autoStart=true` query param on `/join` so the existing UI keeps working between API and UI PRs. Removed in OPT-342's PR. |
| 4 | **Solitaire entry collapses into the lobby room.** No `/api/solitaire/start` endpoint, no `/solitaire` page. The Solitaire tab inside the lobby room is the entry surface. OPT-298's `mode` column is delivered by OPT-338; OPT-298's `playerIndex` claim is delivered by OPT-343; OPT-299 is fully subsumed by OPT-342. |
| 5 | **DO trust gate is mode-aware.** The `playerIndex` JWT claim is only honored when `gameSession.mode === "SOLITAIRE"`. In PVP, `playerIndex` is silently ignored — the existing `userId` match resolves seats. Negative test required to prevent seat-swap exploits. |
| 6 | **Polling MVP, push later.** The `useLobbyRoom` hook polls `GET /api/lobbies/[id]` at 1-2s with `document.visibilityState` gating. The hook is the migration target for OPT-88; this project does not migrate it. |
| 7 | **Mode-switch invalidates ready.** Any host-controlled change (mode, format, host deck) auto-clears `hostReady`. Deck change clears that player's ready. Prevents "switch and start in one click" footguns. |
| 8 | **`requirePlayableDeck` at start, not join.** Deck slots are mutable in the room; legality must run at the boundary that locks the game. Reuses OPT-330's helper without modification. |

---

## Migration / PR plan

| PR | Tickets | Scope |
|----|---------|-------|
| **PR 1** | OPT-338 | Schema migration. Pure additive — no behavior change. |
| **PR 2** | OPT-339 + OPT-340 + OPT-341 | API surface change. Atomic — `/start` must exist before `/join` stops starting games. The `?autoStart=true` shim keeps the existing UI working. Server-only. |
| **PR 3** | OPT-342 | Lobby room UI. Removes the `?autoStart=true` shim. Flips users to the new flow. |
| **PR 4** | OPT-343 | Solitaire mode wire-through. JWT `playerIndex` claim + DO trust gate. |
| **PR 5** | OPT-344 | Migration backfill verification + e2e smoke + close out OPT-298/OPT-299. |

PR 2 can land independently of PR 3 because the shim preserves the existing UX. PR 4 depends on PR 2 (specifically OPT-341 — the `/start` endpoint snapshots `mode`). PR 5 depends on PR 3 + PR 4.

### Dependency graph

```
PR 1 (OPT-338) ──┬─→ PR 2a (OPT-339)
                 ├─→ PR 2b (OPT-340)         ─→ PR 3 (OPT-342) ─┐
                 └─→ PR 2c (OPT-341) ──┬─────────────────────────┴─→ PR 5 (OPT-344)
                                       └─→ PR 4 (OPT-343) ──────────→ ↑
```

### Pre-merge gate

- Architecture Floor must be substantially complete: OPT-330 (`requirePlayableDeck`), OPT-331 (`finalizeGameResult`), OPT-329 (contract tests), OPT-262 (migration drift CI guard) all merged. As of 2026-04-29: ✅ all four are Done.
- OPT-336 (WS upgrade/reconnect throttling) does not block this project — independent surface.

---

## Verified baseline (2026-04-29)

- Lobby create: `POST /api/lobbies` requires `hostDeckId` (will become optional in OPT-338).
- Lobby join: `POST /api/lobbies/join` is the auto-start transaction (`src/app/api/lobbies/join/route.ts:87-133`).
- Lobby state: `Lobby.status ∈ {WAITING, IN_GAME}` — no `READY` state, no per-player ready flags, no `mode`.
- Game session: `game_sessions` has no `mode` column (OPT-298 was going to add it).
- Token mint: `/api/game/token` mints tokens with `sub`, `gameId`, `jti` (per OPT-334) but no `playerIndex` claim.
- DO seat resolution: `workers/game/src/GameSession.ts:746-762` — matches `userId` against `players[0|1].playerId`. Ambiguous when `player1Id === player2Id` (the Solitaire problem).
- `requirePlayableDeck` exists and is used at the lobby/lobby-join boundary today (OPT-330).

---

## Cross-project impact

### Solitaire Mode project — net negative scope

Was 6 tickets / ~14 pts. After this project:

- OPT-298 → **closed.** `mode` column delivered by OPT-338; `/start` collapsed into OPT-341; `playerIndex` claim delivered by OPT-343.
- OPT-299 → **closed.** Solitaire entry page is the lobby room with the Solitaire tab (OPT-342).
- OPT-300 → unchanged. Two-WebSocket-per-tab refactor still needed for the in-game UI.
- OPT-301 → unchanged. Perspective state machine.
- OPT-302 → unchanged. Wire game board to perspective + Flip button + fade transition.
- OPT-303 → unchanged. Solitaire polish (history filter, lobby/feed exclusion).

OPT-344 is responsible for closing OPT-298/OPT-299 with cross-link comments and refreshing OPT-300/301/302/303 descriptions to point at the lobby-room-derived flow.

### OPT-88 (replace polling with push)

The new `useLobbyRoom` hook is the cleanest first surface for SSE/WS migration when OPT-88 is scheduled. Designed to be swap-friendly (visibility-gated, single endpoint, simple state shape). No coupling between the two projects; just a strong handshake.

### Architecture Floor

Reuses OPT-330's `requirePlayableDeck`, OPT-331's `finalizeGameResult` boundary, OPT-329's contract tests (extended with `mode`), and OPT-262's CI migration drift guard. All four are pre-merged.

---

## Deferred / tech debt

- **Lobby browser / discovery.** No public lobby list — invite-only via code. Defer.
- **Spectator mode.** Out of scope. The `mode` enum could grow `SPECTATE` later without schema rework.
- **Match history / replays surfaced from the room.** Defer.
- **Friend-invite integration.** Sharing the join code via the social sidebar is fine for MVP. A "challenge friend → auto-join lobby" flow is downstream.
- **Custom game rules** beyond format selection (banlist toggle, alternate win conditions). Defer.
- **PVComputer implementation.** Disabled tab here; separate project later.
- **Polling → push migration.** OPT-88's job.

---

## Done when

- All 5 PRs merged.
- `Lobby.mode` exists and `game_sessions.mode` is snapshotted at start.
- `POST /api/lobbies/join` admits the user to the room and never starts a game.
- `PATCH /api/lobbies/[id]` mutates mode/decks/ready with permission gates.
- `POST /api/lobbies/[id]/start` is the single game-start surface; mode-aware; runs `requirePlayableDeck` for both seats.
- Lobby room UI at `/lobbies/[id]` renders three tabs and routes both players into the game on Start.
- Solitaire flow works end-to-end up to game start; in-game perspective UX is downstream.
- OPT-298 and OPT-299 closed with cross-links to OPT-338/341/342/343.
- `pnpm verify` is green; `pnpm db:check-migration-drift` is green.
- Manual smoke (PVP + Solitaire + mode-switch eviction) passes.

After this lands, OPT-300/301/302/303 (Solitaire in-game UX) is unblocked and the lobby auto-start UX bug is fixed for 2P.
