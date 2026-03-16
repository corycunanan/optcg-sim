# M0 — Foundation

> Repo setup, auth, database schema, and initial card data population.

---

## Scope

M0 establishes the project's infrastructure, authentication, database schema, and a seed card dataset. Nothing is user-facing beyond a login flow and a basic card listing to verify the pipeline works.

### Deliverables

- [ ] Repository scaffolded with Next.js, TypeScript, Tailwind, Prisma
- [ ] CI/CD pipeline (lint, type-check, test, deploy)
- [ ] Google OAuth authentication (sign-in, sign-out, session persistence)
- [ ] PostgreSQL schema for cards, users, decks (with many-to-many card ↔ set, art variants, block rotation)
- [ ] Data pipeline v1 (vegapull → transform → Prisma import — all sets)
- [ ] Card images downloaded via vegapull and stored locally / uploaded to R2
- [ ] Database admin UI: browse, search, filter, edit, add cards with image display
- [ ] Reprint filter: option to show cards only in origin set vs. all sets they appear in

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
│   Data Pipeline (TypeScript) │
│   vegapull → Transform →     │
│   Prisma Import              │
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
├── pipeline/             # TypeScript data pipeline (vegapull → Prisma)
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
  id              String        @id               // e.g. "OP01-001" (base ID, no suffix)
  originSet       String                           // e.g. "OP-01" — derived from card ID prefix
  name            String
  color           String[]                         // e.g. ["Red"]
  type            CardType                         // Leader, Character, Event, Stage
  cost            Int?
  power           Int?
  counter         Int?
  attribute       String[]                         // Strike, Slash, Ranged, Special, Wisdom
  life            Int?                             // Leader only
  traits          String[]                         // e.g. ["Straw Hat Crew"]
  rarity          String                           // Common, Uncommon, Rare, SuperRare, etc.
  effectText      String
  triggerText     String?
  effectSchema    Json?                            // Parsed effect JSON (nullable in M0)
  imageUrl        String                           // CDN URL for base card image
  blockNumber     Int                              // Block rotation (1, 2, 3, 4)
  banStatus       BanStatus     @default(LEGAL)
  isReprint       Boolean       @default(false)    // True if this card ID was first printed in a different product

  artVariants     ArtVariant[]
  erratas         Errata[]
  deckCards       DeckCard[]
  cardSets        CardSet[]                        // All sets/packs this card appears in
}

model CardSet {
  id          String  @id @default(uuid())
  cardId      String
  packId      String                               // vegapull pack_id (e.g. "569101")
  setLabel    String                               // Human-readable (e.g. "OP-01", "PRB-01")
  setName     String                               // Full name (e.g. "ROMANCE DAWN")
  isOrigin    Boolean @default(false)              // True if this is the card's first printing

  card        Card    @relation(fields: [cardId], references: [id])

  @@unique([cardId, packId])
}

