# M3 — Simulator (Core)

> Game state machine, turn phases, battle system, keyword automation, and real-time WebSocket sync. Built automation-ready: the 7-step action pipeline and event bus are established here so M4's effect engine plugs in without structural changes.

---

## Scope

M3 delivers a playable OPTCG simulator where two players can play a full game with rules-enforced turn structure, combat, and win/lose conditions. **Keyword effects** (Rush, Double Attack, Banish, Blocker, Trigger, Unblockable) are automated in M3. Full card effect automation comes in M4.

The engine is built from the start with automation in mind: all game mutations flow through a single 7-step action pipeline, every completed action emits a typed event on an event bus, and state is tracked as immutable snapshots. M4's effect engine plugs directly into these hooks.

### Deliverables

- [ ] Game state machine with full turn phase enforcement (corrected phase sequence, see §5.1)
- [ ] Battle system as a Main Phase sub-state (corrected sequence: Attack → Block → Counter → Damage → End)
- [ ] Game setup (shuffle, life placement, opening hands, mulligan)
- [ ] All Main Phase actions: play card, activate effect (manual), give DON!!, battle, end phase
- [ ] DON!! phase (1 on turn 1 for first player, up to 2 otherwise)
- [ ] Keyword automation: Rush, Rush:Character, Double Attack, Banish, Blocker, Trigger, Unblockable
- [ ] Win/lose condition detection (life-out, deck-out, concession)
- [ ] 7-step action pipeline (validate → prohibitions → replacements → execute → fire triggers → recalculate → rule processing)
- [ ] Event bus (typed events emitted on every action — M4 subscribes to these)
- [ ] Modifier layer system (DON!! power bonus + stub for M4 effect modifiers)
- [ ] Immutable state snapshots (every mutation produces a new GameState)
- [ ] WebSocket sync between two clients (real-time game state)
- [ ] Reconnection handling (server holds state, client re-syncs)
- [ ] Game log (action history visible to both players)
- [ ] Forfeit/concede option
- [ ] `MANUAL_EFFECT` escape hatch for card effects not yet automated

---

## Architecture (M3-Specific)

The game server runs as a **Cloudflare Durable Object** — one DO instance per active game session. Clients connect via WebSocket directly to the DO; the Next.js app handles session setup and lobby handoff only. No game traffic flows through Next.js.

**Deployment split:**
- Next.js app → Vercel (`https://optcg-sim.vercel.app`)
- Game server Worker → Cloudflare (`workers/game/`), separate from the existing image CDN worker (`workers/images/`)
- The only cross-platform call is `POST /game/:gameId/init` from Vercel → Cloudflare at lobby start

```
┌────────────────────────────────┐   ┌────────────────────────────────┐
│   Player 1 Client (Browser)    │   │   Player 2 Client (Browser)    │
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
                │  (direct to Cloudflare edge)      │
┌───────────────▼───────────────────────────────────▼───────────────┐
│   Cloudflare Worker — Game Server                                  │
│   workers/game/                                                    │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  GameSession Durable Object (one instance per game)          │  │
│  │                                                              │  │
│  │  • Accepts WebSocket connections from both players           │  │
│  │  • Holds GameState in memory for the duration of the game   │  │
│  │  • Serializes all incoming actions (no race conditions)      │  │
│  │  • Hibernates when no messages; wakes on reconnect           │  │
│  │                                                              │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  Rules Engine                                          │  │  │
│  │  │  • 7-step action pipeline                             │  │  │
│  │  │  • Phase FSM (Refresh → Draw → DON → Main → End)      │  │  │
│  │  │  • Action validator                                   │  │  │
│  │  │  • Battle resolver (Attack → Block → Counter → Damage) │  │  │
│  │  │  • Modifier layer system                              │  │  │
│  │  │  • Keyword executor                                   │  │  │
│  │  │  • Defeat checker                                     │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  │                                                              │  │
│  │  ┌───────────────────────────────────────────────────────┐  │  │
│  │  │  Event Bus                                             │  │  │
│  │  │  • Typed events emitted after every action            │  │  │
│  │  │  • M4 trigger system subscribes here                  │  │  │
│  │  └───────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Worker Router (fetch handler)                               │  │
│  │  • GET  /game/:gameId/ws → upgrade to WebSocket, route to DO │  │
│  │  • POST /game/:gameId/init → called by Next.js on lobby start│  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ (on game end: write result)
┌──────────────────────────────▼─────────────────────────────────────┐
│   PostgreSQL                                                        │
│   • game_sessions table (metadata, result)                         │
│   • game_actions table (action log per game)                       │
└────────────────────────────────────────────────────────────────────┘
```

