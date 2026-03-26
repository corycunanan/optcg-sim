# Game Worker — Durable Object Reference

The game worker is a Cloudflare Worker using Durable Objects for real-time game sessions. Each `GameSession` Durable Object manages one game: WebSocket connections, game state, the engine pipeline, and reconnection handling.

## File Map

| File | Purpose |
|------|---------|
| `index.ts` | Worker entry point — HTTP routing, dispatches to Durable Object |
| `GameSession.ts` | Durable Object — WebSocket handler, action routing, prompt/resume loop, reconnection |
| `types.ts` | `GameInitPayload`, `ResumeContext`, `EffectStackFrame`, `QueuedTrigger`, shared worker types |
| `engine/` | Pure game engine (see `engine/README.md`) |

## Architecture Overview

```
Next.js API                  Cloudflare Worker
───────────                  ─────────────────
POST /lobbies/join ─────────→ POST /game/:id/init
  (builds deck data,           (creates GameSession DO,
   creates GameSession)          builds initial state)

GET /api/game/token ────┐
  (mints HS256 JWT)     │
                        ↓
Client ─── WebSocket ──→ GET /game/:id/ws?token=JWT
                          (upgrades to WS, joins session)

Client ←─── game:state ─── GameSession DO
Client ───→ game:action ──→ (7-step pipeline)
Client ←─── game:update ─── (broadcast new state)
```

## Lifecycle

### 1. Game Initialization

Next.js API (`POST /api/lobbies/join`) builds a `GameInitPayload` with both players' deck data and calls `POST /game/:id/init` on the worker:

```typescript
GameInitPayload {
  gameId: string;
  players: [{
    userId: string;
    leader: { cardId, name, ... };
    deck: [{ cardId, name, cost, power, ... }];  // 50 cards
  }, ...]
}
```

`GameSession.handleInit()`:
1. Calls `buildInitialState()` (engine/setup.ts) — shuffles decks, deals hands, places life, builds DON!! decks, injects effect schemas, registers leader triggers
2. Auto-advances through REFRESH → DRAW → DON phases (no player input needed)
3. Persists to DO storage
4. Returns `{ gameId }` to Next.js

### 2. WebSocket Connection

Client calls `GET /game/:id/ws?token=JWT` to upgrade to WebSocket:

1. Validates JWT (HS256, signed with `GAME_WORKER_SECRET`, 5-min expiry)
2. Creates WebSocket pair, accepts server side with tag `player-{index}`
3. Sets player `connected: true` in state
4. Broadcasts full `game:state` to ALL clients (ensures sync)
5. Re-sends `pendingPrompt` if reconnecting during an effect prompt

### 3. Action Processing

Client sends `{ type: "game:action", action: GameAction }`:

1. **Pause check** — if a player is away, only CONCEDE is allowed
2. **Prompt check** — if `pendingPrompt` exists, only the responding player can act, and only with prompt-response actions
3. **Turn check** — active player required, except for reactive actions (DECLARE_BLOCKER, USE_COUNTER, REVEAL_TRIGGER, PASS)
4. **Pipeline** — `runPipeline(state, action, cardDb, playerIndex)` (7-step engine)
5. **Auto-advance** — loops through start-of-turn phases (REFRESH, DRAW, DON) until MAIN phase requires player input
6. **Persist + broadcast** — saves to DO storage, sends `game:update` to all clients

### 4. Disconnection & Reconnection

**Disconnect:**
- Player's WebSocket closes → `connected: false`, `awayReason: "DISCONNECTED"`
- 5-minute rejoin window set via `rejoinDeadlineAt`
- DO alarm scheduled for deadline
- Broadcasts `game:player_disconnected`

**Reconnection:**
- New WebSocket connection → `connected: true`, clears away state
- Full state broadcast ensures both clients sync
- Pending prompt re-sent if applicable

**Alarm (deadline expired):**
- One player expired → other wins
- Both expired → game abandoned
- Writes result to PostgreSQL via `POST /api/game/result`

## Message Protocol

### Server → Client

