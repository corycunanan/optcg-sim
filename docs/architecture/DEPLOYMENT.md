# Deployment Architecture

## Services

| Service | Platform | URL / Location |
|---------|----------|---------------|
| Next.js app | Vercel | https://optcg-sim.vercel.app |
| Image CDN Worker | Cloudflare Workers | `workers/images/` |
| Game Server Worker | Cloudflare Workers | `workers/game/` (M3) |
| Database | PostgreSQL (Supabase or similar) | via `DATABASE_URL` env var |

## How services interact

```
Browser
  │
  ├── HTTPS → Vercel (Next.js)
  │     • All pages
  │     • All REST API routes (/api/*)
  │     • Auth (NextAuth)
  │
  ├── HTTPS → Cloudflare Workers (images)
  │     • Card image CDN
  │     • workers/images/
  │
  └── WebSocket → Cloudflare Workers (game server, M3+)
        • One Durable Object per active game session
        • workers/game/
        • Direct browser → DO connection (no Vercel hop)
```

## Lobby → Game handoff (M3)

```
1. Players ready in lobby
2. POST /api/lobbies/:id/start  (Vercel)
   → Creates game_session row in DB
   → POST https://<game-worker>/game/:gameId/init  (Vercel → Cloudflare)
   → Returns { gameId, workerUrl } to both clients
3. Both clients open WebSocket to wss://<game-worker>/game/:gameId/ws?token=<jwt>
4. Game runs entirely on the Durable Object
5. On game end: DO writes result back to PostgreSQL
```

## Shared Secrets

| Secret | Consumers | Storage |
|--------|-----------|---------|
| `GAME_WORKER_SECRET` | Next.js API (`/api/game/*`), Cloudflare Game Worker (`workers/game/`) | Vercel env var, `wrangler secret` |
| `AUTH_SECRET` | Next.js (NextAuth) | Vercel env var |

### Rotating `GAME_WORKER_SECRET`

The worker uses this secret for three things: (a) Bearer auth on API callbacks (`POST /api/game/result`), (b) Bearer auth on worker admin routes (init, notify-end), (c) HS256 signing/verification for WebSocket connect tokens. Every Next.js → Worker call and every client → Worker WebSocket must agree on the value, so cutovers need both sides updated in quick succession.

1. Generate a new value: `openssl rand -hex 32`.
2. Set it on the worker first (worker accepts new requests before the API starts sending the new value):
   - Production: `cd workers/game && npx wrangler secret put GAME_WORKER_SECRET`
   - Paste the new value at the prompt.
3. Roll a dual-accept window on the worker if zero-downtime matters (optional): temporarily add a `GAME_WORKER_SECRET_PREVIOUS` secret and update `workers/game/src/util/auth.ts` to accept either, deploy, then proceed.
4. Update Vercel: Project → Settings → Environment Variables → edit `GAME_WORKER_SECRET` for Production (and Preview if used) → redeploy the current production build.
5. Update local dev copies: `.env` and `workers/game/.dev.vars`.
6. Verify: create a lobby, start a game, concede. Confirm `GameSession.status` flips to `FINISHED` in the DB (callback path exercised).
7. If a dual-accept window was opened in step 3, remove the old secret and redeploy the worker.

**When to rotate:** suspected leak (log exposure, accidental commit, contractor offboarding), at least annually, and any time the secret is known to have been on a developer machine that was lost or decommissioned.

_Last updated: 2026-04-20_
