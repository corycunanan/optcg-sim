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

### 2026-03-16 — Scaffold: Next.js 16 (not 14) + Prisma 6 (not 7)

**Area:** Project Setup

The docs specified Next.js 14 but `create-next-app@latest` installed Next.js 16.1.6 (App Router). This is fine — the API is backwards-compatible and the App Router patterns we need work the same way.

Prisma 7 was initially installed but its new config format (`prisma.config.ts` replacing `datasource.url` in schema) would have required a different setup. Downgraded to Prisma 6.19 which uses the traditional `schema.prisma` with `url = env("DATABASE_URL")`. Prisma 7 migration can happen later.

**Versions locked:**
- Next.js 16.1.6
- React 19.2.3
- TypeScript 5.9.3
- Prisma 6.19.2
- Tailwind CSS 4.2.1

---

### 2026-03-16 — Pipeline: Sanitize and transform are combined, not separate steps

**Area:** Data Pipeline

The original plan had `sanitize.ts` as a separate pipeline file. In practice, sanitization (HTML entity decode, `<br>` → newlines, strip HTML tags) was folded into `transform.ts` since it happens naturally during the field mapping step. No need for a separate file — the transform function handles decode + sanitize + map in a single pass.

Also, `group-variants.ts` became `classify.ts` — clearer name since it classifies entries into base/parallel/reprint rather than just grouping.

---

### 2026-03-16 — Pipeline: OP07-091_p1 duplicated in vegapull source data

**Area:** Data Pipeline

vegapull outputs OP07-091_p1 twice across different pack files. Prisma's `createMany({ skipDuplicates: true })` handles this correctly — 1,488 variant entries in source → 1,487 in database. This is expected and the verify step accounts for it.

---

### 2026-03-16 — Pipeline: vegapull packs.json is a dict, not an array

**Area:** Data Pipeline

vegapull's `packs.json` output is `Record<string, Pack>` (keyed by pack_id), not `Pack[]`. The load step must handle this dict structure. Pack IDs are string numbers like "569101".

Also: `life` field does NOT exist in vegapull output for Leaders. The `cost` field on Leaders represents the starting life value (always 5). This means `Card.life` in the Prisma schema stays null for all cards from the pipeline — life would need to be populated separately or derived from the cost field for Leaders.

---

### 2026-03-16 — Admin UI: Dark mode text color conflict

**Area:** Frontend / UI

The app's `globals.css` uses `prefers-color-scheme: dark` to set `--foreground: #ededed` (light gray). The admin layout uses `bg-gray-50` (light background), but inherited text color was the dark-mode `#ededed` — making headings and text nearly invisible on the light admin background.

**Fix:** Added explicit `text-gray-900` to the admin layout wrapper div. This forces readable dark text regardless of the system color scheme. The landing page (`/`) correctly renders in dark mode with its dark background.

**Lesson:** When mixing light-background admin sections with a dark-mode-aware root layout, always set explicit text colors on the section wrapper. Don't rely on CSS variable inheritance across color scheme boundaries.

---

### 2026-03-16 — Admin UI: Sticky nav + scrollbar-gutter for consistent layout

**Area:** Frontend / UI

Two subtle layout issues fixed:
1. **Scrollbar layout shift** — When page content grows tall enough to need a scrollbar, the scrollbar appearing shifts content left. Fixed with `scrollbar-gutter: stable` on `<html>` which reserves space for the scrollbar even when not present.
2. **Scroll behavior** — Admin nav made `sticky top-0` so it stays visible while scrolling through card grid. Main content uses `flex-1` in a `flex flex-col min-h-screen` layout for proper height distribution.

---

### 2026-03-16 — Dev Setup: Local PostgreSQL via Homebrew (not Supabase for dev)

**Area:** Infrastructure

For local development, PostgreSQL 16 via Homebrew (`brew install postgresql@16`) is simpler than setting up Supabase. Connection string: `postgresql://username@localhost:5432/optcg_sim`. Supabase is still the target for production.

Start: `brew services start postgresql@16`
Create DB: `/opt/homebrew/opt/postgresql@16/bin/createdb optcg_sim`

