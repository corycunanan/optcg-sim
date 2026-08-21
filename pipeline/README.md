# Card Data Pipeline

ETL pipeline that imports One Piece TCG card data from vegapull into PostgreSQL and Cloudflare R2.

## Data Flow

```
vegapull (Rust CLI) → JSON + PNG files
    ↓
data/vegapull-full/json/
    ↓
Pipeline (TypeScript)
    ├─ load.ts         → Read JSON from disk
    ├─ transform.ts    → Normalize fields, decode HTML, sanitize text
    ├─ classify.ts     → Group into base cards, art variants, reprints
    ├─ build-set-membership.ts → Many-to-many card↔set mapping
    ├─ write.ts        → Upsert to PostgreSQL via Prisma
    └─ verify.ts       → Post-import sanity checks
    ↓
PostgreSQL (Neon)         Cloudflare R2 CDN
  cards                     cards/{id}.webp
  art_variants              variants/{ArtVariant.id}.webp
  card_sets
```

## Scripts

Run scripts with `tsx` (e.g. `pnpm pipeline:import`). The main entry point orchestrates the full pipeline; individual scripts can be run standalone for debugging.

| Script | Purpose |
|--------|---------|
| `import.ts` | **Main entry point** — orchestrates the full pipeline in order |
| `load.ts` | Load raw vegapull JSON from `data/` into memory |
| `transform.ts` | Normalize card fields, decode HTML entities, sanitize effect text |
| `classify.ts` | Classify art variants (base / parallel / reprint), detect cross-set reprints |
| `build-set-membership.ts` | Build Card ↔ Set many-to-many membership from pack metadata |
| `write.ts` | Upsert transformed cards, sets, variants, and errata into PostgreSQL via Prisma |
| `migrate-images.ts` | Download card images from vegapull CDN and upload to Cloudflare R2 |
| `check-images.ts` | Fail unless every card and art variant image is hosted on the configured CDN |
| `verify.ts` | Post-import sanity checks — counts, missing images, orphaned records |

## Running the Pipeline

```bash
# Full import (transform + write to DB)
pnpm pipeline:import [--data-dir <path>] [--dry-run]

# Image migration to R2 (run after import)
pnpm pipeline:migrate-images [--dry-run] [--concurrency <n>] [--limit <n>]

# Hard gate after image migration
pnpm pipeline:check-images
```

An import is not complete until `pnpm pipeline:migrate-images` has run and
`pnpm pipeline:check-images` passes. The official host sends
`cross-origin-resource-policy: same-site`, so browsers render its card URLs as blank
`<img>` elements when the simulator loads them cross-site. Import verification warns
about off-CDN rows without failing because newly written rows have not been migrated yet.

- Default data dir: `data/vegapull-full/json`
- `--dry-run`: Print summary without writing to DB / uploading images
- `--concurrency`: Parallel image downloads (default 5)
- `--limit`: Only migrate first N images
- Image migration is resumable — skips images already on CDN

## Environment Variables

**Database connection for import (`DIRECT_DATABASE_URL` preferred):**
```
DIRECT_DATABASE_URL=postgresql://user:password@host:5432/optcg_sim?schema=public
DATABASE_URL=postgresql://user:password@host:5432/optcg_sim?schema=public
```

The import uses `DIRECT_DATABASE_URL` when it is set and otherwise falls back to
`DATABASE_URL`. A fallback URL with `connection_limit=1` is rejected before the import
starts because the parallel art-variant upserts require more than one connection.

Pipeline scripts run against whatever DB `.env` points at — after the OPT-278 split, that's
the dev Neon branch by default. To promote card data to prod, see the "Promoting card data
from dev → prod" section in [`docs/architecture/DEPLOYMENT.md`](../docs/architecture/DEPLOYMENT.md).
Don't run `pnpm pipeline:import` directly against prod.

**Required for image migration:**
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=optcg-images
NEXT_PUBLIC_CDN_URL=https://pub-xxx.r2.dev
```

## Data Source

vegapull (`data/vegapull-full/` directory) — a Rust CLI that scrapes the official OPTCG site and outputs structured JSON + image URLs. Output is gitignored.

### vegapull JSON Format (per card)

```typescript
{
  id: string;              // "OP01-001", "OP01-001_p1" (with variant suffix)
  pack_id: string;         // vegapull pack ID
  name: string;            // May contain HTML entities: "Smoker &amp; Tashigi"
  category: string;        // Leader, Character, Event, Stage, Don (skip Don)
  cost: number | null;     // null for Leaders (mapped to life field)
  power: number | null;
  counter: number | null;
  colors: string[];        // ["Red"], ["Blue", "Green"]
  attributes: string[];    // Strike, Slash, Ranged, Special, Wisdom
  types: string[];         // Traits: ["Straw Hat Crew"]
  rarity: string;
  effect: string;          // HTML with <br> tags
  trigger: string | null;
  img_full_url: string;    // Source image URL
  block_number: number | null;
}
```

## Processing Steps

### Step 1: Load (`load.ts`)

Reads `packs.json` for pack metadata (id, title, label) and all `cards_*.json` files sorted by filename. Returns raw cards array and pack map.

### Step 2: Transform (`transform.ts`)

- **HTML entities**: `&amp;` → `&`, `&#39;` → `'`, `&lt;` → `<`, etc.
- **Effect text**: `<br>` → `\n`, strip HTML tags, collapse excess newlines, trim
- **Card ID parsing**: `OP01-001_p1` → base ID `OP01-001`, variant type `parallel`
- **Origin set derivation**: From ID prefix (`OP01-001` → `OP-01`)
- **Leader handling**: `cost` field mapped to `life` for Leader cards