### How a game starts

```
1. Both players ready in lobby (M2)
2. Host clicks "Start Game"
3. Next.js POST /api/lobbies/:id/start
   → Creates game_session row in PostgreSQL (status: IN_PROGRESS)
   → Calls POST workers/game/:gameId/init with both player IDs + deck data
   → Returns { gameId, workerUrl } to both clients
4. Both clients open WebSocket to wss://<worker-url>/game/:gameId/ws?token=<jwt>
5. Durable Object validates JWT, sends initial GameState to both clients
6. Game begins
```

### Cloudflare Worker structure

```
workers/game/
├── wrangler.toml
├── src/
│   ├── index.ts         — Worker fetch handler + DO routing
│   ├── GameSession.ts   — Durable Object class
│   ├── engine/          — Rules engine (pure TypeScript, no CF dependencies)
│   │   ├── pipeline.ts
│   │   ├── phases.ts
│   │   ├── battle.ts
│   │   ├── modifiers.ts
│   │   ├── keywords.ts
│   │   └── defeat.ts
│   └── types.ts         — Shared GameState, GameAction, GameEvent types
```

The engine code in `workers/game/src/engine/` has no Cloudflare dependencies — it's pure TypeScript operating on `GameState` objects. This makes it testable in isolation and portable to M4.

---

## Core Data Structures

### GameState

Every field is read-only after creation. Mutations produce a new snapshot.

```typescript
interface GameState {
  id: string;
  turn: TurnState;
  players: [PlayerState, PlayerState];
  battle: BattleContext | null;
  activeEffects: ActiveEffect[];           // M3: always empty — M4 populates
  prohibitions: ActiveProhibition[];       // M3: always empty — M4 populates
  scheduledActions: ScheduledActionEntry[]; // M3: always empty — M4 populates
  oneTimeModifiers: ActiveOneTimeModifier[]; // M3: always empty — M4 populates
  triggerRegistry: RegisteredTrigger[];    // M3: keywords registered here; M4 adds card effects
  eventLog: GameEvent[];
  status: 'IN_PROGRESS' | 'FINISHED';
  winner: 0 | 1 | null;
  winReason: string | null;
}

interface TurnState {
  number: number;
  activePlayerIndex: 0 | 1;
  phase: Phase;
  battleSubPhase: BattleSubPhase | null;
  oncePerTurnUsed: Map<string, Set<string>>; // effectId → Set of instanceIds used this turn
  actionsPerformedThisTurn: PerformedAction[];
  extraTurnsPending: number;               // M4: extra turns from effects; M3: always 0
}

// Phases: no separate ATTACK phase — battles happen within MAIN (see §5.1)
type Phase = 'REFRESH' | 'DRAW' | 'DON' | 'MAIN' | 'END';

type BattleSubPhase =
  | 'ATTACK_STEP'
  | 'BLOCK_STEP'    // Block comes BEFORE Counter (per rules §7-1)
  | 'COUNTER_STEP'
  | 'DAMAGE_STEP'
  | 'END_OF_BATTLE';
```

### PlayerState