---

### 2026-03-16 — UI: Dark theme with OKLCH-based palette

**Area:** Frontend / UI

Migrated the entire admin UI from light mode (gray-50/white) to a dark, teal-tinted theme. Palette derived from a Coolors palette of Coral Red / Charcoal / Sage / Dusty Teal / Teal / Deep Teal, mapped into OKLCH color space for perceptual uniformity.

Key decisions:
- **Surface hierarchy**: `--surface-0` (14% L) → `--surface-1` (17%) → `--surface-2` (21%) → `--surface-3` (26%), all tinted toward hue 210 (teal)
- **No pure gray anywhere** — all neutrals carry a 0.01 chroma tint toward the teal hue for subconscious cohesion
- **TCG card colors as CSS variables**: `--card-red`, `--card-blue`, etc. — functional colors that appear in filter pills and card badges, kept distinct from the UI palette
- **Coral red accent** (`oklch(62% 0.18 25)`) used sparingly — nav "Add Card" button, pagination active page, CTA buttons only. Avoids overuse per 60-30-10 rule.
- Using CSS custom properties (not Tailwind theme colors) for the palette — allows `style={}` props for inline theming without generating thousands of utility classes

**Lesson:** OKLCH's perceptual uniformity is a real improvement over HSL for dark mode. Setting a consistent chroma (0.01) and hue (210) across 10 surface/border/text levels produces a coherent palette without manual per-shade tuning.

---

### 2026-03-16 — Admin UI: Selectable artwork gallery on card detail page

**Area:** Frontend / UI

The card detail page now has a `CardImageGallery` client component that:
1. Shows **all artworks** — the original/base card image is included as the first thumbnail labeled "Original", followed by all art variants
2. Clicking any thumbnail swaps the main display image
3. Selected artwork gets a coral accent border + highlighted label; unselected thumbnails are slightly dimmed (70% opacity) and brighten on hover

This required extracting the image section from the server component (`page.tsx`) into a `"use client"` component (`card-image-gallery.tsx`) since `useState` is needed for the selected image. The server component passes `baseImageUrl` and `artVariants` as props.

**Note:** After creating this component, the Next.js dev server showed `useInsertionEffect` errors. These were hot-reload artifacts — a server restart (`pnpm dev`) resolved them cleanly. If you see similar errors after adding client components to server pages, restart the dev server first before debugging.

---

### 2026-03-16 — UI: Reprint filter implementation

**Area:** Frontend / Data Filtering

Implemented reprint filter as a toggle button ("Origin only") in the card filters panel. When active:
- **With a set filter**: uses `originSet = set` to match only cards whose ID prefix corresponds to the set label (e.g. `OP01-xxx` for `OP-01`). This is more precise than checking `isReprint` because it leverages the card ID prefix as the canonical origin.
- **Without a set filter**: uses `isReprint = false` to exclude reprint entries.

Test case: PRB-01 (Premium Booster) shows 111 cards with reprints → 1 card with "Origin only" enabled. This confirms the filter works correctly since Premium Boosters are almost entirely reprints.

---

### 2026-03-16 — Auth: NextAuth.js v5 chosen over Supabase Auth

**Area:** Authentication / Infrastructure

The M0 plan originally specified Supabase Auth, but since we're running local PostgreSQL (not Supabase), NextAuth.js v5 (Auth.js) was chosen instead. Key reasons:

- Works directly with existing Prisma + local PostgreSQL — no external auth service needed
- `@auth/prisma-adapter` stores all auth data (accounts, sessions, users) in our own DB
- Most mature Next.js auth solution with wide community support
- No vendor lock-in — switching providers (add Discord, GitHub, etc.) is a config change

**Setup decisions:**
- Database session strategy (not JWT) — sessions stored in PostgreSQL, not browser cookies
- Next.js 16 `proxy.ts` (not `middleware.ts`) for route protection — `middleware.ts` is deprecated in Next.js 16
- User model merged Auth.js required fields (`email`, `emailVerified`, `image`, `name`) with our custom fields (`username`)
- `username` is nullable — set during `/onboarding` flow after first Google login
- `authId` field removed (was Supabase-specific); Auth.js uses `Account` join table instead

