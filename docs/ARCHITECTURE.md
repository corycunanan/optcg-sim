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
│  ┌──────┐   ┌───────┐   ┌───────────┐   ┌──────┐   ┌─────┐│
│  │Fetch │──▶│ Parse │──▶│ Normalize │──▶│ Diff │──▶│Write││
│  │(HTML)│   │       │   │           │   │      │   │(DB) ││
│  └──────┘   └───────┘   └───────────┘   └──────┘   └─────┘│
│                                │                            │
│                    ┌───────────▼──────────┐                 │
│                    │  Effect Translator   │                 │
│                    │  (Manual → LLM)      │                 │
│                    └─────────────────────┘                  │
│                                                              │
│  Triggered: manually or via GitHub Actions cron              │
└──────────────────────────────────────────────────────────────┘
```

---

## Service Boundaries

### Client (Next.js)

The frontend is a single Next.js application with distinct feature modules:

| Module | Responsibility | Key Dependencies |
|--------|---------------|-----------------|
| Auth | Login/logout, session display, profile setup | Firebase/Supabase Auth SDK |
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

Deployed as Next.js API routes (Vercel) or a standalone Node/Fastify server (Railway/Fly.io) depending on performance needs.

### Game Server

A dedicated long-running process that manages active game sessions:

- Maintains in-memory `GameState` for each active game
- Validates every player action against the rules engine before applying
- Broadcasts state updates to both players via WebSocket
- Handles reconnection (state held server-side; client re-syncs)
- Logs all actions for potential replay

**This cannot run on Vercel** (serverless functions have execution time limits). It runs on Railway or Fly.io as a persistent process.

### Data Pipeline

A separate process (Python) that populates and updates the card database:

- Runs on demand or on a cron schedule (GitHub Actions)
- Fetches from the official OPTCG site (HTML scraping) or community data sources
- Writes structured card data to PostgreSQL
- Uploads card images to object storage
- Generates `effectSchema` JSON (manual in M0–M3, LLM-assisted in M4+)

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
┌─────────────────────┐     ┌──────────────────────┐
│   Vercel             │     │   Railway / Fly.io    │
│                      │     │                       │
│   Next.js Frontend   │     │   Game Server          │
│   + API Routes       │────▶│   (WebSocket, long-    │
│                      │     │    running process)     │
└──────────┬───────────┘     └───────────┬────────────┘
           │                             │
           │         ┌───────────────────┘
           │         │
┌──────────▼─────────▼────────┐   ┌────────────────────┐
│   Supabase / Neon            │   │   Cloudflare R2     │
│   (PostgreSQL)               │   │   + CDN             │
│                              │   │   (Card images)     │
└──────────────────────────────┘   └────────────────────┘

┌──────────────────────────────┐
│   GitHub Actions              │
│   (Data pipeline cron)        │
└──────────────────────────────┘
```

### Environment Strategy

| Environment | Purpose | Infrastructure |
|------------|---------|---------------|
| Development | Local dev | Next.js dev server, local/Supabase DB, mock WebSocket |
| Staging | Pre-release testing | Vercel preview deploys, staging DB, staging game server |
| Production | Live | Vercel production, production DB, production game server |

---

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Separate game server from API | Game sessions are stateful and long-running; serverless functions can't hold WebSocket connections or in-memory game state |
| PostgreSQL over NoSQL | Card data is highly relational (cards ↔ sets, decks ↔ cards, users ↔ friends); SQL queries power the deck builder filters efficiently |
| Prisma as ORM | Type-safe database access, migration management, good Next.js ecosystem fit |
| WebSocket over SSE for games | Bidirectional communication needed — both players send actions and receive state |
| CDN for card images | Cards are static assets; serving via CDN reduces load and latency |
| Python for data pipeline | Better scraping ecosystem (Playwright, BeautifulSoup); runs independently from the app |
| Effect schema as JSON | Machine-readable format lets the game engine resolve effects programmatically without parsing natural language at runtime |

---

_Last updated: 2026-03-15_
