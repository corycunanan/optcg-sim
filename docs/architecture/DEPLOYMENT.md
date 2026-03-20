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

_Last updated: 2026-03-20_
