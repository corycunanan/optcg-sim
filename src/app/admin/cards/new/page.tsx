"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
            ? form.attribute.split(",").map((a) => a.trim()).filter(Boolean)
            : [],
          traits: form.traits
            ? form.traits.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
          rarity: form.rarity || "Unknown",
          effectText: form.effectText || "",
          triggerText: form.triggerText || null,
          imageUrl: form.imageUrl || "",
          blockNumber: parseInt(form.blockNumber),
          banStatus: form.banStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create card");
      }

      router.push(`/admin/cards/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-8 font-display text-3xl font-bold tracking-tight text-content-primary">
        Add Card
      </h1>

      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Card ID + Name row */}
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Card ID" required>
            <Input
              type="text"
              value={form.id}
              onChange={(e) => update("id", e.target.value)}
              placeholder="OP15-096"
              className="font-mono"
            />
          </Field>
          <Field label="Name" required>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Monkey D. Luffy"
            />
          </Field>
        </div>

        {/* Type */}
        <Field label="Type" required>
          <div className="flex gap-2">
            {CARD_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                variant={form.type === t ? "default" : "secondary"}
                size="sm"
                onClick={() => update("type", t)}
              >
                {t}
              </Button>
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
                    "rounded-md border px-3 py-1 text-xs font-medium transition-all",
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
            <Input
              type="number"
              value={form.cost}
              onChange={(e) => update("cost", e.target.value)}
              min={0}
              className="tabular-nums"
            />
          </Field>
          <Field label="Power">
            <Input
              type="number"
              value={form.power}
              onChange={(e) => update("power", e.target.value)}
              min={0}
              step={1000}
              className="tabular-nums"
            />
          </Field>
          <Field label="Counter">
            <Input
              type="number"
              value={form.counter}
              onChange={(e) => update("counter", e.target.value)}
              min={0}
              step={1000}
              className="tabular-nums"
            />
          </Field>
          <Field label="Life" hint="Leaders only">
            <Input
              type="number"
              value={form.life}
              onChange={(e) => update("life", e.target.value)}
              min={0}
              className="tabular-nums"
            />
          </Field>
        </div>

        {/* Metadata row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rarity">
            <Input
              type="text"
              value={form.rarity}
              onChange={(e) => update("rarity", e.target.value)}
              placeholder="Rare, SuperRare..."
            />
          </Field>
          <Field label="Block Number" required>
            <Input
              type="number"
              value={form.blockNumber}
              onChange={(e) => update("blockNumber", e.target.value)}
              min={1}
              max={10}
            />
          </Field>
          <Field label="Ban Status">
            <Select value={form.banStatus} onValueChange={(v) => update("banStatus", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Attribute + Traits */}
        <Field label="Attributes" hint="Comma-separated">
          <Input
            type="text"
            value={form.attribute}
            onChange={(e) => update("attribute", e.target.value)}
            placeholder="Strike, Slash, Ranged"
          />
        </Field>

        <Field label="Traits" hint="Comma-separated">
          <Input
            type="text"
            value={form.traits}
            onChange={(e) => update("traits", e.target.value)}
            placeholder="Straw Hat Crew, Supernovas"
          />
        </Field>

        {/* Effect Text */}
        <Field label="Effect Text">
          <Textarea
            value={form.effectText}
            onChange={(e) => update("effectText", e.target.value)}
            rows={5}
            className="font-mono"
          />
        </Field>

        {/* Trigger Text */}
        <Field label="Trigger Text">
          <Textarea
            value={form.triggerText}
            onChange={(e) => update("triggerText", e.target.value)}
            rows={2}
            className="font-mono"
          />
        </Field>

        {/* Image URL */}
        <Field label="Image URL">
          <Input
            type="text"
            value={form.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
            placeholder="https://..."
          />
        </Field>

        {/* Preview */}
        {form.imageUrl && (
          <div className="w-48 overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.imageUrl} alt="Preview" className="w-full" />
          </div>
        )}

        <div className="flex gap-3 pt-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create Card"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
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
      <label className="mb-2 block text-sm font-medium text-content-secondary">
        {label}
        {required && (
          <span className="ml-1 text-error">*</span>
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
