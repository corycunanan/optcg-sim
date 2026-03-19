"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const CARD_TYPES = ["Leader", "Character", "Event", "Stage"];
const COLORS = ["Red", "Blue", "Green", "Purple", "Black", "Yellow"];
const BAN_STATUSES = ["LEGAL", "BANNED", "RESTRICTED"];

interface Card {
  id: string;
  originSet: string;
  name: string;
  color: string[];
  type: string;
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string[];
  traits: string[];
  rarity: string;
  effectText: string;
  triggerText: string | null;
  imageUrl: string;
  blockNumber: number;
  banStatus: string;
  isReprint: boolean;
}

export function CardEditForm({ card }: { card: Card }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: card.name,
    type: card.type,
    color: card.color,
    cost: card.cost != null ? String(card.cost) : "",
    power: card.power != null ? String(card.power) : "",
    counter: card.counter != null ? String(card.counter) : "",
    life: card.life != null ? String(card.life) : "",
    attribute: card.attribute.join(", "),
    traits: card.traits.join(", "),
    rarity: card.rarity,
    effectText: card.effectText,
    triggerText: card.triggerText || "",
    imageUrl: card.imageUrl,
    blockNumber: String(card.blockNumber),
    banStatus: card.banStatus,
    isReprint: card.isReprint,
  });

  function update(field: string, value: string | string[] | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleColor(color: string) {
    setForm((prev) => ({
      ...prev,
      color: prev.color.includes(color)
        ? prev.color.filter((c) => c !== color)
        : [...prev.color, color],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    if (!form.name || !form.type || form.color.length === 0) {
      setError("Name, type, and at least one color are required.");
      setSaving(false);
      return;
    }

    if (!form.blockNumber) {
      setError("Block number is required.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          color: form.color,
          cost: form.cost ? parseInt(form.cost) : null,
          power: form.power ? parseInt(form.power) : null,
          counter: form.counter ? parseInt(form.counter) : null,
          life: form.life ? parseInt(form.life) : null,
          attribute: form.attribute
            ? form.attribute.split(",").map((a) => a.trim()).filter(Boolean)
            : [],
          traits: form.traits
            ? form.traits.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
          rarity: form.rarity || "Unknown",
          effectText: form.effectText,
          triggerText: form.triggerText || null,
          imageUrl: form.imageUrl || "",
          blockNumber: parseInt(form.blockNumber),
          banStatus: form.banStatus,
          isReprint: form.isReprint,
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
        <div className="rounded bg-error-soft p-3 text-sm font-medium text-error">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded bg-success-soft p-3 text-sm font-medium text-success">
          Saved! Redirecting…
        </div>
      )}

      {/* Card ID + Origin Set (read-only) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Card ID" hint="Read-only">
          <div className="w-full rounded border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-content-tertiary">
            {card.id}
          </div>
        </Field>
        <Field label="Origin Set" hint="Derived from ID">
          <div className="w-full rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-tertiary">
            {card.originSet}
          </div>
        </Field>
      </div>

      {/* Name */}
      <Field label="Name" required>
        <input
          type="text"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary focus:outline-none"
        />
      </Field>

      {/* Type */}
      <Field label="Type" required>
        <div className="flex gap-2">
          {CARD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => update("type", t)}
              className={cn(
                "rounded border px-4 py-1 text-xs font-medium transition-all",
                form.type === t
                  ? "border-navy-900 bg-navy-900 text-content-inverse"
                  : "border-border bg-surface-2 text-content-tertiary hover:bg-surface-3",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      {/* Color */}
      <Field label="Color" required>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => {
            const active = form.color.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleColor(c)}
                className={cn(
                  "rounded border px-3 py-1 text-xs font-medium transition-all",
                  !active && "border-border bg-surface-2 text-content-tertiary hover:bg-surface-3",
                )}
                style={
                  active
                    ? {
                        background: `var(--card-${c.toLowerCase()})`,
                        color: c === "Yellow" ? "var(--text-primary)" : "var(--text-inverse)",
                        borderColor: `var(--card-${c.toLowerCase()})`,
                      }
                    : undefined
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Cost">
          <input
            type="number"
            value={form.cost}
            onChange={(e) => update("cost", e.target.value)}
            min={0}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm tabular-nums text-content-primary focus:outline-none"
          />
        </Field>
        <Field label="Power">
          <input
            type="number"
            value={form.power}
            onChange={(e) => update("power", e.target.value)}
            min={0}
            step={1000}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm tabular-nums text-content-primary focus:outline-none"
          />
        </Field>
        <Field label="Counter">
          <input
            type="number"
            value={form.counter}
            onChange={(e) => update("counter", e.target.value)}
            min={0}
            step={1000}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm tabular-nums text-content-primary focus:outline-none"
          />
        </Field>
        <Field label="Life" hint="Leaders only">
          <input
            type="number"
            value={form.life}
            onChange={(e) => update("life", e.target.value)}
            min={0}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm tabular-nums text-content-primary focus:outline-none"
          />
        </Field>
      </div>

      {/* Metadata row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rarity">
          <input
            type="text"
            value={form.rarity}
            onChange={(e) => update("rarity", e.target.value)}
            placeholder="Rare, SuperRare…"
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary focus:outline-none"
          />
        </Field>
        <Field label="Block Number" required>
          <input
            type="number"
            value={form.blockNumber}
            onChange={(e) => update("blockNumber", e.target.value)}
            min={1}
            max={10}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary focus:outline-none"
          />
        </Field>
        <Field label="Ban Status">
          <select
            value={form.banStatus}
            onChange={(e) => update("banStatus", e.target.value)}
            className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary focus:outline-none"
          >
            {BAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Attribute + Traits */}
      <Field label="Attributes" hint="Comma-separated">
        <input
          type="text"
          value={form.attribute}
          onChange={(e) => update("attribute", e.target.value)}
          placeholder="Strike, Slash, Ranged"
          className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary focus:outline-none"
        />
      </Field>

      <Field label="Traits" hint="Comma-separated">
        <input
          type="text"
          value={form.traits}
          onChange={(e) => update("traits", e.target.value)}
          placeholder="Straw Hat Crew, Supernovas"
          className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary focus:outline-none"
        />
      </Field>

      {/* Effect Text */}
      <Field label="Effect Text">
        <textarea
          value={form.effectText}
          onChange={(e) => update("effectText", e.target.value)}
          rows={5}
          className="w-full rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-content-primary focus:outline-none"
        />
      </Field>

      {/* Trigger Text */}
      <Field label="Trigger Text">
        <textarea
          value={form.triggerText}
          onChange={(e) => update("triggerText", e.target.value)}
          rows={2}
          className="w-full rounded border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-content-primary focus:outline-none"
        />
      </Field>

      {/* Image URL */}
      <Field label="Image URL">
        <input
          type="text"
          value={form.imageUrl}
          onChange={(e) => update("imageUrl", e.target.value)}
          placeholder="https://..."
          className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-content-primary focus:outline-none"
        />
      </Field>

      {/* Image Preview */}
      {form.imageUrl && (
        <div className="w-48 overflow-hidden rounded border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.imageUrl} alt="Preview" className="w-full" />
        </div>
      )}

      {/* Reprint flag */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isReprint"
          checked={form.isReprint}
          onChange={(e) => update("isReprint", e.target.checked)}
          className="h-4 w-4 rounded accent-navy-900"
        />
        <label htmlFor="isReprint" className="text-sm text-content-secondary">
          This card is a reprint (ID prefix doesn&apos;t match origin pack)
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-navy-900 px-6 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-6 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-2"
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
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-content-secondary">
        {label}
        {required && (
          <span className="ml-1 text-red-600">*</span>
        )}
        {hint && (
          <span className="ml-1 font-normal text-content-tertiary">
            ({hint})
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
