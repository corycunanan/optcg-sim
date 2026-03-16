# Tech Stack

> Complete technology inventory for the OPTCG Simulator. Each choice includes version targets and rationale.

---

## Overview

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js (React) + TypeScript | UI application shell, SSR/SSG for card pages |
| Styling | Tailwind CSS | Utility-first CSS, rapid UI development |
| Backend API | Next.js API Routes (primary) / Fastify (fallback) | REST endpoints for CRUD operations |
| Realtime | WebSocket (Socket.io or native `ws`) | Game state sync, messaging, lobby updates |
| Auth | Supabase Auth (Google OAuth 2.0) | Authentication, session management |
| Database | PostgreSQL (via Supabase or Neon) | Primary data store |
| ORM | Prisma | Type-safe DB access, migrations |
| Object Storage | Cloudflare R2 | Card images, raw data snapshots |
| CDN | Cloudflare CDN | Image delivery, static asset caching |
| Data Sourcing | vegapull v1.2.0 (Rust CLI) | Card data scraping from official OPTCG site |
| Data Pipeline | TypeScript (tsx) | JSON transform, Prisma import, image download |
| LLM Integration | Claude API | Effect text → schema translation (M4+) |
| CI/CD | GitHub Actions | Pipeline automation, deploy triggers |
| Hosting (Frontend) | Vercel | Next.js hosting, preview deploys |
| Hosting (Game Server) | Railway or Fly.io | Long-running WebSocket server |

---

## Frontend

### Next.js + React + TypeScript

- **Version target:** Next.js 14+ (App Router)
- **Why Next.js:** Server-side rendering for card detail pages (SEO for card database), API routes co-located with frontend, strong TypeScript support, Vercel deployment integration
- **Why TypeScript:** Game state, card data, and effect schemas are complex typed structures — TypeScript catches shape mismatches at compile time rather than runtime
- **Key libraries (planned):**
  - `zustand` or `jotai` — lightweight client state management for deck builder and game board
  - `react-query` / `@tanstack/react-query` — server state caching, pagination, optimistic updates
  - `react-dnd` or `@dnd-kit/core` — drag-and-drop for deck builder card management
  - `framer-motion` — card animations in game board (stretch goal)

### Tailwind CSS

- **Version target:** Tailwind CSS v3.4+
- **Why:** Rapid prototyping, consistent design tokens, responsive utilities built-in, no CSS module management overhead
- **Customization:** Custom color palette matching OPTCG card colors (Red, Blue, Green, Purple, Black, Yellow), custom card component sizing

---

## Backend

### API Layer

**Primary: Next.js API Routes**
- Co-located with the frontend; simplifies deployment on Vercel
- Sufficient for CRUD operations (cards, decks, friends, messages, lobbies)
- Serverless execution model — scales automatically for read-heavy workloads (card search)

**Fallback: Fastify (standalone)**
- If API route cold starts or execution limits become a problem, migrate to a standalone Fastify server on Railway/Fly.io
- Fastify chosen over Express for performance (schema-based serialization, lower overhead)

### Game Server (Dedicated)

- **Runtime:** Node.js (same language as frontend — shared types)
- **WebSocket:** `ws` (lightweight, no Socket.io overhead) or Socket.io (if reconnection/room management is worth the bundle)
- **Hosting:** Railway or Fly.io — must be a persistent process, not serverless
- **Why separate:** Game sessions hold in-memory state for the duration of a match (5–30 minutes). Serverless functions time out. WebSocket connections require persistent TCP.
- **Scaling consideration:** Each game server instance can handle many concurrent games (game state is lightweight). Horizontal scaling via sticky sessions if needed.

### Auth — Supabase Auth

- **Provider:** Google OAuth 2.0
- **Why Supabase Auth over Firebase Auth:**
  - Supabase bundles auth + PostgreSQL — one platform for auth and data
  - Row-level security policies tie directly to auth user IDs
  - Open-source, self-hostable if needed later
- **Session management:** JWT-based; auto-refresh via Supabase client SDK
- **Profile enrichment:** On first login, user sets a username; avatar pulled from Google profile (or uploadable later)

---

## Data Layer

### PostgreSQL (via Supabase or Neon)

- **Why PostgreSQL:**
  - Card data is relational: cards belong to sets, decks contain cards, users have friends, games have players
  - Rich query capabilities for deck builder filters (color, cost range, power range, type, traits, format legality)
  - JSON columns available for `effectSchema` storage while keeping relational structure for everything else
  - Full-text search for card name queries (via `tsvector` or Supabase full-text search)
