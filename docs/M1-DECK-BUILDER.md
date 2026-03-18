# M1 — Deck Builder

> Card search, deck editing with rule validation, bulk import/export, and per-user deck persistence.

---

## Scope

M1 delivers a fully functional deck builder — the first real user-facing feature. Users can search the card database, build OPTCG-legal decks with real-time validation, import/export deck lists, and save/load decks to their account.

### Deliverables

- [ ] Card search API with filtering, sorting, and pagination
- [ ] Card search UI with instant results and filter panel
- [ ] Deck editor with real-time rule validation
- [ ] Cost curve and color breakdown visualizations
- [ ] Bulk import (paste `Nx CARDID` format) and bulk export
- [ ] Deck save/load per user account (named, timestamped)
- [ ] Mobile-responsive layout for deck builder

---

## Architecture (M1-Specific)

```
┌─────────────────────────────────────────────────────────┐
│   Next.js App                                           │
│                                                         │
│  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │ Card Search    │  │ Deck Editor                   │  │
│  │ • Query input  │  │ • Card list (main deck)       │  │
│  │ • Filter panel │  │ • Leader slot                 │  │
│  │ • Result grid  │  │ • Validation panel            │  │
│  │                │  │ • Cost curve chart             │  │
│  │                │  │ • Color breakdown              │  │
│  │                │  │ • Import/Export modals          │  │
│  └────────┬───────┘  └──────────────┬────────────────┘  │
│           │                         │                    │
└───────────┼─────────────────────────┼────────────────────┘
            │ GET /api/cards          │ POST/PUT/GET /api/decks
            │                         │
┌───────────▼─────────────────────────▼────────────────────┐
│   API Routes                                              │
│   • GET  /api/cards?q=&color=&type=&cost=&...            │
│   • GET  /api/decks                                       │
│   • POST /api/decks                                       │
│   • PUT  /api/decks/:id                                   │
│   • DEL  /api/decks/:id                                   │
│   • POST /api/decks/import                                │
│   • GET  /api/decks/:id/export                            │
└───────────┬──────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────┐
│   PostgreSQL                                              │
│   cards, decks, deck_cards (from M0 schema)              │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### 1. Card Search API

**Endpoint:** `GET /api/cards`

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Full-text search on card name |
| `color` | string[] | Filter by color(s) — OR logic |
| `type` | enum | Leader, Character, Event, Stage |
| `costMin` | int | Minimum cost |
| `costMax` | int | Maximum cost |
| `powerMin` | int | Minimum power |
| `powerMax` | int | Maximum power |
| `counter` | int | Exact counter value |
| `set` | string | Filter by set (e.g. "OP01") |
| `attribute` | string[] | Filter by attribute |
| `traits` | string[] | Filter by traits |
| `banStatus` | enum | LEGAL, BANNED, RESTRICTED |
| `format` | string | Block format legality filter |
| `sort` | string | `name`, `cost`, `power`, `set` |
| `order` | string | `asc`, `desc` |
| `page` | int | Page number (1-indexed) |
| `limit` | int | Results per page (default 20, max 100) |

**Implementation details:**
- Full-text search via PostgreSQL `tsvector` on `Card.name` (created as a generated column or maintained via trigger)
- Array filters (color, traits, attribute) use `@>` (contains) or `&&` (overlaps) operators
- Range filters on cost/power use standard `>=` / `<=`
- Pagination via cursor-based or offset/limit (offset is fine for card databases — total count is bounded)
- Response includes total count for pagination UI

**Response shape:**
```json
{
  "cards": [
    {
      "id": "OP01-001",
      "name": "Monkey.D.Luffy",
      "color": ["Red"],
      "type": "Leader",
      "cost": null,
      "power": 5000,
      "life": 5,
      "imageUrl": "https://cards.optcgsim.com/OP01-001.webp",
      "banStatus": "LEGAL"
    }
  ],
  "total": 118,
  "page": 1,
  "limit": 20
}
```

### 2. Card Search UI

**Components:**

| Component | Responsibility |
|-----------|---------------|
| `SearchBar` | Debounced text input (300ms), triggers search |
| `FilterPanel` | Collapsible panel with dropdowns/checkboxes for each filter |
| `CardGrid` | Responsive grid of card thumbnails with key stats |
| `CardDetail` | Modal or side panel showing full card info, art variants, errata |
| `Pagination` | Page navigation with total count |

**UX details:**
- Search is instant (debounced client-side, server responds fast via indexed queries)
- Filter changes immediately update results (no "Apply" button)
- Card images lazy-load with placeholder blur
- Card hover shows enlarged image + full stats
- Click card in search → adds to deck (if in deck editor mode)

### 3. Deck Editor

**State management:**
- Deck state managed client-side (zustand or jotai)
- Shape: `{ name, leaderId, cards: Map<cardId, quantity>, format }`
- Validation runs on every state change (synchronous, client-side)

**Validation rules (OPTCG deck construction):**

| Rule | Check |
|------|-------|
| Exactly 1 Leader | `leaderId` is set and valid |
| Exactly 50 cards in main deck | Sum of all quantities = 50 |
| Max 4 copies per card ID | Each quantity ≤ 4 |
| Color affinity | All cards share at least one color with the Leader (or satisfy card-specific color rules) |
| Format legality | No cards with `banStatus: BANNED` in selected format; restricted cards ≤ allowed count |
| Block rotation | If format is a block format, all cards must be legal in that block |

**Validation panel UI:**
- Green checkmark or red X per rule
- Specific violation messages (e.g. "OP01-025 exceeds 4-copy limit (currently 5)")
- Deck is marked "Valid" or "Invalid" — save is allowed regardless (users may want to save work-in-progress decks)

**Deck editor layout (desktop):**
```
┌──────────────────────────────────────────────────────────┐
│  [Deck Name]                    [Save] [Export] [Import] │
├────────────────────────┬─────────────────────────────────┤
│                        │                                 │
│  Card Search           │  Deck List                      │
│  ┌──────────────┐      │  ┌─────────────────────────┐   │
│  │ Search bar   │      │  │ Leader: [Card]          │   │
│  │ Filters      │      │  │                         │   │
│  │              │      │  │ Main Deck (47/50)       │   │
│  │ Results Grid │      │  │ 4x OP01-004             │   │
│  │              │      │  │ 3x OP01-010             │   │
│  │              │      │  │ ...                     │   │
│  │              │      │  │                         │   │
│  └──────────────┘      │  │ ┌─────────────────────┐│   │
│                        │  │ │ Cost Curve  █ █▓▒   ││   │
│                        │  │ └─────────────────────┘│   │
│                        │  │ ┌─────────────────────┐│   │
│                        │  │ │ Colors: R:20 B:15.. ││   │
│                        │  │ └─────────────────────┘│   │
│                        │  │                         │   │
│                        │  │ Validation: ✅ Valid     │   │
│                        │  └─────────────────────────┘   │
│                        │                                 │
└────────────────────────┴─────────────────────────────────┘
```

### 4. Bulk Import / Export

**Import:**
- Modal with a textarea
- Accepts format: `Nx CARDID` (e.g. `4x OP01-004`), one per line
- Also accepts `CARDID` without quantity (defaults to 1)
- Parser validates card IDs exist in DB
- Invalid lines shown with error messages
- "Import" button applies valid lines to deck state

**Export:**
- Copy to clipboard: deck list in `Nx CARDID` format
- Download as `.txt` file
- Include deck name and leader as header comment

**Export format:**
```
// Deck: Red Luffy Aggro
// Leader: OP01-001
4x OP01-004
4x OP01-006
3x OP01-010
...
```

### 5. Deck Persistence

**API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/decks` | List user's decks (name, leader, card count, updated date) |
| `POST` | `/api/decks` | Create new deck |
| `GET` | `/api/decks/:id` | Get deck with full card list |
| `PUT` | `/api/decks/:id` | Update deck (name, leader, cards) |
| `DELETE` | `/api/decks/:id` | Delete deck |

