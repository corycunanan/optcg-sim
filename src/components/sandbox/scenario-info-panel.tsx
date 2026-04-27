"use client";

// Side panel for the Animation Sandbox scenario player (OPT-291). Renders
// the scenario's static metadata (title, description, cards-used) plus the
// dynamic response hint surfaced by the input gate (OPT-290) — the two
// per-scenario authoring fields that the BoardLayout itself doesn't render.

import Image from "next/image";
import { Badge } from "@/components/ui";
import { SANDBOX_CARD_DB } from "@/lib/sandbox/sandbox-card-data";
import type { Scenario } from "@/lib/sandbox/scenarios";
import type { ScenarioInputHint } from "./scenario-input-gate";

export interface ScenarioInfoPanelProps {
  scenario: Scenario;
  hint: ScenarioInputHint | null;
}

export function ScenarioInfoPanel({ scenario, hint }: ScenarioInfoPanelProps) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
      <header className="space-y-2">
        <Badge variant={badgeVariant(scenario)}>{badgeLabel(scenario)}</Badge>
        <h2 className="font-display text-lg font-bold tracking-tight text-content-primary">
          {scenario.title}
        </h2>
        <p className="text-sm text-content-tertiary">{scenario.description}</p>
      </header>

      {hint && <HintBanner hint={hint} />}

      {scenario.cardsUsed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-content-tertiary">
            Cards used
          </h3>
          <ul className="space-y-2">
            {scenario.cardsUsed.map((id) => (
              <CardListItem key={id} cardId={id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Playground takes precedence over inputMode: playground scenarios always
// set inputMode: "interactive" for type safety, but the user-facing label
// should reflect the mode split (per OPT-307).
function badgeLabel(scenario: Scenario): string {
  if (scenario.mode === "playground") return "Playground";
  return scenario.inputMode === "interactive" ? "Interactive" : "Spectator";
}

function badgeVariant(scenario: Scenario): "default" | "outline" {
  if (scenario.mode === "playground") return "default";
  return scenario.inputMode === "interactive" ? "default" : "outline";
}

function HintBanner({ hint }: { hint: ScenarioInputHint }) {
  // Two visual treatments: blue (active prompt) vs amber (passive watching).
  // Matches the BoardLayout navbar badge tones from OPT-290.
  const styles =
    hint.kind === "respond-to-continue"
      ? "border-gb-accent-blue/40 bg-gb-accent-blue/10 text-gb-accent-blue"
      : "border-gb-accent-amber/40 bg-gb-accent-amber/10 text-gb-accent-amber";
  return (
    <div
      data-testid="scenario-info-hint"
      className={`rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-widest ${styles}`}
    >
      {hint.text}
    </div>
  );
}

function CardListItem({ cardId }: { cardId: string }) {
  const card = SANDBOX_CARD_DB[cardId];
  if (!card) {
    return (
      <li className="flex items-center gap-3 rounded-md border border-dashed border-border bg-surface-1 px-3 py-2">
        <div className="h-12 w-9 shrink-0 rounded bg-surface-2" />
        <div className="min-w-0 text-xs text-content-tertiary">
          <div className="truncate font-medium">{cardId}</div>
          <div className="truncate text-content-disabled">Not in sandbox bundle</div>
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-surface-1 px-3 py-2">
      <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-surface-2">
        {card.imageUrl && (
          <Image
            src={card.imageUrl}
            alt={card.name}
            fill
            sizes="36px"
            className="object-cover"
            unoptimized
          />
        )}
      </div>
      <div className="min-w-0 text-xs">
        <div className="truncate font-medium text-content-primary">{card.name}</div>
        <div className="truncate text-content-tertiary">
          {card.id} · {card.type}
        </div>
      </div>
    </li>
  );
}
