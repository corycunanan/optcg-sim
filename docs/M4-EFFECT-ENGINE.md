# M4 — Effect Engine

> Automated card effect resolution, effect schema finalization, and keyword automation for 1–2 sets.

---

## Scope

M4 is the highest-complexity milestone. It replaces M3's manual effect tracking with an automated effect engine that reads `effectSchema` JSON from card data and executes effects programmatically. By the end of M4, all cards in 1–2 initial sets have machine-readable effects, and the game engine resolves most effects without player intervention.

### Deliverables

- [ ] Effect schema spec finalized (full vocabulary covering all known OPTCG mechanics)
- [ ] Keyword automation (Rush, Blocker, Banish, Double Attack, Reach)
- [ ] Common effect types automated (draw, KO, power buff/debuff, return to hand/deck, search deck)
- [ ] Effect targeting system (prompt player to select valid targets)
- [ ] Effect trigger system (ON_PLAY, ON_ATTACK, COUNTER, TRIGGER, etc.)
- [ ] Effect stack / priority resolution
- [ ] Hand-authored `effectSchema` for all cards in 1–2 sets
- [ ] Effect resolution integrated into game state machine

---

## Architecture (M4-Specific)

```
┌─────────────────────────────────────────────────────────────────┐
│   Game Server                                                    │
│                                                                  │
│  ┌───────────────────────┐    ┌────────────────────────────────┐│
│  │   Rules Engine (M3)   │    │   Effect Engine (M4)           ││
│  │   • Phase transitions │    │                                ││
│  │   • Action validation │    │   ┌────────────────────────┐  ││
│  │   • Combat math       │◄──▶│   │  Trigger System        │  ││
│  │                       │    │   │  • Registers listeners  │  ││
│  │                       │    │   │  • Fires on game events │  ││
│  └───────────────────────┘    │   └────────────┬───────────┘  ││
│                               │                │               ││
│                               │   ┌────────────▼───────────┐  ││
│                               │   │  Effect Resolver       │  ││
│                               │   │  • Reads effectSchema  │  ││
│                               │   │  • Evaluates conditions│  ││
│                               │   │  • Executes effects    │  ││
│                               │   │  • Manages effect stack│  ││
│                               │   └────────────┬───────────┘  ││
│                               │                │               ││
│                               │   ┌────────────▼───────────┐  ││
│                               │   │  Target Resolver       │  ││
│                               │   │  • Validates targets   │  ││
│                               │   │  • Prompts player      │  ││
│                               │   │  • Applies filters     │  ││
│                               │   └────────────────────────┘  ││
│                               └────────────────────────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Effect Schema Specification

### Top-Level Structure

Each card's `effectSchema` is an array of effect blocks. A card may have multiple independent effects (e.g. an ON_PLAY effect and a separate COUNTER ability).

```typescript
interface EffectSchema {
  effects: EffectBlock[];
}

interface EffectBlock {
  id: string;                    // Unique ID within this card (e.g. "e1", "e2")
  trigger: EffectTrigger;
  cost?: EffectCost;             // Activation cost (if any)
  condition?: EffectCondition;   // Must be true for effect to activate
  actions: EffectAction[];       // Executed in order
  optional: boolean;             // Player may choose not to activate
  oncePerTurn: boolean;          // Can only be used once per turn
}
```

### Trigger Types

```typescript
type EffectTrigger =
  | 'ON_PLAY'                // When this card is played from hand
  | 'ON_ATTACK'              // When this card attacks
  | 'WHEN_ATTACKING'         // When this card is declared as an attacker
  | 'ACTIVATE_MAIN'          // Activated ability usable during Main Phase
  | 'COUNTER'                // Usable during Counter window
  | 'TRIGGER'                // Activated when revealed as a life card (damage trigger)
  | 'ON_KO'                  // When this card is KO'd
  | 'ON_BLOCK'               // When this card blocks
  | 'END_OF_TURN'            // At end of turn
  | 'START_OF_TURN'          // At start of turn
  | 'ON_YOUR_ATTACK'         // When any of your cards attack
  | 'ON_OPPONENT_ATTACK'     // When opponent attacks
  | 'WHEN_PLAYED_BY_EFFECT'  // When this card is played by another effect (not from hand)
  | 'STATIC';                // Always-on passive effect
