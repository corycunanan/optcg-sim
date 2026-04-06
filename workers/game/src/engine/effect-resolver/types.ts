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
