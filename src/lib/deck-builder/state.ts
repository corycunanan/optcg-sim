/**
 * Deck Builder State Types
 */

import { getDeckCardCopyLimit } from "@/lib/deck-builder/validation";

export interface TestDeckOrder {
  life: string[]; // cardIds, length = leader's life value
  hand: string[]; // cardIds, length = 5
}

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
    effectSchema?: unknown | null;
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
  effectSchema?: unknown | null;
}

export interface DeckBuilderState {
  id: string | null; // null = new unsaved deck
  name: string;
  format: string;
  leader: DeckLeaderEntry | null;
  cards: Map<string, DeckCardEntry>;
  sleeveUrl: string | null;
  donArtUrl: string | null;
  testOrder: TestDeckOrder | null;
  isDirty: boolean;
  isSaving: boolean;
  editRevision: number;
  saveRevision: number | null;
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
  | {
      type: "LOAD_DECK";
      state: Omit<
        DeckBuilderState,
        "isDirty" | "isSaving" | "editRevision" | "saveRevision"
      >;
    }
  | {
      type: "IMPORT_CARDS";
      leader: DeckLeaderEntry | null;
      cards: DeckCardEntry[];
    }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; id: string }
  | { type: "SAVE_ERROR" }
  | { type: "MARK_CLEAN" }
  | { type: "SET_SLEEVE"; sleeveUrl: string }
  | { type: "SET_DON_ART"; donArtUrl: string }
  | { type: "SET_TEST_ORDER"; testOrder: TestDeckOrder | null };

export function createInitialState(): DeckBuilderState {
  return {
    id: null,
    name: "Untitled Deck",
    format: "Standard",
    leader: null,
    cards: new Map(),
    sleeveUrl: null,
    donArtUrl: null,
    testOrder: null,
    isDirty: false,
    isSaving: false,
    editRevision: 0,
    saveRevision: null,
    lastSavedAt: null,
  };
}

function markDirty(state: DeckBuilderState) {
  return {
    isDirty: true as const,
    editRevision: state.editRevision + 1,
  };
}

/** Clear testOrder when deck composition changes (returns partial state update or empty object) */
function clearTestOrder(
  state: DeckBuilderState
): { testOrder: null } | Record<string, never> {
  return state.testOrder !== null ? { testOrder: null } : {};
}

/** Write `entry` with its quantity clamped to the card's copy limit. */
function setClampedQuantity(
  cards: Map<string, DeckCardEntry>,
  entry: DeckCardEntry,
  quantity: number
): void {
  cards.set(entry.cardId, {
    ...entry,
    quantity: Math.min(quantity, getDeckCardCopyLimit(entry.card)),
  });
}

export function deckBuilderReducer(
  state: DeckBuilderState,
  action: DeckBuilderAction
): DeckBuilderState {
  switch (action.type) {
    case "SET_NAME":
      return { ...state, name: action.name, ...markDirty(state) };

    case "SET_FORMAT":
      return { ...state, format: action.format, ...markDirty(state) };

    case "SET_LEADER":
      return {
        ...state,
        leader: action.leader,
        ...clearTestOrder(state),
        ...markDirty(state),
      };

    case "REMOVE_LEADER":
      return {
        ...state,
        leader: null,
        ...clearTestOrder(state),
        ...markDirty(state),
      };

    case "ADD_CARD": {
      const newCards = new Map(state.cards);
      const existing = newCards.get(action.card.id);
      if (existing) {
        setClampedQuantity(newCards, existing, existing.quantity + 1);
      } else {
        newCards.set(action.card.id, {
          cardId: action.card.id,
          quantity: 1,
          selectedArtUrl: null,
          card: action.card,
        });
      }
      return {
        ...state,
        cards: newCards,
        ...clearTestOrder(state),
        ...markDirty(state),
      };
    }

    case "REMOVE_CARD": {
      const newCards = new Map(state.cards);
      newCards.delete(action.cardId);
      return {
        ...state,
        cards: newCards,
        ...clearTestOrder(state),
        ...markDirty(state),
      };
    }

    case "SET_QUANTITY": {
      const newCards = new Map(state.cards);
      const entry = newCards.get(action.cardId);
      if (entry) {
        if (action.quantity <= 0) {
          newCards.delete(action.cardId);
        } else {
          setClampedQuantity(newCards, entry, action.quantity);
        }
      }
      return {
        ...state,
        cards: newCards,
        ...clearTestOrder(state),
        ...markDirty(state),
      };
    }

    case "INCREMENT_CARD": {
      const newCards = new Map(state.cards);
      const entry = newCards.get(action.cardId);
      if (entry) {
        setClampedQuantity(newCards, entry, entry.quantity + 1);
      }
      return {
        ...state,
        cards: newCards,
        ...clearTestOrder(state),
        ...markDirty(state),
      };
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
      return {
        ...state,
        cards: newCards,
        ...clearTestOrder(state),
        ...markDirty(state),
      };
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
      return { ...state, cards: newCards, ...markDirty(state) };
    }

    case "CLEAR_DECK":
      return {
        ...state,
        leader: null,
        cards: new Map(),
        sleeveUrl: state.sleeveUrl,
        donArtUrl: state.donArtUrl,
        testOrder: null,
        ...markDirty(state),
      };

    case "LOAD_DECK": {
      return {
        ...action.state,
        cards:
          action.state.cards instanceof Map
            ? action.state.cards
            : new Map(Object.entries(action.state.cards)),
        isDirty: false,
        isSaving: false,
        editRevision: 0,
        saveRevision: null,
      };
    }

    case "IMPORT_CARDS": {
      const newCards = new Map(state.cards);
      for (const entry of action.cards) {
        const existing = newCards.get(entry.cardId);
        if (existing) {
          setClampedQuantity(
            newCards,
            existing,
            existing.quantity + entry.quantity
          );
        } else {
          setClampedQuantity(
            newCards,
            { ...entry, selectedArtUrl: entry.selectedArtUrl ?? null },
            entry.quantity
          );
        }
      }
      return {
        ...state,
        leader: action.leader ?? state.leader,
        cards: newCards,
        ...clearTestOrder(state),
        ...markDirty(state),
      };
    }

    case "SAVE_START":
      return {
        ...state,
        isSaving: true,
        saveRevision: state.editRevision,
      };

    case "SAVE_SUCCESS": {
      const savedLatestRevision = state.saveRevision === state.editRevision;
      return {
        ...state,
        id: action.id,
        isSaving: false,
        isDirty: savedLatestRevision ? false : state.isDirty,
        saveRevision: null,
        lastSavedAt: new Date(),
      };
    }

    case "SAVE_ERROR":
      return { ...state, isSaving: false, saveRevision: null };

    case "MARK_CLEAN":
      return { ...state, isDirty: false, saveRevision: null };

    case "SET_SLEEVE":
      return { ...state, sleeveUrl: action.sleeveUrl, ...markDirty(state) };

    case "SET_DON_ART":
      return { ...state, donArtUrl: action.donArtUrl, ...markDirty(state) };

    case "SET_TEST_ORDER":
      return { ...state, testOrder: action.testOrder, ...markDirty(state) };

    default:
      return state;
  }
}
