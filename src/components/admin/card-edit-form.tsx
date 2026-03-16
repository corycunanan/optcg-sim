"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Card {
  id: string;
  name: string;
  banStatus: string;
  effectText: string;
  triggerText: string | null;
  traits: string[];
  rarity: string;
  blockNumber: number;
}

export function CardEditForm({ card }: { card: Card }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [banStatus, setBanStatus] = useState(card.banStatus);
  const [effectText, setEffectText] = useState(card.effectText);
  const [triggerText, setTriggerText] = useState(card.triggerText || "");
  const [traits, setTraits] = useState(card.traits.join(", "));
  const [rarity, setRarity] = useState(card.rarity);
  const [blockNumber, setBlockNumber] = useState(String(card.blockNumber));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banStatus,
          effectText,
          triggerText: triggerText || null,
          traits: traits
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          rarity,
          blockNumber: parseInt(blockNumber),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/admin/cards/${card.id}`);
        router.refresh();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          Saved! Redirecting...
        </div>
      )}

      {/* Ban Status */}
      <Field label="Ban Status">
        <select
          value={banStatus}
          onChange={(e) => setBanStatus(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="LEGAL">Legal</option>
          <option value="BANNED">Banned</option>
          <option value="RESTRICTED">Restricted</option>
        </select>
      </Field>

      {/* Rarity */}
      <Field label="Rarity">
        <input
          type="text"
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </Field>

      {/* Block Number */}
      <Field label="Block Number">
        <input
          type="number"
          value={blockNumber}
          onChange={(e) => setBlockNumber(e.target.value)}
          min={1}
          max={10}
          className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </Field>

      {/* Traits */}
      <Field label="Traits" hint="Comma-separated">
        <input
          type="text"
          value={traits}
          onChange={(e) => setTraits(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          placeholder="Straw Hat Crew, Supernovas"
        />
      </Field>

      {/* Effect Text */}
      <Field label="Effect Text">
        <textarea
          value={effectText}
          onChange={(e) => setEffectText(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
        />
      </Field>

      {/* Trigger Text */}
      <Field label="Trigger Text">
        <textarea
          value={triggerText}
          onChange={(e) => setTriggerText(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
        />
      </Field>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {hint && (
          <span className="ml-1 font-normal text-gray-400">({hint})</span>
        )}
      </label>
      {children}
    </div>
  );
}
