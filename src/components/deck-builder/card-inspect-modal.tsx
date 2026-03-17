"use client";

import { useState, useEffect } from "react";

interface ArtVariant {
  id: string;
  variantId: string;
  label: string;
  rarity: string;
  imageUrl: string;
  set: string;
}

interface CardSet {
  id: string;
  setLabel: string;
  setName: string;
  isOrigin: boolean;
}

interface CardInspectData {
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
  artVariants?: ArtVariant[];
  cardSets?: CardSet[];
}

interface CardInspectModalProps {
  cardId: string;
  /** Pre-loaded card data (from search results) — variants fetched async */
  preloadedCard?: CardInspectData;
  /** Quantity already in deck (0 if not added) */
  quantityInDeck: number;
  /** Currently selected art URL for this card in the deck */
  selectedArtUrl: string | null;
  /** Whether this card is a leader vs regular card */
  isLeader?: boolean;
  onAddCard: () => void;
  onRemoveCard: () => void;
  onSetArtVariant: (artUrl: string | null) => void;
  onClose: () => void;
}

const COLOR_ACCENT: Record<string, string> = {
  Red: "var(--card-red)",
  Blue: "var(--card-blue)",
  Green: "var(--card-green)",
  Purple: "var(--card-purple)",
  Black: "var(--card-black)",
  Yellow: "var(--card-yellow)",
};

