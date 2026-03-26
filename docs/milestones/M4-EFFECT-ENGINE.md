# M4 — Effect Engine

> Automated card effect resolution: the trigger system, effect resolver, and target resolver plug into M3's established action pipeline and event bus.

---

## Scope

M4 replaces M3's `MANUAL_EFFECT` escape hatch with automated effect resolution. The M3 pipeline and event bus are already in place. M4 adds the components that read `effectSchema` JSON from card data and execute effects programmatically.

By the end of M4, all cards in 1–2 initial sets have machine-readable effects, and the game engine resolves effects without player intervention (except when player choice is required).

### What M4 Is NOT

- **Keyword automation** — Rush, Double Attack, Banish, Blocker, Trigger, Unblockable are already automated in M3
- **Action pipeline restructuring** — M3 built the 7-step pipeline with empty stubs for steps 2 (prohibitions) and 3 (replacements); M4 fills these in
- **State model changes** — M3's `GameState` already includes `activeEffects`, `prohibitions`, `scheduledActions`, `oneTimeModifiers`, `triggerRegistry` as empty arrays; M4 populates them

### Deliverables

- [x] Effect schema TypeScript types finalized (full vocabulary for all known OPTCG mechanics) — `effect-types.ts`, 1049 lines, 80+ action types
- [ ] JSON schema validator for `effectSchema`
- [x] Trigger system: registers triggers from `effectSchema`, matches events, queues for resolution — `triggers.ts`
- [x] Effect resolver: reads `effectSchema` action chains, pays costs, executes effects — `effect-resolver.ts`
- [x] Target resolver: filters valid targets, auto-selects when only one option, prompts player — integrated into `effect-resolver.ts`
- [x] Prohibition registry active (pipeline step 2 populated) — `prohibitions.ts`
- [x] Replacement interceptor active (pipeline step 3 populated) — `replacements.ts`
- [x] Duration tracker: continuous effects, expiry waves (THIS_TURN, THIS_BATTLE, PERMANENT, WHILE_CONDITION) — `duration-tracker.ts`
- [x] Modifier layer system extended: Layer 1 (base-setting) and full Layer 2 (additive/subtractive effect modifiers) — `modifiers.ts`
- [x] One-time modifier support ("next time you play X, cost reduced by N")
- [x] Scheduled action queue (end-of-turn obligations, future-phase deferred actions)
- [x] Effect stack: LIFO stack for nested effect resolution with stack-based cost payment — `effect-stack.ts`
- [x] Cost payment with player selection: selection-based costs (TRASH_FROM_HAND, KO_OWN_CHARACTER, etc.) prompt the player instead of auto-selecting
- [x] LIFO trigger queue: nested triggers resolve newest-first per TCG stack semantics
- [ ] Hand-authored `effectSchema` for all OP01 cards (~120 cards) — 51/~120 authored so far
- [ ] Hand-authored `effectSchema` for OP02 cards (~120 cards) _(stretch)_

---

## Architecture (M4-Specific)

M4 adds an **Effect Engine** layer that plugs into M3's existing structure. The Rules Engine (M3) and Effect Engine (M4) communicate through the shared action pipeline and event bus.