```typescript
interface PlayerState {
  playerId: string;
  leader: CardInstance;
  characters: CardInstance[];   // max 5
  stage: CardInstance | null;   // max 1
  donCostArea: DonInstance[];
  hand: CardInstance[];
  deck: CardInstance[];         // ordered, index 0 = top
  trash: CardInstance[];        // ordered, index 0 = top (most recent)
  donDeck: DonInstance[];
  life: LifeCard[];             // ordered, index 0 = top (first to be removed on damage)
  removedFromGame: CardInstance[]; // Banish destination — empty in M3 until Banish is triggered
  connected: boolean;
}

interface CardInstance {
  instanceId: string;           // unique per game life, reset on zone change (per rules §3-1-6)
  cardId: string;               // references Card.id in DB
  zone: Zone;
  state: 'ACTIVE' | 'RESTED';
  attachedDon: DonInstance[];
  turnPlayed: number | null;    // for Rush check: can attack if turnPlayed === turn.number
  controller: 0 | 1;
  owner: 0 | 1;
}

interface LifeCard {
  instanceId: string;
  cardId: string;
  face: 'UP' | 'DOWN';
}

interface DonInstance {
  instanceId: string;
  state: 'ACTIVE' | 'RESTED';
  attachedTo: string | null;    // CardInstance.instanceId or null if in cost area
}

type Zone =
  | 'LEADER'
  | 'CHARACTER'
  | 'STAGE'
  | 'COST_AREA'
  | 'HAND'
  | 'DECK'
  | 'TRASH'
  | 'LIFE'
  | 'DON_DECK'
  | 'REMOVED_FROM_GAME';
```

### BattleContext

```typescript
interface BattleContext {
  battleId: string;
  attackerInstanceId: string;
  targetInstanceId: string;
  attackerPower: number;         // calculated at time of attack declaration
  defenderPower: number;         // recalculated after counters
  counterPowerAdded: number;     // total counter power applied this battle
  blockerActivated: boolean;
}
```

### GameAction (Client → Server)

```typescript
type GameAction =
  // Phase control
  | { type: 'ADVANCE_PHASE' }
  // Main Phase actions
  | { type: 'PLAY_CARD'; cardInstanceId: string; position?: number }
  | { type: 'ATTACH_DON'; targetInstanceId: string; count: number }
  | { type: 'ACTIVATE_EFFECT'; cardInstanceId: string; effectId: string }
  // Battle actions
  | { type: 'DECLARE_ATTACK'; attackerInstanceId: string; targetInstanceId: string }
  | { type: 'DECLARE_BLOCKER'; blockerInstanceId: string }
  | { type: 'USE_COUNTER'; cardInstanceId: string; counterTargetInstanceId: string }
  | { type: 'USE_COUNTER_EVENT'; cardInstanceId: string; counterTargetInstanceId: string }
  | { type: 'REVEAL_TRIGGER'; reveal: boolean }  // choose to reveal life card [Trigger] or add to hand
  | { type: 'PASS' }             // pass priority in block/counter windows
  // Other
  | { type: 'CONCEDE' }
  | { type: 'MANUAL_EFFECT'; description: string }  // escape hatch for unimplemented effects
```

---

## Action Pipeline

Every game mutation flows through this 7-step pipeline — no exceptions. Player actions, rule processing, and keyword effects all enter at step 1.

```
1. VALIDATE       — Is this action legal in the current phase and game state?
2. CHECK_PROHIBITIONS — Scan prohibition registry for vetoes (M3: always passes; M4 populates)
3. CHECK_REPLACEMENTS — Scan for replacement effects (M3: always passes; M4 populates)
4. EXECUTE        — Produce new GameState snapshot
5. FIRE_TRIGGERS  — Emit typed GameEvent on bus; scan triggerRegistry for matches
6. RECALCULATE    — Recompute modifier layers for affected cards
7. RULE_PROCESSING — Check defeat conditions, zero-power KOs, state-based actions
```

Steps 2 and 3 are no-ops in M3 (the registries are empty) but must exist as pipeline steps so M4 doesn't require restructuring.

---

## Modifier Layer System

