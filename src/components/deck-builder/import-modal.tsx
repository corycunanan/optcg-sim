"use client";

import { useState, useCallback } from "react";
import { apiPost } from "@/lib/api-client";
import type { DeckCardEntry, DeckLeaderEntry } from "@/lib/deck-builder/state";
import { DeckImportResponseSchema } from "@/lib/validators/cards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getDeckCardCopyLimit } from "@/lib/deck-builder/validation";

interface ImportModalProps {
  onImport: (leader: DeckLeaderEntry | null, cards: DeckCardEntry[]) => void;
  onClose: () => void;
}

interface ImportError {
  line: number;
  raw: string;
  error: string | null;
}

interface ImportCard {
  id: string;
  name: string;
  type: string;
  color: string[];
  cost: number | null;
  power: number | null;
  imageUrl: string;
  traits: string[];
  effectSchema?: unknown | null;
}

export function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [preview, setPreview] = useState<{
    leader: { cardId: string; card: ImportCard } | null;
    cards: { cardId: string; quantity: number; card: ImportCard }[];
  } | null>(null);

  // Quantities above a card's copy limit are clamped on import — surface that
  // in the preview instead of silently dropping copies. The reducer merges
  // duplicate lines for the same card before clamping, so aggregate by cardId
  // first or repeated lines each look under-limit.
  const aggregatedCards = [
    ...(preview?.cards ?? [])
      .reduce((byId, c) => {
        const existing = byId.get(c.cardId);
        return byId.set(c.cardId, {
          ...c,
          quantity: (existing?.quantity ?? 0) + c.quantity,
        });
      }, new Map<string, { cardId: string; quantity: number; card: ImportCard }>())
      .values(),
  ];
  const clampWarnings = aggregatedCards
    .map((c) => ({ ...c, copyLimit: getDeckCardCopyLimit(c.card) }))
    .filter((c) => c.quantity > c.copyLimit)
    .map(
      (c) =>
        `${c.card.name} (${c.cardId}): importing ${c.copyLimit} of ${c.quantity} copies (copy limit ${c.copyLimit})`
    );
  const importedCardCount = aggregatedCards.reduce(
    (sum, c) => sum + Math.min(c.quantity, getDeckCardCopyLimit(c.card)),
    0
  );

  const handleParse = useCallback(async () => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setErrors([]);
    setPreview(null);

    try {
      const { data: result } = await apiPost(
        "/api/decks/import",
        { text },
        DeckImportResponseSchema
      );
      setErrors(result.errors || []);
      setPreview({
        leader: result.leader
          ? { cardId: result.leader.cardId, card: result.leader.card }
          : null,
        cards: result.cards || [],
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
          effectSchema: preview.leader.card.effectSchema ?? null,
        }
      : null;

    const cards: DeckCardEntry[] = preview.cards.map((c) => ({
      cardId: c.cardId,
      quantity: c.quantity,
      selectedArtUrl: null,
      card: {
        ...c.card,
        counter: null,
        life: null,
        banStatus: "LEGAL",
        blockNumber: 0,
        attribute: [],
        effectText: "",
        triggerText: null,
        rarity: "Unknown",
        originSet: c.cardId.split("-")[0] ?? "",
      },
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
          <p className="text-content-tertiary text-xs">
            Paste your deck list below. Supports{" "}
            <code className="bg-surface-3 rounded px-1 py-0.5">
              4x OP01-004
            </code>{" "}
            or{" "}
            <code className="bg-surface-3 rounded px-1 py-0.5">
              4 Card Name (OP01-004)
            </code>{" "}
            formats, with optional section headers.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Leader\n1 Portgas.D.Ace (OP13-002)\n\nCharacter (40)\n4 Izo (ST22-002)\n4 Monkey.D.Garp (OP13-016)\n\n— or —\n\nLeader: OP01-001\n4x OP01-004\n3x OP01-010`}
            rows={10}
            className="border-border bg-surface-2 text-content-primary placeholder:text-content-tertiary focus:border-border-focus focus:ring-navy-900/10 w-full resize-none rounded border p-3 font-mono text-sm focus:ring-2 focus:outline-none"
          />

          {errors.length > 0 && (
            <div className="flex flex-col gap-1">
              {errors.map((err, i) => (
                <Alert key={i} variant="destructive">
                  <AlertDescription>
                    {err.line > 0 && `Line ${err.line}: `}
                    {err.error}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {clampWarnings.length > 0 && (
            <div className="flex flex-col gap-1">
              {clampWarnings.map((warning, i) => (
                <Alert key={i} variant="warning">
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {preview && (
            <div className="border-border bg-surface-2 text-content-secondary rounded border p-3 text-xs">
              {preview.leader && (
                <span>
                  Leader: <strong>{preview.leader.card.name}</strong> ·{" "}
                </span>
              )}
              <strong>{importedCardCount}</strong> cards from{" "}
              <strong>{aggregatedCards.length}</strong> unique
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!preview ? (
            <Button
              onClick={handleParse}
              disabled={!text.trim() || isProcessing}
            >
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
