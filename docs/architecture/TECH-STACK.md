# Tech Stack

> Complete technology inventory for the OPTCG Simulator. Each choice includes version targets and rationale.

---

## Overview

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js (React) + TypeScript | UI application shell, SSR/SSG for card pages |
| Styling | Tailwind CSS v4 | Utility-first CSS, design tokens via CSS custom properties |
| UI Components | shadcn/ui + Radix UI | Accessible, composable component primitives |
| Backend API | Next.js API Routes | REST endpoints for CRUD operations |
| Realtime | WebSocket (native) | Game state sync via Cloudflare Durable Objects |
| Auth | NextAuth.js v5 (Auth.js) — Google OAuth + Email/Password | Authentication, session management |
| Database | PostgreSQL (via Neon) | Primary data store — separate Neon branches for dev and prod (see [DEPLOYMENT.md](./DEPLOYMENT.md)) |
| ORM | Prisma | Type-safe DB access, migrations |
| Object Storage | Cloudflare R2 | Card images, raw data snapshots |
| CDN | Cloudflare Workers | Image delivery with CORS |
| Game Server | Cloudflare Workers + Durable Objects | Stateful game sessions with WebSocket |
| Animation | motion (v12) + @dnd-kit | Card animations, drag-and-drop |
| Validation | Zod | Runtime schema validation for API + game payloads |
| Data Sourcing | vegapull v1.2.0 (Rust CLI) | Card data scraping from official OPTCG site |
| Data Pipeline | TypeScript (tsx) | JSON transform, Prisma import, image download |
| LLM Integration | Claude API | Effect text → schema translation (M4+) |
| CI/CD | GitHub Actions | Pipeline automation, deploy triggers |
| Hosting (Frontend) | Vercel | Next.js hosting, preview deploys |
| Hosting (Workers) | Cloudflare | Game server (Durable Objects), image CDN |

---

## Frontend

### Next.js + React + TypeScript

- **Version:** Next.js 16, React 19, TypeScript 5
- **Why Next.js:** Server-side rendering for card detail pages (SEO for card database), API routes co-located with frontend, strong TypeScript support, Vercel deployment integration
- **Why TypeScript:** Game state, card data, and effect schemas are complex typed structures — TypeScript catches shape mismatches at compile time rather than runtime
- **Key libraries:**
  - `@dnd-kit/core` — drag-and-drop for deck builder and game board
  - `motion` (v12) — card animations, game board transitions, micro-interactions
  - `next-themes` — light/dark mode support
  - `cmdk` — command palette UI

### Tailwind CSS v4

- **Version:** Tailwind CSS v4 with `@tailwindcss/postcss`
- **Why:** Rapid prototyping, consistent design tokens, responsive utilities built-in, no CSS module management overhead
- **Customization:** Design tokens defined as CSS custom properties in `globals.css`. Custom color palette matching OPTCG card colors (Red, Blue, Green, Purple, Black, Yellow), brand colors (navy, gold, warm-white)

### shadcn/ui + Radix UI

- **Config:** radix-nova style, RSC enabled
- **Components:** Dialog, DropdownMenu, Select, Tabs, Toast, Tooltip, Command, Input OTP
- **Why:** Accessible primitives with full styling control via Tailwind. No vendor lock-in — components are copied into the project

---

## Backend

### API Layer — Next.js API Routes

- Co-located with the frontend; simplifies deployment on Vercel
- 24 route files across 8 domains (auth, cards, decks, game, lobbies, friends, messages, users)
- Serverless execution model — scales automatically for read-heavy workloads (card search)
- Zod validation on all request payloads (`src/lib/validators/`)
- Rate limiting via `src/lib/rate-limit.ts`

### Game Server — Cloudflare Workers + Durable Objects

- **Runtime:** Cloudflare Workers (V8 isolates)
- **State:** Durable Objects — each `GameSession` is a stateful object with SQLite persistence
- **WebSocket:** Native WebSocket via Durable Object `webSocketMessage` handler
- **Why Durable Objects:** Stateful game sessions (5–30 min) need persistent WebSocket connections and in-memory state. Durable Objects provide this without managing servers, with built-in hibernation for idle sessions
- **Engine:** Full game rules engine with 7-step action pipeline, effect resolver, trigger system, modifier layers, and 51 card schema sets
- **Config:** `workers/game/wrangler.toml` — compatibility date 2024-01-01, nodejs_compat

### Auth — NextAuth.js v5 (Auth.js)

- **Providers:**
  1. Google OAuth 2.0
  2. Credentials (email/password with bcrypt)
- **Why NextAuth.js:** Works directly with existing PostgreSQL + Prisma — no external auth service required
- **Session management:** JWT strategy with custom `username` field; `auth()` helper for server components
- **Profile enrichment:** On first login, user redirected to `/onboarding` to set a unique username
- **Route protection:** Next.js 16 proxy (`proxy.ts`) protects `/admin/*` routes, redirects to `/login`