Power and cost are computed fresh from an ordered layer stack. Never stored as mutated values.

```
Layer 0: Base printed value (from card DB)
Layer 1: Base-setting effects (M4 — always empty in M3)
Layer 2: Additive/subtractive modifiers (M4 — empty in M3 outside of counters)
DON!! bonus: +1000 × attachedDon count, ONLY during the owner's turn
= Effective value
```

**DON!! bonus is turn-conditional:** `+1000 × attachedDon` only when `currentTurnPlayer === cardOwner`. On the opponent's turn, DON!! remain attached but grant no power (per rules §6-5-5-2).

**Power can be negative.** No floor on power. Cost is clamped to 0 for payment purposes only.

**Counter power:** Applied as a battle-scoped additive modifier in Layer 2, expires at End of Battle.

---

## Turn Phase Implementation

### Phase Sequence

```
REFRESH_PHASE → DRAW_PHASE → DON_PHASE → MAIN_PHASE → END_PHASE
```

**There is no separate Attack Phase.** Battles happen within Main Phase as one of the four available actions (per rules §6-5-2). The phase enum has no `ATTACK` value.

### Refresh Phase

Executed as 4 discrete steps (effect triggers checked between each):

1. Effects lasting "until the start of your next turn" expire
2. "At the start of your/your opponent's turn" auto effects activate
3. Return all DON!! attached to Leader/Characters to cost area — placed **rested**
4. Set all rested cards (Leader, Characters, Stage, cost area DON!!) to **active**

**No turn-1 exception.** Refresh Phase always runs. On turn 1, step 3 is a no-op (no DON!! attached yet).

### Draw Phase

- Active player draws 1 card
- **First player, turn 1: does NOT draw** (phase still runs — matters for future phase-transition effects)
- Deck-empty check happens here: if deck has 0 cards when draw is required → defeat condition

### DON!! Phase

- Place 2 DON!! cards from DON!! deck to cost area (placed active)
- **First player, turn 1: places only 1**
- If fewer than 2 remain, place however many are available

### Main Phase

Available actions (any order, any number of times):

1. **Play a Character:** rest DON!! equal to cost, place on board in active state. Character cannot attack this turn unless it has [Rush]
2. **Play an Event [Main]:** rest DON!! equal to cost, trash the Event, resolve its effect (manual in M3 via `MANUAL_EFFECT`)
3. **Play a Stage:** rest DON!! equal to cost, trash existing Stage if any, place on board active
4. **Give DON!!:** take 1 active DON!! from cost area, attach it to a Leader or Character
5. **Activate [Activate: Main] effect:** manual in M3 via `MANUAL_EFFECT`. **Cannot be used during battle sub-state.**
6. **Battle:** see Battle System below
7. **End Main Phase:** advance to End Phase

**5-card overflow:** If a player plays a 6th Character, they must trash one existing Character first. This is rule processing — it bypasses the effect system, does not trigger [On K.O.].

### Battle System (Main Phase Sub-State)

Battle is declared as a Main Phase action. Once declared, the state machine enters the battle sub-state until End of Battle.

```
ATTACK_STEP → BLOCK_STEP → COUNTER_STEP → DAMAGE_STEP → END_OF_BATTLE
```

**Note the order: BLOCK comes before COUNTER** (per rules §7-1-2, §7-1-3). The original M3 spec had these reversed.

#### Attack Step

