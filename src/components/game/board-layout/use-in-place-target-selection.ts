"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CardDb,
  GameAction,
  PlayerState,
  SelectTargetPrompt,
} from "@shared/game-types";
import {
  buildTargetSelectionModel,
  collectBattlefieldCards,
  isBattlefieldTargetPrompt,
  selectTargetPromptKey,
} from "@/lib/game/target-selection";

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export function useInPlaceTargetSelection({
  prompt,
  me,
  opp,
  cardDb,
  onAction,
}: {
  prompt: SelectTargetPrompt | null;
  me: PlayerState | null;
  opp: PlayerState | null;
  cardDb: CardDb;
  onAction: (action: GameAction) => void;
}) {
  const battlefieldCards = useMemo(
    () => collectBattlefieldCards(me, opp),
    [me, opp]
  );
  const inPlacePrompt =
    prompt && isBattlefieldTargetPrompt(prompt, battlefieldCards)
      ? prompt
      : null;
  const promptKey = inPlacePrompt ? selectTargetPromptKey(inPlacePrompt) : null;
  const [selectionState, setSelectionState] = useState<{
    promptKey: string | null;
    selectedIds: ReadonlySet<string>;
  }>({ promptKey: null, selectedIds: EMPTY_SELECTION });
  const selectedIds =
    selectionState.promptKey === promptKey
      ? selectionState.selectedIds
      : EMPTY_SELECTION;

  const model = useMemo(
    () =>
      inPlacePrompt
        ? buildTargetSelectionModel(
            inPlacePrompt,
            selectedIds,
            cardDb,
            battlefieldCards
          )
        : null,
    [battlefieldCards, cardDb, inPlacePrompt, selectedIds]
  );

  const clear = useCallback(() => {
    if (!promptKey) return;
    setSelectionState({ promptKey, selectedIds: EMPTY_SELECTION });
  }, [promptKey]);

  useEffect(() => {
    if (!inPlacePrompt) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          "[data-target-selection], [data-target-selection-control]"
        )
      ) {
        return;
      }
      clear();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [clear, inPlacePrompt]);

  const toggle = useCallback(
    (instanceId: string) => {
      if (!promptKey || !model) return;
      const cardState = model.byId.get(instanceId);
      if (!cardState || cardState.disabledReason) return;

      const next = new Set(selectedIds);
      if (next.has(instanceId)) next.delete(instanceId);
      else next.add(instanceId);
      setSelectionState({ promptKey, selectedIds: next });
    },
    [model, promptKey, selectedIds]
  );

  const confirm = useCallback(() => {
    if (!model?.canConfirm) return;
    onAction({
      type: "SELECT_TARGET",
      selectedInstanceIds: model.selectedCards.map((card) => card.instanceId),
    });
  }, [model, onAction]);

  const skip = useCallback(() => {
    if (inPlacePrompt?.countMin !== 0) return;
    onAction({ type: "SELECT_TARGET", selectedInstanceIds: [] });
  }, [inPlacePrompt, onAction]);

  return {
    prompt: inPlacePrompt,
    model,
    toggle,
    confirm,
    skip,
  };
}
