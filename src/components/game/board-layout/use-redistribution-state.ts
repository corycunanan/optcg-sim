"use client";

import { useCallback, useMemo, useState } from "react";
import type { PromptOptions } from "@shared/game-types";
import type { RedistributeTransfer } from "../redistribute-don-overlay";

type RedistributePrompt = Extract<
  PromptOptions,
  { promptType: "REDISTRIBUTE_DON" }
>;

export function getRedistributePromptKey(
  prompt: RedistributePrompt | null
): string | null {
  return prompt
    ? [
        prompt.validSourceCardIds.join(","),
        prompt.validTargetCardIds.join(","),
        prompt.maxTransfers,
      ].join("|")
    : null;
}

export function stageRedistributeTransfer(
  transfers: RedistributeTransfer[],
  prompt: RedistributePrompt | null,
  fromCardId: string,
  donId: string,
  toCardId: string
): RedistributeTransfer[] {
  if (!prompt || fromCardId === toCardId) return transfers;
  if (!prompt.validSourceCardIds.includes(fromCardId)) return transfers;
  if (!prompt.validTargetCardIds.includes(toCardId)) return transfers;
  if (transfers.length >= prompt.maxTransfers) return transfers;
  if (transfers.some((transfer) => transfer.donInstanceId === donId)) {
    return transfers;
  }
  return [
    ...transfers,
    {
      fromCardInstanceId: fromCardId,
      donInstanceId: donId,
      toCardInstanceId: toCardId,
    },
  ];
}

/** Owns the optimistic DON redistribution transaction and all projections
 * consumed by drag sources, field counters, and the confirmation overlay. */
export function useRedistributionState(promptOptions: PromptOptions | null) {
  const prompt =
    promptOptions?.promptType === "REDISTRIBUTE_DON" ? promptOptions : null;
  const promptKey = getRedistributePromptKey(prompt);
  const [transferState, setTransferState] = useState<{
    key: string | null;
    transfers: RedistributeTransfer[];
  }>({ key: null, transfers: [] });
  const transfers = useMemo(
    () => (transferState.key === promptKey ? transferState.transfers : []),
    [promptKey, transferState]
  );

  const updateTransfers = useCallback(
    (updater: (current: RedistributeTransfer[]) => RedistributeTransfer[]) => {
      setTransferState((previous) => ({
        key: promptKey,
        transfers: updater(
          previous.key === promptKey ? previous.transfers : []
        ),
      }));
    },
    [promptKey]
  );

  const handleDrop = useCallback(
    (fromCardId: string, donId: string, toCardId: string) => {
      updateTransfers((current) =>
        stageRedistributeTransfer(current, prompt, fromCardId, donId, toCardId)
      );
    },
    [prompt, updateTransfers]
  );

  const sourceIds = useMemo(
    () => (prompt ? new Set(prompt.validSourceCardIds) : undefined),
    [prompt]
  );
  const pendingDonIdsByCard = useMemo(() => {
    if (!prompt || transfers.length === 0) return undefined;
    const pending = new Map<string, Set<string>>();
    for (const transfer of transfers) {
      const donIds = pending.get(transfer.fromCardInstanceId) ?? new Set();
      donIds.add(transfer.donInstanceId);
      pending.set(transfer.fromCardInstanceId, donIds);
    }
    return pending;
  }, [prompt, transfers]);
  const donCountAdjustments = useMemo(() => {
    if (!prompt || transfers.length === 0) return undefined;
    const adjustments = new Map<string, number>();
    for (const transfer of transfers) {
      adjustments.set(
        transfer.fromCardInstanceId,
        (adjustments.get(transfer.fromCardInstanceId) ?? 0) - 1
      );
      adjustments.set(
        transfer.toCardInstanceId,
        (adjustments.get(transfer.toCardInstanceId) ?? 0) + 1
      );
    }
    return adjustments;
  }, [prompt, transfers]);

  return {
    transfers,
    sourceIds,
    pendingDonIdsByCard,
    donCountAdjustments,
    handleDrop,
    undo: () => updateTransfers((current) => current.slice(0, -1)),
  };
}
