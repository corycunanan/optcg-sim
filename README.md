# OPTCG Simulator

One Piece Trading Card Game — Deck Builder, Card Database & Game Simulator.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Database:** PostgreSQL (via Supabase)
- **ORM:** Prisma 6
- **Auth:** Supabase Auth (Google OAuth)
- **Hosting:** Vercel (frontend), Railway/Fly.io (game server)
- **Images:** Cloudflare R2 + CDN
- **Data Source:** vegapull v1.2.0 (Rust CLI)

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL database (Supabase recommended)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database URL, Supabase keys, etc.

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
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
| `pnpm db:push` | Push schema to DB (no migration) |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm pipeline:import` | Run card data import pipeline |

## Project Structure

```
optcg-sim/
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── (auth)/           # Auth pages (login, onboarding)
│   │   ├── (dashboard)/      # Dashboard pages
│   │   ├── admin/            # Admin UI (card DB management)
│   │   └── api/              # API routes
│   ├── components/           # React components
│   │   ├── ui/               # Base UI components
│   │   ├── cards/            # Card display components
│   │   ├── admin/            # Admin UI components
│   │   └── layout/           # Layout components
│   ├── lib/                  # Shared utilities
│   │   ├── db/               # Prisma client
│   │   ├── auth/             # Auth helpers
│   │   └── utils/            # Utility functions
│   └── types/                # TypeScript type definitions
├── prisma/
│   └── schema.prisma         # Database schema
├── pipeline/                 # Data import pipeline (vegapull → Prisma)
├── data/                     # vegapull output (git-ignored)
├── docs/                     # Project documentation
├── .github/workflows/        # CI/CD
└── vegapull/                 # vegapull source (git submodule)
```

## Documentation

- [PRD](./PRD%20-%20OPTCG%20Simulator.md) — Product Requirements
- [Architecture](./docs/ARCHITECTURE.md) — System design
- [Tech Stack](./docs/TECH-STACK.md) — Technology choices
- [Data Pipeline](./docs/DATA-PIPELINE.md) — Card data sourcing
- [M0 Foundation](./docs/M0-FOUNDATION.md) — Current milestone
- [Learnings](./LEARNINGS.md) — Running log of decisions

## Milestones

- **M0** — Foundation (repo, auth, DB schema, data pipeline, admin UI) ← _current_
- **M1** — Deck Builder
- **M2** — Social (friends, messaging, lobbies)
- **M3** — Simulator Core (game engine)
- **M4** — Effect Engine
- **M5** — Polish & Scale
