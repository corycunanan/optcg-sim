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
  collectBattlefieldDon,
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
  // OPT-792: mixed pools also offer cost-area DON!! by id.
  const battlefieldDon = useMemo(
    () => collectBattlefieldDon(me, opp),
    [me, opp]
  );
  const inPlacePrompt =
    prompt && isBattlefieldTargetPrompt(prompt, battlefieldCards, battlefieldDon)
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
            battlefieldCards,
            battlefieldDon
          )
        : null,
    [battlefieldCards, battlefieldDon, cardDb, inPlacePrompt, selectedIds]
  );

  const clear = useCallback(() => {
    if (!promptKey) return;
    setSelectionState({ promptKey, selectedIds: EMPTY_SELECTION });
  }, [promptKey]);

  // Escape clears the selection. A click on empty board no longer does
  // (OPT-776): a stray click would wipe a multi-card pick.
  useEffect(() => {
    if (!inPlacePrompt) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
      selectedInstanceIds: model.selectedIds,
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
