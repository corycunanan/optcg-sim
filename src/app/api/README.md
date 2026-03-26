# API Routes Reference

25 endpoints across 8 domains. All routes follow Next.js App Router conventions (`route.ts` files).

## Auth Pattern

Most endpoints require authentication via NextAuth session:

```typescript
import { auth } from "@/auth";
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

The game result endpoint uses Bearer token auth (`GAME_WORKER_SECRET`) for worker-to-API calls.

## Endpoint Index

### Auth

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | None | Create credentials account (email + username + password) |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth | NextAuth handlers (Google OAuth + credentials) |

**POST /api/auth/register** — Validates email format, username 3-20 chars (alphanumeric + underscore), password min 8 chars. Hashes with bcrypt (12 rounds). Checks email and username uniqueness.

### Cards

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/cards` | None | Search/filter cards with pagination |
| POST | `/api/cards` | None* | Create new card |
| GET | `/api/cards/[id]` | None | Get single card with variants, sets, erratas |
| PATCH | `/api/cards/[id]` | None* | Update card fields |

*Admin auth not yet implemented.

**GET /api/cards** query params: `q` (name search), `color`, `type`, `costMin/Max`, `powerMin/Max`, `set`, `block`, `rarity`, `ban`, `traits`, `attribute`, `page` (default 1), `limit` (default 40, max 100), `sort` (id/name/cost/power/type/rarity/blockNumber), `order` (asc/desc). Returns `{ data, total, page, limit, totalPages }`.

### Sets

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/sets` | None | List all card sets (setLabel, setName, packId) |

### Decks

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/decks` | Session | List user's decks (summary with colors, card count) |
| POST | `/api/decks` | Session | Create deck with leader + optional cards |
| GET | `/api/decks/[id]` | Session (owner) | Get full deck with cards ordered by cost |
| PUT | `/api/decks/[id]` | Session (owner) | Update deck (replaces all cards if cards array provided) |
| DELETE | `/api/decks/[id]` | Session (owner) | Delete deck |
| POST | `/api/decks/import` | Session | Parse deck list text into structured card data |

**POST /api/decks** — Validates leader is type "Leader". Request: `{ name, leaderId, leaderArtUrl?, format?, cards?: [{ cardId, quantity }] }`.

**PUT /api/decks/[id]** — If `cards` array is provided, deletes ALL existing deck cards and recreates them (full replacement, not merge).

**POST /api/decks/import** — Parses multiple deck list formats: `N CARDID`, `Nx CARDID`, `N Card Name (CARDID)`, `Leader: CARDID`. Skips comments (`#`, `//`) and section headers. Returns `{ leader, cards, errors, totalLines }`.

### Lobbies

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/lobbies` | Session | Create lobby (generates join code, closes previous WAITING lobbies) |
| POST | `/api/lobbies/join` | Session | Join by code (creates GameSession, initializes DO) |
| GET | `/api/lobbies/[id]` | Session | Poll lobby status (guest info, gameId) |
| DELETE | `/api/lobbies/[id]` | Session (host) | Cancel WAITING lobby |

**POST /api/lobbies** — Request: `{ deckId, format? }`. Returns `{ lobbyId, joinCode }`. Closes any existing WAITING lobbies for the host.

**POST /api/lobbies/join** — Request: `{ code, deckId }`. Validates deck ownership, builds player deck data with leader + 50 cards, initializes Cloudflare Durable Object via `POST GAME_WORKER_URL/game/:id/init`, marks lobby IN_GAME. Returns `{ gameId }`.

### Game

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/game/token` | Session | Mint HS256 JWT for WebSocket auth (5-min expiry) |
| GET | `/api/game/active` | Session (optional) | Get user's active IN_PROGRESS game (for rejoin) |
| GET | `/api/game/[id]` | Session (participant) | Get game status, winner perspective, concede eligibility |
| POST | `/api/game/[id]` | Session (participant) | Finalize game result or fallback concede |
| POST | `/api/game/result` | Bearer (worker) | Worker reports game end (writes to DB) |

**GET /api/game/token** — Returns `{ token }` (HS256, `GAME_WORKER_SECRET`, 5-min expiry). Used for WebSocket authentication to Cloudflare DO.

**POST /api/game/[id]** — Two actions:
- `FINALIZE`: Client reports game end as backup (worker→API callback can fail in local dev)
- `CONCEDE`: Player concedes while disconnected from WebSocket

**POST /api/game/result** — Called by Durable Object only. Auth: `Bearer GAME_WORKER_SECRET`. Request: `{ gameId, status, winnerId, winReason }`.

### Messages

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/messages/conversations` | Session | List conversations (last message, unread count per user) |
| GET | `/api/messages/[userId]` | Session | Get message thread (pagination or polling mode) |
| POST | `/api/messages/[userId]` | Session | Send message |
| PUT | `/api/messages/read?messageId=...` | Session | Mark message as read |

**GET /api/messages/[userId]** — Two modes:
- **Pagination**: Default. Returns 50 messages desc, cursor-based via `cursor` param
- **Polling**: With `after` param (ISO datetime). Returns only newer messages, auto-marks incoming as read

### Users

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/user/username` | Session | Set/update username (onboarding) |
| GET | `/api/users/search?q=...` | Session | Search users by username (min 2 chars, max 10 results) |

### Friends

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/friends` | Session | List established friendships |
| DELETE | `/api/friends/[userId]` | Session | Remove friendship |
| GET | `/api/friends/requests` | Session | List incoming + outgoing pending requests |
| POST | `/api/friends/requests` | Session | Send friend request |
| PUT | `/api/friends/requests/[id]` | Session (recipient) | Accept or decline request |

**POST /api/friends/requests** — Checks: target exists, not self, not already friends (either direction), no pending request (either direction).

**PUT /api/friends/requests/[id]** — Accept creates Friendship with lexicographically sorted user IDs (consistent ordering). Decline deletes the request.

## Adding a New Endpoint

1. Create `src/app/api/<domain>/route.ts` (or `src/app/api/<domain>/[param]/route.ts` for dynamic routes)
2. Export named functions matching HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
3. Add auth check if needed: `const session = await auth()`
4. Use `prisma` from `@/lib/db` for database access
5. Follow existing route files as pattern for error handling and response shapes
