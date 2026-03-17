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
        <span className="text-[10px]" style={{ color: "var(--error)" }}>
          Delete &ldquo;{deckName}&rdquo;?
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded px-2 py-0.5 text-[10px] font-bold"
          style={{ background: "var(--error)", color: "#fff" }}
        >
          {deleting ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-0.5 text-[10px]"
          style={{
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        setConfirming(true);
      }}
      className="rounded px-2 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
      style={{ color: "var(--error)" }}
    >
      Delete
    </button>
  );
}
