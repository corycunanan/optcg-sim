"use client";

import { useState } from "react";
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

interface ExportModalProps {
  name: string;
  leader: DeckLeaderEntry | null;
  cards: DeckCardEntry[];
  onClose: () => void;
}

export function ExportModal({ name, leader, cards, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false);

  const typeOrder: Record<string, number> = { Character: 0, Event: 1, Stage: 2 };

  const sorted = [...cards].sort((a, b) => {
    const ta = typeOrder[a.card.type] ?? 3;
    const tb = typeOrder[b.card.type] ?? 3;
    if (ta !== tb) return ta - tb;
    return (a.card.cost ?? 0) - (b.card.cost ?? 0);
  });

  const lines: string[] = [];
  lines.push(`// Deck: ${name}`);
  if (leader) lines.push(`// Leader: ${leader.id} — ${leader.name}`);
  lines.push("");
  if (leader) lines.push(`1x ${leader.id}`);
  for (const entry of sorted) lines.push(`${entry.quantity}x ${entry.cardId}`);

  const deckText = lines.join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(deckText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([deckText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Export Deck</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <textarea
            readOnly
            value={deckText}
            rows={Math.min(20, lines.length + 2)}
            className="w-full resize-none rounded border border-border bg-surface-2 p-3 font-mono text-sm text-content-primary focus:outline-none"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={handleDownload}>Download .txt</Button>
          <Button
            onClick={handleCopy}
            variant={copied ? "secondary" : "default"}
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
