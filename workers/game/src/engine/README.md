# Game Engine — Architecture Reference

The OPTCG game engine is a **purely immutable**, **event-driven** state machine that processes player actions through a deterministic 7-step pipeline. All state mutations return new `GameState` snapshots, enabling replay, undo, and network resync.

## File Map

| File | Purpose |
|------|---------|
| `pipeline.ts` | **Entry point.** 7-step action processing pipeline (`runPipeline()`) |
| `state.ts` | Immutable state mutations and zone management (`moveCard`, `drawCards`, etc.) |
| `execute.ts` | Step 4 — action dispatcher (routes `GameAction` → state mutation) |
| `validation.ts` | Step 1 — action legality checks (phase, cost, zone, timing) |
| `prohibitions.ts` | Step 2 — effect-based vetoes (`CANNOT_ATTACK`, `CANNOT_BLOCK`, etc.) |
| `replacements.ts` | Step 3 — action substitution ("KO → return to hand instead") |
| `effect-resolver.ts` | Core effect engine — costs, conditions, action chains, target selection, stack-based resume |
| `effect-stack.ts` | Effect stack helpers — push/pop/peek/update frames for nested effect resolution |
| `triggers.ts` | Trigger registration, event matching, and ordering |
| `events.ts` | Event bus — appends `GameEvent` entries to `eventLog` |
| `phases.ts` | Phase transitions: REFRESH → DRAW → DON → MAIN → END |
| `battle.ts` | Battle system: Attack → Block → Counter → Damage sub-phases |
| `modifiers.ts` | Layered power/cost computation (base → set → additive → DON bonus) |
| `conditions.ts` | Condition evaluation — game state queries for effect resolution |
| `keywords.ts` | Keyword lookups: Rush, Blocker, DoubleAttack, Banish, etc. |
| `duration-tracker.ts` | Effect expiry and scheduled action processing |
| `defeat.ts` | Win/loss conditions (deck-out, life-out) |
| `setup.ts` | Game initialization (shuffle, mulligan, life placement, leader trigger seeding) |
| `effect-types.ts` | Complete TypeScript types for the effect schema system |
| `schema-registry.ts` | Card effect schema lookup and injection into CardData |
| `schemas/` | Authored card effect schemas (per-set or per-deck files) |

### Dependency Graph

```
pipeline.ts (orchestrator)
  ├─ validation.ts        (step 1)
  ├─ prohibitions.ts      (step 2)
  ├─ replacements.ts      (step 3)
  ├─ execute.ts           (step 4)
  │   ├─ state.ts         (zone mutations)
  │   ├─ battle.ts        (combat sub-phases)
  │   └─ phases.ts        (phase advancement)
  ├─ triggers.ts          (step 5 — match events → effects)
  │   └─ effect-resolver.ts
  │       ├─ effect-stack.ts (LIFO stack for nested resolution)
  │       ├─ conditions.ts
  │       └─ modifiers.ts
  ├─ events.ts            (event logging)
  ├─ duration-tracker.ts  (step 6 — expire effects)
  └─ defeat.ts            (step 7 — win/loss)

setup.ts (game init)
  ├─ schema-registry.ts → schemas/*.ts
  └─ triggers.ts (seed leader triggers)
```

## The 7-Step Pipeline

Every player action flows through `runPipeline()` in `pipeline.ts`:

```
Step 1: VALIDATE       → Is this action legal? (validation.ts)
Step 2: PROHIBITIONS   → Does any active effect veto it? (prohibitions.ts)
Step 3: REPLACEMENTS   → Should the action be substituted? (replacements.ts)
Step 4: EXECUTE        → Perform the action, mutate state (execute.ts)
Step 5: FIRE TRIGGERS  → Match events to registered triggers, resolve effects
Step 6: RECALCULATE    → Expire effects, recompute modifier layers
Step 7: RULE PROCESS   → Check defeat conditions (defeat.ts)
```

**Important:** Step 5 uses LIFO trigger resolution — when a resolved effect emits events that match new triggers, those triggers are inserted at the front of the queue and resolved before remaining triggers from the original event. This matches TCG stack semantics where the newest effect resolves first.

## Core Data Structures

### GameState (defined in types.ts, outside engine)

