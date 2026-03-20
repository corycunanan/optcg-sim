---
name: Deployment setup
description: Where each service is hosted — Vercel for Next.js, Cloudflare for workers and game server DO
type: project
---

Next.js app is deployed on Vercel at https://optcg-sim.vercel.app.

Image CDN Worker is on Cloudflare at `workers/images/`.

Game server (M3+) will be a separate Cloudflare Worker at `workers/game/` using Durable Objects — one DO instance per active game session. Clients connect via WebSocket directly to the DO; no game traffic goes through Vercel.

**Why:** Cloudflare Durable Objects run at the edge (300+ PoPs), giving the best possible latency for players globally. The single-instance-per-game model also eliminates distributed state race conditions.

**How to apply:** When building the game server, it lives in `workers/game/` with its own `wrangler.toml`. Engine logic goes in `workers/game/src/engine/` as pure TypeScript with no CF dependencies (testable in isolation). The Next.js lobby start endpoint calls `POST https://<game-worker>/game/:gameId/init` to spin up a DO, then returns the worker URL to clients so they can connect directly.
