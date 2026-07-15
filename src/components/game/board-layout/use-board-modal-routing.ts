"use client";

import { useState } from "react";
import type {
  CardDb,
  GameAction,
  PlayerState,
  PromptOptions,
} from "@shared/game-types";
import { useInPlaceTargetSelection } from "./use-in-place-target-selection";

export type ZonePreview =
  | { type: "deck"; owner: "me" | "opp" }
  | { type: "trash"; owner: "me" | "opp" };

interface UseBoardModalRoutingOptions {
  activePrompt: PromptOptions | null;
  promptBlocked: boolean;
  me: PlayerState | null;
  opp: PlayerState | null;
  cardDb: CardDb;
  onAction: (action: GameAction) => void;
}

export function resolveBoardPrompt(
  activePrompt: PromptOptions | null,
  promptBlocked: boolean
): PromptOptions | null {
  return promptBlocked ? null : activePrompt;
}

/** Owns prompt visibility, zone-preview routing, and SELECT_TARGET's in-place
 * route. Prompt rendering remains in BoardModals at the composition root. */
export function useBoardModalRouting({
  activePrompt,
  promptBlocked,
  me,
  opp,
  cardDb,
  onAction,
}: UseBoardModalRoutingOptions) {
  const prompt = resolveBoardPrompt(activePrompt, promptBlocked);
  const promptType = prompt?.promptType ?? null;
  const [hiddenPromptType, setHiddenPromptType] = useState<string | null>(null);
  const [zonePreview, setZonePreview] = useState<ZonePreview | null>(null);
  const targetSelection = useInPlaceTargetSelection({
    prompt: prompt?.promptType === "SELECT_TARGET" ? prompt : null,
    me,
    opp,
    cardDb,
    onAction,
  });

  return {
    prompt,
    isPromptHidden: hiddenPromptType === promptType,
    hidePrompt: () => setHiddenPromptType(promptType),
    showPrompt: () => setHiddenPromptType(null),
    zonePreview,
    openZonePreview: setZonePreview,
    closeZonePreview: () => setZonePreview(null),
    targetSelection,
    targetSelectionActive: !!targetSelection.prompt,
  };
}