```
┌─────────────────────────────────────────────────────────────────┐
│   Game Server                                                    │
│                                                                  │
│  ┌───────────────────────┐    ┌────────────────────────────────┐│
│  │   Rules Engine (M3)   │    │   Effect Engine (M4)           ││
│  │   • Phase FSM         │    │                                ││
│  │   • Action validator  │    │   ┌────────────────────────┐  ││
│  │   • Battle resolver   │◄──▶│   │  Trigger System        │  ││
│  │   • Modifier layers   │    │   │  • Registers from      │  ││
│  │   • Keyword executor  │    │   │    effectSchema on      │  ││
│  │   • Defeat checker    │    │   │    zone entry/exit      │  ││
│  └──────────┬────────────┘    │   │  • Matches events       │  ││
│             │                 │   │  • Orders, queues        │  ││
│  ┌──────────▼────────────┐    │   └────────────┬───────────┘  ││
│  │   7-Step Pipeline     │    │                │               ││
│  │   Step 2: Prohibitions│◄───│   ┌────────────▼───────────┐  ││
│  │   Step 3: Replacements│◄───│   │  Effect Resolver       │  ││
│  │   Step 5: Triggers ───┼───►│   │  • Reads effectSchema  │  ││
│  │   Step 6: Modifiers ──┼───►│   │  • Evaluates conditions│  ││
│  └──────────┬────────────┘    │   │  • Pays costs          │  ││
│             │                 │   │  • Executes action chain│  ││
│  ┌──────────▼────────────┐    │   └────────────┬───────────┘  ││
│  │   Event Bus           │    │                │               ││
│  │   (M3 established)    │───►│   ┌────────────▼───────────┐  ││
│  └───────────────────────┘    │   │  Target Resolver       │  ││
│                               │   │  • Applies filters     │  ││
│                               │   │  • Auto-selects single  │  ││
│                               │   │  • Prompts player       │  ││
│                               │   └────────────────────────┘  ││
│                               └────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Effect Schema Specification

### Top-Level Structure

Each card's `effectSchema` is an array of effect blocks. A card may have multiple independent effects.

The full schema specification is in [`docs/game-engine/01-SCHEMA-OVERVIEW.md`](../game-engine/01-SCHEMA-OVERVIEW.md) and its companion docs (02–11). What follows is the implementation-focused summary.

```typescript
interface CardEffectSchema {
  effects: EffectBlock[];
}

