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
import { DeckBuilderStatsCharts } from "./deck-builder-stats";
import { DeckBuilderValidation } from "./deck-builder-validation";
import { CardInspectModal } from "./card-inspect-modal";
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-content-tertiary">Loading deck…</div>
      </div>
    );
  }

  const leaderDisplayUrl = leaderSelectedArtUrl || state.leader?.imageUrl;

  return (
    <div className="flex h-screen flex-col bg-background text-content-primary">
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
            <div className="border-b border-border px-5 pt-4">
              <TabsList>
                <TabsTrigger value="cards">Cards</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>
            </div>

            {/* Cards tab */}
            <TabsContent value="cards" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* Leader + validation row */}
              <div className="flex gap-4 p-5 pb-4">
                {/* Leader card — large, clickable */}
                <div className="w-48 shrink-0">
                  {state.leader ? (
                    <div className="group relative">
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
                      {/* Remove button */}
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
                    <div className="flex aspect-[600/838] w-full items-center justify-center rounded border-2 border-dashed border-border p-3 text-center">
                      <p className="text-xs font-medium text-content-tertiary">
                        Search &amp; click a Leader to select
                      </p>
                    </div>
                  )}
                </div>

                {/* Compact validation tags */}
                <DeckBuilderValidation
                  results={validation.results}
                  totalCards={validation.stats.totalCards}
                />
              </div>

              {/* Card list */}
              <div className="px-5 pb-5">
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
        <CardInspectModal
          cardId={state.leader.id}
          quantityInDeck={0}
          selectedArtUrl={leaderSelectedArtUrl}
          isLeader
          onAddCard={() => {}}
          onRemoveCard={() => {}}
          onSetArtVariant={(artUrl) => setLeaderSelectedArtUrl(artUrl)}
          onClose={() => setInspectingLeader(false)}
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
