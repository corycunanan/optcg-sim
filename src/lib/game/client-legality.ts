import type { CardData, CardInstance } from "@shared/game-types";

export type PlayZone = "character" | "stage";
export type AttackTargetKind = "leader" | "character";

export interface CardAffordability {
  effectiveCost: number;
  missingDon: number;
  affordable: boolean;
  reason?: string;
}

/**
 * Client-side affordability is advisory: effects may still alter server-side
 * legality, so an unaffordable card remains draggable and the server remains
 * authoritative. This helper only drives the hand's dim state and explanation.
 */
export function getCardAffordability(
  card: CardData | undefined,
  instance: CardInstance,
  availableDon: number
): CardAffordability {
  const effectiveCost = instance.effectiveCost ?? card?.cost ?? 0;
  const missingDon = Math.max(0, effectiveCost - availableDon);

  return {
    effectiveCost,
    missingDon,
    affordable: missingDon === 0,
    reason: missingDon > 0 ? `Need ${missingDon} more DON` : undefined,
  };
}

/** Card type → destination is immutable, so these mismatches hard-disable. */
export function canPlayCardInZone(
  cardType: CardData["type"] | undefined,
  zone: PlayZone
): boolean {
  return zone === "character" ? cardType === "Character" : cardType === "Stage";
}

/** Leaders and RESTED characters are the only baseline attack targets. */
export function isAttackTargetEligible(
  kind: AttackTargetKind,
  state: "ACTIVE" | "RESTED"
): boolean {
  return kind === "leader" || state === "RESTED";
}
