# OPTCG Simulator

A full-featured web application for playing the **One Piece Trading Card Game** online — card database, deck builder, social features, and a rules-compliant game simulator with automated effects.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript (strict mode) |
| **Styling** | Tailwind CSS v4, CSS custom properties |
| **Database** | PostgreSQL via Neon (Prisma 6 ORM) |
| **Auth** | NextAuth v5 (Google OAuth + email/password) |
| **Game Server** | Cloudflare Workers (Durable Objects + WebSocket) |
| **Image CDN** | Cloudflare R2 + Workers |
| **Card Data** | vegapull v1.2.0 (Rust CLI) → TypeScript ETL pipeline |
| **Frontend Hosting** | Vercel |
| **Testing** | Vitest (game engine) |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL database (Neon or Supabase recommended)
- Cloudflare account (for game server and image CDN)

### Setup

```bash
# Clone the repo
git clone https://github.com/your-org/optcg-sim.git
cd optcg-sim

# Install dependencies (root + workers)
pnpm install
cd workers/game && npm install && cd ../..
cd workers/images && npm install && cd ../..

# Copy environment variables
cp .env.example .env
# Edit .env — you'll need:
#   DATABASE_URL          (PostgreSQL connection string)
#   AUTH_SECRET            (openssl rand -hex 32)
#   AUTH_GOOGLE_ID/SECRET  (Google OAuth credentials)
#   R2_*                   (Cloudflare R2 for card images)
#   GAME_WORKER_SECRET     (shared secret for game server auth)

# Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# Seed card data (requires vegapull output in data/)
pnpm pipeline:import

# Start development
pnpm dev                          # Next.js on :3000
cd workers/game && npm run dev    # Game server on :8787
```

### Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | TypeScript type checking |
| `pnpm format` | Format with Prettier |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:push` | Push schema to DB (no migration file) |
| `pnpm db:studio` | Open Prisma Studio GUI |
| `pnpm db:seed` | Seed database |
| `pnpm pipeline:import` | Import card data from vegapull JSON |
| `pnpm pipeline:migrate-images` | Upload card images to Cloudflare R2 |
| `pnpm worker:deploy` | Deploy images worker to Cloudflare |

Game worker scripts (run from `workers/game/`):

| Script | Description |
|--------|-------------|
| `npm run dev` | Local game server (wrangler dev on :8787) |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm test` | Run engine test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

## Project Structure

```
optcg-sim/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/                 # Login, onboarding
│   │   ├── (dashboard)/            # Dashboard / home
│   │   ├── admin/                  # Card database admin UI
│   │   ├── api/                    # REST API (25 endpoints, 8 domains)
│   │   ├── decks/                  # Deck builder pages
│   │   ├── game/                   # Game board page
│   │   ├── lobbies/                # Lobby browser + creation
│   │   └── globals.css             # Design tokens (source of truth)
│   ├── components/
│   │   ├── ui/                     # Base primitives (Button, Dialog, Toast, etc.)
│   │   ├── admin/                  # Admin card browser, filters, editor
│   │   ├── deck-builder/           # Deck search, list, stats, validation
│   │   ├── game/                   # Game board, cards, modals, event log
│   │   │   └── board-layout/       # Board zones (field, DON, life, trash, mid)
│   │   ├── lobbies/                # Lobby list, create dialog
│   │   ├── social/                 # Sidebar, chat, user avatar
│   │   └── nav/                    # Navbar
│   ├── hooks/                      # Custom React hooks (useGameSession, etc.)
│   ├── lib/                        # Shared utilities and business logic
│   │   ├── deck-builder/           # State machine, validation engine
│   │   └── utils.ts                # cn(), card ID helpers
│   └── types/                      # Global TypeScript types
├── workers/
│   ├── game/                       # Cloudflare Worker — game engine
│   │   └── src/engine/             # Pure game logic (20 modules)
│   │       ├── pipeline.ts         # 7-step action pipeline
│   │       ├── execute.ts          # Action execution (play, attack, etc.)
│   │       ├── battle.ts           # Battle sub-phases
│   │       ├── phases.ts           # Turn phase FSM
│   │       ├── effect-resolver.ts  # Effect schema resolver
│   │       ├── effect-types.ts     # Effect schema type definitions
│   │       ├── schemas/            # Hand-authored card effect schemas
│   │       ├── keywords.ts         # Rush, Blocker, Double Attack, etc.
│   │       ├── triggers.ts         # Trigger system
│   │       ├── modifiers.ts        # Power/attribute modifier layers
│   │       ├── state.ts            # Immutable state transitions
│   │       └── ...                 # conditions, defeat, events, etc.
│   └── images/                     # Cloudflare Worker — CDN image serving
├── shared/                         # Types shared between Next.js and Workers
│   └── game-types.ts               # GameState, GameAction, PromptType, etc.
├── pipeline/                       # Card data ETL (vegapull JSON → PostgreSQL + R2)
├── prisma/
│   └── schema.prisma               # Database schema (source of truth)
├── docs/                           # Full project documentation (see docs/README.md)
├── vegapull/                       # Card data CLI tool (git submodule)
└── data/                           # vegapull output (git-ignored)
```

## Architecture Overview

