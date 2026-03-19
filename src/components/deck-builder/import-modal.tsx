"use client";

import { useState, useCallback } from "react";
import type { DeckCardEntry, DeckLeaderEntry } from "@/lib/deck-builder/state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
        leader: data.leader ? { cardId: data.leader.cardId, card: data.leader.card } : null,
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
      selectedArtUrl: null,
      card: c.card,
    }));

    onImport(leader, cards);
  }, [preview, onImport]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Import Deck</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-content-tertiary">
            Paste your deck list below. Format:{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5">4x OP01-004</code> (one per line).
            Optionally include{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5">Leader: OP01-001</code>.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Leader: OP01-001\n4x OP01-004\n4x OP01-006\n3x OP01-010\n...`}
            rows={10}
            className="w-full resize-none rounded border border-border bg-surface-2 p-3 font-mono text-sm text-content-primary placeholder:text-content-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-navy-900/10"
          />

          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((err, i) => (
                <div key={i} className="rounded bg-error-soft px-3 py-2 text-xs text-error">
                  {err.line > 0 && `Line ${err.line}: `}
                  {err.error}
                </div>
              ))}
            </div>
          )}

          {preview && (
            <div className="rounded border border-border bg-surface-2 p-3 text-xs text-content-secondary">
              {preview.leader && (
                <span>
                  Leader: <strong>{preview.leader.card.name}</strong> ·{" "}
                </span>
              )}
              <strong>{preview.cards.reduce((sum, c) => sum + c.quantity, 0)}</strong> cards from{" "}
              <strong>{preview.cards.length}</strong> unique
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!preview ? (
            <Button onClick={handleParse} disabled={!text.trim() || isProcessing}>
              {isProcessing ? "Parsing…" : "Parse"}
            </Button>
          ) : (
            <Button onClick={handleImport}>Import</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
