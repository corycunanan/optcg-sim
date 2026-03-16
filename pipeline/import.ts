/**
 * OPTCG Data Import Pipeline
 *
 * Loads vegapull JSON output, transforms it to our Prisma schema,
 * and upserts to PostgreSQL.
 *
 * Usage: pnpm pipeline:import
 *
 * See docs/DATA-PIPELINE.md for full pipeline design.
 */

// TODO: Implement in M0 Step 6
// 1. Load packs.json + per-pack card JSON files
// 2. Transform fields to our Prisma schema
// 3. Sanitize effect text (HTML entities, <br> → newlines)
// 4. Classify variants (_p → ArtVariant, _r → CardSet)
// 5. Build card ↔ set membership
// 6. Derive originSet from card ID prefix
// 7. Upsert to PostgreSQL via Prisma
// 8. Verify counts and spot-check

console.log("🚧 Pipeline not yet implemented. See docs/DATA-PIPELINE.md");