**Files added:**
- `src/auth.ts` — NextAuth config with Prisma adapter + Google provider
- `src/proxy.ts` — Route protection (redirects unauthenticated users from `/admin/*` to `/login`)
- `src/app/login/page.tsx` — Login page with "Continue with Google" button
- `src/app/login/google-sign-in-button.tsx` — Client component using direct form POST (workaround)
- `src/app/onboarding/page.tsx` — Username setup for new users
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js API route handler
- `src/app/api/user/username/route.ts` — Username set/update endpoint
- `src/components/auth/sign-out-button.tsx` — Client-side sign out button

---

### 2026-03-16 — NextAuth v5 `signIn()` server action broken on Next.js 16

**Problem:** The `signIn()` server action exported from NextAuth v5 (beta.30) throws a `Configuration` error on Next.js 16. The error is: `Cannot destructure property 'href' of 'e.nextUrl' as it is undefined.`

**Root cause:** NextAuth's `signIn` server action in `next-auth/lib/actions.js` calls `createActionURL()` which reads `headers.get("x-forwarded-proto")`. In Next.js 16's server action context, this header is absent, causing the constructed URL to be invalid. The error is then masked as a generic `Configuration` error by `@auth/core`.

**Solution:** Replace the `signIn()` server action with a **client component that POSTs directly** to `/api/auth/signin/google` with a CSRF token fetched from `/api/auth/csrf`. This is the same pattern NextAuth's built-in signin page uses.

**Reference:** https://github.com/nextauthjs/next-auth/issues/13388

**Key files:**
- `src/app/login/google-sign-in-button.tsx` — Client component with direct form POST
- `src/app/login/page.tsx` — Server component that checks session, renders the client button

---

### 2026-03-16 — Vercel env vars: beware of trailing newlines

**Problem:** When piping env var values to `vercel env add` using `echo`, trailing newlines are included in the stored value. This caused `AUTH_GOOGLE_ID` to have `%0A` appended in the OAuth redirect URL, and `AUTH_TRUST_HOST` / `NEXTAUTH_URL` to have `\n` suffixes.

**Solution:** Always use `printf '%s' "$VALUE"` instead of `echo "$VALUE"` when piping to `vercel env add`. The `printf '%s'` avoids adding a trailing newline.

```bash
# WRONG — adds trailing newline
echo "$VALUE" | vercel env add KEY production --force

# CORRECT — no trailing newline
printf '%s' "$VALUE" | vercel env add KEY production --force
```

---

### 2026-03-16 — Neon PostgreSQL + Prisma: use directUrl for non-pooled connections

**Problem:** Neon's pooled connection (pgbouncer) doesn't support Prisma's prepared statements, causing adapter failures.

