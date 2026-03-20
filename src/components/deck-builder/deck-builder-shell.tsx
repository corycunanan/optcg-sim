"use client";

import { useReducer, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deckBuilderReducer,
  createInitialState,
  type DeckCardEntry,
  type DeckLeaderEntry,
} from "@/lib/deck-builder/state";
import { validateDeck, type DeckCard, type DeckLeader } from "@/lib/deck-builder/validation";
import { DeckBuilderSearch } from "./deck-builder-search";
import { DeckBuilderList } from "./deck-builder-list";
import { DeckBuilderHeader } from "./deck-builder-header";
import { DeckBuilderStatsCharts } from "./deck-builder-stats";
import { DeckBuilderValidation } from "./deck-builder-validation";
import { CardDetailModal } from "@/components/admin/card-detail-modal";
import { ImportModal } from "./import-modal";
import { ExportModal } from "./export-modal";
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface DeckBuilderShellProps {
  deckId: string | null;
}

export function DeckBuilderShell({ deckId }: DeckBuilderShellProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(deckBuilderReducer, createInitialState());
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [isLoading, setIsLoading] = useState(!!deckId);
  const [inspectingLeader, setInspectingLeader] = useState(false);
  const [leaderSelectedArtUrl, setLeaderSelectedArtUrl] = useState<string | null>(null);

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

        if (data.leaderArtUrl) {
          setLeaderSelectedArtUrl(data.leaderArtUrl);
        }
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
      leaderArtUrl: leaderSelectedArtUrl ?? null,
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

  const removeCard = useCallback((cardId: string) => {
    dispatch({ type: "DECREMENT_CARD", cardId });
  }, []);

  const setArtVariant = useCallback((cardId: string, artUrl: string | null) => {
    dispatch({ type: "SET_ART_VARIANT", cardId, artUrl });
  }, []);

  const handleImport = useCallback(
    (leader: DeckLeaderEntry | null, cards: DeckCardEntry[]) => {
      dispatch({ type: "IMPORT_CARDS", leader, cards });
      setShowImport(false);
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-content-tertiary">Loading deck…</div>
      </div>
    );
  }

  const leaderDisplayUrl = leaderSelectedArtUrl || state.leader?.imageUrl;

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-background text-content-primary overflow-hidden">
      {/* Header bar */}
      <DeckBuilderHeader
        name={state.name}
        isDirty={state.isDirty}
        isSaving={state.isSaving}
        lastSavedAt={state.lastSavedAt}
        onNameChange={(name) => dispatch({ type: "SET_NAME", name })}
        onSave={saveDeck}
        onClear={() => dispatch({ type: "CLEAR_DECK" })}
      />

      {/* Main split layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Card search */}
        <div className="flex w-[420px] shrink-0 flex-col overflow-hidden border-r border-border">
          <DeckBuilderSearch
            onAddCard={addCard}
            onRemoveCard={removeCard}
            onSetArtVariant={setArtVariant}
            deckCards={state.cards}
            leaderColors={state.leader?.color ?? []}
          />
        </div>

        {/* Right: Deck editor with tabs */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsRoot defaultValue="cards" className="flex min-h-0 flex-1 flex-col">
            {/* Tab bar */}
            <div className="flex items-center justify-between px-5 pt-4">
              <TabsList>
                <TabsTrigger value="cards">Cards</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImport(true)}
                  className="rounded border border-border px-3 py-1 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
                >
                  Import
                </button>
                <button
                  onClick={() => setShowExport(true)}
                  className="rounded border border-border px-3 py-1 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
                >
                  Export
                </button>
              </div>
            </div>

            {/* Cards tab */}
            <TabsContent value="cards" className="flex min-h-0 flex-1">
              {/* Left column: card list */}
              <div className="flex-1 overflow-y-auto p-5">
                <DeckBuilderList
                  cards={Array.from(state.cards.values())}
                  onIncrement={(id) => dispatch({ type: "INCREMENT_CARD", cardId: id })}
                  onDecrement={(id) => dispatch({ type: "DECREMENT_CARD", cardId: id })}
                  onSetArtVariant={setArtVariant}
                  onAddCard={addCard}
                />
              </div>

              {/* Right column: leader + validation */}
              <div className="w-52 shrink-0 overflow-y-auto p-5">
                {/* Leader card */}
                {state.leader ? (
                  <div className="group relative mb-4">
                    <button
                      aria-label={`Inspect leader: ${state.leader.name}`}
                      onClick={() => setInspectingLeader(true)}
                      className="w-full overflow-hidden rounded"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={leaderDisplayUrl}
                        alt={state.leader.name}
                        className="w-full transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    </button>
                    <button
                      aria-label="Remove leader"
                      onClick={() => {
                        dispatch({ type: "REMOVE_LEADER" });
                        setLeaderSelectedArtUrl(null);
                      }}
                      className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded bg-overlay text-xs text-error opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="mb-4 flex aspect-[600/838] w-full items-center justify-center rounded border-2 border-dashed border-border p-3 text-center">
                    <p className="text-xs font-medium text-content-tertiary">
                      Search &amp; click a Leader to select
                    </p>
                  </div>
                )}

                {/* Validation badges */}
                <DeckBuilderValidation
                  results={validation.results}
                  totalCards={validation.stats.totalCards}
                />
              </div>
            </TabsContent>

            {/* Stats tab */}
            <TabsContent value="stats" className="overflow-y-auto p-5">
              <DeckBuilderStatsCharts stats={validation.stats} />
            </TabsContent>
          </TabsRoot>
        </div>
      </div>

      {/* Leader inspect modal */}
      {inspectingLeader && state.leader && (
        <CardDetailModal
          cardId={state.leader.id}
          onClose={() => setInspectingLeader(false)}
          deckActions={{
            quantityInDeck: 0,
            selectedArtUrl: leaderSelectedArtUrl,
            isLeader: true,
            onAdd: () => {},
            onRemove: () => {},
            onSetArtVariant: (artUrl) => setLeaderSelectedArtUrl(artUrl),
          }}
        />
      )}

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