```
┌─────────────────┐     WebSocket      ┌──────────────────────────┐
│   Next.js App   │◄──────────────────►│  Cloudflare Worker       │
│   (Vercel)      │                    │  (Durable Object)        │
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
│  - Users/Auth   │     │  - Card art (4,300+ imgs) │
│  - Decks        │     │  - CDN serving w/ CORS    │
│  - Card catalog │     │                          │
│  - Game sessions│     └──────────────────────────┘
└─────────────────┘
```

The game engine is **purely functional** — all logic is `(state, action) → newState` with no side effects. State is persisted only by the Durable Object's storage layer. The frontend communicates via WebSocket for real-time gameplay and REST for everything else.

## Milestone Timeline

### Completed

| Phase | Title | Scope | Status |
|-------|-------|-------|--------|
| **M0** | Foundation | Repo, auth (NextAuth + Google OAuth), PostgreSQL/Prisma schema, vegapull→Prisma card import pipeline (51 sets, 4,346 entries, 2,496 unique cards), admin card browser/editor, Vercel deploy | **Done** |
| **M2.5** | Design System | CSS token system (`globals.css` + Tailwind v4 `@theme`), UI primitives (Button, Badge, Input, Select, Dialog, Tooltip, Tabs, Toast), deck builder UX cleanup, R2 image migration, images worker CDN | **Done** |
| **M3** | Simulator Core | Playable game: turn phase FSM, setup/mulligan, battle system (attack→block→counter→damage→trigger), keyword automation (Rush, Double Attack, Banish, Blocker, Trigger, Unblockable), Cloudflare Durable Object + WebSocket, game log, concede | **Done** |
| **M3.5** | Simulator Tech Debt | Engine decomposition (execute→phases/battle split), `shared/game-types.ts`, Vitest suite (~95 tests), rules fixes (life-out, blocker once-per-battle), M4 prep utilities, design-token migration for game board | **Done** |
| **M3.75** | Game Board UI Tech Debt | Single visual board path, `useGameSession` hook, board-layout modular extraction (7 zone modules), `CardDb`/`TooltipStat` consolidation, React.memo + error boundary, retire text board | **Done** |

### In Progress

| Phase | Title | Scope | Status |
|-------|-------|-------|--------|
| **M4** | Effect Engine | Automated effect resolution from `effectSchema`: triggers, resolver, targeting, prohibitions/replacements, durations, modifier layers, scheduled actions. Hand-authored schemas for OP01 (~120 cards). Interruption modals (arrange cards, select targets, player choices). | **Active** |

### Not Started

| Phase | Title | Scope |
|-------|-------|-------|
| **M1** | Deck Builder | Card search API + UI, deck editor with real-time OPTCG validation, cost curve/color stats, bulk import/export, per-user deck CRUD, mobile-responsive |
| **M2** | Social | Friends (search/request/list), real-time DMs, lobbies (create/browse/invite/join), WebSocket presence layer |
| **M5** | Polish & Scale | LLM-assisted effect parsing for full card pool, spectator mode, replay viewer, mobile polish, performance optimization |

> **Note:** M1 (Deck Builder) and M2 (Social) have basic functional implementations already — deck building and lobbies work — but haven't been formally scoped/polished to milestone spec yet. M3 was prioritized ahead of them.

### Post-M5 (Future)

- AI opponents / bots
- Tournament bracket system
- Ranked matchmaking
- OP02+ card set encoding
- Mobile-native app

## Game Engine

The engine lives in `workers/game/src/engine/` and processes every game action through a **7-step pipeline**:

1. **Validate** — check legality (correct phase, valid targets, sufficient resources)
2. **Execute** — apply the core action (play card, declare attack, etc.)
3. **Trigger** — fire any triggered effects (On Play, When Attacking, etc.)
4. **Resolve** — resolve pending effects via the effect resolver
5. **Check** — check win/loss conditions (life-out, deck-out)
6. **Advance** — auto-advance phases when possible (refresh, draw, DON)
7. **Prompt** — if player input is needed, set `activePrompt` and wait

All state is immutable — no mutations, no side effects. ~95 tests cover pipeline integration and unit behavior.

## Documentation

Full documentation lives in `docs/` — see [`docs/README.md`](./docs/README.md) for the complete index.

Key documents:

- **[PRD](./docs/project/PRD.md)** — product requirements
- **[Architecture](./docs/architecture/ARCHITECTURE.md)** — system design and deployment
- **[Comprehensive Rules](./docs/rules/rule_comprehensive.md)** — official OPTCG rules v1.2.0
- **[Rule Index](./docs/rules/RULE-INDEX.md)** — concept-to-rule lookup
- **[Effect Schema Spec](./docs/game-engine/01-SCHEMA-OVERVIEW.md)** — 11-part spec (~12,000 lines)
- **[Rules → Engine Map](./docs/game-engine/RULES-TO-ENGINE-MAP.md)** — every rule mapped to engine functions
- **[Milestone Docs](./docs/milestones/)** — detailed scope for each phase

## Contributing

This is a solo project by [Cory Cunanan](https://github.com/cory-cunanan). The codebase follows strict conventions:

- **Atomic commits** — one logical unit per commit, tests included
- **Immutable engine** — no mutations, spread-only state transitions
- **Test with implementation** — engine changes require corresponding Vitest tests
- **Design system** — all styling through CSS tokens and Tailwind utilities, no inline styles
- **Rules citations** — game logic references specific rule numbers (e.g., `§7-1-4-1-1-1`)

See [`CLAUDE.md`](./CLAUDE.md) for full development conventions and codebase map.
