# Deployment Architecture

## Services

| Service | Platform | URL / Location |
|---------|----------|---------------|
| Next.js app | Vercel | https://optcg-sim.vercel.app |
| Image CDN Worker | Cloudflare Workers | `workers/images/` |
| Game Server Worker | Cloudflare Workers | `workers/game/` (M3) |
| Database | Neon PostgreSQL | via `DATABASE_URL` / `DIRECT_DATABASE_URL` env vars |

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

## Database: Neon branches for dev and prod

Dev and prod target **separate Neon branches**. Destructive migrations or a bad `prisma migrate reset` from a dev workstation cannot touch prod data.

| Env | Neon branch | Where `DATABASE_URL` / `DIRECT_DATABASE_URL` live | Who consumes |
|-----|------------|----------------------------------------------------|--------------|
| Local dev | `dev` (Neon branch, separate from `main`) | `.env` on disk | `next dev`, `pipeline/*.ts`, `prisma migrate dev`, `db:seed`, `db:promote-admin` |
| Production | `main` (Neon default branch) | Vercel → Project Settings → Environment Variables → Production. `.env.production` on disk is a **reference copy only** and is not read by Vercel. | Vercel production build + runtime |

Workers (`workers/game/` and `workers/images/`) do not talk to Postgres, so they are unaffected by this split.

### Both URLs are required

`prisma/schema.prisma` declares both `url` and `directUrl`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")          // pooled (pgbouncer)
  directUrl = env("DIRECT_DATABASE_URL")   // direct connection for migrations
}
```

Forgetting `DIRECT_DATABASE_URL` breaks `prisma migrate deploy`. Both must be set in both places (local `.env` and Vercel Production env).

### `connection_limit` by environment

The pooled `DATABASE_URL` needs different `connection_limit` query params depending on the runtime:

| Runtime | `connection_limit` | Why |
|--------|--------------------|-----|
| Local dev (`.env`) | `5` | Long-lived Node process; a few in-flight queries at a time is fine. |
| Vercel serverless (Production + Preview) | `1` | Each function invocation gets its own Prisma client. Without a cap, Prisma defaults to `num_cpus*2 + 1` connections *per instance* — Vercel scales instances horizontally, and the Neon pooler runs out of slots under load. Force each instance to take one slot; pgbouncer handles the real multiplexing. |

`DIRECT_DATABASE_URL` doesn't take `connection_limit` — it's only used by `prisma migrate` during builds, which runs one operation at a time.

### Applying migrations

| Context | Command | Targets |
|--------|---------|---------|
| Local, authoring a migration | `pnpm db:migrate` (= `prisma migrate dev`) | Dev Neon branch |
| Local, applying committed migrations (CI-style) | `pnpm db:migrate:deploy` (= `prisma migrate deploy`) | Dev Neon branch |
| Production | `prisma migrate deploy` runs automatically on every Vercel build (see `vercel.json`) | Prod Neon branch |

The Vercel build command is `prisma migrate deploy && next build`. This closes the gap that let migration `20260419120000_add_user_is_admin` sit unapplied for 3 days — every production deploy now applies all pending migrations before the app is built.

### Seeding the dev branch

A fresh Neon dev branch starts empty. Card data is ~all of the volume; users/accounts/sessions/decks/friendships/lobbies/game_sessions should stay empty so dev starts clean.

**One-time seed (card data only, from prod):**

```bash
# From any machine with access to DIRECT_DATABASE_URL for both branches.
PROD_DIRECT=<prod DIRECT_DATABASE_URL>
DEV_DIRECT=<dev DIRECT_DATABASE_URL>

# Dump only card-data tables from prod. No user / session / deck / friendship / lobby / game data.
pg_dump \
  --dbname="$PROD_DIRECT" \
  --data-only \
  --no-owner \
  --no-acl \
  -t '"Card"' \
  -t '"ArtVariant"' \
  -t '"CardSet"' \
  -t '"Errata"' \
  > /tmp/optcg-card-data.sql

