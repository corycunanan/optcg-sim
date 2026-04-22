# Architecture Overview

> System architecture for the OPTCG Simulator. Updated as design decisions are made.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Next.js)                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Auth UI  │  │ Deck     │  │ Social   │  │ Game Board │ │
│  │          │  │ Builder  │  │ (Friends,│  │ (Simulator)│ │
│  │          │  │          │  │ Lobbies, │  │            │ │
│  │          │  │          │  │ Chat)    │  │            │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘ │
│       │              │             │               │        │
└───────┼──────────────┼─────────────┼───────────────┼────────┘
        │ REST         │ REST        │ REST +        │ WebSocket
        │              │             │ WebSocket     │
┌───────▼──────────────▼─────────────▼───────────────▼────────┐
│                     API Layer                                │
│                                                              │
│  ┌──────────────────────┐    ┌─────────────────────────────┐│
│  │   REST API Server    │    │      Game Server             ││
│  │                      │    │                              ││
│  │  • Auth endpoints    │    │  • Game state machine        ││
│  │  • Card search/CRUD  │    │  • Turn phase enforcement    ││
│  │  • Deck CRUD         │    │  • Effect engine             ││
│  │  • Friend mgmt       │    │  • Action validation         ││
│  │  • Messaging         │    │  • WebSocket session mgmt    ││
│  │  • Lobby mgmt        │    │  • Reconnection handling     ││
│  └──────────┬───────────┘    └──────────────┬───────────────┘│
│             │                               │                │
└─────────────┼───────────────────────────────┼────────────────┘
              │                               │
┌─────────────▼───────────────────────────────▼────────────────┐
│                      Data Layer                               │
│                                                               │
│  ┌─────────────────────┐    ┌──────────────────────────────┐ │
│  │   PostgreSQL         │    │   Object Storage (R2/S3)     │ │
│  │                      │    │                              │ │
│  │  • users             │    │  • Card images               │ │
│  │  • cards             │    │  • Art variant images         │ │
│  │  • decks             │    │  • Raw HTML snapshots         │ │
│  │  • deck_cards        │    │                              │ │
│  │  • friends           │    └──────────────┬───────────────┘ │
│  │  • messages          │                   │                 │
│  │  • lobbies           │    ┌──────────────▼───────────────┐ │
│  │  • game_sessions     │    │   CDN (Cloudflare)           │ │
│  │  • game_actions      │    │   Serves card images         │ │
│  └─────────────────────┘    └──────────────────────────────┘ │
│                                                               │
└───────────────────────────────────────────────────────────────┘
              ▲
              │
┌─────────────┴───────────────────────────────────────────────┐
│                    Data Pipeline                             │
│                                                              │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌────────┐   │
│  │ vegapull │─▶│ Transform │─▶│ Classify  │─▶│ Write  │   │
│  │ (Rust   │  │ + Sanitize│  │ variants  │  │ (DB +  │   │
│  │  CLI)   │  │           │  │ + sets    │  │ images)│   │
│  └──────┬──┘  └───────────┘  └───────────┘  └────────┘   │
│         │                          │                        │
│  ┌──────▼──┐            ┌──────────▼──────────┐            │
│  │  JSON + │            │  Art Variant Grouping│            │
│  │  Images │            │  + Cross-Set Merge   │            │
│  └─────────┘            │  + Reprint Detection │            │
│                         └─────────────────────┘            │
│                                                              │
│  Mode A: vegapull direct (confirmed working 2026-03-16)      │
│  Mode B: punk-records fallback (through OP-09)               │
│  Triggered: manually or via GitHub Actions cron              │
└──────────────────────────────────────────────────────────────┘
```

---

## Service Boundaries

### Client (Next.js)

The frontend is a single Next.js application with distinct feature modules:

| Module | Responsibility | Key Dependencies |
|--------|---------------|-----------------|
| Auth | Login/logout, session display, profile setup | NextAuth v5 (Google OAuth + email/password) |
| Deck Builder | Card search, deck editing, validation, import/export | REST API, local state management |
| Social | Friends list, messaging, lobby browser | REST API + WebSocket |
| Game Board | Game rendering, player actions, effect resolution UI | WebSocket (real-time sync) |

All modules share a common layout, auth context, and design system.

### REST API Server

Handles all non-realtime CRUD operations:

- **Auth** — session validation, profile CRUD, JWT verification
- **Cards** — search, filter, paginated listing (read-only for users)
- **Decks** — CRUD, validation, bulk import/export
- **Friends** — request/accept/decline, list with online status
- **Messages** — send/receive, conversation history
- **Lobbies** — create, join, list, invite

Deployed as Next.js API routes on Vercel.

### Game Server — Cloudflare Workers + Durable Objects

Stateful game sessions running on Cloudflare's edge network:

- Each `GameSession` is a Durable Object with its own WebSocket connections and SQLite persistence
- Full game rules engine: 7-step action pipeline, effect resolver with 50+ action handlers, trigger system, modifier layers
- 51 card schema sets loaded via `schema-registry.ts` for automated effect resolution
- Validates every player action against the rules engine before applying
- Broadcasts state updates to both players via native WebSocket
- Handles reconnection (Durable Object holds state; client re-syncs)
- Hibernation support — idle sessions release compute while retaining state

**Config:** `workers/game/wrangler.toml` — compatibility date 2024-01-01, nodejs_compat

### Data Pipeline

A separate process (TypeScript) that populates and updates the card database:

- Runs on demand or on a cron schedule (GitHub Actions)
- Invokes vegapull CLI to scrape the official OPTCG site (JSON output)
- Transforms JSON → Prisma schema, classifies art variants and reprints
- Writes structured card data to PostgreSQL
- Downloads card images to local storage / object storage
- Handles cross-set card membership (many-to-many Card ↔ Set)

---

## Data Flow

### Deck Builder Flow

```
User types search query
  → Client debounces (300ms)
  → GET /api/cards?q=luffy&color=red&cost=3-5
  → API queries PostgreSQL with filters
  → Returns paginated card results
  → Client renders card grid