interface EffectBlock {
  id: string;                       // Unique within card, e.g. "e1", "e2"
  category: EffectCategory;         // auto | activate | permanent | replacement
  trigger?: Trigger;                // When this effect fires (auto/activate)
  costs?: Cost[];                   // Activation costs (paid before effect resolves)
  conditions?: Condition[];         // Must all be true for effect to be valid
  actions: Action[];                // Executed sequentially (with chain connectors)
  flags: {
    optional?: boolean;             // Player may decline to activate
    oncePerTurn?: boolean;          // Once per turn per card instance
    zone?: EffectZone;              // Where the card must be for effect to be valid
  };
}
```

See [Schema Overview](../game-engine/01-SCHEMA-OVERVIEW.md) for the full type vocabulary: all `Trigger` types, `Cost` types, `Condition` types, `Action` types, `Target` types, `Duration` types.

---

## Trigger System

### Registration

When a card enters a zone where its effects are valid:
- Field (Leader/Character/Stage area): register all `EffectBlock`s with `zone: "FIELD"` or no zone specified
- Hand: register all `EffectBlock`s with `zone: "HAND"`

On zone exit: deregister all triggers from that card's `instanceId`. Zone transitions produce a new `instanceId` (per rules §3-1-6), so replaying a card resets Once Per Turn.

### Matching (Pipeline Step 5)

When a `GameEvent` fires, scan all `RegisteredTrigger`s:
1. Event type matches the trigger's event
2. Turn restriction met (if specified)
3. DON!! requirement met (if specified)
4. Event filter satisfied (controller, cause, target filter, etc.)
5. Source card still in its valid zone
6. Once Per Turn not already consumed

### Ordering (per rules §8-6)

1. Turn player's triggers resolve before non-turn player's
2. Within a player's triggers, that player chooses order
3. During damage processing: non-[Trigger] effects queue until all damage is done; [Trigger] life card effects interrupt immediately
4. **LIFO nesting:** When a resolved trigger emits events that match new triggers, those new triggers are inserted at the front of the queue and resolve before remaining triggers from the original event — matching standard TCG stack semantics

---

## Effect Resolver

For each trigger in the ordered queue:

1. **Condition check** — evaluate block `conditions` against current state; skip if not met
2. **Optional check** — if `flags.optional`, push an `EffectStackFrame` and prompt controller; skip if declined
3. **Cost payment** — auto-pay simple costs (DON_REST, DON_MINUS) immediately; prompt player for selection-based costs (TRASH_FROM_HAND, KO_OWN_CHARACTER, etc.) via `SELECT_TARGET`; if payment fails, Once Per Turn is still consumed
4. **Action chain execution** — execute `actions` array respecting chain connectors:
   - `THEN`: execute next action regardless of prior success
   - `IF_DO`: execute only if prior action produced a result
   - `AND`: execute simultaneously with prior action (atomic)
5. **Back-references** — actions using `target_ref` resolve from prior action's `result_ref`
6. **Re-triggering** — resolved effects emit events that are scanned for new triggers; new triggers are inserted at the front of the queue (LIFO) and resolve before remaining triggers from the original event

### Effect Stack

The engine uses a LIFO effect stack (`GameState.effectStack`) for nested effect resolution. Each `EffectStackFrame` tracks a paused effect chain — its phase (optional prompt, cost selection, target selection, etc.), remaining actions, pending costs, and queued triggers.

When a player responds to a prompt, `resumeFromStack()` reads the top frame, processes the response (pay cost, select target, etc.), and either produces a new prompt or pops the frame. If popping reveals more queued triggers, those are processed before returning control to the pipeline.

This replaces the flat `ResumeContext` pattern for all new code paths. The legacy `resumeEffectChain()` remains as a fallback for any prompts created without a stack frame.

---

## Target Resolver

When an effect requires target selection:

1. Apply `TargetFilter` to current game state — compute valid targets
2. If exactly the required count of valid targets exist → auto-select (no prompt)
3. If multiple valid targets → emit `game:prompt` event to the appropriate player
4. Player selection validated server-side → effect continues
5. If `optional` and no valid targets → effect skipped (not an error)

**Prompt payload:**
```json
{
  "type": "SELECT_TARGET",
  "effectDescription": "Choose 1 opponent's Character with cost 3 or less to return to hand",
  "validTargets": ["inst-abc123", "inst-def456"],
  "countMin": 1,
  "countMax": 1,
  "optional": true,
  "timeoutMs": 30000
}
```

---

## Modifier Layer System (Extended)

M3 implemented layers 0 and DON!! bonus. M4 fills in layers 1 and 2:

```
Layer 0: Base printed value (card DB)  ← M3
Layer 1: Base-setting effects ("base power becomes X")  ← M4
Layer 2: Additive/subtractive modifiers in timestamp order  ← M4 (M3 had battle counters here)
DON!! bonus: +1000 × attachedDon, owner's turn only  ← M3
= Effective value
```

**Layer 1 conflict resolution:** When multiple base-setting effects are active on the same card, the highest value wins.

**Layer 2:** Iterate `ActiveEffect` entries with power/cost modifiers sorted by ascending `timestamp`. Power can go negative; cost is clamped to 0 for payment purposes.

**Set-to-zero:** Implemented as `-(current effective power at activation time)` — a fixed negative modifier in Layer 2, not a live recalculation.

---

## Duration Tracker

Continuous effects and their expiry:

| Duration | Expires |
|----------|--------|
| `THIS_BATTLE` | End of Battle step |
| `THIS_TURN` | End Phase (Wave 2) |
| `UNTIL_END_OF_END_PHASE` | End Phase (Wave 1) |
| `UNTIL_START_OF_YOUR_NEXT_TURN` | Next turn's Refresh Phase |
| `PERMANENT` | When source card leaves valid zone |
| `WHILE_CONDITION` | Rechecked at pipeline step 6; removed when condition becomes false |

End Phase expiry order (per rules §6-6-1-2, §6-6-1-3):
1. Turn player's "until end of turn / until end of End Phase" expire
2. Non-turn player's same expire
3. Turn player's "during this turn" expire
4. Non-turn player's same expire

---

## Prohibition Registry (Pipeline Step 2)

`ActiveProhibition` entries are registered by effect execution and scanned at step 2 of every action:

```typescript
interface ActiveProhibition {
  id: string;
  sourceCardInstanceId: string;
  type: ProhibitionType;          // CANNOT_ATTACK, CANNOT_BE_KO, CANNOT_PLAY_CARDS, etc.
  scope: ProhibitionScope;        // What cards / players this applies to
  duration: Duration;
  controller: 0 | 1;
  usesRemaining: number | null;   // null = unlimited; N = N uses before auto-expire
}
```

Per rules §1-3-3: if any active prohibition matches the proposed action, the action is vetoed. One match is sufficient. No exceptions.

---

## Replacement Interceptor (Pipeline Step 3)

Replacement effects (denoted by "instead" in card text) are checked before execution:

```typescript
interface ReplacementEffectBlock extends EffectBlock {
  replaces: {
    event: ReplacementEventType;  // WOULD_BE_KO, WOULD_LEAVE_FIELD, LIFE_ADDED_TO_HAND, etc.
    targetFilter?: TargetFilter;  // Proxy replacement: which card being affected
    causeFilter?: CauseFilter;    // Source restriction
  };
  replacementActions: Action[];   // What happens instead
}
```

Priority (per rules §8-1-3-4-3):
1. Replacement from the card that generated the situation
2. Turn player's replacements (turn player chooses order)
3. Non-turn player's replacements (non-turn player chooses order)

Once a replacement is applied to a specific event occurrence, that same replacement cannot intercept the result.

---

## Effect Authoring Process

For M4, every card in the initial sets gets a hand-authored `effectSchema`.

### Workflow

1. Read card text from the database
2. Decompose into effect blocks (trigger, cost, conditions, actions)
3. Write `effectSchema` JSON following the schema spec
4. Validate with the JSON schema validator
5. Test in the simulator
6. Store in the `cards.effectSchema` JSON column

### Coverage Priority Order

1. **Draw effects** — "Draw N cards" (most common by card count)
2. **Power buffs/debuffs** — "+N000 power during this turn"
3. **KO/removal** — "KO opponent's Character with cost N or less"
4. **Return to hand/deck** — Bounce effects
5. **Search/tutor** — "Look at top N cards, add 1 matching filter to hand"
6. **DON!! manipulation** — Attach/return DON!!
7. **Life manipulation** — Add/remove life cards
8. **Conditional effects** — "If you have 2 or fewer life..."
9. **Multi-step chains** — "Do X, then do Y"
10. **Replacement and prohibition effects** — "Instead of...", "cannot..."

### Example: Simple Card

**Card text:** "On Play: Draw 1 card."

```json
{
  "effects": [{
    "id": "e1",
    "category": "auto",
    "trigger": { "event": "ON_PLAY" },
    "actions": [{
      "type": "DRAW",
      "target": { "type": "PLAYER", "controller": "self", "count": 1 },
      "params": { "count": 1 }
    }],
    "flags": { "optional": false }
  }]
}
```

### Example: Activate Effect with Cost and Condition

**Card text:** "Activate: Main Once Per Turn (You may rest this card): Give up to 1 of your opponent's Characters with a cost of 5 or less −2000 power during this turn."

```json
{
  "effects": [{
    "id": "e1",
    "category": "activate",
    "trigger": { "event": "ACTIVATE_MAIN" },
    "costs": [{ "type": "REST_SELF" }],
    "actions": [{
      "type": "MODIFY_POWER",
      "target": {
        "type": "CHARACTER",
        "controller": "opponent",
        "count": { "min": 0, "max": 1 },
        "filter": { "costMax": 5 }
      },
      "params": { "amount": -2000 },
      "duration": "THIS_TURN"
    }],
    "flags": { "optional": true, "oncePerTurn": true }
  }]
}
```

---

## Game Flow Changes (M3 → M4)

M4 extends M3's game flow at the points where `MANUAL_EFFECT` was used:

```
Card played from hand:
  M3: Card placed on board, cost paid, MANUAL_EFFECT for any On Play text
  M4: Trigger system fires ON_PLAY → Effect Resolver executes action chain

