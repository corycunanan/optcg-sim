# 04 — Action Primitives

> Actions are the atomic operations the engine executes when resolving an effect. Each action performs exactly one discrete game state mutation — drawing a card, K.O.'ing a character, modifying power, etc. Complex effects are composed by chaining multiple actions together using the connectors defined in [Schema Overview](./01-SCHEMA-OVERVIEW.md). Impossible actions are ignored per comprehensive rules 1-3-2.

**Related docs:** [Schema Overview](./01-SCHEMA-OVERVIEW.md) · [Targeting](./05-TARGETING.md) · [Triggers](./02-TRIGGERS.md) · [Engine Architecture](./08-ENGINE-ARCHITECTURE.md)

---

## Action Structure

Every action conforms to the `Action` interface defined in [Schema Overview](./01-SCHEMA-OVERVIEW.md):

```typescript
interface Action {
  type: ActionType;
  target?: Target;
  params?: Record<string, any>;
  duration?: Duration;
  chain?: ChainConnector;
  target_ref?: string;
  result_ref?: string;
  conditions?: Condition;
}
```

- `type` — The action primitive to execute (see [ActionType union](#action-type-definition)).
- `target` — What the action operates on. References the [Target](./05-TARGETING.md) type system.
- `params` — Action-specific parameters. Each primitive defines its own params interface.
- `duration` — How long the action's effect persists (for modifiers). See [Schema Overview — Duration Types](./01-SCHEMA-OVERVIEW.md).
- `chain` — Connector to the next action: `THEN`, `IF_DO`, or `AND`.
- `target_ref` — Resolves this action's target from a prior action's `result_ref`.
- `result_ref` — Assigns a reference ID for later actions to use via `target_ref` or `DynamicValue`.
- `conditions` — Inline condition that gates this specific action without affecting the rest of the chain.

---

## Action Type Definition

The complete `ActionType` union. Every action the engine can execute is a member of this enum.

```typescript
type ActionType =
  // Card Movement
  | "DRAW"
  | "SEARCH_DECK"
  | "TRASH_CARD"
  | "KO"
  | "RETURN_TO_HAND"
  | "RETURN_TO_DECK"
  | "PLAY_CARD"
  | "ADD_TO_LIFE"
  | "MILL"
  | "REVEAL"
  | "FULL_DECK_SEARCH"
  | "DECK_SCRY"
  | "SEARCH_TRASH_THE_REST"
  | "SEARCH_AND_PLAY"
  | "PLACE_HAND_TO_DECK"
  | "HAND_WHEEL"
  | "REVEAL_HAND"
  | "SHUFFLE_DECK"

  // Power & Stats
  | "MODIFY_POWER"
  | "SET_BASE_POWER"
  | "MODIFY_COST"
  | "SET_POWER_TO_ZERO"
  | "SWAP_BASE_POWER"
  | "COPY_POWER"
  | "SET_COST"

  // Keywords
  | "GRANT_KEYWORD"
  | "NEGATE_EFFECTS"

  // DON!!
  | "GIVE_DON"
  | "RETURN_DON_TO_DECK"
  | "ADD_DON_FROM_DECK"
  | "SET_DON_ACTIVE"
  | "REST_DON"
  | "REDISTRIBUTE_DON"
  | "FORCE_OPPONENT_DON_RETURN"
  | "REST_OPPONENT_DON"
  | "GIVE_OPPONENT_DON_TO_OPPONENT"
  | "DISTRIBUTE_DON"
  | "RETURN_ATTACHED_DON_TO_COST"

  // State Change
  | "SET_ACTIVE"
  | "SET_REST"
  | "APPLY_PROHIBITION"
  | "REMOVE_PROHIBITION"

  // Meta / Flow
  | "PLAYER_CHOICE"
  | "OPPONENT_CHOICE"
  | "CHOOSE_VALUE"
  | "WIN_GAME"
  | "OPPONENT_ACTION"
  | "EXTRA_TURN"
  | "SCHEDULE_ACTION"

  // Life Card
  | "TURN_LIFE_FACE_UP"
  | "TURN_LIFE_FACE_DOWN"
  | "TURN_ALL_LIFE_FACE_DOWN"
  | "LIFE_SCRY"
  | "REORDER_ALL_LIFE"
  | "ADD_TO_LIFE_FROM_DECK"
  | "ADD_TO_LIFE_FROM_HAND"
  | "ADD_TO_LIFE_FROM_FIELD"
  | "PLAY_FROM_LIFE"
  | "LIFE_TO_HAND"
  | "TRASH_FROM_LIFE"
  | "DRAIN_LIFE_TO_THRESHOLD"
  | "LIFE_CARD_TO_DECK"
  | "TRASH_FACE_UP_LIFE"

  // Battle
  | "REDIRECT_ATTACK"
  | "DEAL_DAMAGE"
  | "SELF_TAKE_DAMAGE"

  // Effect / Meta
  | "ACTIVATE_EVENT_FROM_HAND"
  | "ACTIVATE_EVENT_FROM_TRASH"
  | "REUSE_EFFECT"
  | "NEGATE_TRIGGER_TYPE"
  | "GRANT_ATTRIBUTE"
  | "GRANT_COUNTER";
```

---

## Card Movement Actions

Actions that move cards between zones. The largest and most diverse action family.

### DRAW

Draw cards from the top of the controller's deck into their hand.

```typescript
interface DrawParams {
  amount: number | DynamicValue;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (always the controller's deck/hand) |
| **Failure mode** | If the deck has fewer cards than `amount`, draw as many as possible. If the deck is empty, the action is ignored. Deck-out loss is checked separately. |
| **Fired events** | `CARD_DRAWN` per card (triggers `DRAW_OUTSIDE_DRAW_PHASE` if not during Draw Phase) |
| **Example cards** | OP01-004 Usopp, EB04-044 Koby |

```json
{
  "type": "DRAW",
  "params": { "amount": 2 }
}
```

Dynamic amount — EB04-011: "Draw a card for each of your {Neptunian} type Characters."

```json
{
  "type": "DRAW",
  "params": {
    "amount": {
      "type": "PER_COUNT",
      "source": "MATCHING_CHARACTERS_ON_FIELD",
      "multiplier": 1
    }
  },
  "result_ref": "draw_count"
}
```

---

### SEARCH_DECK

Look at the top N cards of the deck, select up to M matching a filter, add them to hand, and place the rest at a destination.

```typescript
interface SearchDeckParams {
  look_at: number;
  pick: { up_to: number };
  filter: TargetFilter;
  rest_destination: "TOP" | "BOTTOM" | "SHUFFLE";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (always the controller's deck) |
| **Failure mode** | If the deck has fewer than `look_at` cards, look at all remaining. If no cards match `filter`, pick 0 and place all at `rest_destination`. |
| **Fired events** | `CARD_SEARCHED` (for trigger system visibility; the revealed cards are private to the controller) |
| **Example cards** | OP01-116, ST03-007, OP03-086 |

```json
{
  "type": "SEARCH_DECK",
  "params": {
    "look_at": 5,
    "pick": { "up_to": 1 },
    "filter": { "traits": ["Straw Hat Crew"], "card_type": "CHARACTER" },
    "rest_destination": "BOTTOM"
  }
}
```

---

### TRASH_CARD

Move a card from its current zone to the trash. Does NOT fire K.O. triggers. Distinct from `KO` — trashing bypasses the K.O. event pipeline entirely.

```typescript
interface TrashCardParams {
  source_zone?: Zone;
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to trash |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `CARD_TRASHED` (zone-specific: `CARD_TRASHED_FROM_HAND`, `CARD_TRASHED_FROM_FIELD`, etc.) |
| **Example cards** | OP03-001 Ace (trash from hand), OP13-082 Five Elders (trash from field) |

```json
{
  "type": "TRASH_CARD",
  "target": {
    "controller": "SELF",
    "zone": "HAND",
    "count": { "up_to": 2 }
  }
}
```

The KO vs TRASH distinction is critical: `KO` fires `CARD_KO` and triggers all `[On K.O.]` effects. `TRASH_CARD` fires `CARD_TRASHED` and does not trigger `[On K.O.]` effects. Cards like OP03-012 use "trash" as a cost specifically to avoid triggering opponent's On K.O. effects.

---

### KO

K.O. a Character or Stage, moving it from the field to the trash. Fires the `CARD_KO` event which triggers `[On K.O.]` effects.

```typescript
interface KOParams {
  // No additional params beyond target
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to K.O. — Characters, Stages, or both |
| **Failure mode** | If no valid targets exist, the action is ignored. Cards with K.O. protection (via Prohibition) are not valid targets. |
| **Fired events** | `CARD_KO` per K.O.'d card. The event carries the cause (`EFFECT`) and source card reference. Triggers `ON_KO`, `OPPONENT_CHARACTER_KO`, `ANY_CHARACTER_KO` as appropriate. |
| **Example cards** | OP05-102 Gedatsu, OP02-118 Yasakani (Stage KO) |

Standard K.O.:

```json
{
  "type": "KO",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": { "cost": { "operator": "<=", "value": 4 } }
  }
}
```

Board wipe — OP01-094 Kaido: "K.O. all Characters other than this Character."

```json
{
  "type": "KO",
  "target": {
    "controller": "ANY",
    "card_type": "CHARACTER",
    "count": "ALL",
    "filter": { "exclude_self": true }
  }
}
```

Board wipe patterns do not require a separate primitive. They use `KO` with broad targeting: `count: "ALL"` combined with `controller: "ANY"`, `"SELF"`, or `"OPPONENT"` and optional filters. Examples:

| Pattern | Targeting | Example Cards |
|---------|-----------|---------------|
| All Characters except self (both sides) | `controller: "ANY"`, `exclude_self: true` | OP01-094 Kaido |
| All Characters with cost ≤ N (both sides) | `controller: "ANY"`, `filter: { cost: ... }` | ST08-005 Shanks |
| All opponent's Characters with filter | `controller: "OPPONENT"`, `count: "ALL"` | OP15-114 Wyper |
| All your own Characters | `controller: "SELF"`, `count: "ALL"` | OP13-082 Five Elders |

Stage K.O. — OP02-118 Yasakani:

```json
{
  "type": "KO",
  "target": {
    "controller": "OPPONENT",
    "card_type": "STAGE",
    "count": { "up_to": 1 },
    "filter": { "cost": { "operator": "<=", "value": 3 } }
  }
}
```

---

### RETURN_TO_HAND

Return a card from the field to the owner's hand. Commonly called "bounce." Does not fire K.O. triggers.

```typescript
interface ReturnToHandParams {
  // No additional params beyond target
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to return |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `CARD_RETURNED_TO_HAND` (triggers `CHARACTER_RETURNED_TO_HAND` when applicable) |
| **Example cards** | OP01-002 Trafalgar Law, EB01-028 |

```json
{
  "type": "RETURN_TO_HAND",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": { "cost": { "operator": "<=", "value": 3 } }
  },
  "result_ref": "returned_card"
}
```

---

### RETURN_TO_DECK

Place a card from the field at the top or bottom of the owner's deck.

```typescript
interface ReturnToDeckParams {
  position: "TOP" | "BOTTOM";
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to return |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `CARD_RETURNED_TO_DECK` |
| **Example cards** | OP04-047 Ice Oni, P-055 |

```json
{
  "type": "RETURN_TO_DECK",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": { "cost": { "operator": "<=", "value": 5 } }
  },
  "params": { "position": "BOTTOM" }
}
```

---

### PLAY_CARD

Play a card onto the field from a source zone. The most complex action primitive due to the variety of source zones, play states, and cost overrides.

```typescript
interface PlayCardParams {
  source_zone: "HAND" | "TRASH" | "DECK" | "LIFE";
  play_state?: "ACTIVE" | "RESTED";
  cost_override: "FREE" | "REDUCED" | "NORMAL";
  cost_reduction?: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to play, scoped to `source_zone` with filters |
| **Failure mode** | If no valid cards exist in the source zone matching the filter, the action is ignored. If the play would be blocked by a prohibition (e.g., "cannot play Characters"), it is ignored. |
| **Fired events** | `CARD_PLAYED` (triggers `ON_PLAY`, `CHARACTER_PLAYED`). The event carries `source_zone` and `play_method` metadata. |
| **Example cards** | OP01-116, OP03-094, OP06-062 Vinsmoke Judge |

`play_state` defaults to `"ACTIVE"` when omitted. Some effects explicitly play cards rested.

`cost_override` determines how the play cost is handled:
- `"FREE"` — No cost is paid. The card enters the field at zero cost. Most "play by effect" actions use this.
- `"REDUCED"` — The card's play cost is reduced by `cost_reduction`. The player still pays the remainder.
- `"NORMAL"` — The card is played at full cost. Rare for effect-based plays.

Play from hand (free):

```json
{
  "type": "PLAY_CARD",
  "target": {
    "zone": "HAND",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": { "cost": { "operator": "<=", "value": 5 }, "traits": ["Straw Hat Crew"] }
  },
  "params": { "source_zone": "HAND", "cost_override": "FREE" }
}
```

Play from trash rested — OP13-082 Five Elders:

```json
{
  "type": "PLAY_CARD",
  "target": {
    "zone": "TRASH",
    "card_type": "CHARACTER",
    "count": { "up_to": 5 },
    "filter": {
      "traits": ["Five Elders"],
      "power": { "operator": "==", "value": 5000 },
      "unique_names": true
    }
  },
  "params": { "source_zone": "TRASH", "cost_override": "FREE" }
}
```

Play from deck (via search) — OP01-116:

```json
{
  "type": "PLAY_CARD",
  "target": {
    "zone": "DECK",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": { "cost": { "operator": "<=", "value": 4 } }
  },
  "params": { "source_zone": "DECK", "cost_override": "FREE" }
}
```

Play from life — OP10-022 Trafalgar Law: see [PLAY_FROM_LIFE](#play_from_life).

---

### ADD_TO_LIFE

Add a card to a player's Life area. This is the general "put into Life" action when the source is NOT one of the specific zones covered by `ADD_TO_LIFE_FROM_DECK`, `ADD_TO_LIFE_FROM_HAND`, or `ADD_TO_LIFE_FROM_FIELD`. Typically used by the damage/Life replenishment rules.

```typescript
interface AddToLifeParams {
  position: "TOP" | "BOTTOM";
  face: "UP" | "DOWN";
}
```

| Field | Value |
|-------|-------|
| **Target** | Implicit (the card being added) or specified via prior chain reference |
| **Failure mode** | If no card is available, the action is ignored. |
| **Fired events** | `CARD_ADDED_TO_LIFE` |
| **Example cards** | OP05-098 Enel, ST07-005 |

See the [Life Card Actions](#life-card-actions) section for the zone-specific variants.

---

### MILL

Move cards from the top of a player's deck directly to their trash without revealing them (unless otherwise specified).

```typescript
interface MillParams {
  amount: number;
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's deck) |
| **Failure mode** | If the deck has fewer cards than `amount`, mill as many as possible. |
| **Fired events** | `CARD_MILLED` per card |
| **Example cards** | OP03-040 Nami, various "trash from the top of your deck" effects |

```json
{
  "type": "MILL",
  "params": { "amount": 1 }
}
```

---

### REVEAL

Reveal a card or cards to both players. Revealing does not move the card — it makes hidden information public. Often a precursor to a conditional action.

```typescript
interface RevealParams {
  source_zone: Zone;
  count?: number;
  filter?: TargetFilter;
}
```

| Field | Value |
|-------|-------|
| **Target** | Implicit (top of deck, or card in hand matching filter) |
| **Failure mode** | If no card matches or the source is empty, the action is ignored. |
| **Fired events** | `CARD_REVEALED` |
| **Example cards** | OP05-076 When You're at Sea, OP11-066 Charlotte Oven |

```json
{
  "type": "REVEAL",
  "params": {
    "source_zone": "DECK",
    "count": 1
  },
  "result_ref": "revealed_card"
}
```

---

### FULL_DECK_SEARCH

Search the entire deck (not just top N) for a card matching a filter, add it to hand, then shuffle the deck. More powerful than `SEARCH_DECK` as it guarantees finding the card if it exists.

```typescript
interface FullDeckSearchParams {
  pick: { up_to: number };
  filter: TargetFilter;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (always the controller's deck) |
| **Failure mode** | If no cards match the filter, the player picks 0 cards. The deck is still shuffled. |
| **Fired events** | `CARD_SEARCHED`, `DECK_SHUFFLED` |
| **Example cards** | ST03-007 Sentomaru |

```json
{
  "type": "FULL_DECK_SEARCH",
  "params": {
    "pick": { "up_to": 1 },
    "filter": { "card_type": "CHARACTER", "traits": ["Navy"] }
  }
}
```

---

### DECK_SCRY

Look at the top N cards of the deck and rearrange each individually to the top or bottom. No cards are added to hand — this is pure deck manipulation.

```typescript
interface DeckScryParams {
  count: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (always the controller's deck) |
| **Failure mode** | If the deck has fewer than `count` cards, scry all remaining. |
| **Fired events** | None (private information rearrangement) |
| **Example cards** | OP01-073, ST03-010, OP07-039 |

```json
{
  "type": "DECK_SCRY",
  "params": { "count": 5 }
}
```

The controller looks at the top N cards, then places each card at either the top or bottom of the deck in any order.

---

### SEARCH_TRASH_THE_REST

Look at the top N cards, pick up to M matching a filter, and trash the remainder (instead of placing them at the bottom of the deck). A variant of `SEARCH_DECK` where unselected cards go to trash.

```typescript
interface SearchTrashTheRestParams {
  look_at: number;
  pick: { up_to: number };
  filter: TargetFilter;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (always the controller's deck) |
| **Failure mode** | If the deck has fewer than `look_at` cards, look at all remaining. If no cards match, all are trashed. |
| **Fired events** | `CARD_SEARCHED`, `CARD_TRASHED` per discarded card |
| **Example cards** | OP03-086, OP09-096, EB04-029 |

```json
{
  "type": "SEARCH_TRASH_THE_REST",
  "params": {
    "look_at": 5,
    "pick": { "up_to": 1 },
    "filter": { "card_type": "CHARACTER", "cost": { "operator": "<=", "value": 4 } }
  }
}
```

---

### SEARCH_AND_PLAY

Look at the top N cards, select a matching card, and play it directly to the field (not to hand). Unselected cards go to a destination. Combines search and play into one atomic operation.

```typescript
interface SearchAndPlayParams {
  look_at: number;
  pick: { up_to: number };
  filter: TargetFilter;
  play_state?: "ACTIVE" | "RESTED";
  cost_override: "FREE" | "REDUCED" | "NORMAL";
  rest_destination: "TOP" | "BOTTOM" | "TRASH" | "SHUFFLE";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's deck) |
| **Failure mode** | If no cards match, pick 0. All looked-at cards go to `rest_destination`. |
| **Fired events** | `CARD_SEARCHED`, `CARD_PLAYED` (triggers `ON_PLAY`, `CHARACTER_PLAYED`) |
| **Example cards** | OP01-116, OP03-094, OP04-084 |

```json
{
  "type": "SEARCH_AND_PLAY",
  "params": {
    "look_at": 5,
    "pick": { "up_to": 1 },
    "filter": { "card_type": "CHARACTER", "cost": { "operator": "<=", "value": 4 } },
    "cost_override": "FREE",
    "rest_destination": "BOTTOM"
  }
}
```

---

### PLACE_HAND_TO_DECK

Place card(s) from the controller's hand to the top or bottom of their deck. The controller chooses which cards to place.

```typescript
interface PlaceHandToDeckParams {
  amount: number;
  position: "TOP" | "BOTTOM";
  filter?: TargetFilter;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's hand) |
| **Failure mode** | If the hand has fewer qualifying cards than `amount`, place as many as possible. |
| **Fired events** | `CARD_PLACED_TO_DECK` |
| **Example cards** | OP01-011, OP04-053, OP05-046 |

```json
{
  "type": "PLACE_HAND_TO_DECK",
  "params": { "amount": 1, "position": "BOTTOM" }
}
```

---

### HAND_WHEEL

Return all cards from hand to deck (bottom or shuffle), then draw the same number. A complete hand replacement.

```typescript
interface HandWheelParams {
  return_mode: "BOTTOM" | "SHUFFLE";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's hand and deck) |
| **Failure mode** | If the hand is empty, the action is ignored. If the deck has fewer cards than were returned, draw as many as possible. |
| **Fired events** | `CARD_PLACED_TO_DECK` per returned card, `CARD_DRAWN` per drawn card |
| **Example cards** | OP04-048 Sasaki, P-002 |

The `result_ref` captures the count of cards returned, enabling dynamic draw amounts:

```json
{
  "type": "HAND_WHEEL",
  "params": { "return_mode": "BOTTOM" },
  "result_ref": "returned_count"
}
```

---

### REVEAL_HAND

Force the opponent to reveal their entire hand to the controller. No cards are moved.

```typescript
interface RevealHandParams {
  controller: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's hand) |
| **Failure mode** | If the hand is empty, the action resolves successfully with zero revealed cards. |
| **Fired events** | `HAND_REVEALED` |
| **Example cards** | OP07-090 Morgans |

```json
{
  "type": "REVEAL_HAND",
  "params": { "controller": "OPPONENT" }
}
```

---

### SHUFFLE_DECK

Shuffle a player's deck. Used when an explicit shuffle is required outside of a search operation.

```typescript
interface ShuffleDeckParams {
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's deck) |
| **Failure mode** | Never fails. |
| **Fired events** | `DECK_SHUFFLED` |
| **Example cards** | OP06-047, OP08-071 |

```json
{
  "type": "SHUFFLE_DECK"
}
```

---

## Power & Stats Actions

Actions that modify the numeric properties (power, cost) of cards.

### MODIFY_POWER

Add or subtract power from a card. The modification can be permanent, turn-scoped, or battle-scoped per the `duration` field.

```typescript
interface ModifyPowerParams {
  amount: number | DynamicValue;
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to modify |
| **Failure mode** | If no valid targets exist, the action is ignored. Power cannot drop below 0 for the purpose of game rules checks. |
| **Fired events** | `POWER_MODIFIED`. If a Character's power reaches 0 or less during a turn where a "K.O. if power is 0" rule applies, the engine handles that separately. |
| **Example cards** | OP01-029 Radical Beam, OP11-006 Zephyr |

Power boost:

```json
{
  "type": "MODIFY_POWER",
  "target": {
    "controller": "SELF",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "params": { "amount": 2000 },
  "duration": { "type": "THIS_TURN" }
}
```

Power reduction (negative amount):

```json
{
  "type": "MODIFY_POWER",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": { "attribute": "SPECIAL" }
  },
  "params": { "amount": -5000 },
  "duration": { "type": "THIS_TURN" }
}
```

---

### SET_BASE_POWER

Set a card's base power to a specific value, overriding the printed value. Distinct from `MODIFY_POWER` which adds/subtracts from the current effective power.

```typescript
interface SetBasePowerParams {
  value: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `BASE_POWER_SET` |
| **Example cards** | Various Leader-power-reduction effects |

```json
{
  "type": "SET_BASE_POWER",
  "target": { "controller": "SELF", "card_type": "LEADER" },
  "params": { "value": 0 },
  "duration": { "type": "THIS_TURN" }
}
```

---

### MODIFY_COST

Add or subtract from a card's play cost. Used for cost reduction effects (negative) or cost increase effects (positive). Typically applied to cards in hand.

```typescript
interface ModifyCostParams {
  amount: number | DynamicValue;
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) — often scoped to HAND zone |
| **Failure mode** | If no valid targets exist, the action is ignored. Cost cannot be reduced below 0. |
| **Fired events** | `COST_MODIFIED` |
| **Example cards** | OP01-067, OP05-097 Mary Geoise, EB04-061 |

```json
{
  "type": "MODIFY_COST",
  "target": {
    "controller": "SELF",
    "zone": "HAND",
    "filter": { "color": "BLUE", "card_type": "EVENT" }
  },
  "params": { "amount": -1 },
  "duration": { "type": "THIS_TURN" }
}
```

---

### SET_POWER_TO_ZERO

Set a card's effective power to 0. A specialized form of power manipulation that zeroes out all power including buffs.

```typescript
interface SetPowerToZeroParams {
  // No additional params
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `POWER_SET_TO_ZERO` |
| **Example cards** | Various "reduce power to 0" effects |

```json
{
  "type": "SET_POWER_TO_ZERO",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "duration": { "type": "THIS_TURN" }
}
```

---

### SWAP_BASE_POWER

Exchange the base power values between two cards. After resolution, card A has card B's original base power and vice versa.

```typescript
interface SwapBasePowerParams {
  // No additional params — operates on exactly two targets
}
```

| Field | Value |
|-------|-------|
| **Target** | Requires exactly two targets — the two cards whose base power will be swapped. Encoded as a dual target reference. |
| **Failure mode** | If either target is invalid or only one target can be selected, the action is ignored. |
| **Fired events** | `BASE_POWER_SWAPPED` |
| **Example cards** | OP14-001, OP14-009, OP14-017 |

```json
{
  "type": "SWAP_BASE_POWER",
  "target": {
    "targets": [
      { "controller": "SELF", "card_type": "CHARACTER", "count": { "exact": 1 } },
      { "controller": "OPPONENT", "card_type": "CHARACTER", "count": { "exact": 1 } }
    ]
  },
  "duration": { "type": "THIS_TURN" }
}
```

---

### COPY_POWER

Set a card's base power to match another card's current effective power.

```typescript
interface CopyPowerParams {
  source_ref: string;
}
```

| Field | Value |
|-------|-------|
| **Target** | The card whose power will be overwritten |
| **Failure mode** | If the source reference is invalid or the target is invalid, the action is ignored. |
| **Fired events** | `POWER_COPIED` |
| **Example cards** | OP04-069 Mr.2, OP06-009 Shuraiya, EB01-061, EB04-052 |

```json
{
  "type": "COPY_POWER",
  "target": { "controller": "SELF", "card_type": "CHARACTER", "self_ref": true },
  "params": { "source_ref": "target_character" },
  "duration": { "type": "THIS_TURN" }
}
```

---

### SET_COST

Set a card's cost to a specific fixed value.

```typescript
interface SetCostParams {
  value: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `COST_SET` |
| **Example cards** | OP03-091 Helmeppo ("Set the cost...to 0") |

```json
{
  "type": "SET_COST",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "params": { "value": 0 },
  "duration": { "type": "THIS_TURN" }
}
```

---

## Keyword Actions

Actions that grant or negate keywords and effects.

### GRANT_KEYWORD

Grant a keyword ability to a card. The keyword is active for the specified duration.

```typescript
interface GrantKeywordParams {
  keyword: Keyword;
}

type Keyword =
  | "RUSH"
  | "BLOCKER"
  | "DOUBLE_ATTACK"
  | "BANISH"
  | "UNBLOCKABLE"
  | "RUSH_CHARACTER"
  | "CAN_ATTACK_ACTIVE";
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) receive the keyword |
| **Failure mode** | If no valid targets exist, the action is ignored. Granting a keyword a card already has is redundant but not an error. |
| **Fired events** | `KEYWORD_GRANTED` |
| **Example cards** | OP09-084 Catarina Devon, OP01-021 Franky |

```json
{
  "type": "GRANT_KEYWORD",
  "target": {
    "controller": "SELF",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "params": { "keyword": "RUSH" },
  "duration": { "type": "THIS_TURN" }
}
```

`CAN_ATTACK_ACTIVE` is a distinct ability that allows a Character to target active opponents, separate from Rush. See findings 13.2.

`RUSH_CHARACTER` is the "can attack Characters on play turn" partial Rush granted by Stages. See findings 13.3.

For keyword choice effects (OP09-084), use `PLAYER_CHOICE` wrapping multiple `GRANT_KEYWORD` options. See [PLAYER_CHOICE](#player_choice).

---

### NEGATE_EFFECTS

Negate all effects on a target card. The card's printed effects are treated as blank for the duration.

```typescript
interface NegateEffectsParams {
  // No additional params
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to negate |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `EFFECTS_NEGATED` |
| **Example cards** | OP10-098 Liberation |

```json
{
  "type": "NEGATE_EFFECTS",
  "target": {
    "controller": "OPPONENT",
    "card_type": ["LEADER", "CHARACTER"],
    "count": { "up_to": 1, "per_type": true }
  },
  "duration": { "type": "THIS_TURN" }
}
```

---

## DON!! Actions

Actions that manipulate DON!! cards — the resource and attachment system of OPTCG.

### GIVE_DON

Attach DON!! card(s) from the cost area to a card on the field.

```typescript
interface GiveDonParams {
  amount: number;
  source_state?: "ACTIVE" | "RESTED" | "ANY";
  target_state?: "ACTIVE" | "RESTED";
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card receives the DON!! |
| **Failure mode** | If no DON!! cards exist in the cost area in the required state, the action is ignored. |
| **Fired events** | `DON_GIVEN_TO_CARD` |
| **Example cards** | OP01-061 Kaido, ST08-001 |

`source_state` filters which DON!! in the cost area can be used. Defaults to `"ANY"`.

```json
{
  "type": "GIVE_DON",
  "target": { "controller": "SELF", "card_type": "LEADER" },
  "params": { "amount": 1, "source_state": "RESTED" }
}
```

---

### RETURN_DON_TO_DECK

Return DON!! card(s) from the field to the DON!! deck.

```typescript
interface ReturnDonToDeckParams {
  amount: number | DynamicValue;
  source_state?: "ACTIVE" | "RESTED" | "ANY";
  source: "COST_AREA" | "ATTACHED" | "ANY";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's DON!! on field) or a specific card's attached DON!! |
| **Failure mode** | If insufficient DON!! exist on the field, return as many as possible. |
| **Fired events** | `DON_RETURNED_TO_DON_DECK` (triggers `DON_RETURNED_TO_DON_DECK` custom event) |
| **Example cards** | Various DON!! -N cost effects |

```json
{
  "type": "RETURN_DON_TO_DECK",
  "params": { "amount": 2, "source": "ANY" }
}
```

---

### ADD_DON_FROM_DECK

Move DON!! card(s) from the DON!! deck to the field cost area.

```typescript
interface AddDonFromDeckParams {
  amount: number;
  target_state: "ACTIVE" | "RESTED";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's DON!! deck) |
| **Failure mode** | If the DON!! deck has fewer cards than `amount`, add as many as possible. |
| **Fired events** | `DON_ADDED_TO_FIELD` |
| **Example cards** | OP01-061 Kaido |

```json
{
  "type": "ADD_DON_FROM_DECK",
  "params": { "amount": 1, "target_state": "ACTIVE" }
}
```

---

### SET_DON_ACTIVE

Set rested DON!! card(s) on the field to active state.

```typescript
interface SetDonActiveParams {
  amount: number | "ALL";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's rested DON!! on field) |
| **Failure mode** | If fewer rested DON!! exist than `amount`, set as many as possible to active. |
| **Fired events** | `DON_STATE_CHANGED` |
| **Example cards** | OP13-024, OP13-038, OP14-031 |

```json
{
  "type": "SET_DON_ACTIVE",
  "params": { "amount": 2 }
}
```

---

### REST_DON

Set active DON!! card(s) on the field to rested state.

```typescript
interface RestDonParams {
  amount: number | DynamicValue;
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the specified player's active DON!!) |
| **Failure mode** | If fewer active DON!! exist than `amount`, rest as many as possible. |
| **Fired events** | `DON_STATE_CHANGED` |
| **Example cards** | OP13-001 Monkey.D.Luffy |

```json
{
  "type": "REST_DON",
  "params": { "amount": 3 }
}
```

---

### REDISTRIBUTE_DON

Move already-attached DON!! between cards on the field. Does not add new DON!! — repositions existing ones.

```typescript
interface RedistributeDonParams {
  amount: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | Requires source card (DON!! detaches from) and destination card (DON!! attaches to) |
| **Failure mode** | If the source card has fewer attached DON!! than `amount`, the action is ignored. |
| **Fired events** | `DON_REDISTRIBUTED` |
| **Example cards** | OP07-001 Monkey.D.Dragon, EB02-009 Thousand Sunny |

```json
{
  "type": "REDISTRIBUTE_DON",
  "params": { "amount": 1 },
  "target": {
    "from": { "controller": "SELF", "card_type": ["CHARACTER", "LEADER"], "count": { "exact": 1 } },
    "to": { "controller": "SELF", "card_type": ["CHARACTER", "LEADER"], "count": { "exact": 1 } }
  }
}
```

---

### FORCE_OPPONENT_DON_RETURN

Force the opponent to return their DON!! card(s) from the field to the DON!! deck.

```typescript
interface ForceOpponentDonReturnParams {
  amount: number;
  source_state?: "ACTIVE" | "RESTED" | "ANY";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the opponent's DON!! on field) |
| **Failure mode** | If the opponent has fewer DON!! than `amount`, they return as many as possible. |
| **Fired events** | `DON_RETURNED_TO_DON_DECK` |
| **Example cards** | OP02-085 Magellan, OP02-089 |

```json
{
  "type": "FORCE_OPPONENT_DON_RETURN",
  "params": { "amount": 1 }
}
```

---

### REST_OPPONENT_DON

Rest the opponent's active DON!! card(s).

```typescript
interface RestOpponentDonParams {
  amount: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the opponent's active DON!!) |
| **Failure mode** | If the opponent has fewer active DON!! than `amount`, rest as many as possible. |
| **Fired events** | `DON_STATE_CHANGED` |
| **Example cards** | OP04-021 Viola, PRB02-005 |

```json
{
  "type": "REST_OPPONENT_DON",
  "params": { "amount": 1 }
}
```

---

### GIVE_OPPONENT_DON_TO_OPPONENT

Move DON!! from the opponent's cost area to one of the opponent's Characters. The controller selects which of the opponent's Characters receives the DON!!.

```typescript
interface GiveOpponentDonToOpponentParams {
  amount: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | An opponent's Character that will receive the DON!! |
| **Failure mode** | If the opponent has no DON!! in the cost area, the action is ignored. |
| **Fired events** | `DON_GIVEN_TO_CARD` |
| **Example cards** | OP15-003 Alvida, OP15-008 Krieg, OP15-015 Higuma, OP15-025 Kuro |

This is a disruptive action — giving DON!! to an opponent's Character makes it easier to target with DON!!-count-based filters (see findings 2.30).

```json
{
  "type": "GIVE_OPPONENT_DON_TO_OPPONENT",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "params": { "amount": 1 }
}
```

---

### DISTRIBUTE_DON

Give up to M DON!! card(s) each to up to N different targets. A batch version of `GIVE_DON` where multiple recipients each get DON!! in a single action.

```typescript
interface DistributeDonParams {
  don_per_target: number;
  max_targets: number;
  source_state?: "ACTIVE" | "RESTED" | "ANY";
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) for eligible recipients |
| **Failure mode** | If no valid targets or no DON!! available, the action is ignored. The controller distributes as much as they can. |
| **Fired events** | `DON_GIVEN_TO_CARD` per recipient |
| **Example cards** | OP08-001 Tony Tony.Chopper, EB03-026 Boa Hancock, OP14-105 |

```json
{
  "type": "DISTRIBUTE_DON",
  "target": {
    "controller": "SELF",
    "card_type": ["CHARACTER", "LEADER"],
    "count": { "up_to": 2 }
  },
  "params": { "don_per_target": 1, "max_targets": 2 }
}
```

---

### RETURN_ATTACHED_DON_TO_COST

Return DON!! card(s) that are attached (given) to a card back to the cost area (not the DON!! deck). The DON!! returns to the field as rested DON!! in the cost area.

```typescript
interface ReturnAttachedDonToCostParams {
  amount: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | The card whose attached DON!! will be returned |
| **Failure mode** | If the target has fewer attached DON!! than `amount`, the action is ignored. |
| **Fired events** | `DON_DETACHED` |
| **Example cards** | ST28-004 Kouzuki Momonosuke |

```json
{
  "type": "RETURN_ATTACHED_DON_TO_COST",
  "target": { "controller": "SELF", "card_type": "CHARACTER", "self_ref": true },
  "params": { "amount": 1 }
}
```

---

## State Change Actions

Actions that change the active/rested state of cards or apply/remove prohibitions.

### SET_ACTIVE

Set a rested card to active state (untap).

```typescript
interface SetActiveParams {
  // No additional params
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to set active |
| **Failure mode** | If no valid targets exist or the target is already active, the action is ignored. |
| **Fired events** | `CARD_STATE_CHANGED` |
| **Example cards** | OP03-076 Rob Lucci, OP02-094 Isuka |

```json
{
  "type": "SET_ACTIVE",
  "target": { "controller": "SELF", "card_type": "LEADER", "self_ref": true }
}
```

---

### SET_REST

Set an active card to rested state (tap).

```typescript
interface SetRestParams {
  // No additional params
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) to rest |
| **Failure mode** | If no valid targets exist or the target is already rested, the action is ignored. |
| **Fired events** | `CARD_STATE_CHANGED` (triggers `CHARACTER_BECOMES_RESTED` when applicable) |
| **Example cards** | OP15-001 Krieg, various "rest up to 1" effects |

```json
{
  "type": "SET_REST",
  "target": {
    "controller": "OPPONENT",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 },
    "filter": { "don_given": { "operator": ">=", "value": 2 } }
  }
}
```

---

### APPLY_PROHIBITION

Apply a "cannot X" restriction to a card or the game state. Prohibitions persist for the specified duration. See [Prohibitions & Replacements](./06-PROHIBITIONS-AND-REPLACEMENTS.md) for the full prohibition type taxonomy.

```typescript
interface ApplyProhibitionParams {
  prohibition_type: ProhibitionType;
  scope?: ProhibitionScope;
}

type ProhibitionType =
  | "CANNOT_ATTACK"
  | "CANNOT_BE_KO"
  | "CANNOT_BE_RESTED"
  | "CANNOT_BE_REMOVED"
  | "CANNOT_ACTIVATE_BLOCKER"
  | "CANNOT_PLAY_CARDS"
  | "CANNOT_DRAW_BY_EFFECT"
  | "CANNOT_ADD_LIFE_TO_HAND_BY_EFFECT"
  | "CANNOT_SET_DON_ACTIVE_BY_CHARACTER_EFFECT"
  | "CANNOT_REFRESH";
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card or player the prohibition applies to |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `PROHIBITION_APPLIED` |
| **Example cards** | ST01-012 (cannot activate Blocker), OP14-020 (cannot play Characters) |

```json
{
  "type": "APPLY_PROHIBITION",
  "target": { "controller": "OPPONENT" },
  "params": { "prohibition_type": "CANNOT_ACTIVATE_BLOCKER" },
  "duration": { "type": "THIS_BATTLE" }
}
```

---

### REMOVE_PROHIBITION

Remove a previously applied prohibition from a card. Used by conditional self-negation effects where a card unlocks its own restriction.

```typescript
interface RemoveProhibitionParams {
  prohibition_type: ProhibitionType;
}
```

| Field | Value |
|-------|-------|
| **Target** | The card whose prohibition is being removed |
| **Failure mode** | If the target does not have the specified prohibition, the action is ignored. |
| **Fired events** | `PROHIBITION_REMOVED` |
| **Example cards** | OP14-056 Wadatsumi (self-negation on trigger) |

```json
{
  "type": "REMOVE_PROHIBITION",
  "target": { "self_ref": true },
  "params": { "prohibition_type": "CANNOT_ATTACK" },
  "duration": { "type": "THIS_TURN" }
}
```

---

## Meta / Flow Actions

Actions that control game flow, player decisions, and meta-operations.

### PLAYER_CHOICE

Present the controller with a choice between two or more action branches. The player selects one branch, and only that branch executes.

```typescript
interface PlayerChoiceParams {
  options: Action[][];
}
```

| Field | Value |
|-------|-------|
| **Target** | None (meta-action — delegates to chosen branch) |
| **Failure mode** | If all options are impossible, the action is ignored. |
| **Fired events** | Depends on the chosen branch |
| **Example cards** | OP04-043 Ulti (hand or deck), OP09-084 Catarina Devon (keyword choice), OP05-096 (KO or bounce) |

Destination choice — OP04-043 Ulti: "Return to hand **or** bottom of deck."

```json
{
  "type": "PLAYER_CHOICE",
  "params": {
    "options": [
      [{ "type": "RETURN_TO_HAND", "target": { "controller": "OPPONENT", "card_type": "CHARACTER", "count": { "up_to": 1 } } }],
      [{ "type": "RETURN_TO_DECK", "target": { "controller": "OPPONENT", "card_type": "CHARACTER", "count": { "up_to": 1 } }, "params": { "position": "BOTTOM" } }]
    ]
  }
}
```

Keyword choice — OP09-084 Catarina Devon: "gains [Double Attack], [Banish] or [Blocker]."

```json
{
  "type": "PLAYER_CHOICE",
  "params": {
    "options": [
      [{ "type": "GRANT_KEYWORD", "target": { "self_ref": true }, "params": { "keyword": "DOUBLE_ATTACK" } }],
      [{ "type": "GRANT_KEYWORD", "target": { "self_ref": true }, "params": { "keyword": "BANISH" } }],
      [{ "type": "GRANT_KEYWORD", "target": { "self_ref": true }, "params": { "keyword": "BLOCKER" } }]
    ]
  },
  "duration": { "type": "THIS_TURN" }
}
```

---

### OPPONENT_CHOICE

Present the opponent with a mandatory or optional choice. Used for "opponent decision with consequence" patterns where the opponent selects an outcome.

```typescript
interface OpponentChoiceParams {
  options: Action[][];
  mandatory: boolean;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (meta-action — the opponent decides) |
| **Failure mode** | If `mandatory` is true, the opponent must choose a feasible option. If no option is feasible, the entire action is ignored. If `mandatory` is false, the opponent may decline all options. |
| **Fired events** | Depends on the chosen branch |
| **Example cards** | OP05-099 Amazon, OP15-059 Amazon |

OP05-099 Amazon: "Your opponent may trash 1 card from their Life. If they do not, give -2000 power."

```json
{
  "type": "OPPONENT_CHOICE",
  "params": {
    "mandatory": false,
    "options": [
      [{ "type": "TRASH_FROM_LIFE", "target": { "controller": "OPPONENT", "count": { "exact": 1 } } }],
      [{ "type": "MODIFY_POWER", "target": { "controller": "OPPONENT", "card_type": "CHARACTER", "count": { "up_to": 1 } }, "params": { "amount": -2000 }, "duration": { "type": "THIS_TURN" } }]
    ]
  }
}
```

---

### CHOOSE_VALUE

Prompt the player to declare a numeric value before effect resolution. The chosen value is stored and referenced by subsequent actions via `DynamicValue` of type `CHOSEN_VALUE`.

```typescript
interface ChooseValueParams {
  domain: "COST" | "POWER" | "NUMBER";
  constraints?: NumericRange;
}
```

| Field | Value |
|-------|-------|
| **Target** | None |
| **Failure mode** | Never fails. The player must choose a valid value within constraints. |
| **Fired events** | None |
| **Example cards** | OP11-066 Charlotte Oven |

```json
{
  "type": "CHOOSE_VALUE",
  "params": { "domain": "COST" },
  "result_ref": "chosen_cost"
}
```

---

### WIN_GAME

The controller wins the game immediately. An unconditional game-ending action triggered by specific card effects.

```typescript
interface WinGameParams {
  // No additional params
}
```

| Field | Value |
|-------|-------|
| **Target** | None |
| **Failure mode** | Never fails once the action resolves. |
| **Fired events** | `GAME_OVER` |
| **Example cards** | OP09-118 Gol.D.Roger |

```json
{
  "type": "WIN_GAME"
}
```

---

### OPPONENT_ACTION

Wrap an action that the opponent must execute. Distinguishes mandatory actions (the opponent must do it) from optional ones (the opponent may choose).

```typescript
interface OpponentActionParams {
  action: Action;
  mandatory: boolean;
}
```

| Field | Value |
|-------|-------|
| **Target** | Defined within the wrapped `action` |
| **Failure mode** | If `mandatory` is true and the action is impossible, the impossible action is ignored per comprehensive rules 1-3-2. If `mandatory` is false and the opponent declines, the action is skipped. |
| **Fired events** | Depends on the wrapped action |
| **Example cards** | EB01-028, EB03-026, P-009, P-055 |

EB01-028 (mandatory): "your opponent returns 1 of their active Characters to the owner's hand."

```json
{
  "type": "OPPONENT_ACTION",
  "params": {
    "mandatory": true,
    "action": {
      "type": "RETURN_TO_HAND",
      "target": {
        "controller": "OPPONENT",
        "card_type": "CHARACTER",
        "count": { "exact": 1 },
        "filter": { "state": "ACTIVE" }
      }
    }
  }
}
```

EB03-026 (mandatory): "your opponent places 1 card from their hand at the bottom of their deck."

```json
{
  "type": "OPPONENT_ACTION",
  "params": {
    "mandatory": true,
    "action": {
      "type": "PLACE_HAND_TO_DECK",
      "params": { "amount": 1, "position": "BOTTOM" }
    }
  }
}
```

---

### EXTRA_TURN

Grant the controller an additional turn after the current one. Extremely rare and powerful.

```typescript
interface ExtraTurnParams {
  // No additional params
}
```

| Field | Value |
|-------|-------|
| **Target** | None |
| **Failure mode** | Never fails. |
| **Fired events** | `EXTRA_TURN_GRANTED` |
| **Example cards** | OP05-119 Monkey.D.Luffy |

```json
{
  "type": "EXTRA_TURN"
}
```

---

### SCHEDULE_ACTION

Wrap another action and defer its execution to a future timing point. The deferred action is a child of the current effect resolution and executes at the specified timing. Distinct from duration-based expiry — this creates a future obligation.

```typescript
interface ScheduleActionParams {
  timing: ScheduleTiming;
  action: Action;
  bound_to?: string;
}

type ScheduleTiming =
  | "END_OF_THIS_TURN"
  | "END_OF_THIS_BATTLE"
  | "START_OF_NEXT_MAIN_PHASE"
  | "START_OF_OPPONENT_NEXT_MAIN_PHASE";
```

| Field | Value |
|-------|-------|
| **Target** | Defined within the wrapped `action` |
| **Failure mode** | If the timing point never occurs (e.g., the game ends first), the scheduled action is discarded. If the wrapped action is impossible at execution time, it is ignored. |
| **Fired events** | Depends on the wrapped action at execution time |
| **Example cards** | OP06-006 Saga, OP08-074 Black Maria, OP11-092 Helmeppo |

`bound_to` references a card placed by the current effect. Used for "temporary play" patterns where a card is played now and removed at end of turn.

OP06-006 Saga: "trash 1 of your Characters at the end of this turn."

```json
{
  "type": "SCHEDULE_ACTION",
  "params": {
    "timing": "END_OF_THIS_TURN",
    "action": {
      "type": "TRASH_CARD",
      "target": { "controller": "SELF", "card_type": "CHARACTER", "count": { "exact": 1 } }
    }
  }
}
```

OP11-092 Helmeppo: "place the Character played by this effect at the bottom of the owner's deck at the end of this turn." (temporary play)

```json
{
  "type": "SCHEDULE_ACTION",
  "params": {
    "timing": "END_OF_THIS_TURN",
    "action": {
      "type": "RETURN_TO_DECK",
      "params": { "position": "BOTTOM" }
    },
    "bound_to": "played_character"
  }
}
```

---

## Life Card Actions

Actions that manipulate the Life area — a face-down ordered stack of cards that functions as the player's health. Two full archetypes (Big Mom Pirates, Sabo/Ace/Luffy) and multiple Leaders depend on Life manipulation. See findings section 11 for the full subsystem analysis.

Each Life card tracks:
- **Face orientation**: face-up or face-down (default face-down)
- **Position**: ordered stack with top and bottom

### TURN_LIFE_FACE_UP

Turn N Life cards from the top of the Life area face-up.

```typescript
interface TurnLifeFaceUpParams {
  amount: number;
  position: "TOP" | "BOTTOM";
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's Life area) |
| **Failure mode** | If fewer face-down Life cards exist than `amount`, turn as many as possible. |
| **Fired events** | `LIFE_CARD_FACE_CHANGED` |
| **Example cards** | OP08-058, OP10-099, OP11-022, OP11-117, ST20-001, EB01-040 |

```json
{
  "type": "TURN_LIFE_FACE_UP",
  "params": { "amount": 1, "position": "TOP" }
}
```

---

### TURN_LIFE_FACE_DOWN

Turn N face-up Life cards face-down.

```typescript
interface TurnLifeFaceDownParams {
  amount: number;
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's face-up Life cards) |
| **Failure mode** | If fewer face-up Life cards exist than `amount`, turn as many as possible. |
| **Fired events** | `LIFE_CARD_FACE_CHANGED` |
| **Example cards** | OP08-063, OP08-075, OP11-100, OP15-099, EB01-052, ST13-009 |

```json
{
  "type": "TURN_LIFE_FACE_DOWN",
  "params": { "amount": 1 }
}
```

---

### TURN_ALL_LIFE_FACE_DOWN

Turn all Life cards face-down. A convenience action equivalent to `TURN_LIFE_FACE_DOWN` with `amount: ALL` but provided as a distinct primitive for clarity.

```typescript
interface TurnAllLifeFaceDownParams {
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's Life area) |
| **Failure mode** | If no face-up Life cards exist, the action completes with no effect. |
| **Fired events** | `LIFE_CARD_FACE_CHANGED` per card turned |
| **Example cards** | OP08-075, EB01-052 |

```json
{
  "type": "TURN_ALL_LIFE_FACE_DOWN"
}
```

---

### LIFE_SCRY

Look at the top or bottom N Life cards, then place them at the top or bottom in any order. Private information — only the controller sees the cards.

```typescript
interface LifeScryParams {
  count: number;
  from_position: "TOP" | "BOTTOM";
  to_position: "TOP" | "BOTTOM";
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's Life area) |
| **Failure mode** | If fewer Life cards exist than `count`, look at all remaining. |
| **Fired events** | None (private information rearrangement) |
| **Example cards** | OP03-099, OP03-104, OP06-099, OP11-062 |

```json
{
  "type": "LIFE_SCRY",
  "params": { "count": 2, "from_position": "TOP", "to_position": "TOP" }
}
```

---

### REORDER_ALL_LIFE

Look at all Life cards and place them back in any order chosen by the controller.

```typescript
interface ReorderAllLifeParams {
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's entire Life area) |
| **Failure mode** | If the Life area is empty, the action completes with no effect. |
| **Fired events** | None (private information rearrangement) |
| **Example cards** | OP13-105, ST13-004, EB01-052 |

```json
{
  "type": "REORDER_ALL_LIFE"
}
```

---

### ADD_TO_LIFE_FROM_DECK

Add the top card from the deck to the Life area.

```typescript
interface AddToLifeFromDeckParams {
  amount: number;
  position: "TOP" | "BOTTOM";
  face: "UP" | "DOWN";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's deck and Life area) |
| **Failure mode** | If the deck is empty, the action is ignored. |
| **Fired events** | `CARD_ADDED_TO_LIFE` |
| **Example cards** | ST07-005, OP08-101, OP10-119, ST13-005 |

```json
{
  "type": "ADD_TO_LIFE_FROM_DECK",
  "params": { "amount": 1, "position": "TOP", "face": "DOWN" }
}
```

Face-up placement — ST13-005:

```json
{
  "type": "ADD_TO_LIFE_FROM_DECK",
  "params": { "amount": 1, "position": "TOP", "face": "UP" }
}
```

---

### ADD_TO_LIFE_FROM_HAND

Add a card from the controller's hand to their Life area.

```typescript
interface AddToLifeFromHandParams {
  position: "TOP" | "BOTTOM";
  face: "UP" | "DOWN";
  filter?: TargetFilter;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (the controller selects a card from hand) |
| **Failure mode** | If the hand is empty or no card matches the filter, the action is ignored. |
| **Fired events** | `CARD_ADDED_TO_LIFE` |
| **Example cards** | ST07-001, EB03-059 |

```json
{
  "type": "ADD_TO_LIFE_FROM_HAND",
  "params": { "position": "TOP", "face": "UP" }
}
```

---

### ADD_TO_LIFE_FROM_FIELD

Move a Character from the field to the Life area. Functions as a removal method (the Character leaves the field) and a Life replenishment method simultaneously.

```typescript
interface AddToLifeFromFieldParams {
  position: "TOP" | "BOTTOM";
  face: "UP" | "DOWN";
  owner: "SELF" | "OPPONENT";
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which Character to move to Life |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `CARD_ADDED_TO_LIFE`, `CARD_REMOVED_FROM_FIELD` (does NOT fire `CARD_KO`) |
| **Example cards** | OP03-123, OP06-103, OP06-107, OP08-069, ST07-017, ST09-015, ST13-001, EB01-053, EB02-057 |

`owner` determines whose Life area receives the card. Most effects add to the controller's Life, but some add to the opponent's.

```json
{
  "type": "ADD_TO_LIFE_FROM_FIELD",
  "target": {
    "controller": "SELF",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "params": { "position": "TOP", "face": "DOWN", "owner": "SELF" }
}
```

---

### PLAY_FROM_LIFE

Reveal a Life card and conditionally play it to the field. If the revealed card does not match the filter or the player declines, the card returns to Life in its original position.

```typescript
interface PlayFromLifeParams {
  position: "TOP" | "BOTTOM";
  filter: TargetFilter;
  cost_override: "FREE" | "REDUCED" | "NORMAL";
}
```

| Field | Value |
|-------|-------|
| **Target** | None (the Life area is the source) |
| **Failure mode** | If the revealed card does not match `filter`, it returns to Life. If the Life area is empty, the action is ignored. |
| **Fired events** | `CARD_REVEALED`, `CARD_PLAYED` (if played), `CARD_REMOVED_FROM_LIFE` |
| **Example cards** | OP10-022 Trafalgar Law, ST13-007 Sabo |

```json
{
  "type": "PLAY_FROM_LIFE",
  "params": {
    "position": "TOP",
    "filter": {
      "card_type": "CHARACTER",
      "traits": ["Supernovas"],
      "cost": { "operator": "<=", "value": 5 }
    },
    "cost_override": "FREE"
  }
}
```

---

### LIFE_TO_HAND

Add a Life card to the controller's hand via effect (not damage). The controller may choose which Life card (top or bottom) to add.

```typescript
interface LifeToHandParams {
  position: "TOP" | "BOTTOM" | "CHOICE";
  amount: number;
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's Life area) |
| **Failure mode** | If the Life area is empty, the action is ignored. |
| **Fired events** | `CARD_REMOVED_FROM_LIFE`, `CARD_ADDED_TO_HAND_FROM_LIFE` |
| **Example cards** | ST07-001, OP03-102, OP14-103, P-009 |

```json
{
  "type": "LIFE_TO_HAND",
  "params": { "position": "TOP", "amount": 1 }
}
```

---

### TRASH_FROM_LIFE

Trash a card directly from the Life area. Not damage — does not trigger Trigger effects. The card goes directly from Life to trash.

```typescript
interface TrashFromLifeParams {
  amount: number;
  position: "TOP" | "BOTTOM" | "CHOICE";
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's Life area) |
| **Failure mode** | If the Life area has fewer cards than `amount`, trash as many as possible. |
| **Fired events** | `CARD_REMOVED_FROM_LIFE`, `CARD_TRASHED` |
| **Example cards** | ST04-001, ST07-010, OP03-114, OP03-120, EB03-057, OP15-116 |

```json
{
  "type": "TRASH_FROM_LIFE",
  "params": { "amount": 1, "position": "TOP" }
}
```

---

### DRAIN_LIFE_TO_THRESHOLD

Trash Life cards until the player has exactly N remaining. If the player already has N or fewer, the action is ignored.

```typescript
interface DrainLifeToThresholdParams {
  threshold: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's Life area) |
| **Failure mode** | If the player already has `threshold` or fewer Life cards, the action is ignored. |
| **Fired events** | `CARD_REMOVED_FROM_LIFE`, `CARD_TRASHED` per card removed |
| **Example cards** | EB01-059, EB01-060 |

```json
{
  "type": "DRAIN_LIFE_TO_THRESHOLD",
  "params": { "threshold": 1 }
}
```

---

### LIFE_CARD_TO_DECK

Move a Life card to the deck (top or bottom). The card does not go to hand or trash.

```typescript
interface LifeCardToDeckParams {
  position: "TOP" | "BOTTOM";
  amount: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the controller's Life area) |
| **Failure mode** | If the Life area is empty, the action is ignored. |
| **Fired events** | `CARD_REMOVED_FROM_LIFE`, `CARD_PLACED_TO_DECK` |
| **Example cards** | OP01-063 Arlong |

```json
{
  "type": "LIFE_CARD_TO_DECK",
  "params": { "position": "BOTTOM", "amount": 1 }
}
```

---

### TRASH_FACE_UP_LIFE

Trash all face-up Life cards. Only cards currently face-up are affected.

```typescript
interface TrashFaceUpLifeParams {
  controller?: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on a player's face-up Life cards) |
| **Failure mode** | If no face-up Life cards exist, the action completes with no effect. |
| **Fired events** | `CARD_REMOVED_FROM_LIFE`, `CARD_TRASHED` per card |
| **Example cards** | ST13-002 Portgas.D.Ace |

```json
{
  "type": "TRASH_FACE_UP_LIFE"
}
```

---

## Battle Actions

Actions that interact with the battle system.

### REDIRECT_ATTACK

Change the target of an in-progress attack. Distinct from Blocker — this can redirect to any valid target, not just the redirecting card.

```typescript
interface RedirectAttackParams {
  // No additional params — the new target is specified in `target`
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying the new attack target |
| **Failure mode** | If no valid redirect target exists, the action is ignored. Can only be used during an active battle. |
| **Fired events** | `ATTACK_REDIRECTED` |
| **Example cards** | OP14-060 Donquixote Doflamingo, EB01-038 |

```json
{
  "type": "REDIRECT_ATTACK",
  "target": {
    "controller": "SELF",
    "card_type": "CHARACTER",
    "count": { "exact": 1 }
  }
}
```

---

### DEAL_DAMAGE

Deal damage to a player via effect. Follows the standard damage rules including Trigger checks on the removed Life card. Distinct from combat damage — this is effect-based.

```typescript
interface DealDamageParams {
  amount: number;
  target_player: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (targets a player, not a card) |
| **Failure mode** | If the target player has no Life cards, the damage resolves as a final hit (per combat damage rules). |
| **Fired events** | `DAMAGE_DEALT`, `CARD_REMOVED_FROM_LIFE` (triggers `DAMAGE_TAKEN`, Trigger effects) |
| **Example cards** | EB03-055 Nico Robin, OP06-116 Reject |

```json
{
  "type": "DEAL_DAMAGE",
  "params": { "amount": 1, "target_player": "OPPONENT" }
}
```

---

### SELF_TAKE_DAMAGE

Force the controller to take damage (remove a Life card). Follows the standard damage rules.

```typescript
interface SelfTakeDamageParams {
  amount: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (always the controller) |
| **Failure mode** | If the controller has no Life cards, the damage triggers the final hit check. |
| **Fired events** | `DAMAGE_TAKEN`, `CARD_REMOVED_FROM_LIFE` |
| **Example cards** | OP14-115 Rindo |

```json
{
  "type": "SELF_TAKE_DAMAGE",
  "params": { "amount": 1 }
}
```

---

## Effect / Meta Actions

Actions that interact with the effect system itself — activating other effects, negating effect types, or granting non-keyword properties.

### ACTIVATE_EVENT_FROM_HAND

Resolve an Event card's effect directly from the hand via another card's effect. The Event is not "played" in the normal sense — its effect is activated without paying its cost, then the Event goes to trash.

```typescript
interface ActivateEventFromHandParams {
  filter: TargetFilter;
  cost_override: "FREE" | "REDUCED" | "NORMAL";
  cost_reduction?: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | An Event card in hand matching `filter` |
| **Failure mode** | If no matching Event exists in hand, the action is ignored. |
| **Fired events** | `EVENT_ACTIVATED_FROM_HAND` |
| **Example cards** | OP12-041 Sanji, OP15-014 Bartolomeo, OP15-046 Sabo |

```json
{
  "type": "ACTIVATE_EVENT_FROM_HAND",
  "params": {
    "filter": { "card_type": "EVENT", "cost": { "operator": "<=", "value": 5 } },
    "cost_override": "FREE"
  }
}
```

---

### ACTIVATE_EVENT_FROM_TRASH

Execute an Event card's effect from the trash (flashback). The Event stays in trash after resolution.

```typescript
interface ActivateEventFromTrashParams {
  filter: TargetFilter;
  cost_override: "FREE" | "REDUCED" | "NORMAL";
}
```

| Field | Value |
|-------|-------|
| **Target** | An Event card in trash matching `filter` |
| **Failure mode** | If no matching Event exists in trash, the action is ignored. |
| **Fired events** | `EVENT_MAIN_RESOLVED_FROM_TRASH` |
| **Example cards** | EB03-031 Vinsmoke Reiju, OP12-041 Sanji |

```json
{
  "type": "ACTIVATE_EVENT_FROM_TRASH",
  "params": {
    "filter": { "card_type": "EVENT", "traits": ["GERMA 66"] },
    "cost_override": "FREE"
  }
}
```

---

### REUSE_EFFECT

Activate another EffectBlock on the same card by referencing its trigger keyword. The engine locates the matching EffectBlock and resolves it, including condition checks and cost payment.

```typescript
interface ReuseEffectParams {
  target_effect: KeywordTriggerType;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (operates on the source card's own effects) |
| **Failure mode** | If no EffectBlock with the matching trigger exists on the card, the action is ignored. If the referenced effect's conditions are not met, it does not resolve. |
| **Fired events** | Depends on the referenced EffectBlock's actions |
| **Example cards** | ST03-016 (Trigger activates Counter), ST21-017 (Trigger activates Main), OP13-113 (Trigger activates On Play) |

```json
{
  "type": "REUSE_EFFECT",
  "params": { "target_effect": "COUNTER" }
}
```

See [Triggers — Self-Referencing Effect Reuse](./02-TRIGGERS.md) for the full pattern analysis.

---

### NEGATE_TRIGGER_TYPE

Blanket negate all effects of a given trigger type for a player. All effects with the specified trigger keyword on qualifying cards are treated as blank.

```typescript
interface NegateTriggerTypeParams {
  trigger_type: KeywordTriggerType;
  controller: Controller;
}
```

| Field | Value |
|-------|-------|
| **Target** | None (applies globally to a player's cards) |
| **Failure mode** | Never fails. |
| **Fired events** | `TRIGGER_TYPE_NEGATED` |
| **Example cards** | OP09-081 Marshall.D.Teach |

OP09-081: "Your [On Play] effects are negated."

```json
{
  "type": "NEGATE_TRIGGER_TYPE",
  "params": { "trigger_type": "ON_PLAY", "controller": "SELF" },
  "duration": { "type": "UNTIL_END_OF_OPPONENT_NEXT_TURN" }
}
```

---

### GRANT_ATTRIBUTE

Give a card an attribute (Slash, Strike, Ranged, Special, Wisdom) that it does not natively have.

```typescript
interface GrantAttributeParams {
  attribute: Attribute;
}

type Attribute = "SLASH" | "STRIKE" | "RANGED" | "SPECIAL" | "WISDOM";
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) receive the attribute |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `ATTRIBUTE_GRANTED` |
| **Example cards** | OP15-093 The Risky Brothers |

```json
{
  "type": "GRANT_ATTRIBUTE",
  "target": {
    "controller": "SELF",
    "card_type": "CHARACTER",
    "count": { "up_to": 1 }
  },
  "params": { "attribute": "SLASH" },
  "duration": { "type": "THIS_TURN" }
}
```

---

### GRANT_COUNTER

Give a Counter value to cards that do not natively have one. Distinct from `MODIFY_POWER` during Counter step — this adds the Counter keyword itself with a value.

```typescript
interface GrantCounterParams {
  value: number;
}
```

| Field | Value |
|-------|-------|
| **Target** | A [Target](./05-TARGETING.md) specifying which card(s) receive Counter |
| **Failure mode** | If no valid targets exist, the action is ignored. |
| **Fired events** | `COUNTER_GRANTED` |
| **Example cards** | EB01-001 Kouzuki Oden |

EB01-001: "All of your {Land of Wano} type Character cards without a Counter have a +1000 Counter, according to the rules."

```json
{
  "type": "GRANT_COUNTER",
  "target": {
    "controller": "SELF",
    "card_type": "CHARACTER",
    "filter": { "traits": ["Land of Wano"], "has_counter": false }
  },
  "params": { "value": 1000 },
  "duration": { "type": "PERMANENT" }
}
```

---

## Quick Reference

All action types at a glance with their primary zone interactions and event emissions.

| Action | Source Zone | Dest Zone | Primary Event |
|--------|-----------|-----------|---------------|
| `DRAW` | DECK | HAND | `CARD_DRAWN` |
| `SEARCH_DECK` | DECK | HAND | `CARD_SEARCHED` |
| `TRASH_CARD` | ANY | TRASH | `CARD_TRASHED` |
| `KO` | FIELD | TRASH | `CARD_KO` |
| `RETURN_TO_HAND` | FIELD | HAND | `CARD_RETURNED_TO_HAND` |
| `RETURN_TO_DECK` | FIELD | DECK | `CARD_RETURNED_TO_DECK` |
| `PLAY_CARD` | HAND/TRASH/DECK/LIFE | FIELD | `CARD_PLAYED` |
| `ADD_TO_LIFE` | ANY | LIFE | `CARD_ADDED_TO_LIFE` |
| `MILL` | DECK | TRASH | `CARD_MILLED` |
| `REVEAL` | ANY | -- (stays) | `CARD_REVEALED` |
| `FULL_DECK_SEARCH` | DECK | HAND | `CARD_SEARCHED` |
| `DECK_SCRY` | DECK | DECK | -- |
| `SEARCH_TRASH_THE_REST` | DECK | HAND/TRASH | `CARD_SEARCHED` |
| `SEARCH_AND_PLAY` | DECK | FIELD | `CARD_PLAYED` |
| `PLACE_HAND_TO_DECK` | HAND | DECK | `CARD_PLACED_TO_DECK` |
| `HAND_WHEEL` | HAND | DECK/HAND | `CARD_DRAWN` |
| `REVEAL_HAND` | HAND | -- (stays) | `HAND_REVEALED` |
| `SHUFFLE_DECK` | DECK | DECK | `DECK_SHUFFLED` |
| `MODIFY_POWER` | -- | -- | `POWER_MODIFIED` |
| `SET_BASE_POWER` | -- | -- | `BASE_POWER_SET` |
| `MODIFY_COST` | -- | -- | `COST_MODIFIED` |
| `SET_POWER_TO_ZERO` | -- | -- | `POWER_SET_TO_ZERO` |
| `SWAP_BASE_POWER` | -- | -- | `BASE_POWER_SWAPPED` |
| `COPY_POWER` | -- | -- | `POWER_COPIED` |
| `SET_COST` | -- | -- | `COST_SET` |
| `GRANT_KEYWORD` | -- | -- | `KEYWORD_GRANTED` |
| `NEGATE_EFFECTS` | -- | -- | `EFFECTS_NEGATED` |
| `GIVE_DON` | DON_COST | ATTACHED | `DON_GIVEN_TO_CARD` |
| `RETURN_DON_TO_DECK` | FIELD | DON_DECK | `DON_RETURNED_TO_DON_DECK` |
| `ADD_DON_FROM_DECK` | DON_DECK | DON_COST | `DON_ADDED_TO_FIELD` |
| `SET_DON_ACTIVE` | -- | -- | `DON_STATE_CHANGED` |
| `REST_DON` | -- | -- | `DON_STATE_CHANGED` |
| `REDISTRIBUTE_DON` | ATTACHED | ATTACHED | `DON_REDISTRIBUTED` |
| `FORCE_OPPONENT_DON_RETURN` | FIELD | DON_DECK | `DON_RETURNED_TO_DON_DECK` |
| `REST_OPPONENT_DON` | -- | -- | `DON_STATE_CHANGED` |
| `GIVE_OPPONENT_DON_TO_OPPONENT` | DON_COST | ATTACHED | `DON_GIVEN_TO_CARD` |
| `DISTRIBUTE_DON` | DON_COST | ATTACHED | `DON_GIVEN_TO_CARD` |
| `RETURN_ATTACHED_DON_TO_COST` | ATTACHED | DON_COST | `DON_DETACHED` |
| `SET_ACTIVE` | -- | -- | `CARD_STATE_CHANGED` |
| `SET_REST` | -- | -- | `CARD_STATE_CHANGED` |
| `APPLY_PROHIBITION` | -- | -- | `PROHIBITION_APPLIED` |
| `REMOVE_PROHIBITION` | -- | -- | `PROHIBITION_REMOVED` |
| `PLAYER_CHOICE` | -- | -- | (varies) |
| `OPPONENT_CHOICE` | -- | -- | (varies) |
| `CHOOSE_VALUE` | -- | -- | -- |
| `WIN_GAME` | -- | -- | `GAME_OVER` |
| `OPPONENT_ACTION` | -- | -- | (varies) |
| `EXTRA_TURN` | -- | -- | `EXTRA_TURN_GRANTED` |
| `SCHEDULE_ACTION` | -- | -- | (varies at execution) |
| `TURN_LIFE_FACE_UP` | LIFE | LIFE | `LIFE_CARD_FACE_CHANGED` |
| `TURN_LIFE_FACE_DOWN` | LIFE | LIFE | `LIFE_CARD_FACE_CHANGED` |
| `TURN_ALL_LIFE_FACE_DOWN` | LIFE | LIFE | `LIFE_CARD_FACE_CHANGED` |
| `LIFE_SCRY` | LIFE | LIFE | -- |
| `REORDER_ALL_LIFE` | LIFE | LIFE | -- |
| `ADD_TO_LIFE_FROM_DECK` | DECK | LIFE | `CARD_ADDED_TO_LIFE` |
| `ADD_TO_LIFE_FROM_HAND` | HAND | LIFE | `CARD_ADDED_TO_LIFE` |
| `ADD_TO_LIFE_FROM_FIELD` | FIELD | LIFE | `CARD_ADDED_TO_LIFE` |
| `PLAY_FROM_LIFE` | LIFE | FIELD | `CARD_PLAYED` |
| `LIFE_TO_HAND` | LIFE | HAND | `CARD_ADDED_TO_HAND_FROM_LIFE` |
| `TRASH_FROM_LIFE` | LIFE | TRASH | `CARD_TRASHED` |
| `DRAIN_LIFE_TO_THRESHOLD` | LIFE | TRASH | `CARD_TRASHED` |
| `LIFE_CARD_TO_DECK` | LIFE | DECK | `CARD_PLACED_TO_DECK` |
| `TRASH_FACE_UP_LIFE` | LIFE | TRASH | `CARD_TRASHED` |
| `REDIRECT_ATTACK` | -- | -- | `ATTACK_REDIRECTED` |
| `DEAL_DAMAGE` | LIFE | HAND/TRASH | `DAMAGE_DEALT` |
| `SELF_TAKE_DAMAGE` | LIFE | HAND/TRASH | `DAMAGE_TAKEN` |
| `ACTIVATE_EVENT_FROM_HAND` | HAND | TRASH | `EVENT_ACTIVATED_FROM_HAND` |
| `ACTIVATE_EVENT_FROM_TRASH` | TRASH | TRASH | `EVENT_MAIN_RESOLVED_FROM_TRASH` |
| `REUSE_EFFECT` | -- | -- | (varies) |
| `NEGATE_TRIGGER_TYPE` | -- | -- | `TRIGGER_TYPE_NEGATED` |
| `GRANT_ATTRIBUTE` | -- | -- | `ATTRIBUTE_GRANTED` |
| `GRANT_COUNTER` | -- | -- | `COUNTER_GRANTED` |

---

_Last updated: 2026-03-19_