# Restore into the dev branch.
psql "$DEV_DIRECT" < /tmp/optcg-card-data.sql
```

Before dumping, run `pnpm db:migrate:deploy` against the dev branch so the schema matches.

**Alternative:** re-run the pipeline against dev (`pnpm pipeline:import`). Slower and re-downloads images unless they're already on R2, but reproducible from vegapull source.

### Resetting the dev branch

Destructive, only affects dev. Three flavors:

| Want | Command | Effect |
|------|---------|--------|
| Drop all data, keep schema | `pnpm prisma migrate reset` | Runs migrations from scratch + re-seeds via `prisma/seed.ts` |
| Wipe Neon branch entirely | Neon console → Branches → delete dev branch → create new branch from `main` | Starts from prod's current schema + data |
| Partial wipe (e.g. game sessions) | `psql "$DIRECT_DATABASE_URL"` + manual `DELETE` | Targeted |

`prisma migrate reset` checks `DATABASE_URL` and refuses to run against what it thinks is prod, but don't rely on that — always confirm `.env` points at the dev branch before running reset.

### Promoting card data from dev → prod

Card data updates (new set drops, errata patches, pipeline re-runs) land on dev first, get inspected, then get promoted to prod. Don't run `pnpm pipeline:import` against prod.

```bash
DEV_DIRECT=<dev DIRECT_DATABASE_URL>
PROD_DIRECT=<prod DIRECT_DATABASE_URL>

# 1. Make sure schema is in sync on both branches (prod deploys apply migrations automatically;
#    dev should already be caught up from local `pnpm db:migrate`).

# 2. Dump only card-data tables from dev.
pg_dump \
  --dbname="$DEV_DIRECT" \
  --data-only \
  --no-owner \
  --no-acl \
  -t '"Card"' \
  -t '"ArtVariant"' \
  -t '"CardSet"' \
  -t '"Errata"' \
  > /tmp/optcg-card-data.sql

# 3. Take a prod snapshot (Neon console → Branches → branch from main) as a rollback point.

# 4. Restore into prod. Card rows are upserted on primary key; safe to re-apply.
#    CardSet is a clean-slate table in the pipeline — if the dump wasn't taken at a stable
#    point, prefer re-running the pipeline against dev, freezing dev, then dumping.
psql "$PROD_DIRECT" < /tmp/optcg-card-data.sql
```

## Cloudflare Workers: deploying on merge

Both workers (`workers/game/` and `workers/images/`) are deployed by GitHub Actions on pushes to `main` when their respective directories change — see `.github/workflows/deploy-workers.yml`. This closes the same class of gap that OPT-278 closed for Prisma migrations: worker code merged to `main` now lands on Cloudflare automatically instead of relying on someone to remember to run `wrangler deploy`.

| Context | Command | Targets |
|--------|---------|---------|
| Local, iterating on a worker | `pnpm --filter optcg-game dev` / `pnpm --filter optcg-images-worker dev` | Local miniflare |
| Manual deploy (game worker) | `pnpm worker:deploy:game` | Cloudflare |
| Manual deploy (images worker) | `pnpm worker:deploy` | Cloudflare |
| CI/CD | Push to `main` with changes under `workers/game/**` or `workers/images/**` | Cloudflare (auto) |

### Required GitHub secret

The workflow authenticates with Cloudflare via `CLOUDFLARE_API_TOKEN` (repo secret). The token needs **Account → Workers Scripts → Edit** and **Account → Account Settings → Read**. Create one at https://dash.cloudflare.com/profile/api-tokens using the "Edit Cloudflare Workers" template.

If the secret is missing, the workflow will fail loudly rather than silently skipping — that's intentional, because a silent skip is what let OPT-279 happen.

### Why both a script and CI

The `worker:deploy:game` script stays around for manual hotfixes and for local `wrangler tail` debugging sessions. CI is the primary path, but a dev with `wrangler` auth can always push a fix without waiting for `main`.

### History

Before OPT-279, only the images worker had a deploy script (`worker:deploy` in `package.json`) and neither worker had CI coverage. The game worker had not been deployed since commit `74635d8` (2026-03-21), so every engine improvement between then and 2026-04-22 — the M3.5–M4 effect engine, OPT-100, OPT-119, OPT-122, OPT-124, OPT-132, OPT-160, OPT-187, OPT-190, OPT-191, OPT-204, OPT-253, OPT-259, OPT-260, and more — was invisible in production. Games on `optcg-sim.vercel.app` failed to load because `/cards` and `/notify-end` were missing from the deployed worker.

## Shared Secrets

| Secret | Consumers | Storage |
|--------|-----------|---------|
| `GAME_WORKER_SECRET` | Next.js API (`/api/game/*`), Cloudflare Game Worker (`workers/game/`) | Vercel env var, `wrangler secret` |
| `AUTH_SECRET` | Next.js (NextAuth) | Vercel env var |
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Next.js (Prisma), `pipeline/` scripts | `.env` (dev Neon branch), Vercel Production env (prod Neon branch) |

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

_Last updated: 2026-04-22_
