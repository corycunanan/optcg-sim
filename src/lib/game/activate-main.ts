import type { CardDb, CardInstance, TurnState } from "@shared/game-types";
import { z } from "zod";

const ActivateMainSchema = z
  .object({
    effects: z
      .array(
        z.object({
          id: z.string(),
          category: z.string(),
          trigger: z
            .object({
              keyword: z.string().optional(),
              once_per_turn: z.boolean().optional(),
            })
            .optional(),
          flags: z.object({ once_per_turn: z.boolean().optional() }).optional(),
          costs: z
            .array(
              z.object({
                type: z.string().optional(),
                target: z.object({ type: z.string().optional() }).optional(),
              })
            )
            .optional(),
        })
      )
      .optional(),
  })
  .nullable();

export interface ActivateMainState {
  effectId: string;
  oncePerTurn: boolean;
  usedThisTurn: boolean;
  requiresActiveSelf: boolean;
}

export function getActivateMainState(
  card: CardInstance,
  cardDb: CardDb,
  oncePerTurnUsed?: TurnState["oncePerTurnUsed"]
): ActivateMainState | null {
  const parsedSchema = ActivateMainSchema.safeParse(
    cardDb[card.cardId]?.effectSchema ?? null
  );
  const schema = parsedSchema.success ? parsedSchema.data : null;
  const block = schema?.effects?.find(
    (effect) =>
      effect.category === "activate" &&
      effect.trigger?.keyword === "ACTIVATE_MAIN"
  );
  if (!block) return null;

  const oncePerTurn =
    block.flags?.once_per_turn === true ||
    block.trigger?.once_per_turn === true;
  return {
    effectId: block.id,
    oncePerTurn,
    requiresActiveSelf:
      block.costs?.some(
        (cost) =>
          cost.type === "REST_SELF" && cost.target?.type !== "YOUR_LEADER"
      ) ?? false,
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
