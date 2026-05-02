---
linear-project: Realtime Social
linear-project-url: https://linear.app/optcg-sim/project/realtime-social-bf3d7344f863
last-updated: 2026-05-01 · OPT-351 in review
---

# Realtime Social — Handoff Doc

Replace four cross-player polling loops with a single per-user `UserChannel` Durable Object. Real presence ships as a side-effect. Project just created from OPT-88; all 11 tickets in Backlog, none started.

---

## Action Plan

Tickets in execution order. Ordering criteria: dependencies → estimate → priority → risk.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-351](https://linear.app/optcg-sim/issue/OPT-351) | Extract `useAuthedWebSocket` shared hook | 3 | — | In Review | [#205](https://github.com/corycunanan/optcg-sim/pull/205) | Pure refactor; unblocks every other ticket |
| 2 | [OPT-352](https://linear.app/optcg-sim/issue/OPT-352) | `UserChannel` DO scaffold + `/api/realtime/token` | 5 | — | Backlog | — | Server-only; can land in parallel with OPT-351 |
| 3 | [OPT-353](https://linear.app/optcg-sim/issue/OPT-353) | `notifyUser` helper + `useUserChannel` + app-shell wiring | 3 | OPT-351, OPT-352 | Backlog | — | Last foundation ticket; no events yet |
| 4 | [OPT-354](https://linear.app/optcg-sim/issue/OPT-354) | Chat push (P1) — delete 5s chat poll | 3 | OPT-353 | Backlog | — | First polling loop deleted; +60s backstop |
| 5 | [OPT-355](https://linear.app/optcg-sim/issue/OPT-355) | Friends push (P2) — delete 30s sidebar poll | 3 | OPT-353 | Backlog | — | Four event types; +60s backstop |
| 6 | [OPT-356](https://linear.app/optcg-sim/issue/OPT-356) | Lobby push (P3a) — delete 1.5s lobby poll | 3 | OPT-353 | Backlog | — | Replaces poll with the inline OPT-88 breadcrumb at `use-lobby-room.ts:123` |
| 7 | [OPT-357](https://linear.app/optcg-sim/issue/OPT-357) | Game status push (P3b) — delete 2s game status poll | 2 | OPT-353 | Backlog | — | No backstop (one-shot terminal state) |
| 8 | [OPT-358](https://linear.app/optcg-sim/issue/OPT-358) | Real presence (P4) — `User.lastSeen` + DO bookkeeping + UI | 5 | OPT-353 | Backlog | — | First schema change; multi-tab debounce required |
| 9 | [OPT-359](https://linear.app/optcg-sim/issue/OPT-359) | Stretch: typing indicators + read receipts (P5a/b) | 4 | OPT-354 | Backlog | — | First client→server event vocabulary |
| 10 | [OPT-360](https://linear.app/optcg-sim/issue/OPT-360) | Stretch: lobby invite notifications (P5c) | 3 | OPT-356 | Backlog | — | New feature, not a polling replacement |
| 11 | [OPT-361](https://linear.app/optcg-sim/issue/OPT-361) | Cleanup: drop the 60s backstop polls | 1 | OPT-354–358 | Backlog | — | Soak gate: 7 days, <1% fanout failure rate |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`). Don't invent.

**Next up:** OPT-352 (server-only foundation, ready now). OPT-353 unblocks once both OPT-351 (in review) and OPT-352 land.

**Total:** ~35 points.

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

### Project setup → OPT-351
**From:** session on 2026-05-01 · **Commit:** *(uncommitted; project + tickets land in OPT-351's PR)* · **PR:** —

- **Primer:** OPT-88 was an umbrella analysis ticket. Promoted to a Linear project (Realtime Social) with 11 tickets covering foundation refactor → poll-by-poll migration → presence → stretch features → cleanup. SCOPE doc at `docs/project/REALTIME-SOCIAL-SCOPE.md` is the architectural source of truth.
- **Read first:** `src/hooks/use-game-ws.ts` (the hook OPT-351 generalizes — supersede-safe `onclose` at `:158-181` is the OPT-350 invariant; preserve verbatim). Then `docs/project/REALTIME-SOCIAL-SCOPE.md` §Architecture sketch.
- **Gotchas / do NOT touch:** Do **not** rename `GAME_WORKER_SECRET`, do **not** change `useGameWs`'s public surface, do **not** introduce a different reconnect heuristic. The token-on-every-reconnect contract is non-negotiable per OPT-350's incident notes.
- **Unresolved:** Whether the worker secret should be renamed `WORKER_SECRET` (cosmetic; not in scope for any current ticket). Whether the `verifyGameToken` should be split into two helpers or a single parameterized one (decided in OPT-352 — author's call).
- **Why this matters for OPT-351:** OPT-351 is a pure refactor with a strict no-behavior-change constraint. The supersede-safe close logic is the highest-value invariant in the existing hook; the new generic hook **must** preserve it line-for-line. Test coverage of that invariant should be the first thing OPT-351 lands.

### OPT-351 → OPT-352
**From:** session on 2026-05-01 · **Commit:** `314087a` · **PR:** [#205](https://github.com/corycunanan/optcg-sim/pull/205)

- **Primer:** WebSocket transport extracted from `useGameWs` into `src/hooks/use-authed-websocket.ts`. The hook is a thin React adapter over a pure factory `createAuthedWebSocketController` (mirrors `createScenarioRunner` so lifecycle is testable without React). `useGameWs` is now ~120 lines of game-vocabulary message routing; its public return shape is unchanged. OPT-352 does **not** consume the new hook (server-only ticket) but lands on the same project foundation.
- **Read first:** `src/hooks/use-authed-websocket.ts` (the new shared hook OPT-353 will consume — don't fork it). `workers/game/src/GameSession.ts` + `workers/game/src/util/auth.ts` + `workers/game/src/util/token-replay.ts` (patterns OPT-352's `UserChannel` DO should mirror — hibernation accept, JTI consumption, Bearer-secret notify endpoint).
- **Gotchas / do NOT touch:** Do **not** edit `useAuthedWebSocket` to add game-specific or user-channel-specific concerns — it's transport only. Reuse the same `JWT_SECRET` / `WORKER_SECRET` envs that `GameSession` uses; do not introduce parallel secrets. The OPT-350 supersede invariant is now in `shouldHandleClose` (pure helper) — preserve verbatim if anything in that area is touched downstream.
- **Unresolved:** Whether `verifyGameToken` should be split into two helpers vs. parameterized with an audience claim — author's call in OPT-352 (SCOPE doc §Locked design decisions calls for shared `JWT_SECRET`, no `gameId` claim in user tokens). One unchecked item from this PR's test plan: manual 2P-game smoke + Solitaire Strict Mode WS-count check (OPT-350 regression) — should be run before merge.
- **Why this matters for OPT-352:** OPT-352 is independent on the wire (server-only DO scaffold + `/api/realtime/token` endpoint) but consumes the same auth conventions. The new hook is irrelevant *for OPT-352 directly* but is the future client of OPT-352's DO via OPT-353 — keep the WS handshake protocol exactly compatible (`?token=<HS256>` query param, `verifyGameToken`-shape verification on the worker side). The token URL appending (`?token=` separator handling) is now centralized in `createAuthedWebSocketController` — OPT-352's wrangler routes should accept that exact URL shape.
