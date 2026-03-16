# M0 — Foundation

> Repo setup, auth, database schema, and initial card data population.

---

## Scope

M0 establishes the project's infrastructure, authentication, database schema, and a seed card dataset. Nothing is user-facing beyond a login flow and a basic card listing to verify the pipeline works.

### Deliverables

- [ ] Repository scaffolded with Next.js, TypeScript, Tailwind, Prisma
- [ ] CI/CD pipeline (lint, type-check, test, deploy)
- [ ] Google OAuth authentication (sign-in, sign-out, session persistence)
- [ ] PostgreSQL schema for cards, users, decks
- [ ] Data pipeline v1 (import from punk-records community JSON dataset — all sets)
- [ ] Card images uploaded to R2 and served via CDN
- [ ] Basic card listing page (verifies data pipeline end-to-end)

---

## Architecture (M0-Specific)

```
┌─────────────────────────────┐
│   Next.js App               │
│   • Login page              │
│   • Basic card list page    │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│   Next.js API Routes        │
│   • /api/auth/*             │
│   • /api/cards (read-only)  │
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐   ┌────────────────────┐
│   PostgreSQL (Supabase)     │   │   Cloudflare R2    │
│   • users                   │   │   • Card images    │
│   • cards                   │   └────────────────────┘
│   • art_variants            │
│   • errata                  │
└─────────────────────────────┘
           ▲
┌──────────┴──────────────────┐
│   Data Pipeline (Python)    │
│   Scrape → Parse → Write    │
└─────────────────────────────┘
```

No game server, no WebSocket, no social features — those come later.

---

## Implementation Plan

### 1. Repository Setup

**Tasks:**
1. Initialize Next.js 14 project with App Router, TypeScript, Tailwind CSS
2. Configure ESLint (strict), Prettier, `tsconfig.json` (strict mode)
3. Set up Prisma with initial schema
4. Create `.env.example` with required environment variables
5. Write `README.md` with setup instructions

**Key files:**
```
optcg-sim/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── lib/              # Shared utilities, DB client, auth helpers
│   ├── components/       # React components
│   └── types/            # TypeScript type definitions
├── prisma/
│   └── schema.prisma     # Database schema
├── pipeline/             # Python data pipeline
├── docs/                 # This documentation
├── .github/workflows/    # CI/CD
├── tailwind.config.ts
├── next.config.js
└── package.json
```

### 2. CI/CD Pipeline

**GitHub Actions workflows:**

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci.yml` | PR to `main` | Install → Lint → Type-check → Unit tests → Vercel preview deploy |
| `deploy.yml` | Merge to `main` | Install → Build → Prisma migrate → Vercel production deploy |
| `pipeline.yml` | Manual / cron | Run data pipeline → Update card DB → Invalidate CDN cache |

### 3. Authentication

**Implementation:**
1. Set up Supabase project, enable Google OAuth provider
2. Install `@supabase/supabase-js` and `@supabase/auth-helpers-nextjs`
3. Create auth middleware (protect routes, inject user context)
4. Build login page with Google sign-in button
5. On first login, prompt for username (unique constraint in DB)
6. Store user profile in `users` table (synced from Supabase Auth)

**Auth flow:**
```
User clicks "Sign in with Google"
  → Supabase Auth handles OAuth redirect
  → JWT issued, stored in cookie (httpOnly, secure)
  → Middleware reads JWT on each request
  → If new user → redirect to /onboarding (set username)
  → If returning → redirect to /dashboard
```

**Security considerations:**
- JWT stored as httpOnly cookie (not localStorage)
- CSRF protection via SameSite cookie attribute
- Rate limiting on auth endpoints
- Username uniqueness enforced at DB level

### 4. Database Schema

**Prisma schema (core entities for M0):**

```prisma
model User {
  id          String   @id @default(uuid())
  authId      String   @unique       // Supabase Auth UID
  username    String   @unique
  avatarUrl   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  decks       Deck[]
}

model Card {
  id              String        @id               // e.g. "OP01-001"
  set             String                           // e.g. "OP01"
  name            String
  color           String[]                         // e.g. ["Red"]
  type            CardType                         // Leader, Character, Event, Stage
  cost            Int?
  power           Int?
  counter         Int?
  attribute       String[]                         // Strike, Slash, Ranged, Special, Wisdom
  life            Int?                             // Leader only
  traits          String[]                         // e.g. ["Straw Hat Crew"]
  effectText      String
  triggerText     String?
  effectSchema    Json?                            // Parsed effect JSON (nullable in M0)
  imageUrl        String
  altImageUrls    String[]
  banStatus       BanStatus     @default(LEGAL)
  blockRotation   String[]

  artVariants     ArtVariant[]
  erratas         Errata[]
  deckCards       DeckCard[]
}

model ArtVariant {
  id          String  @id @default(uuid())
  cardId      String
  variantId   String
  label       String                               // e.g. "Parallel", "SEC"
  imageUrl    String
  set         String

  card        Card    @relation(fields: [cardId], references: [id])
}

model Errata {
  id          String   @id @default(uuid())
  cardId      String
  date        DateTime
  description String
  effectText  String

  card        Card     @relation(fields: [cardId], references: [id])
}