1. Turn player selects an **active** Leader or Character as attacker — it becomes **rested**
2. Turn player selects attack target: opponent's Leader OR one of opponent's **rested** Characters
3. Auto effects: [When Attacking], [On Your Opponent's Attack] activate
4. **Bail-out:** if attacker or target has moved to another area → skip to End of Battle

**Turn 1 restriction:** First player cannot declare a battle on their first turn at all.

#### Block Step

1. Defending player may activate [Blocker] on one of their active Characters **(once per battle)**
   - Rest the Blocker → it replaces the current attack target
2. [On Block] effects activate if a Blocker was declared
3. **Bail-out:** if attacker or target has moved → skip to End of Battle

**[Unblockable]:** If the attacking card has [Unblockable], the opponent cannot activate [Blocker] during this step.

#### Counter Step

1. "When attacked" auto effects activate for the defending player
2. Defending player may perform any number of times (any order):
   - **Symbol Counter:** trash a Character from hand that has a Counter value → apply that value as +power to their Leader or one of their Characters **during this battle**
   - **Counter Event:** pay cost of a [Counter] Event from hand, trash it, resolve its effect
3. **Bail-out:** if attacker or target has moved → skip to End of Battle

#### Damage Step

Compare attacker power (base + DON!! bonus + counters) vs defender power (base + DON!! bonus + counters):

**If attacker power ≥ defender power:**
- **Target is Leader:** deal damage
  - Check defeat: if defending player has 0 Life **at the point damage is determined** → that player loses
  - Otherwise: move top Life card to hand
  - If Life card has [Trigger]: defending player may reveal it and activate [Trigger] instead (card goes to no-area while resolving, then trash); or they may add it to hand without revealing
  - **[Double Attack]:** if attacker has Double Attack, deal 2 damage (process each life card removal sequentially, each with its own [Trigger] check)
  - **[Banish]:** if attacker has Banish, the life card goes to trash instead of hand; [Trigger] cannot be activated
- **Target is Character:** K.O. that Character (trash it). Triggers [On K.O.] two-phase resolution (see below)

**If attacker power < defender power:** nothing happens.

**[On K.O.] Two-Phase Resolution:**
1. While Character is still on field: check [On K.O.] conditions, pay activation costs
2. Move Character to trash
3. While Character is in trash: resolve [On K.O.] effect actions

#### End of Battle

1. "At the end of this battle" effects activate
2. Battle-scoped counter power modifiers expire (Layer 2 modifiers with `THIS_BATTLE` duration cleared)
3. Return to Main Phase idle state

### End Phase

Executed in order:

1. Turn player's [End of Your Turn] auto effects activate and resolve (each once only)
2. Non-turn player's [End of Your Opponent's Turn] auto effects activate and resolve (each once only)
3. Turn player's "until end of turn" / "until end of End Phase" continuous effects expire
4. Non-turn player's same expire
5. Turn player's "during this turn" continuous effects expire
6. Non-turn player's same expire
7. Turn passes to opponent

**DON!! does NOT return during End Phase.** DON!! attached to cards stays until the owner's next Refresh Phase step 3.

### Win/Lose Conditions

Checked via rule processing (step 7) after every action:

1. **Life-out:** Player has 0 Life cards AND their Leader takes damage → that player loses
2. **Deck-out:** Player has 0 cards in deck → that player loses
3. **Concession:** Immediate loss
4. **Simultaneous defeat:** Both players meet a defeat condition in the same action → draw

---

## Keyword Implementation

| Keyword | Where Automated | Behavior |
|---------|----------------|---------|
| **[Rush]** | Card play | Character can attack on the turn it was played. `turnPlayed === turn.number` check in attack validator |
| **[Rush: Character]** | Card play | Like Rush but can only attack opponent's Characters (not Leader) on turn played |
| **[Double Attack]** | Damage Step | 2 life cards removed instead of 1; process sequentially, each triggers [Trigger] check |
| **[Banish]** | Damage Step | Life card goes to trash instead of hand; suppresses [Trigger] entirely |
| **[Blocker]** | Block Step | Active Character may be rested to redirect attack to itself; only once per battle |
| **[Trigger]** | Damage Step | When life card is revealed by damage, player may activate its effect; card in no-area during resolution, then trash |
| **[Unblockable]** | Block Step | Defending player cannot activate [Blocker] against this attacker |

---

## Event Bus

Every action that completes pipeline step 4 emits a typed `GameEvent`. M4's trigger system subscribes to these. In M3 the bus exists but only keyword handlers subscribe.

