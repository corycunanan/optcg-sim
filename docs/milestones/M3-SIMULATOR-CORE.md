# M3 — Simulator (Core)

> Game state machine, turn phases, attack/counter/blocker resolution, manual card play, and real-time WebSocket sync.

---

## Scope

M3 delivers a playable OPTCG simulator where two players can play a full game with rules-enforced turn structure, attack phases, and win/lose conditions. Card effects are **not** auto-resolved in M3 — players manually track and announce effects. The engine enforces the structural rules (phases, timing, combat math) while effect automation comes in M4.

### Deliverables

- [ ] Game state machine with full turn phase enforcement
- [ ] Board rendering (leader, characters, life, hand, trash, DON!! area, stages)
- [ ] Card play from hand (cost validation via DON!! spending)
- [ ] Attack declaration, counter window, blocker window, damage resolution
- [ ] DON!! phase (attach from DON!! deck to active pool)
- [ ] Win/lose condition detection
- [ ] WebSocket sync between two clients (real-time game state)
- [ ] Reconnection handling (server holds state, client re-syncs)
- [ ] Game log (action history visible to both players)
- [ ] Forfeit/concede option

---

## Architecture (M3-Specific)

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│   Player 1 Client              │   │   Player 2 Client              │
│                                │   │                                │
│  ┌──────────────────────────┐ │   │ ┌──────────────────────────┐  │
│  │      Game Board UI       │ │   │ │      Game Board UI       │  │
│  │  • Leader zone           │ │   │ │  • Leader zone           │  │
│  │  • Character zones       │ │   │ │  • Character zones       │  │
│  │  • Life zone             │ │   │ │  • Life zone             │  │
│  │  • Hand                  │ │   │ │  • Hand                  │  │
│  │  • Trash                 │ │   │ │  • Trash                 │  │
│  │  • DON!! area            │ │   │ │  • DON!! area            │  │
│  │  • Stage zone            │ │   │ │  • Stage zone            │  │
│  │  • Phase indicator       │ │   │ │  • Phase indicator       │  │
│  │  • Action buttons        │ │   │ │  • Action buttons        │  │
│  │  • Game log              │ │   │ │  • Game log              │  │
│  └────────────┬─────────────┘ │   │ └─────────────┬────────────┘  │
│               │ WebSocket     │   │               │ WebSocket     │
└───────────────┼───────────────┘   └───────────────┼───────────────┘
                │                                   │
┌───────────────▼───────────────────────────────────▼───────────────┐
│                       Game Server                                  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Game Session Manager                                        │  │
│  │  • Creates GameState on lobby start                          │  │
│  │  • Routes WebSocket messages to correct game                 │  │
│  │  • Handles reconnection                                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Rules Engine                                                │  │
│  │  • Phase state machine (Refresh → Draw → DON!! → Main →     │  │
│  │    Attack → End)                                             │  │
│  │  • Action validation (is this move legal right now?)         │  │
│  │  • Combat resolution (power comparison, damage assignment)    │  │
│  │  • Win/lose condition checks                                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Action Log                                                  │  │
│  │  • Every action persisted for game replay (stretch) and      │  │
│  │    in-game log display                                       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│   PostgreSQL                                                        │
│   • game_sessions table (metadata, result)                         │
│   • game_actions table (action log per game)                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## Core Data Structures

### GameState

```typescript
interface GameState {
  id: string;
  players: [PlayerState, PlayerState];
  activePlayerIndex: 0 | 1;
  phase: Phase;
  turn: number;
  subPhase: SubPhase | null;       // e.g. COUNTER_WINDOW, BLOCKER_WINDOW
  pendingActions: PendingAction[];  // What the game is waiting for
  log: LogEntry[];
  status: 'IN_PROGRESS' | 'FINISHED';
  winner: 0 | 1 | null;
  winReason: string | null;
}

type Phase =
  | 'REFRESH'
  | 'DRAW'
  | 'DON'
  | 'MAIN'
  | 'ATTACK'
  | 'END';

type SubPhase =
  | 'ATTACK_DECLARATION'
  | 'COUNTER_WINDOW'
  | 'BLOCKER_WINDOW'
  | 'DAMAGE_RESOLUTION';

interface PlayerState {
  userId: string;
  leader: BoardCard;
  characters: BoardCard[];       // In-play characters
  hand: CardInstance[];
  deck: CardInstance[];          // Face-down, order matters
  life: CardInstance[];          // Face-down
  trash: CardInstance[];
  stage: BoardCard | null;
  donDeck: number;               // DON!! cards remaining in DON!! deck
  donActive: number;             // DON!! cards in active play (unattached)
  donAttached: DonAttachment[];  // DON!! attached to specific cards
  connected: boolean;            // WebSocket connection status
}

interface BoardCard {
  instanceId: string;            // Unique per game instance
  cardId: string;                // References Card.id in DB
  isRested: boolean;
  attachedDon: number;
  powerModifier: number;         // Temporary power changes (M4: from effects)
  keywords: string[];            // Temporary keyword grants (M4)
}

interface CardInstance {
  instanceId: string;
  cardId: string;
}

interface DonAttachment {
  targetInstanceId: string;      // Which card has DON!! attached
  count: number;
}

interface LogEntry {
  turn: number;
  phase: Phase;
  playerIndex: 0 | 1;
  action: string;                // Human-readable description
  timestamp: number;
}
```