```

### Effect Costs

```typescript
interface EffectCost {
  type: CostType;
  amount: number;
  target?: CostTarget;          // What to apply the cost to
}

type CostType =
  | 'DON_MINUS'              // Return DON!! from field to DON!! deck
  | 'DON_REST'               // Rest active DON!!
  | 'REST_THIS'              // Rest this card
  | 'REST_CHARACTER'          // Rest a character you control
  | 'TRASH_FROM_HAND'        // Discard from hand
  | 'TRASH_THIS'             // Send this card to trash
  | 'MILL'                   // Send cards from top of deck to trash
  | 'NONE';                  // No cost
```

### Conditions

```typescript
interface EffectCondition {
  type: ConditionType;
  params: Record<string, any>;
  operator?: 'AND' | 'OR';
  children?: EffectCondition[];  // For compound conditions
}

type ConditionType =
  | 'YOUR_TURN'              // Must be your turn
  | 'OPPONENT_TURN'          // Must be opponent's turn
  | 'CHARACTER_COUNT'        // You control N characters matching filter
  | 'LIFE_COUNT'             // Your/opponent's life count comparison
  | 'HAND_COUNT'             // Your/opponent's hand size comparison
  | 'DON_COUNT'              // Active DON!! count comparison
  | 'CARD_IN_TRASH'          // Specific card type/traits in trash
  | 'LEADER_HAS_TRAIT'       // Your leader has specific traits
  | 'ATTACHED_DON'           // This card has N DON!! attached
  | 'OPPONENT_CHARACTER'     // Opponent has characters matching filter
  | 'PHASE_IS';              // Current phase matches
```

### Effect Actions

```typescript
interface EffectAction {
  type: ActionType;
  target: EffectTarget;
  params: Record<string, any>;
  duration?: EffectDuration;
}

type ActionType =
  // Card movement
  | 'DRAW'                    // Draw cards
  | 'SEARCH_DECK'            // Look at top N cards, pick M matching filter
  | 'RETURN_TO_HAND'         // Return target to hand
  | 'RETURN_TO_DECK'         // Return target to bottom/top of deck
  | 'PLAY_FROM_HAND'         // Play a card from hand (at reduced cost or free)
  | 'PLAY_FROM_TRASH'        // Play a card from trash
  | 'TRASH_CARD'             // Send target to trash
  | 'KO'                     // KO target (triggers on_ko effects)
  | 'ADD_TO_LIFE'            // Add a card to life (from various sources)
  | 'LOOK_AT_LIFE'           // Look at top N life cards
  | 'MILL'                   // Mill N cards from deck to trash
  
  // Power modification
  | 'GIVE_POWER'             // +/- power to target
  | 'SET_POWER'              // Set target's power to specific value
  
  // DON!! manipulation
  | 'ATTACH_DON'             // Attach DON!! to a card
  | 'RETURN_DON'             // Return DON!! to DON!! deck
  | 'ADD_DON_ACTIVE'         // Add DON!! to active pool from DON!! deck
  
  // State changes
  | 'SET_ACTIVE'             // Set target to active
  | 'SET_REST'               // Set target to rested
  | 'GIVE_KEYWORD'           // Grant a keyword to target
  | 'REMOVE_KEYWORD'         // Remove a keyword from target
  
  // Meta
  | 'PLAYER_CHOICE'          // Player chooses between sub-effects
  | 'BANISH';                // Remove from game (not to trash)

