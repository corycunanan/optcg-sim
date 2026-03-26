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
PostgreSQL (Supabase)     Cloudflare R2 CDN
  cards                     cards/{id}.webp
  art_variants              variants/{variantId}.webp
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
| `verify.ts` | Post-import sanity checks — counts, missing images, orphaned records |

## Running the Pipeline

```bash
# Full import (transform + write to DB)
pnpm pipeline:import [--data-dir <path>] [--dry-run]

# Image migration to R2 (run after import)
pnpm pipeline:migrate-images [--dry-run] [--concurrency <n>] [--limit <n>]
```

- Default data dir: `data/vegapull-full/json`
- `--dry-run`: Print summary without writing to DB / uploading images
- `--concurrency`: Parallel image downloads (default 5)
- `--limit`: Only migrate first N images
- Image migration is resumable — skips images already on CDN

## Environment Variables

**Required for import:**
```
DATABASE_URL=postgresql://user:password@host:5432/optcg_sim?schema=public
DIRECT_DATABASE_URL=postgresql://user:password@host:5432/optcg_sim?schema=public
```

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
- **Card Sets**: Delete all → recreate (clean slate each run)

### Step 6: Verify (`verify.ts`)

- Count comparisons (DB vs expected, allows 1 variance for known OP07-091_p1 duplicate)
- Spot-checks known cards: ST01-001 (Luffy Leader), OP01-001 (Zoro Leader), OP01-025 (Zoro Character)
- Data quality: missing effectText, empty imageUrl, type distribution, block distribution

## Image Migration (`migrate-images.ts`)

Runs independently after import:

1. Fetches all Card + ArtVariant image URLs from DB
2. Skips URLs already pointing to CDN (`NEXT_PUBLIC_CDN_URL`)
3. Downloads from vegapull source URL with retry (3 attempts, exponential backoff)
4. Uploads to R2 as webp with immutable cache headers
5. Updates DB `imageUrl` with CDN URL

R2 key format: `cards/{id}.webp` for cards, `variants/{variantId}.webp` for art variants.

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
