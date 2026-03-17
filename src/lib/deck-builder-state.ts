/**
 * Deck Builder State Types
 */

export interface DeckCardEntry {
  cardId: string;
  quantity: number;
  selectedArtUrl: string | null; // Custom art variant URL (null = use base)
  card: {
    id: string;
    name: string;
    color: string[];
    type: string;
    cost: number | null;
    power: number | null;
    counter: number | null;
    life: number | null;
    imageUrl: string;
    banStatus: string;
    blockNumber: number;
    traits: string[];
    attribute: string[];
    effectText: string;
    triggerText: string | null;
    rarity: string;
    originSet: string;
  };
}

export interface DeckLeaderEntry {
  id: string;
  name: string;
  color: string[];
  type: string;
  life: number | null;
  power: number | null;
  imageUrl: string;
  traits: string[];
  effectText: string;
  attribute: string[];
}

export interface DeckBuilderState {
  id: string | null; // null = new unsaved deck
  name: string;
  format: string;
  leader: DeckLeaderEntry | null;
  cards: Map<string, DeckCardEntry>;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
}

export type DeckBuilderAction =
  | { type: "SET_NAME"; name: string }
  | { type: "SET_FORMAT"; format: string }
  | { type: "SET_LEADER"; leader: DeckLeaderEntry }
  | { type: "REMOVE_LEADER" }
  | { type: "ADD_CARD"; card: DeckCardEntry["card"] }
  | { type: "REMOVE_CARD"; cardId: string }
  | { type: "SET_QUANTITY"; cardId: string; quantity: number }
  | { type: "INCREMENT_CARD"; cardId: string }
  | { type: "DECREMENT_CARD"; cardId: string }
  | { type: "SET_ART_VARIANT"; cardId: string; artUrl: string | null }
  | { type: "CLEAR_DECK" }
  | { type: "LOAD_DECK"; state: Omit<DeckBuilderState, "isDirty" | "isSaving"> }
  | { type: "IMPORT_CARDS"; leader: DeckLeaderEntry | null; cards: DeckCardEntry[] }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; id: string }
  | { type: "SAVE_ERROR" }
  | { type: "MARK_CLEAN" };

export function createInitialState(): DeckBuilderState {
  return {
    id: null,
    name: "Untitled Deck",
    format: "Standard",
    leader: null,
    cards: new Map(),
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
  };
}

export function deckBuilderReducer(
  state: DeckBuilderState,
  action: DeckBuilderAction,
): DeckBuilderState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, name: action.name, isDirty: true };

    case "SET_FORMAT":
      return { ...state, format: action.format, isDirty: true };

    case "SET_LEADER":
      return { ...state, leader: action.leader, isDirty: true };

    case "REMOVE_LEADER":
      return { ...state, leader: null, isDirty: true };

    case "ADD_CARD": {
      const newCards = new Map(state.cards);
      const existing = newCards.get(action.card.id);
      if (existing) {
        // Increment quantity up to 4
        if (existing.quantity < 4) {
          newCards.set(action.card.id, {
            ...existing,
            quantity: existing.quantity + 1,
          });
        }
      } else {
        newCards.set(action.card.id, {
          cardId: action.card.id,
          quantity: 1,
          selectedArtUrl: null,
          card: action.card,
        });
      }
      return { ...state, cards: newCards, isDirty: true };
    }

    case "REMOVE_CARD": {
      const newCards = new Map(state.cards);
      newCards.delete(action.cardId);
      return { ...state, cards: newCards, isDirty: true };
    }

    case "SET_QUANTITY": {
      const newCards = new Map(state.cards);
      const entry = newCards.get(action.cardId);
      if (entry) {
        if (action.quantity <= 0) {
          newCards.delete(action.cardId);
        } else {
          newCards.set(action.cardId, {
            ...entry,
            quantity: Math.min(action.quantity, 4),
          });
        }
      }
      return { ...state, cards: newCards, isDirty: true };
    }

    case "INCREMENT_CARD": {
      const newCards = new Map(state.cards);
      const entry = newCards.get(action.cardId);
      if (entry && entry.quantity < 4) {
        newCards.set(action.cardId, { ...entry, quantity: entry.quantity + 1 });
      }
      return { ...state, cards: newCards, isDirty: true };
    }

    case "DECREMENT_CARD": {
      const newCards = new Map(state.cards);
      const entry = newCards.get(action.cardId);
      if (entry) {
        if (entry.quantity <= 1) {
          newCards.delete(action.cardId);
        } else {
          newCards.set(action.cardId, {
            ...entry,
            quantity: entry.quantity - 1,
          });
        }
      }
      return { ...state, cards: newCards, isDirty: true };
    }

    case "SET_ART_VARIANT": {
      const newCards = new Map(state.cards);
      const entry = newCards.get(action.cardId);
      if (entry) {
        newCards.set(action.cardId, {
          ...entry,
          selectedArtUrl: action.artUrl,
        });
      }
      return { ...state, cards: newCards, isDirty: true };
    }

    case "CLEAR_DECK":
      return {
        ...state,
        leader: null,
        cards: new Map(),
        isDirty: true,
      };

    case "LOAD_DECK": {
      return {
        ...action.state,
        cards: action.state.cards instanceof Map
          ? action.state.cards
          : new Map(Object.entries(action.state.cards)),
        isDirty: false,
        isSaving: false,
      };
    }

    case "IMPORT_CARDS": {
      const newCards = new Map(state.cards);
      for (const entry of action.cards) {
        const existing = newCards.get(entry.cardId);
        if (existing) {
          newCards.set(entry.cardId, {
            ...existing,
            quantity: Math.min(existing.quantity + entry.quantity, 4),
          });
        } else {
          newCards.set(entry.cardId, {
            ...entry,
            selectedArtUrl: entry.selectedArtUrl ?? null,
          });
        }
      }
      return {
        ...state,
        leader: action.leader ?? state.leader,
        cards: newCards,
        isDirty: true,
      };
    }

    case "SAVE_START":
      return { ...state, isSaving: true };

    case "SAVE_SUCCESS":
      return {
        ...state,
        id: action.id,
        isSaving: false,
        isDirty: false,
        lastSavedAt: new Date(),
      };

    case "SAVE_ERROR":
      return { ...state, isSaving: false };

    case "MARK_CLEAN":
      return { ...state, isDirty: false };

    default:
      return state;
  }
}
