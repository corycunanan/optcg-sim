"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CARD_TYPES = ["Leader", "Character", "Event", "Stage"];
const COLORS = ["Red", "Blue", "Green", "Purple", "Black", "Yellow"];
const BAN_STATUSES = ["LEGAL", "BANNED", "RESTRICTED"];

export default function NewCardPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    id: "",
    name: "",
    type: "Character",
    color: [] as string[],
    cost: "",
    power: "",
    counter: "",
    life: "",
    attribute: "",
    traits: "",
    rarity: "",
    effectText: "",
    triggerText: "",
    imageUrl: "",
    blockNumber: "",
    banStatus: "LEGAL",
  });

  function update(field: string, value: string | string[]) {
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

    // Validate required fields
    if (!form.id || !form.name || !form.type || form.color.length === 0) {
      setError("Card ID, name, type, and at least one color are required.");
      setSaving(false);
      return;
    }

    if (!form.blockNumber) {
      setError("Block number is required.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id.trim(),
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
          effectText: form.effectText || "",
          triggerText: form.triggerText || null,
          imageUrl: form.imageUrl || "",
          blockNumber: parseInt(form.blockNumber),
          banStatus: form.banStatus,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create card");
      }

      const card = await res.json();
      router.push(`/admin/cards/${card.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1
        className="mb-8 text-3xl font-bold tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        Add Card
      </h1>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
        {error && (
          <div
            className="rounded-lg p-3 text-sm font-medium"
            style={{
              background: "oklch(60% 0.18 25 / 0.1)",
              color: "var(--error)",
              border: "1px solid oklch(60% 0.18 25 / 0.2)",
            }}
          >
            {error}
          </div>
        )}

        {/* Card ID + Name row */}
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Card ID" required>
            <input
              type="text"
              value={form.id}
              onChange={(e) => update("id", e.target.value)}
              placeholder="OP15-096"
              className="w-full rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </Field>
          <Field label="Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Monkey D. Luffy"
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </Field>
        </div>

        {/* Type */}
        <Field label="Type" required>
          <div className="flex gap-1.5">
            {CARD_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update("type", t)}
                className="rounded-md px-4 py-1.5 text-xs font-medium transition-all"
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
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-all"
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
              className="w-full rounded-lg px-3 py-2.5 text-sm tabular-nums focus:outline-none"
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
              className="w-full rounded-lg px-3 py-2.5 text-sm tabular-nums focus:outline-none"
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
              className="w-full rounded-lg px-3 py-2.5 text-sm tabular-nums focus:outline-none"
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
              className="w-full rounded-lg px-3 py-2.5 text-sm tabular-nums focus:outline-none"
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
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
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
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
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
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
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
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
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
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
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
            className="w-full rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none"
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
            className="w-full rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none"
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
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </Field>

        {/* Preview + Actions */}
        {form.imageUrl && (
          <div
            className="w-48 overflow-hidden rounded-lg"
            style={{ border: "1px solid var(--border-subtle)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.imageUrl} alt="Preview" className="w-full" />
          </div>
        )}

        <div className="flex gap-3 pt-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "var(--surface-0)",
            }}
          >
            {saving ? "Creating…" : "Create Card"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg px-6 py-2.5 text-sm transition-colors"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
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