**Solution:** In `prisma/schema.prisma`, use `directUrl` alongside `url`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // Pooled URL with ?pgbouncer=true
  directUrl = env("DIRECT_DATABASE_URL") // Direct URL (non-pooled)
}
```
The pooled URL (with `-pooler` in hostname) gets `?pgbouncer=true` appended. The direct URL removes `-pooler` from the hostname.

---

### 2026-03-17 — Design System: M2.5 normalization complete

**Area:** Frontend / Design System

Full design system normalization pass completed across all pages and deck builder components:

- Removed all broken CSS variable references (`--surface-0`, `--accent`, `--border-subtle`) that were removed in M2.5 token redesign but still referenced in page files
- Applied `font-display` (Barlow Condensed) to page titles, deck name in header, and card name in inspect modal — the font was loaded but never applied
- Fixed touch targets throughout deck builder (h-7 → h-9 minimum, 36px)
- Removed colored `border-l` from deck builder list rows (was JS-driven inline style)
- Removed strokes from all card images
- Consistent `rounded` (4px) for deck builder cards, `rounded-lg` (12px) for card database cards

---

### 2026-03-17 — Deck Builder: Tabs + larger leader card

**Area:** Frontend / Deck Builder

Deck builder right panel refactored to use Radix UI tabs:
- **Cards tab** (default): large `w-48` leader card (clickable → inspect modal with art variant support), compact inline validation tags (X/50 + rule pills, no heading), card list
- **Stats tab**: cost curve (taller, 120px) + color breakdown

Leader art variant selection stored in local `leaderSelectedArtUrl` state — not yet persisted to DB. This is a known gap for a future session.

---

### 2026-03-17 — Images: Hotlinking from onepiece-cardgame.com causes failures

**Area:** Infrastructure / Images

Card images were hotlinked directly from `en.onepiece-cardgame.com`. This caused intermittent `ERR_BLOCKED_BY_RESPONSE.NotSameSite` failures in production due to the site's CORS/CORP headers. Fix: self-host on Cloudflare R2.

**Migration:** `pipeline/migrate-images.ts` — downloads all card/variant images from DB source URLs, uploads to R2, updates DB with CDN URLs. Resumable (skips already-migrated). Run after each new set import.

**Key gotcha:** `NEXT_PUBLIC_*` env vars are baked into the Next.js bundle at build time — changing them in Vercel requires a fresh build (push a commit), not just a redeploy.

**Key gotcha:** The migration script connects to whatever `DATABASE_URL` is in `.env`. Make sure local `.env` points to the same database as production (Neon), otherwise the migration updates the wrong DB.

---

### 2026-03-18 — Images: Cloudflare R2 public URL has CORP: same-origin by default

**Area:** Infrastructure / Images

Cloudflare R2's public development URL (`pub-*.r2.dev`) serves objects with `Cross-Origin-Resource-Policy: same-origin`. This blocks cross-origin image loads (browser throws `ERR_BLOCKED_BY_RESPONSE.NotSameSite`).

**Fix:** A Cloudflare Worker (`workers/images/`) that proxies R2 and sets:
- `Cross-Origin-Resource-Policy: cross-origin`
- `Access-Control-Allow-Origin: *`
- `Cache-Control: public, max-age=31536000, immutable`

Worker URL: `https://optcg-images.corymcunanan.workers.dev`
Deploy: `pnpm worker:deploy` (from project root)

**Note:** S3 `Metadata` fields are returned as `x-amz-meta-*` headers — they do NOT map to actual HTTP response headers like CORP. The only way to set CORP on R2 objects is via a Worker or Transform Rule on a custom domain.

---

### 2026-03-18 — Build: Exclude workers/ from root tsconfig

**Area:** Build / TypeScript

The `workers/images/src/index.ts` file uses Cloudflare Worker types (`R2Bucket`) which aren't available in the Next.js build. Next.js's `tsc` picks up all `**/*.ts` files by default, causing a build failure.

**Fix:** Add `"workers"` to the `exclude` array in `tsconfig.json`. The worker has its own `tsconfig.json` with `@cloudflare/workers-types`.

### 2026-03-18 — Research: Rive evaluated for game board UI, deferred to M5

**Area:** Game Simulator / Frontend

Investigated Rive (rive.app) as an alternative to React + Framer Motion for the M3 game board. Full findings in `docs/research/RIVE-INVESTIGATION.md`.

**Key takeaways:**
- Rive's animation ceiling is genuinely higher for specific game elements (card flip, attack VFX, damage bursts) — bone rigs, mesh deforms, blend states that Framer Motion can't match
- But it's the wrong tool for the DOM-based game board layer: no dynamic layout, no native drag-and-drop, canvas-only text, and no production web TCG examples to validate the approach
- Bundle cost: ~648 KB (webgl2) vs. ~100 KB for Framer Motion
- Multiple cards on a board require `useOffscreenRenderer: true` to avoid browser WebGL context limits
- Authoring workflow (Rive editor → export → deploy) breaks fast iteration critical for M3/M4
- The right hybrid is: React/HTML for board layout + UI chrome, Rive canvases as absolutely-positioned overlays for specific animations

**Decision:** Proceed with Framer Motion for M3 and M4. Revisit Rive at M5 (Polish & Scale) for high-impact animated moments.

