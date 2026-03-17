"use client";

import { useState, useCallback } from "react";
import type { DeckCardEntry, DeckLeaderEntry } from "@/lib/deck-builder-state";

interface ImportModalProps {
  onImport: (leader: DeckLeaderEntry | null, cards: DeckCardEntry[]) => void;
  onClose: () => void;
}

interface ImportError {
  line: number;
  raw: string;
  error: string;
}

export function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [preview, setPreview] = useState<{
    leader: { cardId: string; card: DeckLeaderEntry } | null;
    cards: { cardId: string; quantity: number; card: DeckCardEntry["card"] }[];
  } | null>(null);

  const handleParse = useCallback(async () => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setErrors([]);
    setPreview(null);

    try {
      const res = await fetch("/api/decks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("Parse failed");

      const data = await res.json();
      setErrors(data.errors || []);
      setPreview({
        leader: data.leader
          ? {
              cardId: data.leader.cardId,
              card: data.leader.card,
            }
          : null,
        cards: data.cards || [],
      });
    } catch {
      setErrors([{ line: 0, raw: "", error: "Failed to parse deck list" }]);
    } finally {
      setIsProcessing(false);
    }
  }, [text]);

  const handleImport = useCallback(() => {
    if (!preview) return;

    const leader: DeckLeaderEntry | null = preview.leader
      ? {
          id: preview.leader.card.id,
          name: preview.leader.card.name,
          color: preview.leader.card.color,
          type: "Leader",
          life: null,
          power: preview.leader.card.power ?? null,
          imageUrl: preview.leader.card.imageUrl,
          traits: preview.leader.card.traits || [],
          effectText: "",
          attribute: [],
        }
      : null;

    const cards: DeckCardEntry[] = preview.cards.map((c) => ({
      cardId: c.cardId,
      quantity: c.quantity,
      card: c.card,
    }));

    onImport(leader, cards);
  }, [preview, onImport]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "oklch(0% 0 0 / 0.7)" }}
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-2xl p-6"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="mb-4 text-lg font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Import Deck
        </h2>

        <p
          className="mb-3 text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          Paste your deck list below. Format: <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-3)" }}>4x OP01-004</code> (one per line).
          Optionally include <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-3)" }}>Leader: OP01-001</code>.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Leader: OP01-001\n4x OP01-004\n4x OP01-006\n3x OP01-010\n...`}
          rows={10}
          className="mb-3 w-full resize-none rounded-lg p-3 font-mono text-sm focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-3 space-y-1">
            {errors.map((err, i) => (
              <div
                key={i}
                className="rounded-lg px-3 py-1.5 text-xs"
                style={{
                  background: "oklch(60% 0.18 25 / 0.06)",
                  color: "var(--error)",
                }}
              >
                {err.line > 0 && `Line ${err.line}: `}
                {err.error}
              </div>
            ))}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div
            className="mb-3 rounded-lg p-3 text-xs"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <p style={{ color: "var(--text-secondary)" }}>
              {preview.leader && (
                <span>
                  Leader: <strong>{preview.leader.card.name}</strong> ·{" "}
                </span>
              )}
              <strong>
                {preview.cards.reduce((sum, c) => sum + c.quantity, 0)}
              </strong>{" "}
              cards from{" "}
              <strong>{preview.cards.length}</strong> unique
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          {!preview ? (
            <button
              onClick={handleParse}
              disabled={!text.trim() || isProcessing}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              style={{
                background: "var(--teal)",
                color: "var(--surface-0)",
              }}
            >
              {isProcessing ? "Parsing…" : "Parse"}
            </button>
          ) : (
            <button
              onClick={handleImport}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--surface-0)",
              }}
            >
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