type EffectDuration =
  | 'THIS_TURN'
  | 'THIS_BATTLE'
  | 'UNTIL_END_OF_OPPONENT_TURN'
  | 'PERMANENT';
```

### Effect Targets

```typescript
interface EffectTarget {
  type: TargetType;
  filter?: TargetFilter;
  count: number | 'ALL';
  optional: boolean;          // Player may choose fewer targets
  controller: 'SELF' | 'OPPONENT' | 'EITHER';
}

type TargetType =
  | 'SELF'                    // This card
  | 'LEADER'                  // A leader
  | 'CHARACTER'               // Character(s) on field
  | 'CARD_IN_HAND'           // Card(s) in hand
  | 'CARD_IN_TRASH'          // Card(s) in trash
  | 'CARD_ON_TOP_OF_DECK'    // Top card(s) of deck
  | 'PLAYER'                  // A player (for draw, mill)
  | 'ALL_YOUR_CHARACTERS'     // All characters you control
  | 'ALL_OPPONENT_CHARACTERS'; // All opponent's characters

interface TargetFilter {
  cardType?: CardType[];
  color?: string[];
  costMin?: number;
  costMax?: number;
  costExact?: number;
  powerMin?: number;
  powerMax?: number;
  traits?: string[];
  keywords?: string[];
  name?: string;              // Match by card name
  excludeSelf?: boolean;      // Cannot target self
}
```

---

## Keyword Implementation

Keywords are the simplest effects to automate — they're flags that modify game rules.

| Keyword | Behavior | Implementation |
|---------|----------|---------------|
| **Rush** | Character can attack the turn it is played | On play: set `canAttackThisTurn = true` (normally characters have summoning sickness) |
| **Blocker** | Character can intercept attacks | During Blocker Window: eligible to be declared as blocker if active |
| **Banish** | When this card KOs an opponent's character, remove it from game instead of sending to trash | On KO resolution: send to removed-from-game zone instead of trash |
| **Double Attack** | When this card's attack reduces opponent's life, remove 2 life cards instead of 1 | On damage resolution: life removal count = 2 |
| **Reach** | This card can attack active Characters (normally only rested Characters can be targeted) | During target selection: active opponent Characters are valid targets |

---

## Effect Resolution System

### Trigger System

The trigger system listens for game events and fires matching effect blocks.

```
Game Event occurs (e.g. card played)
  → Trigger System scans all cards in play for matching triggers
  → Matching effects queued on the Effect Stack
  → Turn player orders simultaneous triggers (if multiple)
  → Effects resolve one at a time (LIFO)
```

**Game events that fire triggers:**

| Game Event | Triggers |
|-----------|---------|
| Card played from hand | ON_PLAY on the played card; ON_PLAY watchers on other cards |
| Attack declared | ON_ATTACK, WHEN_ATTACKING |
| Card KO'd | ON_KO on the KO'd card |
| Life card revealed (damage trigger) | TRIGGER |
| Block declared | ON_BLOCK |
| Turn start | START_OF_TURN |
| Turn end | END_OF_TURN |
| Player enters Main Phase | ACTIVATE_MAIN becomes available |
| Counter window opens | COUNTER becomes available |

### Effect Stack

Multiple effects can trigger simultaneously. Resolution follows OPTCG rules:

1. Turn player's effects go on the stack first
2. Non-turn player's effects go on top
3. Resolve top-down (LIFO)
4. If the turn player has multiple simultaneous effects, they choose the order
5. Effects resolve fully before the next effect begins (no mid-resolution interrupts in OPTCG)

```typescript
interface EffectStack {
  entries: EffectStackEntry[];
}

