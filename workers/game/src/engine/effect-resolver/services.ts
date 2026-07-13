import type { CardData, GameState, PendingEvent, PendingPromptState } from "../../types.js";
import type { Action, EffectBlock, EffectResult } from "../effect-types.js";
import type { ActionResult, EffectResolverResult } from "./types.js";

/**
 * Non-serialized resolver dependencies.
 *
 * `GameState.executionContext` owns deterministic data. This companion object
 * owns executable services and is passed explicitly across recursive resolver
 * boundaries so modules never depend on mutable callback registration.
 */
export interface EffectResolverServices {
  executeActionChain(
    state: GameState,
    actions: Action[],
    sourceCardInstanceId: string,
    controller: 0 | 1,
    cardDb: Map<string, CardData>,
    initialResultRefs?: Map<string, EffectResult>,
  ): { state: GameState; events: PendingEvent[]; pendingPrompt?: PendingPromptState };

  executeEffectAction(
    state: GameState,
    action: Action,
    sourceCardInstanceId: string,
    controller: 0 | 1,
    cardDb: Map<string, CardData>,
    resultRefs: Map<string, EffectResult>,
    preselectedTargets?: string[],
  ): ActionResult;

  resolveEffect(
    state: GameState,
    block: EffectBlock,
    sourceCardInstanceId: string,
    controller: 0 | 1,
    cardDb: Map<string, CardData>,
  ): EffectResolverResult;
}

export type ReplacementExecutionServices = Pick<EffectResolverServices, "executeActionChain">;
