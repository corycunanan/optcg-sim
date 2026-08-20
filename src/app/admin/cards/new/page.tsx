"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiPost } from "@/lib/api-client";
import { CreateCardResponseSchema } from "@/lib/validators/cards";
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

interface CardFormState {
  id: string;
  name: string;
  type: string;
  color: string[];
  cost: string;
  power: string;
  counter: string;
  life: string;
  attribute: string;
  traits: string;
  rarity: string;
  effectText: string;
  triggerText: string;
  imageUrl: string;
  blockNumber: string;
  banStatus: string;
}

export default function NewCardPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<CardFormState>({
    id: "",
    name: "",
    type: "Character",
    color: [],
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
      const json = await apiPost(
        "/api/cards",
        {
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
        },
        CreateCardResponseSchema
      );

      router.push(`/admin/cards/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-8 font-display text-3xl text-content-primary">
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
          <Field label="Card ID" htmlFor="card-id" required>
            <Input
              id="card-id"
              type="text"
              value={form.id}
              onChange={(e) => update("id", e.target.value)}
              placeholder="OP15-096"
              className="font-mono"
            />
          </Field>
          <Field label="Name" htmlFor="name" required>
            <Input
              id="name"
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
            <Select
              value={form.banStatus}
              onValueChange={(v) => update("banStatus", v)}
            >
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

        {/* Preview */}
        {form.imageUrl && (
          <div className="border-border rounded-card w-48 overflow-hidden border">
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
        {required && <span className="text-error ml-1">*</span>}
        {hint && (
          <span className="text-content-tertiary ml-1 font-normal">
            ({hint})
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}
