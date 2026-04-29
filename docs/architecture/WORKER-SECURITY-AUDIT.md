# Worker WebSocket Security Audit

Date: 2026-04-29
Linear: [OPT-333](https://linear.app/optcg-sim/issue/OPT-333/worker-websocket-security-audit-token-replay-action-spam-payload)

## Scope

This audit covers the Cloudflare Durable Object WebSocket surface for game sessions:

- `workers/game/src/GameSession.ts` WebSocket upgrade, message, close, and reconnect handling
- `workers/game/src/util/auth.ts` game token verification
- `src/lib/game/token.ts` and `src/app/api/game/token/route.ts` game token issuance
- `src/hooks/use-game-ws.ts` client reconnect behavior

API-side rate limiting is out of scope here. `src/app/api/game/result/route.ts` already has a result callback limiter; this document focuses on authenticated long-lived WebSocket sessions.

## Executive Summary

The worker has a solid baseline: upgrades require an HS256 game token, token expiry is enforced, user membership is checked against the loaded game state, and client messages pass through strict Zod discriminated-union validation before reaching the game pipeline.

The gaps are mostly around abuse controls after a token is valid:

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| F1 | Game tokens are not game-scoped by default and have no replay identifier | High | Fixed in OPT-334 |
| F2 | No per-player WebSocket action rate limit | High | Fixed in OPT-335 |
| F3 | No payload size cap before parsing client messages | Medium | Fixed in OPT-333 |
| F4 | Reconnect and upgrade attempts are not throttled | Medium | Follow-up: [OPT-336](https://linear.app/optcg-sim/issue/OPT-336/throttle-websocket-upgrade-and-reconnect-attempts-per-game-player) |
| F5 | Multiple sockets for one player can desync presence and prompt delivery | High | Follow-up: [OPT-337](https://linear.app/optcg-sim/issue/OPT-337/enforce-one-active-websocket-per-player-in-each-game-session) |

## Existing Controls

- WebSocket upgrades require `?token=...`; missing or invalid tokens return `401`.
- `verifyGameToken()` verifies the HS256 signature with `GAME_WORKER_SECRET` and rejects expired tokens.
- `GameSession.validateToken()` only authorizes users whose `sub` matches `players[0].playerId` or `players[1].playerId`.
- `validateClientMessage()` rejects unknown envelopes, unknown actions, extra keys, and malformed action payloads before `handleAction()`.
- The client fetches a fresh token on every reconnect attempt, which avoids stale-token reconnect loops.
- Disconnects start a five-minute rejoin window and pause opponent-sensitive action paths.

## Findings

### F1. Game tokens are not game-scoped by default and have no replay identifier

Severity: High

`mintGameToken()` can include `gameId`, but `/api/game/token` currently calls it with only `userId` and `GAME_WORKER_SECRET`. `verifyGameToken()` rejects a mismatched `gameId` only when the token already contains a `gameId`; tokens without that claim still pass the expected-game check. Tokens also do not include `jti`, so the worker cannot distinguish a fresh token from a replayed one.

Impact: a captured token can be reused for any active game containing that user during its five-minute TTL. It can also be reused for repeated same-game upgrades during the TTL.

Resolution in OPT-334: `/api/game/token` now requires a `gameId`, verifies the caller is `player1Id` or `player2Id` on that game session, and mints tokens with `gameId` plus `jti`. Worker validation rejects tokens missing `gameId`/`jti`, rejects mismatched `gameId`, and consumes each `jti` once through Durable Object storage. Replays fail even within the token TTL; expired consumed identifiers are pruned by token expiration.

Follow-up: none for token scoping/replay. Action spam and reconnect churn remain separately tracked by OPT-335 and OPT-336.

### F2. No per-player WebSocket action rate limit

Severity: High

`webSocketMessage()` parses each client message, validates it, and forwards `game:action` payloads into `handleAction()` with no per-socket or per-player rate control. Invalid messages still burn JSON parsing and validation work; valid spam can repeatedly enter turn checks, prompt checks, and in some cases the engine pipeline.

Impact: an authenticated player can consume Durable Object CPU and storage writes by flooding messages, even if most actions are rejected as illegal turn actions.

Resolution in OPT-335: `GameSession.webSocketMessage()` now applies a Durable Object-local token bucket keyed by `(gameId, playerIndex)` before validating or handling authenticated `game:action` envelopes. The gameplay bucket allows short bursts and refills over time; malformed or unknown envelopes use a smaller abuse bucket, while `game:leave` stays available so players can always exit. Exceeded buckets send a clear `game:error`, log the decision, and close the socket with code `1008`.

Follow-up: none for action spam. Upgrade/reconnect churn remains separately tracked by [OPT-336](https://linear.app/optcg-sim/issue/OPT-336/throttle-websocket-upgrade-and-reconnect-attempts-per-game-player).

### F3. No payload size cap before parsing client messages

Severity: Medium

Before OPT-333, `webSocketMessage()` decoded and parsed any incoming string or binary payload size. Zod validation eventually rejected malformed payloads, but only after JSON decoding and parse work. Some valid action shapes also contain arrays or strings with no schema-level maximums, so message size was bounded mainly by platform behavior.

Impact: an authenticated client could send oversized messages to waste memory and CPU before rejection.

Resolution in OPT-333: `GameSession.webSocketMessage()` now rejects messages larger than 8 KiB before loading state, decoding binary content, parsing JSON, or validating the payload. Oversized messages close the socket with code `1009` (`message too big`). The cap is intentionally small because legitimate game actions are compact IDs and small arrays.

Follow-up: none for the cap itself. Future schema-specific `.max()` limits would be useful hardening, but the byte cap is the primary protection.

### F4. Reconnect and upgrade attempts are not throttled

Severity: Medium

`handleWebSocket()` accepts every valid upgrade, marks the player connected, persists, syncs alarms, and broadcasts presence. `useGameWs` uses exponential backoff on ordinary reconnects, but the server does not enforce a reconnect budget.

Impact: a valid token holder can loop upgrades and disconnects to cause repeated writes, alarm churn, and broadcasts. Action rate limiting alone would not cover this path because the cost happens during upgrade and close.

Recommendation: track upgrade attempts per `(gameId, playerIndex)` in the Durable Object, allow normal refresh/reconnect behavior, and reject excessive attempts with a retry-friendly policy.

Follow-up: [OPT-336](https://linear.app/optcg-sim/issue/OPT-336/throttle-websocket-upgrade-and-reconnect-attempts-per-game-player)

### F5. Multiple sockets for one player can desync presence and prompt delivery

Severity: High

The worker accepts multiple sockets with the same `player-N` tag. `getWebSocketForPlayer()` returns the first tagged socket, so filtered state and prompts target only one socket, while broad broadcasts reach all sockets. `webSocketClose()` marks the player disconnected when any tagged socket closes, even if another socket for the same player remains open.

Impact: duplicate sockets can create stale prompt delivery, incorrect connected flags, and reconnect-abuse leverage. This is both a security hardening concern and a correctness risk for real reconnects.

Recommendation: define one authoritative socket per player. Either reject duplicate upgrades while a socket is open, or make the newest socket win and close the old one. Stale close events must not mark the player disconnected while another player socket remains active.

Follow-up: [OPT-337](https://linear.app/optcg-sim/issue/OPT-337/enforce-one-active-websocket-per-player-in-each-game-session)

## Quick Win Landed In OPT-333

OPT-333 adds an 8 KiB inbound client message cap:

- `MAX_CLIENT_MESSAGE_BYTES = 8 * 1024`
- Oversized messages are rejected before JSON parsing or validation.
- The socket is closed with code `1009`.
- Worker tests pin UTF-8 byte counting, binary `byteLength`, and the cap value.

## Follow-Up Order

1. [OPT-337](https://linear.app/optcg-sim/issue/OPT-337/enforce-one-active-websocket-per-player-in-each-game-session) — fixes a correctness/security overlap in the reconnect surface.
2. [OPT-334](https://linear.app/optcg-sim/issue/OPT-334/bind-worker-game-tokens-to-gameid-and-track-replay-identifiers) — tightens the auth boundary before adding more abuse policies.
3. [OPT-335](https://linear.app/optcg-sim/issue/OPT-335/add-per-player-websocket-action-rate-limiting-in-the-game-worker) — protects the hot action path.
4. [OPT-336](https://linear.app/optcg-sim/issue/OPT-336/throttle-websocket-upgrade-and-reconnect-attempts-per-game-player) — protects connect/close churn.
