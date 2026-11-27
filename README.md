# OPTCG Simulator

A full-featured web application for playing the **One Piece Trading Card Game** online — card database, deck builder, social features, and a rules-compliant game simulator with automated effects.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router), React 19 |
| **Language** | TypeScript (strict mode) |
| **Styling** | Tailwind CSS v4, CSS custom properties |
| **Database** | PostgreSQL via Neon (Prisma 6 ORM) |
| **Auth** | NextAuth v5 (Google OAuth + email/password) |
| **Game Server** | Cloudflare Workers (Durable Objects + WebSocket) |
| **Image CDN** | Cloudflare R2 + Workers |
| **Card Data** | vegapull (Rust CLI) → TypeScript ETL pipeline |
| **Frontend Hosting** | Vercel |
| **Testing** | Vitest (app, pipeline, and game worker suites) |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL database (Neon recommended)
- Cloudflare account (for game server and image CDN)

### Setup

```bash
# Clone the repo
git clone https://github.com/corycunanan/optcg-sim.git
cd optcg-sim

# Install dependencies (root + both workers; one pnpm workspace, one lockfile)
pnpm install

# Engine tests run without Prisma or a database:
#   pnpm test:worker [file...]

# Copy environment variables
cp .env.example .env
# Edit .env. The keys are listed in .env.example; the main ones are:
#   DATABASE_URL / DIRECT_DATABASE_URL  (PostgreSQL connection strings)
#   AUTH_SECRET                         (openssl rand -hex 32)
#   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET (Google OAuth credentials)
#   NEXT_PUBLIC_CDN_URL                 (images worker URL)
#   GAME_WORKER_URL / GAME_WORKER_SECRET (game server URL and shared secret)

# Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# Import card data (requires vegapull output in data/)
pnpm pipeline:import

# Start development
pnpm dev                              # Next.js on :3000
pnpm --filter optcg-game dev          # Game server (wrangler dev) on :8787
```

### Scripts

`package.json` is the full list. The common ones:

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm verify` | Full local/CI verification chain (lint, type checks, schema checks, tests, coverage, bundle capacity, build) |
| `pnpm lint` | ESLint, design-system lint, and token contrast check |
| `pnpm type-check` / `pnpm type-check:worker` | Type-check the Next.js app / the game worker |
| `pnpm test` / `pnpm test:worker` | Run the app / game worker test suites |
| `pnpm schema:check` | Authored card schema gate (generated registry, schema lint, docs drift, tests) |
| `pnpm format` | Format with Prettier |
| `pnpm db:generate` / `pnpm db:migrate` | Generate Prisma client / run migrations |
| `pnpm db:studio` | Open Prisma Studio GUI |
| `pnpm pipeline:import` | Import card data from vegapull JSON |
| `pnpm pipeline:migrate-images` | Upload card images to Cloudflare R2 |
| `pnpm worker:deploy` / `pnpm worker:deploy:game` | Deploy the images / game worker to Cloudflare |

`workers/game` is the pnpm workspace package `optcg-game`. Its own scripts (`dev`, `deploy`, `test`, `test:watch`, `schema:generate`, and others) run with `pnpm --filter optcg-game <script>` or from inside `workers/game/`.

## Project Structure

See the codebase map in [`CLAUDE.md`](./CLAUDE.md) for the full directory and key-file tables.

```
optcg-sim/
├── src/
│   ├── app/              # Next.js App Router: pages and REST API routes (src/app/api)
│   ├── components/       # UI by feature: ui, cards, deck-builder, game, lobbies, social, admin, nav, sandbox
│   ├── hooks/            # Game session, WebSocket, lobby, and animation hooks
│   ├── lib/              # Shared utilities, deck builder logic, validators, API client
│   └── types/            # Global TypeScript types
├── workers/
│   ├── game/             # Cloudflare Worker + Durable Objects: game engine and card effect schemas
│   │   └── src/engine/   # Pure engine: pipeline.ts, execute, battle, phases, triggers,
│   │                     # effect-resolver/, schemas/ (one file per set), modifiers, ...
│   └── images/           # Cloudflare Worker: CDN image serving
├── pipeline/             # Card data ETL (vegapull JSON → PostgreSQL + R2)
├── prisma/               # Database schema (source of truth) and migrations
├── docs/                 # Project documentation (see docs/README.md)
└── data/                 # vegapull output (git-ignored)
```

## Architecture Overview

```
┌─────────────────┐     WebSocket      ┌──────────────────────────┐
│   Next.js App   │◄──────────────────►│  Cloudflare Worker       │
│   (Vercel)      │                    │  (Durable Objects)       │
│                 │     REST API       │                          │
│  - App Router   │◄──────────────────►│  - Game engine (pure)    │
│  - Deck Builder │                    │  - WebSocket sessions    │
│  - Lobbies      │                    │  - State persistence     │
│  - Game Board   │                    │  - Action pipeline       │
└────────┬────────┘                    └──────────────────────────┘
         │
         │  Prisma
         ▼
