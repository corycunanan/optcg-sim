# OPTCG Simulator — Learnings

A running log of decisions, discoveries, and hard-won lessons accumulated as the project grows. Add entries as you encounter them — rule of thumb: if you had to stop and think about it, or if it would surprise a future contributor, write it down.

---

## Format

Each entry should include:
- **Date** — when this was discovered/decided
- **Area** — which part of the system it applies to (e.g. Data Pipeline, Effect Engine, Deck Builder)
- **Learning** — what was learned or decided, and why

---

## Entries

### 2026-03-15 — Data Model: `subtype` renamed to `traits`

**Area:** Card Data Model

The `subtype` field was renamed to `traits` to better reflect OPTCG terminology. In the game, the bracketed text on cards (e.g. `[Straw Hat Crew]`) is officially referred to as "traits," not subtypes. Using the game's own vocabulary reduces cognitive load and avoids confusion with other TCG conventions.

---

### 2026-03-15 — Data Model: `set` added to `ArtVariant`

**Area:** Card Data Model

`ArtVariant` now includes a `set` field because alternate art versions of a card (e.g. Parallel, SEC) are sometimes released in a different set than the base card. Without this field, it was impossible to correctly attribute a variant to its release set.

---

### 2026-03-15 — Data Pipeline: Scraping abandoned in favor of vegapull + punk-records

**Area:** Data Pipeline

Attempted to build a custom scraper for the official OPTCG website but hit significant issues with cookie/bot protection. Discovered two community tools:

- **vegapull** (https://github.com/coko7/vegapull) — Rust CLI that scrapes the official site. Actively maintained (last update Jan 2026). Already solved the cookie problem. Run `vega pull all` to get all sets.
- **punk-records** (https://github.com/buhbbl/punk-records) — prefetched JSON dataset from vegapull. 4,007 cards, 50 packs, generated March 8, 2026. Per-card JSON with all fields we need. Coverage through OP-09; missing OP-10 through OP-14 and recent EBs.

**Decision:** Use vegapull directly as primary (Mode A) for full set coverage. Use punk-records as fallback (Mode B) if vegapull hits issues. Write a TypeScript import pipeline (JSON → Prisma) instead of a custom scraper. No Python dependency needed.

**Key concern:** Neither tool groups art variants. A card appearing in multiple packs (base art, parallel, SEC, promo) shows up as separate entries. The import pipeline must include a deduplication/grouping step that uses card ID, rarity, pack_id, and image URL to classify base cards vs variants.

---

### 2026-03-15 — Data Pipeline: Field mapping from vegapull/punk-records to our schema

**Area:** Data Pipeline

Mapping between punk-records JSON fields and our Prisma Card model:

| punk-records field | Our field | Notes |
|---|---|---|
| `id` | `id` | Direct (e.g. "ST01-001") |
| `pack_id` | `set` | Needs mapping via packs.json (569001 → "ST-01") |
| `name` | `name` | Direct |
| `category` | `type` (enum) | Map: Leader/Character/Event/Stage/Don |
| `colors` | `color` (string[]) | Direct |
| `cost` | `cost` | Direct (null for Leaders) |
| `power` | `power` | Direct |
| `counter` | `counter` | Direct (null when absent) |
| `attributes` | `attribute` (string[]) | Direct |
| `types` | `traits` (string[]) | punk-records calls them "types", we call them "traits" |
| `effect` | `effectText` | Contains HTML (`<br>` tags) — needs sanitization |
| `trigger` | `triggerText` | Direct |
| `img_full_url` | `imageUrl` | Source URL; we'll download and host on CDN |
| `rarity` | (new field needed) | Common/Uncommon/Rare/SuperRare/SecretRare/Leader/Special/TreasureRare/Promo |
| — | `effectSchema` | Not in source data — authored separately (M4) |
| — | `banStatus` | Not in source data — maintained manually |
| — | `blockRotation` | Not in source data — maintained manually |
| — | `artVariants` | Not in source data — may need supplemental source |
| — | `errata` | Not in source data — maintained manually |

Key gaps to fill manually or from other sources: ban status, block rotation legality, art variants, errata history.

---

<!-- Add new entries above this line -->