### 2026-03-18 — M2 Social Layer: DB + REST API + basic UI complete

**Area:** M2 Social / Backend + Frontend

M2 social layer foundation built (no WebSocket yet — REST-only MVP):

**Schema (prisma/schema.prisma):**
- `FriendRequest` (PENDING/ACCEPTED/DECLINED)
- `Friendship` (stored with userA < userB lexicographically to prevent duplicates)
- `Message` (1:1, with `read` flag and index on `(fromUserId, toUserId, createdAt)`)
- `Lobby` + `LobbyGuest` + `LobbyInvite` (with WAITING/READY/IN_GAME/CLOSED lifecycle)
- All enums: `FriendRequestStatus`, `LobbyVisibility`, `LobbyStatus`, `LobbyInviteStatus`

**API routes built:**
- `GET/POST /api/friends/requests` — list + send friend requests
- `PUT /api/friends/requests/[id]` — accept/decline
- `GET /api/friends` — list friends
- `DELETE /api/friends/[userId]` — remove friend
- `GET /api/users/search?q=` — search users by username
- `GET/POST /api/messages/conversations` — list conversations
- `GET/POST /api/messages/[userId]` — message history + send message
- `PUT /api/messages/[messageId]/read` — mark as read
- `GET/POST /api/lobbies` — list public + create
- `GET/DELETE /api/lobbies/[id]` — get + close
- `POST /api/lobbies/[id]/join` — join with deck selection
- `POST /api/lobbies/[id]/invite` — invite friend
- `PUT /api/lobbies/[id]/invite/[inviteId]` — accept/decline invite
- `POST /api/lobbies/[id]/start` — start game (M3 stub)

**UI pages (`/social/`):**
- `/social/friends` — friend search, request inbox, friend list, remove
- `/social/messages` — conversation list; `/social/messages/[userId]` — chat window
- `/social/lobbies` — browse public lobbies, create lobby, join with deck selection

**Deferred to M2 follow-up:** WebSocket infrastructure (Socket.io) for real-time message delivery, presence system (online/in-game status), lobby browser auto-refresh. Current implementation is REST-only (polling or manual refresh).

---

### 2026-03-18 — Deck Builder: Leader art URL persisted to DB

**Area:** Deck Builder / Data Model

Added `leaderArtUrl String?` to the `Deck` Prisma model. When a user selects an art variant for their leader card, the URL is now saved on every deck save and restored when loading. Previously it was local state only (`leaderSelectedArtUrl` in deck-builder-shell.tsx), lost on page refresh.

**Changes:** `prisma/schema.prisma` (new field), `api/decks/route.ts` (POST accepts `leaderArtUrl`), `api/decks/[id]/route.ts` (GET returns it, PUT accepts it), `deck-builder-shell.tsx` (save includes it, load restores it).

---

### 2026-03-18 — Admin UI: Design system normalization complete

**Area:** Frontend / Admin UI

Full normalization pass across all admin components and pages:

- Replaced all `var(--surface-0)`, `var(--teal)`, `var(--sage)`, `var(--sage-muted)`, `var(--accent)`, `var(--accent-soft)`, `var(--border-subtle)` references — these were from the old dark theme and no longer exist in the token system.
- Token mapping: `--accent` → `bg-navy-900`/`text-navy-900`, `--teal` → navy, `--sage` → `text-navy-700`, `--border-subtle` → `border-border`, `--surface-0` → `bg-background`
- Removed all inline `style={{}}` for design properties — replaced with Tailwind utilities
- Replaced `text-[11px]`/`text-[10px]` with `text-xs` (12px minimum)
- Fixed off-scale spacing: `py-1.5` → `py-1`/`py-2`, `px-2.5` → `px-3`, `gap-1.5` → `gap-2`, etc.
- Replaced hardcoded `#fff`/`#222` in color filter buttons with `var(--text-inverse)`/`var(--text-primary)`
- Admin nav updated to navy-900 background with white text, gold "Add Card" button — matches design direction
- Hardcoded oklch values in error/success banners replaced with `bg-error-soft`/`bg-success-soft` tokens
- `cn()` utility added to all admin components that need conditional classes