model Deck {
  id          String     @id @default(uuid())
  userId      String
  name        String
  leaderId    String
  format      String     @default("Standard")
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  user        User       @relation(fields: [userId], references: [id])
  cards       DeckCard[]
}

model DeckCard {
  id          String  @id @default(uuid())
  deckId      String
  cardId      String
  quantity    Int

  deck        Deck    @relation(fields: [deckId], references: [id], onDelete: Cascade)
  card        Card    @relation(fields: [cardId], references: [id])

  @@unique([deckId, cardId])
}

enum CardType {
  Leader
  Character
  Event
  Stage
}

enum BanStatus {
  LEGAL
  BANNED
  RESTRICTED
}
```

**Indexes (performance-critical for deck builder search in M1):**
- `Card.name` — full-text search index (GIN on `tsvector`)
- `Card.color` — GIN index on array column
- `Card.type` — B-tree index
- `Card.cost` — B-tree index
- `Card.set` — B-tree index
- `Card.traits` — GIN index on array column
- `Card.banStatus` — B-tree index

### 5. Data Pipeline v1

**Scope for M0:** Import the full card database from the `punk-records` community dataset.

**Data source:** [buhbbl/punk-records](https://github.com/buhbbl/punk-records) — structured JSON generated by the [vegapull](https://github.com/coko7/vegapull) Rust scraper. As of March 8, 2026: 4,007 unique cards across 50 English packs.

**Why this approach (not a custom scraper):**
- The official OPTCG website uses cookie/bot protection that makes direct scraping unreliable
- punk-records already solves the scraping problem and produces clean per-card JSON
- Building our own scraper would spend days solving a problem someone else has already solved
- For new sets, we can re-run vegapull or wait for punk-records updates (< 10 min effort)

**Pipeline structure:**
```
pipeline/
├── import.ts             # Main import script (TypeScript, runs via tsx)
├── transform.ts          # Map punk-records schema → our Prisma schema
├── download-images.ts    # Download card images from official URLs → R2
└── seed-data/            # Git-tracked copy of punk-records JSON (or fetched at import time)
```

**Pipeline steps:**
1. **Fetch** — Clone or download punk-records English dataset (packs.json + per-card JSON files)
2. **Transform** — Map fields to our Prisma schema (see LEARNINGS.md for field mapping)
3. **Sanitize** — Strip HTML tags from effect text (`<br>` → newlines)
4. **Write** — Upsert cards into PostgreSQL via Prisma
5. **Download images** — Fetch card images from official URLs, upload to R2
6. **Verify** — Count cards in DB, spot-check a few known cards

**M0 pipeline simplifications:**
- `effectSchema` left as `null` for all cards (hand-authored in M4)
- `banStatus` defaults to `LEGAL` for all cards (maintained manually)
- `blockRotation` left empty (maintained manually)
- Art variants and errata not imported (supplemental source needed later)

**Language:** TypeScript (same as the app — no Python dependency needed since we're not scraping)

### 6. Verification Page

A minimal `/cards` page that renders a paginated grid of all cards in the database. Purpose: verify the pipeline works end-to-end and card data is correct.

Not a production UI — will be replaced by the full deck builder in M1.

---

## Roadmap

| Step | Task | Est. |
|------|------|------|
| 1 | Scaffold Next.js project with TypeScript, Tailwind, Prisma | 1 day |
| 2 | Set up Supabase project (Postgres + Auth) | 0.5 day |
| 3 | Implement Prisma schema + initial migration | 0.5 day |
| 4 | Build auth flow (Google OAuth, middleware, onboarding) | 1–2 days |
| 5 | Set up CI/CD (GitHub Actions) | 0.5 day |
| 6 | Build data pipeline v1 (fetch + parse for OP01) | 2–3 days |
| 7 | Upload card images to R2, configure CDN | 0.5 day |
| 8 | Build basic card listing page | 0.5 day |
| 9 | End-to-end verification: login → view cards | 0.5 day |

**Total estimate: ~7–9 days**

---

## Acceptance Criteria

- [ ] A new user can sign in via Google OAuth and set a username
- [ ] Returning users see their profile persisted across sessions
- [ ] The `cards` table contains all cards from at least 1 full set (OP01)
- [ ] Card images load from CDN
- [ ] The `/cards` page renders card data accurately (name, cost, power, color, type)
- [ ] CI pipeline passes: lint, type-check, tests green
- [ ] Production deploy accessible via Vercel URL

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| punk-records dataset has data quality issues | Incorrect card data in our DB | Spot-check import against official card list; add data validation in transform step |
| punk-records stops being maintained | No updates for new sets | We can run vegapull directly, or fall back to HTML snapshot approach |
| Supabase free tier limits | DB connection limits in prod | Monitor usage; upgrade tier or switch to Neon if needed |
| Card image download blocked by official site | No card images | Download in batches with delays; host locally once downloaded |

---

## Dependencies

- Supabase account (free tier sufficient for M0)
- Cloudflare account (R2 free tier: 10GB storage, 10M reads/month)
- Vercel account (free tier for personal projects)
- Google Cloud Console (OAuth client ID)

---

_Last updated: 2026-03-15_