interface EffectStackEntry {
  sourceCardInstanceId: string;
  effectBlockId: string;
  playerIndex: 0 | 1;
  resolvedTargets?: Map<string, string[]>;  // actionId → selected instanceIds
}
```

### Target Resolution

When an effect requires targeting:

1. Effect engine computes valid targets (apply TargetFilter to game state)
2. If `count` targets must be chosen and exactly that many valid targets exist → auto-select
3. If multiple valid targets → prompt player via WebSocket (`game:prompt` event)
4. Player selects targets → server validates selection → effect continues
5. If `optional: true` and player has no valid targets → effect skipped

**Prompt payload:**
```json
{
  "type": "SELECT_TARGET",
  "effectDescription": "Choose 1 opponent's Character with cost 3 or less to return to hand",
  "validTargets": ["inst-abc123", "inst-def456"],
  "count": 1,
  "optional": true,
  "timeoutMs": 30000
}
```

---

## Effect Authoring Process (M4: Manual)

For M4, every card in the initial 1–2 sets gets a hand-authored `effectSchema`.

### Authoring workflow

1. **Read card text** from the database
2. **Decompose into effect blocks** — identify trigger, cost, condition, actions
3. **Write effectSchema JSON** following the spec above
4. **Validate** against the schema spec (JSON schema validation)
5. **Test** by playing the card in the simulator and verifying behavior
6. **Store** in the `cards.effectSchema` JSON column

### Example: OP01-004 (Hypothetical)

**Card text:** "On Play: Draw 1 card."

```json
{
  "effects": [
    {
      "id": "e1",
      "trigger": "ON_PLAY",
      "actions": [
        {
          "type": "DRAW",
          "target": { "type": "PLAYER", "controller": "SELF", "count": 1, "optional": false },
          "params": { "count": 1 }
        }
      ],
      "optional": false,
      "oncePerTurn": false
    }
  ]
}
```

### Example: Complex Card

**Card text:** "Activate: Main Once Per Turn (You may rest this card): Give up to 1 of your opponent's Characters with a cost of 5 or less −2000 power during this turn."

```json
{
  "effects": [
    {
      "id": "e1",
      "trigger": "ACTIVATE_MAIN",
      "cost": { "type": "REST_THIS", "amount": 1 },
      "actions": [
        {
          "type": "GIVE_POWER",
          "target": {
            "type": "CHARACTER",
            "controller": "OPPONENT",
            "count": 1,
            "optional": true,
            "filter": { "costMax": 5 }
          },
          "params": { "amount": -2000 },
          "duration": "THIS_TURN"
        }
      ],
      "optional": true,
      "oncePerTurn": true
    }
  ]
}
```

### Coverage priorities

1. **Keywords** — Rush, Blocker, Banish, Double Attack, Reach (simple flags)
2. **Draw effects** — "Draw N cards" (most common)
3. **Power buffs/debuffs** — "+N000 power this turn"
4. **KO/removal** — "KO opponent's Character with cost N or less"
5. **Return to hand/deck** — Bounce effects
6. **DON!! manipulation** — Attach/return DON!!
7. **Search/tutor** — "Look at top N, add 1 to hand"
8. **Life manipulation** — Add/remove life
9. **Conditional effects** — "If you have 2 or fewer life..."
10. **Multi-step chains** — "Do X, then do Y"

---

## Integration with Game Engine

### Modified Game Flow (M4)

The M3 game flow is extended at key points:

```
Card played from hand:
  M3: Card placed on board, cost paid
  M4: + Trigger System fires ON_PLAY → Effect Resolver executes actions

Attack declared:
  M3: Attacker rested, target selected
  M4: + Trigger System fires ON_ATTACK / WHEN_ATTACKING → resolve pre-combat effects

Counter window:
  M3: Defender plays counter cards (cost paid)
  M4: + Counter card effects resolve automatically (power buffs applied)

Damage resolution:
  M3: Power comparison, life/KO
  M4: + If life card has TRIGGER effect → reveal card, resolve trigger
       + If KO → fire ON_KO triggers
       + Double Attack → 2 life cards removed
       + Banish → removed-from-game instead of trash