**Authorization:** All deck endpoints require authentication. Users can only access their own decks (enforced via query filter on `userId`).

**Save behavior:**
- Auto-save on significant changes (debounced 2s) — or manual save button
- Decks stored with `updatedAt` timestamp
- Deck list page shows all saved decks with sort by last modified

---

## Roadmap

| Step | Task | Est. |
|------|------|------|
| 1 | Build card search API endpoint with all filters | 1–2 days |
| 2 | Add full-text search index on card name | 0.5 day |
| 3 | Build SearchBar + FilterPanel components | 1 day |
| 4 | Build CardGrid + CardDetail components | 1 day |
| 5 | Build deck editor state management + validation engine | 1–2 days |
| 6 | Build deck editor UI (list, leader slot, stats panels) | 1–2 days |
| 7 | Build bulk import/export modals | 0.5 day |
| 8 | Build deck CRUD API endpoints | 1 day |
| 9 | Build deck list page (my decks) | 0.5 day |
| 10 | Responsive layout pass (mobile-friendly) | 1 day |
| 11 | Integration testing (search → build → save → reload) | 1 day |

**Total estimate: ~9–12 days**

---

## Acceptance Criteria

- [ ] Card search returns accurate results for all filter combinations
- [ ] Search response time < 200ms for typical queries
- [ ] Deck validation catches all rule violations in real time
- [ ] Bulk import correctly parses `Nx CARDID` format and reports invalid lines
- [ ] Bulk export produces a format that can be re-imported without loss
- [ ] Decks persist across sessions (save → close → reopen → same deck)
- [ ] Deck editor works on mobile (responsive layout, touch-friendly)
- [ ] User cannot access another user's decks

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Full-text search performance degrades with more sets | Slow search UX | Use PostgreSQL GIN index; consider client-side search (load all cards once) if total card count stays < 5,000 |
| Color affinity rules have edge cases from card effects | Invalid validation results | Start with basic "share one color with leader" rule; add card-specific overrides as needed |
| Deck format is ambiguous across communities | Import failures from copy-paste | Support multiple common formats; show clear error messages for unparseable lines |