Attack declared:
  M3: Attacker rested, target selected
  M4: + ON_ATTACK / WHEN_ATTACKING triggers fire automatically

Counter step:
  M3: MANUAL_EFFECT for Counter Event effects
  M4: Counter Event effects execute automatically via Effect Resolver

Damage resolution:
  M3: Keywords handled; MANUAL_EFFECT for Trigger effect text
  M4: [Trigger] effect text from life card executes via Effect Resolver

End of turn:
  M3: Phase transition
  M4: + END_OF_TURN auto effects fire automatically
       + Continuous modifiers expire via Duration Tracker
```

After M4 ships, `MANUAL_EFFECT` actions should be rare — only for edge cases not yet in the schema or genuinely unimplemented mechanics.

### Game Board UI (implemented in M3.75 and M4)

The visual game board supports all M4 effect interactions:

- **OptionalEffectModal** — prompts player to accept/decline optional effects
- **SelectTargetModal** — target selection for effects and cost payment (reused for TRASH_FROM_HAND, etc.)
- **PlayerChoiceModal** — multi-option branches ("Choose one:")
- **ArrangeTopCardsModal** — search deck results (keep 1, arrange rest)
- **RevealTriggerModal** — life card trigger accept/decline
- **CardActionMenu** — context menu for activate effects on field cards
- **EventLog** — displays effect resolution events in real time
- **DevTestPanel** — dev-mode panel for testing effect scenarios

---

## Roadmap

| Step | Task | Status |
|------|------|--------|
| 1 | Finalize effect schema TypeScript types (full vocabulary) | Done |
| 2 | Build JSON schema validator for `effectSchema` | Not started |
| 3 | Implement trigger registration and deregistration (zone entry/exit) | Done |
| 4 | Implement trigger matching (event type, filters, zone validity, once-per-turn) | Done |
| 5 | Implement trigger ordering (turn-player-first, damage processing exception) | Done |
| 6 | Implement effect resolver (cost payment, condition evaluation, action chain execution) | Done |
| 7 | Implement target resolver (filter computation, auto-select, player prompt) | Done |
| 8 | Implement duration tracker (all expiry waves, WHILE_CONDITION recalculation) | Done |
| 9 | Extend modifier layer system (Layer 1 base-setting, full Layer 2) | Done |
| 10 | Implement prohibition registry (pipeline step 2 active) | Done |
| 11 | Implement replacement interceptor (pipeline step 3 active) | Done |
| 12 | Implement scheduled action queue (end-of-turn obligations) | Done |
| 13 | Implement one-time modifiers | Done |
| 14 | Implement effect stack (LIFO nested resolution, stack-based cost payment) | Done |
| 15 | Implement cost payment with player selection (TRASH_FROM_HAND, etc.) | Done |
| 16 | Implement LIFO trigger queue (nested triggers resolve newest-first) | Done |
| 17 | Author `effectSchema` for all OP01 cards (~120 cards) | 51/~120 done |
| 18 | Test each effect type in actual game scenarios | Ongoing |
| 19 | Edge case testing (simultaneous triggers, chains, KO during effect) | Ongoing |
| 20 | Author `effectSchema` for OP02 cards (~120 cards) _(stretch)_ | Not started |

---

## Acceptance Criteria

- [x] ON_PLAY effects fire and resolve when a card is played
- [x] WHEN_ATTACKING effects fire at Attack Step
- [x] COUNTER effects resolve automatically during Counter Step
- [x] [Trigger] effect text from life cards executes via effect resolver (not just keyword prompt)
- [x] ON_KO effects fire with correct two-phase semantics (activate on field, resolve in trash)
- [x] END_OF_TURN effects fire automatically during End Phase
- [x] Effects that require targeting prompt the correct player with valid targets only
- [x] Effect costs are paid before effects resolve (DON!! return, rest, trash) — now with player selection for TRASH_FROM_HAND etc.
- [x] Conditions are evaluated correctly (life count, character count, DON!! threshold, etc.)
- [x] Once-per-turn effects cannot be activated twice in the same turn
- [x] Optional effects can be declined by the player
- [x] Multiple simultaneous triggers are ordered correctly (turn player first, player chooses among their own)
- [x] Power modifications expire at the correct time (THIS_BATTLE, THIS_TURN, PERMANENT)
- [x] Prohibitions correctly block prohibited actions
- [x] Replacement effects correctly substitute actions and suppress original
- [ ] "Cannot X" effects cannot be bypassed by simultaneous "do X" instructions — needs testing
- [ ] All cards in OP01 have authored `effectSchema` and function correctly in-game — 51/~120 done
- [ ] `MANUAL_EFFECT` usage is near zero for OP01/OP02 cards after M4

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Schema vocabulary gaps (new mechanics not covered) | Can't author some cards | Design schema extensibly; new `ActionType`s and `TriggerType`s can be added without breaking existing entries |
| Simultaneous trigger ordering disputes | Player confusion | Display trigger order clearly to both players; follow rules §8-6 strictly |
| Effect interactions create bugs (buff + KO + replacement) | Game-breaking edge cases | Extensive testing against the comprehensive rules; MANUAL_EFFECT escape hatch for unresolvable cases |
| Hand-authoring 120+ cards is slow | M4 timeline slips | Batch by effect type; use templates for common patterns |
| Effect resolution lag on complex chains | Poor game feel | Optimize resolver to batch state updates; auto-resolve obvious single-target choices |

---

## Tech Debt

### Pre-game rule modifications not enforced in deck builder

Cards with `rule_modification` effects that alter deck construction rules (deck restrictions, copy limit overrides, DON deck size changes) are encoded in the effect schema but **not enforced by the deck validation engine** (`src/lib/deck-builder/validation.ts`). The validator currently hardcodes universal rules (4-copy limit, 50 cards, color affinity) and has no awareness of leader-specific or card-specific rule modifications.

**Known cards requiring this:**
- **OP01-075 Pacifista** — `COPY_LIMIT_OVERRIDE`: "you may have any number of this card in your deck"
- **OP12-001 Silvers Rayleigh** (Leader) — `DECK_RESTRICTION`: "you cannot include cards with a cost of 5 or more in your deck"
- **OP13-079 Imu** (Leader) — `DECK_RESTRICTION` + `START_OF_GAME_EFFECT`: "you cannot include Events with a cost of 2 or more in your deck" + "at the start of the game, play up to 1 {Mary Geoise} type Stage card from your deck"

**Recommended approach:** Static lookup tables in the validator keyed by card ID — not dynamic schema interpretation. There are fewer than 10 cards across the entire game with these rules. `START_OF_GAME_EFFECT` should execute in `buildInitialState()` after deck setup but before turn 1.

**When to address:** When encoding the sets containing these cards (OP01, OP12, OP13).

---

## Dependencies

- M3 complete (7-step pipeline, event bus, immutable state model, WebSocket sync, game board UI)
- Card data for OP01 populated (M0 data pipeline)
- Effect schema spec docs finalized (docs/game-engine/)

---

## References

- [Schema Overview](../game-engine/01-SCHEMA-OVERVIEW.md) — effect schema type vocabulary
- [Triggers](../game-engine/02-TRIGGERS.md) — all trigger types
- [Conditions](../game-engine/03-CONDITIONS.md) — condition types
- [Actions](../game-engine/04-ACTIONS.md) — action types
- [Targeting](../game-engine/05-TARGETING.md) — target specification
- [Prohibitions & Replacements](../game-engine/06-PROHIBITIONS-AND-REPLACEMENTS.md)
- [Engine Architecture](../game-engine/08-ENGINE-ARCHITECTURE.md) — component design
- [Encoding Guide](../game-engine/11-ENCODING-GUIDE.md) — authoring handbook
- [OPTCG Comprehensive Rules v1.2.0](../rules/rule_comprehensive.md) — §8 Effects, §10 Keywords

---

_Last updated: 2026-03-26_