export function CardInspectModal({
  cardId,
  preloadedCard,
  quantityInDeck,
  selectedArtUrl,
  isLeader,
  onAddCard,
  onRemoveCard,
  onSetArtVariant,
  onClose,
}: CardInspectModalProps) {
  const [card, setCard] = useState<CardInspectData | null>(preloadedCard ?? null);
  const [displayImage, setDisplayImage] = useState(
    selectedArtUrl || preloadedCard?.imageUrl || "",
  );
  const [isLoading, setIsLoading] = useState(!preloadedCard?.artVariants);

  // Fetch full card data with variants if not preloaded
  useEffect(() => {
    if (preloadedCard?.artVariants) {
      setCard(preloadedCard);
      setIsLoading(false);
      return;
    }

    async function fetchCard() {
      try {
        const res = await fetch(`/api/cards/${cardId}`);
        if (!res.ok) return;
        const data = await res.json();
        setCard(data);
        if (!displayImage) {
          setDisplayImage(selectedArtUrl || data.imageUrl);
        }
      } catch {
        // noop
      } finally {
        setIsLoading(false);
      }
    }

    fetchCard();
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update display image when card loads
  useEffect(() => {
    if (card && !displayImage) {
      setDisplayImage(selectedArtUrl || card.imageUrl);
    }
  }, [card, selectedArtUrl, displayImage]);

  const primaryColor = card?.color[0] || "Black";
  const accentColor = COLOR_ACCENT[primaryColor] || "var(--teal)";

  // All artworks: base + variants
  const allArtworks = card
    ? [
        { id: "__origin", label: "Original", imageUrl: card.imageUrl },
        ...(card.artVariants || []).map((v) => ({
          id: v.id,
          label: v.label,
          imageUrl: v.imageUrl,
        })),
      ]
    : [];

  const handleArtSelect = (artUrl: string) => {
    setDisplayImage(artUrl);
    // If it's the base image, set null (meaning "use base")
    onSetArtVariant(artUrl === card?.imageUrl ? null : artUrl);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0% 0 0 / 0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ color: "var(--text-tertiary)" }}
        >
          ✕
        </button>

        {isLoading || !card ? (
          <div
            className="flex w-full items-center justify-center py-20"
            style={{ color: "var(--text-tertiary)" }}
          >
            Loading…
          </div>
        ) : (
          <>
            {/* Left: Card image + art variants */}
            <div
              className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r p-4"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {/* Main image */}
              <div
                className="overflow-hidden rounded-xl"
                style={{ border: `2px solid ${accentColor}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayImage}
                  alt={card.name}
                  className="w-full"
                  key={displayImage}
                />
              </div>

              {/* Art variant selector */}
              {allArtworks.length > 1 && (
                <div className="mt-4">
                  <h4
                    className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Artworks ({allArtworks.length})
                  </h4>
                  <div className="grid grid-cols-3 gap-1.5">
                    {allArtworks.map((art) => {
                      const isSelected = displayImage === art.imageUrl;
                      return (
                        <button
                          key={art.id}
                          onClick={() => handleArtSelect(art.imageUrl)}
                          className="group overflow-hidden rounded-lg transition-all hover:-translate-y-0.5"
                          style={{
                            border: isSelected
                              ? "2px solid var(--accent)"
                              : "1px solid var(--border-subtle)",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={art.imageUrl}
                            alt={art.label}
                            className={`w-full transition-opacity ${isSelected ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}
                            loading="lazy"
                          />
                          <div
                            className="p-1 text-center text-[9px] font-medium"
                            style={{
                              background: isSelected
                                ? "var(--accent-soft)"
                                : "var(--surface-2)",
                              color: isSelected
                                ? "var(--accent)"
                                : "var(--text-tertiary)",
                            }}
                          >
                            {art.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Card details */}
            <div className="flex flex-1 flex-col overflow-y-auto p-5">
              {/* Header */}
              <div className="mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      className="text-xl font-bold tracking-tight"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {card.name}
                    </h2>
                    <p
                      className="mt-0.5 text-sm"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {card.id} · {card.type} · {card.rarity}
                    </p>
                  </div>
                  {card.banStatus !== "LEGAL" && (
                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold"
                      style={{ background: "var(--error)", color: "#fff" }}
                    >
                      {card.banStatus}
                    </span>
                  )}
                </div>

                {/* Color badges */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.color.map((c) => (
                    <span
                      key={c}
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: COLOR_ACCENT[c] || "var(--surface-3)",
                        color: c === "Yellow" ? "#222" : "#fff",
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats row */}
              <div className="mb-4 flex flex-wrap gap-2">
                {card.cost !== null && <StatPill label="Cost" value={String(card.cost)} />}
                {card.power !== null && (
                  <StatPill label="Power" value={card.power.toLocaleString()} />
                )}
                {card.counter !== null && (
                  <StatPill label="Counter" value={card.counter.toLocaleString()} />
                )}
                {card.life !== null && <StatPill label="Life" value={String(card.life)} />}
                <StatPill label="Block" value={String(card.blockNumber)} />
                <StatPill label="Set" value={card.originSet} />
              </div>

              {/* Attributes */}
              {card.attribute.length > 0 && (
                <div className="mb-3">
                  <Label text="Attributes" />
                  <div className="flex flex-wrap gap-1">
                    {card.attribute.map((a) => (
                      <Tag key={a} text={a} />
                    ))}
                  </div>
                </div>
              )}

              {/* Traits */}
              {card.traits.length > 0 && (
                <div className="mb-3">
                  <Label text="Traits" />
                  <div className="flex flex-wrap gap-1">
                    {card.traits.map((t) => (
                      <Tag key={t} text={t} />
                    ))}
                  </div>
                </div>
              )}

              {/* Effect text */}
              {card.effectText && (
                <div className="mb-3">
                  <Label text="Effect" />
                  <p
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {card.effectText}
                  </p>
                </div>
              )}

              {/* Trigger text */}
              {card.triggerText && (
                <div className="mb-3">
                  <Label text="Trigger" />
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {card.triggerText}
                  </p>
                </div>
              )}

              {/* Set membership */}
              {card.cardSets && card.cardSets.length > 0 && (
                <div className="mb-4">
                  <Label text="Appears In" />
                  <div className="space-y-1">
                    {card.cardSets.map((cs) => (
                      <div key={cs.id} className="flex items-center gap-2 text-xs">
                        <span
                          className="font-mono font-medium"
                          style={{ color: "var(--teal)" }}
                        >
                          {cs.setLabel}
                        </span>
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                        <span style={{ color: "var(--text-secondary)" }}>
                          {cs.setName}
                        </span>
                        {cs.isOrigin && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{
                              background: "var(--sage-muted)",
                              color: "var(--sage)",
                            }}
                          >
                            Origin
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Add/remove actions — pinned to bottom */}
              <div
                className="flex items-center gap-3 border-t pt-4"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {quantityInDeck > 0 ? (
                  <>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={onRemoveCard}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors hover:bg-white/10"
                        style={{
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        −
                      </button>
                      <span
                        className="w-8 text-center text-lg font-bold tabular-nums"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {quantityInDeck}
                      </span>
                      <button
                        onClick={onAddCard}
                        disabled={quantityInDeck >= 4}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors hover:bg-white/10 disabled:opacity-30"
                        style={{
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        +
                      </button>
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {isLeader ? "Set as leader" : `${quantityInDeck}/4 in deck`}
                    </span>
                  </>
                ) : (
                  <button
                    onClick={onAddCard}
                    className="rounded-lg px-5 py-2 text-sm font-semibold transition-colors"
                    style={{
                      background: "var(--accent)",
                      color: "var(--surface-0)",
                    }}
                  >
                    {isLeader || card.type === "Leader"
                      ? "Set as Leader"
                      : "+ Add to Deck"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-2.5 py-1.5 text-center"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="text-[9px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </div>
      <div
        className="text-sm font-bold tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <h4
      className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest"
      style={{ color: "var(--text-tertiary)" }}
    >
      {text}
    </h4>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: "var(--surface-3)",
        color: "var(--text-secondary)",
      }}
    >
      {text}
    </span>
  );
}