- **Supabase vs Neon:**
  - Supabase preferred (auth + DB + realtime in one platform)
  - Neon as fallback if Supabase's free tier or performance is limiting

### Prisma ORM

- **Why Prisma:**
  - Type-safe client generated from schema — eliminates SQL injection risk and type mismatches
  - Migration system tracks schema changes across environments
  - Good integration with Next.js and TypeScript
- **Key schema entities:** `User`, `Card`, `ArtVariant`, `Errata`, `Deck`, `DeckCard`, `Friend`, `Message`, `Lobby`, `GameSession`, `GameAction`

### Cloudflare R2 + CDN

- **R2 for storage:** S3-compatible, no egress fees (critical for image-heavy card database)
- **CDN for delivery:** Card images served globally with low latency
- **Image pipeline:** Data pipeline uploads images to R2; CDN serves them via `https://cards.optcgsim.com` (or similar)
- **Raw HTML snapshots:** Also stored in R2 for re-parsing if schema changes

---

## Data Pipeline

### vegapull (Rust CLI) + TypeScript Import Pipeline

**Data sourcing: vegapull v1.2.0**
- **Language:** Rust (compiled binary, no runtime dependencies)
- **Install:** `cargo install vegapull`
- **Confirmed working:** 2026-03-16 against the live official site
- **Capabilities:** 51 packs, 4,346 card entries, card images, block_number field, 7 languages
- **Usage:** Per-pack CLI invocations (`vega pull -o <dir> cards <pack_id>`)

**Import pipeline: TypeScript**
- **Why TypeScript (not Python):** Same language as the app; no scraping needed since vegapull produces JSON. Eliminates Python runtime dependency.
- **Pipeline stages:**
  1. **Load** — Read vegapull JSON output (packs.json + per-pack card files)
  2. **Transform** — Map fields to Prisma schema; decode HTML entities
  3. **Sanitize** — Strip `<br>` → newlines; normalize whitespace
  4. **Classify** — `_p` suffixes → ArtVariant records; `_r` suffixes → CardSet entries
  5. **Build set membership** — Card ↔ Set many-to-many from cross-pack appearances
  6. **Write** — Upsert to PostgreSQL via Prisma
  7. **Download images** — Fetch card images from official URLs → local/R2
- **Scheduling:** GitHub Actions cron (on set release dates) or manual trigger
- **Dependencies:** `tsx` (TypeScript runner), Prisma client, `node-html-parser` (HTML entity decode)

### Claude API (M4+)

- **Purpose:** Translate card effect text into `effectSchema` JSON
- **Approach:** Few-shot prompting with the schema spec and hand-authored examples as context
- **Human review:** LLM outputs flagged for manual verification; low-confidence results queued for hand-correction
- **Version:** Claude 3.5 Sonnet or newer (best balance of accuracy and cost for structured output)

---

## Infrastructure & DevOps

### Hosting

| Service | What it hosts | Why |
|---------|--------------|-----|
| Vercel | Next.js frontend + API routes | Native Next.js support, preview deploys on PR, global edge network |
| Railway or Fly.io | Game server (WebSocket) | Persistent processes, WebSocket support, affordable for small-scale |
| Supabase | PostgreSQL + Auth | Managed Postgres, built-in auth, realtime subscriptions |
| Cloudflare | R2 (images) + CDN | Zero egress fees, global CDN, S3-compatible |

### CI/CD — GitHub Actions

- **On PR:** Lint, type-check, unit tests, Vercel preview deploy
- **On merge to main:** Production deploy (Vercel + game server), DB migrations
- **Cron:** Data pipeline runs (card data sync on new set releases)
- **Secrets managed via:** GitHub Actions secrets (API keys, DB URLs)

### Monitoring & Observability (Post-MVP)

- **Error tracking:** Sentry (frontend + backend)
- **Logging:** Structured JSON logs (game server), Vercel logs (API)
- **Uptime:** UptimeRobot or similar for game server health endpoint

---

## Version Targets

| Technology | Target Version | Notes |
|-----------|---------------|-------|
| Node.js | 20 LTS | Runtime for Next.js and game server |
| Next.js | 14.x+ | App Router |
| React | 18.x+ | Concurrent features |
| TypeScript | 5.x | Strict mode enabled |
| Tailwind CSS | 3.4+ | |
| Prisma | 5.x+ | |
| vegapull | 1.2.0 | Rust CLI for card data sourcing; installed via `cargo install vegapull` |
| PostgreSQL | 15+ | Via Supabase/Neon |

---

_Last updated: 2026-03-16_