Key events emitted in M3:

| Event | Emitted When |
|-------|-------------|
| `PHASE_CHANGED` | Phase transitions |
| `TURN_STARTED` / `TURN_ENDED` | Turn boundaries |
| `CARD_PLAYED` | Card enters field from hand |
| `CARD_KO` | Character KO'd (battle or effect) |
| `CARD_DRAWN` | Card drawn from deck |
| `ATTACK_DECLARED` | Attack step begins |
| `BLOCK_DECLARED` | Blocker activated |
| `COUNTER_USED` | Symbol counter or Counter Event used |
| `BATTLE_RESOLVED` | Damage step completes |
| `DAMAGE_DEALT` | Leader takes damage |
| `CARD_ADDED_TO_HAND_FROM_LIFE` | Life card moved to hand |
| `TRIGGER_ACTIVATED` | Life card [Trigger] activated |
| `DON_GIVEN_TO_CARD` | DON!! attached to card |
| `DON_DETACHED` | DON!! detached (Refresh Phase, or card leaving field) |
| `GAME_OVER` | Win/lose/draw detected |

---

## WebSocket Communication Protocol

The Durable Object handles WebSocket connections natively via the [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/api/websockets/). This lets the DO sleep between messages and wake instantly on new input — no idle resource cost.

### Connection