### Step 3: Classify (`classify.ts`)

Groups all entries by base ID:
- **Base entry** (no suffix) → canonical Card record
- **Parallel variants** (`_p1`, `_p2`, etc.) → ArtVariant records
- **Reprints** (`_r1`, `_r2`) → flagged for set membership, not separate cards

Variant labels inferred from rarity: SecretRare → "Secret Rare", Special → "Special", etc.

### Step 4: Build Set Membership (`build-set-membership.ts`)

Creates CardSet entries linking each card to every pack it appears in. `isOrigin = true` when the card's origin set matches the pack's label. Handles combined labels like "OP14-EB04" by splitting and checking both parts.

### Step 5: Write (`write.ts`)

Batch upserts in groups of 100 (transactional):
- **Cards**: Upsert on `Card.id`. Updates all fields except `imageUrl` (preserves CDN URLs set by image migration)
- **Art Variants**: Upsert on `ArtVariant.variantId`. Same imageUrl preservation
- **Card Sets**: Atomically delete all → recreate after card and art-variant upserts succeed

### Step 6: Verify (`verify.ts`)

- Count comparisons (DB vs expected, allows 1 variance for known OP07-091_p1 duplicate)
- Spot-checks known cards: ST01-001 (Luffy Leader), OP01-001 (Zoro Leader), OP01-025 (Zoro Character)
- Data quality: missing effectText, empty imageUrl, type distribution, block distribution
- Image hosting: warns with off-CDN counts and sample IDs; this warning never fails import

## Image Migration (`migrate-images.ts`)

Runs after every import:

1. Fetches all Card + ArtVariant image URLs from DB
2. Skips URLs already pointing to CDN (`NEXT_PUBLIC_CDN_URL`)
3. Downloads from vegapull source URL with retry (3 attempts, exponential backoff)
4. Uploads to R2 as webp with immutable cache headers
5. Updates DB `imageUrl` with CDN URL

R2 key format: `cards/{id}.webp` for cards and `variants/{ArtVariant.id}.webp`
for art variants. The migration passes the variant row's UUID to
`sourceUrlToR2Key(v.id, "variant")`; it does not use the human-readable `variantId`.

After migration, run `pnpm pipeline:check-images`. The command uses
`DIRECT_DATABASE_URL` when available, otherwise a safe `DATABASE_URL`, and exits non-zero
when `NEXT_PUBLIC_CDN_URL` is unset or any card or variant image remains off-CDN. A zero
exit confirms every stored image URL starts with the normalized CDN URL.

## Database Schema (Key Tables)

```
Card
  id           String    @id       // "OP01-001"
  originSet    String              // "OP-01"
  name, color[], type, cost, life, power, counter
  attribute[], traits[], rarity, effectText, triggerText
  imageUrl     String              // CDN URL after migration
  blockNumber  Int                 // Block rotation: 1-4
  banStatus    BanStatus           // LEGAL | BANNED | RESTRICTED
  isReprint    Boolean

ArtVariant
  variantId    String    @unique   // "OP01-001_p1"
  cardId       String              // FK → Card
  label, rarity, imageUrl, set

CardSet
  cardId       String              // FK → Card
  packId       String              // vegapull pack ID
  setLabel, setName, isOrigin
  @@unique([cardId, packId])
```

## Data Stats

- ~50 packs from vegapull
- ~4,346 total entries → ~2,496 unique base cards
- ~1,488 parallel art variants, ~362 reprints

## Key Design Decisions

- Cards are upserted (not inserted) so re-runs are idempotent
- `originSet` is derived from the card ID prefix (`OP01-001` → `OP-01`) — more reliable than pack metadata
- Art variants (parallel, reprint) share a base card record via `ArtVariant` table
- Cross-set membership is many-to-many (`CardSet` join table); a card can appear in multiple packs
- Image URLs excluded from upsert updates to preserve CDN URLs after migration

## Known Edge Cases

- **OP07-091_p1**: Duplicated in vegapull source data — verify step allows 1 count variance
- **OP15-096**: vegapull crashes on empty block_number — flagged for manual add