| Type | Payload | When |
|------|---------|------|
| `game:state` | `{ state: GameState }` | On connection, reconnection |
| `game:update` | `{ action: GameAction, state: GameState }` | After valid action |
| `game:prompt` | `{ promptType, options }` | Engine needs player input |
| `game:error` | `{ message: string }` | Invalid action or error |
| `game:over` | `{ winner: 0\|1\|null, reason }` | Game ended |
| `game:player_disconnected` | `{ playerIndex }` | Player lost connection |
| `game:player_reconnected` | `{ playerIndex }` | Player reconnected |

### Client → Server

| Type | Payload | When |
|------|---------|------|
| `game:action` | `{ action: GameAction }` | Player takes action |
| `game:leave` | — | Player intentionally leaves |

### GameAction Types

**Phase:** `ADVANCE_PHASE`

**Cards:** `PLAY_CARD`, `ACTIVATE_EFFECT`, `ATTACH_DON`

**Battle:** `DECLARE_ATTACK`, `DECLARE_BLOCKER`, `USE_COUNTER`, `USE_COUNTER_EVENT`

**Triggers:** `REVEAL_TRIGGER`

**Prompt responses:** `SELECT_TARGET`, `ARRANGE_TOP_CARDS`, `PLAYER_CHOICE`, `PASS`

**Game:** `CONCEDE`

## Prompt / Resume Loop

When the engine needs player input (target selection, optional effect, search deck), it returns a `PendingPromptState` instead of completing the action:

```
Engine executes action chain
    ↓ needs player input
Sets state.pendingPrompt = { promptType, options, respondingPlayer, resumeContext }
    ↓
GameSession broadcasts game:prompt to responding player
    ↓
Client shows UI for selection
    ↓
Client sends prompt-response action (SELECT_TARGET, ARRANGE_TOP_CARDS, PLAYER_CHOICE, PASS)
    ↓
GameSession.resumeFromPrompt():
  - Clears pendingPrompt
  - Routes by context type:
    • REPLACEMENT → resumeReplacement()
    • Effect stack non-empty → resumeFromStack() (reads top frame, routes by phase)
    • Legacy fallback → resumeEffectChain()
  - resumeFromStack handles: optional accept → cost payment → action execution
  - If new prompt needed → recurse
  - When stack fully unwinds → persist + broadcast final state
```

### Prompt Types

| Type | When | Player Responds With |
|------|------|---------------------|
| `OPTIONAL_EFFECT` | "You may..." effects | action or PASS |
| `SELECT_TARGET` | "Choose up to N" targets, or cost card selection | `selectedInstanceIds` |
| `PLAYER_CHOICE` | "Choose one:" branches | `choiceId` |
| `ARRANGE_TOP_CARDS` | Search deck, look at top N | `keptCardInstanceId`, `orderedInstanceIds` |
| `SEARCH_DECK` | Full deck search | selection |
| `REVEAL_TRIGGER` | Life card trigger | accept or decline |

**Note:** `SELECT_TARGET` is reused for cost selection (e.g., "Choose a card to trash as cost"). The `effectDescription` and `ctaLabel` in prompt options distinguish the context for the client UI.

## Persistence

State is stored in DO storage as:

```typescript
StoredSession {
  state: GameState;
  cardDb: Record<string, CardData>;  // Map serialized to object
  mulliganDone: [boolean, boolean];
}
```

Persisted after every valid action. On DO wake from hibernation, `loadFromStorage()` reconstructs in-memory state.

## Authentication

- **WebSocket connections**: HS256 JWT signed with `GAME_WORKER_SECRET`, 5-min expiry, payload `{ sub: userId, iat, exp }`
- **Worker → Next.js API**: Bearer token with `GAME_WORKER_SECRET` (for game result reporting)
- **Next.js → Worker**: Bearer token with `GAME_WORKER_SECRET` (for init and notifications)

The game token is separate from NextAuth JWE because JWE tokens are hard to verify in Cloudflare Workers.

## Game End Flow

Games end via:

1. **Engine defeat** (deck-out, life-out) — pipeline detects win condition, sets `status: "FINISHED"`
2. **Concede** — player sends CONCEDE action
3. **Disconnect timeout** — alarm fires, opponent wins by default
4. **Fallback concede** — client calls `POST /api/game/:id` with `action: "CONCEDE"` if WebSocket is unavailable

In all cases, result is written to PostgreSQL via `POST /api/game/result` and `game:over` is broadcast.
