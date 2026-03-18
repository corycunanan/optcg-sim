"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeckDeleteButtonProps {
  deckId: string;
  deckName: string;
}

export function DeckDeleteButton({ deckId, deckName }: DeckDeleteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // noop
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.preventDefault()}
      >
        <span className="text-xs text-error">
          Delete &ldquo;{deckName}&rdquo;?
        </span>
        <button
          aria-label="Confirm delete"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded bg-error px-2 py-1 text-xs font-bold text-content-inverse transition-colors hover:bg-red-600 active:scale-95 disabled:opacity-50"
        >
          {deleting ? "…" : "Yes"}
        </button>
        <button
          aria-label="Cancel delete"
          onClick={() => setConfirming(false)}
          className="rounded border border-border px-2 py-1 text-xs text-content-secondary transition-colors hover:bg-surface-2"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      aria-label={`Delete deck ${deckName}`}
      onClick={(e) => {
        e.preventDefault();
        setConfirming(true);
      }}
      className="rounded px-2 py-1 text-xs text-error opacity-0 transition-all hover:bg-error-soft group-hover:opacity-100"
    >
      Delete
    </button>
  );
}
