---
linear-project: Lobby Room UX
linear-project-url: https://linear.app/optcg-sim/project/lobby-room-ux-7accc6912db3
last-updated: 2026-04-29 (OPT-344 closeout in progress)
---

# Lobby Room UX — Handoff Doc

Replace the auto-start-on-join lobby with a real pre-game room: three match-type tabs (PVP / Solitaire / PVComputer-disabled), per-player deck pickers, ready-up, and a host-driven Start button. Subsumes most of OPT-298 and all of OPT-299. Full scope: [`docs/project/LOBBY-ROOM-UX-SCOPE.md`](../LOBBY-ROOM-UX-SCOPE.md).

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk. The Linear project description is the source of truth if this table drifts.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-338](https://linear.app/optcg-sim/issue/OPT-338) | Schema: `Lobby.mode`, ready flags, mutable deck slots, `game_sessions.mode` snapshot | 3 | — | Done | [#186](https://github.com/corycunanan/optcg-sim/pull/186) | Gate ticket. Pure additive migration; existing rows backfill to `PVP`. No behavior change yet. Updated 2026-04-29. |
| 2 | [OPT-339](https://linear.app/optcg-sim/issue/OPT-339) | Refactor `POST /api/lobbies/join` to enter-room only (strip start logic) | 2 | OPT-338 | Done | [#187](https://github.com/corycunanan/optcg-sim/pull/187) | Adds temporary `?autoStart=true` shim so existing UI keeps working until OPT-342 ships. Drops `requirePlayableDeck` from normal join (moves to start). Updated 2026-04-29. |
| 3 | [OPT-340](https://linear.app/optcg-sim/issue/OPT-340) | `PATCH /api/lobbies/[id]`: mode/deck/ready mutations + guest-eject behavior | 3 | OPT-338 | Done | [#188](https://github.com/corycunanan/optcg-sim/pull/188) | Single endpoint with permission-gated fields. PVP→Solitaire with guest present returns 409 unless `?force=true`. Mode/deck changes clear ready state. Updated 2026-04-29. |
| 4 | [OPT-341](https://linear.app/optcg-sim/issue/OPT-341) | `POST /api/lobbies/[id]/start`: host-only, mode-aware, runs deck legality + DO init | 3 | OPT-338 | Done | [#189](https://github.com/corycunanan/optcg-sim/pull/189) | Migrates the GameSession + DO init transaction from join route. Reuses `requirePlayableDeck` (OPT-330) and `buildGameInitPayload`. Idempotent via `Lobby.status` lock. Updated 2026-04-29. |
| 5 | [OPT-342](https://linear.app/optcg-sim/issue/OPT-342) | Lobby room UI with three tabs (PVP/Solitaire/PVComputer-disabled), deck pickers, ready, host Start button | 5 | OPT-339, OPT-340, OPT-341 | Done | [#190](https://github.com/corycunanan/optcg-sim/pull/190) | New `/lobbies/[id]` page. Polling MVP via `useLobbyRoom` hook — designed as the future swap point for OPT-88. Removes the `?autoStart=true` shim. Updated 2026-04-29. |
| 6 | [OPT-343](https://linear.app/optcg-sim/issue/OPT-343) | Solitaire mode wire-through: `playerIndex` JWT claim + DO trust gate (subsumes most of OPT-298) | 3 | OPT-341 | Done | [#191](https://github.com/corycunanan/optcg-sim/pull/191) | Adds Solitaire-only `playerIndex` game-token claims, persists DO mode, and rejects explicit perspective claims outside `SOLITAIRE`. Replay remains keyed by `(jti)`. Updated 2026-04-29. |
| 7 | [OPT-344](https://linear.app/optcg-sim/issue/OPT-344) | Migration backfill + e2e smoke + close out OPT-298/OPT-299 | 2 | OPT-342, OPT-343 | In Progress | — | Migration audit clean: no ambiguous lobby rows, `game_sessions.mode` has zero nulls, and migration drift reports no difference. Focused lobby/game token worker smoke is green. Updated 2026-04-29. |

**Total estimate:** 21 points.

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`).

**Next up:** Project closeout — OPT-344 is the final Lobby Room UX ticket. No follow-up tickets remain in this Action Plan after OPT-344 lands.

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

### OPT-338 → OPT-339
**From:** session on 2026-04-29 · **Commit:** `fbeb442` · **PR:** #186

- **Primer:** The database can now represent lobby room modes, ready flags, nullable pre-game deck slots, and a frozen `game_sessions.mode` snapshot; current create/join behavior is intentionally preserved.
- **Read first:** `prisma/schema.prisma`, `src/app/api/lobbies/join/route.ts`, `src/app/api/lobbies/[id]/route.ts`, `src/lib/validators/lobbies.ts`
- **Gotchas / do NOT touch:** Do not start the full room PATCH/start/UI work in OPT-339; keep its scope to converting join into enter-room with the temporary `?autoStart=true` shim.
- **Unresolved:** `buildGameInitPayload` still does not carry `mode` to the Durable Object; that belongs with OPT-341/OPT-343 when `/start` and the trust gate are wired.
- **Why this matters for OPT-339:** `POST /api/lobbies/join` now has the schema it needs to admit a guest without requiring an immediate `GameSession`, while the existing null-host-deck guard marks the boundary the new room flow must handle deliberately.

### OPT-339 → OPT-340
**From:** session on 2026-04-29 · **Commit:** `a88f007` · **PR:** #187

- **Primer:** Normal `POST /api/lobbies/join` now only creates the guest seat, moves PVP lobbies to `READY`, and returns `{ lobbyId }`; the old game-start flow is isolated behind `?autoStart=true`.
- **Read first:** `src/app/api/lobbies/join/route.ts`, `src/app/api/lobbies/[id]/route.ts`, `src/lib/validators/lobbies.ts`, `src/hooks/use-lobby-session.ts`
- **Gotchas / do NOT touch:** Keep the `?autoStart=true` shim until OPT-342 removes it. Do not migrate game-session/DO init out of the shim until OPT-341 adds `/start`.
- **Unresolved:** `buildGameInitPayload` still omits mode for the Durable Object; `requirePlayableDeck` still belongs at explicit start time in OPT-341, not in OPT-340 mutations.
- **Why this matters for OPT-340:** The room can now exist before game start, so PATCH can safely focus on mode/deck/ready mutations against `WAITING`/`READY` lobbies without inheriting join-time deck legality or DO initialization.

### OPT-340 → OPT-341
**From:** session on 2026-04-29 · **Commit:** `00fffa4` · **PR:** #188

- **Primer:** `PATCH /api/lobbies/[id]` now owns pre-game room mutations: host-controlled mode/format/host deck, PVP guest deck/ready, Solitaire side-B host control, ready invalidation, and forced real-guest ejection.
- **Read first:** `src/app/api/lobbies/[id]/route.ts`, `src/app/api/lobbies/[id]/route.test.ts`, `src/app/api/lobbies/join/route.ts`, `src/lib/game/init-payload.ts`
- **Gotchas / do NOT touch:** Do not remove `?autoStart=true` yet. OPT-341 should migrate the existing GameSession + Durable Object init path out of the shim into `/start`, not rewrite the room PATCH behavior or add UI.
- **Unresolved:** `buildGameInitPayload` still needs mode carried into the app↔worker init contract for `/start`; deck legality still belongs only at start time via `requirePlayableDeck`.
- **Why this matters for OPT-341:** The lobby room can now reach PVP or Solitaire readyable pre-game states without creating a game, so `/start` can focus on host-only prerequisite checks, deck legality, idempotent GameSession creation, and DO init.

### OPT-341 → OPT-342
**From:** session on 2026-04-29 · **Commit:** `2f2f724` · **PR:** #189

- **Primer:** `POST /api/lobbies/[id]/start` is now the single explicit host start path for PVP and Solitaire; it validates room readiness, runs deck legality for both seats, snapshots `Lobby.mode`, initializes the Durable Object, and rolls back on worker-init failure.
- **Read first:** `src/app/api/lobbies/[id]/route.ts`, `src/app/api/lobbies/[id]/start/route.ts`, `src/app/api/lobbies/join/route.ts`, `src/lib/game/init-payload.ts`
- **Gotchas / do NOT touch:** OPT-342 should remove the temporary `?autoStart=true` join shim when the new UI flips over, but should not add Solitaire `playerIndex` JWT claims or Durable Object trust gates; that remains OPT-343.
- **Unresolved:** No UI exists yet for room polling, deck slot mutation, ready state, or Start. PVComputer remains server-rejected with 501 and should render disabled.
- **Why this matters for OPT-342:** The room UI can now treat join as enter-room, PATCH as configuration, and `/start` as the host-only final lock, with nullable deck slots remaining normal until the user clicks Start.

### OPT-342 → OPT-343
**From:** session on 2026-04-29 · **Commit:** `27aae35` · **PR:** #190

- **Primer:** `/lobbies/[id]` is now the pre-game room: create/join route there, `useLobbyRoom` polls room state, host controls PVP/Solitaire/PVComputer-disabled tabs, deck slots/ready state mutate via PATCH, and Start calls `/api/lobbies/[id]/start`.
- **Read first:** `src/components/lobbies/lobby-room-shell.tsx`, `src/hooks/use-lobby-room.ts`, `src/app/api/lobbies/[id]/route.ts`, `src/app/api/lobbies/[id]/start/route.ts`, `src/app/api/game/token/route.ts`, `workers/game/src/GameSession.ts`
- **Gotchas / do NOT touch:** Do not re-add `?autoStart=true`; do not move deck legality into PATCH or UI; OPT-343 should add mode-gated Solitaire `playerIndex` JWT/DO trust behavior only. PVComputer stays disabled/unimplemented.
- **Unresolved:** Browser-smoked single-user room creation, tab switching, host deck selection, ready, and Start gating. A full two-auth-context PVP join/start plus ejected-guest toast remains for pre-merge/OPT-344 smoke.
- **Why this matters for OPT-343:** `/start` now snapshots `mode` and the room can create Solitaire sessions with `player1=host` and `player2=host`, so the token/DO work must disambiguate player perspective only in Solitaire while preserving normal PVP trust rules.

### OPT-343 → OPT-344
**From:** session on 2026-04-29 · **Commit:** `e0ae493` · **PR:** #191

- **Primer:** Solitaire perspective now flows through `?playerIndex=0|1` game-token claims; the app only mints them for same-user `SOLITAIRE` sessions, and the Durable Object refuses explicit perspective claims for PVP.
- **Read first:** `src/app/api/game/token/route.ts`, `src/hooks/use-game-session.ts`, `workers/game/src/GameSession.ts`, `workers/game/src/__tests__/opt-343-solitaire-player-index.test.ts`, `src/__tests__/contracts/app-worker-contracts.test.ts`
- **Gotchas / do NOT touch:** Keep `/api/lobbies/[id]/start` as the only deck-legality boundary; do not re-add `/api/lobbies/join?autoStart=true`; PVComputer remains disabled. PVP trust still resolves seats by `sub` matching player IDs and ignores forged `playerIndex` claims for normal two-user games.
- **Unresolved:** Full two-auth-context PVP join/start, ejected-guest toast, migration backfill verification, and OPT-298/OPT-299 closeout remain OPT-344. No token replay follow-up: replay tracking is still per `jti`, and separate Solitaire side tokens are covered by contract tests.
- **Why this matters for OPT-344:** The backend and token trust layers are now ready for closeout smoke; OPT-344 can focus on migration/backfill checks, manual PVP/Solitaire/ejection verification, and cross-linking the subsumed Solitaire tickets.

### OPT-344 → Project closeout
**From:** session on 2026-04-29 · **Commit:** pending · **PR:** pending

- **Primer:** The Lobby Room UX stack is complete through closeout: join enters a room, start is explicit and mode-aware, Solitaire sessions carry `mode`/`playerIndex` safely, and the old auto-start shim is absent from runtime code.
- **Verification:** Database audit returned no ambiguous lobby rows and `game_sessions.mode` null count `0`; `pnpm db:check-migration-drift` passed with "No difference detected" against a disposable shadow database.
- **Smoke:** Focused app tests for lobby join/PATCH/start, game token, and app-worker contracts passed; worker OPT-343 trust-gate tests passed.
- **Gotchas / do NOT touch:** Keep deck legality at `POST /api/lobbies/[id]/start`; keep PVComputer disabled; keep normal PVP seat identity resolved by token `sub`/player IDs, not explicit `playerIndex`.
- **Unresolved:** None for Lobby Room UX. Downstream Solitaire in-game UX continues in OPT-300/OPT-301/OPT-302/OPT-303, now building on the lobby room flow.
