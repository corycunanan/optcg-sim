"use client";

import React from "react";
import { Minus, Plus } from "lucide-react";
import type { GameAction, PlayerChoicePrompt } from "@shared/game-types";
import { GameButton } from "./game-button";
import { EffectPromptDialog, type EffectPromptDialogProps } from "./effect-prompt-dialog";

type Picker = NonNullable<PlayerChoicePrompt["donIdentityReturn"]>;
interface Props extends Omit<EffectPromptDialogProps, "onConfirm" | "children" | "status" | "confirmDisabled"> {
  picker: Picker;
  choices: PlayerChoicePrompt["choices"];
  onAction: (action: GameAction) => void;
}

/** Only a server-offered enabled choice can be submitted. Order in a choice ID
 * follows the server's canonical donor order, not the UI's grouping order. */
export function matchingDonIdentityChoice(choices: PlayerChoicePrompt["choices"], ids: readonly string[]): string | null {
  const selected = new Set(ids);
  if (ids.length === 0 || selected.size !== ids.length) return null;
  for (const choice of choices) {
    if (choice.disabled || !choice.id.startsWith("don-return-ids:")) continue;
    try {
      const offered: unknown = JSON.parse(choice.id.slice("don-return-ids:".length));
      if (Array.isArray(offered) && offered.length === selected.size && new Set(offered).size === offered.length &&
          offered.every(id => typeof id === "string" && selected.has(id))) return choice.id;
    } catch { /* Malformed/stale options are never submitted. */ }
  }
  return null;
}

export function DonIdentityReturnPicker({ picker, choices, onAction, ...dialog }: Props) {
  const [counts, setCounts] = React.useState<number[]>(() => picker.groups.map(() => 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const selected = picker.groups.flatMap((group, index) => group.donIds.slice(0, counts[index]));
  const choiceId = matchingDonIdentityChoice(choices, selected);
  const valid = total >= picker.countMin && total <= picker.countMax && choiceId !== null;
  const change = (index: number, delta: number) => setCounts(current => {
    const next = [...current];
    const nextCount = current[index] + delta;
    const nextTotal = current.reduce((sum, n) => sum + n, 0) + delta;
    if (nextCount < 0 || nextCount > picker.groups[index].donIds.length || nextTotal > picker.countMax) return current;
    next[index] = nextCount;
    return next;
  });
  const range = picker.countMin === picker.countMax ? String(picker.countMax) : `${picker.countMin}–${picker.countMax}`;
  return <EffectPromptDialog {...dialog}
    onConfirm={() => { if (valid) onAction({ type: "PLAYER_CHOICE", choiceId: choiceId! }); }}
    confirmDisabled={!valid}
    status={`${total} selected · choose ${range}`}
    className="sm:max-w-[400px]"
  >
    <div className="flex flex-col">
      {picker.groups.map((group, index) => <div key={JSON.stringify(group.donIds)} className="border-gb-border flex min-h-12 items-center justify-between gap-4 border-b py-2 last:border-b-0">
        <span className="text-gb-text min-w-0 flex-1 break-words text-sm">{group.label}</span>
        <div className="grid shrink-0 grid-cols-[2rem_2rem_2rem] items-center">
          <GameButton variant="secondary" size="sm" className="size-8 p-0" disabled={counts[index] === 0}
            aria-label={`Remove one from ${group.label}`} onClick={() => change(index, -1)}><Minus className="size-4" aria-hidden="true" /></GameButton>
          <span className="text-gb-text-bright text-center text-sm font-semibold" aria-live="polite">{counts[index]}</span>
          <GameButton variant="secondary" size="sm" className="size-8 p-0" disabled={counts[index] === group.donIds.length || total >= picker.countMax}
            aria-label={`Add one from ${group.label}`} onClick={() => change(index, 1)}><Plus className="size-4" aria-hidden="true" /></GameButton>
        </div>
      </div>)}
    </div>
  </EffectPromptDialog>;
}