```typescript
GameState {
  id: string
  players: [PlayerState, PlayerState]     // Always exactly 2
  turn: TurnState                         // Current phase, turn number, active player
  activeEffects: RuntimeActiveEffect[]    // Modifiers, keywords, prohibitions in play
  prohibitions: RuntimeProhibition[]      // Effect-based action vetoes
  scheduledActions: RuntimeScheduledAction[]
  triggerRegistry: RuntimeRegisteredTrigger[]  // All registered auto-triggers
  eventLog: GameEvent[]                   // Full event history
  status: "IN_PROGRESS" | "FINISHED" | "ABANDONED"
  winner: 0 | 1 | null
  pendingPrompt: PendingPromptState | null  // Awaiting player input
  effectStack: EffectStackFrame[]         // LIFO stack for nested effect resolution
}
```

### PlayerState

```typescript
PlayerState {
  playerId: string
  leader: CardInstance               // Always on field
  characters: CardInstance[]         // Max 5 (overflow → trash)
  stage: CardInstance | null         // One stage card slot
  hand: CardInstance[]
  deck: CardInstance[]
  trash: CardInstance[]              // LIFO (newest at index 0)
  life: LifeCard[]                   // Face-down cards
  donDeck: DonInstance[]             // 10 starting DON!! cards
  donCostArea: DonInstance[]         // Available DON (Active/Rested)
  removedFromGame: CardInstance[]
  connected: boolean
}
```

### CardInstance

```typescript
CardInstance {
  instanceId: string          // Unique per zone transition (nanoid)
  cardId: string              // Reference to CardData
  zone: Zone                  // Current zone
  state: "ACTIVE" | "RESTED"
  attachedDon: DonInstance[]
  turnPlayed: number | null   // For summoning sickness
  controller: 0 | 1
  owner: 0 | 1
}
```

**Critical:** `instanceId` changes every time a card moves zones. This is how the engine tracks "new" vs "same" card for trigger purposes.

## Phase System

Phases advance in order: **REFRESH → DRAW → DON → MAIN → END**

| Phase | What Happens |
|-------|-------------|
| REFRESH | Detach all DON!! from cards (return to cost area rested), activate all rested cards |
| DRAW | Draw 1 card (skipped for Player 1 on Turn 1) |
| DON | Place 2 DON!! from DON deck to cost area (1 on Turn 1) |
| MAIN | Play cards, attach DON, declare attacks, activate effects |
| END | Auto-resolves, advances to opponent's REFRESH |

## Battle System

Battles occur during MAIN phase with these sub-phases:

```
ATTACK_STEP    → Attacker declared, attacker rests
BLOCK_STEP     → Defender may declare a Blocker (replaces target)
COUNTER_STEP   → Defender may play Counter cards from hand
DAMAGE_STEP    → Compare power: attacker ≥ defender = hit
END_OF_BATTLE  → Expire battle-scoped effects, clear BattleContext
```

**Power comparison:** `attackerPower >= (defenderPower + counterPowerAdded)` = attacker wins.

- Leader hit → remove 1 life card (may trigger TRIGGER effects)
- Character hit → KO'd (moved to trash, subject to replacements)

## Effect System

### Effect Schema Structure

Cards define effects via `EffectSchema` (authored in `schemas/` files, injected via `schema-registry.ts`):

```typescript
EffectSchema {
  card_id: string
  effects: EffectBlock[]           // One or more effect blocks
}

EffectBlock {
  id: string                       // Unique identifier
  category: EffectCategory         // "auto" | "activate" | "permanent" | "replacement" | "rule_modification"
  trigger?: Trigger                // What fires this effect
  costs?: Cost[]                   // What to pay
  conditions?: Condition           // When effect resolves
  actions?: Action[]               // What to do
  modifiers?: Modifier[]           // For permanent effects
  flags?: { once_per_turn?, optional? }
  duration?: Duration              // How long effect lasts
}
```

### Effect Categories

| Category | When It Fires | Example |
|----------|--------------|---------|
| `auto` | Triggered by game events (ON_PLAY, WHEN_ATTACKING, ON_KO, etc.) | "When this card is played, draw 1" |
| `activate` | Manually by player during Main Phase | "[Activate: Main] Rest this card: Draw 1" |
| `permanent` | Continuous while card is on field | "+1000 power to all your Straw Hat characters" |
| `replacement` | Intercepts an action before it happens | "When this would be KO'd, return to hand instead" |
| `rule_modification` | Changes game rules | "Your opponent cannot play Events" |

### Trigger Types

**Keyword triggers:** `ON_PLAY`, `WHEN_ATTACKING`, `ON_KO`, `ON_BLOCK`, `ON_OPPONENT_ATTACK`, `ACTIVATE_MAIN`, `COUNTER`, `TRIGGER`, `START_OF_TURN`, `END_OF_YOUR_TURN`, `END_OF_OPPONENT_TURN`

