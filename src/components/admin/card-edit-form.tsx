"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

    // Validate required fields
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
            ? form.attribute
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean)
            : [],
          traits: form.traits
            ? form.traits
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
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
        <div
          className="rounded p-3 text-sm font-medium"
          style={{
            background: "oklch(60% 0.18 25 / 0.1)",
            color: "var(--error)",
            border: "1px solid oklch(60% 0.18 25 / 0.2)",
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          className="rounded p-3 text-sm font-medium"
          style={{
            background: "oklch(72% 0.14 155 / 0.1)",
            color: "var(--success)",
            border: "1px solid oklch(72% 0.14 155 / 0.2)",
          }}
        >
          Saved! Redirecting…
        </div>
      )}

      {/* Card ID + Origin Set (read-only) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Card ID" hint="Read-only">
          <div
            className="w-full rounded px-3 py-2.5 font-mono text-sm"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text-tertiary)",
            }}
          >
            {card.id}
          </div>
        </Field>
        <Field label="Origin Set" hint="Derived from ID">
          <div
            className="w-full rounded px-3 py-2.5 text-sm"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text-tertiary)",
            }}
          >
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
          className="w-full rounded px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </Field>

      {/* Type */}
      <Field label="Type" required>
        <div className="flex gap-1.5">
          {CARD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => update("type", t)}
              className="rounded px-4 py-1.5 text-xs font-medium transition-all"
              style={
                form.type === t
                  ? {
                      background: "var(--teal)",
                      color: "var(--surface-0)",
                      border: "1px solid var(--teal)",
                    }
                  : {
                      background: "var(--surface-2)",
                      color: "var(--text-tertiary)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      {/* Color */}
      <Field label="Color" required>
        <div className="flex gap-1.5">
          {COLORS.map((c) => {
            const active = form.color.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleColor(c)}
                className="rounded px-3 py-1.5 text-xs font-medium transition-all"
                style={
                  active
                    ? {
                        background: `var(--card-${c.toLowerCase()})`,
                        color: c === "Yellow" ? "#222" : "#fff",
                        border: `1px solid var(--card-${c.toLowerCase()})`,
                      }
                    : {
                        background: "var(--surface-2)",
                        color: "var(--text-tertiary)",
                        border: "1px solid var(--border)",
                      }
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
            className="w-full rounded px-3 py-2.5 text-sm tabular-nums focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </Field>
        <Field label="Power">
          <input
            type="number"
            value={form.power}
            onChange={(e) => update("power", e.target.value)}
            min={0}
            step={1000}
            className="w-full rounded px-3 py-2.5 text-sm tabular-nums focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </Field>
        <Field label="Counter">
          <input
            type="number"
            value={form.counter}
            onChange={(e) => update("counter", e.target.value)}
            min={0}
            step={1000}
            className="w-full rounded px-3 py-2.5 text-sm tabular-nums focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </Field>
        <Field label="Life" hint="Leaders only">
          <input
            type="number"
            value={form.life}
            onChange={(e) => update("life", e.target.value)}
            min={0}
            className="w-full rounded px-3 py-2.5 text-sm tabular-nums focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
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
            className="w-full rounded px-3 py-2.5 text-sm focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </Field>
        <Field label="Block Number" required>
          <input
            type="number"
            value={form.blockNumber}
            onChange={(e) => update("blockNumber", e.target.value)}
            min={1}
            max={10}
            className="w-full rounded px-3 py-2.5 text-sm focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </Field>
        <Field label="Ban Status">
          <select
            value={form.banStatus}
            onChange={(e) => update("banStatus", e.target.value)}
            className="w-full rounded px-3 py-2.5 text-sm focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
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
          className="w-full rounded px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </Field>

      <Field label="Traits" hint="Comma-separated">
        <input
          type="text"
          value={form.traits}
          onChange={(e) => update("traits", e.target.value)}
          placeholder="Straw Hat Crew, Supernovas"
          className="w-full rounded px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </Field>

      {/* Effect Text */}
      <Field label="Effect Text">
        <textarea
          value={form.effectText}
          onChange={(e) => update("effectText", e.target.value)}
          rows={5}
          className="w-full rounded px-3 py-2.5 font-mono text-sm focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </Field>

      {/* Trigger Text */}
      <Field label="Trigger Text">
        <textarea
          value={form.triggerText}
          onChange={(e) => update("triggerText", e.target.value)}
          rows={2}
          className="w-full rounded px-3 py-2.5 font-mono text-sm focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </Field>

      {/* Image URL */}
      <Field label="Image URL">
        <input
          type="text"
          value={form.imageUrl}
          onChange={(e) => update("imageUrl", e.target.value)}
          placeholder="https://..."
          className="w-full rounded px-3 py-2.5 text-sm focus:outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </Field>

      {/* Image Preview */}
      {form.imageUrl && (
        <div
          className="w-48 overflow-hidden rounded"
          style={{ border: "1px solid var(--border-subtle)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.imageUrl} alt="Preview" className="w-full" />
        </div>
      )}

      {/* Reprint flag */}
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          id="isReprint"
          checked={form.isReprint}
          onChange={(e) => update("isReprint", e.target.checked)}
          className="h-4 w-4 rounded"
          style={{
            accentColor: "var(--teal)",
          }}
        />
        <label
          htmlFor="isReprint"
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          This card is a reprint (ID prefix doesn&apos;t match origin pack)
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
          style={{
            background: "var(--accent)",
            color: "var(--surface-0)",
          }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded px-6 py-2.5 text-sm transition-colors"
          style={{
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
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
      <label
        className="mb-1.5 block text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: "var(--accent)" }}>
            *
          </span>
        )}
        {hint && (
          <span
            className="ml-1 font-normal"
            style={{ color: "var(--text-tertiary)" }}
          >
            ({hint})
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
