import type { CardDb, CardInstance, TurnState } from "@shared/game-types";

type ActivateMainBlock = {
  id: string;
  category: string;
  trigger?: { keyword?: string; once_per_turn?: boolean };
  flags?: { once_per_turn?: boolean };
};

export interface ActivateMainState {
  effectId: string;
  oncePerTurn: boolean;
  usedThisTurn: boolean;
}

export function getActivateMainState(
  card: CardInstance,
  cardDb: CardDb,
  oncePerTurnUsed?: TurnState["oncePerTurnUsed"],
): ActivateMainState | null {
  const schema = cardDb[card.cardId]?.effectSchema as {
    effects?: ActivateMainBlock[];
  } | null;
  const block = schema?.effects?.find(
    (effect) =>
      effect.category === "activate" &&
      effect.trigger?.keyword === "ACTIVATE_MAIN",
  );
  if (!block) return null;

  const oncePerTurn =
    block.flags?.once_per_turn === true ||
    block.trigger?.once_per_turn === true;
  return {
    effectId: block.id,
    oncePerTurn,
    usedThisTurn:
      oncePerTurn &&
      (oncePerTurnUsed?.[block.id]?.includes(card.instanceId) ?? false),
  };
}

export function canOpenActivateMainMenu({
  hasEffect,
  hasSelectionAction,
  inputSuppressed,
}: {
  hasEffect: boolean;
  hasSelectionAction: boolean;
  inputSuppressed: boolean;
}): boolean {
  return hasEffect && !hasSelectionAction && !inputSuppressed;
}