```
Client opens: wss://<worker-url>/game/:gameId/ws?token=<jwt>

Durable Object validates:
  - JWT signature and expiry
  - User is player1 or player2 in this game (checked against game_session row)
  - Game status is IN_PROGRESS

On success: DO sends full GameState to connecting client
On failure: DO closes WebSocket with an error code

Both players connect independently — the DO tracks which WS belongs to which player.
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
  → DO hibernates (no active WS) but GameState persists in DO storage
  → DO starts 5-minute reconnection timer (alarm API)
  → Opponent sees "Waiting for opponent to reconnect..."

Player reconnects:
  → Opens new WebSocket to same wss://<worker-url>/game/:gameId/ws?token=<jwt>
  → DO wakes, validates token, sends full GameState
  → Game resumes from where it left off

Timer expires (DO alarm fires):
  → Disconnected player forfeits
  → DO writes result to PostgreSQL and shuts down
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
│  │ Game Log                                                   ││
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
| `HandZone` | Hand of cards, click to play |
| `GameLog` | Scrollable action feed |
| `PhaseIndicator` | Shows current phase, highlights active player |
| `ActionBar` | Context-sensitive buttons (End Phase, Pass, Concede) |
| `BlockerModal` | Appears during Block Step — select Blocker character |
| `CounterModal` | Appears during Counter Step — select counter cards to use |
| `TriggerModal` | Appears when a Life card with [Trigger] is revealed — reveal or add to hand |
| `TargetSelector` | Overlay for selecting attack targets |

### Card Rendering States

| State | Visual |
|-------|--------|
| Active | Card upright, full opacity |
| Rested | Card rotated 90° clockwise |
| Face-down (life) | Card back shown |
| In hand (yours) | Face up |
| In hand (opponent) | Card backs, count shown |
| DON!! attached | Count badge on card |
| Valid target | Highlighted border |
| Invalid / unselectable | Grayed out |

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
| 1 | Define TypeScript types: GameState, GameAction, all interfaces | 1 day |
| 2 | Implement immutable state store + snapshot model | 1 day |
| 3 | Implement 7-step action pipeline skeleton (stubs for steps 2, 3 initially) | 1 day |
| 4 | Implement event bus | 0.5 day |
| 5 | Implement modifier layer system (DON!! bonus + battle counter layer) | 1 day |
| 6 | Implement game setup (shuffle, life placement, opening hands, mulligan) | 1 day |
| 7 | Implement phase FSM (Refresh → Draw → DON → Main → End) with correct per-phase logic | 2 days |
| 8 | Implement Main Phase actions (play card, attach DON!!, cost validation, stage overflow) | 2 days |
| 9 | Implement battle sub-state machine (Attack → Block → Counter → Damage → End) | 3 days |
| 10 | Implement keyword automation (Rush, Double Attack, Banish, Blocker, Trigger, Unblockable) | 2 days |
| 11 | Implement win/lose condition detection | 0.5 day |
| 12 | Set up dedicated game server | 1 day |
| 13 | Implement WebSocket protocol (connect, action, state sync, reconnect) | 2 days |
| 14 | Build game board UI (layout, zones, card slots) | 3 days |
| 15 | Build interaction UI (targeting, counter/blocker/trigger modals) | 2–3 days |
| 16 | Build game log component | 0.5 day |
| 17 | Connect lobby → game transition | 1 day |
| 18 | Add game_sessions + game_actions tables, persist results | 1 day |
| 19 | Integration testing (full game playthrough, 2 clients) | 2–3 days |

**Total estimate: ~27–32 days**

---

## Acceptance Criteria

- [ ] Two players can play a full OPTCG game from start to finish
- [ ] Phase sequence is Refresh → Draw → DON → Main → End (no separate Attack phase)
- [ ] Battles are declared as Main Phase actions, not a separate phase
- [ ] Battle sequence is Attack Step → Block Step → Counter Step → Damage Step → End of Battle
- [ ] First player: Refresh Phase runs (no-op), no draw on turn 1, only 1 DON!! placed, cannot battle on turn 1
- [ ] DON!! returns during Refresh Phase (not End Phase)
- [ ] DON!! power bonus (+1000/DON!!) applies only during the owner's turn
- [ ] Playing a card correctly validates and rests DON!! equal to card cost
- [ ] Characters cannot attack the turn they are played (unless [Rush])
- [ ] [Rush] characters can attack immediately; [Rush: Character] only vs opponent's Characters
- [ ] [Blocker] correctly rests a character to intercept an attack during Block Step
- [ ] [Double Attack] removes 2 life cards, each with its own [Trigger] check
- [ ] [Banish] sends life card to trash, no [Trigger] activation
- [ ] [Trigger] correctly prompts the defending player: reveal and activate, or add to hand
- [ ] [Unblockable] prevents the opponent from activating [Blocker]
- [ ] [On K.O.] two-phase: activates on field, resolves in trash
- [ ] Defeat check: life-out + damage, deck-out, simultaneous draw
- [ ] Concede immediately ends the game
- [ ] 5-card Character area overflow: rule-processing trash (no [On K.O.])
- [ ] Game state syncs correctly between both clients in real time
- [ ] Disconnected player can reconnect and resume the game
- [ ] Game log accurately records all actions
- [ ] Game result is persisted to the database

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Battle bail-out conditions missed | Illegal states | Implement bail-out check as explicit step after every battle sub-step |
| DON!! turn-conditional power easy to forget | Combat math wrong | Modifier layer system handles this; never compute power without going through the layer stack |
| [On K.O.] two-phase is easy to break | Effects don't fire | Explicit `ON_KO_PENDING` state on pipeline; never deregister trigger between activation and resolution |
| WebSocket message ordering | Desynced clients | Server is authoritative; clients always render server state. Sequence numbers on updates |
| MANUAL_EFFECT abuse | Players skip effects or lie | Log every MANUAL_EFFECT call; M4 will replace these with automated resolution |

---

## Dependencies

- M0 complete (auth, DB, card data)
- M1 complete (decks — players select decks for games)
- M2 complete (lobbies — game starts from lobby)

---

## References

- [OPTCG Comprehensive Rules v1.2.0](../rules/rule_comprehensive.md) — authoritative source
- [Game Engine Requirements](../game-engine/GAME-ENGINE-REQUIREMENTS.md) — complete rules-to-engine mapping, including §13 corrections to the prior M3 doc
- [Engine Architecture](../game-engine/08-ENGINE-ARCHITECTURE.md) — component design and full GameState model

---

_Last updated: 2026-03-20_