model ArtVariant {
  id          String  @id @default(uuid())
  cardId      String
  variantId   String                               // Full vegapull ID (e.g. "OP01-001_p1")
  label       String                               // e.g. "Parallel", "Parallel 2", "SEC", "Treasure", "Promo"
  rarity      String                               // Rarity of this specific variant
  imageUrl    String                               // CDN URL for variant image
  set         String                               // Set/pack this variant was released in

  card        Card    @relation(fields: [cardId], references: [id])
  
  @@unique([variantId])
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

**Schema changes from original design (2026-03-16):**
- Added `Card.originSet` — derived from card ID prefix, immutable
- Added `Card.rarity` — base card rarity from first printing
- Added `Card.blockNumber` — auto-populated from vegapull's `block_number` field
- Added `Card.isReprint` — flag for cards whose ID prefix doesn't match their origin pack
- Added `CardSet` join table — many-to-many Card ↔ Set/Pack relationship with `isOrigin` flag
- Added `ArtVariant.rarity` — variants can have different rarities (e.g. SecretRare, TreasureRare, Special)
- Added `ArtVariant.variantId` unique constraint — maps directly to vegapull's suffixed ID
- Removed `Card.altImageUrls` — replaced by `ArtVariant` relation
- Removed `Card.set` single field — replaced by `Card.originSet` + `CardSet` join table
- Removed `Card.blockRotation` string[] — replaced by `Card.blockNumber` integer

**Indexes (performance-critical for deck builder search in M1):**
- `Card.name` — full-text search index (GIN on `tsvector`)
- `Card.color` — GIN index on array column
- `Card.type` — B-tree index
- `Card.cost` — B-tree index
- `Card.set` — B-tree index
- `Card.traits` — GIN index on array column
- `Card.banStatus` — B-tree index

### 5. Data Pipeline v1

**Scope for M0:** Import the full card database with art variant grouping, cross-set membership, and card images.

**Data source:** vegapull v1.2.0 (confirmed working 2026-03-16). See [DATA-PIPELINE.md](./DATA-PIPELINE.md) for full evaluation and test results.

| Mode | Source | Coverage | When to Use |
|------|--------|----------|-------------|
| A (confirmed) | Run vegapull directly | 51 packs, 4,346 entries, through OP-15/EB-04 | Initial setup, new set releases |
| B (fallback) | punk-records snapshot | Through OP-09 (50 packs, 4,007 cards) | If vegapull hits cookie issues; dev/testing |

**vegapull is confirmed working.** Mode A gives full coverage including OP-10 through OP-15, all Extra Boosters, Premium Boosters, Starter Decks, and promo cards.

**Why this approach (not a custom scraper):**
- vegapull already solved the cookie/auth problem
- Confirmed working against the current site (2026-03-16)
- Full dataset pull takes ~4.5 minutes
- Includes `block_number` for block rotation (eliminates manual maintenance)

**Pipeline structure:**
```
pipeline/
├── pull.sh               # Bash script: runs vegapull pack-by-pack with retry logic
├── import.ts             # Main import script (TypeScript, runs via tsx)
├── transform.ts          # Map vegapull JSON → our Prisma schema
├── group-variants.ts     # Classify _p (art variant) vs _r (reprint) entries
├── build-set-membership.ts # Build Card ↔ Set many-to-many from cross-pack appearances
├── download-images.ts    # Download card images from official URLs → local/R2
├── sanitize.ts           # HTML entity decode, <br> → newline, strip HTML
└── seed-data/            # Local vegapull output (git-ignored)
```

**Pipeline steps:**
1. **Pull** — Run vegapull per-pack (non-interactive mode) with retry logic for transient failures
2. **Load** — Read packs.json + all per-card JSON files; build pack_id → set label mapping
3. **Transform** — Map fields to our Prisma schema; decode HTML entities; parse card ID prefix → originSet
4. **Sanitize** — Strip `<br>` tags → newlines; decode `&amp;` etc.; normalize whitespace
5. **Classify variants** — `_p` suffixes → ArtVariant records; `_r` suffixes → set membership entries (no new image)
6. **Build set membership** — For each unique base card ID, collect ALL packs it appears in → CardSet records; mark isOrigin based on card ID prefix matching pack label
7. **Derive origin set** — Parse card ID prefix (e.g. `OP01-001` → `OP-01`) as the canonical origin set
8. **Write** — Upsert Card + CardSet + ArtVariant records to PostgreSQL via Prisma
9. **Download images** — Fetch base card images + variant images from `img_full_url`; store locally and/or upload to R2
10. **Verify** — Count cards in DB vs source; spot-check known cards; report cards with missing fields

**M0 pipeline simplifications:**
- `effectSchema` left as `null` for all cards (hand-authored in M4)
- `banStatus` defaults to `LEGAL` for all cards (maintained manually via admin UI)
- Errata not tracked yet (detected via effect text diffs on re-import)
- Images stored locally first; R2 upload in production deployment

**Known issues to handle:**
- Pack 569115 (OP15-EB04) crashes vegapull on card OP15-096 (empty block_number) — use earlier successful pull data + manually add OP15-096
- HTML entities in card names (e.g. `&amp;` → `&`)
- Cards with `effect: "-"` are vanilla cards (no effect text)

**Language:** TypeScript (same as the app — no Python dependency needed since we're not scraping)

### 6. Database Admin UI

A full-featured database management interface that serves as both M0 verification and ongoing maintenance tool.

**Pages:**

| Page | Purpose |
|------|---------|
| `/admin/cards` | Paginated card grid with images, search, and multi-filter |
| `/admin/cards/[id]` | Card detail view: all fields, art variants gallery, set membership, errata history |
| `/admin/cards/[id]/edit` | Edit any card field: ban status, traits, effect text, etc. |
| `/admin/cards/new` | Manually add a card (for vegapull gaps like OP15-096) |
| `/admin/sets` | Browse cards by set with reprint filter toggle |
| `/admin/import` | Trigger vegapull re-pull for specific packs, view import logs, merge new data |
| `/admin/bulk/errata` | Bulk errata entry: paste card IDs + updated effect text |
| `/admin/bulk/export` | Export card data as CSV for spreadsheet editing |
| `/admin/bulk/import` | Import edited CSV back into the database with diff preview |

**Key features:**
- **Reprint filter toggle** — global switch: "Show in origin set only" vs. "Show in all sets." When filtering reprints, a card like EB01-015 only appears under EB-01 (its origin set). When showing all, it appears under ST-24, PRB-02, and Promotion cards too.
- **Art variant gallery** — card detail page shows all art variants side-by-side with variant labels, rarities, and source sets
- **Inline image display** — card images served from local storage or CDN
- **Set membership list** — shows every pack/set a card appears in with links
- **Edit with change tracking** — all manual edits logged (who, when, what changed)
- **Card search** — instant search by name with debounce; filters for color, type, cost, power, rarity, block number, set, ban status

**Bulk operations (M0):**
- **Re-import specific pack** — select a pack from a dropdown, trigger vegapull re-pull, preview changes (new cards, updated fields, new variants), then merge. Used when a new set releases or when vegapull fixes a bug (e.g. OP15-096).
- **Bulk errata entry** — paste a list of card IDs + updated effect text in a structured format. Preview changes before applying. Used when Bandai releases official errata affecting multiple cards.
- **Export/import CSV** — export all cards (or a filtered subset) as CSV. Edit in a spreadsheet (e.g. bulk-update ban status, fix traits). Re-import with a diff preview showing what changed before committing. The CSV includes: id, name, set, type, color, cost, power, counter, rarity, banStatus, blockNumber, effectText, triggerText, traits.

**Test case:** OP15-096 (crashes vegapull due to empty block_number) will be manually added via the `/admin/cards/new` page as an acceptance test for the manual entry workflow.

**Purpose:** This is NOT a temporary verification page. It's a permanent admin tool for:
1. M0: verify pipeline imported correctly
2. Ongoing: maintain ban lists, errata, manual corrections
3. Quality: spot-check and fix issues vegapull can't handle
4. Development: visual reference while building deck builder and game board

---

## Roadmap

| Step | Task | Est. |
|------|------|------|
| 1 | Scaffold Next.js project with TypeScript, Tailwind, Prisma | 1 day |
| 2 | Set up Supabase project (Postgres + Auth) | 0.5 day |
| 3 | Implement Prisma schema + initial migration (with CardSet join table, updated Card model) | 0.5 day |
| 4 | Build auth flow (Google OAuth, middleware, onboarding) | 1–2 days |
| 5 | Set up CI/CD (GitHub Actions) | 0.5 day |
| 6 | Build data pipeline v1 (vegapull → transform → import for all 51 packs) | 2–3 days |
| 7 | Download card images via vegapull; configure local storage + R2 upload | 0.5 day |
| 8 | Build database admin UI (browse, search, filter, edit, add, reprint filter) | 2–3 days |
| 9 | Build bulk operations (pack re-import, bulk errata, CSV export/import) | 1–2 days |
| 10 | Manual add OP15-096 via admin UI (acceptance test) | 0.5 day |
| 11 | End-to-end verification: login → browse cards → edit card → bulk import → verify | 0.5 day |

**Total estimate: ~10–14 days** (increased from 9–12 due to bulk operations scope)

---

## Acceptance Criteria

- [ ] A new user can sign in via Google OAuth and set a username
- [ ] Returning users see their profile persisted across sessions
- [ ] The `cards` table contains all ~2,496 unique cards from all 51 packs
- [ ] Cards have correct `originSet`, `blockNumber`, and set membership data
- [ ] Art variants are correctly classified (\_p → ArtVariant, \_r → CardSet only)
- [ ] Card images load from local storage or CDN
- [ ] The admin UI renders card data accurately (name, cost, power, color, type, image, set, block)
- [ ] The admin UI supports filtering cards by set with reprint filter toggle
- [ ] Cards can be manually edited (ban status, errata, etc.) via the admin UI
- [ ] New cards can be manually added via the admin UI
- [ ] Art variant gallery shows all variants for a card with correct labels
- [ ] CI pipeline passes: lint, type-check, tests green
- [ ] Production deploy accessible via Vercel URL

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ~~vegapull fails against current site~~ | ~~Limited to punk-records~~ | ✅ **Resolved** — vegapull confirmed working 2026-03-16 |
| vegapull bug on OP15-096 (empty block_number) | 1 card missing from import | Manually add card via admin UI; file bug report on vegapull repo |
| Art variant classification misses edge cases | Wrong base card or missing variants | `_p`/`_r` suffix convention is reliable; flag ambiguous cases for manual review |
| Card image SAMPLE watermarks in production | Unprofessional appearance | Use community image sources for production; watermarked images fine for development |
| Supabase free tier limits | DB connection limits in prod | Monitor usage; upgrade tier or switch to Neon if needed |
| Card image download rate limiting | Slow or blocked downloads | Download in batches with delays; store locally once downloaded; ~780MB total |
| Admin UI scope creep | Delays M0 completion | Keep admin UI minimal-viable: browse + search + edit. Polish in later milestones |

---

## Dependencies

- Supabase account (free tier sufficient for M0)
- Cloudflare account (R2 free tier: 10GB storage, 10M reads/month)
- Vercel account (free tier for personal projects)
- Google Cloud Console (OAuth client ID)

---

_Last updated: 2026-03-16_