### GameAction (Client → Server)

```typescript
type GameAction =
  | { type: 'ADVANCE_PHASE' }
  | { type: 'PLAY_CARD'; cardInstanceId: string; position?: number }
  | { type: 'ATTACH_DON'; targetInstanceId: string; count: number }
  | { type: 'DECLARE_ATTACK'; attackerInstanceId: string; targetInstanceId: string }
  | { type: 'PLAY_COUNTER'; cardInstanceId: string }
  | { type: 'DECLARE_BLOCKER'; blockerInstanceId: string }
  | { type: 'PASS' }            // Pass priority in counter/blocker windows
  | { type: 'CONCEDE' }
  | { type: 'MANUAL_EFFECT'; description: string }  // M3: players announce effects manually
```

---

## Turn Phase Implementation

### Phase State Machine

```
Game Start
  → Setup (shuffle decks, set life, draw opening hands, mulligan)
  → Player 1 Turn 1

Each Turn:
  REFRESH → DRAW → DON → MAIN → ATTACK → END → (opponent's turn)
```

### Phase Details

#### Setup Phase (Game Start)

1. Both players shuffle their 50-card decks
2. Both players place their Leader card in the Leader zone (active)
3. Both players set their life cards face-down (count = Leader's life value)
4. Both players draw 5 cards
5. Mulligan: each player may shuffle hand into deck and draw 5 new cards (once)
6. DON!! deck: 10 DON!! cards per player (set aside)
7. Determine first player (host goes first, or coin flip)
8. **First player restriction:** Player going first cannot attack on their first turn

#### Refresh Phase

- All rested cards (Leader + Characters) become active
- **Skip on Turn 1** for the starting player

#### Draw Phase

- Active player draws 1 card from deck
- **If deck is empty → defeat condition triggered** (rule processing checks this)
- **Skip on Turn 1** for the starting player

#### DON!! Phase

- Active player adds up to 2 DON!! cards from their DON!! deck to their active DON!! area
- If fewer than 2 remain in DON!! deck, add as many as available

#### Main Phase

Available actions (repeatable, in any order):
- **Play a Character:** Pay cost (rest DON!! equal to card cost), place on board in active state
- **Play an Event:** Pay cost, resolve effect (manual in M3), send to trash
- **Play a Stage:** Pay cost, replace existing stage (if any), place on board
- **Attach DON!!:** Move DON!! from active pool to a Character or Leader (increases power by +1000 per DON!!)
- **Activate "Activate: Main" effects:** (Manual in M3 — player announces effect)
- **End Main Phase:** Advance to Attack Phase

**Cost validation:**
- Player must have enough unattached active DON!! to pay the card's cost
- DON!! used for cost payment are rested (not returned to DON!! deck)

#### Attack Phase

The attack phase consists of multiple attack sub-steps. The active player may declare multiple attacks (one at a time).

**Attack sub-steps:**

```
1. ATTACK_DECLARATION
   Active player selects an active (non-rested) attacker (Leader or Character)
   Active player selects a target (opponent's Leader or a rested Character)
   Attacker becomes rested
   → Determine attack power: attacker's base power + attached DON!! × 1000 + modifiers

2. COUNTER_WINDOW
   Defending player may:
   - Play Counter events from hand (pay cost)
   - Use Counter abilities on characters (per card text)
   - Pass
   → Each counter may add to defending card's power for this battle

3. BLOCKER_WINDOW
   Defending player may:
   - Declare a Blocker (active Character with Blocker keyword)
   - Blocker becomes rested, replaces the original target
   - Pass

4. DAMAGE_RESOLUTION
   Compare attacker power vs defender power
   If attacker power ≥ defender power:
     - If target is Leader: Leader takes 1 damage
       → If life > 0: move top life card to hand (trigger effect check in M4)
       → If life = 0: defeat condition met
     - If target is Character: Character is KO'd → sent to trash
   If attacker power < defender power:
     - Attack fails, no damage
   
   Reset temporary power modifiers from counters
```

**After each attack resolves:** Active player may declare another attack or end the Attack Phase.

#### End Phase

- Return all DON!! attached to Characters/Leader back to the active DON!! pool (per standard rules)
  - **Note:** Verify this against comprehensive rules — some rulesets keep DON!! attached
- Discard to hand limit if applicable (standard rules: no hand limit, but check)
- Turn passes to opponent

### Win/Lose Conditions

Checked via rule processing after each action:
1. **Life out + Leader damaged:** Player's life is 0 and their Leader takes damage → that player loses
2. **Deck out:** Player has 0 cards in deck → that player loses
3. **Concession:** Immediate loss

---

## WebSocket Communication Protocol

### Connection

```
Client connects to /game namespace with:
  - JWT (auth)
  - gameId (from lobby start)

Server validates:
  - JWT is valid
  - User is a player in this game
  - Game is IN_PROGRESS

On success: server sends full GameState to client
On failure: error event + disconnect
```

### Event Flow

**Server → Client:**

| Event | Payload | When |
|-------|---------|------|
| `game:state` | Full `GameState` | On connect/reconnect |
| `game:update` | `{ action, newState }` | After each validated action |
| `game:prompt` | `{ type, options }` | When the game needs player input |
| `game:error` | `{ message }` | When a submitted action is invalid |
| `game:over` | `{ winner, reason }` | Game ends |

**Client → Server:**

| Event | Payload | When |
|-------|---------|------|
| `game:action` | `GameAction` | Player performs an action |

### Reconnection

```
Player disconnects (tab close, network drop)
  → Server keeps GameState in memory
  → Server starts 5-minute reconnection timer
  → Opponent sees "Waiting for opponent to reconnect..."

Player reconnects:
  → Server sends full GameState
  → Game resumes from where it left off

Timer expires:
  → Disconnected player forfeits
  → Opponent wins
```

---

## Game Board UI

### Layout (Desktop)

```
┌────────────────────────────────────────────────────────────────┐
│  Opponent Area                                                  │
│  ┌─────────┐  ┌──────────────────────────────┐  ┌──────────┐ │
│  │ Leader   │  │ Characters (up to 5)         │  │ Stage    │ │
│  │ (card)   │  │ [Card][Card][Card][Card][Card]│  │ (card)   │ │
│  └─────────┘  └──────────────────────────────┘  └──────────┘ │
│  DON!!: 8/10 active  │  Life: ■■■■■ (5)  │  Deck: 42  │ Trash │
├────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐│
│  │ Game Log / Action Feed                                     ││
│  │ Turn 3: Player 1 plays OP01-004 (cost 3)                 ││
│  │ Turn 3: Player 1 attaches DON!! to OP01-004               ││
│  │ Turn 3: Player 1 attacks with OP01-004 → Opponent Leader  ││
│  └───────────────────────────────────────────────────────────┘│
├────────────────────────────────────────────────────────────────┤
│  Your Area                                                      │
│  DON!!: 6/10 active  │  Life: ■■■■ (4)  │  Deck: 38  │ Trash  │
│  ┌─────────┐  ┌──────────────────────────────┐  ┌──────────┐ │
│  │ Leader   │  │ Characters (up to 5)         │  │ Stage    │ │
│  │ (card)   │  │ [Card][Card][Card]           │  │ (card)   │ │
│  └─────────┘  └──────────────────────────────┘  └──────────┘ │
│  ┌───────────────────────────────────────────────────────────┐│
│  │ Hand: [Card][Card][Card][Card][Card][Card][Card]           ││
│  └───────────────────────────────────────────────────────────┘│
│  [Phase: MAIN]  [End Phase]  [Concede]                        │
└────────────────────────────────────────────────────────────────┘
```

### UI Components

| Component | Responsibility |
|-----------|---------------|
| `GameBoard` | Top-level layout, routes game events to zones |
| `PlayerZone` | Leader + Characters + Stage + DON!! + Life + Deck/Trash counts |
| `CardSlot` | Renders a single card on the board (active/rested state, DON!! count) |
| `HandZone` | Fan of cards in hand, click to play |
| `GameLog` | Scrollable action feed |
| `PhaseIndicator` | Shows current phase, highlights active player |
| `ActionBar` | Context-sensitive buttons (End Phase, Pass, Concede) |
| `CounterModal` | Appears during counter window — select counter cards to play |
| `BlockerModal` | Appears during blocker window — select blocker character |
| `TargetSelector` | Overlay for selecting attack targets or effect targets |

### Card Rendering States

| State | Visual |
|-------|--------|
| Active | Card upright, full opacity |
| Rested | Card rotated 90° clockwise |
| Face-down (life) | Card back shown |
| In hand (yours) | Face up, fan layout |
| In hand (opponent) | Card backs, count shown |
| DON!! attached | Small DON!! icon with count badge |
| Valid target | Highlighted border (green glow) |
| Invalid action | Grayed out / not interactive |

---

## Database Schema (New Tables)

```prisma
model GameSession {
  id            String       @id @default(uuid())
  lobbyId       String       @unique
  player1Id     String
  player2Id     String
  player1DeckId String
  player2DeckId String
  format        String
  status        GameStatus   @default(IN_PROGRESS)
  winnerId      String?
  winReason     String?
  startedAt     DateTime     @default(now())
  endedAt       DateTime?

  player1       User         @relation("GamesAsPlayer1", fields: [player1Id], references: [id])
  player2       User         @relation("GamesAsPlayer2", fields: [player2Id], references: [id])
  actions       GameActionLog[]
}

model GameActionLog {
  id            String      @id @default(uuid())
  gameSessionId String
  turn          Int
  phase         String
  playerIndex   Int         // 0 or 1
  actionType    String
  actionData    Json
  timestamp     DateTime    @default(now())

  gameSession   GameSession @relation(fields: [gameSessionId], references: [id], onDelete: Cascade)

  @@index([gameSessionId, timestamp])
}

enum GameStatus {
  IN_PROGRESS
  FINISHED
  ABANDONED
}
```

---

## Roadmap

| Step | Task | Est. |
|------|------|------|
| 1 | Define TypeScript types for GameState, GameAction, all interfaces | 1 day |
| 2 | Implement phase state machine (Refresh → Draw → DON → Main → Attack → End) | 2–3 days |
| 3 | Implement game setup (shuffle, life, opening hand, mulligan) | 1 day |
| 4 | Implement Main Phase actions (play card, attach DON!!, cost validation) | 2 days |
| 5 | Implement Attack Phase (declaration, counter window, blocker window, damage) | 3–4 days |
| 6 | Implement win/lose condition detection | 0.5 day |
| 7 | Set up dedicated game server (separate from API) | 1 day |
| 8 | Implement WebSocket protocol (connect, action, state sync, reconnect) | 2 days |
| 9 | Build game board UI (layout, card slots, zones) | 3–4 days |
| 10 | Build interaction UI (card play, attack targeting, counter/blocker modals) | 2–3 days |
| 11 | Build game log component | 0.5 day |
| 12 | Connect lobby → game transition (M2 lobby starts M3 game) | 1 day |
| 13 | Add game_sessions + game_actions tables, persist results | 1 day |
| 14 | Integration testing (full game playthrough, 2 clients) | 2–3 days |

**Total estimate: ~20–26 days**

---

## Acceptance Criteria

- [ ] Two players can play a full OPTCG game from start to finish
- [ ] Turn phases enforce correct ordering (Refresh → Draw → DON → Main → Attack → End)
- [ ] Starting player skips Refresh, Draw, and Attack on Turn 1
- [ ] Playing a card validates and spends the correct DON!! cost
- [ ] Attack declaration rests the attacker and prompts target selection
- [ ] Counter window gives the defender time to play counter cards
- [ ] Blocker window allows the defender to redirect attacks
- [ ] Damage is correctly applied (life removal or character KO)
- [ ] Game ends when a player's life is 0 and leader takes damage, or when a player decks out
- [ ] Concede immediately ends the game
- [ ] Game state syncs correctly between both clients in real time
- [ ] Disconnected player can reconnect and resume the game
- [ ] Game log accurately records all actions
- [ ] Game result is persisted to the database

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Rules edge cases not covered by state machine | Illegal game states or softlocks | Cross-reference every phase transition against the comprehensive rules document; add "manual override" action as escape hatch |
| Game server memory management (many concurrent games) | Server OOM | Each GameState is ~50KB; 1000 concurrent games = ~50MB — manageable. Add game timeout (auto-abandon after 1hr inactivity) |
| WebSocket message ordering | Desynced clients | Server is authoritative; clients always render server state. Sequence numbers on updates to detect gaps |
| Complex attack phase timing | Counter/blocker UX confusion | Clear phase indicator, explicit "Pass" button, countdown timer for response windows |
| Manual effect tracking (M3) is tedious | Poor gameplay UX | Provide "Announce Effect" button for structured manual tracking; M4 automates this |

---

## Dependencies

- M0 complete (auth, DB, card data)
- M1 complete (decks — players select decks for games)
- M2 complete (lobbies — game starts from lobby)

---

## References

- [OPTCG Comprehensive Rules v1.2.0](../rules/rule_comprehensive.md) — authoritative source for all phase, combat, and effect rules
- Sections most relevant to M3:
  - §5 Game Setup
  - §6 Game Progression (turn structure)
  - §7 Card Attacks and Battles
  - §9 Rule Processing

---

_Last updated: 2026-03-15_
