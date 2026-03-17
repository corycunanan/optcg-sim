"use client";

import { useReducer, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deckBuilderReducer,
  createInitialState,
  type DeckCardEntry,
  type DeckLeaderEntry,
} from "@/lib/deck-builder-state";
import { validateDeck, type DeckCard, type DeckLeader } from "@/lib/deck-validation";
import { DeckBuilderSearch } from "./deck-builder-search";
import { DeckBuilderList } from "./deck-builder-list";
import { DeckBuilderHeader } from "./deck-builder-header";
import { DeckBuilderStats } from "./deck-builder-stats";
import { DeckBuilderValidation } from "./deck-builder-validation";
import { ImportModal } from "./import-modal";
import { ExportModal } from "./export-modal";

interface DeckBuilderShellProps {
  deckId: string | null;
}

export function DeckBuilderShell({ deckId }: DeckBuilderShellProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(deckBuilderReducer, createInitialState());
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [isLoading, setIsLoading] = useState(!!deckId);

  // Load existing deck
  useEffect(() => {
    if (!deckId) return;

    async function loadDeck() {
      try {
        const res = await fetch(`/api/decks/${deckId}`);
        if (!res.ok) {
          router.push("/decks");
          return;
        }
        const data = await res.json();

        const cardsMap = new Map<string, DeckCardEntry>();
        for (const dc of data.cards) {
          cardsMap.set(dc.cardId, {
            cardId: dc.cardId,
            quantity: dc.quantity,
            selectedArtUrl: null,
            card: dc.card,
          });
        }

        dispatch({
          type: "LOAD_DECK",
          state: {
            id: data.id,
            name: data.name,
            format: data.format,
            leader: data.leader,
            cards: cardsMap,
            lastSavedAt: new Date(data.updatedAt),
          },
        });
      } catch {
        router.push("/decks");
      } finally {
        setIsLoading(false);
      }
    }

    loadDeck();
  }, [deckId, router]);

  // Validation
  const cardsArray: DeckCard[] = Array.from(state.cards.values());
  const leaderForValidation: DeckLeader | null = state.leader
    ? {
        ...state.leader,
        effectText: state.leader.effectText || "",
      }
    : null;
  const validation = validateDeck(leaderForValidation, cardsArray, state.format);

  // Save deck
  const saveDeck = useCallback(async () => {
    if (!state.leader) return;

    dispatch({ type: "SAVE_START" });

    const payload = {
      name: state.name,
      leaderId: state.leader.id,
      format: state.format,
      cards: Array.from(state.cards.values()).map((c) => ({
        cardId: c.cardId,
        quantity: c.quantity,
      })),
    };

    try {
      let res: Response;
      if (state.id) {
        res = await fetch(`/api/decks/${state.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error("Save failed");

      const data = await res.json();
      dispatch({ type: "SAVE_SUCCESS", id: data.id });

      // Update URL for new decks
      if (!state.id) {
        router.replace(`/decks/${data.id}`);
      }
    } catch {
      dispatch({ type: "SAVE_ERROR" });
    }
  }, [state, router]);

  // Add card handler
  const addCard = useCallback(
    (card: DeckCardEntry["card"]) => {
      if (card.type === "Leader") {
        dispatch({
          type: "SET_LEADER",
          leader: {
            id: card.id,
            name: card.name,
            color: card.color,
            type: card.type,
            life: card.life ?? null,
            power: card.power,
            imageUrl: card.imageUrl,
            traits: card.traits,
            effectText: card.effectText || "",
            attribute: card.attribute || [],
          },
        });
      } else {
        dispatch({ type: "ADD_CARD", card });
      }
    },
    [],
  );

  // Remove card handler (decrement by 1)
  const removeCard = useCallback((cardId: string) => {
    dispatch({ type: "DECREMENT_CARD", cardId });
  }, []);

  // Set art variant handler
  const setArtVariant = useCallback((cardId: string, artUrl: string | null) => {
    dispatch({ type: "SET_ART_VARIANT", cardId, artUrl });
  }, []);

  // Import handler
  const handleImport = useCallback(
    (leader: DeckLeaderEntry | null, cards: DeckCardEntry[]) => {
      dispatch({ type: "IMPORT_CARDS", leader, cards });
      setShowImport(false);
    },
    [],
  );

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--surface-0)" }}
      >
        <div style={{ color: "var(--text-tertiary)" }}>Loading deck…</div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen flex-col"
      style={{ background: "var(--surface-0)", color: "var(--text-primary)" }}
    >
      {/* Header bar */}
      <DeckBuilderHeader
        name={state.name}
        isDirty={state.isDirty}
        isSaving={state.isSaving}
        lastSavedAt={state.lastSavedAt}
        isValid={validation.isValid}
        totalCards={validation.stats.totalCards}
        onNameChange={(name) => dispatch({ type: "SET_NAME", name })}
        onSave={saveDeck}
        onImport={() => setShowImport(true)}
        onExport={() => setShowExport(true)}
        onClear={() => dispatch({ type: "CLEAR_DECK" })}
      />

      {/* Main split layout — both panels scroll independently */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Card search — independent scroll */}
        <div
          className="flex w-[420px] shrink-0 flex-col overflow-hidden border-r"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <DeckBuilderSearch
            onAddCard={addCard}
            onRemoveCard={removeCard}
            onSetArtVariant={setArtVariant}
            deckCards={state.cards}
            leaderColors={state.leader?.color ?? []}
          />
        </div>

        {/* Right: Deck editor — independent scroll */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-1 flex-col gap-5 p-5">
            {/* Deck Stats */}
            <DeckBuilderStats
              leader={state.leader}
              stats={validation.stats}
              onRemoveLeader={() => dispatch({ type: "REMOVE_LEADER" })}
            />

            {/* Validation */}
            <DeckBuilderValidation results={validation.results} />

            {/* Card list */}
            <DeckBuilderList
              cards={Array.from(state.cards.values())}
              onIncrement={(id) => dispatch({ type: "INCREMENT_CARD", cardId: id })}
              onDecrement={(id) => dispatch({ type: "DECREMENT_CARD", cardId: id })}
              onRemove={(id) => dispatch({ type: "REMOVE_CARD", cardId: id })}
              onSetQuantity={(id, qty) =>
                dispatch({ type: "SET_QUANTITY", cardId: id, quantity: qty })
              }
              onSetArtVariant={setArtVariant}
              onAddCard={addCard}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      {showImport && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
      {showExport && (
        <ExportModal
          name={state.name}
          leader={state.leader}
          cards={Array.from(state.cards.values())}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