**Note on TCG color buttons:** Color filter/toggle buttons still use `style={{}}` with CSS variable tokens (e.g. `var(--card-red)`) for the active state background — this is intentional and allowed per CLAUDE.md since these are dynamic values that can't be expressed as static Tailwind classes.

### 2026-03-18 — Auth: Credentials provider requires JWT session strategy

**Area:** Authentication

Adding email/password login alongside Google OAuth requires switching NextAuth's session strategy from `"database"` to `"jwt"`. The Credentials provider doesn't create OAuth account records, so the database session adapter path doesn't apply.

**Key changes:**
- `session: { strategy: "jwt" }` added to NextAuth config
- `jwt` callback now carries `username` on the token (set once on first sign-in from user record)
- `session` callback reads `token.sub` (auto-set by NextAuth to `user.id`) instead of `user.id`
- `PrismaAdapter` stays in place — still used for OAuth account/user creation; `sessions` table is unused with JWT but that's fine
- `declare module "next-auth/jwt"` augmentation throws a TS error on this version — extend JWT type inline instead

**Registration flow:** `POST /api/auth/register` creates the user record with `bcrypt.hash(password, 12)`. After success, the client calls `signIn("credentials", { redirect: false })` and manually redirects on `result.url`. Doing `redirect: true` in client components swallows errors.

**Important:** `signIn("credentials")` from `next-auth/react` (client-side) works fine in this version. Only the **server action** form of `signIn()` is broken on Next.js 16 (see earlier entry on the CSRF/URL issue).

---

### 2026-03-18 — Next.js: Sibling dynamic route segments must use the same name

**Area:** Next.js / Routing

The social messages API had two routes at the same level with different param names:
- `src/app/api/messages/[userId]/route.ts`
- `src/app/api/messages/[messageId]/read/route.ts`

Next.js throws `You cannot use different slug names for the same dynamic path ('messageId' !== 'userId')` at startup and refuses to build.

**Fix:** Move the conflicting route to a non-dynamic path. Refactored to `GET/PUT /api/messages/read?messageId=...` (query param instead of path segment). Literal path segments (e.g. `read`) always take precedence over dynamic ones, so there's no conflict.

**Rule:** All dynamic segments at the same directory level must use the same name across the entire subtree. Different names = build error.

---

### 2026-03-18 — Social: Persistent sidebar + floating chat widget architecture

**Area:** Frontend / Social Layer

All social management consolidated into a persistent right-side panel rather than dedicated pages. The architecture:

**`SocialShell` (client component in root layout):**
- Owns `collapsed: boolean` and `chatUser: SidebarUser | null` state
- Renders `SocialSidebar` + `ChatWidget` as siblings
- Lifting state here means the chat widget always knows the correct `right` offset when the sidebar collapses

**`SocialSidebar` (`w-64`, `bg-navy-900`, sticky):**
- Two modes: Friends (people icon) and Play (swords icon), toggled in header
- Friends mode: inline add-friend search, pending requests, friend list
- Play mode: lobby invites, active lobby status, create lobby form, open lobbies list
- Friend rows are `<button onClick={() => onOpenChat(user)}>` — no navigation
- Collapses to `w-10` icon strip; badge count persists in collapsed state

**`ChatWidget` (fixed, `bottom-0`, `w-80`):**
- Positioned `right-64` or `right-10` depending on sidebar state — always flush against the sidebar's left edge
- Minimizes to header bar only on click; close button removes from DOM entirely
- Fetches message history from `GET /api/messages/[userId]` on mount; sends via `POST`
- `border-b-0` on the container prevents a double border at the bottom viewport edge

**Why no Context/Zustand:** State only needs to flow between sidebar and widget, both rendered in the same parent component. Lifting to `SocialShell` is sufficient and avoids the overhead of a context provider for two consumers.

**`GET /api/lobbies/status`:** Single combined endpoint returning `{ invites, myLobby, openLobbies }` — avoids three separate fetches from the sidebar on every poll interval.

---

<!-- Add new entries above this line -->