End of turn:
  M3: DON!! returned, turn passes
  M4: + END_OF_TURN effects fire
       + Temporary power/keyword modifications expire
```

### Removed-from-Game Zone (New in M4)

Banish effects require a new zone:

```typescript
interface PlayerState {
  // ... existing fields from M3 ...
  removedFromGame: CardInstance[];  // Cards banished (removed from game)
}
```

---

## Roadmap

| Step | Task | Est. |
|------|------|------|
| 1 | Finalize effect schema TypeScript types | 1 day |
| 2 | Build JSON schema validator for effectSchema | 0.5 day |
| 3 | Implement keyword system (Rush, Blocker, Banish, Double Attack, Reach) | 2–3 days |
| 4 | Implement trigger system (event listener + effect queue) | 2–3 days |
| 5 | Implement effect resolver (action executor) | 3–4 days |
| 6 | Implement target resolver (filter + player prompt) | 2–3 days |
| 7 | Implement effect stack (ordering, LIFO resolution) | 1–2 days |
| 8 | Implement effect duration tracking (this turn, this battle, permanent) | 1 day |
| 9 | Integrate effect engine into game state machine | 2–3 days |
| 10 | Author effectSchema for all OP01 cards (~120 cards) | 5–7 days |
| 11 | Author effectSchema for OP02 cards (~120 cards) | 5–7 days |
| 12 | Test each effect type in actual game scenarios | 3–5 days |
| 13 | Edge case testing (simultaneous triggers, chain effects, KO during effect) | 2–3 days |

**Total estimate: ~28–40 days**

---

## Acceptance Criteria

- [ ] All keyword abilities function correctly (Rush, Blocker, Banish, Double Attack, Reach)
- [ ] ON_PLAY effects fire and resolve when a card is played
- [ ] COUNTER effects work during the counter window
- [ ] TRIGGER effects fire when a life card is revealed
- [ ] Effects that require targeting prompt the correct player with valid targets only
- [ ] Effect costs are paid before effects resolve (DON!! return, rest, trash)
- [ ] Conditions are evaluated correctly (e.g. "if you have 3 or fewer life")
- [ ] Once-per-turn effects cannot be activated twice in the same turn
- [ ] Optional effects can be declined by the player
- [ ] Multiple simultaneous triggers are ordered by the turn player
- [ ] Power modifications expire at the correct time (end of turn, end of battle)
- [ ] All cards in OP01 have authored effectSchema and function in-game
- [ ] All cards in OP02 have authored effectSchema and function in-game
- [ ] No game-breaking bugs when effects interact with each other

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Effect interactions produce edge cases not covered by schema | Game bugs, exploits | Extensive testing against comprehensive rules; "manual override" escape hatch for unresolvable cases |
| Schema doesn't support a new card's mechanic | Can't author effect for that card | Design schema to be extensible; new ActionTypes can be added without breaking existing effects |
| Hand-authoring 240+ cards is slow | M4 takes too long | Batch by effect type (all "draw" cards at once); use templates for common patterns; consider starting LLM-assist earlier |
| Effect resolution creates lag (complex chains) | Slow game feel | Optimize resolver to batch state updates; auto-resolve obvious choices (single valid target); add animation timing to mask computation |
| Trigger ordering disputes | Player confusion | Clearly display trigger order to both players; follow comprehensive rules §8 and §9 strictly |

---

## Dependencies

- M3 complete (game state machine, WebSocket protocol, game board UI)
- Card data for OP01 + OP02 populated (M0 data pipeline)
- Comprehensive Rules document available for edge case reference

---

## References

- [OPTCG Comprehensive Rules v1.2.0](../Rules/rule_comprehensive.md) — §8 Activating and Resolving Effects, §10 Keyword Effects
- [Effect Schema Vocabulary (PRD §6)](../PRD%20-%20OPTCG%20Simulator.md) — initial schema draft

---

_Last updated: 2026-03-15_