**Custom triggers:** `OPPONENT_CHARACTER_KO`, `ANY_CHARACTER_KO`, `CHARACTER_PLAYED`, `DON_GIVEN_TO_CARD`, `CARD_REMOVED_FROM_LIFE`, `COMBAT_VICTORY`, `CHARACTER_BATTLES`, `END_OF_BATTLE`

### Effect Resolution Flow (effect-resolver.ts)

```
1. Evaluate conditions  → Block-level conditions must be true
2. Check optional flag  → If optional, push stack frame and prompt player
3. Pay costs            → Auto-pay simple costs (DON_REST, DON_MINUS)
                          Prompt player for selection-based costs (TRASH_FROM_HAND, etc.)
4. Mark once-per-turn   → Record usage in turn.oncePerTurnUsed
5. Execute action chain → Run actions with THEN/IF_DO/AND connectors
6. Store result refs    → For back-references via result_ref
```

### Effect Stack (effect-stack.ts)

The engine uses a LIFO effect stack (`GameState.effectStack`) for nested effect resolution. Each `EffectStackFrame` represents a paused effect chain:

```typescript
EffectStackFrame {
  id: string
  sourceCardInstanceId: string
  controller: 0 | 1
  effectBlock: EffectBlock
  phase: EffectStackPhase          // Where in the flow this frame paused
  pausedAction: Action | null      // Action awaiting player input
  remainingActions: Action[]       // Actions still to execute
  costs: Cost[]                    // Full cost array
  currentCostIndex: number         // Which cost we're on
  costsPaid: boolean               // Whether all costs are paid
  pendingTriggers: QueuedTrigger[] // Triggers waiting to resolve after this frame
}
```

**Phases:**
- `AWAITING_OPTIONAL_RESPONSE` — player deciding whether to activate
- `AWAITING_COST_SELECTION` — player choosing cards for a selection-based cost
- `AWAITING_TARGET_SELECTION` — player choosing targets for an action
- `AWAITING_ARRANGE_CARDS` — player arranging search results
- `AWAITING_PLAYER_CHOICE` — player choosing between branches
- `INTERRUPTED_BY_TRIGGERS` — paused because a nested trigger pushed onto the stack

**Stack flow:**
```
Attack declared → ON_OPPONENT_ATTACK trigger fires
  → Frame pushed: AWAITING_OPTIONAL_RESPONSE (costs: TRASH_FROM_HAND)
  → Player accepts
  → Frame transitions to AWAITING_COST_SELECTION
  → Player selects card to trash
  → Costs paid, actions execute
  → If actions trigger new effects → new frame pushed (LIFO)
  → Nested effect resolves → frame popped → original frame resumes
  → All frames popped → pipeline continues
```

**Resume entry point:** `resumeFromStack()` — routes player responses to the correct frame based on phase. Replaces direct `resumeEffectChain()` calls when the stack is non-empty.

### Supported Actions

Core actions executed by `executeEffectAction()`:

| Action | What It Does |
|--------|-------------|
| `DRAW` | Draw N cards |
| `SEARCH_DECK` | Look at top N, pick up to M, return rest |
| `KO` | Defeat target (subject to replacements) |
| `RETURN_TO_HAND` | Move card back to hand |
| `MODIFY_POWER` | +/- power, stored as activeEffect |
| `GRANT_KEYWORD` | Add keyword via activeEffect |
| `GIVE_DON` | Attach DON from cost area to target |
| `SET_ACTIVE` / `SET_REST` | Change card state |
| `APPLY_PROHIBITION` | Add veto rule |
| `TRASH_FROM_HAND` | Discard from hand |
| `PLACE_ON_TOP_OF_DECK` / `PLACE_ON_BOTTOM_OF_DECK` | Deck manipulation |

### Pending Prompts

When effect resolution requires player input, the engine pauses by setting `state.pendingPrompt` and pushing an `EffectStackFrame`:

```typescript
PendingPromptState {
  promptType: "OPTIONAL_EFFECT" | "SELECT_TARGET" | "PLAYER_CHOICE" | "ARRANGE_TOP_CARDS" |
              "SEARCH_DECK" | "SEARCH_TRASH" | "REVEAL_TRIGGER"
  options: { ... }                // Context-specific options
  respondingPlayer: 0 | 1
  resumeContext: string           // Stack frame ID (full context lives on effectStack)
}
```

When the player responds, `GameSession.resumeFromPrompt()` delegates to `resumeFromStack()`, which reads the top frame from `effectStack`, processes the response, and either produces a new prompt or pops the frame and continues.

