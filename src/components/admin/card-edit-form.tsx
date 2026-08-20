"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorChipToggle } from "@/components/cards/color-chip";
import { COLORS } from "@/lib/cards/colors-ui";

const CARD_TYPES = ["Leader", "Character", "Event", "Stage"];
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
      await apiPatch(`/api/cards/${card.id}`, {
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
      });

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
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="success">
          <AlertDescription>Saved! Redirecting…</AlertDescription>
        </Alert>
      )}

      {/* Card ID + Origin Set (read-only) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Card ID" hint="Read-only">
          <div className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-content-tertiary">
            {card.id}
          </div>
        </Field>
        <Field label="Origin Set" hint="Derived from ID">
          <div className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-content-tertiary">
            {card.originSet}
          </div>
        </Field>
      </div>

      {/* Name */}
      <Field label="Name" htmlFor="name" required>
        <Input
          id="name"
          type="text"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </Field>

      {/* Type */}
      <Field label="Type" required>
        <div className="flex gap-2">
          {CARD_TYPES.map((t) => (
            <Button
              key={t}
              type="button"
              variant={form.type === t ? "outline" : "default"}
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
          {COLORS.map((c) => (
            <ColorChipToggle
              key={c}
              color={c}
              pressed={form.color.includes(c)}
              onPressedChange={() => toggleColor(c)}
            />
          ))}
        </div>
      </Field>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Cost" htmlFor="cost">
          <Input
            id="cost"
            type="number"
            value={form.cost}
            onChange={(e) => update("cost", e.target.value)}
            min={0}
            className="tabular-nums"
          />
        </Field>
        <Field label="Power" htmlFor="power">
          <Input
            id="power"
            type="number"
            value={form.power}
            onChange={(e) => update("power", e.target.value)}
            min={0}
            step={1000}
            className="tabular-nums"
          />
        </Field>
        <Field label="Counter" htmlFor="counter">
          <Input
            id="counter"
            type="number"
            value={form.counter}
            onChange={(e) => update("counter", e.target.value)}
            min={0}
            step={1000}
            className="tabular-nums"
          />
        </Field>
        <Field label="Life" htmlFor="life" hint="Leaders only">
          <Input
            id="life"
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
        <Field label="Rarity" htmlFor="rarity">
          <Input
            id="rarity"
            type="text"
            value={form.rarity}
            onChange={(e) => update("rarity", e.target.value)}
            placeholder="Rare, SuperRare..."
          />
        </Field>
        <Field label="Block Number" htmlFor="block-number" required>
          <Input
            id="block-number"
            type="number"
            value={form.blockNumber}
            onChange={(e) => update("blockNumber", e.target.value)}
            min={1}
            max={10}
          />
        </Field>
        <Field label="Ban Status" htmlFor="ban-status">
          <Select value={form.banStatus} onValueChange={(v) => update("banStatus", v)}>
            <SelectTrigger id="ban-status">
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
      <Field label="Attributes" htmlFor="attributes" hint="Comma-separated">
        <Input
          id="attributes"
          type="text"
          value={form.attribute}
          onChange={(e) => update("attribute", e.target.value)}
          placeholder="Strike, Slash, Ranged"
        />
      </Field>

      <Field label="Traits" htmlFor="traits" hint="Comma-separated">
        <Input
          id="traits"
          type="text"
          value={form.traits}
          onChange={(e) => update("traits", e.target.value)}
          placeholder="Straw Hat Crew, Supernovas"
        />
      </Field>

      {/* Effect Text */}
      <Field label="Effect Text" htmlFor="effect-text">
        <Textarea
          id="effect-text"
          value={form.effectText}
          onChange={(e) => update("effectText", e.target.value)}
          rows={5}
          className="font-mono"
        />
      </Field>

      {/* Trigger Text */}
      <Field label="Trigger Text" htmlFor="trigger-text">
        <Textarea
          id="trigger-text"
          value={form.triggerText}
          onChange={(e) => update("triggerText", e.target.value)}
          rows={2}
          className="font-mono"
        />
      </Field>

      {/* Image URL */}
      <Field label="Image URL" htmlFor="image-url">
        <Input
          id="image-url"
          type="text"
          value={form.imageUrl}
          onChange={(e) => update("imageUrl", e.target.value)}
          placeholder="https://..."
        />
      </Field>

      {/* Image Preview */}
      {form.imageUrl && (
        <div className="rounded-card w-48 overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={form.imageUrl} alt="Preview" className="w-full" />
        </div>
      )}

      {/* Reprint flag */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="isReprint"
          checked={form.isReprint}
          onCheckedChange={(checked) => update("isReprint", !!checked)}
        />
        <Label htmlFor="isReprint">
          This card is a reprint (ID prefix doesn&apos;t match origin pack)
        </Label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
        <Button
          type="button"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2 block">
        {label}
        {required && (
          <span className="ml-1 text-error">*</span>
        )}
        {hint && (
          <span className="ml-1 font-normal text-content-tertiary">
            ({hint})
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}
