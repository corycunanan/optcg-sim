# PRD: One Piece Trading Card Game Simulator

**Status:** Draft
**Created:** 2026-03-15
**Owner:** Cory Cunanan

---

## Changelog

| Date | Author | Change |
|---|---|---|
| 2026-03-15 | Cory Cunanan | Initial PRD draft created — auth, deck builder, social, simulator, data pipeline, effect schema, architecture, milestones |
| 2026-03-16 | Cory Cunanan | vegapull confirmed working; full dataset (51 packs, 4,346 entries, 2,496 unique cards) pulled successfully. Updated data model: Card ↔ Set many-to-many via CardSet join table, `originSet` + `blockNumber` fields, `_p`/`_r` variant classification. Admin UI added to M0 scope. Python pipeline replaced with TypeScript. Reprint filter feature added. |

---

## Overview

A full-featured web application for playing the One Piece Trading Card Game (OPTCG) online. The product includes a card database with a data pipeline, a deck builder, social features, and a rules-compliant game simulator.

---

## Goals

- Allow players to build and manage OPTCG-legal decks online
- Simulate real OPTCG games with full rules enforcement, including card effects, timing, and interruptions
- Enable social play via friends, messaging, and game lobbies
- Maintain an up-to-date card database with metadata (art variants, erratas, ban list, block rotation)

---

## User Stories

### Authentication
- As a user, I can sign in with Google so I don't need to manage a separate password
- As a user, my decks, friends, and game history persist across sessions

### Deck Builder
- As a user, I can search and filter the full card database by name, color, type, cost, power, set, and other attributes
- As a user, I can create and edit OPTCG-legal decks, with real-time validation against OPTCG deck construction rules
- As a user, I can bulk import a deck via a text list (e.g. `4x OP01-001`) or bulk create from clipboard
- As a user, I can save multiple decks and pick one to bring into the simulator

### Social
- As a user, I can find and friend other players by username
- As a user, I can message friends directly
- As a user, I can create a lobby and invite friends to a game
- As a user, I can join an open lobby or accept an invite

### Simulator
- As a user, I can play a full OPTCG game against another user with the rules enforced by the engine
- As a user, card effects are resolved automatically where possible; ambiguous interactions prompt me to make choices
- As a user, I can view game logs, undo steps within permitted windows, and forfeit or concede

---

## Feature Specifications

### 1. Authentication

- **Provider:** Google OAuth 2.0 (via Firebase Auth or Supabase Auth)
- **Session:** JWT or cookie-based; auto-refresh
- **Profile:** username (set on first login), avatar (pulled from Google or uploadable), stats

---

### 2. Card Database

#### 2a. Data Model (per card)

```
Card {
  id:             string        // e.g. "OP01-001" (base ID, no suffix)
  originSet:      string        // e.g. "OP-01" — derived from card ID prefix (first printing)
  name:           string        // e.g. "Monkey.D.Luffy"
  color:          string[]      // Red, Blue, Green, Purple, Black, Yellow
  type:           enum          // Leader, Character, Event, Stage
  cost:           int | null
  power:          int | null
  counter:        int | null
  attribute:      string[]      // Strike, Slash, Ranged, Special, Wisdom
  life:           int | null    // Leader only
  traits:         string[]      // e.g. ["Straw Hat Crew"]
  rarity:         string        // Common, Uncommon, Rare, SuperRare, SecretRare, etc.
  effectText:     string        // Raw printed text
  triggerText:    string | null
  effectSchema:   EffectSchema  // Parsed JSON (see section 6)
  blockNumber:    int           // Block rotation (1, 2, 3, 4) — auto-populated from vegapull
  artVariants:    ArtVariant[]
  errata:         Errata[]
  cardSets:       CardSet[]     // All sets/packs this card appears in
  banStatus:      enum          // Legal, Banned, Restricted
  imageUrl:       string
}

CardSet {
  packId:       string          // vegapull pack ID (e.g. "569101")
  setLabel:     string          // Human-readable (e.g. "OP-01")
  setName:      string          // Full name (e.g. "ROMANCE DAWN")
  isOrigin:     boolean         // True if this is the card's first printing
}

ArtVariant {
  variantId:    string          // Full vegapull ID (e.g. "OP01-001_p1")
  label:        string          // e.g. "Parallel", "SEC", "Treasure", "Promo"
  rarity:       string          // Rarity of this specific variant
  imageUrl:     string
  set:          string
}

Errata {
  date:         date
  description:  string
  effectText:   string          // Updated text post-errata
}
```