---

## Data Layer

### PostgreSQL (via Neon)

- **Why PostgreSQL:**
  - Card data is relational: cards belong to sets, decks contain cards, users have friends, games have players
  - Rich query capabilities for deck builder filters (color, cost range, power range, type, traits, format legality)
  - JSON columns available for `effectSchema` storage while keeping relational structure for everything else
- **Models:** User, Account, Session, VerificationToken, Card, Set, Deck, DeckCard, DeckCustomization, GameSession, Lobby, Friend, FriendRequest, Message

### Prisma ORM

- **Version:** Prisma 6
- **Why Prisma:**
  - Type-safe client generated from schema — eliminates SQL injection risk and type mismatches
  - Migration system tracks schema changes across environments (11 migrations as of 2026-04-08)
  - Good integration with Next.js and TypeScript

### Cloudflare R2 + Workers CDN

- **R2 for storage:** S3-compatible, no egress fees (critical for image-heavy card database)
- **Workers for delivery:** `workers/images/` serves card images globally with CORS headers
- **Image pipeline:** Data pipeline uploads images to R2; CDN Worker serves them
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

**Import pipeline: TypeScript (8 stages)**
- **Why TypeScript (not Python):** Same language as the app; no scraping needed since vegapull produces JSON. Eliminates Python runtime dependency.
- **Pipeline stages:**
  1. **Load** — Read vegapull JSON output (packs.json + per-pack card files)
  2. **Transform** — Map fields to Prisma schema; decode HTML entities
  3. **Sanitize** — Strip `<br>` → newlines; normalize whitespace
  4. **Classify** — `_p` suffixes → ArtVariant records; `_r` suffixes → CardSet entries
  5. **Build set membership** — Card ↔ Set many-to-many from cross-pack appearances
  6. **Write** — Upsert to PostgreSQL via Prisma
  7. **Download images** — Fetch card images from official URLs → R2
  8. **Verify** — Validate imported data integrity
- **Scheduling:** GitHub Actions cron (on set release dates) or manual trigger
- **Dependencies:** `tsx` (TypeScript runner), Prisma client, `node-html-parser` (HTML entity decode)

### Claude API (M4+)

- **Purpose:** Translate card effect text into `effectSchema` JSON
- **Approach:** Few-shot prompting with the schema spec and hand-authored examples as context
- **Human review:** LLM outputs flagged for manual verification; low-confidence results queued for hand-correction

---

## Infrastructure & DevOps

### Hosting

| Service | What it hosts | Why |
|---------|--------------|-----|
| Vercel | Next.js frontend + API routes | Native Next.js support, preview deploys on PR, global edge network |
| Cloudflare Workers | Game server (Durable Objects) | Stateful WebSocket sessions, hibernation, zero cold starts, global edge |
| Cloudflare Workers | Image CDN (`workers/images/`) | Card image serving with CORS, R2 integration |
| Neon | PostgreSQL | Managed Postgres with branching (separate dev/prod branches) and connection pooling (pgbouncer) |
| Cloudflare R2 | Card image storage | S3-compatible, zero egress fees |

### CI/CD — GitHub Actions

- **On PR:** Lint, type-check, unit tests, Vercel preview deploy
- **On merge to main:** Production deploy (Vercel + Workers), DB migrations
- **Cron:** Data pipeline runs (card data sync on new set releases)
- **Secrets managed via:** GitHub Actions secrets (API keys, DB URLs)

### Monitoring & Observability (Post-MVP)

- **Error tracking:** Sentry (frontend + backend)
- **Logging:** Structured JSON logs (game server), Vercel logs (API)
- **Uptime:** UptimeRobot or similar for game server health endpoint

---

## Version Targets

| Technology | Target Version | Actual Version | Notes |
|-----------|---------------|----------------|-------|
| Node.js | 20 LTS | 22.22.1 | Runtime for Next.js and data pipeline |
| Next.js | 14.x+ | 16.1.6 | App Router (latest via create-next-app) |
| React | 18.x+ | 19.2.3 | Server Components, concurrent features |
| TypeScript | 5.x | 5.9.3 | Strict mode enabled |
| Tailwind CSS | 3.4+ | 4.2.1 | v4 with @tailwindcss/postcss |
| Prisma | 5.x+ | 6.19.2 | Prisma 7 deferred (new config format) |
| vegapull | 1.2.0 | 1.2.0 | Rust CLI for card data sourcing; installed via `cargo install vegapull` |
| PostgreSQL | 15+ | 16.13 | Neon (managed) for both dev and prod, on separate branches |
| pnpm | 10+ | 10.32.1 | Package manager |

---

_Last updated: 2026-04-08_
