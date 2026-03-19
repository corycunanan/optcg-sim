# Card Data Pipeline

ETL pipeline that imports One Piece TCG card data from vegapull into PostgreSQL and Cloudflare R2.

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
pnpm pipeline:import

# Image migration to R2 (run after import)
pnpm pipeline:migrate-images
```

## Data Source

vegapull (`vegapull/` git submodule) — a Rust CLI that scrapes the official OPTCG site and outputs structured JSON + image URLs. Output lands in `data/` (gitignored).

## Key Design Decisions

- Cards are upserted (not inserted) so re-runs are idempotent
- `originSet` is derived from the card ID prefix (`OP01-001` → `OP-01`) — more reliable than pack metadata
- Art variants (parallel, reprint) share a base card record via `ArtVariant` table
- Cross-set membership is many-to-many (`CardSet` join table); a card can appear in multiple packs
