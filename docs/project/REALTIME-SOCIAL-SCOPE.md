# Realtime Social — Scope Doc

> **Architectural source of truth** for the project that replaces every cross-player polling loop with a push channel.
> **Linear project:** [Realtime Social](https://linear.app/optcg-sim/project/realtime-social-bf3d7344f863).
> **Handoff doc + Action Plan:** `docs/project/handoffs/realtime-social.md`.
> **Origin:** [OPT-88](https://linear.app/optcg-sim/issue/OPT-88) — promoted to a project on 2026-05-01.

---

## Summary

Today every cross-player update in the app is **pulled, never pushed**:

| Surface | Location | Interval |
| --- | --- | --- |
| DM messages | `src/components/social/chat-widget.tsx:46-73` | 5s |
| Friends list + incoming requests | `src/components/social/social-sidebar.tsx:78-84` | 30s |
| Lobby room state | `src/hooks/use-lobby-room.ts:97-132` (visibility-gated) | 1.5s |
| Remote game status | `src/hooks/use-remote-game-status.ts:53-56` | 2s |

An idle authenticated tab makes ~3 background fetches per second just to keep social state warm, and a friend request still takes up to **30 seconds** to appear. **Presence is a phantom** — `social-sidebar.tsx:226` renders every friend with `showOnline` hardcoded; there's no heartbeat, no `lastSeen`, no presence API.

No realtime infra exists outside an active game. `use-game-ws.ts` connects to a per-game Cloudflare Durable Object (`workers/game/src/GameSession.ts`); there is **no per-user channel, no SSE endpoint, no managed pub/sub**.

This project replaces all four polling loops with a single per-user WebSocket channel, delivers real presence as a side-effect, and harvests the auth + reconnect logic already proven in `use-game-ws.ts` into a shared primitive.

---

## Locked design decisions

1. **`UserChannel` Durable Object, one per signed-in user**, keyed by `userId`. Lives in the existing `optcg-game` worker alongside `GameSession`. WebSocket Hibernation — billed only on events, not connection time.
2. **Auth reuses the HS256 in-URL pattern from `use-game-ws.ts`.** New endpoint `POST /api/realtime/token` mints `{ sub: userId, iat, exp, jti }` (no `gameId`). Same `JWT_SECRET` (renamed from the inline use in `verifyGameToken`); same 5-minute expiry; same fresh-token-on-every-reconnect contract.
3. **Fanout is server-driven.** Every API write that affects another user calls a single helper `notifyUser(targetUserId, event)` that POSTs to `/user/:userId/notify` on the worker with the shared `WORKER_SECRET` Bearer. The DO broadcasts to all live sockets for that user.
4. **Multi-tab is first-class.** A user can have several sockets to the same DO. Broadcast to all; treat presence as "at least one socket connected."
5. **Backstop polling stays for one phase past each push migration.** Drop the high-frequency poll, keep a 60-second reconciliation poll until the cleanup ticket. A dropped socket can't permanently desync state during the rollout.
6. **Reconnect logic is shared.** Before P1, the reconnect/token-refresh/supersede-safe logic in `use-game-ws.ts` is generalized into `useAuthedWebSocket`. Both `useGameWs` and `useUserChannel` consume it. We don't fork two copies.
7. **Stretch features (typing, read receipts, lobby invites) ride on top of the same channel.** No new infra; they're event-vocabulary additions.

---

## Why a Durable Object, not SSE / managed pub-sub

We considered five options (full analysis: [OPT-88](https://linear.app/optcg-sim/issue/OPT-88)):

| Option | Verdict |
| --- | --- |
| Reduce poll intervals | Cheapest, but doesn't break the latency floor and grows DB cost linearly. **Rejected.** |
| Piggyback on the per-game WebSocket | Solves ~10% of the problem (in-match chat only). **Rejected as primary path.** |
| **`UserChannel` Durable Object** | Solves all four polls + presence for free. Reuses an auth pattern already proven in production. **Accepted.** |
| SSE per user from a Vercel function | Simpler client (`EventSource`) but Vercel Functions are a poor fit for long-held connections (cost, timeouts). **Fallback only.** |
| Pusher / Ably / Supabase Realtime | Zero infra, predictable DX, but adds a vendor + per-message billing. **Reject unless DO option blocks.** |

Cloudflare Workers + DOs are already the platform for `GameSession`. Adding a second DO class in the same worker is one binding, one migration tag, zero new vendors.

---

## Goals

- Replace the four polling loops with push delivery. Worst-case end-to-end latency from server write → consumer render: **<500ms** (vs 5–30s today).
- Cut idle-tab background HTTP fetches **>90%** (3 fetches/sec → ~0 with optional 60s backstop).
- Real presence: friend's green dot reflects whether they have at least one live socket; `lastSeen` populated within 5 seconds of socket close.
- Single shared WebSocket primitive; `useGameWs` and `useUserChannel` each ~50 lines of glue, not 200+ lines of forked reconnect logic.
- Zero new vendors. Zero new top-level packages besides those needed for token signing in the worker (already present).

## Non-goals

- Group chat / chat rooms — DMs only.
- Chat history pagination changes — message persistence model stays exactly as-is in `prisma/schema.prisma`.
- Notification persistence (e.g., "you have 3 unread messages" badge after the user closes the tab) — a server-rendered count exists; we don't change it.
- Spectator-mode game streaming — `GameSession` already covers it.
- Mobile push notifications — out of scope; web-tab-open only.
- Replacing the per-game `GameSession` WebSocket — it stays exactly as it is.

---

## Architecture sketch

```
                  ┌──────────────────────────────────────┐
                  │  Next.js (Vercel) — app + API routes │
                  └──────────────┬───────────────────────┘
                                 │
                                 │  notifyUser(targetUserId, event)
                                 │  POST /user/<id>/notify  (Bearer WORKER_SECRET)
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │   Cloudflare Worker: optcg-game                  │
        │                                                  │
        │   ┌────────────┐   ┌────────────────────────┐   │
        │   │ GameSession │   │ UserChannel (NEW)      │   │
        │   │ DO (per     │   │ DO (per userId)        │   │
        │   │ gameId)     │   │ Hibernation-style WS    │   │
        │   │             │   │ Broadcasts to all      │   │
        │   │             │   │ sockets for that user  │   │
        │   └────────────┘   └──────────┬─────────────┘   │
        └─────────────────────────────────┼────────────────┘
                                          │  WSS, ?token=<HS256>
                                          ▼
                              ┌──────────────────────┐
                              │  Browser (Next.js)    │
                              │  useUserChannel hook  │
                              │   + per-feature       │
                              │     subscribers       │
                              └──────────────────────┘
```

### Token flow

1. App-shell mounts, calls `POST /api/realtime/token` → Next.js mints HS256 `{sub, iat, exp, jti}`.
2. Browser opens `wss://worker/user/:userId/ws?token=<jwt>`.
3. Worker fetches → DO `idFromName(userId)`. DO verifies token via `crypto.subtle` (same code path as `verifyGameToken`, but no `gameId`).
4. Hibernation accept. Socket attached with `{ userId, connectionId }`. Token JTI consumed (same anti-replay store as game).
5. On reconnect: client refetches token (5-min expiry); same handshake.

### Fanout flow

1. API route writes (e.g. `POST /api/messages/[userId]`) → `prisma.message.create(...)`.
2. After commit: `await notifyUser(toUserId, { type: "message:new", message })`.
3. Helper does `fetch(${WORKER_URL}/user/${toUserId}/notify, { headers: { Authorization: 'Bearer ' + WORKER_SECRET }, ...})`.
4. Worker validates Bearer → DO `idFromName(toUserId)` → DO broadcasts to all attached sockets via `getWebSockets()`.

### Event vocabulary (target end-state)

| Event | Payload (sketch) | Triggered by | Replaces |
| --- | --- | --- | --- |
| `message:new` | `{ message: Message }` | `POST /api/messages/[userId]` | 5s chat poll |
| `friend:request_received` | `{ request: FriendRequest }` | `POST /api/friends/requests` | 30s sidebar poll |
| `friend:request_accepted` | `{ request: FriendRequest, friendship: Friendship }` | `PUT /api/friends/requests/[id]` (accept) | — |
| `friend:request_declined` | `{ requestId }` | `PUT /api/friends/requests/[id]` (decline) | — |
| `friend:removed` | `{ userId }` | `DELETE /api/friends/[userId]` | 30s sidebar poll |
| `lobby:state_changed` | `{ lobby: LobbyRoomState }` | `POST /api/lobbies/join`, `PATCH /api/lobbies/[id]`, `POST /api/lobbies/[id]/start` | 1.5s lobby poll |
| `game:status` | `{ gameId, status, winnerId, winReason }` | `POST /api/game/result` (and any game-status mutation) | 2s remote-status poll |
| `presence:friend_online` | `{ userId }` | DO sees first socket attach | hardcoded green dot |
| `presence:friend_offline` | `{ userId, lastSeen }` | DO sees last socket detach + 5s grace | hardcoded green dot |
| `chat:typing` *(stretch)* | `{ fromUserId, until }` | client-emitted, server-relayed | — |
| `chat:read_to` *(stretch)* | `{ fromUserId, throughCreatedAt }` | client-emitted on viewport scroll | — |
| `lobby:invite_received` *(stretch)* | `{ lobby: PreviewLobby, fromUser }` | new `POST /api/lobbies/invite` | — |

---

## PR phasing

Each ticket below = one PR. PRs land in dependency order; the only parallelism opportunity is between sibling event-replacement tickets after the foundation is in place.

| # | Ticket | Title | Phase | Depends on |
| --- | --- | --- | --- | --- |
| 1 | [OPT-351](https://linear.app/optcg-sim/issue/OPT-351) | Extract `useAuthedWebSocket` shared hook from `use-game-ws.ts` | Foundation | — |
| 2 | [OPT-352](https://linear.app/optcg-sim/issue/OPT-352) | `UserChannel` Durable Object scaffold + `/api/realtime/token` | Foundation | — |
| 3 | [OPT-353](https://linear.app/optcg-sim/issue/OPT-353) | `notifyUser` server helper + `useUserChannel` client hook + app-shell wiring | Foundation | OPT-351, OPT-352 |
| 4 | [OPT-354](https://linear.app/optcg-sim/issue/OPT-354) | Replace 5s chat poll with `message:new` push (P1) | Migration | OPT-353 |
| 5 | [OPT-355](https://linear.app/optcg-sim/issue/OPT-355) | Replace 30s friends poll with `friend:*` events (P2) | Migration | OPT-353 |
| 6 | [OPT-356](https://linear.app/optcg-sim/issue/OPT-356) | Replace 1.5s lobby poll with `lobby:state_changed` (P3a) | Migration | OPT-353 |
| 7 | [OPT-357](https://linear.app/optcg-sim/issue/OPT-357) | Replace 2s remote game status poll with `game:status` (P3b) | Migration | OPT-353 |
| 8 | [OPT-358](https://linear.app/optcg-sim/issue/OPT-358) | Real presence: `lastSeen` + DO connect/disconnect broadcast + UI wire-up (P4) | Feature | OPT-353 |
| 9 | [OPT-359](https://linear.app/optcg-sim/issue/OPT-359) | Stretch: typing indicators + read receipts (P5a + P5b) | Polish | OPT-354 |
| 10 | [OPT-360](https://linear.app/optcg-sim/issue/OPT-360) | Stretch: lobby invite notifications (P5c) | Feature | OPT-356 |
| 11 | [OPT-361](https://linear.app/optcg-sim/issue/OPT-361) | Cleanup: drop the 60s backstop reconciliation polls | Cleanup | OPT-354–OPT-358 |

**Total estimate:** ~35 pts.

---

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| DO startup cost on first connect after deploy | DO storage + hibernation; cold-start is ~50ms in measured Cloudflare prod regions. |
| Token replay across users | Reuse the JTI consumption store in `workers/game/src/util/token-replay.ts`. Per-user JTI keyspace. |
| Multi-tab presence flapping | DO holds an in-memory connection counter; `presence:friend_offline` only fires after a 5s debounce when count → 0. Mirrors the existing `DISCONNECT_BROADCAST_DEBOUNCE_MS` pattern in `GameSession`. |
| Fanout failure (worker unreachable, network blip) | `notifyUser` is best-effort with a 2s timeout; logged but doesn't fail the API write. The 60s backstop poll catches any miss until the Cleanup ticket. |
| WORKER_SECRET leak from public-facing client | Only Next.js (server-side) calls `/user/*/notify`; never exposed to the browser. Same model as `GAME_WORKER_SECRET` today. |
| Fanout amplification (e.g., bulk friend removal) | Fanout is O(1) per affected user. The largest realistic blast radius is "user removed by friend" → 1 event to 1 user. |
| Mobile background tab kills the socket → desync | 60s reconciliation poll during rollout. After Cleanup, accept that backgrounded tabs reconcile on focus via React Query stale-time on the affected views. |

---

## References

- Reference WebSocket client (auth, reconnect, supersede-safe): `src/hooks/use-game-ws.ts`
- Reference per-game DO (token verify, hibernation, broadcast): `workers/game/src/GameSession.ts`, `workers/game/src/util/auth.ts`, `workers/game/src/util/token-replay.ts`
- Worker entry point + binding pattern: `workers/game/src/index.ts`, `workers/game/wrangler.toml`
- Existing fanout-shaped helper for game finalization: `src/lib/game/notify-end.ts` (model for `notifyUser`)
- Polling loops to delete (and the file-paths-to-touch index):
  - `src/components/social/chat-widget.tsx:46-73`
  - `src/components/social/social-sidebar.tsx:78-84`, `:226` (fake presence)
  - `src/components/social/user-avatar.tsx:42-44` (`showOnline` prop)
  - `src/hooks/use-lobby-room.ts:97-132` (and the inline OPT-88 comment at `:123`)
  - `src/hooks/use-remote-game-status.ts:53-56`
- DB models that change: `prisma/schema.prisma` — `User.lastSeen` added in T8.
- Predecessor projects:
  - **Lobby Room UX** — defined `useLobbyRoom`'s shape; T6 replaces its poll.
  - **Game Board Reliability** — proved the supersede-safe `onclose` pattern; T1 generalizes it.
