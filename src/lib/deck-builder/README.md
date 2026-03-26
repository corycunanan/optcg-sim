# Deck Builder — State & Validation Reference

Redux-style state machine and validation engine for the OPTCG deck builder.

## File Map

| File | Purpose |
|------|---------|
| `state.ts` | State types, reducer, initial state factory |
| `validation.ts` | Deck legality rules and statistics computation |
| `index.ts` | Barrel re-export of all public APIs |

## State Machine (`state.ts`)

### State Shape

```typescript
DeckBuilderState {
  id: string | null;              // null = new unsaved deck
  name: string;                   // Deck name (default: "Untitled Deck")
  format: string;                 // e.g., "Standard"
  leader: DeckLeaderEntry | null; // Selected leader card
  cards: Map<string, DeckCardEntry>; // cardId → entry (quantity + card data)
  isDirty: boolean;               // Unsaved changes flag
  isSaving: boolean;              // Save in progress
  lastSavedAt: Date | null;
}
```

### Card Entries

```typescript
DeckCardEntry {
  cardId: string;
  quantity: number;                // 1-4
  selectedArtUrl: string | null;   // Custom art variant URL
  card: {
    id, name, color[], type, cost, power, counter, life,
    imageUrl, banStatus, blockNumber, traits[], attribute[],
    effectText, triggerText, rarity, originSet
  }
}

DeckLeaderEntry {
  id, name, color[], type, life, power, imageUrl,
  traits[], effectText, attribute[]
}
```

### Reducer Actions

| Action | Effect |
|--------|--------|
| `SET_NAME` | Changes deck name, marks dirty |
| `SET_FORMAT` | Changes format, marks dirty |
| `SET_LEADER` | Sets leader card, marks dirty |
| `REMOVE_LEADER` | Clears leader, marks dirty |
| `ADD_CARD` | Adds card (increments if exists, max 4 copies), marks dirty |
| `REMOVE_CARD` | Removes card entry entirely, marks dirty |
| `SET_QUANTITY` | Sets exact quantity (caps at 4, deletes if ≤ 0), marks dirty |
| `INCREMENT_CARD` | +1 quantity if < 4, marks dirty |
| `DECREMENT_CARD` | -1 quantity (deletes if ≤ 1), marks dirty |
| `SET_ART_VARIANT` | Sets custom art URL for a card, marks dirty |
| `CLEAR_DECK` | Removes all cards and leader, marks dirty |
| `LOAD_DECK` | Replaces entire state from saved deck, sets isDirty=false |
| `IMPORT_CARDS` | Merges imported cards (respects 4-copy limit), marks dirty |
| `SAVE_START` | Sets isSaving=true |
| `SAVE_SUCCESS` | Sets id, clears dirty/saving flags, records timestamp |
| `SAVE_ERROR` | Clears isSaving flag |
| `MARK_CLEAN` | Clears isDirty flag |

### Usage

```typescript
import { createInitialState, deckBuilderReducer } from "@/lib/deck-builder";

const [state, dispatch] = useReducer(deckBuilderReducer, createInitialState());

dispatch({ type: "SET_LEADER", leader: leaderData });
dispatch({ type: "ADD_CARD", card: cardData });
dispatch({ type: "INCREMENT_CARD", cardId: "OP01-006" });
```

### Key Behaviors

- **4-copy limit enforced at reducer level** — `ADD_CARD`, `SET_QUANTITY`, and `IMPORT_CARDS` all cap quantities at 4
- **LOAD_DECK handles Map deserialization** — converts serialized card data back to Map
- **IMPORT_CARDS merges** — adds to existing quantities (capped at 4), doesn't replace

## Validation Engine (`validation.ts`)

### `validateDeck(leader, cards) → DeckValidation`

Runs all rules and returns:

```typescript
DeckValidation {
  isValid: boolean;              // true if all error-severity rules pass
  results: ValidationResult[];   // Per-rule results
  stats: DeckStats;              // Computed statistics
}

ValidationResult {
  id: string;                    // Rule identifier
  rule: string;                  // Human-readable rule name
  message: string;               // Description of pass/failure
  severity: "error" | "warning";
  passed: boolean;
  cardIds?: string[];            // Cards that triggered failure
}
```

### Validation Rules

| ID | Rule | Severity | Check |
|----|------|----------|-------|
| `leader` | Leader | error | Exactly 1 leader required |
| `deck-size` | Deck Size | error | Exactly 50 cards in main deck |
| `copy-limit` | Copy Limit | error | Max 4 copies of any card (reports offending cards) |
| `color-affinity` | Color Affinity | error | Every card must share at least 1 color with the leader |
| `ban-status` | Ban List | error | No banned cards allowed |
| `restricted` | Restricted | error | Restricted cards limited to 1 copy |
| `no-leaders-in-deck` | No Leaders in Main Deck | error | Leader card type cannot appear in main deck |

A deck is valid when all error-severity rules pass. Warning-severity results don't affect `isValid`.

### `computeStats(cards) → DeckStats`

```typescript
DeckStats {
  totalCards: number;
  colorBreakdown: Record<string, number>;  // e.g., { Red: 30, Blue: 20 }
  costCurve: Record<number, number>;       // e.g., { 0: 4, 1: 6, 2: 8, ... }
  typeBreakdown: Record<string, number>;   // e.g., { Character: 40, Event: 10 }
  traitBreakdown: Record<string, number>;  // e.g., { "Straw Hat Crew": 15, ... }
}
```

Cost curve groups costs 0-9 individually; 10+ grouped into bucket 10.

## Adding a New Validation Rule

1. Add a `ValidationResult` entry in `validateDeck()` in `validation.ts`
2. Give it a unique `id` and descriptive `rule` name
3. Set `severity` to `"error"` if it affects legality, `"warning"` for advisory
4. Include `cardIds` array if the rule is card-specific (helps UI highlight problems)