---

## Dependencies

- M0 complete (auth working, card database populated, DB schema deployed)
- Card images accessible via CDN — **resolved: Cloudflare R2** (see below)

---

## Image Hosting — Cloudflare R2

### Decision (2026-03-17)

Card images were hotlinked from `en.onepiece-cardgame.com`, which caused intermittent loading failures due to rate limiting and request blocking. The fix is to self-host images on **Cloudflare R2**.

**Why R2:**

| Option | Free Tier | Our Usage (~657MB) | Verdict |
|--------|-----------|---------------------|---------|
| Cloudflare R2 | 10 GB storage | ~6.5% | ✅ Comfortable |
| Vercel Blob | 500 MB storage | ~131% | ✗ Over limit |

**Image inventory:**
- Cards: ~2,497 base images
- Art variants: ~1,487 variant images
- Total: ~3,984 images × ~165KB avg = **~657MB**

### Migration Script

`pipeline/migrate-images.ts` — downloads all images from their current `imageUrl` in the DB, uploads to R2, and updates the DB with CDN URLs.

**Setup:**
1. Create an R2 bucket at [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → Create bucket
2. Create an API token with `Object Read & Write` on your bucket
3. Enable public access on the bucket (or use a custom domain)
4. Fill in `.env` from `.env.example`:
   ```
   R2_ACCOUNT_ID=your-account-id
   R2_ACCESS_KEY_ID=your-key-id
   R2_SECRET_ACCESS_KEY=your-secret
   R2_BUCKET_NAME=optcg-images
   NEXT_PUBLIC_CDN_URL=https://pub-<bucket-id>.r2.dev
   ```
5. Run a dry run to verify config: `pnpm pipeline:migrate-images --dry-run`
6. Run migration: `pnpm pipeline:migrate-images`

**Script features:**
- **Resumable** — images already on R2 or CDN are skipped
- **Concurrent** — 5 parallel uploads by default (`--concurrency <n>`)
- **Retry logic** — 3 attempts with backoff on transient failures
- **Dry run** — `--dry-run` shows what would happen without writing anything
- **Partial run** — `--limit <n>` for batched migration

**Key behaviors:**
- Cards stored at `cards/<id>.webp`, variants at `variants/<id>.webp`
- `Cache-Control: public, max-age=31536000, immutable` — images are permanently cached
- Updates `Card.imageUrl` and `ArtVariant.imageUrl` in DB after successful upload
- For new set imports, run `pipeline:import` (which populates hotlinked URLs), then run `pipeline:migrate-images` to move new images to R2

---

_Last updated: 2026-03-17_
