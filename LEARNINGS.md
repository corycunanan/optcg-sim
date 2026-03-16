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

### 2026-03-16 — Data Pipeline: vegapull confirmed working — full dataset pulled

**Area:** Data Pipeline

Successfully ran vegapull v1.2.0 against the live official site. **Mode A is confirmed viable.** Key results:

- **51 packs discovered**, 50 pulled successfully (pack 569115/OP15-EB04 has a bug on card OP15-096 where `block_number` is empty — vegapull crashes on this. Used an earlier single-pack pull that succeeded for this pack's data.)
- **4,346 total card entries** across all packs
- **2,496 unique base card IDs** (stripping `_p1`, `_p2`, `_r1` suffixes)
- **2,858 base entries + 1,488 art variant entries**
- Pack 569018 (ST-18) had a transient network error on first attempt but succeeded on retry.

**vegapull CLI usage (non-interactive):**
- `vega pull -o <dir> packs` — downloads pack list (~1 sec)
- `vega pull -o <dir> cards <pack_id>` — downloads cards for a single pack (~3 sec each)
- `vega pull -o <dir> cards <pack_id> --with-images` — also downloads card images
- `vega pull -o <dir> all` requires TTY (interactive mode) — doesn't work in scripts. Use pack-by-pack loop instead.
- Full pull of all 51 packs: ~4.5 minutes non-interactive.

**Important:** Card images from the official site have "SAMPLE" watermarks. Images are 600×838 PNG, ~180KB each. All 4,346 images would total roughly 780MB.

---

### 2026-03-16 — Data Pipeline: Variant ID convention discovered

**Area:** Data Pipeline / Card Data Model

vegapull uses a suffix convention on card IDs to distinguish art variants and reprints:

| Suffix | Meaning | Count | Where |
|---|---|---|---|
| `_p1`, `_p2`, ... `_p8` | **Parallel / promo art** — same card, different artwork | 1,488 | Booster packs, promo packs, extra boosters |
| `_r1`, `_r2` | **Reprint** — same card reprinted in a different product | 362 | Premium Boosters (PRB-01/PRB-02), Starter Decks (ST-15+) |
| (no suffix) | **Base card** — first/original printing | 2,858 | Original set |

The `_r` suffix is significant: it marks cards that were reprinted in a new product (often a Premium Booster or themed Starter Deck) with the **same art** as the original. This is distinct from `_p` variants which have **different art**. For our dedup/grouping step, `_r` entries should be treated as set-membership mappings, not new art variants.

---

### 2026-03-16 — Data Pipeline: 575 cards appear in multiple packs (cross-set reprints)

**Area:** Data Pipeline / Card Data Model

Analysis of the full dataset shows **575 unique cards appear in 2+ different packs**:
- 418 cards in 2 packs
- 117 cards in 3 packs
- 35 cards in 4 packs
- 5 cards in 5 packs

Examples:
- EB01-015 appears in 7 entries across ST-24, EB-01, PRB-02, and Promotion card packs
- EB01-043 appears in 7 entries across EB-01 and Promotion card packs
- OP13-037_p1 (Roronoa Zoro TreasureRare) appears in OP15-EB04 despite being an OP-13 card

This confirms the need for a many-to-many Card ↔ Set relationship. The current schema has `Card.set` as a single string field — this needs to become a relation table or array, with a designated "origin set" (first printing) for filtering out reprints.

---

### 2026-03-16 — Data Pipeline: `block_number` field available for ALL cards

**Area:** Data Pipeline / Card Data Model

vegapull now includes a `block_number` field (integer) for every card. This was added in January 2026. The distribution:
- Block 1: 1,329 entries
- Block 2: 1,194 entries
- Block 3: 1,138 entries
- Block 4: 685 entries

This directly maps to block rotation legality — a major gap we thought we'd have to maintain manually. The `blockRotation` field in our schema can be populated automatically from this.

---

### 2026-03-16 — Data Pipeline: Pack label mapping has edge cases

**Area:** Data Pipeline

The packs.json from vegapull has inconsistent label formats:
- Most packs: `"label": "OP-01"`, `"label": "ST-01"`
- Combined packs: `"label": "OP14-EB04"`, `"label": "OP15-EB04"` — these contain cards from multiple sets in one pack
- Two promo/misc packs: `"label": null` — pack 569801 ("Other Product Card") and 569901 ("Promotion card") have no label
- Prefixes vary: `"prefix": "BOOSTER PACK"`, `"prefix": "STARTER DECK"`, `"prefix": "PREMIUM BOOSTER"`, etc.

For our set mapping, the card ID prefix (e.g. `OP01` from `OP01-001`) is more reliable than the pack label for determining a card's "origin set". The pack_id → pack_label mapping is useful for knowing which product a specific printing was released in.

---

### 2026-03-16 — Data Model: Card ↔ Set relationship needs to be many-to-many

**Area:** Card Data Model

The current Prisma schema has `Card.set` as a single string field (e.g. "OP01"). This is insufficient because:
1. A card can appear in multiple packs/sets (575 cards confirmed)
2. We need to know the "origin set" (first printing) for reprint filtering
3. We need to maintain ALL sets a card appears in for queryability ("show me all cards in PRB-01")

**Decision:** Add a `CardSet` join table or a `sets` string array field + `originSet` string field. The `originSet` is derived from the card ID prefix (e.g. `OP01-001` → origin set `OP-01`). The full set membership list comes from all packs the card or its variants appear in.

---

### 2026-03-16 — Data Pipeline: HTML entities in card names

**Area:** Data Pipeline

Some card names contain HTML entities (e.g. `"Smoker &amp; Tashigi"` instead of `"Smoker & Tashigi"`). The transform step must decode HTML entities in all text fields (name, effect, trigger).

### 2026-03-16 — Data Pipeline: Card image SAMPLE watermarks — no clean source found

**Area:** Data Pipeline / Images

Investigated all known OPTCG card image sources for clean (non-watermarked) images. **Every source traces back to the official Bandai site images, which all have "SAMPLE" watermarks baked in.** Sources tested:

| Source | Result |
|--------|--------|
| Official English site (en.onepiece-cardgame.com) | SAMPLE watermark |
| Official Japanese site (www.onepiece-cardgame.com) | SAMPLE watermark (Japanese text) |
| Limitless TCG (limitlesstcg.nyc3.digitaloceanspaces.com) | SAMPLE watermark (mirrors official) |
| OPTCG API (optcgapi.com/media/static/Card_Images/) | SAMPLE watermark (mirrors official) |
| onepiece.gg | No direct image CDN found |
| Ryan's OPTCG API (optcg-api.ryanmichaelhirst.us) | R2 bucket is auth-gated |

**Conclusion:** The watermarks appear to be Bandai's policy for all digital card images on the official site. Other fan projects (limitlesstcg, optcgapi.com, opgoldfish) all use these same watermarked images. Clean card images only exist as physical card scans, which would require a separate sourcing effort.

**Decision for now:** Use SAMPLE-watermarked images from vegapull for development and the admin UI. For production, this is an open item — options include:
1. Accept watermarked images (many fan tools do this)
2. Source scanned images from the community (quality varies, coverage gaps)
3. Wait for Bandai to provide a non-watermarked API (unlikely near-term)

---

### 2026-03-16 — Data Pipeline: OP15-096 flagged for manual add

**Area:** Data Pipeline / Admin UI

Card OP15-096 crashes vegapull because its `block_number` field is empty on the official site. This card will be:
1. Flagged as a known gap in the import pipeline
2. Manually added via the admin UI as a test case for the manual card entry workflow
3. Used as an acceptance test: "can we add a card that vegapull missed?"

---

**Area:** M0 / UI

The basic `/cards` verification page from the original M0 plan needs to be upgraded to a full database management UI:
1. **Visualize** — browse all cards with images, filter by set/type/color, search by name
2. **Manual edit** — edit card fields (ban status, block rotation, traits, errata) directly in the UI
3. **Add entries** — manually add cards that vegapull misses (e.g. OP15-096 which crashes vegapull)
4. **Image display** — show downloaded card images inline

This serves dual purpose: M0 verification AND ongoing database maintenance for fields vegapull can't provide (ban status, errata, manual corrections).

---

<!-- Add new entries above this line -->