User adds card to deck
  → Client validates locally (count, color, format legality)
  → Deck state updated in client
  → Validation panel re-renders

User saves deck
  → POST /api/decks { name, leader_id, cards: [...] }
  → API validates server-side (duplicate check, rule compliance)
  → Writes to decks + deck_cards tables
  → Returns deck ID
```

### Game Session Flow

```
Host creates lobby → POST /api/lobbies
Opponent joins     → POST /api/lobbies/:id/join
Both ready         → Server creates GameState, opens WebSocket room

Turn loop:
  Server sends phase prompt → Client renders available actions
  Player acts               → Client sends GameAction via WebSocket
  Server validates action   → If invalid: reject + error message
                            → If valid: apply to GameState
  Server broadcasts new state → Both clients render updated board
  Effect triggers?           → Server pushes effect resolution prompts
  Player responds to prompt  → Server resolves effect, updates state

Game ends:
  Win condition met → Server broadcasts game_over event
  Both clients show result screen
  Server persists final game log to DB
```

### Real-time Messaging Flow

```
User sends message → WebSocket emit("message", { to, body })
Server validates sender/recipient are friends
Server persists message to DB
Server pushes message to recipient's WebSocket (if connected)
If offline → message stored; delivered on next connect
```

---

## Deployment Topology

```
┌─────────────────────┐     ┌──────────────────────────┐
│   Vercel             │     │   Cloudflare Workers      │
│                      │     │                           │
│   Next.js Frontend   │     │   Game Server (DO)        │
│   + API Routes       │────▶│   (WebSocket, stateful    │
│                      │     │    Durable Objects)        │
└──────────┬───────────┘     │                           │
           │                 │   Image CDN Worker         │
           │                 │   (R2 → CORS delivery)     │
           │                 └───────────┬────────────────┘
           │                             │
           │         ┌───────────────────┘
           │         │
┌──────────▼─────────▼────────┐   ┌────────────────────┐
│   Neon                       │   │   Cloudflare R2     │
│   (PostgreSQL, branched)     │   │   (Card images)     │
└──────────────────────────────┘   └────────────────────┘

┌──────────────────────────────┐
│   GitHub Actions              │
│   (Data pipeline cron)        │
└──────────────────────────────┘
```

### Environment Strategy

| Environment | Purpose | Infrastructure |
|------------|---------|---------------|
| Development | Local dev | Next.js dev server, Neon `dev` branch, `wrangler dev` for game worker |
| Staging | Pre-release testing | Vercel preview deploys, Cloudflare Workers (preview) |
| Production | Live | Vercel production, Neon `main` branch, Cloudflare Workers (game + images) |

---

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Cloudflare Durable Objects for game server | Game sessions are stateful and long-running; Durable Objects provide persistent WebSocket connections, in-memory state, and SQLite persistence without managing servers |
| PostgreSQL over NoSQL | Card data is highly relational (cards ↔ sets, decks ↔ cards, users ↔ friends); SQL queries power the deck builder filters efficiently |
| Prisma as ORM | Type-safe database access, migration management, good Next.js ecosystem fit |
| WebSocket over SSE for games | Bidirectional communication needed — both players send actions and receive state |
| CDN for card images | Cards are static assets; serving via CDN reduces load and latency |
| vegapull for data sourcing | Rust CLI that solved the cookie/auth problem; confirmed working 2026-03-16; replaces custom scraper and Python pipeline |
| TypeScript for data pipeline | Same language as the app; no Python dependency needed since we're transforming JSON not scraping HTML |
| Card ↔ Set as many-to-many | 575 cards appear in multiple packs; single `set` field insufficient for cross-set queryability and reprint filtering |
| `originSet` derived from card ID prefix | Card ID prefix (e.g. OP01 from OP01-001) reliably indicates first printing; more reliable than pack metadata |
| `blockNumber` from vegapull | Auto-populated integer eliminates manual block rotation maintenance |
| Admin UI in M0 (not just verification page) | Database needs ongoing maintenance (ban lists, errata, manual corrections); visual tool pays for itself across all milestones |
| Effect schema as JSON | Machine-readable format lets the game engine resolve effects programmatically without parsing natural language at runtime |

---

_Last updated: 2026-04-08_
