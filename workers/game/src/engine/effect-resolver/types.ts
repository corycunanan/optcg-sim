/**
 * Shared types for the effect-resolver module.
 */

import type {
  GameState,
  PendingEvent,
  PendingPromptState,
} from "../../types.js";
import type {
  Action,
  EffectResult,
} from "../effect-types.js";
import type { CardData } from "../../types.js";

export interface EffectResolverResult {
  state: GameState;
  events: PendingEvent[];
  resolved: boolean;
  pendingPrompt?: PendingPromptState;
}

export interface ActionResult {
  state: GameState;
  events: PendingEvent[];
  succeeded: boolean;
  result?: EffectResult;
  pendingPrompt?: PendingPromptState;
}

export type ActionHandler = (
  state: GameState,
  action: Action,
  sourceCardInstanceId: string,
  controller: 0 | 1,
  cardDb: Map<string, CardData>,
  resultRefs: Map<string, EffectResult>,
  preselectedTargets?: string[],
) => ActionResult;

export interface CostPaymentResult {
  state: GameState;
  events: PendingEvent[];
  costResult: import("../effect-types.js").CostResult;
}

export interface CostSelectionResult {
  state: GameState;
  events: PendingEvent[];
  cannotPay?: boolean;
  pendingPrompt?: PendingPromptState;
  costResult?: import("../effect-types.js").CostResult;
}

/** Serialize CostResult into entries for EffectStackFrame.costResultRefs */
export function costResultToEntries(
  costResult: import("../effect-types.js").CostResult,
): [string, { targetInstanceIds: string[]; count: number }][] {
  return [
    ["__cost_don_rested", { targetInstanceIds: [], count: costResult.donRestedCount }],
    ["__cost_cards_trashed", { targetInstanceIds: costResult.cardsTrashedInstanceIds ?? [], count: costResult.cardsTrashedCount }],
    ["__cost_cards_returned", { targetInstanceIds: costResult.cardsReturnedInstanceIds ?? [], count: costResult.cardsReturnedCount }],
    ["__cost_cards_placed_to_deck", { targetInstanceIds: [], count: costResult.cardsPlacedToDeckCount }],
    ["__cost_characters_ko", { targetInstanceIds: costResult.charactersKoInstanceIds ?? [], count: costResult.charactersKoCount }],
  ];
}

/** Deserialize EffectStackFrame.costResultRefs back into a Map */
export function costResultRefsFromEntries(
  entries: [string, { targetInstanceIds: string[]; count: number }][],
): Map<string, EffectResult> | undefined {
  if (!entries || entries.length === 0) return undefined;
  const hasValues = entries.some(([, v]) => v.count > 0);
  if (!hasValues) return undefined;
  return new Map(entries);
}