## Modifier Layer System (modifiers.ts)

Power and cost are **never stored** — always computed fresh:

```
getEffectivePower(card, cardData, state):
  Layer 0: Base printed power
  Layer 1: Base-setting effects (SET_POWER — last one wins)
  Layer 2: Additive modifiers (MODIFY_POWER — sum all)
  Bonus:   +1000 per attached DON (owner's turn only, per rules §6-5-5-2)

getEffectiveCost(cardData, state, instanceId):
  Layer 0: Base printed cost
  Layer 1/2: Cost modifiers (MODIFY_COST, SET_COST)
  Clamped to minimum 0
```

## State Mutation Conventions

### Immutability

Every mutation returns a new object. Never mutate in place:

```typescript
// Correct
const newPlayers = [...state.players];
newPlayers[idx] = { ...player, characters: [...player.characters, card] };
return { ...state, players: newPlayers };

// Wrong — never do this
state.players[idx].characters.push(card);
```

### Key Mutation Functions (state.ts)

| Function | Purpose |
|----------|---------|
| `moveCard(state, instanceId, destination)` | Core zone transition — strips modifiers, assigns new instanceId, returns attached DON |
| `drawCards(state, playerIndex, count)` | Deck → Hand, emits CARD_DRAWN events |
| `placeDonFromDeck(state, playerIndex, count)` | DON deck → cost area (active) |
| `restDonForCost(state, playerIndex, count)` | Pay DON cost (active → rested) |
| `attachDon(state, playerIndex, targetId)` | Cost area → card attachment |
| `returnAttachedDonToCostArea(state, playerIndex)` | Detach all DON (refresh phase) |
| `activateAllRested(state, playerIndex)` | Activate all rested cards + DON |

### Zone Classification (state.ts)

```typescript
isOnField(zone)    → LEADER, CHARACTER, STAGE, COST_AREA
isOpenArea(zone)   → Field zones + DON_DECK + TRASH (visible to all)
isSecretArea(zone) → HAND, DECK, LIFE (hidden)
```

## Adding a New Card Schema

1. Create or edit a file in `schemas/` (group by set or deck)
2. Define an `EffectSchema` with the card's `card_id` and `effects` array
3. Register it in `schema-registry.ts` so `getSchema(cardId)` returns it
4. Each `EffectBlock` needs a unique `id` (convention: `"{cardId}_effect_{n}"`)

Example:

```typescript
// schemas/op01.ts
export const OP01_006: EffectSchema = {
  card_id: "OP01-006",
  card_name: "Nami",
  effects: [{
    id: "OP01-006_effect_1",
    category: "auto",
    trigger: { keyword: "ON_PLAY" },
    conditions: { type: "DON_FIELD_COUNT", operator: ">=", value: 1 },
    actions: [{ type: "DRAW", amount: 1 }],
  }]
};
```

## Adding a New Action Type

1. Add the type to the `Action` union in `effect-types.ts`
2. Add execution logic in `effect-resolver.ts` → `executeEffectAction()`
3. Add a corresponding `GameEventType` in the types file
4. Emit the event in `events.ts` if needed
5. If the action can be prohibited, add a case in `prohibitions.ts`
6. If the action can be replaced, add a case in `replacements.ts`
7. If the action needs validation, add a case in `validation.ts`

## Adding a New Trigger Type

1. Add to `KeywordTriggerType` or `CustomTriggerType` in `effect-types.ts`
2. Add matching logic in `triggers.ts` → `matchTriggersForEvent()`
3. Ensure the corresponding event is emitted in the right execution path

## Adding a New Condition Type

1. Add to the `Condition` union in `effect-types.ts`
2. Add evaluation logic in `conditions.ts` → `evaluateCondition()`

## Important Rules & Edge Cases

- **Trigger ordering** (rules §8-6): Turn player's triggers resolve first, then opponent's. Triggers are processed via a LIFO queue — nested triggers (from resolved effects) are inserted at the front and resolve before remaining triggers from the original event.
- **Once-per-turn** tracking uses `turn.oncePerTurnUsed[effectBlockId]` → array of source instanceIds
- **Summoning sickness**: Characters can't attack on the turn they're played unless they have RUSH
- **RUSH:Character** restriction: Can only attack characters (not leader) on the turn played
- **DON power bonus**: +1000 per attached DON, but only on the owner's turn (rules §6-5-5-2)
- **Character overflow**: If >5 characters on field, excess must be trashed (player chooses)
- **Life cards** are face-down — neither player knows what they are until revealed
- **instanceId changes on zone transition** — never hold stale instanceIds across moves