#### 2b. Data Pipeline

**Primary approach — vegapull (Rust CLI) + TypeScript import pipeline:**
- **vegapull** (https://github.com/coko7/vegapull) — Rust CLI that scrapes the official OPTCG site. Confirmed working 2026-03-16. Produces structured JSON with card metadata, images, and block rotation data.
- Run `vega pull -o <dir> cards <pack_id>` per pack (non-interactive mode)
- TypeScript import pipeline transforms vegapull JSON → Prisma schema and upserts to PostgreSQL
- Image download via `--with-images` flag; uploaded to R2/CDN
- Full pull: ~4.5 minutes for 51 packs, 4,346 card entries

**Key data pipeline capabilities:**
- Art variant classification: `_p` suffixes → ArtVariant records (different art), `_r` suffixes → CardSet entries (reprints, same art)
- Cross-set merging: 575 cards appear in 2+ packs; Card ↔ Set many-to-many via CardSet join table
- Reprint filtering: `originSet` derived from card ID prefix (e.g. OP01-001 → OP-01); option to show cards only in origin set
- Block rotation: `block_number` field auto-populated from vegapull (no manual maintenance)

**Fallback / supplementary sources:**
- **punk-records** (https://github.com/buhbbl/punk-records) — prefetched JSON dataset; coverage through OP-09
- Manual entry via database admin UI for cards vegapull misses

**Pipeline steps:**
1. **Pull** — Run vegapull per pack with retry logic
2. **Transform** — Map fields, decode HTML entities, classify variants
3. **Merge** — Build Card ↔ Set membership, group art variants, detect reprints
4. **Write** — Upsert cards + variants + set membership to PostgreSQL via Prisma
5. **Download images** — Fetch card images → local/R2
6. **Verify** — Count cards, spot-check known cards

**Storage:**
- Card records: PostgreSQL (Supabase) with Card, CardSet, ArtVariant tables
- Card images: local storage (dev) → Cloudflare R2 + CDN (production)

---

### 3. Deck Builder

#### Rules Enforcement (OPTCG deck construction rules)
- Exactly 1 Leader card
- Exactly 50 cards in the main deck
- Max 4 copies of any card with the same card ID (across main deck + DON!! deck is separate)
- Leader and all cards must share at least one color (or satisfy color affinity rules per card effect)
- DON!! deck: always 10 DON!! cards (static, no builder needed — but must be tracked)
- Block rotation enforcement: deck is flagged if any card is illegal in the selected format

#### UI Features
- Card search with instant results (debounced, server-side or client-side depending on DB size)
- Filter panel: color, type, cost range, power range, counter, set, attribute, subtype, format legality
- Sort: by name, cost, power, set number
- Deck list panel with card count, color breakdown, cost curve visualization
- Validation panel: shows all rule violations in real time
- Bulk import modal: paste a deck list in `Nx CARDID` format
- Bulk export: copy deck list to clipboard or download as `.txt`
- Save/load: decks stored per user account, named and timestamped

---

### 4. Social Features

#### Friends
- Search users by exact username
- Send/accept/decline friend requests
- Friend list with online/in-game status

#### Messaging
- Direct messages between friends
- Real-time delivery (WebSocket or SSE)
- Simple text only (no attachments in v1)

#### Lobbies
- Create a lobby: select deck, format (Standard/Block/etc.), visibility (public/invite-only)
- Invite friends directly from lobby
- Public lobby browser: list open lobbies with host name, format, and status
- Spectator mode: friends can watch ongoing games (stretch goal)

---

### 5. Game Simulator

#### Phases & Turn Structure
The engine must enforce the official OPTCG turn sequence:

1. **Refresh Phase** — Rest → Active for all cards; draw up to hand limit (if applicable)
2. **Draw Phase** — Draw 1 card
3. **DON!! Phase** — Attach up to 2 DON!! cards (or per card effects)
4. **Main Phase** — Play Characters, Events, Stages; use Character abilities; attach DON!!
5. **Attack Phase** — Declare attacker; resolve counter window; resolve guard window; apply damage
6. **End Phase** — Return DON!! per rules; discard to hand limit

#### Core Game Objects
```
GameState {
  players:          Player[2]
  activePlayer:     0 | 1
  phase:            Phase
  turn:             int
  pendingEffects:   EffectStack
  log:              LogEntry[]
}

Player {
  id:               string
  life:             Card[]       // Life cards (face-down)
  hand:             Card[]
  deck:             Card[]       // Draw pile
  trash:            Card[]
  stage:            Card | null
  characters:       BoardCard[]  // In-play characters (active/rest state, attached DON!!)
  donDeck:          Card[]
  donAttached:      int          // DON!! in play
  leader:           BoardCard
}
```

#### Effect System
- Card effects are represented as `EffectSchema` JSON (see section 6)
- The engine reads `effectSchema` and executes effect handlers
- **Trigger types:** On Play, On Attack, When Attacking, Activate: Main, Counter, Trigger (damage trigger), End of Turn, etc.
- **Targeting:** Effects that require a target pause the game and prompt the active player (or opponent) to select valid targets
- **Interruptions:** Counter step and blocker step open a window for the opponent to respond
- **Priority / stack:** Effects resolve in LIFO order; simultaneous effects prompt the turn player to order them

#### Handling Specific Rules
- **Counter step:** After attacker is declared, defending player may play Counter events or use Counter abilities; resolve then proceed
- **Blocker:** Characters with Blocker keyword may intercept attacks
- **Rush:** Characters with Rush may attack the turn they are played
- **Banish:** Cards sent to trash via Banish effect are removed from game instead (if applicable per ruling)
- **K.O. / Trash:** Track whether a card was K.O.'d vs. trashed by effect (matters for some card text)

#### Game End Conditions
- A player whose life reaches 0 loses when their leader is attacked and no life cards remain
- A player who cannot draw loses immediately

#### Networking
- Real-time game state sync via WebSocket
- Each player action sends a `GameAction` message; server validates and broadcasts new state
- Reconnect handling: server holds game state; client re-syncs on reconnect
- Game replay: log all actions server-side for post-game review (stretch goal)

---

### 6. Effect Text → JSON Schema Translation

This is one of the highest-complexity components. Card effect text must be parsed into a machine-readable schema that the game engine can execute.

#### Approach

**Phase 1 — Manual schema authoring (MVP)**
- Hand-write `effectSchema` for all cards in the initial card pool
- Establish the schema vocabulary first (see below), then write effects to match
- Pros: highest accuracy; Cons: labor-intensive, doesn't scale to hundreds of future cards

**Phase 2 — LLM-assisted parsing (post-MVP)**
- Use an LLM (e.g. Claude API) to translate effect text into `effectSchema` given the schema spec and examples as context
- Human review step: flag low-confidence outputs for manual correction
- Store both raw text and parsed schema; re-run parser on schema version bumps

#### Effect Schema Vocabulary (Draft)

```json
{
  "trigger": "ON_PLAY | ON_ATTACK | WHEN_ATTACKING | ACTIVATE_MAIN | COUNTER | TRIGGER | END_OF_TURN | BLOCKER | RUSH",
  "cost": {
    "type": "DON_ATTACH | TRASH | REST",
    "amount": 1
  },
  "condition": {
    "type": "CARD_COUNT | CHARACTER_IN_PLAY | LEADER_COLOR | ...",
    "params": {}
  },
  "effects": [
    {
      "type": "DRAW | GIVE_POWER | K_O | RETURN_TO_HAND | RETURN_TO_DECK | ATTACH_DON | ADD_LIFE | REMOVE_LIFE | SEARCH_DECK | LOOK_AT_LIFE | PLAY_FROM_HAND | PLAY_FROM_TRASH | SET_ACTIVE | SET_REST | GIVE_KEYWORD | ...",
      "target": {
        "type": "SELF | OPPONENT | CHARACTER | LEADER | SPECIFIC_CARD",
        "filter": {
          "controller": "SELF | OPPONENT | EITHER",
          "cardType": "Character | Leader | ...",
          "color": [],
          "subtype": [],
          "costMax": null,
          "costMin": null
        },
        "count": 1,
        "optional": false
      },
      "params": {}
    }
  ],
  "duration": "THIS_TURN | THIS_BATTLE | PERMANENT | UNTIL_END_OF_OPPONENT_TURN"
}
```

#### Schema Coverage Priorities
1. Keywords (Rush, Blocker, Banish, Double Attack, Reach) — simple flags
2. Static power buffs and debuffs
3. On-play draw and search effects
4. K.O. and removal effects
5. Don!! attachment / cost manipulation
6. Life manipulation
7. Complex conditional effects and multi-step chains

---

## Technical Architecture (Proposed)

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React), TypeScript, Tailwind CSS |
| Backend API | Next.js API routes or a separate Node/Fastify server |
| Realtime | WebSocket (Socket.io or native ws) |
| Auth | Firebase Auth or Supabase Auth (Google provider) |
| Database | PostgreSQL via Supabase or Neon |
| ORM | Prisma |
| Card images | Cloudflare R2 + CDN |
| Data sourcing | vegapull v1.2.0 (Rust CLI) — scrapes official OPTCG site |
| Data pipeline | TypeScript (tsx) — JSON transform, Prisma import, image download |
| LLM integration | Claude API (for effect text parsing in Phase 2) |
| Hosting | Vercel (frontend + API) or Railway/Fly.io for long-running server |

### Key Services

```
┌─────────────────────────────────────────────────────┐
│                    Client (Next.js)                  │
│  Deck Builder │ Social UI │ Game Board UI            │
└────────────┬───────────────────────┬────────────────┘
             │ REST/GraphQL          │ WebSocket
┌────────────▼───────────┐  ┌────────▼───────────────┐
│      API Server         │  │    Game Server          │
│  Auth, Decks, Cards,    │  │  Game State Machine,    │
│  Friends, Messaging     │  │  Effect Engine          │
└────────────┬────────────┘  └────────────────────────┘
             │
┌────────────▼────────────┐   ┌────────────────────────┐
│      PostgreSQL          │   │   Card Image CDN        │
│  Cards, Decks, Users,    │   │   (R2 / S3)             │
│  Friends, Messages       │   └────────────────────────┘
└─────────────────────────┘
             ▲
┌────────────┴────────────┐
│    Data Pipeline         │
│  Scraper → Parser →      │
│  Effect Translator →     │
│  DB Writer               │
└─────────────────────────┘
```

---

## Open Questions

- [ ] **Scraper legality:** Confirm terms of service for scraping the official OPTCG website; evaluate community data sources as primary if needed
- [ ] **Format support at launch:** Standard only, or also Block formats?
- [ ] **AI opponent:** Is a single-player vs. bot mode in scope?
- [ ] **Mobile:** Web-responsive only, or native app?
- [ ] **Observer/spectate mode:** MVP or post-MVP?
- [ ] **Replay system:** Post-game review of action log?
- [ ] **Effect schema versioning:** How to handle schema breaking changes when new card mechanics are introduced?
- [ ] **Errata handling in-game:** When a card is errata'd mid-season, should ongoing games use old or new text?

---

## Milestones

### M0 — Foundation
- [ ] Repo setup, CI/CD, hosting
- [ ] Google auth flow
- [ ] PostgreSQL schema for cards (with CardSet join table, art variants), users, decks
- [ ] Full card database populated via vegapull (all 51 packs, 2,496 unique cards)
- [ ] Card images downloaded and stored (local/R2)
- [ ] Database admin UI: browse, search, filter, edit, add cards, reprint filter toggle
- [ ] Art variant gallery and cross-set membership visualization

### M1 — Deck Builder
- [ ] Card search + filter API
- [ ] Deck builder UI with rule validation
- [ ] Bulk import/export
- [ ] Deck save/load per user

### M2 — Social
- [ ] Friend system
- [ ] Direct messaging (real-time)
- [ ] Lobby creation and join

### M3 — Simulator (Core)
- [ ] Game state machine (turn phases, draw, DON!! phase, main phase)
- [ ] Attack phase with counter and blocker windows
- [ ] Manual card play (no auto-effect resolution) — players manually track effects
- [ ] Win/lose conditions
- [ ] WebSocket sync between two clients

### M4 — Effect Engine
- [ ] Effect schema spec finalized
- [ ] Keywords automated (Rush, Blocker, Banish, Double Attack)
- [ ] Common effect types automated (draw, K.O., power buff, return to hand)
- [ ] Full card pool coverage for 1-2 sets

### M5 — Polish & Scale
- [ ] LLM-assisted effect parser
- [ ] Full card database (all sets)
- [ ] Spectator mode
- [ ] Game replay/log viewer
- [ ] Mobile-responsive polish

---

## Out of Scope (v1)

- AI/bot opponent
- Tournament bracket management
- Card trading or marketplace
- Animated card effects
- Native mobile app
