"use client";

import { useState } from "react";
import type { DeckCardEntry, DeckLeaderEntry } from "@/lib/deck-builder-state";

interface ExportModalProps {
  name: string;
  leader: DeckLeaderEntry | null;
  cards: DeckCardEntry[];
  onClose: () => void;
}

export function ExportModal({ name, leader, cards, onClose }: ExportModalProps) {
  const [copied, setCopied] = useState(false);

  // Sort cards by type, then cost, then name
  const typeOrder: Record<string, number> = {
    Character: 0,
    Event: 1,
    Stage: 2,
  };

  const sorted = [...cards].sort((a, b) => {
    const ta = typeOrder[a.card.type] ?? 3;
    const tb = typeOrder[b.card.type] ?? 3;
    if (ta !== tb) return ta - tb;
    return (a.card.cost ?? 0) - (b.card.cost ?? 0);
  });

  const lines: string[] = [];
  lines.push(`// Deck: ${name}`);
  if (leader) {
    lines.push(`// Leader: ${leader.id} — ${leader.name}`);
  }
  lines.push("");
  if (leader) {
    lines.push(`1x ${leader.id}`);
  }
  for (const entry of sorted) {
    lines.push(`${entry.quantity}x ${entry.cardId}`);
  }

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
          Export Deck
        </h2>

        <textarea
          readOnly
          value={deckText}
          rows={Math.min(20, lines.length + 2)}
          className="mb-4 w-full resize-none rounded-lg p-3 font-mono text-sm"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Close
          </button>
          <button
            onClick={handleDownload}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Download .txt
          </button>
          <button
            onClick={handleCopy}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: copied ? "var(--success)" : "var(--accent)",
              color: "var(--surface-0)",
            }}
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