┌─────────────────┐     ┌──────────────────────────┐
│   PostgreSQL    │     │  Cloudflare R2            │
│   (Neon)        │     │  + Images Worker          │
│                 │     │                          │
│  - Users/Auth   │     │  - Card art               │
│  - Decks        │     │  - CDN serving w/ CORS    │
│  - Card catalog │     │                          │
│  - Lobbies/games│     └──────────────────────────┘
└─────────────────┘
```

The game engine is **purely functional**: all logic is `(state, action) → newState` with no side effects. State is persisted only by the Durable Object's storage layer. The frontend communicates via WebSocket for real-time gameplay and REST for everything else. See [Architecture](./docs/architecture/ARCHITECTURE.md) and [Deployment](./docs/architecture/DEPLOYMENT.md).

## Status

What ships today:

- **Card database**: the released English sets, imported from the official card list through vegapull, with public card and set browsing and an admin browser/editor. The exact count lives in the database, not here.
- **Deck builder**: search and filters, real-time OPTCG validation (including format bans), cost curve and color stats, import/export, per-user decks.
- **Social**: friends, real-time direct messages, notifications, presence, and lobbies with invites, parties, and opt-in spectators.
- **Simulator**: full turn structure, setup and mulligan, battle, keywords, and automated effect resolution from hand-authored effect schemas for the imported sets (`workers/game/src/engine/schemas/`), with board prompts, an event log, and card motion.
- **UI**: the M5 design system (tokens, shadcn-based component library, Erode/Public Sans typography, motion).

Milestone status, from the [milestone docs](./docs/milestones/):

| Phase | Title | Status |
|-------|-------|--------|
| **M0** | Foundation | Done |
| **M1** | Deck Builder | Done |
| **M2** | Social | Done |
| **M2.5** | Design System | Done |
| **M3** / **M3.5** / **M3.75** | Simulator Core and tech debt | Done |
| **M4** / **M4.5** | Effect Engine and Schema QA | Done |
| **M5** | UI Overhaul | M5.1–M5.3 done; M5.4 Game Board Motion in progress; M5.5 Art Variants phases 1–3 done |
| **M6** | Scale & Features | Planned |
| **M7** | Effect Showcase | Planned |

Day-to-day work is tracked in Linear (workspace `optcg-sim`, `OPT-###` tickets) rather than in these docs.

## Game Engine

The engine lives in `workers/game/src/engine/`. Every player command enters `runPipeline` in [`pipeline.ts`](./workers/game/src/engine/pipeline.ts), which runs a **7-step pipeline**:

1. **Validate**: check legality (phase, targets, resources)
2. **Check Prohibitions**: veto actions blocked by active prohibitions
3. **Check Replacements**: apply replacement effects to the action
4. **Execute**: apply the core action (play card, declare attack, and so on), producing a new state snapshot
5. **Report events and triggers, then drain ready work**: fire triggered effects and resolve pending work, stopping at a player prompt when input is needed
6. **Recalculate Modifiers**: expire effects and recompute power and modifier layers
7. **Rule Processing**: defeat and other rule checks

Nested effects and prompt replies use the same pending-work drain. All state is immutable: no mutations, spread-only transitions. See [Engine Architecture](./docs/game-engine/08-ENGINE-ARCHITECTURE.md) for detail.

## Documentation

Full documentation lives in `docs/` — see [`docs/README.md`](./docs/README.md) for the complete index.

Key documents:

- **[PRD](./docs/project/PRD.md)** — product requirements
- **[Architecture](./docs/architecture/ARCHITECTURE.md)** — system design and deployment
- **[Comprehensive Rules](./docs/rules/rule_comprehensive.md)** — official OPTCG rules v1.2.1
- **[Rule Index](./docs/rules/RULE-INDEX.md)** — concept-to-rule lookup
- **[Effect Schema Spec](./docs/game-engine/01-SCHEMA-OVERVIEW.md)** — 11-part spec (~12,000 lines)
- **[Rules → Engine Map](./docs/game-engine/RULES-TO-ENGINE-MAP.md)** — every rule mapped to engine functions
- **[Milestone Docs](./docs/milestones/)** — detailed scope for each phase

## Contributing

This is a solo project by [Cory Cunanan](https://github.com/corycunanan). The codebase follows strict conventions:

- **Atomic commits** — one logical unit per commit, tests included
- **Immutable engine** — no mutations, spread-only state transitions
- **Test with implementation** — engine changes require corresponding Vitest tests
- **Design system** — all styling through CSS tokens and Tailwind utilities, no inline styles
- **Rules citations** — game logic references specific rule numbers (e.g., `§7-1-4-1-1-1`)

See [`CLAUDE.md`](./CLAUDE.md) for full development conventions and codebase map.
